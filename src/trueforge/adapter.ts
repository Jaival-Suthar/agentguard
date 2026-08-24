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
  return records.map((record, index) =>
    normalizeTrueForgeEvent(record, context, index),
  );
}