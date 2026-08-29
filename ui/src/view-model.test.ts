import assert from "node:assert/strict";
import test from "node:test";

import { buildTimelineEntries } from "./view-model";
import type { ExecutionEvent, RunDetail } from "./types";

function makeEvent(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): ExecutionEvent {
  return {
    id,
    runId: "run-1",
    source: "trueforge",
    type,
    timestamp: `2026-08-29T12:00:${String(Number(id.slice(1)) % 60).padStart(2, "0")}.000Z`,
    receivedAt: `2026-08-29T12:00:${String(Number(id.slice(1)) % 60).padStart(2, "0")}.050Z`,
    data,
    raw: null,
  };
}

function makeDetail(events: ExecutionEvent[]): RunDetail {
  return {
    summary: {
      runId: "run-1",
      startedAt: "2026-08-29T12:00:00.000Z",
      baseUrl: "http://localhost:8791",
      model: "ollama/qwen-3-8b",
      prompt: "Investigate INC-042",
      eventCount: events.length,
      eventTypes: [...new Set(events.map((event) => event.type))],
      artifactAvailable: false,
      connectionState: "RUNNING",
    },
    events,
  };
}

test("buildTimelineEntries excludes streaming deltas and caps semantic entries", () => {
  const events = [
    makeEvent("e0", "EXECUTION_STARTED", { input: [{ text: "Investigate INC-042" }] }),
    ...Array.from({ length: 120 }, (_, index) =>
      makeEvent(`e${index + 1}`, "TOOL_CALL", {
        toolCalls: [
          {
            toolCallId: `call-${index + 1}`,
            toolName: "lookup_incident",
            mcpServer: "incident-mcp",
            arguments: { incident_id: "INC-042" },
          },
        ],
      }),
    ),
    makeEvent("e121", "MODEL_OUTPUT_DELTA", { content: "streamed token" }),
    ...Array.from({ length: 120 }, (_, index) =>
      makeEvent(`e${index + 122}`, "TOOL_RESULT", {
        toolCallId: `call-${index + 1}`,
        parsedContent: {
          found: true,
          incident_id: "INC-042",
          service: "analytics",
          severity: "high",
          status: "investigating",
          suspected_component: "nightly-worker",
        },
      }),
    ),
  ];

  const entries = buildTimelineEntries(makeDetail(events));

  assert.equal(entries.length, 200);
  assert.ok(entries.every((entry) => entry.stage !== "MODEL_OUTPUT_DELTA"));
  assert.ok(entries.every((entry) => !("data" in entry.payload)));
});

test("buildTimelineEntries keeps selected proof metadata compact and factual", () => {
  const entries = buildTimelineEntries(
    makeDetail([
      makeEvent("e0", "TOOL_RESULT", {
        toolCallId: "call-351195",
        parsedContent: {
          found: true,
          incident_id: "INC-042",
          service: "analytics",
          severity: "high",
          status: "investigating",
          suspected_component: "nightly-worker",
        },
      }),
    ]),
  );

  const entry = entries[0];
  assert.ok(entry);
  assert.equal(entry?.stage, "TOOL_RESULT");
  assert.deepEqual(entry?.payload.parsedContent, {
    found: true,
    incident_id: "INC-042",
    service: "analytics",
    severity: "high",
    status: "investigating",
    suspected_component: "nightly-worker",
  });
  assert.equal(entry?.payload.data, undefined);
});

test("buildTimelineEntries maps execution completion status without assuming PASS", () => {
  const entries = buildTimelineEntries(
    makeDetail([
      makeEvent("e0", "EXECUTION_COMPLETED", { output: { type: "model.message" } }),
      makeEvent("e1", "EXECUTION_COMPLETED", { output: { type: "model.message" } }),
      makeEvent("e2", "EXECUTION_COMPLETED", { output: { type: "model.message" } }),
    ].map((event, index) => ({
      ...event,
      status: index === 0 ? "done" : index === 1 ? "failed" : "mystery",
    }))),
  );

  assert.deepEqual(
    entries.map((entry) => entry.state),
    ["PASS", "FAIL", "LIVE"],
  );
});
