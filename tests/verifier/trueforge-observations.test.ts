import test from "node:test";
import assert from "node:assert/strict";

import {
  loadTrueForgeObservations,
  normalizeTrueForgeObservations,
} from "../../src/verifier/trueforge-observations.js";

test(
  "extracts the real MCP action and verified outcome from TrueForge evidence",
  async () => {
    const observations =
      await loadTrueForgeObservations(
        "tests/fixtures/inc-042-mcp-events.json",
      );

    assert.equal(
      observations.length,
      2,
    );

    assert.equal(
      observations[0]?.kind,
      "action",
    );

    assert.equal(
      observations[0]?.action,
      "mcp:incident.lookup:lookup_incident",
    );

    assert.equal(
      observations[0]?.eventId,
      "01m0sta2ssft3tvj9mxfc6javb",
    );

    assert.equal(
      observations[1]?.kind,
      "outcome",
    );

    assert.equal(
      observations[1]?.outcomeVerified,
      true,
    );

    assert.equal(
      observations[1]?.actionEventId,
      "01m0sta2ssft3tvj9mxfc6javb",
    );
  },
);

test(
  "extracts the live delta-shaped MCP action from TrueForge evidence",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          id: "message-1",
          type:
            "model.message.delta",

          toolCalls: [
            {
              index: 0,
              id: "call_276839",
              type: "function",

              toolInfo: {
                type:
                  "truefoundry-system",

                name:
                  "call_tool",
              },

              function: {
                name:
                  "call_tool",

                arguments: "",
              },
            },
          ],
        },

        {
          id: "message-1",
          type:
            "model.message.delta",

          toolCalls: [
            {
              index: 0,

              function: {
                arguments:
                  '{"input":{"incident_id":"INC-042"},"mcp_server":"incident.lookup","tool_name":"lookup_incident"}',
              },
            },
          ],
        },
      ]);

    assert.equal(
      observations.length,
      1,
    );

    assert.equal(
      observations[0]?.kind,
      "action",
    );

    assert.equal(
      observations[0]?.action,
      "mcp:incident.lookup:lookup_incident",
    );

    assert.equal(
      observations[0]?.eventId,
      "message-1",
    );
  },
);

test(
  "normalizes malformed MCP results as an unverified outcome",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          id:
            "message-chaos",

          type:
            "model.message.delta",

          toolCalls: [
            {
              id:
                "call-chaos",

              index: 0,

              type: "function",

              function: {
                name:
                  "call_tool",

                arguments:
                  JSON.stringify({
                    input: {
                      incident_id:
                        "INC-042",
                    },

                    mcp_server:
                      "incident.lookup.chaos",

                    tool_name:
                      "lookup_incident",
                  }),
              },
            },
          ],
        },

        {
          id:
            "tool-response-chaos",

          type:
            "tool.response",

          toolCallId:
            "call-chaos",

          content:
            '{"found":true,"incident_id":"INC-042"',
        },
      ]);

    assert.equal(
      observations.length,
      2,
    );

    assert.equal(
      observations[0]?.kind,
      "action",
    );

    assert.equal(
      observations[0]?.action,
      "mcp:incident.lookup.chaos:lookup_incident",
    );

    assert.equal(
      observations[1]?.kind,
      "outcome",
    );

    assert.equal(
      observations[1]?.outcomeVerified,
      false,
    );

    assert.equal(
      observations[1]?.actionEventId,
      "message-chaos",
    );
  },
);

test(
  "normalizes a structured TrueForge tool error as a verified outcome",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          id:
            "message-chaos-error",

          type:
            "model.message.delta",

          toolCalls: [
            {
              id:
                "call-chaos-error",

              index: 0,

              type: "function",

              function: {
                name:
                  "call_tool",

                arguments:
                  JSON.stringify({
                    input: {
                      incident_id:
                        "INC-042",
                    },

                    mcp_server:
                      "incident.lookup.chaos",

                    tool_name:
                      "lookup_incident",
                  }),
              },
            },
          ],
        },

        {
          id:
            "tool-response-chaos-error",

          type:
            "tool.response",

          toolCallId:
            "call-chaos-error",

          content:
            JSON.stringify({
              error: [
                {
                  type: "text",

                  text:
                    "{\"error\":\"Failed to execute Chaos MCP tool.\"}",
                },
              ],
            }),
        },
      ]);

    assert.equal(
      observations.length,
      2,
    );

    assert.equal(
      observations[0]?.kind,
      "action",
    );

    assert.equal(
      observations[0]?.action,
      "mcp:incident.lookup.chaos:lookup_incident",
    );

    assert.equal(
      observations[1]?.kind,
      "outcome",
    );

    assert.equal(
      observations[1]?.outcomeVerified,
      true,
    );

    assert.equal(
      observations[1]?.actionEventId,
      "message-chaos-error",
    );
  },
);

