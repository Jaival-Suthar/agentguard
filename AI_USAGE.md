# AI Usage

Qodo AI was used throughout the development of AgentGuard, from the beginning of the implementation through the final engineering passes, as an AI-assisted code-quality and review tool.

Qodo was used to help inspect implementation changes, identify potential bugs and regressions early, challenge assumptions, and improve code quality before changes were accepted.

The development workflow treated Qodo feedback as an engineering review input: findings were inspected, relevant issues were fixed, and the resulting implementation was re-tested.

Preferred summary:

> Qodo AI was part of the development workflow from day one, helping us catch and resolve issues early and continuously improve code quality. Its feedback was treated as review input, not as a substitute for engineering judgment, tests, or runtime verification.

## What AI Assistance Was Used For

- architecture exploration
- implementation assistance
- debugging
- documentation
- test development
- code review support

## What AI Assistance Was Not Used For

- replacing human engineering judgment
- certifying security
- guaranteeing correctness
- authoring the architecture independently
- substituting for automated tests or runtime verification

## Quality Workflow

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

This workflow is part of the repository’s engineering-quality story, not the product itself.

