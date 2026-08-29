# AgentGuard

AgentGuard is an assurance and verification layer for agentic execution. TrueForge runs the agent; AgentGuard determines whether the resulting execution can be trusted; the Assurance Console makes that proof visible.

This repository implements a real, end-to-end trust boundary for observed agent execution. It captures raw TrueForge evidence, normalizes the runtime events, verifies policy and evidence, builds an authoritative `AssuranceArtifact`, and presents the result in a live console.

## Why AgentGuard?

Agent runtimes can execute tool calls, sandbox actions, and retries that look successful at a glance but are not actually trustworthy.

AgentGuard exists to answer a narrower question:

- Did the execution really happen?
- Were the right actions observed?
- Did the required evidence and contract checks pass?
- Can the final verdict be trusted without relying on model prose?

TrueForge remains the execution engine. AgentGuard is the verification layer. The console is only a proof surface.

## Screenshots

No screenshot assets are currently checked in.

If you add captures later, place them under `docs/screenshots/` and link them here. Suggested views:

- Placeholder: Assurance Console overview
- Placeholder: live run timeline
- Placeholder: recovery / verification state
- Placeholder: final PASS / FAIL verdict

## Core Idea / Trust Boundary

```text
TrueForge runs the agent
        │
        │ execution/runtime events
        ▼
AgentGuard observes and verifies
        │
        ├─ event normalization
        ├─ policy enforcement
        ├─ contract verification
        ├─ chaos / recovery analysis
        ├─ evidence verification
        └─ assurance artifact creation
        │
        ▼
AssuranceArtifact
        │
        ▼
Assurance Console visualizes proof
```

The UI is not the source of truth. The final assurance result comes from AgentGuard and the `AssuranceArtifact`.

## Architecture

The detailed architecture reference lives in [docs/architecture.md](docs/architecture.md).

At a high level, the repository is organized around these layers:

1. Execution via TrueForge
2. Event observation and normalization
3. Policy evaluation
4. Execution contracts
5. Chaos / failure handling
6. Recovery
7. Evidence verification
8. Deterministic verification
9. `AssuranceArtifact` creation
10. Live API
11. SSE stream delivery
12. Assurance Console rendering

## How The System Works

1. TrueForge executes the incident-investigation workflow.
2. AgentGuard records the raw runtime trajectory in `data/runs/`.
3. The TrueForge adapter normalizes the observed events into AgentGuard runtime semantics.
4. Policy, recovery, evidence, and contract verification run against the normalized observations.
5. AgentGuard produces an authoritative `AssuranceArtifact` in `data/assurance/`.
6. The live API serves run snapshots and SSE updates.
7. The Assurance Console renders a bounded semantic timeline, a proof inspector, and the final verdict.

## Assurance Pipeline

| Stage | Responsibility | Source of truth |
| --- | --- | --- |
| Execution | TrueForge performs the work | TrueForge runtime and raw JSONL evidence |
| Observation | AgentGuard records and normalizes runtime events | `src/trueforge/adapter.ts`, `src/events/` |
| Policy | Allowed / blocked / approval-required actions | `src/policy/` and `scripts/verify-policy.ts` |
| Recovery | Retry and failure handling | `src/recovery/` and `scripts/verify-recovery-chaos.ts` |
| Evidence | Correlated tool-call and tool-result evidence | `src/verifier/evidence.ts` and `scripts/verify-evidence.ts` |
| Contracts | Deterministic execution-contract verification | `src/verifier/verify.ts` and `npm run verify:real-mcp` |
| Assurance | Final verdict and summary | `src/assurance/` |
| Visualization | Live inspection of proof | `ui/` |

## Live Assurance Console

The live console is implemented in `ui/` and consumes the AgentGuard live API.

It provides:

- run discovery from the live API
- live run selection
- SSE-backed updates
- a bounded semantic timeline
- proof inspection for the selected row
- final artifact reconciliation when the authoritative artifact appears
- live connection state feedback
- a light audit-console theme

Important implementation details:

- `MODEL_OUTPUT_DELTA` events are intentionally excluded from the visual timeline.
- The raw run data remains available on disk; only the timeline presentation is semantic and bounded.
- Timestamps are preserved from the source event data and rendered as `DD MMM YYYY · HH:mm:ss.SSS IST`.
- The console does not compute PASS / FAIL itself. It renders the `AssuranceArtifact`.

## Repository Structure