test(
  "normalizes the Chaos timeout error as a verified outcome",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          id:
            "message-chaos-timeout",

          type:
            "model.message.delta",

          toolCalls: [
            {
              id:
                "call-chaos-timeout",

              index: 0,

              type: "function",

              function: {
                name:
                  "call_tool",

                arguments:
                  JSON.stringify({
                    input: {
                      incident_id:
                        "INC-042",
                    },

                    mcp_server:
                      "incident.lookup.chaos",

                    tool_name:
                      "lookup_incident",
                  }),
              },
            },
          ],
        },

        {
          id:
            "tool-response-chaos-timeout",

          type:
            "tool.response",

          toolCallId:
            "call-chaos-timeout",

          content:
            JSON.stringify({
              error: [
                {
                  type: "text",

                  text:
                    "Chaos MCP timeout injected for incident INC-042",
                },
              ],
            }),
        },
      ]);

    assert.equal(
      observations.length,
      2,
    );

    assert.equal(
      observations[0]?.kind,
      "action",
    );

    assert.equal(
      observations[0]?.action,
      "mcp:incident.lookup.chaos:lookup_incident",
    );

    assert.equal(
      observations[1]?.kind,
      "outcome",
    );

    assert.equal(
      observations[1]?.outcomeVerified,
      true,
    );

    assert.equal(
      observations[1]?.actionEventId,
      "message-chaos-timeout",
    );
  },
);

test(
  "does not create an outcome for MCP discovery failures",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          id:
            "message-discovery",

          type:
            "model.message.delta",

          toolCalls: [
            {
              id:
                "call-list-tools",

              index: 0,

              type: "function",

              function: {
                name:
                  "list_tools",

                arguments:
                  '{"mcp_server":"incident.lookup.chaos"}',
              },
            },
          ],
        },

        {
          id:
            "tool-response-discovery",

          type:
            "tool.response",

          toolCallId:
            "call-list-tools",

          content:
            JSON.stringify({
              error: [
                {
                  type: "text",

                  text:
                    "{\"error\":\"Failed to list tools for 'incident.lookup.chaos'.\"}",
                },
              ],
            }),
        },
      ]);

    assert.deepEqual(
      observations,
      [],
    );
  },
);

test(
  "does not merge an unindexed continuation into another tool call by position",
  () => {
    const observations =
      normalizeTrueForgeObservations([
        {
          type:
            "model.message.delta",

          id:
            "message-multi",

          toolCalls: [
            {
              id: "call-a",

              index: 0,

              type: "function",

              function: {
                name:
                  "call_tool",

                arguments: "",
              },
            },

            {
              id: "call-b",

              index: 1,

              type: "function",

              function: {
                name:
                  "call_tool",

                arguments: "",
              },
            },
          ],
        },

        {
          type:
            "model.message.delta",

          id:
            "message-multi",

          toolCalls: [
            {
              function: {
                arguments:
                  '{"input":{"incident_id":"INC-042"},"mcp_server":"incident.lookup","tool_name":"lookup_incident"}',
              },
            },
          ],
        },
      ]);

    assert.deepEqual(
      observations,
      [],
    );
  },
);

test(
  "extracts sandbox exec as an AgentGuard action and correlates its outcome",
  () => {
    const observations = normalizeTrueForgeObservations([
      {
        id: "sandbox-message-1",
        type: "model.message.delta",
        toolCalls: [
          {
            id: "sandbox-call-1",
            index: 0,
            type: "function",
            function: {
              name: "exec",
              arguments: JSON.stringify({
                intent: "Validate incident evidence deterministically",
                command: "python analysis.py",
              }),
            },
          },
        ],
      },
      {
        id: "sandbox-response-1",
        type: "tool.response",
        toolCallId: "sandbox-call-1",
        content: JSON.stringify({
          success: true,
          response: { exitCode: 0, result: '{"root_cause_candidate":"nightly-worker"}' },
        }),
      },
    ]);

    assert.equal(observations.length, 2);
    assert.equal(observations[0]?.kind, "action");
    assert.equal(observations[0]?.action, "sandbox:execute");
    assert.equal(observations[0]?.eventId, "sandbox-message-1");
    assert.equal(observations[1]?.kind, "outcome");
    assert.equal(observations[1]?.outcomeVerified, true);
    assert.equal(observations[1]?.actionEventId, "sandbox-message-1");
  },
);

test(
  "preserves the requested incident ID from MCP tool arguments",
  () => {
    const observations = normalizeTrueForgeObservations([
      {
        id: "message-requested-incident",
        type: "model.message.delta",
        toolCalls: [
          {
            id: "call-requested-incident",
            index: 0,
            type: "function",
            function: {
              name: "call_tool",
              arguments: JSON.stringify({
                input: { incident_id: "INC-042" },
                mcp_server: "incident.lookup",
                tool_name: "lookup_incident",
              }),
            },
          },
        ],
      },
    ]);

    assert.equal(observations.length, 1);
    assert.deepEqual(observations[0]?.data, {
      requestedIncidentId: "INC-042",
    });
  },
);

test(
  "does not merge distinct ID-less provider events at the same index",
  () => {
    const observations = normalizeTrueForgeObservations([
      {
        type: "model.message.delta",
        toolCalls: [
          {
            index: 0,
            type: "function",
            function: {
              name: "exec",
              arguments: JSON.stringify({
                command: "python analysis-a.py",
              }),
            },
          },
        ],
      },
      {
        type: "model.message.delta",
        toolCalls: [
          {
            index: 0,
            type: "function",
            function: {
              name: "exec",
              arguments: JSON.stringify({
                command: "python analysis-b.py",
              }),
            },
          },
        ],
      },
    ]);

    assert.equal(observations.length, 2);
    assert.equal(observations[0]?.kind, "action");
    assert.equal(observations[1]?.kind, "action");
    assert.equal(observations[0]?.action, "sandbox:execute");
    assert.equal(observations[1]?.action, "sandbox:execute");
  },
);
