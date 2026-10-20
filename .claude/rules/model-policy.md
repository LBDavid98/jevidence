---
name: model-policy
paths: ["**"]
skills: []
scripts: []
---
# Rule: every subagent call names its model

Scope: whenever you dispatch a subagent — one agent or a fan-out, a
definition from `.claude/agents/` or an ad-hoc prompt.

- **The orchestrating session runs as it was configured.** Its model is
  User's choice, made when the session was started. Do not switch it.
- **Coding and research subagents run on Opus.** Implementing,
  debugging, gathering context for an order, inspecting a rendered
  screen, a search whose answer will drive an edit: `model: opus`.
- **Validators run on Sonnet.** An issue-validator, a finding-validator,
  any second opinion whose job is to rule on someone else's claim:
  `model: sonnet`.
- **Every Agent call names its model**, even when it matches a default.
  A call that leaves it out runs on whatever the environment resolves
  that day, and a reader of the transcript cannot tell which model did
  the work.

The definitions under `.claude/agents/` carry a `model:` line that
follows this. When you dispatch one, name the same model in the call;
when you dispatch an ad-hoc agent, choose by the role it plays, not by
how small the task looks.

A repo that needs a different model for a role says so, with the
reason, in `.claude/rules/project-standards.md`, and that wins here.
