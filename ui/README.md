# AgentGuard Assurance Console

The console renders AgentGuard's `AssuranceArtifact` and intentionally does not independently infer PASS/FAIL from raw runtime events.

## Development

```text
npm install
npm run api:dev
npm run dev
```

The Vite dev server proxies `/api` to the local AgentGuard live API. The console reads real run summaries and snapshots from that API, while the repository `data/` directory still provides static assurance artifacts for import and inspection.

## Demo flow

1. Run the real workflow in TrueForge.
2. Let AgentGuard produce the assurance artifact.
3. Start the live AgentGuard API and open this console.
4. Select the generated run or import its JSON file.
5. Inspect the live timeline, proof inspector, recovery view, and final artifact.

The two built-in states are explicitly labelled **DEMO STATE** and are UI interaction fallbacks only; they are not presented as runtime evidence.
