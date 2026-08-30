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
      data: { requestedIncidentId: "INC-042" },
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
                incident_id: "INC-042",
                service: "analytics",
                severity: "high",
                status: "investigating",
                suspected_component: "nightly-worker",
              },
              root_cause_candidate: "nightly-worker",
              root_cause_explanation:
                "Deployment 4c21 increased nightly-worker concurrency to 32 while the analytics database pool remained at 20 connections, causing database connection exhaustion and the observed worker failures.",
            }),
          },
        },
      },
    },
  ];
}

function sandboxOutcome(
  actionEventId: string,
  eventId: string,
  exitCode: number,
): VerificationObservation {
  return {
    kind: "outcome",
    outcomeVerified: true,
    eventId,
    actionEventId,
    data: {
      parsedContent: {
        success: true,
        response: {
          exitCode,
          result:
            exitCode === 0
              ? JSON.stringify({
                  incident: {
                    incident_id: "INC-042",
                    service: "analytics",
                    severity: "high",
                    status: "investigating",
                    suspected_component: "nightly-worker",
                  },
                  root_cause_candidate: "nightly-worker",
                  root_cause_explanation:
                    "Deployment 4c21 increased nightly-worker concurrency to 32 while the analytics database pool remained at 20 connections, causing database connection exhaustion and the observed worker failures.",
                })
              : "python3: analysis failed",
        },
      },
    },
  };
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

test("accepts the nested sandbox incident shape and preserves the causal explanation", () => {
  const observations = goldenPath();
  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "PASS");

  const sandboxOutcome = observations[3];
  assert.equal(sandboxOutcome?.kind, "outcome");

  if (sandboxOutcome?.kind !== "outcome") {
    return;
  }

  const parsedContent = sandboxOutcome.data?.parsedContent as
    | Record<string, unknown>
    | undefined;
  const response = parsedContent?.response as
    | Record<string, unknown>
    | undefined;
  const resultText = response?.result;

  assert.equal(typeof resultText, "string");

  const result = JSON.parse(resultText as string) as Record<string, unknown>;
  const incident = result.incident as Record<string, unknown> | undefined;

  assert.equal(incident?.incident_id, "INC-042");
  assert.equal(incident?.service, "analytics");
  assert.equal(incident?.severity, "high");
  assert.equal(incident?.status, "investigating");
  assert.equal(incident?.suspected_component, "nightly-worker");
  assert.equal(result.root_cause_candidate, "nightly-worker");
  assert.equal(
    result.root_cause_explanation,
    "Deployment 4c21 increased nightly-worker concurrency to 32 while the analytics database pool remained at 20 connections, causing database connection exhaustion and the observed worker failures.",
  );
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
              incident_id: "INC-042",
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            },
            root_cause_candidate: "database",
            root_cause_explanation:
              "Deployment 4c21 increased nightly-worker concurrency to 32 while the analytics database pool remained at 20 connections, causing database connection exhaustion and the observed worker failures.",
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
      finding.message.includes("did not produce a verified successful analysis result"),
    ),
  );
  assert.equal(
    report.evidence.some((item) => item.type === "sandbox_analysis"),
    false,
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
      finding.message.includes(
        "Sandbox execution did not produce a verified successful analysis result",
      ),
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
              incident_id: "INC-999",
              service: "analytics",
              severity: "high",
              status: "investigating",
              suspected_component: "nightly-worker",
            },
            root_cause_candidate: "nightly-worker",
            root_cause_explanation:
              "Deployment 4c21 increased nightly-worker concurrency to 32 while the analytics database pool remained at 20 connections, causing database connection exhaustion and the observed worker failures.",
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
      finding.message.includes("Trusted incident lookup evidence is missing"),
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
        "did not produce a verified successful analysis result",
      ),
    ),
  );
  assert.equal(
    report.evidence.some((item) => item.type === "sandbox_analysis"),
    false,
  );
});

test("allows a failed sandbox attempt to recover on a later retry", () => {
  const observations: VerificationObservation[] = [
    goldenPath()[0]!,
    goldenPath()[1]!,
    {
      kind: "action",
      action: "sandbox:execute",
      eventId: "sandbox-attempt-1",
    },
    sandboxOutcome("sandbox-attempt-1", "sandbox-outcome-1", 2),
    {
      kind: "action",
      action: "sandbox:execute",
      eventId: "sandbox-attempt-2",
    },
    sandboxOutcome("sandbox-attempt-2", "sandbox-outcome-2", 0),
  ];

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "PASS");
  assert.equal(report.failures, 0);
  assert.equal(
    report.evidence.some(
      (item) =>
        item.type === "sandbox_analysis" &&
        item.actionEventId === "sandbox-attempt-2",
    ),
    true,
  );
});

test("does not trust a lookup whose request targets a different incident", () => {
  const observations = goldenPath();
  const mcpAction = observations[0];
  assert.equal(mcpAction?.kind, "action");

  if (mcpAction?.kind === "action") {
    mcpAction.data = { requestedIncidentId: "INC-999" };
  }

  const report = verifyExecutionEvidence(contract, observations, {
    targetIncidentId: "INC-042",
  });

  assert.equal(report.verdict, "FAIL");
  assert.equal(report.evidence.some((item) => item.type === "mcp_incident"), false);
});
