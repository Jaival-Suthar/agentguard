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