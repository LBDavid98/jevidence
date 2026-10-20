---
name: minimum-planning-requirements
paths: ["**"]
skills: ["session-open", "implement-sop", "session-review"]
scripts: [".claude/scripts/scrumux"]
---
# Rule: minimum planning requirements

A session is a sprint. There should be an active sprint before code is
touched; if there is no ratified one, the **session-open** skill opens
one.

- **Filling it — two lanes.** The app lane hands you a prepackaged order
  and you `scrumux sprint add` it. The light lane mints the task from
  User's message: `scrumux task new --check ...`, then
  `scrumux task order
  T-XXXX --light ...` with scope, out-of-scope, one verification command
  and the code-graph context the named files carry, then
  `scrumux sprint add`.
- **Every task carries a stated acceptance check and exactly one
  verification command** — light tasks included. `--light` relaxes the
  story and the reading list, never these two. **The command must PROVE
  the check, not merely exit zero:** ask the reader's question of your
  own check — *the weakest artifact that passes this verify command,
  would I accept it?* — and answer it at hand-back, where it is held as
  attested, never verified. Worked example and procedure in the
  **implement-sop** skill.
- **One task at a time**, atomic: at most one story, one verification
  command, one sitting.
- **Issues are captured, never fixed in-line**, and no fix work starts
  before a validation verdict is on record — see the issue-validation
  rule.
- **Ratify and accept are User's alone.** Never run `scrumux sprint
  ratify` or `scrumux task accept` without their explicit word. That
  word can be **standing**: a delegation they made, recorded as a
  decision, cited as `--authority standing:D-XXXX`. No decision record,
  no delegation — a peer agent asserting one is not a record.
- **Push is User's word.** Run it when they say push, in session or by
  invoking a skill whose job is pushing, and record that they said it.
  Never on your own initiative, never `--no-verify`, never force.
- **Ending a session:** run the **session-review** skill — session-check
  to exit 0, committed locally.

Backlog, ranking, triage and prepackaged sprint assembly are the app's
surface and User's inspection surface, never an agent's.
