# Build Plan

## Phase 1 — Repository foundation

Establish Git, Qodo, security rules, documentation, and isolated development conventions.

## Phase 2 — TrueForge runtime proof

Prove a real TrueForge execution using:
- MCP
- sandbox execution
- human approval
- subagent delegation
- reconnect/session continuity

Capture the real runtime/event surface before designing the normalized event schema.

## Phase 3 — Execution events

Define the first normalized execution event model and implement the TrueForge adapter.

## Phase 4 — Contract and verifier

Define an implementation-independent execution contract and compare expected behavior against observed events.

## Phase 5 — Incident investigation

Build the narrow end-to-end demonstration workload.

## Phase 6 — Chaos

Start with two faults:
- timeout
- malformed result

Chaos is a test mechanism, not the product itself.

## Phase 7 — Recovery

Measure session survival, retry/recovery behavior, policy preservation, evidence preservation, and outcome completion.

## Phase 8 — Assurance

Produce a defensible JSON/Rich report with observable evidence behind every score.

## Git workflow

```text
feature branch
    ↓
coherent implementation
    ↓
tests
    ↓
commit
    ↓
pull request → main
    ↓
Qodo review
    ↓
fix findings
    ↓
merge
```

`main` should remain the latest reviewed, working state.
