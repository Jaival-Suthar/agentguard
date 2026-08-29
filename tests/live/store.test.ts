import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  listRunSummaries,
  loadRunDetail,
} from "../../src/live/index.js";

function artifact(runId: string, verdict: "PASS" | "WARN" | "FAIL") {
  return {
    version: 1,
    runId,
    contract: "incident-investigation",
    incidentId: "INC-042",
    status: verdict === "FAIL" ? "FAILED" : "COMPLETED",
    verdict,
    policy: {
      status: "PASS",
      summary: "Policy requirements were satisfied.",
      details: [],
    },
    execution: {
      status: "PASS",
      summary: "Execution completed successfully.",
      details: [],
    },
    recovery: {
      status: "NOT_REQUIRED",
      attempts: 1,
      retries: 0,
      maxRetries: 3,
    },
    evidence: {
      status: verdict,
      summary:
        verdict === "PASS"
          ? "Required evidence was independently verified."
          : verdict === "WARN"
            ? "Evidence verification returned WARN."
            : "Evidence verification returned FAIL.",
      details: [],
    },
    contractVerification: {
      status: "PASS",
      summary: "Execution contract requirements were satisfied.",
      details: [],
    },
    summary:
      verdict === "PASS"
        ? "Execution completed and all assurance checks passed."
        : verdict === "WARN"
          ? "Execution completed with warnings."
          : "Execution completed with failure.",
    failureReasons: verdict === "FAIL" ? ["Evidence verification returned FAIL."] : [],
    generatedAt: "2026-08-29T10:00:02.000Z",
  };
}

async function createTempDataRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "agentguard-live-"));
  await mkdir(join(root, "runs"), { recursive: true });
  await mkdir(join(root, "assurance"), { recursive: true });
  return root;
}

async function writeRun(
  root: string,
  runId: string,
  metadata: Record<string, unknown>,
  records: unknown[],
  finalArtifact?: ReturnType<typeof artifact>,
): Promise<void> {
  await writeFile(
    join(root, "runs", `${runId}.json`),
    `${JSON.stringify(metadata, null, 2)}\n`,
    "utf8",
  );

  await writeFile(
    join(root, "runs", `${runId}.jsonl`),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
    "utf8",
  );

  if (finalArtifact) {
    await writeFile(
      join(root, "assurance", `${runId}.json`),
      `${JSON.stringify(finalArtifact, null, 2)}\n`,
      "utf8",
    );
  }
}

test("listRunSummaries returns the most recent runs and marks completed artifacts", async () => {
  const root = await createTempDataRoot();
  const original = process.env.AGENTGUARD_DATA_DIR;
  process.env.AGENTGUARD_DATA_DIR = root;

  try {
    await writeRun(
      root,
      "run-old",
      {
        runId: "run-old",
        startedAt: "2026-08-29T09:00:00.000Z",
        baseUrl: "http://localhost:8791",
        model: "ollama/qwen-3-8b",
        prompt: "Old run",
        eventCount: 1,
        eventTypes: ["EXECUTION_STARTED"],
      },
      [
        {
          received_at: "2026-08-29T09:00:00.000Z",
          event: {
            type: "turn.created",
            id: "turn-old",
            turnId: "turn-old",
            input: [],
            state: { status: "running" },
            createdAt: "2026-08-29T09:00:00.000Z",
          },
        },
      ],
    );

    await writeRun(
      root,
      "run-new",
      {
        runId: "run-new",
        startedAt: "2026-08-29T10:00:00.000Z",
        baseUrl: "http://localhost:8791",
        model: "ollama/qwen-3-8b",
        prompt: "New run",
        eventCount: 2,
        eventTypes: ["EXECUTION_STARTED", "TOOL_RESULT"],
        completedAt: "2026-08-29T10:00:02.000Z",
        finalStatus: "done",
      },
      [
        {
          received_at: "2026-08-29T10:00:00.000Z",
          event: {
            type: "turn.created",
            id: "turn-new",
            turnId: "turn-new",
            input: [],
            state: { status: "running" },
            createdAt: "2026-08-29T10:00:00.000Z",
          },
        },
        {
          received_at: "2026-08-29T10:00:01.000Z",
          event: {
            type: "tool.response",
            id: "tool-result",
            toolCallId: "call_1",
            content:
              "{\"found\":true,\"incident_id\":\"INC-042\",\"service\":\"analytics\",\"severity\":\"high\",\"status\":\"investigating\",\"suspected_component\":\"nightly-worker\"}",
            createdAt: "2026-08-29T10:00:01.000Z",
          },
        },
      ],
      artifact("run-new", "PASS"),
    );

    const summaries = await listRunSummaries();

    assert.equal(summaries[0]?.runId, "run-new");
    assert.equal(summaries[0]?.artifactAvailable, true);
    assert.equal(summaries[0]?.connectionState, "VERIFIED");
    assert.equal(summaries[1]?.runId, "run-old");
    assert.equal(summaries[1]?.connectionState, "RUNNING");
  } finally {
    process.env.AGENTGUARD_DATA_DIR = original;
  }
});

