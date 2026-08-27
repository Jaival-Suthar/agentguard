import type {
  IncidentFacts,
  IncidentLookupResult,
  InvestigationReport,
  InvestigationStatus,
} from "./types.js";
import type { ExecutionEvent } from "../events/types.js";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function parseIncidentFacts(
  value: Record<string, unknown>,
): IncidentFacts {
  const incident: IncidentFacts = {
    incidentId:
      stringValue(value.incident_id) ??
      stringValue(value.incidentId) ??
      "unknown",
  };

  const service = stringValue(value.service);
  const severity = stringValue(value.severity);
  const status = stringValue(value.status);
  const suspectedComponent =
    stringValue(value.suspected_component) ??
    stringValue(value.suspectedComponent);

  if (service) {
    incident.service = service;
  }

  if (severity) {
    incident.severity = severity;
  }

  if (status) {
    incident.status = status;
  }

  if (suspectedComponent) {
    incident.suspectedComponent = suspectedComponent;
  }

  return incident;
}

function extractIncidentId(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;

  const input =
    record.input &&
    typeof record.input === "object" &&
    !Array.isArray(record.input)
      ? (record.input as Record<string, unknown>)
      : undefined;

  return (
    stringValue(input?.incident_id) ??
    stringValue(record.incident_id) ??
    stringValue(record.incidentId)
  );
}

function toolCallEntries(
  event: ExecutionEvent,
): Record<string, unknown>[] {
  const data = event.data as Record<string, unknown>;
  const entries = data.toolCalls;

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.filter(
    (entry): entry is Record<string, unknown> =>
      entry !== null &&
      typeof entry === "object" &&
      !Array.isArray(entry),
  );
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0
    ? value
    : undefined;
}

function parseFound(value: unknown): boolean | undefined {
  return value === true
    ? true
    : value === false
      ? false
      : undefined;
}

export interface CorrelatedIncidentLookupAttempt {
  toolCallId: string;
  functionName?: string;
  mcpServer?: string;
  toolName?: string;
  incidentId?: string;
  found?: boolean;
  incidentValue?: Record<string, unknown>;
}

export interface CorrelatedIncidentLookupResolution {
  incidentLookupResult: IncidentLookupResult;
  incidentValue?: Record<string, unknown>;
  lookupAttempts: CorrelatedIncidentLookupAttempt[];
}

export interface IncidentLookupResolutionOptions {
  mcpServerName: string;
  toolName: string;
}

const DEFAULT_LOOKUP_OPTIONS: IncidentLookupResolutionOptions = {
  mcpServerName: "incident.lookup",
  toolName: "lookup_incident",
};

