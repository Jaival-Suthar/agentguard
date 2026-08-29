import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAssuranceArtifact,
} from "../../src/assurance/index.js";
import type {
  EvidenceVerificationReport,
} from "../../src/verifier/evidence.js";
import type {
  VerificationReport,
} from "../../src/verifier/types.js";

function evidence(
  verdict: EvidenceVerificationReport["verdict"],
): EvidenceVerificationReport {
  return {
    verdict,
    findings: [],
    evidence: [],
    observationsEvaluated: 1,
    passed: verdict === "PASS" ? 1 : 0,
    warnings: verdict === "WARN" ? 1 : 0,
    failures: verdict === "FAIL" ? 1 : 0,
  };
}

function contract(
  verdict: VerificationReport["verdict"],
): VerificationReport {
  return {
    verdict,
    findings: [],
    observationsEvaluated: 1,
    passed: verdict === "PASS" ? 1 : 0,
    warnings: verdict === "WARN" ? 1 : 0,
    failures: verdict === "FAIL" ? 1 : 0,
  };
}

const GENERATED_AT =
  "2026-08-29T10:00:00.000Z";

test("builds PASS assurance for successful execution", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-001",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",
    executionFailed: false,

    recovery: {
      attempts: 1,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "PASS");
  assert.equal(artifact.status, "COMPLETED");
  assert.equal(
    artifact.recovery.status,
    "NOT_REQUIRED",
  );
  assert.deepEqual(
    artifact.failureReasons,
    [],
  );
  assert.equal(
    artifact.generatedAt,
    GENERATED_AT,
  );
});

test("builds RECOVERED assurance after a successful retry", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-002",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",
    executionFailed: false,

    recovery: {
      attempts: 2,
      retries: 1,
      recovered: true,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "PASS");
  assert.equal(artifact.status, "RECOVERED");
  assert.equal(
    artifact.recovery.status,
    "RECOVERED",
  );
  assert.equal(
    artifact.recovery.attempts,
    2,
  );
  assert.equal(
    artifact.recovery.retries,
    1,
  );
});

test("builds FAIL assurance when recovery is exhausted", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-003",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",
    executionFailed: true,

    recovery: {
      attempts: 3,
      retries: 2,
      recovered: false,
      exhausted: true,
      maxRetries: 2,
    },

    evidenceReport: evidence("FAIL"),
    contractReport: contract("FAIL"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.status, "EXHAUSTED");
  assert.equal(
    artifact.recovery.status,
    "EXHAUSTED",
  );
  assert.equal(
    artifact.recovery.attempts,
    3,
  );
  assert.equal(
    artifact.recovery.retries,
    2,
  );
  assert.ok(
    artifact.failureReasons.length > 0,
  );
});

test("policy BLOCK produces BLOCKED assurance", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-004",
    contractName: "incident-investigation",
    policyVerdict: "BLOCK",
    executionFailed: true,

    recovery: {
      attempts: 0,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("FAIL"),
    contractReport: contract("FAIL"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.status, "BLOCKED");
  assert.equal(
    artifact.policy.summary,
    "Policy blocked the requested action.",
  );
});

test("WARN assurance includes warning summary", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-warn",
    contractName: "incident-investigation",
    policyVerdict: "APPROVAL_REQUIRED",
    executionFailed: false,

    recovery: {
      attempts: 1,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "WARN");
  assert.equal(artifact.status, "COMPLETED");
  assert.equal(
    artifact.summary,
    "Policy requires human approval before execution.",
  );
  assert.deepEqual(
    artifact.failureReasons,
    [],
  );
});

test("execution failure remains failed even without exhaustion", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-failed",
    contractName: "incident-investigation",
    policyVerdict: "ALLOW",
    executionFailed: true,

    recovery: {
      attempts: 2,
      retries: 1,
      recovered: true,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: GENERATED_AT,
  });

  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.status, "FAILED");
  assert.equal(
    artifact.execution.summary,
    "Execution did not complete successfully.",
  );
  assert.equal(
    artifact.recovery.status,
    "RECOVERED",
  );
  assert.equal(
    artifact.recovery.attempts,
    2,
  );
  assert.equal(
    artifact.recovery.retries,
    1,
  );
});

test("identical inputs produce identical artifacts", () => {
  const input = {
    runId: "run-deterministic",
    contractName: "incident-investigation",
    policyVerdict: "ALLOW" as const,
    executionFailed: false,

    recovery: {
      attempts: 1,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: GENERATED_AT,
  };

  const first =
    buildAssuranceArtifact(input);

  const second =
    buildAssuranceArtifact(input);

  assert.deepEqual(first, second);
});