# Evidence Verification

Evidence verification is the AgentGuard trust boundary between raw TrueForge execution and a claim that the execution produced trustworthy incident evidence.

The verifier does not use the model's final narrative as proof.

## Verification Chain

```text
TrueForge JSONL
    ↓
normalized observations
    ↓
correlated toolCallId pairs
    ↓
trusted MCP incident evidence
    ↓
optional sandbox / recovery evidence
    ↓
cross-source consistency checks
    ↓
PASS / WARN / FAIL
```

## What The Workflow Checks

The implementation in `src/verifier/evidence.ts` and `scripts/verify-evidence.ts` checks that:

1. Observed tool calls and tool results are correlated by `toolCallId`.
2. The incident lookup evidence comes from the exact `incident.lookup:lookup_incident` action.
3. The lookup result must report `found: true` before it is treated as retrieved evidence.
4. A `found: false` result must not fabricate incident facts.
5. The returned incident ID must match the requested incident ID.
6. If sandbox recovery evidence is required, the sandbox result must be independently successful.
7. Required evidence must be established from runtime/tool results, never from the model narrative.

## CLI

```powershell
npm run verify:evidence -- data/runs/<run-id>.jsonl INC-042
```

The command exits with:

- `0` for `PASS` or `WARN`
- `1` for `FAIL`

## Current Behavior

The current repository treats evidence as complete only when the correlated runtime evidence establishes it.

That means:

- the raw JSONL remains the source material
- the model's prose is not trusted as proof
- a target incident is only marked retrieved when the correlated result explicitly says `found: true`
- unrelated tool results are ignored

This is intentionally fail-closed.

