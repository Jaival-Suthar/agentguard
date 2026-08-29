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
    "mcp:incident.lookup:lookup_incident",
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
    "mcp:incident.lookup:delete_incident",
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

test("loads required trajectory actions and ordering constraints", async () => {
  const contract = await loadExecutionContract(
    "contracts/incident-investigation.yaml",
  );

  assert.deepEqual(contract.requirements.requiredActions, [
    "mcp:incident.lookup:lookup_incident",
    "sandbox:execute",
  ]);

  assert.deepEqual(contract.ordering.before, [
    {
      action: "mcp:incident.lookup:lookup_incident",
      before: "sandbox:execute",
    },
  ]);
});

test("rejects a required action that is not declared", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 1
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
  requiredActions:
    - mcp:github.read
  requiredEvidence:
    - root_cause
`),
    /Required action "mcp:github.read" must be declared/,
  );
});

test("rejects cyclic ordering constraints", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 1
name: invalid
actions:
  allow:
    - mcp:a
    - mcp:b
  approvalRequired: []
  deny: []
limits:
  maxRetries: 1
requirements:
  verificationRequired: false
  requiredActions:
    - mcp:a
    - mcp:b
  requiredEvidence:
    - root_cause
ordering:
  before:
    - action: mcp:a
      before: mcp:b
    - action: mcp:b
      before: mcp:a
`),
    /ordering.before must not contain cyclic relationships/,
  );
});

test("rejects ordering relationships for undeclared actions", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 1
name: invalid
actions:
  allow:
    - mcp:a
  approvalRequired: []
  deny: []
limits:
  maxRetries: 1
requirements:
  verificationRequired: false
  requiredActions:
    - mcp:a
  requiredEvidence:
    - root_cause
ordering:
  before:
    - action: mcp:a
      before: mcp:b
`),
    /Ordering action "mcp:b" must be declared/,
  );
});


test("rejects a maxRetries value above Number.MAX_SAFE_INTEGER", () => {
  assert.throws(
    () =>
      parseExecutionContract(`
version: 1
name: invalid
actions:
  allow:
    - mcp:database.read
  approvalRequired: []
  deny: []
limits:
  maxRetries: 9007199254740992
requirements:
  verificationRequired: true
  requiredEvidence:
    - root_cause
`),
    /maxRetries must be a non-negative safe integer/,
  );
});
