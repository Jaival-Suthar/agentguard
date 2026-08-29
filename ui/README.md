# AgentGuard Assurance Console

The console renders AgentGuard's `AssuranceArtifact` and intentionally does not independently infer PASS/FAIL from raw runtime events.

## Development

```text
npm install
npm run dev
```

The Vite server exposes the repository `data/` directory as its public directory; the console only navigates to `/assurance/*.json`, so assurance artifacts written by the backend become available without adding a second runtime/API layer.

## Demo flow

1. Run the real workflow in TrueForge.
2. Let AgentGuard produce the assurance artifact.
3. Open this console.
4. Select the generated artifact or import its JSON file.
5. Inspect Policy → Execution → Chaos → Recovery → Evidence → Contract → Assurance.

The two built-in states are explicitly labelled **DEMO STATE** and are UI interaction fallbacks only; they are not presented as runtime evidence.