export function resolveIncidentLookupFromEvents(
  events: ExecutionEvent[],
  targetIncidentId: string,
  options: IncidentLookupResolutionOptions = DEFAULT_LOOKUP_OPTIONS,
): CorrelatedIncidentLookupResolution {
  const lookupCalls = new Map<
    string,
    {
      incidentId?: string;
      functionName?: string;
      toolName?: string;
      mcpServer?: string;
    }
  >();

  const lookupResults = new Map<
    string,
    Record<string, unknown>
  >();

  for (const event of events) {
    if (event.type === "TOOL_CALL") {
      for (const entry of toolCallEntries(event)) {
        const toolCallId = stringOrUndefined(
          entry.toolCallId,
        );

        if (!toolCallId) {
          continue;
        }

        const current = lookupCalls.get(toolCallId) ?? {};

        const parsedArguments =
          entry.parsedArguments &&
          typeof entry.parsedArguments === "object" &&
          !Array.isArray(entry.parsedArguments)
            ? (entry.parsedArguments as Record<string, unknown>)
            : undefined;

        const toolName = stringOrUndefined(entry.toolName);
        const mcpServer = stringOrUndefined(entry.mcpServer);
        const functionName = stringOrUndefined(
          entry.functionName,
        );

        const incidentId =
          extractIncidentId(parsedArguments) ??
          extractIncidentId(entry.arguments);

        if (toolName) {
          current.toolName = toolName;
        }

        if (functionName) {
          current.functionName = functionName;
        }

        if (mcpServer) {
          current.mcpServer = mcpServer;
        }

        if (incidentId) {
          current.incidentId = incidentId;
        }

        lookupCalls.set(toolCallId, current);
      }
    }

    if (event.type === "TOOL_RESULT") {
      const data = event.data as Record<string, unknown>;

      const toolCallId = stringOrUndefined(
        data.toolCallId,
      );

      const parsedContent =
        data.parsedContent &&
        typeof data.parsedContent === "object" &&
        !Array.isArray(data.parsedContent)
          ? (data.parsedContent as Record<string, unknown>)
          : undefined;

      if (toolCallId && parsedContent) {
        lookupResults.set(toolCallId, parsedContent);
      }
    }
  }

  const lookupAttempts: CorrelatedIncidentLookupAttempt[] = [];

  for (const [toolCallId, call] of lookupCalls.entries()) {
    /*
     * Trust boundary:
     *
     * A correlated tool call is eligible to establish incident
     * lookup evidence only when all expected identities match.
     *
     * The MCP server name is configurable so the same investigator
     * can be exercised against an isolated Chaos MCP server.
     *
     * functionName remains fixed to TrueForge's MCP provider
     * function so that merely matching a server/tool name is not
     * sufficient to establish evidence.
     */
    const isIncidentLookup =
      call.mcpServer === options.mcpServerName &&
      call.toolName === options.toolName &&
      call.functionName === "call_tool";

    if (!isIncidentLookup) {
      continue;
    }

    const incidentValue = lookupResults.get(toolCallId);

    if (!incidentValue) {
      continue;
    }

    const found = parseFound(incidentValue.found);

    if (found === undefined) {
      continue;
    }

    lookupAttempts.push({
      toolCallId,
      ...(call.functionName
        ? { functionName: call.functionName }
        : {}),
      ...(call.mcpServer
        ? { mcpServer: call.mcpServer }
        : {}),
      ...(call.toolName
        ? { toolName: call.toolName }
        : {}),
      ...(call.incidentId
        ? { incidentId: call.incidentId }
        : {}),
      found,
      incidentValue,
    });
  }

  const targetAttempts = lookupAttempts.filter(
    (attempt) =>
      attempt.incidentId === targetIncidentId,
  );

  const successfulAttempt = targetAttempts.find(
    (attempt) => attempt.found,
  );

  if (successfulAttempt) {
    return {
      incidentLookupResult: "FOUND",
      ...(successfulAttempt.incidentValue
        ? {
            incidentValue:
              successfulAttempt.incidentValue,
          }
        : {}),
      lookupAttempts,
    };
  }

  if (
    targetAttempts.some(
      (attempt) => attempt.found === false,
    )
  ) {
    return {
      incidentLookupResult: "NOT_FOUND",
      lookupAttempts,
    };
  }

  return {
    incidentLookupResult: "UNKNOWN",
    lookupAttempts,
  };
}

export function buildInvestigationReport(
  input: {
    targetIncidentId: string;
    status: InvestigationStatus;
    incidentLookupResult: IncidentLookupResult;
    rawResponse: string;
    incidentValue?: Record<string, unknown>;
  },
): InvestigationReport {
  const incident =
    input.incidentLookupResult === "FOUND" &&
    input.incidentValue
      ? parseIncidentFacts(input.incidentValue)
      : undefined;

  const knownFacts: string[] = [];

  if (incident) {
    knownFacts.push(
      `Incident ID: ${incident.incidentId}`,
    );

    if (incident.service) {
      knownFacts.push(
        `Service: ${incident.service}`,
      );
    }

    if (incident.severity) {
      knownFacts.push(
        `Severity: ${incident.severity}`,
      );
    }

    if (incident.status) {
      knownFacts.push(
        `Status: ${incident.status}`,
      );
    }

    if (incident.suspectedComponent) {
      knownFacts.push(
        `Suspected component: ${incident.suspectedComponent}`,
      );
    }
  }

  const unknowns: string[] = [
    "Root cause has not been independently established.",
    "Remediation has not been executed or verified.",
  ];

  const findings = [
    `Investigation status: ${input.status}`,
    `Incident lookup result: ${input.incidentLookupResult}`,
    `Evidence retrieved: ${
      input.incidentLookupResult === "FOUND"
        ? "YES"
        : "NO"
    }`,
  ];

  if (incident) {
    findings.push(
      `Incident ${incident.incidentId} was retrieved from the connected incident lookup tool.`,
      ...knownFacts,
    );
  }

  return {
    targetIncidentId: input.targetIncidentId,
    status: input.status,
    incidentLookupResult:
      input.incidentLookupResult,
    evidenceRetrieved:
      input.incidentLookupResult === "FOUND",
    ...(incident ? { incident } : {}),
    findings,
    knownFacts,
    unknowns,
    nextActions: [
      "Gather additional evidence before claiming root cause.",
      "Verify the proposed remediation against observed evidence.",
    ],
    rawResponse: input.rawResponse,
  };
}