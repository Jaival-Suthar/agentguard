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

test("builds PASS assurance for successful execution", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-001",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",

    recovery: {
      attempts: 1,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: "2026-08-29T10:00:00.000Z",
  });

  assert.equal(artifact.verdict, "PASS");
  assert.equal(artifact.status, "COMPLETED");
  assert.equal(artifact.recovery.status, "NOT_REQUIRED");
  assert.deepEqual(artifact.failureReasons, []);
});

test("builds RECOVERED assurance after a successful retry", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-002",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",

    recovery: {
      attempts: 2,
      retries: 1,
      recovered: true,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("PASS"),
    contractReport: contract("PASS"),

    generatedAt: "2026-08-29T10:00:00.000Z",
  });

  assert.equal(artifact.verdict, "PASS");
  assert.equal(artifact.status, "RECOVERED");
  assert.equal(artifact.recovery.status, "RECOVERED");
  assert.equal(artifact.recovery.attempts, 2);
  assert.equal(artifact.recovery.retries, 1);
});

test("builds FAIL assurance when recovery is exhausted", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-003",
    contractName: "incident-investigation",
    incidentId: "INC-042",
    policyVerdict: "ALLOW",

    recovery: {
      attempts: 3,
      retries: 2,
      recovered: false,
      exhausted: true,
      maxRetries: 2,
    },

    evidenceReport: evidence("FAIL"),
    contractReport: contract("FAIL"),

    generatedAt: "2026-08-29T10:00:00.000Z",
  });

  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.status, "EXHAUSTED");
  assert.equal(artifact.recovery.status, "EXHAUSTED");
  assert.ok(artifact.failureReasons.length > 0);
});

test("policy BLOCK produces BLOCKED assurance", () => {
  const artifact = buildAssuranceArtifact({
    runId: "run-004",
    contractName: "incident-investigation",
    policyVerdict: "BLOCK",

    recovery: {
      attempts: 0,
      retries: 0,
      recovered: false,
      exhausted: false,
      maxRetries: 2,
    },

    evidenceReport: evidence("FAIL"),
    contractReport: contract("FAIL"),

    generatedAt: "2026-08-29T10:00:00.000Z",
  });

  assert.equal(artifact.verdict, "FAIL");
  assert.equal(artifact.status, "BLOCKED");
  assert.equal(
    artifact.policy.summary,
    "Policy blocked the requested action.",
  );
});