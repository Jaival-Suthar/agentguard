import type {
  AssuranceArtifact,
  ExecutionEvent,
  RunDetail,
  TimelineEntry,
} from "./types";

const TIMELINE_EVENT_LIMIT = 200;

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function firstText(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.length > 0) {
        return entry;
      }

      if (entry && typeof entry === "object" && "text" in entry) {
        const text = stringValue((entry as { text?: unknown }).text);
        if (text) {
          return text;
        }
      }
    }
  }

  return undefined;
}

function describeParsedContent(
  value: unknown,
): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  return Object.entries(value as Record<string, unknown>).map(
    ([key, item]) => {
      if (Array.isArray(item)) {
        return `${key}: ${item.join(", ")}`;
      }

      if (typeof item === "object" && item !== null) {
        return `${key}: ${JSON.stringify(item)}`;
      }

      return `${key}: ${String(item)}`;
    },
  );
}

function isSemanticEvent(event: ExecutionEvent): boolean {
  return event.type !== "MODEL_OUTPUT_DELTA";
}

function previewValue(value: unknown, maxLength = 120): string | undefined {
  if (typeof value === "string") {
    return value.length > maxLength
      ? `${value.slice(0, maxLength)}…`
      : value;
  }

  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value);
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(value);
    return serialized.length > maxLength
      ? `${serialized.slice(0, maxLength)}…`
      : serialized;
  } catch {
    return undefined;
  }
}

function summarizeToolCalls(toolCalls: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(toolCalls)) {
    return undefined;
  }

  const summary = toolCalls.flatMap((call) => {
    if (!call || typeof call !== "object") {
      return [];
    }

    const record = call as Record<string, unknown>;
    return [
      {
        ...(stringValue(record.toolCallId) ? { toolCallId: stringValue(record.toolCallId) } : {}),
        ...(stringValue(record.toolName) ? { toolName: stringValue(record.toolName) } : {}),
        ...(stringValue(record.functionName) ? { functionName: stringValue(record.functionName) } : {}),
        ...(stringValue(record.mcpServer) ? { mcpServer: stringValue(record.mcpServer) } : {}),
        ...(previewValue(record.arguments) ? { arguments: previewValue(record.arguments) } : {}),
      },
    ];
  });

  return summary.length > 0 ? summary : undefined;
}

