# Security Development Rules

AgentGuard is an assurance layer that observes agent execution. The security boundary matters because the runtime can invoke tools, execute code, and access external services.

## Trust Boundary

```text
TrueForge execution
    ↓
AgentGuard verification
    ↓
authoritative assurance artifact
    ↓
Assurance Console visualization
```

The UI is not trusted to decide PASS or FAIL. The authoritative decision comes from AgentGuard.

## Local Development Rules

- Use isolated local services for the experimental stack.
- Use synthetic incident data only.
- Do not mount the host home directory into containers.
- Do not expose SSH keys, browser profiles, cloud credentials, Git credentials, or `.env` files to agent-facing processes.
- Do not run arbitrary agent-generated commands directly on the Windows host.
- Keep TrueForge bound to the intended localhost / host-published port.
- Use explicit, minimal permissions for MCP tools and sandbox resources.

## Docker Boundaries

The repository includes an optional compose-based AgentGuard API and Assurance Console path.

- `agentguard-api` listens on container port `8780` and is published to the host on `8780`
- `assurance-ui` serves the built console on host port `5174`
- `agentguard-runner` is an optional profile that connects to an already-running TrueForge host service through the host-gateway mapping

The compose path is implemented, but full end-to-end Docker validation is still pending in this documentation pass.

## Secrets And Environment Variables

Environment files are local-only configuration. Never commit real secrets.

The current repository uses:

- `TRUEFORGE_BASE_URL`
- `TRUEFORGE_MODEL_NAME`
- `TRUEFORGE_AGENT_NAME`
- `TRUEFORGE_INCIDENT_ID`
- `TRUEFORGE_MCP_SERVER_NAME`
- `DAYTONA_API_KEY` for sandbox configuration only

The `.env.example` file is a documentation aid, not a secret store.

## Data Boundaries

- `data/runs/` contains raw run metadata and JSONL evidence
- `data/assurance/` contains generated assurance artifacts
- the live console can import artifacts, but the UI is not the source of truth

## Security Goal

AgentGuard should verify execution authority and policy invariants from observed runtime evidence rather than from model narration or UI state.

## Verification Expectation

Any security-sensitive change should be accompanied by:

- automated tests
- deterministic verification
- runtime inspection of the generated evidence

