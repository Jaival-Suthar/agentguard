# Execution Contract

## Purpose

PR #3 introduces the first execution contract for AgentGuard.

The contract declares what an agent is allowed to do, what requires human approval, what is forbidden, how many retries are permitted, and what evidence is required before an outcome can be trusted.

This phase defines and validates the contract. It does not yet compare a contract against observed execution events. That is the responsibility of the verifier phase.

## Contract model

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

## Example

See `contracts/incident-investigation.yaml`.

The example intentionally uses synthetic incident-response actions:

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

## Design boundary

The contract is runtime-independent.

TrueForge event names do not appear in the contract. A later verifier will map normalized `ExecutionEvent` semantics to these declared boundaries.

```text
ExecutionContract
       +
ExecutionEvent
       ↓
Future verifier
```

## Validation

The contract loader currently validates:

- supported contract version
- required contract fields
- non-empty action names
- duplicate actions within a policy set
- conflicts between allow, approval-required, and deny sets
- non-negative retry limits
- boolean verification requirement
- required evidence names

The contract remains deliberately small until the verifier phase establishes which semantics need stronger structure.
