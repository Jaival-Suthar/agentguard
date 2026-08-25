export const EXECUTION_EVENT_TYPES = [
  "EXECUTION_STARTED",
  "MODEL_OUTPUT_STARTED",
  "MODEL_OUTPUT_DELTA",
  "TOOL_CALL",
  "TOOL_RESULT",
  "EXECUTION_COMPLETED",
  "UNKNOWN",
] as const;

export type ExecutionEventType = (typeof EXECUTION_EVENT_TYPES)[number];

export interface ExecutionEventContext {
  runId: string;
  sessionId?: string;
}

export interface ExecutionEvent {
  id: string;
  runId: string;
  sessionId?: string;
  source: "trueforge";
  type: ExecutionEventType;
  timestamp: string;
  receivedAt: string;
  correlationId?: string;
  status?: string;
  data: Record<string, unknown>;
  raw: unknown;
}

export interface RecordedTrueForgeEvent {
  received_at: string;
  event: Record<string, unknown>;
}
