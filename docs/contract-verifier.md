# Contract Verifier

## Purpose

The contract verifier compares observed execution evidence against an `ExecutionContract` and produces a deterministic PASS, WARN, or FAIL result.

The verifier does not ask an LLM to decide whether an execution is safe.

## Verification Flow

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

## Current Observation Types

The current repository verifies normalized observations for:

- actions
- approvals
- retries
- evidence completeness
- outcome verification

The observation layer is runtime-independent. The concrete runtime mapping lives in `src/verifier/trueforge-observations.ts`.

## Contract Semantics

- `actions.allow` produces a PASS for an observed action.
- `actions.approvalRequired` produces a PASS only when approval is observed.
- `actions.deny` produces a FAIL whenever the denied action is observed.
- `limits.maxRetries` produces a FAIL when the observed retry count exceeds the configured limit.
- `requirements.requiredEvidence` produces a FAIL when required evidence is missing.
- `requirements.verificationRequired` produces a FAIL when the outcome is not verified.
- Actions not explicitly classified by the contract produce WARN rather than being silently accepted.

## CLI

The main verification command is:

```powershell
npm run verify:real-mcp -- data/runs/<run-id>.jsonl
```

That command loads `contracts/incident-investigation.yaml`, normalizes the TrueForge evidence, and prints the deterministic verification result.

Related helpers:

- `npm run verify:policy`
- `npm run verify:evidence -- data/runs/<run-id>.jsonl INC-042`
- `npm run verify:recovery-chaos`

## Scope

This verifier is deliberately strict about the evidence it accepts.

It is designed to verify the current AgentGuard execution contract against the observed runtime, not to infer missing proof from prose or to replace the runtime itself.

