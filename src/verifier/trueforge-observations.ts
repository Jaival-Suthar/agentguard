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
  toolCallId?: unknown;
  content?: unknown;
};

type TrueForgeEventFile = {
  data?: unknown;
  event?: unknown;
};

type PendingToolCall = {
  eventId?: string;
  toolCallId?: string;
  functionName?: string;
  mcpServer?: string;
  toolName?: string;
  action?: string;
  emitted?: boolean;
  outcomeObserved?: boolean;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function stringValue(
  value: unknown,
): string | undefined {
  return typeof value === "string" &&
    value.length > 0
    ? value
    : undefined;
}

function parseJsonRecord(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  try {
    const parsed: unknown = JSON.parse(value);

    return isRecord(parsed)
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function toolCallEntries(
  event: RawTrueForgeEvent,
): RawToolCall[] {
  if (Array.isArray(event.toolCalls)) {
    return event.toolCalls.filter(
      isRecord,
    ) as RawToolCall[];
  }

  if (Array.isArray(event.tool_calls)) {
    return event.tool_calls.filter(
      isRecord,
    ) as RawToolCall[];
  }

  return [];
}

function toolCallKeys(
  event: RawTrueForgeEvent,
  toolCall: RawToolCall,
  index: number,
): string[] {
  const eventId =
    stringValue(event.id) ??
    "unknown";

  const toolCallId =
    stringValue(toolCall.id);

  const providerIndex =
    typeof toolCall.index === "number"
      ? toolCall.index
      : undefined;

  const keys: string[] = [];

  if (toolCallId) {
    keys.push(
      `${eventId}:id:${toolCallId}`,
    );
  }

  if (providerIndex !== undefined) {
    keys.push(
      `${eventId}:index:${providerIndex}`,
    );
  }

  if (keys.length === 0) {
    keys.push(
      `${eventId}:position:${index}`,
    );
  }

  return keys;
}

function extractEvents(
  payload: unknown,
): RawTrueForgeEvent[] {
  if (!isRecord(payload)) {
    throw new Error(
      "TrueForge event record must contain an object.",
    );
  }

  const file =
    payload as TrueForgeEventFile;

  if (Array.isArray(file.data)) {
    return file.data.filter(
      isRecord,
    ) as RawTrueForgeEvent[];
  }

  if (isRecord(file.event)) {
    return [
      file.event as RawTrueForgeEvent,
    ];
  }

  throw new Error(
    "TrueForge event input must contain either a data array or an event object.",
  );
}

function parseToolResultContent(
  value: unknown,
): Record<string, unknown> | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  /*
   * TrueForge MCP responses can sometimes be wrapped
   * in an outer JSON envelope:
   *
   * {
   *   "error": [
   *     {
   *       "type": "text",
   *       "text": "{\"error\":\"...\"}"
   *     }
   *   ]
   * }
   *
   * The outer envelope is still useful evidence.
   */
  const outer = parseJsonRecord(value);

  if (!outer) {
    return undefined;
  }

  return outer;
}

function toolResultHasError(
  parsedContent:
    | Record<string, unknown>
    | undefined,
): boolean {
  if (!parsedContent) {
    return false;
  }

  if (
    parsedContent.error !== undefined
  ) {
    return true;
  }

  return false;
}

function isExplicitChaosFault(
  parsedContent:
    | Record<string, unknown>
    | undefined,
): boolean {
  if (!parsedContent) {
    return false;
  }

  const errorValue =
    parsedContent.error;

  if (Array.isArray(errorValue)) {
    return errorValue.some((entry) => {
      if (!isRecord(entry)) {
        return false;
      }

      const text =
        stringValue(entry.text);

      return (
        text?.includes(
          "Chaos MCP timeout injected",
        ) === true
      );
    });
  }

  if (typeof errorValue === "string") {
    return errorValue.includes(
      "Chaos MCP timeout injected",
    );
  }

  return false;
}

export function normalizeTrueForgeObservations(
  events: readonly RawTrueForgeEvent[],
): VerificationObservation[] {
  const observations: VerificationObservation[] =
    [];

  /*
   * pendingToolCalls is used only to merge multiple
   * model-message deltas belonging to the SAME provider
   * event/index.
   *
   * pendingToolCallsById is the authoritative response
   * correlation map.
   *
   * IMPORTANT:
   * An action without a provider toolCallId is never
   * allowed to inherit another action's state.
   */
  const pendingToolCalls = new Map<
    string,
    PendingToolCall
  >();

  const pendingToolCallsById = new Map<
    string,
    PendingToolCall
  >();

  for (const event of events) {
    /*
     * Reconstruct tool actions from model messages
     * and deltas.
     */
    if (
      event.type === "model.message" ||
      event.type ===
        "model.message.delta"
    ) {
      const entries =
        toolCallEntries(event);

      for (
        const [index, rawToolCall]
        of entries.entries()
      ) {
        const keys =
          toolCallKeys(
            event,
            rawToolCall,
            index,
          );

        const incomingToolCallId =
          stringValue(
            rawToolCall.id,
          );

        let state:
          | PendingToolCall
          | undefined;

        /*
         * ONLY an explicit provider toolCallId may
         * reconnect a tool call to an existing state.
         *
         * Without one, create a completely new state.
         *
         * This prevents a retry/repeated sandbox call
         * from inheriting the previous call's outcome.
         */
        if (incomingToolCallId) {
          state =
            pendingToolCallsById.get(
              incomingToolCallId,
            );
        }

        /*
         * For provider events without an ID, deltas from
         * the exact same event/index may still be merged.
         *
         * This lookup is intentionally performed only when
         * the incoming provider ID is absent AND the key
         * belongs to this exact event.
         *
         * We never search another event's state.
         */
        if (!state && !incomingToolCallId) {
          const eventKey =
            keys[0];

          if (eventKey) {
            const candidate =
              pendingToolCalls.get(eventKey);

            if (
              candidate &&
              candidate.eventId ===
                stringValue(event.id)
            ) {
              state = candidate;
            }
          }
        }

        state ??= {};

        const functionName =
          stringValue(
            rawToolCall.function
              ?.name,
          );

        const argumentsValue =
          parseJsonRecord(
            rawToolCall.function
              ?.arguments,
          );

        if (functionName) {
          state.functionName =
            functionName;
        }

        if (incomingToolCallId) {
          state.toolCallId =
            incomingToolCallId;

          pendingToolCallsById.set(
            incomingToolCallId,
            state,
          );
        }

        const mcpServer =
          stringValue(
            argumentsValue
              ?.mcp_server,
          );

        const toolName =
          stringValue(
            argumentsValue
              ?.tool_name,
          );

        if (mcpServer) {
          state.mcpServer =
            mcpServer;
        }

        if (toolName) {
          state.toolName =
            toolName;
        }

        const eventId =
          stringValue(event.id);

        if (eventId) {
          state.eventId =
            eventId;
        }

        if (
          state.functionName ===
            "call_tool" &&
          state.mcpServer &&
          state.toolName
        ) {
          state.action =
            `mcp:${state.mcpServer}:${state.toolName}`;
        } else if (
          state.functionName === "exec" ||
          (state.mcpServer === "sandbox" &&
            state.toolName === "exec")
        ) {
          state.action = "sandbox:execute";
        }

        /*
         * Store the state under this exact event/index
         * key so subsequent deltas of THIS event can
         * merge into it.
         *
         * A different event gets a different state.
         */
        for (const key of keys) {
          pendingToolCalls.set(
            key,
            state,
          );
        }

        if (
          !state.emitted &&
          state.action
        ) {
          observations.push({
            kind: "action",
            action: state.action,
            ...(state.eventId
              ? {
                  eventId:
                    state.eventId,
                }
              : {}),
          });

          state.emitted = true;

          for (const key of keys) {
            pendingToolCalls.set(
              key,
              state,
            );
          }
        }
      }

      continue;
    }

    /*
     * Tool responses contain the actual execution result.
     *
     * Responses MUST correlate through the exact
     * provider toolCallId. There is deliberately NO
     * fallback to event ID, position, action name, or
     * latest pending action.
     */
    if (
      event.type !== "tool.response"
    ) {
      continue;
    }

    const toolCallId =
      stringValue(
        event.toolCallId,
      ) ??
      stringValue(
        event.tool_call_id,
      );

    if (!toolCallId) {
      /*
       * A response without a provider correlation ID
       * cannot be safely assigned to an action.
       */
      continue;
    }

    const state =
      pendingToolCallsById.get(
        toolCallId,
      );

    /*
     * Unknown provider response IDs are ignored.
     *
     * Never attach them to the most recent action.
     */
    if (!state || !state.action) {
      continue;
    }

    const parsedContent =
      parseToolResultContent(
        event.content,
      );

    const explicitChaosFault =
      isExplicitChaosFault(
        parsedContent,
      );

    /*
     * An outcome is verified when the tool response
     * itself is a parseable response envelope.
     *
     * A valid MCP error is still a verified outcome:
     * the tool executed and deterministically reported
     * an error.
     *
     * Sandbox success is evaluated later by the evidence
     * verifier using exitCode and deterministic result
     * contents.
     */
    const outcomeVerified =
      parsedContent !== undefined;

    const responseEventId =
      stringValue(event.id);

    const actionEventId =
      state.eventId;

    const observationData:
      Record<string, unknown> = {
        action: state.action,
        toolCallId,
        content:
          event.content,
        explicitChaosFault,
        ...(toolResultHasError(
          parsedContent,
        )
          ? {
              toolResultError: true,
            }
          : {}),
      };

    if (parsedContent) {
      observationData.parsedContent =
        parsedContent;
    }

    if (explicitChaosFault) {
      observationData.chaosFault =
        "timeout";
    }

    observations.push({
      kind: "outcome",
      outcomeVerified,

      ...(responseEventId
        ? {
            eventId:
              responseEventId,
          }
        : {}),

      ...(actionEventId
        ? {
            actionEventId,
          }
        : {}),

      data: observationData,
    });

    state.outcomeObserved = true;
  }

  return observations;
}

export async function loadTrueForgeObservations(
  path: string,
): Promise<VerificationObservation[]> {
  const text =
    await readFile(
      path,
      "utf8",
    );

  const trimmed =
    text.trim();

  if (!trimmed) {
    return [];
  }

  try {
    const payload: unknown =
      JSON.parse(trimmed);

    return normalizeTrueForgeObservations(
      extractEvents(payload),
    );
  } catch (error) {
    if (
      !(error instanceof SyntaxError)
    ) {
      throw error;
    }
  }

  const records = trimmed
    .split(/\r?\n/)
    .map(
      (line) => line.trim(),
    )
    .filter(
      (line) =>
        line.length > 0,
    )
    .map(
      (line, index) => {
        try {
          return JSON.parse(
            line,
          ) as unknown;
        } catch (error) {
          throw new Error(
            `Invalid TrueForge JSONL at line ${
              index + 1
            }: ${
              error instanceof Error
                ? error.message
                : String(error)
            }`,
          );
        }
      },
    );

  const events =
    records.flatMap(
      (record) =>
        extractEvents(record),
    );

  return normalizeTrueForgeObservations(
    events,
  );
}