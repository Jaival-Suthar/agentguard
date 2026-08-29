# Execution Contract

## Purpose

An `ExecutionContract` defines the execution boundaries that AgentGuard expects for a controlled agent workflow.

The contract describes:

* allowed actions
* approval-required actions
* denied actions
* retry limits
* evidence requirements
* outcome verification requirements

The contract is evaluated against observed execution evidence by the deterministic verifier.

---

## Contract Model

```text
Execution Contract
├── Actions
│   ├── allowed
│   ├── approval required
│   └── denied
├── Recovery limits
│   └── max retries
└── Evidence requirements
    ├── verification required
    └── required evidence
```

---

## Example Contract

The current example is:

```text
contracts/incident-investigation.yaml
```

It intentionally uses synthetic incident-response actions.

Typical boundaries include:

```text
mcp:database.read       → allowed
mcp:github.read         → allowed
sandbox:execute         → allowed
subagent:delegate       → allowed

mcp:github.write        → approval required
operation:restart       → approval required
operation:rollback      → approval required

host:filesystem.*       → denied
host:shell              → denied
secrets:read            → denied
```

The exact contract file is authoritative for the current implementation.

---

## Contract Semantics

### Allowed

An explicitly allowed action may proceed through the controlled execution path.

```text
action
  ↓
contract
  ↓
ALLOW
```

### Approval Required

An approval-required action must have an observed approval before it can be considered authorized.

```text
action
  ↓
APPROVAL_REQUIRED
  ↓
approval observed?
  ├── yes → permitted
  └── no  → not permitted
```

### Denied

A denied action is a contract violation if observed.

```text
denied action
      ↓
FAIL
```

### Retry Limits

The contract defines the maximum number of retries.

Recovery is not inferred merely because a later action with the same name succeeds.

A recovery must belong to the relevant retry trajectory and occur after the failure.

```text
failure
   ↓
retry attempt
   ↓
verified success
   ↓
recovered
```

Exceeding the configured retry limit produces a verification failure.

---

## Evidence Requirements

Contracts can require evidence before an execution can be trusted.

For example:

```text
required evidence
        +
verification required
        ↓
deterministic verifier
```

The model's final narrative does not satisfy an evidence requirement by itself.

Evidence must be established from observed runtime/tool results.

---

## Runtime Independence

The contract does not contain TrueForge-specific event names.

Instead:

```text
ExecutionContract
       +
normalized observations
       ↓
Deterministic Verifier
```

TrueForge-specific interpretation belongs in the runtime adapter and observation layer.

This keeps the contract independent from the execution harness.

---

## Verification

The contract verifier evaluates observed execution against the contract and produces:

```text
PASS
WARN
FAIL
```

with findings describing the relevant observed condition.

Current verification includes:

* action classification
* approval requirements
* denied actions
* retry limits
* required evidence
* outcome verification
* unclassified actions

---

## Validation

The contract loader validates:

* supported contract version
* required contract fields
* non-empty action names
* duplicate actions within a policy set
* conflicts between allow, approval-required, and deny sets
* non-negative retry limits
* boolean verification requirements
* required evidence names

Relevant implementation:

```text
src/contract/loader.ts
src/contract/types.ts
```

---

## Verification Command

The primary contract verification path is:

```powershell
npm run verify:real-mcp -- data/runs/<run-id>.jsonl
```

Related verification commands include:

```powershell
npm run verify:policy
npm run verify:evidence -- data/runs/<run-id>.jsonl INC-042
npm run verify:recovery-chaos
```

The contract is therefore not documentation-only. It is an executable boundary used by the AgentGuard verification path.
