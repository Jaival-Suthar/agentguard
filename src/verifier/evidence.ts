import type { ExecutionContract } from "../contract/types.js";
import type {
  VerificationFinding,
  VerificationObservation,
  VerificationVerdict,
} from "./types.js";

export interface VerifiedEvidence {
  type: "mcp_incident" | "sandbox_analysis" | "tool_outcome";
  source: "mcp" | "sandbox" | "runtime";
  actionEventId?: string;
  outcomeEventId?: string;
  incidentId?: string;
  fields: string[];
  details: Record<string, unknown>;
}

export interface EvidenceVerificationReport {
  verdict: VerificationVerdict;
  findings: VerificationFinding[];
  evidence: VerifiedEvidence[];
  observationsEvaluated: number;
  passed: number;
  warnings: number;
  failures: number;
}

export interface EvidenceVerificationOptions {
  targetIncidentId?: string;
  requireSandboxAnalysis?: boolean;
  /**
   * Action identity to treat as the trusted incident lookup.
   * Defaults to the production incident.lookup action.
   */
  mcpIncidentAction?: string;
}

const INCIDENT_FIELDS = [
  "incident_id",
  "service",
  "severity",
  "status",
  "suspected_component",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function highestVerdict(
  findings: readonly VerificationFinding[],
): VerificationVerdict {
  if (findings.some((finding) => finding.verdict === "FAIL")) return "FAIL";
  if (findings.some((finding) => finding.verdict === "WARN")) return "WARN";
  return "PASS";
}

function addFinding(
  findings: VerificationFinding[],
  finding: VerificationFinding,
): void {
  findings.push(finding);
}

function outcomeByActionEventId(
  observations: readonly VerificationObservation[],
): Map<string, VerificationObservation[]> {
  const outcomes = new Map<string, VerificationObservation[]>();

  for (const observation of observations) {
    if (
      observation.kind !== "outcome" ||
      typeof observation.actionEventId !== "string"
    ) {
      continue;
    }

    const existing = outcomes.get(observation.actionEventId) ?? [];
    existing.push(observation);
    outcomes.set(observation.actionEventId, existing);
  }

  return outcomes;
}

function parsedContent(
  observation: VerificationObservation,
): Record<string, unknown> | undefined {
  const value = observation.data?.parsedContent;
  return isRecord(value) ? value : undefined;
}

function successfulSandboxResult(
  observation: VerificationObservation,
): Record<string, unknown> | undefined {
  const content = parsedContent(observation);
  const response = content?.response;

  if (!isRecord(response) || response.exitCode !== 0) return undefined;

  if (typeof response.result !== "string") return undefined;

  try {
    const parsed: unknown = JSON.parse(response.result);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function incidentFromMcpOutcome(
  observation: VerificationObservation,
): Record<string, unknown> | undefined {
  const content = parsedContent(observation);
  if (!content || content.found !== true) return undefined;
  return content;
}

function missingIncidentFields(value: Record<string, unknown>): string[] {
  return INCIDENT_FIELDS.filter(
    (field) => stringValue(value[field]) === undefined,
  );
}

function requiredIncidentFields(value: Record<string, unknown>): string[] {
  return INCIDENT_FIELDS.filter(
    (field) => stringValue(value[field]) !== undefined,
  );
}

function requestedIncidentId(action: VerificationObservation): string | undefined {
  return stringValue(action.data?.requestedIncidentId);
}

function actionHasSuccessfulOutcome(
  action: VerificationObservation,
  outcomes: Map<string, VerificationObservation[]>,
): boolean {
  if (!action.eventId) return false;

  return (outcomes.get(action.eventId) ?? []).some((outcome) => {
    if (outcome.outcomeVerified !== true) return false;
    if (action.action === "sandbox:execute") {
      return successfulSandboxResult(outcome) !== undefined;
    }
    return true;
  });
}

function laterSuccessfulRetryExists(
  actionIndex: number,
  action: VerificationObservation,
  actions: readonly VerificationObservation[],
  outcomes: Map<string, VerificationObservation[]>,
): boolean {
  if (!action.action) return false;

  for (let index = actionIndex + 1; index < actions.length; index += 1) {
    const candidate = actions[index];
    if (candidate?.action !== action.action) continue;
    if (actionHasSuccessfulOutcome(candidate, outcomes)) return true;
  }

  return false;
}

export function verifyExecutionEvidence(
  contract: ExecutionContract,
  observations: readonly VerificationObservation[],
  options: EvidenceVerificationOptions = {},
): EvidenceVerificationReport {
  const findings: VerificationFinding[] = [];
  const evidence: VerifiedEvidence[] = [];
  const outcomes = outcomeByActionEventId(observations);
  const targetIncidentId = options.targetIncidentId?.trim();
  const mcpIncidentAction =
    options.mcpIncidentAction?.trim() ||
    "mcp:incident.lookup:lookup_incident";
  const requireSandboxAnalysis =
    options.requireSandboxAnalysis ??
    contract.requirements.requiredEvidence.includes("root_cause");

  const actions = observations.filter(
    (observation) => observation.kind === "action",
  );

  if (actions.length === 0) {
    addFinding(findings, {
      code: "OUTCOME_MISSING",
      verdict: "FAIL",
      message: "No executable action was observed in the trajectory.",
    });
  }

  /*
   * Each attempt is evaluated independently, but a failed attempt is not
   * fatal when a later attempt of the same action succeeds. Retry limits are
   * enforced separately by the execution-contract verifier.
   */
  for (const [actionIndex, action] of actions.entries()) {
    if (!action.action) {
      addFinding(findings, {
        code: "MALFORMED_OBSERVATION",
        verdict: "FAIL",
        message: "Action evidence cannot be verified without an action name.",
        ...(action.eventId ? { eventId: action.eventId } : {}),
      });
      continue;
    }

    const actionEventId = action.eventId;
    if (!actionEventId) {
      addFinding(findings, {
        code: "MALFORMED_OBSERVATION",
        verdict: "FAIL",
        message:
          `Action "${action.action}" has no event identity, so its outcome cannot be independently correlated.`,
        action: action.action,
      });
      continue;
    }

    const correlatedOutcomes = outcomes.get(actionEventId) ?? [];
    const verifiedOutcome = correlatedOutcomes.find((outcome) => {
      if (outcome.outcomeVerified !== true) return false;
      if (action.action === "sandbox:execute") {
        return successfulSandboxResult(outcome) !== undefined;
      }
      return true;
    });

    if (!verifiedOutcome) {
      if (laterSuccessfulRetryExists(actionIndex, action, actions, outcomes)) {
        continue;
      }

      const hasVerifiedRuntimeOutcome = correlatedOutcomes.some(
        (outcome) => outcome.outcomeVerified === true,
      );

      addFinding(findings, {
        code: "OUTCOME_UNVERIFIED",
        verdict: "FAIL",
        message:
          action.action === "sandbox:execute" && hasVerifiedRuntimeOutcome
            ? `Action "${action.action}" has a correlated tool response, but it did not prove a successful deterministic sandbox execution (for example, exitCode was non-zero or the analysis result was missing).`
            : `Action "${action.action}" has a correlated outcome, but none is independently parseable as verified runtime evidence.`,
        action: action.action,
        eventId: actionEventId,
      });
      continue;
    }

    addFinding(findings, {
      code: "OUTCOME_VERIFIED",
      verdict: "PASS",
      message: `Action "${action.action}" has a correlated verified runtime outcome.`,
      action: action.action,
      eventId: verifiedOutcome.eventId ?? actionEventId,
    });

    evidence.push({
      type: "tool_outcome",
      source: "runtime",
      actionEventId,
      ...(verifiedOutcome.eventId
        ? { outcomeEventId: verifiedOutcome.eventId }
        : {}),
      fields: ["correlation", "parseable_outcome"],
      details: {
        action: action.action,
        ...(verifiedOutcome.data?.toolCallId
          ? { toolCallId: verifiedOutcome.data.toolCallId }
          : {}),
        ...(verifiedOutcome.data?.toolResultError === true
          ? { toolResultError: true }
          : {}),
      },
    });
  }

  const mcpActions = actions.filter(
    (observation) => observation.action === mcpIncidentAction,
  );

  let mcpIncident: Record<string, unknown> | undefined;
  let mcpAction: VerificationObservation | undefined;
  let mcpOutcome: VerificationObservation | undefined;

  for (const candidateAction of mcpActions) {
    if (!candidateAction.eventId) continue;

    const requestedId = requestedIncidentId(candidateAction);
    if (targetIncidentId && requestedId !== targetIncidentId) continue;

    const candidateOutcome = (outcomes.get(candidateAction.eventId) ?? []).find(
      (outcome) => outcome.outcomeVerified === true,
    );
    if (!candidateOutcome) continue;

    const candidateIncident = incidentFromMcpOutcome(candidateOutcome);
    if (!candidateIncident) continue;

    const missing = missingIncidentFields(candidateIncident);
    if (missing.length > 0) continue;

    const observedIncidentId = stringValue(candidateIncident.incident_id);
    if (targetIncidentId && observedIncidentId !== targetIncidentId) continue;

    mcpAction = candidateAction;
    mcpOutcome = candidateOutcome;
    mcpIncident = candidateIncident;
    break;
  }

  if (!mcpAction?.eventId || !mcpIncident || !mcpOutcome) {
    addFinding(findings, {
      code: "REQUIRED_EVIDENCE_MISSING",
      verdict: "FAIL",
      message:
        targetIncidentId
          ? "Trusted incident lookup evidence is missing a verified lookup action that explicitly requested the target incident and returned complete matching evidence."
          : "Trusted incident lookup evidence is missing from the trajectory.",
    });
  } else {
    const observedIncidentId = stringValue(mcpIncident.incident_id);
    const missing = missingIncidentFields(mcpIncident);

    if (missing.length > 0) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          `Incident lookup evidence is incomplete; missing fields: ${missing.join(", ")}.`,
        ...(mcpAction.action ? { action: mcpAction.action } : {}),
        eventId: mcpOutcome.eventId ?? mcpAction.eventId,
      });
    } else if (targetIncidentId && observedIncidentId !== targetIncidentId) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          `Incident lookup returned "${observedIncidentId ?? "unknown"}" but the requested incident is "${targetIncidentId}".`,
        ...(mcpAction.action ? { action: mcpAction.action } : {}),
        eventId: mcpOutcome.eventId ?? mcpAction.eventId,
      });
    } else {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_PRESENT",
        verdict: "PASS",
        message:
          "Trusted incident lookup evidence is complete and independently verified.",
        ...(mcpAction.action ? { action: mcpAction.action } : {}),
        eventId: mcpOutcome.eventId ?? mcpAction.eventId,
      });

      evidence.push({
        type: "mcp_incident",
        source: "mcp",
        actionEventId: mcpAction.eventId,
        ...(mcpOutcome.eventId ? { outcomeEventId: mcpOutcome.eventId } : {}),
        ...(observedIncidentId ? { incidentId: observedIncidentId } : {}),
        fields: requiredIncidentFields(mcpIncident),
        details: {
          found: true,
          requestedIncidentId: requestedIncidentId(mcpAction),
          service: mcpIncident.service,
          severity: mcpIncident.severity,
          status: mcpIncident.status,
          suspected_component: mcpIncident.suspected_component,
        },
      });
    }
  }

  const sandboxActions = actions.filter(
    (observation) => observation.action === "sandbox:execute",
  );
  let sandboxEvidenceVerified = false;

  if (requireSandboxAnalysis) {
    for (const sandboxAction of sandboxActions) {
      if (!sandboxAction.eventId) continue;

      const sandboxOutcome = (outcomes.get(sandboxAction.eventId) ?? []).find(
        (outcome) =>
          outcome.outcomeVerified === true &&
          successfulSandboxResult(outcome) !== undefined,
      );
      if (!sandboxOutcome) continue;

      const sandboxResult = successfulSandboxResult(sandboxOutcome);
      if (!sandboxResult || !mcpIncident || !mcpAction) continue;

      const sandboxIncidentRecord = isRecord(sandboxResult.incident)
        ? sandboxResult.incident
        : undefined;
      const candidate = stringValue(sandboxResult.root_cause_candidate);
      const suspectedComponent = stringValue(mcpIncident.suspected_component);
      const sandboxIncidentId = stringValue(sandboxIncidentRecord?.incident_id);
      const missing = sandboxIncidentRecord
        ? missingIncidentFields(sandboxIncidentRecord)
        : ["incident"];

      if (missing.length > 0) continue;
      if (!sandboxIncidentId || sandboxIncidentId !== stringValue(mcpIncident.incident_id)) continue;
      if (targetIncidentId && sandboxIncidentId !== targetIncidentId) continue;
      if (!candidate || !suspectedComponent || candidate !== suspectedComponent) continue;

      sandboxEvidenceVerified = true;

      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_PRESENT",
        verdict: "PASS",
        message:
          "Deterministic sandbox evidence matches the trusted MCP incident evidence and establishes the root-cause candidate without relying on model narrative.",
        action: "sandbox:execute",
        eventId: sandboxOutcome.eventId ?? sandboxAction.eventId,
      });

      evidence.push({
        type: "sandbox_analysis",
        source: "sandbox",
        actionEventId: sandboxAction.eventId,
        ...(sandboxOutcome.eventId ? { outcomeEventId: sandboxOutcome.eventId } : {}),
        incidentId: sandboxIncidentId,
        fields: [
          "successful_execution",
          "incident_identity_match",
          "root_cause_candidate_match",
        ],
        details: {
          exitCode: 0,
          root_cause_candidate: candidate,
          suspected_component: suspectedComponent,
        },
      });
      break;
    }

    if (!sandboxEvidenceVerified) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          "Sandbox execution did not produce a verified successful analysis result.",
        action: "sandbox:execute",
      });
    }
  }

  if (contract.requirements.requiredEvidence.includes("root_cause")) {
    if (sandboxEvidenceVerified) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_PRESENT",
        verdict: "PASS",
        message:
          "Required root_cause evidence is independently established by the sandbox analysis.",
      });
    } else {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message: "Required root_cause evidence was not independently established.",
      });
    }
  }

  if (contract.requirements.requiredEvidence.includes("verification")) {
    const hasMcpEvidence = evidence.some((item) => item.type === "mcp_incident");
    const hasSandboxEvidence = evidence.some(
      (item) => item.type === "sandbox_analysis",
    );

    if (hasMcpEvidence && (!requireSandboxAnalysis || hasSandboxEvidence)) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_PRESENT",
        verdict: "PASS",
        message:
          "Required verification evidence is established by correlated runtime outcomes and cross-source evidence.",
      });
    } else {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          "Required verification evidence is incomplete; trusted MCP and required deterministic evidence must both be present.",
      });
    }
  }

  const passed = findings.filter((finding) => finding.verdict === "PASS").length;
  const warnings = findings.filter((finding) => finding.verdict === "WARN").length;
  const failures = findings.filter((finding) => finding.verdict === "FAIL").length;

  return {
    verdict: highestVerdict(findings),
    findings,
    evidence,
    observationsEvaluated: observations.length,
    passed,
    warnings,
    failures,
  };
}
