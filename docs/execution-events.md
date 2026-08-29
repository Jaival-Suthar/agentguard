# Execution Events

## Purpose

AgentGuard normalizes runtime-specific TrueForge events into a stable execution-event vocabulary.

The goal is not to reproduce the TrueForge event schema. The goal is to provide a small, stable semantic model that downstream AgentGuard components can use for evidence verification, policy evaluation, contract verification, and recovery analysis.

Every normalized event preserves the original runtime record as raw evidence.

---

## Current Semantic Vocabulary

```text
EXECUTION_STARTED
MODEL_OUTPUT_STARTED
MODEL_OUTPUT_DELTA
TOOL_CALL
TOOL_RESULT
EXECUTION_COMPLETED
UNKNOWN
```

These events represent the observable runtime surface.

Higher-level AgentGuard components derive semantic observations from these events, including:

```text
MCP actions
tool outcomes
approvals
retries
sandbox execution
evidence
recovery
```

The distinction is intentional:

```text
Raw runtime event
        ↓
Normalized execution event
        ↓
Derived AgentGuard observation
        ↓
Verification / policy / assurance
```

---

## TrueForge Adapter

The TrueForge adapter translates the actual runtime event stream into AgentGuard semantics.

The adapter handles the live TrueForge MCP representation, including streamed/partial tool-call information and subsequent tool results.

Relevant implementation:

```text
src/trueforge/adapter.ts
```

TrueForge-specific observation extraction is implemented in:

```text
src/verifier/trueforge-observations.ts
```

---

## Raw Evidence Preservation

Every normalized event retains the original runtime event in `raw`.

Conceptually:

```text
{
  type: "TOOL_CALL",
  ...
  raw: <original TrueForge event>
}
```

This provides two important properties:

1. Normalization does not destroy source evidence.
2. Future verification logic can revisit the original runtime payload.

AgentGuard therefore does not depend on the normalized representation as the only source of truth.

---

## Tool Call Correlation

Tool calls and tool results are correlated using the runtime's tool-call identity where available.

For example:

```text
TOOL_CALL
   │
   │ toolCallId = call_123
   ▼
TOOL_RESULT
   │
   │ toolCallId = call_123
   ▼
verified outcome
```

An unrelated tool result must not be treated as the outcome of another invocation.

This distinction is particularly important for:

* retries
* failures
* recovery
* multiple tool calls
* parallel execution

---

## Evidence Flow

```text
TrueForge raw event
        ↓
TrueForge adapter
        ↓
AgentGuard ExecutionEvent
        ↓
derived observation
        ↓
evidence / policy / contract / recovery
        ↓
AssuranceArtifact
```

The event layer itself does not decide whether an execution is trustworthy.

It provides the structured observations required by the deterministic verification layers.

---

## Unknown Events

Runtime events that do not have a stable AgentGuard semantic mapping are preserved as:

```text
UNKNOWN
```

This is intentional.

Unknown runtime information should not silently become a trusted semantic event.

The raw event remains available for inspection and future adapter improvements.

---

## Current TrueForge Evidence

The runtime path currently captures real TrueForge execution evidence including:

```text
turn.created
model.message
model.message.delta
mcp.initialize
tool.response
turn.done
```

These runtime records are retained in the raw JSONL trajectory.

The exact set of runtime event names may evolve with TrueForge. AgentGuard's normalized vocabulary is intended to remain stable across such runtime changes.

---

## Design Boundary

TrueForge owns:

* agent execution
* model interaction
* tool invocation
* runtime lifecycle

AgentGuard owns:

* observation normalization
* evidence interpretation
* verification
* policy evaluation
* assurance

This separation prevents AgentGuard from becoming a replacement for the TrueForge execution harness.
