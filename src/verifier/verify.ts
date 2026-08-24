import type { ExecutionContract } from "../contract/types.js";
import type {
  VerificationFinding,
  VerificationObservation,
  VerificationReport,
  VerificationVerdict,
} from "./types.js";

function highestVerdict(
  findings: readonly VerificationFinding[],
): VerificationVerdict {
  if (findings.some((finding) => finding.verdict === "FAIL")) {
    return "FAIL";
  }

  if (findings.some((finding) => finding.verdict === "WARN")) {
    return "WARN";
  }

  return "PASS";
}

function actionSet(values: readonly string[]): Set<string> {
  return new Set(values);
}

function eventIdField(
  observation: VerificationObservation,
): { eventId: string } | Record<string, never> {
  return observation.eventId
    ? { eventId: observation.eventId }
    : {};
}

export function verifyObservations(
  contract: ExecutionContract,
  observations: readonly VerificationObservation[],
): VerificationReport {
  const findings: VerificationFinding[] = [];
  const allowed = actionSet(contract.actions.allow);
  const approvalRequired = actionSet(contract.actions.approvalRequired);
  const denied = actionSet(contract.actions.deny);

  for (const observation of observations) {
    if (observation.kind === "action") {
      if (!observation.action) {
        findings.push({
          code: "MALFORMED_OBSERVATION",
          verdict: "WARN",
          message: "Action observation is missing an action name.",
          ...eventIdField(observation),
        });
        continue;
      }

      const action = observation.action;

      if (denied.has(action)) {
        findings.push({
          code: "ACTION_DENIED",
          verdict: "FAIL",
          message: `Action "${action}" is explicitly denied by the execution contract.`,
          action,
          ...eventIdField(observation),
        });
        continue;
      }

      if (approvalRequired.has(action)) {
        if (observation.approved === true) {
          findings.push({
            code: "APPROVAL_GRANTED",
            verdict: "PASS",
            message: `Approval-required action "${action}" was observed with approval.`,
            action,
            ...eventIdField(observation),
          });
        } else {
          findings.push({
            code: "APPROVAL_MISSING",
            verdict: "FAIL",
            message: `Action "${action}" requires approval, but approval was not observed.`,
            action,
            ...eventIdField(observation),
          });
        }
        continue;
      }

      if (allowed.has(action)) {
        findings.push({
          code: "ACTION_ALLOWED",
          verdict: "PASS",
          message: `Action "${action}" is allowed by the execution contract.`,
          action,
          ...eventIdField(observation),
        });
        continue;
      }

      findings.push({
        code: "UNKNOWN_ACTION",
        verdict: "WARN",
        message: `Action "${action}" is not explicitly allowed, approval-gated, or denied by the execution contract.`,
        action,
        ...eventIdField(observation),
      });
      continue;
    }

    if (observation.kind === "retry") {
      if (
        typeof observation.retryCount !== "number" ||
        !Number.isInteger(observation.retryCount)
      ) {
        findings.push({
          code: "MALFORMED_OBSERVATION",
          verdict: "WARN",
          message: "Retry observation is missing an integer retryCount.",
          ...eventIdField(observation),
        });
        continue;
      }

      if (observation.retryCount > contract.limits.maxRetries) {
        findings.push({
          code: "RETRY_LIMIT_EXCEEDED",
          verdict: "FAIL",
          message: `Observed retry count ${observation.retryCount} exceeds the contract limit of ${contract.limits.maxRetries}.`,
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "ACTION_ALLOWED",
          verdict: "PASS",
          message: `Observed retry count ${observation.retryCount} is within the contract limit of ${contract.limits.maxRetries}.`,
          ...eventIdField(observation),
        });
      }
      continue;
    }

    if (observation.kind === "evidence") {
      const observedEvidence = new Set(observation.evidence ?? []);
      const missing = contract.requirements.requiredEvidence.filter(
        (item) => !observedEvidence.has(item),
      );

      if (missing.length > 0) {
        findings.push({
          code: "REQUIRED_EVIDENCE_MISSING",
          verdict: "FAIL",
          message: `Required evidence is missing: ${missing.join(", ")}.`,
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "ACTION_ALLOWED",
          verdict: "PASS",
          message: "All required evidence was observed.",
          ...eventIdField(observation),
        });
      }
      continue;
    }

    if (observation.kind === "outcome") {
      if (
        contract.requirements.verificationRequired &&
        observation.outcomeVerified !== true
      ) {
        findings.push({
          code: "OUTCOME_UNVERIFIED",
          verdict: "FAIL",
          message:
            "The contract requires outcome verification, but no verified outcome was observed.",
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "ACTION_ALLOWED",
          verdict: "PASS",
          message: "Outcome verification requirement was satisfied.",
          ...eventIdField(observation),
        });
      }
      continue;
    }

    if (observation.kind === "approval") {
      findings.push({
        code:
          observation.approved === true
            ? "APPROVAL_GRANTED"
            : "APPROVAL_MISSING",
        verdict: observation.approved === true ? "PASS" : "FAIL",
        message:
          observation.approved === true
            ? "Approval was granted."
            : "Approval was denied or not granted.",
        ...eventIdField(observation),
      });
    }
  }

  const passed = findings.filter(
    (finding) => finding.verdict === "PASS",
  ).length;

  const warnings = findings.filter(
    (finding) => finding.verdict === "WARN",
  ).length;

  const failures = findings.filter(
    (finding) => finding.verdict === "FAIL",
  ).length;

  return {
    verdict: highestVerdict(findings),
    findings,
    observationsEvaluated: observations.length,
    passed,
    warnings,
    failures,
  };
}