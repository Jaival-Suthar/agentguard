import test from "node:test";
import assert from "node:assert/strict";

import { parseExecutionContract } from "../../src/contract/loader.js";
import { verifyExecutionEvidence } from "../../src/verifier/evidence.js";
import type { VerificationObservation } from "../../src/verifier/types.js";

const contract = parseExecutionContract(`
version: 1
name: incident-investigation
actions:
  allow:
    - mcp:incident.lookup:lookup_incident
    - sandbox:execute
  approvalRequired: []
  deny: []
limits:
  maxRetries: 3
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
    - verification
`);

function goldenPath(): VerificationObservation[] {
  return [
    {
      kind: "action",
      action: "mcp:incident.lookup:lookup_incident",
      eventId: "mcp-action",
    },
    {
      kind: "outcome",
      outcomeVerified: true,
      eventId: "mcp-outcome",
      actionEventId: "mcp-action",
      data: {
        parsedContent: {
          found: true,
          incident_id: "INC-042",
          service: "analytics",
          severity: "high",
          status: "investigating",
          suspected_component: "nightly-worker",
        },
      },
    },
    {
      kind: "action",
      action: "sandbox:execute",
      eventId: "sandbox-action",
    },
    {
      kind: "outcome",
      outcomeVerified: true,
      eventId: "sandbox-outcome",
      actionEventId: "sandbox-action",
      data: {
        parsedContent: {
          success: true,
          response: {
            exitCode: 0,
            result: JSON.stringify({
              incident: {
                found: true,
                incident_id: "INC-042",
                service: "analytics",
                severity: "high",
                status: "investigating",
                suspected_component: "nightly-worker",
              },
              root_cause_candidate: "nightly-worker",
            }),
          },
        },
      },
    },
  ];
}

test("passes the real MCP + sandbox evidence chain", () => {
  const report = verifyExecutionEvidence(contract, goldenPath(), {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "PASS");
  assert.equal(report.failures, 0);
  assert.equal(report.evidence.some((item) => item.type === "mcp_incident"), true);
  assert.equal(report.evidence.some((item) => item.type === "sandbox_analysis"), true);
});

test("fails when the sandbox candidate is altered", () => {
  const observations = goldenPath();
  const sandboxOutcome = observations[3];
  assert.equal(sandboxOutcome?.kind, "outcome");

  if (sandboxOutcome?.kind === "outcome") {
    sandboxOutcome.data = {
      ...sandboxOutcome.data,
      parsedContent: {
        success: true,
        response: {
          exitCode: 0,
          result: JSON.stringify({
            incident: {
              found: true,
              incident_id: "INC-042",
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            },
            root_cause_candidate: "database",
          }),
        },
      },
    };
  }

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
  assert.ok(
    report.findings.some((finding) =>
      finding.message.includes("does not match the trusted MCP suspected_component"),
    ),
  );
});

test("fails when an action has no correlated outcome", () => {
  const observations = goldenPath().filter(
    (observation) => observation.eventId !== "sandbox-outcome",
  );

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
  assert.ok(
    report.findings.some((finding) =>
      finding.message.includes("no correlated tool outcome"),
    ),
  );
});

test("fails when MCP and sandbox incident identities disagree", () => {
  const observations = goldenPath();
  const sandboxOutcome = observations[3];
  assert.equal(sandboxOutcome?.kind, "outcome");

  if (sandboxOutcome?.kind === "outcome") {
    const current = sandboxOutcome.data?.parsedContent as Record<string, unknown>;
    const response = current.response as Record<string, unknown>;
    sandboxOutcome.data = {
      ...sandboxOutcome.data,
      parsedContent: {
        ...current,
        response: {
          ...response,
          result: JSON.stringify({
            incident: {
              found: true,
              incident_id: "INC-999",
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            },
            root_cause_candidate: "nightly-worker",
          }),
        },
      },
    };
  }

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
});

test("fails when the trusted MCP result is incomplete", () => {
  const observations = goldenPath();
  const mcpOutcome = observations[1];
  assert.equal(mcpOutcome?.kind, "outcome");

  if (mcpOutcome?.kind === "outcome") {
    mcpOutcome.data = {
      ...mcpOutcome.data,
      parsedContent: {
        found: true,
        incident_id: "INC-042",
        service: "analytics",
      },
    };
  }

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
  assert.ok(
    report.findings.some((finding) =>
      finding.message.includes("missing fields"),
    ),
  );
});


test("fails sandbox evidence when the correlated tool response has a non-zero exit code", () => {
  const observations = goldenPath();
  const sandboxOutcome = observations[3];
  assert.equal(sandboxOutcome?.kind, "outcome");

  if (sandboxOutcome?.kind === "outcome") {
    sandboxOutcome.data = {
      ...sandboxOutcome.data,
      parsedContent: {
        success: true,
        response: {
          exitCode: 2,
          result: "python3: can't open file '/opt/tf/uploads/sandbox-analysis.py'",
        },
      },
    };
  }

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
  assert.ok(
    report.findings.some((finding) =>
      finding.message.includes(
        "did not prove a successful deterministic sandbox execution",
      ),
    ),
  );
  assert.equal(
    report.evidence.some((item) => item.type === "sandbox_analysis"),
    false,
  );
});