function summarizeParsedContent(parsedContent: unknown): Record<string, unknown> | undefined {
  if (!parsedContent || typeof parsedContent !== "object" || Array.isArray(parsedContent)) {
    return undefined;
  }

  const record = parsedContent as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  if ("found" in record) {
    summary.found = record.found === true;
  }

  for (const key of ["incident_id", "service", "severity", "status", "suspected_component"] as const) {
    const value = stringValue(record[key]);
    if (value) {
      summary[key] = value;
    }
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function statusForEvent(
  event: ExecutionEvent,
): TimelineEntry["state"] {
  if (event.type === "TOOL_RESULT") {
    const parsedContent =
      event.data.parsedContent as Record<string, unknown> | undefined;

    if (parsedContent?.found === true) {
      return "PASS";
    }

    if (parsedContent?.found === false) {
      return "WARN";
    }
  }

  if (event.type === "EXECUTION_COMPLETED") {
    if (event.status === "done" || event.status === "completed" || event.status === "success") {
      return "PASS";
    }

    if (event.status === "failed" || event.status === "error" || event.status === "cancelled") {
      return "FAIL";
    }

    return "LIVE";
  }

  return "LIVE";
}

function eventTitle(
  event: ExecutionEvent,
): string {
  if (event.type === "EXECUTION_STARTED") {
    return "Intent";
  }

  if (event.type === "MODEL_OUTPUT_STARTED" || event.type === "MODEL_OUTPUT_DELTA") {
    return "Model";
  }

  if (event.type === "SANDBOX_CREATED") {
    return "Sandbox";
  }

  if (event.type === "TOOL_CALL") {
    return "MCP Lookup";
  }

  if (event.type === "TOOL_RESULT") {
    const parsedContent =
      event.data.parsedContent as Record<string, unknown> | undefined;

    if (parsedContent?.found === true) {
      return "Evidence";
    }

    if (parsedContent?.found === false) {
      return "Lookup result";
    }
  }

  if (event.type === "EXECUTION_COMPLETED") {
    return "Assurance";
  }

  return "Event";
}

function eventSummary(
  event: ExecutionEvent,
): string {
  if (event.type === "EXECUTION_STARTED") {
    const input = event.data.input;
    if (Array.isArray(input) && input.length > 0) {
      return "Execution started.";
    }
    return "Execution started.";
  }

  if (event.type === "MODEL_OUTPUT_STARTED") {
    return "Model began generating a response.";
  }

  if (event.type === "MODEL_OUTPUT_DELTA") {
    return firstText(event.data.content) ?? "Model streamed output.";
  }

  if (event.type === "SANDBOX_CREATED") {
    const sandboxId = stringValue(event.data.sandboxId);
    return sandboxId
      ? `Sandbox created: ${sandboxId}`
      : "Sandbox created.";
  }

  if (event.type === "TOOL_CALL") {
    const toolCalls = event.data.toolCalls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      const first = toolCalls[0] as Record<string, unknown>;
      const toolName = stringValue(first.toolName) ?? stringValue(first.functionName);
      const mcpServer = stringValue(first.mcpServer);
      return toolName
        ? `Calling ${toolName}${mcpServer ? ` on ${mcpServer}` : ""}.`
        : "Calling MCP tool.";
    }
    return "Calling MCP tool.";
  }

  if (event.type === "TOOL_RESULT") {
    const parsedContent =
      event.data.parsedContent as Record<string, unknown> | undefined;

    if (parsedContent?.found === true) {
      const incidentId = stringValue(parsedContent.incident_id);
      return incidentId
        ? `Incident ${incidentId} was found.`
        : "Incident lookup succeeded.";
    }

    if (parsedContent?.found === false) {
      const incidentId = stringValue(parsedContent.incident_id);
      return incidentId
        ? `Lookup tool did not find ${incidentId}.`
        : "Lookup tool returned not found.";
    }

    return firstText(event.data.content) ?? "Tool returned a result.";
  }

  if (event.type === "EXECUTION_COMPLETED") {
    if (event.status === "done" || event.status === "completed" || event.status === "success") {
      return "Execution completed.";
    }

    if (event.status === "failed" || event.status === "error" || event.status === "cancelled") {
      return `Execution completed with status ${event.status}.`;
    }

    return `Execution completed with status ${event.status ?? "unknown"}.`;
  }

  return "Observed runtime event.";
}

function eventDetails(event: ExecutionEvent): string[] {
  const details = [
    `Timestamp: ${event.timestamp}`,
    event.correlationId ? `Correlation: ${event.correlationId}` : undefined,
    event.status ? `Status: ${event.status}` : undefined,
  ].filter((value): value is string => typeof value === "string");

  if (event.type === "TOOL_CALL") {
    const toolCalls = event.data.toolCalls;
    if (Array.isArray(toolCalls)) {
      for (const call of toolCalls) {
        if (!call || typeof call !== "object") {
          continue;
        }

        const record = call as Record<string, unknown>;
        const summary = [
          stringValue(record.toolName) ? `tool: ${record.toolName}` : undefined,
          stringValue(record.mcpServer) ? `server: ${record.mcpServer}` : undefined,
          stringValue(record.toolCallId) ? `call: ${record.toolCallId}` : undefined,
          previewValue(record.arguments, 180) ? `args: ${previewValue(record.arguments, 180)}` : undefined,
        ]
          .filter((value): value is string => typeof value === "string");

        if (summary.length > 0) {
          details.push(summary.join(" · "));
        }
      }
    }
  }

  if (event.type === "TOOL_RESULT") {
    details.push(...describeParsedContent(event.data.parsedContent));
  }

  return details;
}

function eventPayload(
  event: ExecutionEvent,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    type: event.type,
    timestamp: event.timestamp,
    receivedAt: event.receivedAt,
    correlationId: event.correlationId,
    status: event.status,
  };

  if (event.type === "EXECUTION_STARTED") {
    const input = event.data.input;
    if (Array.isArray(input)) {
      payload.inputCount = input.length;
      const firstPrompt = firstText(input);
      if (firstPrompt) {
        payload.promptPreview = previewValue(firstPrompt, 160);
      }
    }
  }

  if (event.type === "MODEL_OUTPUT_STARTED") {
    const model = stringValue(event.data.model);
    if (model) {
      payload.model = model;
    }
  }

  if (event.type === "SANDBOX_CREATED") {
    const sandboxId = stringValue(event.data.sandboxId);
    if (sandboxId) {
      payload.sandboxId = sandboxId;
    }
  }

  if (event.type === "TOOL_CALL") {
    const toolCalls = summarizeToolCalls(event.data.toolCalls);
    if (toolCalls) {
      payload.toolCalls = toolCalls;
    }
  }

  if (event.type === "TOOL_RESULT") {
    const parsedContent = summarizeParsedContent(event.data.parsedContent);
    if (parsedContent) {
      payload.parsedContent = parsedContent;
    }

    const toolCallId = stringValue(event.data.toolCallId);
    if (toolCallId) {
      payload.toolCallId = toolCallId;
    }
  }

  if (event.type === "EXECUTION_COMPLETED") {
    if (event.status) {
      payload.finalStatus = event.status;
    }
  }

  return payload;
}

