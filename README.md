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

## Current phase — Contract Verifier

PR #4 compares observed execution evidence against the declared execution contract and produces deterministic PASS, WARN, or FAIL findings.

It adds:

- runtime-independent verification observations
- deterministic action-policy checks
- approval-required action checks
- denied-action checks
- retry-limit checks
- required-evidence checks
- outcome-verification checks
- event-referenced verification findings
- fixture-based verifier tests

The verifier does not use an LLM as the authority for compliance decisions.

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

See [`docs/contract-verifier.md`](docs/contract-verifier.md) for the verification model and current scope.

## Previous phase — Execution Contract

PR #3 defines a runtime-independent execution contract for the incident-investigation workflow.

It adds:

- a versioned `ExecutionContract` model
- YAML contract loading and validation
- allowed, approval-required, and denied action boundaries
- retry limits
- required verification and evidence rules
- a synthetic incident-investigation contract fixture
- contract validation tests

## Previous phase — Normalized Execution Events

PR #2 converts observed TrueForge runtime events into a stable AgentGuard execution-event model while preserving the original raw event as evidence.
