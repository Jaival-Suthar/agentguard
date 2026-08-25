# Execution Events

## Purpose

PR #2 introduces the first normalized execution-event model for AgentGuard using the raw TrueForge evidence captured by the runtime-proof phase.

The goal is not to mirror TrueForge's event schema. The goal is to translate runtime-specific events into stable AgentGuard semantics while preserving the original event as raw evidence.

## Current semantic vocabulary

```text
EXECUTION_STARTED
MODEL_OUTPUT_STARTED
MODEL_OUTPUT_DELTA
TOOL_CALL
TOOL_RESULT
EXECUTION_COMPLETED
UNKNOWN
```

This vocabulary is intentionally small. PR #5 adds the first observed TrueForge MCP tool-call/result mapping from the incident-investigation run. Sandbox execution, approvals, subagents, failures, recovery, and reconnect will be added only after the corresponding TrueForge events are observed in later runtime experiments.

## Data flow

```text
TrueForge raw event
        ↓
TrueForge adapter
        ↓
AgentGuard ExecutionEvent
        ↓
contract / policy / recovery analysis
```

## Preservation rule

Every normalized event retains the original TrueForge event in `raw`.

This ensures that normalization never destroys source evidence and allows future analysis to revisit the exact runtime payload.

## Source evidence

The test fixture under `tests/fixtures/trueforge-runtime.jsonl` is derived from a real successful TrueForge runtime probe captured during PR #2.
