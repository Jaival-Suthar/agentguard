import { readFile } from "node:fs/promises";

import type { VerificationObservation } from "./types.js";

type RawToolCall = {
  id?: unknown;
  index?: unknown;
  type?: unknown;
  toolInfo?: {
    name?: unknown;
    type?: unknown;
  };
  function?: {
    name?: unknown;
    arguments?: unknown;
  };
  tool_info?: {
    name?: unknown;
    type?: unknown;
  };
};

type RawTrueForgeEvent = {
  id?: unknown;
  type?: unknown;
  tool_calls?: unknown;
  toolCalls?: unknown;
  tool_call_id?: unknown;
};

type TrueForgeEventFile = {
  data?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseToolArguments(
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

function toolCallEntries(event: RawTrueForgeEvent): RawToolCall[] {
  if (Array.isArray(event.toolCalls)) {
    return event.toolCalls.filter(isRecord) as RawToolCall[];
  }

  if (Array.isArray(event.tool_calls)) {
    return event.tool_calls.filter(isRecord) as RawToolCall[];
  }

  return [];
}

function toolCallKey(
  event: RawTrueForgeEvent,
  toolCall: RawToolCall,
  index: number,
): string {
  const eventId = stringValue(event.id) ?? "unknown";
  const toolCallId = stringValue(toolCall.id);
  const toolCallIndex =
    typeof toolCall.index === "number" ? toolCall.index : index;

  return `${eventId}:${toolCallIndex ?? toolCallId}`;
}

function extractEvents(payload: unknown): RawTrueForgeEvent[] {
  if (!isRecord(payload)) {
    throw new Error("TrueForge event file must contain an object.");
  }

  const file = payload as TrueForgeEventFile;

  if (!Array.isArray(file.data)) {
    throw new Error("TrueForge event file must contain a data array.");
  }

  return file.data.filter(isRecord) as RawTrueForgeEvent[];
}

export function normalizeTrueForgeObservations(
  events: readonly RawTrueForgeEvent[],
): VerificationObservation[] {
  const observations: VerificationObservation[] = [];
  const pendingToolCalls = new Map<
    string,
    {
      eventId?: string;
      functionName?: string;
      mcpServer?: string;
      toolName?: string;
      emitted?: boolean;
    }
  >();

  for (const event of events) {
    if (
      event.type !== "model.message" &&
      event.type !== "model.message.delta"
    ) {
      continue;
    }

    const entries = toolCallEntries(event);

    for (const [index, rawToolCall] of entries.entries()) {
      const key = toolCallKey(event, rawToolCall, index);
      const state = pendingToolCalls.get(key) ?? {};
      const functionName = stringValue(rawToolCall.function?.name);
      const argumentsValue = parseToolArguments(
        rawToolCall.function?.arguments,
      );

      if (functionName) {
        state.functionName = functionName;
      }

      const mcpServer = stringValue(argumentsValue?.mcp_server);
      const toolName = stringValue(argumentsValue?.tool_name);

      if (mcpServer) {
        state.mcpServer = mcpServer;
      }

      if (toolName) {
        state.toolName = toolName;
      }

      const eventId = stringValue(event.id);

      if (eventId) {
        state.eventId = eventId;
      }

      pendingToolCalls.set(key, state);

      if (
        !state.emitted &&
        state.functionName === "call_tool" &&
        state.mcpServer &&
        state.toolName
      ) {
        observations.push({
          kind: "action",
          action: `mcp:${state.mcpServer}:${state.toolName}`,
          ...(state.eventId ? { eventId: state.eventId } : {}),
        });

        state.emitted = true;
        pendingToolCalls.set(key, state);
      }
    }
  }

  return observations;
}

export async function loadTrueForgeObservations(
  path: string,
): Promise<VerificationObservation[]> {
  const text = await readFile(path, "utf8");
  const payload: unknown = JSON.parse(text);

  return normalizeTrueForgeObservations(extractEvents(payload));
}
