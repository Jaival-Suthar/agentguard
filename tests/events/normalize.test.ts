import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { normalizeTrueForgeRecords } from "../../src/trueforge/adapter.js";
import type { RecordedTrueForgeEvent } from "../../src/events/types.js";

async function loadFixture(): Promise<RecordedTrueForgeEvent[]> {
  const text = await readFile("tests/fixtures/trueforge-runtime.jsonl", "utf8");

  return text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as RecordedTrueForgeEvent);
}

test("normalizes the observed TrueForge runtime fixture", async () => {
  const records = await loadFixture();

  const events = normalizeTrueForgeRecords(records, {
    runId: "fixture-run",
    sessionId: "fixture-session",
  });

  assert.equal(events.length, 6);

  assert.deepEqual(
    events.map((event) => event.type),
    [
      "EXECUTION_STARTED",
      "MODEL_OUTPUT_STARTED",
      "MODEL_OUTPUT_DELTA",
      "MODEL_OUTPUT_DELTA",
      "MODEL_OUTPUT_DELTA",
      "EXECUTION_COMPLETED",
    ],
  );

  assert.equal(events[0]?.sessionId, "fixture-session");
  assert.equal(events[0]?.runId, "fixture-run");
  assert.equal(events[0]?.source, "trueforge");

  assert.equal(
    events[0]?.correlationId,
    "01m0shd553zfbysf0kfc4cf199.xtl9d0",
  );

  assert.equal(
    events[1]?.correlationId,
    "01m0shd55k4r735etwdzbwkhnx",
  );

  assert.equal(
    (events[0]?.raw as Record<string, unknown>).type,
    "turn.created",
  );

  assert.equal(
    (events[5]?.raw as Record<string, unknown>).type,
    "turn.done",
  );

  // Every normalized event must have a unique identity.
  const eventIds = events.map((event) => event.id);

  assert.equal(
    new Set(eventIds).size,
    events.length,
    "normalized event IDs must be unique",
  );

  assert.deepEqual(eventIds, [
    "fixture-run:0",
    "fixture-run:1",
    "fixture-run:2",
    "fixture-run:3",
    "fixture-run:4",
    "fixture-run:5",
  ]);

  // TrueForge's raw message ID is a correlation ID, not an event ID.
  assert.equal(
    events[2]?.id,
    "fixture-run:2",
  );

  assert.equal(
    events[3]?.id,
    "fixture-run:3",
  );

  assert.equal(
    events[4]?.id,
    "fixture-run:4",
  );

  assert.equal(
    events[2]?.correlationId,
    "01m0shd55k4r735etwdzbwkhnx",
  );

  assert.equal(
    events[3]?.correlationId,
    "01m0shd55k4r735etwdzbwkhnx",
  );

  assert.equal(
    events[4]?.correlationId,
    "01m0shd55k4r735etwdzbwkhnx",
  );
});

test("preserves unknown TrueForge events instead of throwing", () => {
  const events = normalizeTrueForgeRecords(
    [
      {
        received_at: "2026-08-24T10:00:00.000Z",
        event: {
          type: "future.event",
          id: "future-1",
          createdAt: "2026-08-24T10:00:00.001Z",
          payload: { value: 42 },
        },
      },
    ],
    { runId: "unknown-run" },
  );

  assert.equal(events[0]?.type, "UNKNOWN");
  assert.equal(events[0]?.id, "unknown-run:0");
  assert.equal(events[0]?.data.rawType, "future.event");

  assert.equal(
    events[0]?.correlationId,
    "future-1",
  );

  assert.deepEqual(events[0]?.raw, {
    type: "future.event",
    id: "future-1",
    createdAt: "2026-08-24T10:00:00.001Z",
    payload: { value: 42 },
  });
});

