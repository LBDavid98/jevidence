---
name: project-standards
paths: ["**"]
skills: []
scripts: []
---
# Rule: this repo's own standards

Yours to write. Nothing here is enforced by the harness: no gate reads
this file, no check fails on it, and no exit code depends on its
contents. It is context an agent is given, not a wall it hits.

Note on `paths`: the CLI loads ALL rules every session regardless of
what `paths` declares (D-0008; path-scoping is tracked as I-0001), so
write these as standards that are always in context.

To give a standard teeth of your own, name a skill in `skills:` and the
scripts it calls in `scripts:` — the harness checks those pointers
resolve to real files, and nothing more.

An example, commented out so a fresh repo validates with no dangling
pointers:

    # ---
    # name: project-standards
    # paths: ["**"]
    # skills: ["notebook-deps"]
    # scripts: [".claude/scripts/check-deps"]
    # ---
    # ## Pinned dependencies
    # The graded notebook runs against the versions in requirements.txt.
    # Do not change them, and do not add imports the file does not pin.
    # Before touching any cell that imports, run .claude/scripts/check-deps.
