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
):
  | { eventId: string }
  | Record<string, never> {
  return observation.eventId
    ? { eventId: observation.eventId }
    : {};
}

function approvedActionEventIds(
  observations: readonly VerificationObservation[],
): Set<string> {
  return new Set(
    observations
      .filter(
        (
          observation,
        ): observation is VerificationObservation & {
          actionEventId: string;
        } =>
          observation.kind === "approval" &&
          observation.approved === true &&
          typeof observation.actionEventId === "string",
      )
      .map((observation) => observation.actionEventId),
  );
}

/**
 * Returns true when the declared ordering relationship is violated.
 *
 * Retry semantics:
 * - The predecessor must be observed at least once.
 * - The dependent action must be observed at least once.
 * - At least one predecessor occurrence must precede the first
 *   dependent-action occurrence.
 *
 * Therefore:
 *
 *   lookup -> sandbox -> sandbox     VALID
 *   lookup -> sandbox                 VALID
 *   sandbox -> lookup                 INVALID
 *   sandbox -> sandbox -> lookup      INVALID
 *
 * A later retry cannot retroactively satisfy an ordering requirement
 * that was already violated by the first dependent attempt.
 */
function hasOrderingViolation(
  observations: readonly VerificationObservation[],
  predecessor: string,
  dependent: string,
): boolean {
  let predecessorObserved = false;
  let dependentObserved = false;

  for (const observation of observations) {
    if (observation.kind !== "action") {
      continue;
    }

    if (observation.action === predecessor) {
      predecessorObserved = true;
      continue;
    }

    if (observation.action === dependent) {
      dependentObserved = true;

      // The first dependent attempt happened before the required
      // predecessor was observed.
      if (!predecessorObserved) {
        return true;
      }
    }
  }

  // Missing endpoints are handled by requiredActions independently.
  if (!predecessorObserved || !dependentObserved) {
    return false;
  }

  return false;
}

