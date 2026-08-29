# AgentGuard Docker Path

The Docker path runs the AgentGuard API and Assurance Console as separate services.

It does not embed the Assurance Console into TrueForge.

```text
TrueForge runtime
        │
        │ real execution / evidence
        ▼
AgentGuard API
        │
        │ HTTP + SSE
        ▼
Assurance Console
```

---

## Compose Services

The root compose file is:

```text
docker-compose.assurance.yml
```

Current services:

```text
agentguard-api
assurance-ui
agentguard-runner
```

The runner is available through the configured `run` profile.

---

## Service Responsibilities

### `agentguard-api`

Provides:

* run discovery
* run snapshots
* SSE event updates
* AssuranceArtifact-backed data
* health endpoint

### `assurance-ui`

Provides:

* run selection
* semantic execution timeline
* evidence inspection
* recovery state
* assurance verdict
* connection state

### `agentguard-runner`

Provides an optional containerized execution path for the AgentGuard workflow.

The runner can reach a host-published TrueForge runtime through the configured host-gateway path.

---

## Local Ports

The default local development ports are:

```text
TrueForge       http://localhost:8791
AgentGuard API  http://localhost:8780
Assurance UI    http://localhost:5174
```

The services are intended for local development and demonstration.

When publishing ports from Docker for local use, bind host ports to the local interface rather than exposing them unnecessarily to the LAN.

For example:

```yaml
ports:
  - "127.0.0.1:8780:8780"
```

and:

```yaml
ports:
  - "127.0.0.1:5174:80"
```

The containers themselves may bind to `0.0.0.0` internally so Docker networking works correctly.

---

## Commands

Start the AgentGuard API and Assurance Console:

```powershell
npm run docker:assurance:up
```

Run the optional containerized workflow:

```powershell
npm run docker:assurance:run
```

Stop the services:

```powershell
npm run docker:assurance:down
```

Open:

```text
http://localhost:5174
```

---

## Data

The API container mounts:

```text
./data
```

so that runtime evidence and assurance artifacts remain available to the AgentGuard service.

The important directories are:

```text
data/runs/
data/assurance/
```

`data/runs/` contains raw runtime trajectories.

`data/assurance/` contains generated assurance artifacts.

The UI does not act as the canonical source of truth.

---

## TrueForge Connectivity

The optional runner uses the configured host-gateway mechanism to reach the host-published TrueForge service.

Conceptually:

```text
agentguard-runner
       │
       │ host.docker.internal
       ▼
host TrueForge
       │
       ▼
TrueForge :8791
```

Keep the host TrueForge endpoint and the Docker configuration aligned with `.env.example`.

---

## Security

The Docker path is intended for local development and demonstration.

Do not:

* commit `.env`
* expose API keys in logs
* expose the local API publicly
* mount the host filesystem unnecessarily
* provide the agent access to host secrets
* use production credentials for synthetic demo workloads

Use the least-privileged credentials required by the TrueForge/Daytona integration.

---

## Verification

Before relying on the Docker path for the final demonstration, run:

```powershell
npm run typecheck
npm test
npm run ui:typecheck
npm run ui:build
```

Then validate:

```text
TrueForge
   ↓
real MCP
   ↓
Daytona sandbox
   ↓
AgentGuard
   ↓
AssuranceArtifact
   ↓
Assurance Console
```

The Docker path is an optional packaging/runtime path. The core AgentGuard assurance architecture does not depend on Docker for its correctness.

---

## Demo Architecture

The intended final local demonstration is:

```text
                 TRUEFORGE
                    │
                    │ real agent execution
                    ▼
             MCP + Daytona
                    │
                    ▼
               AgentGuard
                    │
        ┌───────────┼───────────┐
        ▼           ▼           ▼
     Evidence     Policy      Recovery
        │           │           │
        └───────────┼───────────┘
                    ▼
            AssuranceArtifact
                    │
                    ▼
            Assurance Console
```

TrueForge remains the execution environment.

AgentGuard remains the verification and assurance layer.