export function buildTimelineEntries(
  detail: RunDetail,
  limit = TIMELINE_EVENT_LIMIT,
): TimelineEntry[] {
  const entries: TimelineEntry[] = detail.events
    .filter(isSemanticEvent)
    .slice(-limit)
    .map((event) => ({
    id: event.id,
    kind: "event",
    stage: event.type,
    state: statusForEvent(event),
    title: eventTitle(event),
    summary: eventSummary(event),
    timestamp: event.timestamp,
    details: eventDetails(event),
    payload: eventPayload(event),
  }));

  if (detail.artifact) {
    const artifact = detail.artifact;
    entries.push(
      {
        id: `${artifact.runId}:policy`,
        kind: "artifact",
        stage: "Policy",
        state: artifact.policy.status === "FAIL" ? "FAIL" : artifact.policy.status === "WARN" ? "WARN" : "PASS",
        title: artifact.policy.status,
        summary: artifact.policy.summary,
        timestamp: artifact.generatedAt,
        details: artifact.policy.details ?? [],
        payload: {
          section: "policy",
          ...artifact.policy,
        },
      },
      {
        id: `${artifact.runId}:execution`,
        kind: "artifact",
        stage: "Execution",
        state: artifact.execution.status === "FAIL" ? "FAIL" : artifact.execution.status === "WARN" ? "WARN" : "PASS",
        title: artifact.execution.status,
        summary: artifact.execution.summary,
        timestamp: artifact.generatedAt,
        details: artifact.execution.details ?? [],
        payload: {
          section: "execution",
          ...artifact.execution,
        },
      },
      {
        id: `${artifact.runId}:recovery`,
        kind: "artifact",
        stage: "Recovery",
        state: artifact.recovery.status === "EXHAUSTED" ? "FAIL" : "PASS",
        title: artifact.recovery.status,
        summary: `${artifact.recovery.attempts} attempt(s) · ${artifact.recovery.retries} retry(ies)`,
        timestamp: artifact.generatedAt,
        details: [
          `Max retries: ${artifact.recovery.maxRetries}`,
        ],
        payload: {
          section: "recovery",
          ...artifact.recovery,
        },
      },
      {
        id: `${artifact.runId}:evidence`,
        kind: "artifact",
        stage: "Evidence",
        state: artifact.evidence.status === "FAIL" ? "FAIL" : artifact.evidence.status === "WARN" ? "WARN" : "PASS",
        title: artifact.evidence.status,
        summary: artifact.evidence.summary,
        timestamp: artifact.generatedAt,
        details: artifact.evidence.details ?? [],
        payload: {
          section: "evidence",
          ...artifact.evidence,
        },
      },
      {
        id: `${artifact.runId}:contract`,
        kind: "artifact",
        stage: "Contract",
        state: artifact.contractVerification.status === "FAIL" ? "FAIL" : artifact.contractVerification.status === "WARN" ? "WARN" : "PASS",
        title: artifact.contractVerification.status,
        summary: artifact.contractVerification.summary,
        timestamp: artifact.generatedAt,
        details: artifact.contractVerification.details ?? [],
        payload: {
          section: "contract",
          ...artifact.contractVerification,
        },
      },
      {
        id: `${artifact.runId}:assurance`,
        kind: "artifact",
        stage: "Assurance",
        state: artifact.verdict === "FAIL" ? "FAIL" : artifact.verdict === "WARN" ? "WARN" : "PASS",
        title: artifact.verdict,
        summary: artifact.summary,
        timestamp: artifact.generatedAt,
        details: artifact.failureReasons,
        payload: {
          section: "assurance",
          verdict: artifact.verdict,
          status: artifact.status,
          summary: artifact.summary,
          failureReasons: artifact.failureReasons,
        },
      },
    );
  }

  return entries;
}

export function semanticTimelineEvents(
  events: readonly ExecutionEvent[],
  limit = TIMELINE_EVENT_LIMIT,
): ExecutionEvent[] {
  return events.filter(isSemanticEvent).slice(-limit);
}

export function buildArtifactOnlyDetail(
  artifact: AssuranceArtifact,
): RunDetail {
  return {
    summary: {
      runId: artifact.runId,
      startedAt: artifact.generatedAt,
      baseUrl: "artifact",
      model: "n/a",
      prompt: "",
      eventCount: 0,
      eventTypes: [],
      ...(artifact.incidentId ? { incidentId: artifact.incidentId } : {}),
      ...(artifact.status ? { status: artifact.status } : {}),
      ...(artifact.verdict ? { verdict: artifact.verdict } : {}),
      artifactAvailable: true,
      connectionState:
        artifact.verdict === "PASS"
          ? "VERIFIED"
          : artifact.verdict === "WARN"
            ? "WARN"
            : "FAILED",
    },
    artifact,
    events: [],
  };
}

export function connectionLabel(
  detail: RunDetail | null,
  sourceState: "idle" | "connecting" | "connected" | "reconnecting" | "disconnected",
): { label: string; tone: "success" | "warning" | "danger" | "info" } {
  if (!detail) {
    return sourceState === "connecting"
      ? { label: "CONNECTING", tone: "info" }
      : { label: "IDLE", tone: "warning" };
  }

  if (sourceState === "reconnecting") {
    return { label: "RECONNECTING", tone: "warning" };
  }

  if (detail.artifact) {
    if (detail.artifact.verdict === "PASS") {
      return { label: "VERIFIED", tone: "success" };
    }

    if (detail.artifact.verdict === "WARN") {
      return { label: "WARN", tone: "warning" };
    }

    return { label: "FAILED", tone: "danger" };
  }

  if (sourceState === "connected") {
    return { label: "LIVE", tone: "info" };
  }

  return { label: "RUNNING", tone: "info" };
}
