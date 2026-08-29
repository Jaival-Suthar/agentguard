# Architecture

This document describes the current AgentGuard architecture as implemented in the repository.

AgentGuard is not a replacement for TrueForge. TrueForge executes the agent. AgentGuard observes that execution, verifies the result, and turns the verified state into an `AssuranceArtifact`.

## System Overview

```text
TrueForge execution
    ↓
raw TrueForge events
    ↓
TrueForge adapter
    ↓
normalized AgentGuard events
    ↓
policy / contract / recovery / evidence verification
    ↓
AssuranceArtifact
    ↓
live API + SSE
    ↓
Assurance Console
```

## Trust Boundary

The trust boundary is the line between observed execution and verified assurance.

- TrueForge owns the agent loop, tool invocation, and runtime behavior.
- AgentGuard owns the interpretation, verification, and final trust decision.
- The Assurance Console visualizes proof. It does not determine PASS or FAIL.

## Major Layers

### 1. Execution / TrueForge

TrueForge runs the incident-investigation workflow and emits the raw runtime evidence that AgentGuard later consumes.

Relevant entry points:

- `src/trueforge/probe.ts`
- `src/investigator/investigate.ts`
- `src/recovery/execute.ts`

### 2. Event Observation and Normalization

Raw TrueForge records are transformed into AgentGuard execution events by the TrueForge adapter and the event normalization layer.

Relevant code:

- `src/trueforge/adapter.ts`
- `src/events/types.ts`
- `src/events/index.ts`

### 3. Policy

Policy decides whether an observed action is allowed, blocked, or approval-required.

Relevant code:

- `src/policy/evaluate.ts`
- `src/policy/gate.ts`
- `scripts/verify-policy.ts`

### 4. Execution Contracts

Execution contracts define what the verifier expects the runtime to do.

Relevant code:

- `src/contract/loader.ts`
- `src/contract/types.ts`
- `contracts/incident-investigation.yaml`
- `npm run verify:real-mcp`

### 5. Chaos

The chaos MCP server provides a failure-oriented path for the recovery demo.

Relevant code:

- `tools/chaos-mcp/`
- `scripts/verify-chaos-mcp.ts`
- `scripts/verify-recovery-chaos.ts`

### 6. Recovery

Recovery retries failed work in a deterministic, contract-aware way.

Relevant code:

- `src/recovery/execute.ts`
- `src/recovery/index.ts`
- `src/recovery/types.ts`

### 7. Evidence

Evidence verification correlates tool calls with tool results and checks that the facts came from the runtime, not from the model narrative.

Relevant code:

- `src/verifier/evidence.ts`
- `src/verifier/trueforge-observations.ts`
- `scripts/verify-evidence.ts`

### 8. Deterministic Verification

The contract verifier evaluates normalized observations against the execution contract and emits PASS / WARN / FAIL.

Relevant code:

- `src/verifier/verify.ts`
- `src/verifier/types.ts`
- `scripts/verify-real-mcp.ts`

### 9. `AssuranceArtifact`

The final artifact is assembled from the verified policy, execution, recovery, evidence, and contract checks.

Relevant code:

- `src/assurance/build.ts`
- `src/assurance/types.ts`

### 10. Live API

The live API is implemented in `src/live/server.ts`. It serves run discovery, run snapshots, and SSE updates to the Assurance Console.

Endpoints:

- `GET /healthz`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`

The SSE stream emits:

- `snapshot`
- `event`
- `status`

The browser reconnects through `EventSource`, and the server emits `retry: 3000`.

### 11. Assurance Console

The console lives in `ui/` and renders the live proof surface:

- run discovery
- live selection
- bounded semantic timeline
- proof inspector
- final artifact reconciliation
- connection state

Important: `MODEL_OUTPUT_DELTA` is excluded from the visual timeline. The raw evidence remains on disk, but the UI focuses on semantic milestones.

## Event Flow

```text
TrueForge runtime
    ↓
recorded JSONL
    ↓
normalized execution events
    ↓
policy / evidence / recovery / contract checks
    ↓
AssuranceArtifact
    ↓
live API
    ↓
SSE
    ↓
Assurance Console
```

## Data Boundaries

- `data/runs/` stores raw run metadata and JSONL evidence.
- `data/assurance/` stores generated assurance artifacts.
- The UI renders data from the live API and imported artifacts; it is not the canonical source of truth.

## Console Behavior

The live console intentionally uses a semantic, bounded timeline:

- token-level streaming deltas are excluded
- timeline entries are capped
- the selected proof row shows compact metadata
- timestamps are rendered deterministically in IST

This keeps the proof surface readable without discarding the underlying raw evidence.

## Status Notes

Implemented and verified locally:

- live API
- Assurance Console
- evidence verification
- contract verification
- real incident-investigation workflow

Implemented, but full Docker end-to-end validation is still pending in this documentation pass:

- optional compose-based AgentGuard API / console deployment
- optional compose-based run launcher

See also:

- [README.md](../README.md)
- [docs/evidence-verification.md](evidence-verification.md)
- [docs/contract-verifier.md](contract-verifier.md)
- [docs/trueforge-runtime.md](trueforge-runtime.md)
