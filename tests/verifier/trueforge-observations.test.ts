import test from "node:test";
import assert from "node:assert/strict";

import {
  loadTrueForgeObservations,
  normalizeTrueForgeObservations,
} from "../../src/verifier/trueforge-observations.js";

test("extracts the real MCP action from TrueForge evidence", async () => {
  const observations = await loadTrueForgeObservations(
    "tests/fixtures/inc-042-mcp-events.json",
  );

  assert.equal(observations.length, 1);
  assert.equal(observations[0]?.kind, "action");

  assert.equal(
    observations[0]?.action,
    "mcp:incident.lookup:lookup_incident",
  );

  assert.equal(
    observations[0]?.eventId,
    "01m0sta2ssft3tvj9mxfc6javb",
  );
});

test("extracts the live delta-shaped MCP action from TrueForge evidence", () => {
  const observations = normalizeTrueForgeObservations([
    {
      id: "message-1",
      type: "model.message.delta",
      toolCalls: [
        {
          index: 0,
          id: "call_276839",
          type: "function",
          toolInfo: {
            type: "truefoundry-system",
            name: "call_tool",
          },
          function: {
            name: "call_tool",
            arguments: "",
          },
        },
      ],
    },
    {
      id: "message-1",
      type: "model.message.delta",
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

  assert.equal(observations.length, 1);
  assert.equal(
    observations[0]?.action,
    "mcp:incident.lookup:lookup_incident",
  );
  assert.equal(observations[0]?.eventId, "message-1");
});
