# Contract Verifier

## Purpose

The verifier compares observed execution evidence against an `ExecutionContract` and produces a deterministic PASS, WARN, or FAIL result.

The verifier does not ask an LLM to decide whether an execution is safe.

## Verification flow

```text
Execution Contract
        +
Observed Execution Evidence
        ↓
Deterministic Verifier
        ↓
PASS / WARN / FAIL
        ↓
Findings with event references
```

## Current observation types

The verifier evaluates observations for:

- actions
- approvals
- retries
- evidence completeness
- outcome verification

The observation layer is deliberately runtime-independent. Richer TrueForge event mappings will be introduced as the incident-investigation workflow adds real tool, sandbox, approval, subagent, failure, and recovery events.

## Contract semantics

- `actions.allow` produces a PASS for an observed action.
- `actions.approvalRequired` produces a PASS only when approval is observed.
- `actions.deny` produces a FAIL whenever the denied action is observed.
- `limits.maxRetries` produces a FAIL when the observed retry count exceeds the configured limit.
- `requirements.requiredEvidence` produces a FAIL when required evidence is missing.
- `requirements.verificationRequired` produces a FAIL when the outcome is not verified.
- Actions not explicitly classified by the contract produce WARN rather than being silently accepted.

## Scope

This phase establishes the deterministic verification engine only.

It does not yet implement the complete TrueForge action/event extraction layer, chaos injection, recovery analysis, or scoring/report generation.
