import test from "node:test";
import assert from "node:assert/strict";
import { loadExecutionContract } from "../../src/contract/index.js";
import {
  ApprovalDeniedError,
  PolicyBlockedError,
  PolicyGate,
} from "../../src/policy/index.js";
import type { PolicyDecisionEvent } from "../../src/policy/index.js";

const contract = await loadExecutionContract(
  "contracts/incident-investigation.yaml",
);

test("does not execute a blocked action", async () => {
  let executions = 0;
  const events: unknown[] = [];

  const gate = new PolicyGate({
    onDecision: (event) => {
      events.push(event);
    },
  });

  await assert.rejects(
    gate.execute("host:shell", contract, () => {
      executions += 1;
      return "executed";
    }),
    PolicyBlockedError,
  );

  assert.equal(executions, 0);
  assert.equal(events.length, 1);
  assert.equal(
    (events[0] as { decision: string }).decision,
    "BLOCK",
  );
});

test("executes an allowed action after the policy decision", async () => {
  const events: unknown[] = [];

  const gate = new PolicyGate({
    onDecision: (event) => {
      events.push(event);
    },
  });

  const result = await gate.execute(
    "mcp:incident.lookup:lookup_incident",
    contract,
    () => "lookup-result",
  );

  assert.equal(result.result, "lookup-result");
  assert.equal(result.decision.decision, "ALLOW");
  assert.equal(events.length, 1);
});

test("holds an approval-required action until approval is granted", async () => {
  let executions = 0;
  const events: PolicyDecisionEvent[] = [];

  const gate = new PolicyGate({
    createRequestId: () => "approval-1",
    onDecision: (event) => {
      events.push(event);
    },
    requestApproval: async (request) => {
      assert.equal(request.id, "approval-1");
      assert.equal(executions, 0);

      return {
        requestId: request.id,
        approved: true,
        decidedAt: "2026-01-01T00:00:01.000Z",
      };
    },
  });

  const result = await gate.execute(
    "operation:rollback",
    contract,
    () => {
      executions += 1;
      return "rollback-result";
    },
  );

  assert.equal(executions, 1);
  assert.equal(result.result, "rollback-result");
  assert.equal(result.approvalRequestId, "approval-1");

  // The returned decision must match the effective policy state.
  assert.equal(result.decision.decision, "ALLOW");

  assert.deepEqual(
    events.map((event) => event.decision),
    ["APPROVAL_REQUIRED", "ALLOW"],
  );
});

test("rejects approval with a mismatched request ID", async () => {
  let executions = 0;
  const events: PolicyDecisionEvent[] = [];

  const gate = new PolicyGate({
    createRequestId: () => "approval-expected",
    onDecision: (event) => {
      events.push(event);
    },
    requestApproval: async () => ({
      requestId: "approval-wrong",
      approved: true,
      decidedAt: "2026-01-01T00:00:01.000Z",
    }),
  });

  await assert.rejects(
    gate.execute("operation:rollback", contract, () => {
      executions += 1;
      return "rollback-result";
    }),
    (error: unknown) =>
      error instanceof ApprovalDeniedError &&
      error.requestId === "approval-expected" &&
      error.decision.decision === "BLOCK",
  );

  assert.equal(executions, 0);

  assert.deepEqual(
    events.map((event) => event.decision),
    ["APPROVAL_REQUIRED", "BLOCK"],
  );

  const mismatchEvent = events[1];
    assert.ok(mismatchEvent);

    assert.equal(
      mismatchEvent.metadata?.rejectionReason,
      "request_id_mismatch",
    );
});

test("rejects approval with an empty request ID", async () => {
  let executions = 0;

  const gate = new PolicyGate({
    createRequestId: () => "approval-expected",
    requestApproval: async () => ({
      requestId: "",
      approved: true,
      decidedAt: "2026-01-01T00:00:01.000Z",
    }),
  });

  await assert.rejects(
    gate.execute("operation:rollback", contract, () => {
      executions += 1;
      return "rollback-result";
    }),
    ApprovalDeniedError,
  );

  assert.equal(executions, 0);
});

test("never executes when approval is denied and emits terminal BLOCK", async () => {
  let executions = 0;
  const events: { decision: string; metadata?: Record<string, unknown> }[] = [];

  const gate = new PolicyGate({
    createRequestId: () => "approval-2",
    onDecision: (event) => {
      events.push(event);
    },
    requestApproval: async (request) => ({
      requestId: request.id,
      approved: false,
      decidedAt: "2026-01-01T00:00:01.000Z",
      reason: "Human rejected the rollback",
    }),
  });

  await assert.rejects(
    gate.execute("operation:rollback", contract, () => {
      executions += 1;
      return "rollback-result";
    }),
    (error: unknown) =>
      error instanceof ApprovalDeniedError &&
      error.requestId === "approval-2" &&
      error.decision.decision === "BLOCK",
  );

  assert.equal(executions, 0);

  assert.deepEqual(
    events.map((event) => event.decision),
    ["APPROVAL_REQUIRED", "BLOCK"],
  );

  const deniedEvent = events[1];
    assert.ok(deniedEvent);

    assert.equal(
      deniedEvent.metadata?.approvalRequestId,
      "approval-2",
    );

    assert.equal(
      deniedEvent.metadata?.approvalDecision,
      "denied",
    );
});

test("requires an approval handler for approval-gated actions", async () => {
  const gate = new PolicyGate();

  await assert.rejects(
    gate.execute("operation:rollback", contract, () => "rollback"),
    /no approval handler is configured/,
  );
});
