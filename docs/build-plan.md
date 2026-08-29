# AgentGuard Build Plan

## Purpose

AgentGuard is built as a deterministic assurance layer around a real TrueForge agent execution.

The project is intentionally focused on one complete incident-investigation workflow rather than a large collection of partially implemented capabilities.

The core principle is:

```text
TrueForge does the work.
AgentGuard verifies and governs the work.
The Assurance Console shows the proof.
```

## Current Implementation Trajectory

The implementation has progressed through the following capabilities:

```text
Repository foundation
        ↓
TrueForge runtime
        ↓
Execution events
        ↓
Execution contract
        ↓
Deterministic verification
        ↓
Incident investigation
        ↓
Real MCP execution
        ↓
Daytona sandbox execution
        ↓
Evidence verification
        ↓
Policy enforcement
        ↓
Chaos / fault injection
        ↓
Recovery
        ↓
AssuranceArtifact
        ↓
Assurance Console
```

The system is now in the final hardening and demonstration phase.

---

## Completed Capabilities

### 1. Repository Foundation

Established:

* TypeScript project structure
* security boundaries
* test conventions
* Git/Qodo review workflow
* documentation
* local development tooling

`main` is intended to remain the latest reviewed and working state.

### 2. TrueForge Runtime Integration

AgentGuard uses TrueForge as the actual agent execution harness.

The integration supports:

* saved TrueForge agent configuration
* real session creation
* real turn execution
* streamed runtime events
* raw JSONL evidence capture
* real MCP interaction
* Daytona-backed sandbox execution

AgentGuard does not replace the TrueForge runtime.

### 3. Execution Event Model

TrueForge-specific runtime records are normalized into stable AgentGuard execution semantics.

The raw event is retained alongside the normalized representation so that normalization does not destroy source evidence.

Current semantic events include:

```text
EXECUTION_STARTED
MODEL_OUTPUT_STARTED
MODEL_OUTPUT_DELTA
TOOL_CALL
TOOL_RESULT
EXECUTION_COMPLETED
UNKNOWN
```

Higher-level verification logic additionally derives observations for:

```text
actions
approvals
retries
evidence
sandbox execution
recovery
```

### 4. Execution Contract

The incident-investigation contract defines:

* allowed actions
* approval-required actions
* denied actions
* retry limits
* required evidence
* verification requirements

The contract is runtime-independent.

### 5. Deterministic Verification

Observed execution is compared against the contract without asking an LLM to determine whether the execution was trustworthy.

The verifier produces:

```text
PASS
WARN
FAIL
```

with findings tied to observed execution evidence.

### 6. Incident Investigation

The repository contains a real incident-investigation workflow using TrueForge and synthetic incident data.

The workload exercises:

```text
TrueForge
   ↓
MCP
   ↓
incident evidence
   ↓
sandbox analysis
   ↓
verification
```

### 7. Evidence Verification

AgentGuard verifies evidence from runtime observations rather than trusting the model's final narrative.

Important checks include:

* tool-call/result correlation
* requested incident identity
* successful MCP lookup
* sandbox execution success
* evidence completeness
* outcome verification
* rejection of unsupported claims

### 8. Policy Enforcement

AgentGuard evaluates controlled actions before execution and supports:

```text
ALLOW
BLOCK
APPROVAL_REQUIRED
```

The policy layer is intentionally small and deterministic.

### 9. Chaos and Recovery

The chaos MCP harness introduces controlled failures such as:

* timeout
* malformed result
* unavailable/failed tool outcome

The recovery path verifies that:

```text
failure
   ↓
retry/recovery
   ↓
new execution evidence
   ↓
verification
```

A successful recovery must be correlated to the relevant failed attempt rather than merely finding a later successful action with the same name.

### 10. Assurance Artifact

The verified execution is assembled into an `AssuranceArtifact`.

The artifact provides a structured representation of:

* execution
* evidence
* policy decisions
* contract verification
* recovery
* final verdict

The artifact is the source consumed by the Assurance Console.

### 11. Assurance Console

The console provides a focused proof surface for:

* run selection
* semantic execution timeline
* evidence inspection
* recovery state
* policy/verification state
* final assurance verdict

The console does not calculate the truth independently.

---

# Current Golden Path

The intended demonstration path is:

```text
Incident
   ↓
TrueForge agent
   ↓
Real MCP interaction
   ↓
Evidence retrieval
   ↓
Daytona sandbox analysis
   ↓
AgentGuard evidence verification
   ↓
Policy evaluation
   ↓
Proposed action
   ↓
Approval when required
   ↓
Execution
   ↓
Chaos / failure
   ↓
Recovery / retry
   ↓
New evidence
   ↓
Contract verification
   ↓
AssuranceArtifact
   ↓
Assurance Console
   ↓
PASS / WARN / FAIL
```

The exact path used in the final demonstration should remain narrow and reproducible.

---

# Final Hardening

The remaining work is primarily verification and presentation rather than adding another major backend capability.

Final activities:

1. Run the complete test suite.
2. Validate the real TrueForge + MCP + Daytona path.
3. Validate the chaos/recovery path.
4. Generate representative PASS and FAIL assurance artifacts.
5. Review the Assurance Console using real artifacts.
6. Complete documentation.
7. Run Qodo review and resolve findings.
8. Verify the repository from a clean clone.
9. Record the final demonstration.
10. Freeze functionality for submission.

## Explicitly Deferred

The hackathon implementation does not require:

* a second agent runtime
* an adaptive/self-evolving policy system
* automatic policy discovery
* a large policy language
* enterprise-scale deployment
* a large dashboard
* large-scale agent swarms
* broad multi-domain adapters

These remain possible future directions rather than current submission scope.

---

# Git Workflow

Every meaningful implementation capability should follow:

```text
feature branch
    ↓
focused implementation
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
re-test
    ↓
merge
```

`main` should remain the latest reviewed, reproducible, working state.
