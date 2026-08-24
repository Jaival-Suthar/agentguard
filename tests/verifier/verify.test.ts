import test from "node:test";
import assert from "node:assert/strict";

import { parseExecutionContract } from "../../src/contract/loader.js";
import { verifyObservations } from "../../src/verifier/verify.js";

const contract = parseExecutionContract(`
version: 1
name: incident-investigation
actions:
  allow:
    - mcp:database.read
  approvalRequired:
    - mcp:github.write
  deny:
    - host:filesystem.read
limits:
  maxRetries: 3
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
    - verification
`);

test("passes an explicitly allowed action", () => {
  const report = verifyObservations(contract, [
    {
      kind: "action",
      action: "mcp:database.read",
      eventId: "event-1",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.failures, 0);
  assert.equal(report.findings[0]?.code, "ACTION_ALLOWED");
});

test("fails an explicitly denied action", () => {
  const report = verifyObservations(contract, [
    {
      kind: "action",
      action: "host:filesystem.read",
      eventId: "event-2",
    },
  ]);

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.failures, 1);
  assert.equal(report.findings[0]?.code, "ACTION_DENIED");
});

test("passes an approval-required action when approval is observed", () => {
  const report = verifyObservations(contract, [
    {
      kind: "action",
      action: "mcp:github.write",
      approved: true,
      eventId: "event-3",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.findings[0]?.code, "APPROVAL_GRANTED");
});

test("passes an approval-required action with a separate correlated approval", () => {
  const report = verifyObservations(contract, [
    {
      kind: "action",
      action: "mcp:github.write",
      eventId: "action-event-1",
    },
    {
      kind: "approval",
      approved: true,
      actionEventId: "action-event-1",
      eventId: "approval-event-1",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.failures, 0);
  assert.equal(report.findings[0]?.code, "APPROVAL_GRANTED");
});

test("fails an approval-required action when approval is missing", () => {
  const report = verifyObservations(contract, [
    {
      kind: "action",
      action: "mcp:github.write",
      eventId: "event-4",
    },
  ]);

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.findings[0]?.code, "APPROVAL_MISSING");
});

test("fails when retry limit is exceeded", () => {
  const report = verifyObservations(contract, [
    {
      kind: "retry",
      retryCount: 4,
      eventId: "event-5",
    },
  ]);

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.findings[0]?.code, "RETRY_LIMIT_EXCEEDED");
});

test("warns when retry count is negative", () => {
  const report = verifyObservations(contract, [
    {
      kind: "retry",
      retryCount: -1,
      eventId: "event-negative-retry",
    },
  ]);

  assert.equal(report.verdict, "WARN");
  assert.equal(report.warnings, 1);
  assert.equal(report.findings[0]?.code, "MALFORMED_OBSERVATION");
});

test("passes when retry count is within the contract limit", () => {
  const report = verifyObservations(contract, [
    {
      kind: "retry",
      retryCount: 2,
      eventId: "event-retry-ok",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.findings[0]?.code, "RETRY_WITHIN_LIMIT");
});

test("fails when required evidence is missing", () => {
  const report = verifyObservations(contract, [
    {
      kind: "evidence",
      evidence: ["root_cause"],
      eventId: "event-6",
    },
  ]);

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.findings[0]?.code, "REQUIRED_EVIDENCE_MISSING");
});

test("passes when all required evidence is present", () => {
  const report = verifyObservations(contract, [
    {
      kind: "evidence",
      evidence: ["root_cause", "verification"],
      eventId: "event-evidence-ok",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.findings[0]?.code, "REQUIRED_EVIDENCE_PRESENT");
});

test("fails when outcome verification is required but absent", () => {
  const report = verifyObservations(contract, [
    {
      kind: "outcome",
      outcomeVerified: false,
      eventId: "event-7",
    },
  ]);

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.findings[0]?.code, "OUTCOME_UNVERIFIED");
});

test("passes when outcome verification is satisfied", () => {
  const report = verifyObservations(contract, [
    {
      kind: "outcome",
      outcomeVerified: true,
      eventId: "event-outcome-ok",
    },
  ]);

  assert.equal(report.verdict, "PASS");
  assert.equal(report.findings[0]?.code, "OUTCOME_VERIFIED");
});

test("warns on an unsupported observation kind", () => {
  const report = verifyObservations(contract, [
    {
      kind: "bogus" as never,
      eventId: "event-unknown-kind",
    },
  ]);

  assert.equal(report.verdict, "WARN");
  assert.equal(report.warnings, 1);
  assert.equal(report.findings[0]?.code, "MALFORMED_OBSERVATION");
});