# Security Development Rules

AgentGuard is being developed against an agent runtime that can invoke tools and execute generated code.

## Local development rules

- Use Docker isolation for the experimental stack where practical.
- Use synthetic incident data only.
- Do not mount the host home directory into containers.
- Do not expose SSH keys, browser profiles, cloud credentials, Git credentials, or `.env` files.
- Do not run arbitrary agent-generated commands directly against the Windows host.
- Keep local TrueForge deployments on localhost.
- Use explicit, minimal permissions for MCP tools and sandbox resources.
- Treat human approval as an additional control, not the sole security boundary.

## AgentGuard security goal

AgentGuard should eventually verify execution authority and policy invariants independently of the runtime implementation.

```text
Least privilege
    ↓
Runtime sandbox
    ↓
Human approval
    ↓
Observed execution
    ↓
Independent contract verification
```
