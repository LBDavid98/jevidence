---
name: owner-reserved-changes
paths: ["**"]
skills: []
scripts: []
---
# Rule: a repo's own gates change only in a joint review with User

Scope: every repo. Its hooks (git hooks, pre-commit configuration), its
branch layout, its formatter and linter configuration and its history
belong to User, the repo's owner. They change only in a review he takes
part in.

- **When the repo's own gate fails on files you did not author, stop
  and report it as a joint-review item.** A pre-commit hook, a lint, a
  formatter check or a CI step that goes red on someone else's files is
  not yours to make green. Report the command, its exact output, the
  files it named, and that you did not author them. In a governed
  session, set the task blocked with that reason
  (`scrumux task status T-XXXX blocked --reason "joint review: <gate> fails on files not authored here"`).
- **Never edit the gate to pass.** No loosened lint rule, no new ignore
  entry, no reformatting of files you did not change, no disabled hook.
- **Never `--no-verify`**, and never any other way of committing or
  pushing past a hook.
- **Never rewrite history** that is not this session's own unpushed
  work: no rebase, reset or amend of anyone else's commits, no force
  push. Do not create, rename or delete the branches the repo's layout
  depends on.
- **A failure on files you DID author is yours** — fix the files, never
  the gate.

User saying so in session IS the joint review. When he tells you to
change the gate, change it, and record his word in the commit message.

Why: every other session and every other person relies on these to mean
today what they meant yesterday. A gate edited to let one session
through stops being a gate for all of them, and nothing in the diff
says so.
