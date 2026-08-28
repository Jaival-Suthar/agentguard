import test from "node:test";
import assert from "node:assert/strict";
import { loadExecutionContract } from "../../src/contract/index.js";
import { evaluatePolicy } from "../../src/policy/index.js";

const contract = await loadExecutionContract(
  "contracts/incident-investigation.yaml",
);

test("allows explicitly allowed actions", () => {
  const result = evaluatePolicy(
    "mcp:incident.lookup:lookup_incident",
    { contract },
  );

  assert.equal(result.decision, "ALLOW");
  assert.match(result.reason, /permitted/);
});

test("blocks explicitly denied actions", () => {
  const result = evaluatePolicy("host:shell", { contract });

  assert.equal(result.decision, "BLOCK");
  assert.match(result.reason, /forbidden/);
});

test("requires approval for approval-gated actions", () => {
  const result = evaluatePolicy("operation:rollback", { contract });

  assert.equal(result.decision, "APPROVAL_REQUIRED");
});

test("fails closed for undeclared actions", () => {
  const result = evaluatePolicy("mcp:unknown:do_thing", { contract });

  assert.equal(result.decision, "BLOCK");
  assert.match(result.reason, /fails closed/);
});
