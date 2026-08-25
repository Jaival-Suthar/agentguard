# AgentGuard

Runtime assurance for autonomous agents.

AgentGuard verifies whether an agent's observed execution stayed within a declared execution contract, recovered from failures, preserved required policy boundaries, and produced sufficient evidence to trust the outcome.

## Hackathon implementation

The first implementation uses TrueForge as the execution runtime and an incident-investigation workflow as the demonstration workload.

```text
TrueForge
    ↓
TrueForge Adapter
    ↓
Normalized Execution Events
    ↓
AgentGuard Core
    ├── Contract
    ├── Verification
    ├── Recovery Analysis
    ├── Evidence
    └── Reporting
```

TrueForge is the execution substrate. AgentGuard is the assurance layer.

## Development principles

- Security first: run the experimental stack in an isolated environment.
- Least privilege: use synthetic data and avoid host credentials/files.
- TrueForge must perform real work; AgentGuard must independently verify the execution.
- `main` contains reviewed, working code.
- Each coherent phase is developed on a branch and merged through a pull request.
- Qodo review is part of the development workflow.

## Current status

The repository foundation, TrueForge runtime proof, normalized execution events, and execution contract phases are complete. AgentGuard now applies the declared contract to observed execution evidence through a deterministic verifier.

## Real TrueForge path

The current golden-path branch uses:

- Ollama as the local model provider
- `ollama/qwen-3-8b` as the tested local model
- TrueForge as the execution harness
- the synthetic `incident.lookup` MCP server for incident lookup

Configure the investigator with:

- `TRUEFORGE_BASE_URL=http://localhost:8791`
- `TRUEFORGE_MODEL_NAME=ollama/qwen-3-8b`
- `TRUEFORGE_AGENT_NAME=<the TrueForge incident-investigator agent name>`

Run the incident investigation with:

```text
npm run investigate:incident
```

The run emits raw TrueForge JSONL evidence under `data/runs/`, including the real MCP interaction. Verify the exact trajectory produced by that run by passing its JSONL file to the deterministic verifier:

```text
npm run verify:real-mcp -- data\runs\<run-id>.jsonl
The verifier consumes the exact JSONL trajectory produced by the investigation run.

## Planned phases

1. Repository foundation and secure local environment
2. TrueForge runtime proof
3. Normalized execution events
4. Execution contract and verifier
5. Incident-investigation scenario
6. Chaos MCP
7. Recovery analysis
8. Assurance scoring and reports
9. Final hardening and demo

## Security

Do not provide the agent access to your personal filesystem, SSH keys, browser profiles, cloud credentials, `.env` files, or other sensitive host data.

The initial environment is intended for local experimentation only. Keep local TrueForge bound to localhost unless a deliberate authenticated deployment is configured.

## Current phase — Real TrueForge Golden Path

PR #6 proves the real TrueForge incident-investigation golden path with Ollama, MCP evidence capture, normalized tool-call correlation, evidence-derived reporting, and deterministic verification of the captured runtime trajectory.

The golden path is:

```text
Real TrueForge Runtime
        ↓
Raw JSONL Evidence
        ↓
Normalized Execution Events
        ↓
Evidence Correlation
        ↓
Incident Investigation Report
        ↓
Deterministic Contract Verification
        ↓
PASS / WARN / FAIL

See [`docs/contract-verifier.md`](docs/contract-verifier.md) for the verification model and current scope.

### Evidence boundary

AgentGuard does not treat the model's final narrative as proof of execution.

The investigation produces raw TrueForge runtime evidence first. AgentGuard then derives normalized execution observations and incident facts from the observed tool-call and tool-result trajectory.

The deterministic verifier evaluates those observations against the declared execution contract.

Model narrative
      ≠
Execution evidence

Raw runtime evidence
      ↓
Normalized observations
      ↓
Deterministic verification

## Previous phase — Incident Investigation

PR #5 adds the first end-to-end incident-investigation workload using TrueForge.

It adds:
- incident investigator workflow
- synthetic incident MCP integration
- evidence capture
- evidence-derived investigation reporting
- real tool-call correlation
- local execution support

## Current phase — Real TrueForge Golden Path

PR #6 proves the incident-investigation workflow against a real local execution stack.

It uses:
- Ollama / qwen3:8b
- TrueForge
- the synthetic incident.lookup MCP server
- real MCP tool execution
- captured TrueForge JSONL evidence
- deterministic AgentGuard verification

The golden path has been verified end-to-end:

TrueForge execution
    ↓
incident.lookup
    ↓
lookup_incident(INC-042)
    ↓
real tool response
    ↓
raw evidence
    ↓
normalized observation
    ↓
execution contract
    ↓
PASS