test("listRunSummaries preserves WARN artifacts as WARN", async () => {
  const root = await createTempDataRoot();
  const original = process.env.AGENTGUARD_DATA_DIR;
  process.env.AGENTGUARD_DATA_DIR = root;

  try {
    await writeRun(
      root,
      "run-warn",
      {
        runId: "run-warn",
        startedAt: "2026-08-29T10:30:00.000Z",
        baseUrl: "http://localhost:8791",
        model: "ollama/qwen-3-8b",
        prompt: "Warn run",
        eventCount: 1,
        eventTypes: ["EXECUTION_STARTED"],
        completedAt: "2026-08-29T10:30:02.000Z",
        finalStatus: "done",
      },
      [
        {
          received_at: "2026-08-29T10:30:00.000Z",
          event: {
            type: "turn.created",
            id: "turn-warn",
            turnId: "turn-warn",
            input: [],
            state: { status: "running" },
            createdAt: "2026-08-29T10:30:00.000Z",
          },
        },
      ],
      artifact("run-warn", "WARN"),
    );

    const summaries = await listRunSummaries();
    assert.equal(summaries[0]?.runId, "run-warn");
    assert.equal(summaries[0]?.verdict, "WARN");
    assert.equal(summaries[0]?.connectionState, "WARN");
  } finally {
    process.env.AGENTGUARD_DATA_DIR = original;
  }
});

test("loadRunDetail rereads appended records for a live snapshot", async () => {
  const root = await createTempDataRoot();
  const original = process.env.AGENTGUARD_DATA_DIR;
  process.env.AGENTGUARD_DATA_DIR = root;

  try {
    const runId = "run-live";
    const metadata = {
      runId,
      startedAt: "2026-08-29T11:00:00.000Z",
      baseUrl: "http://localhost:8791",
      model: "ollama/qwen-3-8b",
      prompt: "Live run",
      eventCount: 1,
      eventTypes: ["EXECUTION_STARTED"],
    };

    await writeRun(
      root,
      runId,
      metadata,
      [
        {
          received_at: "2026-08-29T11:00:00.000Z",
          event: {
            type: "turn.created",
            id: "turn-live",
            turnId: "turn-live",
            input: [],
            state: { status: "running" },
            createdAt: "2026-08-29T11:00:00.000Z",
          },
        },
      ],
    );

    const first = await loadRunDetail(runId);
    assert.equal(first?.events.length, 1);
    assert.equal(first?.events[0]?.type, "EXECUTION_STARTED");

    await writeFile(
      join(root, "runs", `${runId}.jsonl`),
      [
        JSON.stringify({
          received_at: "2026-08-29T11:00:00.000Z",
          event: {
            type: "turn.created",
            id: "turn-live",
            turnId: "turn-live",
            input: [],
            state: { status: "running" },
            createdAt: "2026-08-29T11:00:00.000Z",
          },
        }),
        JSON.stringify({
          received_at: "2026-08-29T11:00:01.000Z",
          event: {
            type: "turn.done",
            id: "turn-done",
            createdAt: "2026-08-29T11:00:01.000Z",
            state: {
              status: "done",
              output: {
                type: "model.message",
                id: "message-final",
              },
              requiredActions: [],
              completedAt: "2026-08-29T11:00:01.000Z",
              metrics: {
                totalTokens: 10,
              },
            },
            threadId: null,
          },
        }),
      ].join("\n"),
      "utf8",
    );

    const second = await loadRunDetail(runId);
    assert.equal(second?.events.length, 2);
    assert.equal(second?.events[1]?.type, "EXECUTION_COMPLETED");
  } finally {
    process.env.AGENTGUARD_DATA_DIR = original;
  }
});


test("loadRunDetail keeps the live snapshot bounded and omits model deltas", async () => {
  const root = await createTempDataRoot();
  const original = process.env.AGENTGUARD_DATA_DIR;
  process.env.AGENTGUARD_DATA_DIR = root;

  try {
    const runId = "run-large";
    const records = Array.from({ length: 450 }, (_, index) => ({
      received_at: `2026-08-29T11:00:${String(Math.floor(index / 10)).padStart(2, "0")}.${String(index % 10).padStart(3, "0")}Z`,
      event: {
        type: index % 2 === 0 ? "model.message.delta" : "tool.response",
        id: `event-${index}`,
        createdAt: `2026-08-29T11:00:${String(Math.floor(index / 10)).padStart(2, "0")}.${String(index % 10).padStart(3, "0")}Z`,
        toolCallId: index % 2 === 1 ? `call-${index}` : undefined,
        content: index % 2 === 0 ? "streamed token" : '{"found":true,"incident_id":"INC-042"}',
      },
    }));

    await writeRun(
      root,
      runId,
      {
        runId,
        startedAt: "2026-08-29T11:00:00.000Z",
        baseUrl: "http://localhost:8791",
        model: "ollama/qwen-3-8b",
        prompt: "Large run",
        eventCount: records.length,
        eventTypes: ["model.message.delta", "tool.response"],
      },
      records,
    );

    const detail = await loadRunDetail(runId);
    assert.equal(detail?.events.length, 200);
    assert.ok(detail?.events.every((event) => event.type !== "MODEL_OUTPUT_DELTA"));
    assert.equal(detail?.summary.eventCount, records.length);
    assert.equal(detail?.events[0]?.raw, undefined);
  } finally {
    process.env.AGENTGUARD_DATA_DIR = original;
  }
});
