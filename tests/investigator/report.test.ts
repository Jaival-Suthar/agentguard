import test from "node:test";
import assert from "node:assert/strict";

import {
  buildInvestigationReport,
  resolveIncidentLookupFromEvents,
} from "../../src/investigator/report.js";
import type { ExecutionEvent } from "../../src/events/types.js";

function makeToolCallEvent(
  toolCallId: string,
  incidentId: string,
): ExecutionEvent {
  return {
    id: `run:${toolCallId}:call`,
    runId: "run-1",
    source: "trueforge",
    type: "TOOL_CALL",
    timestamp: "2026-08-25T08:49:49.231Z",
    receivedAt: "2026-08-25T08:49:49.231Z",
    correlationId: toolCallId,
    data: {
      toolCalls: [
        {
          toolCallId,
          functionName: "call_tool",
          mcpServer: "incident.lookup",
          toolName: "lookup_incident",
          parsedArguments: {
            input: {
              incident_id: incidentId,
            },
          },
        },
      ],
    },
    raw: {},
  };
}

function makeToolResultEvent(
  toolCallId: string,
  parsedContent: Record<string, unknown>,
): ExecutionEvent {
  return {
    id: `run:${toolCallId}:result`,
    runId: "run-1",
    source: "trueforge",
    type: "TOOL_RESULT",
    timestamp: "2026-08-25T08:49:49.256Z",
    receivedAt: "2026-08-25T08:49:49.256Z",
    correlationId: toolCallId,
    data: {
      toolCallId,
      content: JSON.stringify(parsedContent),
      parsedContent,
      threadId: "main",
    },
    raw: {},
  };
}

test("marks a found incident lookup as completed evidence", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "COMPLETED",
    incidentLookupResult: "FOUND",
    rawResponse: "raw agent response",
    incidentValue: {
      found: true,
      incident_id: "INC-042",
      service: "analytics",
      severity: "high",
      status: "investigating",
      suspected_component: "nightly-worker",
    },
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "COMPLETED");
  assert.equal(report.incidentLookupResult, "FOUND");
  assert.equal(report.evidenceRetrieved, true);
  assert.equal(report.incident?.incidentId, "INC-042");
  assert.equal(report.incident?.service, "analytics");
  assert.equal(report.incident?.severity, "high");
  assert.equal(report.incident?.status, "investigating");
  assert.equal(report.incident?.suspectedComponent, "nightly-worker");
  assert.ok(report.knownFacts.includes("Incident ID: INC-042"));
  assert.ok(report.findings.includes("Incident lookup result: FOUND"));
});

test("marks a not-found incident lookup as incomplete without fabricating facts", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-999",
    status: "INCOMPLETE",
    incidentLookupResult: "NOT_FOUND",
    rawResponse: "raw agent response",
    incidentValue: {
      found: false,
      incident_id: "INC-999",
    },
  });

  assert.equal(report.targetIncidentId, "INC-999");
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.incidentLookupResult, "NOT_FOUND");
  assert.equal(report.evidenceRetrieved, false);
  assert.equal(report.incident, undefined);
  assert.equal(report.knownFacts.length, 0);
  assert.ok(report.findings.includes("Incident lookup result: NOT_FOUND"));
  assert.ok(report.findings.includes("Evidence retrieved: NO"));
});

test("marks failures before tool evidence as incomplete without fabricating facts", () => {
  const report = buildInvestigationReport({
    targetIncidentId: "INC-042",
    status: "INCOMPLETE",
    incidentLookupResult: "UNKNOWN",
    rawResponse: "",
  });

  assert.equal(report.targetIncidentId, "INC-042");
  assert.equal(report.status, "INCOMPLETE");
  assert.equal(report.incidentLookupResult, "UNKNOWN");
  assert.equal(report.evidenceRetrieved, false);
  assert.equal(report.incident, undefined);
  assert.equal(report.knownFacts.length, 0);
  assert.equal(report.rawResponse, "");
  assert.ok(report.findings.includes("Evidence retrieved: NO"));
});

