# Architecture

## Initial architecture

```text
                    TRUEFORGE
                        │
                        ▼
             Incident Investigator
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
          MCP        Sandbox      Subagent
           │            │            │
           └────────────┼────────────┘
                        ▼
                 Human Approval
                        │
                        ▼
                    Reconnect
                        │
                        ▼
              Observed Execution
                        │
                        ▼
                ┌──────────────┐
                │  AGENTGUARD  │
                │              │
                │ Contract     │
                │ Verifier     │
                │ Recovery     │
                │ Evidence     │
                │ Scoring      │
                └──────┬───────┘
                       ▼
                 Assurance Report
```

TrueForge is the runtime. AgentGuard does not replace the agent loop.

The TrueForge-specific adapter is the only component that should know TrueForge-specific event/API details. The AgentGuard core should operate on normalized execution semantics.
