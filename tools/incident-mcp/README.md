# AgentGuard Incident MCP

This synthetic MCP server provides the `lookup_incident` tool used by the incident investigator.

## Run locally

```text
npm run start
```

The server defaults to `HOST=127.0.0.1` and `PORT=8782`.

## Docker integration

When TrueForge runs in Docker and needs to reach this server via `host.docker.internal:8782`, start it with:

```text
HOST=0.0.0.0 PORT=8782 npm run start
```

The default stays local-only so the server is not exposed on all interfaces unless you opt in explicitly.
