import test from "node:test";
import assert from "node:assert/strict";

import { parseExecutionContract } from "../../src/contract/loader.js";
import { executeWithRecovery } from "../../src/recovery/index.js";
import { verifyExecutionEvidence } from "../../src/verifier/evidence.js";
import type { VerificationObservation } from "../../src/verifier/types.js";

const ACTION = "mcp:incident.lookup.chaos:lookup_incident";

const contract = parseExecutionContract(`
version: 1
name: chaos-recovery
actions:
  allow:
    - mcp:incident.lookup.chaos:lookup_incident
  approvalRequired: []
  deny: []
limits:
  maxRetries: 3
requirements:
  verificationRequired: true
  requiredActions:
    - mcp:incident.lookup.chaos:lookup_incident
  requiredEvidence: []
`);

function attemptObservations(
  suffix: string,
  valid: boolean,
): VerificationObservation[] {
  return [
    {
      kind: "action",
      action: ACTION,
      eventId: `action-${suffix}`,
      data: { requestedIncidentId: "INC-042" },
    },
    {
      kind: "outcome",
      outcomeVerified: valid,
      eventId: `outcome-${suffix}`,
      actionEventId: `action-${suffix}`,
      data: valid
        ? {
            parsedContent: {
              found: true,
              incident_id: "INC-042",
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            },
          }
        : {},
    },
  ];
}

test("recovers from a failed Chaos evidence attempt and verifies the retry", async () => {
  const observations: VerificationObservation[] = [];
  let calls = 0;

  const result = await executeWithRecovery(
    contract,
    async () => {
      calls += 1;
      const current = attemptObservations(String(calls), calls === 2);
      observations.push(...current);

      const report = verifyExecutionEvidence(contract, observations.slice(-2), {
        targetIncidentId: "INC-042",
        mcpIncidentAction: ACTION,
        requireSandboxAnalysis: false,
      });

      if (report.verdict !== "PASS") {
        throw new Error(`attempt ${calls} evidence verdict=${report.verdict}`);
      }

      return report;
    },
  );

  assert.equal(calls, 2);
  assert.equal(result.attempts, 2);
  assert.equal(result.retries, 1);
  assert.equal(result.recovered, true);
  assert.equal(result.result.verdict, "PASS");

  const final = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
    mcpIncidentAction: ACTION,
    requireSandboxAnalysis: false,
  });

  assert.equal(final.verdict, "PASS");
  assert.equal(final.failures, 0);
});

test("fails after the contract retry limit is exhausted", async () => {
  let calls = 0;

  await assert.rejects(
    executeWithRecovery(contract, async () => {
      calls += 1;
      throw new Error("Chaos failure");
    }),
    /Recovery exhausted after 4 attempts/,
  );

  assert.equal(calls, 4);
});
