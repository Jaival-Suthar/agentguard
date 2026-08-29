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
  const approved = new Set<string>();

  for (const observation of observations) {
    if (
      observation.kind === "approval" &&
      observation.approved === true &&
      typeof observation.actionEventId === "string"
    ) {
      approved.add(observation.actionEventId);
    }
  }

  return approved;
}

/**
 * Returns true when the declared ordering relationship is violated.
 *
 * The first dependent action must not occur before the predecessor.
 * Later occurrences of the dependent action are valid retries.
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

      if (!predecessorObserved) {
        return true;
      }
    }
  }

  if (!predecessorObserved || !dependentObserved) {
    return false;
  }

  return false;
}

/**
 * Marks failed outcomes as recovered only when the observation stream proves:
 *
 *   failed outcome
 *        ↓
 *   valid retry observation
 *        ↓
 *   later action attempt for the same action
 *        ↓
 *   verified outcome correlated to that later action attempt
 *
 * A verified outcome that occurred before the failure cannot recover it.
 * A later verified outcome without a retry cannot recover it.
 */
function recoveredOutcomeEventIds(
  observations: readonly VerificationObservation[],
  maxRetries: number,
): Set<string> {
  const actionNames = new Map<string, string>();
  const actionIndexes = new Map<string, number>();

  for (let index = 0; index < observations.length; index += 1) {
    const observation = observations[index];

    if (!observation) {
      continue;
    }

    if (
      observation.kind === "action" &&
      typeof observation.eventId === "string" &&
      typeof observation.action === "string"
    ) {
      actionNames.set(observation.eventId, observation.action);
      actionIndexes.set(observation.eventId, index);
    }
  }

  const recovered = new Set<string>();

  for (
    let failedIndex = 0;
    failedIndex < observations.length;
    failedIndex += 1
  ) {
    const failedOutcome = observations[failedIndex];

    if (!failedOutcome) {
      continue;
    }

    if (
      failedOutcome.kind !== "outcome" ||
      failedOutcome.outcomeVerified === true ||
      typeof failedOutcome.eventId !== "string" ||
      typeof failedOutcome.actionEventId !== "string"
    ) {
      continue;
    }

    const failedAction = actionNames.get(
      failedOutcome.actionEventId,
    );

    const failedActionIndex = actionIndexes.get(
      failedOutcome.actionEventId,
    );

    if (
      failedAction === undefined ||
      failedActionIndex === undefined
    ) {
      continue;
    }

    /*
     * First prove that a valid retry actually occurred after
     * the failed outcome.
     */
    let retryIndex = -1;

    for (
      let index = failedIndex + 1;
      index < observations.length;
      index += 1
    ) {
      const retry = observations[index];

      if (!retry) {
        continue;
      }

      if (
        retry.kind === "retry" &&
        typeof retry.retryCount === "number" &&
        Number.isInteger(retry.retryCount) &&
        retry.retryCount > 0 &&
        retry.retryCount <= maxRetries
      ) {
        retryIndex = index;
        break;
      }
    }

    if (retryIndex === -1) {
      continue;
    }

    /*
     * Now find a later action attempt for the same action.
     * It must happen after the retry, not merely somewhere later
     * in the original trajectory.
     */
    let retryActionEventId: string | undefined;

    for (
      let index = retryIndex + 1;
      index < observations.length;
      index += 1
    ) {
      const actionObservation = observations[index];

      if (
        !actionObservation ||
        actionObservation.kind !== "action" ||
        typeof actionObservation.eventId !== "string" ||
        typeof actionObservation.action !== "string"
      ) {
        continue;
      }

      if (actionObservation.action === failedAction) {
        retryActionEventId = actionObservation.eventId;
        break;
      }
    }

    if (!retryActionEventId) {
      continue;
    }

    /*
     * Finally require a verified outcome correlated specifically
     * to that later action attempt.
     */
    for (
      let index = retryIndex + 1;
      index < observations.length;
      index += 1
    ) {
      const verifiedOutcome = observations[index];

      if (
        !verifiedOutcome ||
        verifiedOutcome.kind !== "outcome" ||
        verifiedOutcome.outcomeVerified !== true ||
        verifiedOutcome.actionEventId !== retryActionEventId
      ) {
        continue;
      }

      recovered.add(failedOutcome.eventId);
      break;
    }
  }

  return recovered;
}

export function verifyObservations(
  contract: ExecutionContract,
  observations: readonly VerificationObservation[],
): VerificationReport {
  const findings: VerificationFinding[] = [];

  const recoveredOutcomeIds = recoveredOutcomeEventIds(
    observations,
    contract.limits.maxRetries,
  );

  const allowed = actionSet(contract.actions.allow);

  const approvalRequired = actionSet(
    contract.actions.approvalRequired,
  );

  const denied = actionSet(contract.actions.deny);

  const approvedActionEvents =
    approvedActionEventIds(observations);

  let outcomeObserved = false;

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
        if (
          typeof observation.eventId === "string" &&
          recoveredOutcomeIds.has(observation.eventId)
        ) {
          findings.push({
            code: "OUTCOME_RECOVERED",
            verdict: "PASS",
            message:
              "The failed outcome was recovered by a later verified outcome for the same action attempt.",
            ...eventIdField(observation),
          });
        } else {
          findings.push({
            code: "OUTCOME_UNVERIFIED",
            verdict: "FAIL",
            message:
              "The contract requires outcome verification, but the observed tool outcome was not verified.",
            ...eventIdField(observation),
          });
        }
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
