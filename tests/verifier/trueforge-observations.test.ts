import test from "node:test";
import assert from "node:assert/strict";

import { loadTrueForgeObservations } from "../../src/verifier/trueforge-observations.js";

test("extracts the real MCP action from TrueForge evidence", async () => {
  const observations = await loadTrueForgeObservations(
    "data/runs/inc-042-mcp-events.json",
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