```text
src/
  assurance/              Final assurance artifact assembly
  contract/               Execution contract loading and types
  events/                 Normalized execution event types
  investigator/           Incident investigation workflow and reporting
  live/                   Live API, run snapshots, SSE stream, store
  policy/                 Policy evaluation and gate logic
  recovery/               Recovery execution and retry logic
  trueforge/              TrueForge integration, adapter, health, probe
  verifier/               Evidence and contract verification

scripts/                  Verification and runtime helper scripts
tests/                    Automated regression tests
tools/chaos-mcp/          Synthetic Chaos MCP server
tools/incident-mcp/       Synthetic incident MCP server
ui/                       React Assurance Console
data/runs/                Raw run metadata and JSONL evidence
data/assurance/           Generated assurance artifacts
docs/                     Architecture and verification reference docs
docker-compose.assurance.yml  Optional AgentGuard API + UI compose path
Dockerfile.agentguard     Container image for the AgentGuard API
```

## Prerequisites

- Node.js `>=22.14.0` as declared in `package.json`
- npm
- TrueForge access for the real workflow
- Docker and Docker Compose if you want the documented container path

The repository does not require a global TypeScript install. All commands are run through npm scripts.

## Installation

```powershell
npm install
npm install --prefix ui
```

If you are using the real TrueForge Docker path, prepare the upstream TrueForge runtime separately through the scripts under `scripts/`.

## Running Locally

### 1. Start TrueForge

The repository supports the upstream TrueForge runtime in two ways:

- Hosted Docker mode via the helper scripts in `scripts/`
- Upstream standalone mode via `npx @truefoundry/trueforge`

For the repository's golden path, the documented Docker setup uses:

- TrueForge host URL: `http://localhost:8791`
- TrueForge container port: `8790`

### 2. Start the AgentGuard live API

```powershell
npm run api:dev
```

The live API listens on port `8780`.

### 3. Start the Assurance Console

```powershell
npm run ui:dev
```

The Vite dev server listens on `5174` and proxies `/api` to `http://127.0.0.1:8780`.

Open:

```text
http://localhost:5174
```

## Running The Real TrueForge Workflow

Configure the environment from `.env.example`:

- `TRUEFORGE_BASE_URL=http://localhost:8791`
- `TRUEFORGE_MODEL_NAME=<exact provider/model name configured inside TrueForge>`
- `TRUEFORGE_AGENT_NAME=<saved TrueForge incident investigator agent>`
- `TRUEFORGE_INCIDENT_ID=INC-042`
- `TRUEFORGE_MCP_SERVER_NAME=incident.lookup.chaos` for the recovery / chaos path

Then run:

```powershell
npm run investigate:incident
```

That command writes the raw run evidence to `data/runs/<run-id>.jsonl` and the run metadata to `data/runs/<run-id>.json`.

Optional sandbox mode:

```powershell
npm run investigate:incident:sandbox
```

## Running The Live AgentGuard API

```powershell
npm run api:dev
```

Endpoint summary:

- `GET /healthz`
- `GET /api/runs`
- `GET /api/runs/:runId`
- `GET /api/runs/:runId/events`

The SSE endpoint streams `snapshot`, `event`, and `status` messages and reconnects automatically when the browser EventSource reconnects.

## Running The Assurance Console

```powershell
npm run ui:dev
```

For a production build:

```powershell
npm run ui:build
```

The UI renders the live proof surface. It does not decide the verdict on its own.

## Running The Dockerized Path

The repository includes an optional compose path in `docker-compose.assurance.yml`.

Current service names:

- `agentguard-api`
- `assurance-ui`
- `agentguard-runner` with the `run` profile

Commands:

```powershell
npm run docker:assurance:up
npm run docker:assurance:run
npm run docker:assurance:down
```

This path is implemented, but full end-to-end Docker validation is still pending in this documentation pass.

The compose file publishes:

- AgentGuard API on `8780`
- Assurance Console on `5174`

The optional runner uses the host-gateway mapping so the container can reach the host-published TrueForge service through `host.docker.internal:8791`.

## Verification Commands

| Command | What it proves |
| --- | --- |
| `npm test` | Runs the full automated test suite. At the time of this doc pass, it passed with 103 tests. |
| `npm run typecheck` | Type-checks the repository TypeScript sources. |
| `npm run ui:typecheck` | Type-checks the React Assurance Console. |
| `npm run ui:build` | Builds the Assurance Console for production. |
| `npm run trueforge:health` | Confirms the configured TrueForge base URL is reachable. |
| `npm run trueforge:probe` | Streams a real TrueForge turn and records raw evidence. |
| `npm run investigate:incident` | Runs the live incident-investigation workflow. |
| `npm run verify:real-mcp -- data/runs/<run-id>.jsonl` | Verifies the real MCP trajectory from a captured run. |
| `npm run verify:evidence -- data/runs/<run-id>.jsonl INC-042` | Verifies the evidence chain for the target incident. |
| `npm run verify:policy` | Exercises the policy gate against the execution contract. |
| `npm run verify:recovery-chaos` | Runs the real recovery / chaos verification workflow. |
| `npm run assurance:export -- data/runs/<run-id>.jsonl` | Converts a captured run into an assurance artifact. |

