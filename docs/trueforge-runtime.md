# TrueForge Runtime

## Purpose

TrueForge is the execution harness used by AgentGuard.

AgentGuard does not replace TrueForge's agent loop. Instead, AgentGuard consumes the real execution trajectory produced by TrueForge and applies deterministic evidence, policy, contract, recovery, and assurance logic around it.

The relationship is:

```text
TrueForge
   ↓
real agent execution
   ↓
MCP / sandbox / runtime events
   ↓
AgentGuard
   ↓
verification + policy + recovery + assurance
```

---

## What AgentGuard Uses TrueForge For

The current integration supports:

* saved agent configuration
* session creation
* real turn execution
* streamed runtime events
* real MCP interaction
* Daytona sandbox execution
* raw JSONL evidence capture
* execution observation
* recovery execution

Relevant entry points include:

```text
src/trueforge/probe.ts
src/trueforge/adapter.ts
src/investigator/investigate.ts
src/recovery/execute.ts
```

---

## Runtime Configuration

The current `.env.example` supports configuration including:

```text
TRUEFORGE_BASE_URL=http://localhost:8791
TRUEFORGE_MODEL_NAME=<configured provider/model>
TRUEFORGE_AGENT_NAME=<saved agent name>
TRUEFORGE_AGENT_INSTRUCTIONS=...
TRUEFORGE_PROMPT=...
TRUEFORGE_INCIDENT_ID=INC-042
TRUEFORGE_MCP_SERVER_NAME=incident.lookup.chaos
DAYTONA_API_KEY=
```

The Daytona API key is required only for the sandbox integration and must not be committed to source control.

Use the least-privileged Daytona credential required by the configured TrueForge sandbox workflow.

---

## TrueForge Docker Runtime

The repository provides helper scripts for a local TrueForge runtime:

```text
scripts/setup-trueforge-docker.ps1
scripts/start-trueforge-docker.ps1
scripts/stop-trueforge-docker.ps1
```

The expected local endpoint is:

```text
http://localhost:8791
```

The TrueForge container listens on its configured internal port while the host-facing endpoint is used by AgentGuard.

---

## Sandbox Provider

TrueForge uses Daytona for sandbox execution in the current AgentGuard path.

The sandbox flow is:

```text
TrueForge
   ↓
Daytona provider
   ↓
TrueForge sandbox image
   ↓
real isolated sandbox
   ↓
code execution
   ↓
result
```

The TrueForge sandbox image is built/registered as part of the configured Daytona provider workflow.

The sandbox is used for deterministic analysis rather than allowing the agent to execute arbitrary analysis directly on the development host.

---

## Incident Investigation

The primary workload is:

```powershell
npm run investigate:incident
```

The workflow:

1. loads the configured TrueForge agent
2. creates a TrueForge session
3. starts the investigation turn
4. reaches the configured MCP tools
5. captures runtime evidence
6. performs the configured sandbox analysis
7. records the resulting trajectory

The resulting raw evidence is stored under:

```text
data/runs/
```

---

## Sandbox Investigation Mode

The repository also provides:

```powershell
npm run investigate:incident:sandbox
```

This path preserves the saved TrueForge agent configuration while enabling the deterministic sandbox-analysis portion of the investigation workflow.

The important distinction is that the sandbox operation is a real execution path, not merely a synthetic `SANDBOX_EXECUTION` event.

---

## Health Check

```powershell
npm run trueforge:health
```

Use this before a live demonstration to confirm that the configured TrueForge server is reachable.

---

## Runtime Probe

```powershell
npm run trueforge:probe
```

The probe captures the runtime surface needed to validate session creation and event streaming.

---

## Evidence Capture

A live investigation produces raw JSONL evidence under:

```text
data/runs/<run-id>.jsonl
```

AgentGuard retains the raw runtime records and derives normalized execution semantics from them.

The evidence path is therefore:

```text
TrueForge
   ↓
raw JSONL
   ↓
TrueForge adapter
   ↓
normalized observations
   ↓
verification
```

---

## Security Boundary

The TrueForge runtime should be operated with:

* synthetic incident data
* least-privileged credentials
* no host secrets
* no browser profiles
* no personal filesystem access
* no unnecessary network exposure
* isolated sandbox execution

The Daytona credential must never be included in committed source, screenshots, recordings, or documentation.

---

## Current Status

The current AgentGuard TrueForge integration has been validated for:

* TrueForge session creation
* real turn execution
* real MCP interaction
* raw JSONL evidence capture
* Daytona provider configuration
* TrueForge sandbox image setup
* real Daytona sandbox execution
* deterministic sandbox analysis
* evidence correlation
* recovery execution

The remaining validation work is focused on repeatable final-demo execution rather than adding another runtime capability.
