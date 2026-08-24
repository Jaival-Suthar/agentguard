# Docker Development Boundary

This directory is reserved for the isolated AgentGuard/TrueForge development environment.

The first implementation intentionally does not expose host files or credentials to the agent.

When TrueForge is added, document every mounted volume, port, environment variable, and network connection here before using it.

## PR #2 Runtime Notes

The TrueForge runtime may be cloned into `.runtime/trueforge` for local Docker experimentation. That path is ignored by Git.

No AgentGuard source should be copied into the upstream TrueForge repository, and upstream `.env` files must never be committed.
