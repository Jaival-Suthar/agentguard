import type {
  ExecutionEvent,
  ExecutionEventContext,
  RecordedTrueForgeEvent,
} from "../events/types.js";

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function eventTimestamp(
  event: Record<string, unknown>,
  receivedAt: string,
): string {
  return stringValue(event.createdAt) ?? receivedAt;
}

function statusValue(
  event: Record<string, unknown>,
): string | undefined {
  const state = objectValue(event.state);
  return stringValue(state.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseJsonRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function summarizeToolCall(
  rawToolCall: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const functionValue = objectValue(rawToolCall.function);
  const toolInfoValue = objectValue(
    rawToolCall.toolInfo ?? rawToolCall.tool_info,
  );
  const toolCallId = stringValue(rawToolCall.id);
  const toolCallIndex =
    typeof rawToolCall.index === "number" ? rawToolCall.index : undefined;
  const functionName = stringValue(functionValue.name);
  const argumentsValue = stringValue(functionValue.arguments);
  const parsedArguments = parseJsonRecord(functionValue.arguments);

  const summary: Record<string, unknown> = {};

  if (toolCallId) {
    summary.toolCallId = toolCallId;
  }

  if (typeof toolCallIndex === "number") {
    summary.index = toolCallIndex;
  }

  if (functionName) {
    summary.functionName = functionName;
  }

  if (argumentsValue !== undefined) {
    summary.arguments = argumentsValue;
  }

  if (parsedArguments) {
    summary.parsedArguments = parsedArguments;

    const mcpServer = stringValue(parsedArguments.mcp_server);
    const toolName = stringValue(parsedArguments.tool_name);

    if (mcpServer) {
      summary.mcpServer = mcpServer;
    }

    if (toolName) {
      summary.toolName = toolName;
    }
  }

  const toolInfoName = stringValue(toolInfoValue.name);
  const toolInfoType = stringValue(toolInfoValue.type);

  if (toolInfoName) {
    summary.toolInfoName = toolInfoName;
  }

  if (toolInfoType) {
    summary.toolInfoType = toolInfoType;
  }

  return Object.keys(summary).length > 0 ? summary : undefined;
}

function toolCallEntries(raw: Record<string, unknown>): Record<string, unknown>[] {
  const calls = raw.toolCalls ?? raw.tool_calls;

  if (!Array.isArray(calls)) {
    return [];
  }

  return calls.filter(isRecord);
}

function hasToolCallEntries(raw: Record<string, unknown>): boolean {
  return Array.isArray(raw.toolCalls ?? raw.tool_calls);
}

interface ToolCallState {
  toolCallId?: string;
}

function toolCallStateKeys(
  event: ExecutionEvent,
  entry: Record<string, unknown>,
  index: number,
): string[] {
  const correlationId =
    event.correlationId ?? event.id ?? "unknown";

  const toolCallId = stringValue(entry.toolCallId);
  const providerIndex =
    typeof entry.index === "number" ? entry.index : undefined;

  const keys: string[] = [];

  if (toolCallId) {
    keys.push(`${correlationId}:id:${toolCallId}`);
  }

  if (providerIndex !== undefined) {
    keys.push(`${correlationId}:index:${providerIndex}`);
  }

  if (keys.length === 0) {
    keys.push(`${correlationId}:position:${index}`);
  }

  return keys;
}

function enrichToolCallSummaries(
  event: ExecutionEvent,
  states: Map<string, ToolCallState>,
): ExecutionEvent {
  if (event.type !== "TOOL_CALL") {
    return event;
  }

  const data = event.data as Record<string, unknown>;
  const entries = data.toolCalls;

  if (!Array.isArray(entries)) {
    return event;
  }

  let changed = false;
  const enrichedEntries = entries.map((entry, index) => {
    if (!isRecord(entry)) {
      return entry;
    }

    const keys = toolCallStateKeys(event, entry, index);
    const toolCallId = stringValue(entry.toolCallId);

    let state: ToolCallState | undefined;

    for (const key of keys) {
      const candidate = states.get(key);

      if (
        candidate &&
        (!toolCallId ||
          !candidate.toolCallId ||
          candidate.toolCallId === toolCallId)
      ) {
        state = candidate;
        break;
      }
    }

    state ??= {};

    const enrichedEntry: Record<string, unknown> = { ...entry };

    if (toolCallId) {
      state.toolCallId = toolCallId;
    } else if (state.toolCallId) {
      enrichedEntry.toolCallId = state.toolCallId;
      changed = true;
    }

    for (const key of keys) {
      states.set(key, state);
    }

    return enrichedEntry;
  });

  if (!changed) {
    return event;
  }

  return {
    ...event,
    data: {
      ...data,
      toolCalls: enrichedEntries,
    },
  };
}

export function normalizeTrueForgeEvent(
  record: RecordedTrueForgeEvent,
  context: ExecutionEventContext,
  index: number,
): ExecutionEvent {
  const raw = record.event;
  const rawType = stringValue(raw.type);
  const id = `${context.runId}:${index}`;
  const timestamp = eventTimestamp(raw, record.received_at);

  switch (rawType) {
    case "turn.created": {
      const correlationId = stringValue(raw.turnId);
      const status = statusValue(raw);

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "EXECUTION_STARTED",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        ...(status ? { status } : {}),
        data: {
          input: raw.input,
          threadId: raw.threadId,
          previousTurnId: raw.previousTurnId,
        },
        raw,
      };
    }

    case "model.message": {
      const correlationId = stringValue(raw.id);

      const toolCalls = toolCallEntries(raw)
        .map((toolCall) => summarizeToolCall(toolCall))
        .filter(
          (
            toolCall,
          ): toolCall is Record<string, unknown> => toolCall !== undefined,
        );

      if (toolCalls.length > 0) {
        return {
          id,
          runId: context.runId,
          ...(context.sessionId ? { sessionId: context.sessionId } : {}),
          source: "trueforge",
          type: "TOOL_CALL",
          timestamp,
          receivedAt: record.received_at,
          ...(correlationId ? { correlationId } : {}),
          data: {
            toolCalls,
            finishReason: raw.finishReason ?? raw.finish_reason,
            threadId: raw.threadId,
            usage: raw.usage,
          },
          raw,
        };
      }

      if (hasToolCallEntries(raw)) {
        return {
          id,
          runId: context.runId,
          ...(context.sessionId ? { sessionId: context.sessionId } : {}),
          source: "trueforge",
          type: "UNKNOWN",
          timestamp,
          receivedAt: record.received_at,
          ...(correlationId ? { correlationId } : {}),
          data: {
            rawType: rawType ?? "unknown",
          },
          raw,
        };
      }

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "MODEL_OUTPUT_STARTED",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        data: {
          threadId: raw.threadId,
        },
        raw,
      };
    }

    case "model.message.delta": {
      const correlationId = stringValue(raw.id);

      const toolCalls = toolCallEntries(raw)
        .map((toolCall) => summarizeToolCall(toolCall))
        .filter(
          (
            toolCall,
          ): toolCall is Record<string, unknown> => toolCall !== undefined,
        );

      if (toolCalls.length > 0) {
        return {
          id,
          runId: context.runId,
          ...(context.sessionId ? { sessionId: context.sessionId } : {}),
          source: "trueforge",
          type: "TOOL_CALL",
          timestamp,
          receivedAt: record.received_at,
          ...(correlationId ? { correlationId } : {}),
          data: {
            toolCalls,
            finishReason: raw.finishReason ?? raw.finish_reason,
            threadId: raw.threadId,
            usage: raw.usage,
          },
          raw,
        };
      }

      if (hasToolCallEntries(raw)) {
        return {
          id,
          runId: context.runId,
          ...(context.sessionId ? { sessionId: context.sessionId } : {}),
          source: "trueforge",
          type: "UNKNOWN",
          timestamp,
          receivedAt: record.received_at,
          ...(correlationId ? { correlationId } : {}),
          data: {
            rawType: rawType ?? "unknown",
          },
          raw,
        };
      }

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "MODEL_OUTPUT_DELTA",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        data: {
          content: raw.content,
          threadId: raw.threadId,
          finishReason: raw.finishReason,
          usage: raw.usage,
        },
        raw,
      };
    }

    case "tool.response": {
      const correlationId =
        stringValue(raw.toolCallId) ??
        stringValue(raw.tool_call_id) ??
        stringValue(raw.id);
      const rawCorrelationId = stringValue(raw.id);

      if (!correlationId) {
        return {
          id,
          runId: context.runId,
          ...(context.sessionId ? { sessionId: context.sessionId } : {}),
          source: "trueforge",
          type: "UNKNOWN",
          timestamp,
          receivedAt: record.received_at,
          ...(rawCorrelationId ? { correlationId: rawCorrelationId } : {}),
          data: {
            rawType: rawType ?? "unknown",
          },
          raw,
        };
      }

      const parsedContent = parseJsonRecord(raw.content);

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "TOOL_RESULT",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        data: {
          toolCallId: correlationId,
          content: raw.content,
          ...(parsedContent ? { parsedContent } : {}),
          threadId: raw.threadId,
        },
        raw,
      };
    }

    case "turn.done": {
      const state = objectValue(raw.state);
      const output = objectValue(state.output);
      const correlationId = stringValue(output.id);
      const status = statusValue(raw);

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "EXECUTION_COMPLETED",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        ...(status ? { status } : {}),
        data: {
          output: state.output,
          requiredActions: raw.requiredActions,
          completedAt: raw.completedAt,
          metrics: raw.metrics,
          threadId: raw.threadId,
        },
        raw,
      };
    }

    default: {
      const correlationId = stringValue(raw.id);

      return {
        id,
        runId: context.runId,
        ...(context.sessionId ? { sessionId: context.sessionId } : {}),
        source: "trueforge",
        type: "UNKNOWN",
        timestamp,
        receivedAt: record.received_at,
        ...(correlationId ? { correlationId } : {}),
        data: {
          rawType: rawType ?? "unknown",
        },
        raw,
      };
    }
  }
}

export function normalizeTrueForgeRecords(
  records: readonly RecordedTrueForgeEvent[],
  context: ExecutionEventContext,
): ExecutionEvent[] {
  const toolCallStates = new Map<string, ToolCallState>();

  return records.map((record, index) =>
    enrichToolCallSummaries(
      normalizeTrueForgeEvent(record, context, index),
      toolCallStates,
    ),
  );
}
