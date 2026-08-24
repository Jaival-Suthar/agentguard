import { readFile } from "node:fs/promises";

import type { VerificationObservation } from "./types.js";

type RawToolCall = {
  id?: unknown;
  type?: unknown;
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

  for (const event of events) {
    if (event.type !== "model.message" || !Array.isArray(event.tool_calls)) {
      continue;
    }

    for (const rawToolCall of event.tool_calls) {
      if (!isRecord(rawToolCall)) {
        continue;
      }

      const toolCall = rawToolCall as RawToolCall;
      const functionName = stringValue(toolCall.function?.name);

      if (functionName !== "call_tool") {
        continue;
      }

      const argumentsValue = parseToolArguments(
        toolCall.function?.arguments,
      );

      const mcpServer = stringValue(argumentsValue?.mcp_server);
      const toolName = stringValue(argumentsValue?.tool_name);

      if (!mcpServer || !toolName) {
        continue;
      }

      const eventId = stringValue(event.id);

      observations.push({
        kind: "action",
        action: `mcp:${mcpServer}:${toolName}`,
        ...(eventId ? { eventId } : {}),
      });
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