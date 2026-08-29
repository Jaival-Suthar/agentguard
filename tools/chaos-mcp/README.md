# AgentGuard Chaos MCP

This synthetic MCP server provides deterministic fault injection for the
AgentGuard incident-investigation workflow.

Chaos is a test mechanism, not the product itself.

The server intentionally preserves the same `lookup_incident` tool shape used
by the normal incident MCP server so AgentGuard can exercise the same action
identity against controlled failures.

## Fault modes

### Malformed result

```text
CHAOS_MODE=malformed-result

### Fail once (Recovery proof)

```text
CHAOS_MODE=fail-once
```

The first lookup returns deliberately malformed JSON. Subsequent lookups return
a complete synthetic incident result so AgentGuard can prove bounded recovery:

```text
malformed evidence -> Recovery retry -> verified incident evidence
```