test("normalizes the observed TrueForge MCP trajectory", async () => {
  const records: RecordedTrueForgeEvent[] = [
    {
      received_at: "2026-08-25T08:49:40.826Z",
      event: {
        type: "turn.created",
        id: "turn-created-1",
        turnId: "turn-1",
        previousTurnId: null,
        input: [
          {
            type: "user.message",
            content:
              "You are investigating a synthetic production incident involving checkout-api.",
          },
        ],
        state: {
          status: "running",
        },
        createdAt: "2026-08-25T08:49:40.811Z",
        threadId: null,
      },
    },
    {
      received_at: "2026-08-25T08:49:49.233Z",
      event: {
        type: "model.message.delta",
        id: "message-1",
        threadId: "main",
        createdAt: "2026-08-25T08:49:49.231Z",
        toolCalls: [
          {
            toolInfo: {
              type: "truefoundry-system",
              name: "call_tool",
            },
            index: 0,
            id: "call_276839",
            type: "function",
            function: {
              name: "call_tool",
              arguments: "",
            },
          },
        ],
      },
    },
    {
      received_at: "2026-08-25T08:49:49.234Z",
      event: {
        type: "model.message.delta",
        id: "message-1",
        threadId: "main",
        toolCalls: [
          {
            index: 0,
            function: {
              arguments:
                '{"input":{"incident_id":"INC-042"},"mcp_server":"incident.lookup","tool_name":"lookup_incident"}',
            },
          },
        ],
      },
    },
    {
      received_at: "2026-08-25T08:49:49.256Z",
      event: {
        type: "tool.response",
        id: "tool-result-1",
        threadId: "main",
        toolCallId: "call_276839",
        content:
          '{\n  "found": true,\n  "incident_id": "INC-042",\n  "service": "analytics",\n  "severity": "high",\n  "status": "investigating",\n  "suspected_component": "nightly-worker"\n}',
        createdAt: "2026-08-25T08:49:49.251Z",
      },
    },
    {
      received_at: "2026-08-25T08:49:57.046Z",
      event: {
        type: "turn.done",
        id: "turn-done-1",
        createdAt: "2026-08-25T08:49:57.042Z",
        state: {
          status: "done",
          output: {
            type: "model.message",
            id: "message-final",
          },
          requiredActions: [],
          completedAt: "2026-08-25T08:49:57.042Z",
          metrics: {
            totalTokens: 9771,
          },
        },
        threadId: null,
      },
    },
  ];
  const events = normalizeTrueForgeRecords(records, {
    runId: "mcp-run",
    sessionId: "mcp-session",
  });

  assert.equal(events.length, 5);
  assert.deepEqual(events.map((event) => event.type), [
    "EXECUTION_STARTED",
    "TOOL_CALL",
    "TOOL_CALL",
    "TOOL_RESULT",
    "EXECUTION_COMPLETED",
  ]);

  const lookupCall = events[1];
  assert.equal(lookupCall?.type, "TOOL_CALL");
  const lookupCallData = lookupCall?.data as
    | { toolCalls?: Array<Record<string, unknown>> }
    | undefined;
  assert.equal(
    lookupCallData?.toolCalls?.[0]?.functionName,
    "call_tool",
  );
  assert.equal(
    lookupCallData?.toolCalls?.[0]?.toolName,
    undefined,
  );

  const lookupCallContinuation = events[2];
  assert.equal(lookupCallContinuation?.type, "TOOL_CALL");
  const lookupCallContinuationData = lookupCallContinuation?.data as
    | { toolCalls?: Array<Record<string, unknown>> }
    | undefined;
  assert.equal(
    lookupCallContinuationData?.toolCalls?.[0]?.mcpServer,
    "incident.lookup",
  );
  assert.equal(
    lookupCallContinuationData?.toolCalls?.[0]?.toolName,
    "lookup_incident",
  );
  assert.equal(
    lookupCallContinuationData?.toolCalls?.[0]?.toolCallId,
    "call_276839",
  );

  const lookupResult = events[3];
  assert.equal(lookupResult?.type, "TOOL_RESULT");
  const lookupResultData = lookupResult?.data as
    | { toolCallId?: string; parsedContent?: Record<string, unknown> }
    | undefined;
  assert.equal(lookupResultData?.toolCallId, "call_276839");
  assert.equal(lookupResultData?.parsedContent?.found, true);
});

test("does not falsely classify malformed tool payloads", () => {
  const events = normalizeTrueForgeRecords(
    [
      {
        received_at: "2026-08-25T10:00:00.000Z",
        event: {
          type: "model.message",
          id: "bad-call",
          tool_calls: [{ type: "function" }],
        },
      },
      {
        received_at: "2026-08-25T10:00:00.001Z",
        event: {
          type: "tool.response",
          content: "{\"found\":true}",
        },
      },
    ],
    { runId: "malformed-run" },
  );

  assert.deepEqual(events.map((event) => event.type), [
    "UNKNOWN",
    "UNKNOWN",
  ]);
});
