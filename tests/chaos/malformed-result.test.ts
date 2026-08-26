import test from "node:test";
import assert from "node:assert/strict";

import { resolveIncidentLookupFromEvents } from "../../src/investigator/report.js";
import { normalizeTrueForgeRecords } from "../../src/trueforge/adapter.js";

test("rejects malformed Chaos MCP tool results as incident evidence", () => {
  const events = normalizeTrueForgeRecords(
    [
      {
        received_at: "2026-08-26T05:29:13.780Z",
        event: {
          id: "message-chaos",
          type: "model.message.delta",
          toolCalls: [
            {
              id: "call-chaos",
              index: 0,
              type: "function",
              toolInfo: {
                type: "truefoundry-system",
                name: "call_tool",
              },
              function: {
                name: "call_tool",
                arguments: JSON.stringify({
                  input: {
                    incident_id: "INC-042",
                  },
                  mcp_server: "incident.lookup.chaos",
                  tool_name: "lookup_incident",
                }),
              },
            },
          ],
        },
      },
      {
        received_at: "2026-08-26T05:29:21.740Z",
        event: {
          id: "tool-response-chaos",
          type: "tool.response",
          toolCallId: "call-chaos",
          threadId: "main",

          // Intentionally malformed JSON (missing closing brace)
          content: "{\"found\":true,\"incident_id\":\"INC-042\"",
        },
      },
    ],
    {
      runId: "chaos-malformed-run",
      sessionId: "session-chaos",
    },
  );

  const resolution = resolveIncidentLookupFromEvents(
    events,
    "INC-042",
    {
      mcpServerName: "incident.lookup.chaos",
      toolName: "lookup_incident",
    },
  );

  assert.equal(resolution.incidentLookupResult, "UNKNOWN");
  assert.equal(resolution.lookupAttempts.length, 0);
  assert.equal(resolution.incidentValue, undefined);
});

test("accepts well-formed Chaos MCP evidence when parsing succeeds", () => {
  const events = normalizeTrueForgeRecords(
    [
      {
        received_at: "2026-08-26T05:29:13.780Z",
        event: {
          id: "message-chaos-success",
          type: "model.message.delta",
          toolCalls: [
            {
              id: "call-chaos-success",
              index: 0,
              type: "function",
              toolInfo: {
                type: "truefoundry-system",
                name: "call_tool",
              },
              function: {
                name: "call_tool",
                arguments: JSON.stringify({
                  input: {
                    incident_id: "INC-042",
                  },
                  mcp_server: "incident.lookup.chaos",
                  tool_name: "lookup_incident",
                }),
              },
            },
          ],
        },
      },
      {
        received_at: "2026-08-26T05:29:21.740Z",
        event: {
          id: "tool-response-chaos-success",
          type: "tool.response",
          toolCallId: "call-chaos-success",
          threadId: "main",
          content: JSON.stringify({
            found: true,
            incident_id: "INC-042",
            service: "analytics",
            severity: "high",
            status: "investigating",
          }),
        },
      },
    ],
    {
      runId: "chaos-success-run",
      sessionId: "session-chaos",
    },
  );

  const resolution = resolveIncidentLookupFromEvents(
    events,
    "INC-042",
    {
      mcpServerName: "incident.lookup.chaos",
      toolName: "lookup_incident",
    },
  );

  assert.equal(resolution.incidentLookupResult, "FOUND");
  assert.equal(resolution.lookupAttempts.length, 1);
  assert.equal(
    resolution.incidentValue?.incident_id,
    "INC-042",
  );
});