## Evidence And `AssuranceArtifact`

Raw evidence lives in `data/runs/`. Final authoritative assurance output lives in `data/assurance/`.

The `AssuranceArtifact` contains:

- `version`
- `runId`
- `contract`
- `incidentId?`
- `status`
- `verdict`
- `policy`
- `execution`
- `recovery`
- `evidence`
- `contractVerification`
- `summary`
- `failureReasons`
- `generatedAt`

The artifact is the authoritative summary of the AgentGuard assurance decision for a completed run.

## Golden Path Demo

The evaluator should see:

1. TrueForge executes the incident-investigation workflow.
2. AgentGuard captures and normalizes the real execution evidence.
3. Policy, recovery, evidence, and contract checks run against observed events.
4. The Assurance Console shows a semantic timeline rather than token-level streaming noise.
5. The selected row reveals compact proof metadata.
6. The final `AssuranceArtifact` drives the PASS / FAIL verdict.

Demo story:

```text
TrueForge → execution
AgentGuard → verification
Assurance Console → proof
```

Failure / recovery story:

```text
Chaos → failure → recovery → retry → verification → final verdict
```

## Security Model

See [SECURITY.md](SECURITY.md) for the full security guidance.

Short version:

- keep the experiment isolated
- use synthetic data only
- do not mount personal home directories into containers
- do not expose credentials or `.env` files to agent-facing processes
- treat the UI as untrusted for verdict decisions
- keep the trust boundary in AgentGuard and the `AssuranceArtifact`

## Qodo AI-Assisted Development and Review

Qodo AI was used throughout the development of AgentGuard, from the beginning of the implementation through the final engineering passes, as an AI-assisted code-quality and review tool.

Qodo was used to help inspect implementation changes, identify potential bugs and regressions early, challenge assumptions, and improve code quality before changes were accepted.

The development workflow treated Qodo feedback as an engineering review input:

```text
Implementation
    ↓
Qodo-assisted review
    ↓
fix findings
    ↓
automated tests
    ↓
runtime verification
    ↓
reviewed commit
```

That review loop supplemented, but did not replace, human engineering judgment, tests, or runtime verification.

## Documentation / Project Status

| Area | Status |
| --- | --- |
| Core AgentGuard pipeline | Implemented and tested |
| Live API and Assurance Console | Implemented and type-checked |
| Real TrueForge incident workflow | Implemented and verified locally |
| Evidence and contract verification | Implemented and tested |
| Dockerized Assurance path | Implemented, but full end-to-end validation is still pending |
| Screenshot assets | Not currently checked in |

## Troubleshooting

- `npm run api:dev` fails to start: check that `data/` exists and that `AGENTGUARD_DATA_DIR` points to the right root.
- The console shows no runs: confirm `npm run api:dev` is running and that `GET /api/runs` returns data.
- The console reconnects repeatedly: check whether the live API is reachable on `8780`.
- `npm run investigate:incident` fails before the first tool call: verify `TRUEFORGE_BASE_URL`, `TRUEFORGE_AGENT_NAME`, and `TRUEFORGE_MODEL_NAME`.
- `npm run trueforge:health` fails: TrueForge is not reachable at the configured base URL.
- `npm run verify:real-mcp` reports `FAIL`: inspect the raw JSONL file to confirm the correlated tool call/result pair.
- The Docker runner cannot reach TrueForge: confirm the host-published TrueForge service and the host-gateway mapping in `docker-compose.assurance.yml`.
- `npm run ui:build` fails: rerun `npm install --prefix ui` and verify the TypeScript toolchain.

## Final Verification Checklist

- [ ] `npm install`
- [ ] `npm install --prefix ui`
- [ ] `npm run typecheck`
- [ ] `npm run ui:typecheck`
- [ ] `npm test`
- [ ] `npm run ui:build`
- [ ] `npm run trueforge:health`
- [ ] `npm run investigate:incident`
- [ ] `npm run verify:real-mcp -- data/runs/<run-id>.jsonl`
- [ ] Select the run in the Assurance Console and confirm the semantic timeline
- [ ] Confirm the final verdict comes from the `AssuranceArtifact`
