# PR #2 — TrueForge Runtime Proof

## Goal

Prove that AgentGuard can observe a **real** TrueForge execution without inventing an event model.

This PR captures evidence only.

## What this PR proves

1. A TrueForge server is reachable.
2. A configured model can execute through TrueForge.
3. The SDK can create a session.
4. The SDK can stream a turn.
5. Every streamed event is persisted unchanged as JSONL.
6. The session id is saved for later reconnect/session experiments.

## Official runtime modes

TrueForge documents two development paths:

* Local standalone: `npx @truefoundry/trueforge` using SQLite on localhost.
* Hosted Docker Compose: upstream TrueForge with server + Postgres + Redis.

AgentGuard supports either because the SDK only needs a `TRUEFORGE_BASE_URL`.

## Recommended security setup

For this hackathon:

* clone upstream TrueForge into `.runtime/trueforge`
* keep it ignored by Git
* run the hosted Docker Compose stack locally
* use synthetic data only
* never mount personal folders into agent-facing containers unless explicitly required
* never commit upstream `.env`

## Step A — Install SDK dependencies

```powershell
npm install
npm install @truefoundry/trueforge-sdk
npm install -D typescript tsx @types/node
npm install dotenv
```

## Step B — Configure environment

Copy:

```powershell
Copy-Item .env.example .env
```

Set:

```env
TRUEFORGE_BASE_URL=http://localhost:8791
TRUEFORGE_MODEL_NAME=<exact configured provider/model name>
```

For the hosted Docker setup, `8791` is the host-facing TrueForge port and `8790` is the container port.

The model name must match the fully qualified `provider/model` configured in TrueForge.

## Step C — Start TrueForge

### Option 1: Official local mode

```powershell
npx @truefoundry/trueforge
```

Open `http://localhost:8790`.

Configure one model provider in the UI.

### Option 2: Hosted Docker mode

Use:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-trueforge-docker.ps1
powershell -ExecutionPolicy Bypass -File scripts/start-trueforge-docker.ps1
```

Then configure a model provider through the UI at the hosted URL.

## Step D — Health check

```powershell
npm run trueforge:health
```

Expected output includes HTTP status for `/healthz` and `/`.

## Step E — Stream a real turn

```powershell
npm run trueforge:probe
```

The probe will:

* create one session
* stream one turn
* print model deltas live
* write every raw SDK event into `data/runs/<timestamp>.jsonl`
* write metadata into `data/runs/<timestamp>.json`

Do not edit the evidence files.

## Evidence expected from this PR

```text
data/runs/

  2026-....jsonl

  2026-....json
```

Those raw files become the source material for PR #3, where we design the normalized `ExecutionEvent` adapter from observed reality.

## Acceptance criteria

* [ ] TrueForge reachable
* [ ] One configured model responds
* [ ] Session created through SDK
* [ ] Turn streamed through SDK
* [ ] `turn.created` observed
* [ ] model output streamed
* [ ] `turn.done` observed
* [ ] JSONL evidence generated
* [ ] Session id persisted

MCP, sandbox, approval, subagents, and reconnect are configured and demonstrated incrementally on this same runtime in later commits within the broader runtime branch if needed, but **this first runtime proof must establish the event surface before we model it.**
