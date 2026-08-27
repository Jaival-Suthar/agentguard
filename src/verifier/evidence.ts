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
}

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
  if (findings.some((finding) => finding.verdict === "FAIL")) {
    return "FAIL";
  }

  if (findings.some((finding) => finding.verdict === "WARN")) {
    return "WARN";
  }

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

  if (!isRecord(response) || response.exitCode !== 0) {
    return undefined;
  }

  const result = response.result;
  if (typeof result !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(result);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function incidentFromMcpOutcome(
  observation: VerificationObservation,
): Record<string, unknown> | undefined {
  const content = parsedContent(observation);

  if (!content || content.found !== true) {
    return undefined;
  }

  return content;
}

function requiredIncidentFields(
  value: Record<string, unknown>,
): string[] {
  return [
    "incident_id",
    "service",
    "severity",
    "status",
    "suspected_component",
  ].filter((field) => stringValue(value[field]) !== undefined);
}

function missingIncidentFields(
  value: Record<string, unknown>,
): string[] {
  return [
    "incident_id",
    "service",
    "severity",
    "status",
    "suspected_component",
  ].filter((field) => stringValue(value[field]) === undefined);
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

  for (const action of actions) {
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

    if (correlatedOutcomes.length === 0) {
      addFinding(findings, {
        code: "OUTCOME_MISSING",
        verdict: "FAIL",
        message:
          `Action "${action.action}" has no correlated tool outcome.`,
        action: action.action,
        eventId: actionEventId,
      });
      continue;
    }

    const verifiedOutcome = correlatedOutcomes.find(
      (outcome) => {
        if (outcome.outcomeVerified !== true) {
          return false;
        }

        // Sandbox execution is only successful evidence when the
        // tool response itself proves a successful deterministic run.
        // A parseable error response (for example exitCode !== 0) is
        // verified as an observed outcome, but it is not successful
        // sandbox-analysis evidence.
        if (action.action === "sandbox:execute") {
          return successfulSandboxResult(outcome) !== undefined;
        }

        return true;
      },
    );

    if (!verifiedOutcome) {
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
    } else {
      addFinding(findings, {
        code: "OUTCOME_VERIFIED",
        verdict: "PASS",
        message:
          `Action "${action.action}" has a correlated verified runtime outcome.`,
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
  }

  const mcpAction = actions.find(
    (observation) =>
      observation.action === "mcp:incident.lookup:lookup_incident",
  );

  let mcpIncident: Record<string, unknown> | undefined;

  if (!mcpAction?.eventId) {
    addFinding(findings, {
      code: "REQUIRED_EVIDENCE_MISSING",
      verdict: "FAIL",
      message:
        "Trusted incident lookup evidence is missing from the trajectory.",
    });
  } else {
    const candidate = (outcomes.get(mcpAction.eventId) ?? []).find(
      (outcome) => outcome.outcomeVerified === true,
    );

    mcpIncident = candidate
      ? incidentFromMcpOutcome(candidate)
      : undefined;

    if (!mcpIncident) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          "The trusted incident lookup did not produce a verified FOUND result.",
        ...(mcpAction.action ? { action: mcpAction.action } : {}),
        eventId: candidate?.eventId ?? mcpAction.eventId,
      });
    } else {
      const missing = missingIncidentFields(mcpIncident);

      if (missing.length > 0) {
        addFinding(findings, {
          code: "REQUIRED_EVIDENCE_MISSING",
          verdict: "FAIL",
          message:
            `Incident lookup evidence is incomplete; missing fields: ${missing.join(", ")}.`,
          ...(mcpAction.action ? { action: mcpAction.action } : {}),
          eventId: candidate?.eventId ?? mcpAction.eventId,
        });
      } else {
        const observedIncidentId = stringValue(mcpIncident.incident_id);

        if (targetIncidentId && observedIncidentId !== targetIncidentId) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              `Incident lookup returned "${observedIncidentId ?? "unknown"}" but the requested incident is "${targetIncidentId}".`,
            ...(mcpAction.action ? { action: mcpAction.action } : {}),
            eventId: candidate?.eventId ?? mcpAction.eventId,
          });
        } else {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_PRESENT",
            verdict: "PASS",
            message:
              "Trusted incident lookup evidence is complete and independently verified.",
            ...(mcpAction.action ? { action: mcpAction.action } : {}),
            eventId: candidate?.eventId ?? mcpAction.eventId,
          });

          evidence.push({
            type: "mcp_incident",
            source: "mcp",
            actionEventId: mcpAction.eventId,
            ...(candidate?.eventId
              ? { outcomeEventId: candidate.eventId }
              : {}),
            ...(observedIncidentId
              ? { incidentId: observedIncidentId }
              : {}),
            fields: requiredIncidentFields(mcpIncident),
            details: {
              found: true,
              service: mcpIncident.service,
              severity: mcpIncident.severity,
              status: mcpIncident.status,
              suspected_component: mcpIncident.suspected_component,
            },
          });
        }
      }
    }
  }

  const sandboxAction = actions.find(
    (observation) => observation.action === "sandbox:execute",
  );

  let sandboxEvidenceVerified = false;

  if (requireSandboxAnalysis) {
    if (!sandboxAction?.eventId) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_MISSING",
        verdict: "FAIL",
        message:
          "Deterministic sandbox analysis is required for root_cause evidence, but no sandbox execution was observed.",
      });
    } else {
      const sandboxOutcome = (outcomes.get(sandboxAction.eventId) ?? []).find(
        (outcome) => outcome.outcomeVerified === true,
      );
      const sandboxResult = sandboxOutcome
        ? successfulSandboxResult(sandboxOutcome)
        : undefined;

      if (!sandboxResult) {
        addFinding(findings, {
          code: "REQUIRED_EVIDENCE_MISSING",
          verdict: "FAIL",
          message:
            "Sandbox execution did not produce a verified successful analysis result.",
          ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
          eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
        });
      } else {
        const sandboxIncident = sandboxResult.incident;
        const sandboxIncidentRecord = isRecord(sandboxIncident)
          ? sandboxIncident
          : undefined;
        const candidate = stringValue(sandboxResult.root_cause_candidate);
        const suspectedComponent = stringValue(
          mcpIncident?.suspected_component,
        );
        const sandboxIncidentId = stringValue(
          sandboxIncidentRecord?.incident_id,
        );

        const missing = sandboxIncidentRecord
          ? missingIncidentFields(sandboxIncidentRecord)
          : ["incident"];

        if (missing.length > 0) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              `Sandbox analysis evidence is incomplete; missing fields: ${missing.join(", ")}.`,
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else if (!mcpIncident) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              "Sandbox analysis cannot establish verification without independently verified MCP incident evidence.",
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else if (
          sandboxIncidentId !== stringValue(mcpIncident.incident_id) ||
          (targetIncidentId && sandboxIncidentId !== targetIncidentId)
        ) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              `Sandbox analysis incident identity does not match the trusted MCP evidence (sandbox=${sandboxIncidentId ?? "unknown"}, MCP=${stringValue(mcpIncident.incident_id) ?? "unknown"}).`,
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else if (!candidate) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              "Sandbox analysis completed but did not provide a root_cause_candidate.",
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else if (!suspectedComponent) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              "Trusted MCP evidence does not contain suspected_component, so the sandbox root-cause candidate cannot be independently validated.",
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else if (candidate !== suspectedComponent) {
          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_MISSING",
            verdict: "FAIL",
            message:
              `Sandbox root_cause_candidate "${candidate}" does not match the trusted MCP suspected_component "${suspectedComponent}".`,
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });
        } else {
          sandboxEvidenceVerified = true;

          addFinding(findings, {
            code: "REQUIRED_EVIDENCE_PRESENT",
            verdict: "PASS",
            message:
              "Deterministic sandbox evidence matches the trusted MCP incident evidence and establishes the root-cause candidate without relying on model narrative.",
            ...(sandboxAction.action ? { action: sandboxAction.action } : {}),
            eventId: sandboxOutcome?.eventId ?? sandboxAction.eventId,
          });

          evidence.push({
            type: "sandbox_analysis",
            source: "sandbox",
            actionEventId: sandboxAction.eventId,
            ...(sandboxOutcome?.eventId
              ? { outcomeEventId: sandboxOutcome.eventId }
              : {}),
            ...(sandboxIncidentId ? { incidentId: sandboxIncidentId } : {}),
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
        }
      }
    }
  }

  if (contract.requirements.requiredEvidence.includes("root_cause")) {
    if (sandboxEvidenceVerified) {
      addFinding(findings, {
        code: "REQUIRED_EVIDENCE_PRESENT",
        verdict: "PASS",
        message: "Required root_cause evidence is independently established by the sandbox analysis.",
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
    const hasMcpEvidence = evidence.some(
      (item) => item.type === "mcp_incident",
    );
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