test("resolves the target incident from correlated tool results and preserves unrelated failures", () => {
  const resolution = resolveIncidentLookupFromEvents(
    [
      makeToolCallEvent("call_351195", "INC-042"),
      makeToolResultEvent("call_351195", {
        found: true,
        incident_id: "INC-042",
        service: "analytics",
        severity: "high",
        status: "investigating",
        suspected_component: "nightly-worker",
      }),
      makeToolCallEvent("call_219663", "checkout-api"),
      makeToolResultEvent("call_219663", {
        found: false,
        incident_id: "checkout-api",
      }),
    ],
    "INC-042",
  );

  assert.equal(resolution.incidentLookupResult, "FOUND");
  assert.equal(resolution.incidentValue?.incident_id, "INC-042");
  assert.equal(resolution.incidentValue?.service, "analytics");
  assert.equal(resolution.lookupAttempts.length, 2);
  assert.deepEqual(
    resolution.lookupAttempts.map((attempt) => [
      attempt.incidentId,
      attempt.found,
    ]),
    [
      ["INC-042", true],
      ["checkout-api", false],
    ],
  );
});

test("returns not found only when the target incident lookup itself fails", () => {
  const resolution = resolveIncidentLookupFromEvents(
    [
      makeToolCallEvent("call_777777", "INC-042"),
      makeToolResultEvent("call_777777", {
        found: false,
        incident_id: "INC-042",
      }),
      makeToolCallEvent("call_888888", "checkout-api"),
      makeToolResultEvent("call_888888", {
        found: true,
        incident_id: "checkout-api",
      }),
    ],
    "INC-042",
  );

  assert.equal(resolution.incidentLookupResult, "NOT_FOUND");
  assert.equal(resolution.incidentValue, undefined);
  assert.equal(resolution.lookupAttempts.length, 2);
  assert.deepEqual(
    resolution.lookupAttempts.map((attempt) => [
      attempt.incidentId,
      attempt.found,
    ]),
    [
      ["INC-042", false],
      ["checkout-api", true],
    ],
  );
});

test("ignores tool results with unknown toolCallId values", () => {
  const resolution = resolveIncidentLookupFromEvents(
    [
      makeToolCallEvent("call_123456", "INC-042"),
      makeToolResultEvent("call_123456", {
        found: true,
        incident_id: "INC-042",
        service: "analytics",
      }),
      makeToolResultEvent("call_unknown", {
        found: false,
        incident_id: "INC-042",
      }),
    ],
    "INC-042",
  );

  assert.equal(resolution.incidentLookupResult, "FOUND");
  assert.equal(resolution.incidentValue?.incident_id, "INC-042");
  assert.equal(resolution.lookupAttempts.length, 1);
  assert.equal(resolution.lookupAttempts[0]?.toolCallId, "call_123456");
});

test("does not treat an unrelated tool as incident lookup evidence", () => {
  const resolution = resolveIncidentLookupFromEvents(
    [
      {
        ...makeToolCallEvent("call_untrusted", "INC-042"),
        data: {
          toolCalls: [
            {
              toolCallId: "call_untrusted",
              functionName: "call_tool",
              mcpServer: "other.server",
              toolName: "lookup_incident",
              parsedArguments: {
                input: {
                  incident_id: "INC-042",
                },
              },
            },
          ],
        },
      },
      makeToolResultEvent("call_untrusted", {
        found: true,
        incident_id: "INC-042",
        service: "analytics",
      }),
    ],
    "INC-042",
  );

  assert.equal(resolution.incidentLookupResult, "UNKNOWN");
  assert.equal(resolution.incidentValue, undefined);
  assert.equal(resolution.lookupAttempts.length, 0);
});

test("does not treat the wrong tool on incident.lookup as incident lookup evidence", () => {
  const resolution = resolveIncidentLookupFromEvents(
    [
      {
        ...makeToolCallEvent("call_wrong_tool", "INC-042"),
        data: {
          toolCalls: [
            {
              toolCallId: "call_wrong_tool",
              functionName: "call_tool",
              mcpServer: "incident.lookup",
              toolName: "get_tool_info",
              parsedArguments: {
                input: {
                  incident_id: "INC-042",
                },
              },
            },
          ],
        },
      },
      makeToolResultEvent("call_wrong_tool", {
        found: true,
        incident_id: "INC-042",
      }),
    ],
    "INC-042",
  );

  assert.equal(resolution.incidentLookupResult, "UNKNOWN");
  assert.equal(resolution.lookupAttempts.length, 0);
});