# Evidence Verification

Evidence verification is the AgentGuard trust boundary between a captured TrueForge trajectory and a claim that the execution produced trustworthy evidence.

The verifier does **not** use the model's final narrative as proof.

## Verification chain

```text
TrueForge JSONL
      ↓
normalized observations
      ↓
correlated action → outcome pairs
      ↓
trusted MCP incident evidence
      ↓
deterministic sandbox evidence
      ↓
cross-source consistency checks
      ↓
PASS / WARN / FAIL
```

## What is independently checked

1. Every observed action has an event identity and a correlated tool outcome.
2. The outcome is parseable runtime evidence; an unrelated outcome cannot satisfy an action.
3. The incident lookup must be the exact `incident.lookup:lookup_incident` action.
4. The lookup result must be `found: true` and contain the required incident fields.
5. The returned incident ID must match the requested incident ID.
6. When `root_cause` is required, a successful `sandbox:execute` result must contain an analysis object.
7. The sandbox incident identity must match the trusted MCP incident evidence.
8. `root_cause_candidate` must match `suspected_component` from the trusted MCP result.
9. Required `root_cause` and `verification` evidence must be established from runtime/tool results, never from the model narrative.

## CLI

```text
npm run verify:evidence -- data\\runs\\<run-id>.jsonl INC-042
```

The command exits with code `1` for `FAIL` and `0` for `PASS` or `WARN`.

## Deliberate fail-closed behavior

If an action has no correlated outcome, if the trusted MCP result is incomplete, if the sandbox result is unsuccessful, or if the MCP and sandbox evidence disagree, the report is `FAIL`.

This is intentionally stricter than checking whether the agent *said* that it found a root cause.
