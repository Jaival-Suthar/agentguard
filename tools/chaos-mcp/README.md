# AgentGuard Chaos MCP

This synthetic MCP server provides deterministic fault injection for the
AgentGuard incident-investigation workflow.

Chaos is a test mechanism, not the product itself.

The server intentionally preserves the same `lookup_incident` tool shape used
by the normal incident MCP server so AgentGuard can observe failures without
changing the declared action identity.

## Fault modes

### Malformed result

```text
CHAOS_MODE=malformed-result