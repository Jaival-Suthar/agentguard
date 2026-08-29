# AgentGuard Assurance Console

The console renders AgentGuard's authoritative `AssuranceArtifact` and live run snapshots. It intentionally does **not** independently infer PASS / FAIL from raw runtime events.

## What The Console Shows

- live run discovery from the AgentGuard API
- semantic execution timeline
- compact proof inspector for the selected entry
- connection state
- final assurance verdict derived from the `AssuranceArtifact`

Important behavior:

- `MODEL_OUTPUT_DELTA` events are not rendered as standalone timeline rows
- the timeline is bounded to semantic events
- timestamps are rendered deterministically as `DD MMM YYYY · HH:mm:ss.SSS IST`
- the light theme is intentional and matches the rest of the assurance surface

## Development

Install the UI dependencies:

```powershell
npm install --prefix ui
```

Start the live AgentGuard API in one terminal:

```powershell
npm run api:dev
```

Start the console in another terminal:

```powershell
npm run ui:dev
```

The Vite dev server listens on `http://localhost:5174` and proxies `/api` to `http://127.0.0.1:8780`.

Production build:

```powershell
npm run ui:build
```

## Demo Flow

1. Run the real workflow in TrueForge.
2. Let AgentGuard produce the assurance artifact or live snapshot.
3. Start the live AgentGuard API and open this console.
4. Select the generated run or import its JSON artifact.
5. Inspect the semantic timeline, proof inspector, and final verdict.

The built-in demo states are explicitly labelled `DEMO STATE` and are UI interaction fallbacks only. They are not presented as runtime evidence.

## Running In Docker

The repository also includes an optional compose-based console deployment. See [../docker/README.md](../docker/README.md) for the current container workflow and status.