export function verifyObservations(
  contract: ExecutionContract,
  observations: readonly VerificationObservation[],
): VerificationReport {
  const findings: VerificationFinding[] = [];

  const allowed = actionSet(contract.actions.allow);

  const approvalRequired = actionSet(
    contract.actions.approvalRequired,
  );

  const denied = actionSet(contract.actions.deny);

  const approvedActionEvents =
    approvedActionEventIds(observations);

  let outcomeObserved = false;

  // Track action names independently from their individual policy findings.
  // This lets trajectory requirements be enforced after the full ordered
  // observation stream has been inspected.
  const observedActions = new Set<string>();

  for (const observation of observations) {
    if (observation.kind === "action") {
      if (!observation.action) {
        findings.push({
          code: "MALFORMED_OBSERVATION",
          verdict: "WARN",
          message:
            "Action observation is missing an action name.",
          ...eventIdField(observation),
        });

        continue;
      }

      const action = observation.action;
      observedActions.add(action);

      if (denied.has(action)) {
        findings.push({
          code: "ACTION_DENIED",
          verdict: "FAIL",
          message:
            `Action "${action}" is explicitly denied by the execution contract.`,
          action,
          ...eventIdField(observation),
        });

        continue;
      }

      if (approvalRequired.has(action)) {
        const approved =
          observation.approved === true ||
          (!!observation.eventId &&
            approvedActionEvents.has(observation.eventId));

        if (approved) {
          findings.push({
            code: "APPROVAL_GRANTED",
            verdict: "PASS",
            message:
              `Approval-required action "${action}" was observed with approval.`,
            action,
            ...eventIdField(observation),
          });
        } else {
          findings.push({
            code: "APPROVAL_MISSING",
            verdict: "FAIL",
            message:
              `Action "${action}" requires approval, but approval was not observed.`,
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
          message:
            `Action "${action}" is allowed by the execution contract.`,
          action,
          ...eventIdField(observation),
        });

        continue;
      }

      findings.push({
        code: "UNKNOWN_ACTION",
        verdict: "WARN",
        message:
          `Action "${action}" is not explicitly allowed, approval-gated, or denied by the execution contract.`,
        action,
        ...eventIdField(observation),
      });

      continue;
    }

    if (observation.kind === "retry") {
      if (
        typeof observation.retryCount !== "number" ||
        !Number.isInteger(observation.retryCount) ||
        observation.retryCount < 0
      ) {
        findings.push({
          code: "MALFORMED_OBSERVATION",
          verdict: "WARN",
          message:
            "Retry observation must contain a non-negative integer retryCount.",
          ...eventIdField(observation),
        });

        continue;
      }

      if (
        observation.retryCount >
        contract.limits.maxRetries
      ) {
        findings.push({
          code: "RETRY_LIMIT_EXCEEDED",
          verdict: "FAIL",
          message:
            `Observed retry count ${observation.retryCount} exceeds the contract limit of ${contract.limits.maxRetries}.`,
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "RETRY_WITHIN_LIMIT",
          verdict: "PASS",
          message:
            `Observed retry count ${observation.retryCount} is within the contract limit of ${contract.limits.maxRetries}.`,
          ...eventIdField(observation),
        });
      }

      continue;
    }

    if (observation.kind === "evidence") {
      const observedEvidence = new Set(
        observation.evidence ?? [],
      );

      const missing =
        contract.requirements.requiredEvidence.filter(
          (item) => !observedEvidence.has(item),
        );

      if (missing.length > 0) {
        findings.push({
          code: "REQUIRED_EVIDENCE_MISSING",
          verdict: "FAIL",
          message:
            `Required evidence is missing: ${missing.join(", ")}.`,
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "REQUIRED_EVIDENCE_PRESENT",
          verdict: "PASS",
          message:
            "All required evidence was observed.",
          ...eventIdField(observation),
        });
      }

      continue;
    }

    if (observation.kind === "outcome") {
      outcomeObserved = true;

      if (
        contract.requirements.verificationRequired &&
        observation.outcomeVerified !== true
      ) {
        findings.push({
          code: "OUTCOME_UNVERIFIED",
          verdict: "FAIL",
          message:
            "The contract requires outcome verification, but the observed tool outcome was not verified.",
          ...eventIdField(observation),
        });
      } else {
        findings.push({
          code: "OUTCOME_VERIFIED",
          verdict: "PASS",
          message:
            "Outcome verification requirement was satisfied.",
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
        verdict:
          observation.approved === true
            ? "PASS"
            : "FAIL",
        message:
          observation.approved === true
            ? "Approval was granted."
            : "Approval was denied or not granted.",
        ...eventIdField(observation),
      });

      continue;
    }

    const unknownKind = (
      observation as {
        kind: unknown;
      }
    ).kind;

    findings.push({
      code: "MALFORMED_OBSERVATION",
      verdict: "WARN",
      message:
        `Unsupported observation kind "${String(unknownKind)}".`,
      ...eventIdField(observation),
    });
  }

  // Every declared required action must occur at least once.
  for (const requiredAction of contract.requirements.requiredActions) {
    if (!observedActions.has(requiredAction)) {
      findings.push({
        code: "REQUIRED_ACTION_MISSING",
        verdict: "FAIL",
        message:
          `Required action "${requiredAction}" was not observed in the trajectory.`,
        action: requiredAction,
      });
    } else {
      findings.push({
        code: "REQUIRED_ACTION_PRESENT",
        verdict: "PASS",
        message:
          `Required action "${requiredAction}" was observed in the trajectory.`,
        action: requiredAction,
      });
    }
  }

  // Enforce every declared ordering relationship against the actual
  // chronological action stream.
  //
  // Repeated dependent actions are valid retries only when the predecessor
  // was already observed before the first dependent attempt.
  for (const relationship of contract.ordering.before) {
    const violation = hasOrderingViolation(
      observations,
      relationship.action,
      relationship.before,
    );

    if (violation) {
      findings.push({
        code: "ORDERING_VIOLATION",
        verdict: "FAIL",
        message:
          `Action "${relationship.action}" must occur before "${relationship.before}", but the dependent action was observed before its required predecessor.`,
        action: relationship.action,
      });
      continue;
    }

    const observedPredecessor = observedActions.has(
      relationship.action,
    );

    const observedDependent = observedActions.has(
      relationship.before,
    );

    if (observedPredecessor && observedDependent) {
      findings.push({
        code: "ORDERING_SATISFIED",
        verdict: "PASS",
        message:
          `Action "${relationship.action}" occurred before "${relationship.before}" as required by the execution contract.`,
        action: relationship.action,
      });
    }
  }

  if (
    contract.requirements.verificationRequired &&
    !outcomeObserved
  ) {
    findings.push({
      code: "OUTCOME_MISSING",
      verdict: "FAIL",
      message:
        "The contract requires outcome verification, but no tool outcome was observed in the trajectory.",
    });
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
