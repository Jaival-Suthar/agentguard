import test from "node:test";
import assert from "node:assert/strict";
import { loadExecutionContract, parseExecutionContract } from "../../src/contract/index.js";

test("loads the incident-investigation execution contract", async () => {
  const contract = await loadExecutionContract(
    "contracts/incident-investigation.yaml",
  );

  assert.equal(contract.version, 1);
  assert.equal(contract.name, "incident-investigation");
  assert.deepEqual(contract.actions.allow, [
    "mcp:database.read",
    "mcp:github.read",
    "sandbox:execute",
    "subagent:delegate",
  ]);
  assert.deepEqual(contract.actions.approvalRequired, [
    "mcp:github.write",
    "operation:restart",
    "operation:rollback",
  ]);
  assert.deepEqual(contract.actions.deny, [
    "host:filesystem.read",
    "host:filesystem.write",
    "host:shell",
    "secrets:read",
  ]);
  assert.equal(contract.limits.maxRetries, 3);
  assert.equal(contract.requirements.verificationRequired, true);
  assert.deepEqual(contract.requirements.requiredEvidence, [
    "root_cause",
    "verification",
  ]);
});

test("rejects actions that appear in conflicting policy sets", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 1
name: invalid
actions:
  allow:
    - mcp:database.read
  approvalRequired:
    - mcp:database.read
  deny: []
limits:
  maxRetries: 1
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
`),
    /appears in both allow and approvalRequired/,
  );
});

test("rejects unsupported contract versions", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 2
name: invalid
actions:
  allow:
    - mcp:database.read
  approvalRequired: []
  deny: []
limits:
  maxRetries: 1
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
`),
    /Unsupported execution contract version: 2/,
  );
});
