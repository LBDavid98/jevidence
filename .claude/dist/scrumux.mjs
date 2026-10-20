#!/usr/bin/env node

// src/util/node-version.ts
var MIN_NODE_MAJOR = 22;
var MIN_NODE_MINOR = 11;
function nodeVersionProblem(version) {
  const m = /^v?(\d+)\.(\d+)\./.exec(version);
  if (!m) return null;
  const major = parseInt(m[1], 10);
  const minor = parseInt(m[2], 10);
  if (major > MIN_NODE_MAJOR) return null;
  if (major === MIN_NODE_MAJOR && minor >= MIN_NODE_MINOR) return null;
  return "scrumux: error: Node " + version + " is too old \u2014 this CLI needs Node >=" + MIN_NODE_MAJOR + "." + MIN_NODE_MINOR + ". Install a newer Node and retry; nothing was read or written.";
}

// src/journal/jqformat.ts
var RawNumber = class {
  constructor(text2) {
    this.text = text2;
  }
  toJSON() {
    return Number(this.text);
  }
  valueOf() {
    return Number(this.text);
  }
};
var ESC = {
  8: "\\b",
  9: "\\t",
  10: "\\n",
  12: "\\f",
  13: "\\r",
  34: '\\"',
  92: "\\\\"
};
function jqString(s2) {
  let out = '"';
  for (const ch of s2) {
    const c = ch.codePointAt(0);
    const e = ESC[c];
    if (e !== void 0) {
      out += e;
      continue;
    }
    if (c < 32 || c === 127) {
      out += "\\u" + c.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out + '"';
}
function canonNumber(text2) {
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text2);
  if (!m) return text2;
  const sign = m[1] ?? "";
  const intPart = m[2] ?? "";
  const fracPart = m[3] ?? "";
  const expPart = m[4] ? parseInt(m[4], 10) : 0;
  let digits = intPart + fracPart;
  const exp = expPart - fracPart.length;
  const stripped = digits.replace(/^0+/, "");
  const lead = digits.length - stripped.length;
  if (lead > 0) digits = digits.slice(Math.min(lead, digits.length - 1));
  const adjusted = exp + (digits.length - 1);
  if (exp <= 0 && adjusted >= -6) {
    if (exp === 0) return sign + digits;
    const pointPos = digits.length + exp;
    if (pointPos > 0) return sign + digits.slice(0, pointPos) + "." + digits.slice(pointPos);
    return sign + "0." + "0".repeat(-pointPos) + digits;
  }
  const mant = digits.length > 1 ? digits[0] + "." + digits.slice(1) : digits[0];
  const esign = adjusted < 0 ? "-" : "+";
  return sign + mant + "E" + esign + Math.abs(adjusted);
}
function jqDouble(n) {
  if (Number.isNaN(n)) return "null";
  if (!Number.isFinite(n)) {
    return n > 0 ? "1.7976931348623157e+308" : "-1.7976931348623157e+308";
  }
  if (n === 0) return Object.is(n, -0) ? "-0" : "0";
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const [mant, ex] = a.toExponential().split("e");
  const digits = mant.replace(".", "").replace(/0+$/, "") || "0";
  const decpt = parseInt(ex, 10) + 1;
  const nd = digits.length;
  if (decpt <= -4 || decpt > nd + 15) {
    const mm = nd > 1 ? digits[0] + "." + digits.slice(1) : digits[0];
    const e = decpt - 1;
    const es = e < 0 ? "-" : "+";
    const ea = Math.abs(e);
    return sign + mm + "e" + es + (ea < 10 ? "0" + ea : String(ea));
  }
  if (decpt <= 0) return sign + "0." + "0".repeat(-decpt) + digits;
  if (decpt >= nd) return sign + digits + "0".repeat(decpt - nd);
  return sign + digits.slice(0, decpt) + "." + digits.slice(decpt);
}
function jqFormat(value) {
  const buf = [];
  emit(value, 0, buf);
  buf.push("\n");
  return buf.join("");
}
function emit(v, depth, buf) {
  if (v === null || v === void 0) {
    buf.push("null");
    return;
  }
  if (v instanceof RawNumber) {
    buf.push(canonNumber(v.text));
    return;
  }
  const t = typeof v;
  if (t === "boolean") {
    buf.push(v ? "true" : "false");
    return;
  }
  if (t === "number") {
    buf.push(jqDouble(v));
    return;
  }
  if (t === "string") {
    buf.push(jqString(v));
    return;
  }
  const pad = "  ".repeat(depth);
  const padIn = "  ".repeat(depth + 1);
  if (Array.isArray(v)) {
    if (v.length === 0) {
      buf.push("[]");
      return;
    }
    buf.push("[\n");
    for (let i = 0; i < v.length; i++) {
      buf.push(padIn);
      emit(v[i], depth + 1, buf);
      buf.push(i === v.length - 1 ? "\n" : ",\n");
    }
    buf.push(pad, "]");
    return;
  }
  const obj6 = v;
  const keys = Object.keys(obj6);
  if (keys.length === 0) {
    buf.push("{}");
    return;
  }
  buf.push("{\n");
  for (let i = 0; i < keys.length; i++) {
    const k2 = keys[i];
    buf.push(padIn, jqString(k2), ": ");
    emit(obj6[k2], depth + 1, buf);
    buf.push(i === keys.length - 1 ? "\n" : ",\n");
  }
  buf.push(pad, "}");
}
function parsePreservingNumbers(src) {
  let i = 0;
  const err = (m) => {
    throw new SyntaxError(`${m} at ${i}`);
  };
  const ws = () => {
    while (i < src.length && " 	\n\r".includes(src[i])) i++;
  };
  function value() {
    ws();
    const c = src[i];
    if (c === "{") return obj6();
    if (c === "[") return arr4();
    if (c === '"') return str4();
    if (c === "t") return expect("true", true);
    if (c === "f") return expect("false", false);
    if (c === "n") return expect("null", null);
    return num3();
  }
  function expect(word, val) {
    if (src.startsWith(word, i)) {
      i += word.length;
      return val;
    }
    return err(`expected ${word}`);
  }
  function obj6() {
    i++;
    ws();
    const o = {};
    if (src[i] === "}") {
      i++;
      return o;
    }
    for (; ; ) {
      ws();
      if (src[i] !== '"') err("expected key");
      const k2 = str4();
      ws();
      if (src[i] !== ":") err("expected :");
      i++;
      o[k2] = value();
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "}") {
        i++;
        return o;
      }
      err("expected , or }");
    }
  }
  function arr4() {
    i++;
    ws();
    const a = [];
    if (src[i] === "]") {
      i++;
      return a;
    }
    for (; ; ) {
      a.push(value());
      ws();
      if (src[i] === ",") {
        i++;
        continue;
      }
      if (src[i] === "]") {
        i++;
        return a;
      }
      err("expected , or ]");
    }
  }
  function str4() {
    i++;
    let out = "";
    for (; ; ) {
      const c = src[i];
      if (c === void 0) err("unterminated string");
      if (c === '"') {
        i++;
        return out;
      }
      if (c === "\\") {
        i++;
        const e = src[i++];
        if (e === "u") {
          out += String.fromCharCode(parseInt(src.slice(i, i + 4), 16));
          i += 4;
        } else if (e === "n") out += "\n";
        else if (e === "t") out += "	";
        else if (e === "r") out += "\r";
        else if (e === "b") out += "\b";
        else if (e === "f") out += "\f";
        else if (e === "/") out += "/";
        else if (e === '"') out += '"';
        else if (e === "\\") out += "\\";
        else err(`bad escape \\${String(e)}`);
        continue;
      }
      out += c;
      i++;
    }
  }
  function num3() {
    const start = i;
    if (src[i] === "-") i++;
    while (i < src.length && src[i] >= "0" && src[i] <= "9") i++;
    if (src[i] === ".") {
      i++;
      while (i < src.length && src[i] >= "0" && src[i] <= "9") i++;
    }
    if (src[i] === "e" || src[i] === "E") {
      i++;
      if (src[i] === "+" || src[i] === "-") i++;
      while (i < src.length && src[i] >= "0" && src[i] <= "9") i++;
    }
    if (i === start) err("bad value");
    return new RawNumber(src.slice(start, i));
  }
  const v = value();
  for (; ; ) {
    const before = i;
    ws();
    if (i >= src.length) break;
    if (i === before) err("trailing content");
    value();
  }
  return v;
}

// src/cli/exit.ts
var ExitSignal = class extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
    this.name = "ExitSignal";
  }
};
var processIo = {
  out: (s2) => {
    process.stdout.write(s2);
  },
  err: (s2) => {
    process.stderr.write(s2);
  },
  exit: (code) => {
    throw new ExitSignal(code);
  }
};

// src/cli/envelope.ts
var Cli = class {
  constructor(command, argv, json, io = processIo) {
    this.command = command;
    this.argv = argv;
    this.json = json;
    this.io = io;
  }
  rows = [];
  dataParts = {};
  extraParts = {};
  emitted = false;
  // --- result rows ----------------------------------------------------
  // `ok` on a row is (tier !== 'fail'), so a consumer written against the
  // old {name, ok, detail} shape still works and simply gains a field.
  //
  // WRITTEN THROUGH, NOT BUFFERED (User's ruling, 2026-09-01). An early cut
  // of this class buffered both `row` and `say` and flushed at `emit`, which
  // produced identical bytes for any verb that reaches `emit` normally --
  // the lines come out in the order they were said, ahead of the summary --
  // and DIFFERENT bytes for a verb that SPEAKS AND THEN REFUSES, because
  // `refuse` exits without flushing. Concretely: `secret set` into a repo
  // whose `.gitignore` lacks `.env` and whose `.env` git already tracks
  // writes "added .env to .gitignore" and then refuses; buffered, only the
  // refusal would print, and the operator would lose the fact that their
  // `.gitignore` was just changed. Two nouns once carried a local `sayNow`
  // workaround for exactly this; the ruling moves the behaviour into this
  // one shared class and retires them.
  row(tier, name, detail = "") {
    this.rows.push({ name, ok: tier !== "fail", tier, detail });
    if (this.json) return;
    const label = tier === "pass" ? "  ok  " : tier === "fail" ? "  FAIL" : tier === "warn" ? "  WARN" : tier === "tell" ? "  TELL" : "  ..  ";
    this.io.out(`${label} ${name.padEnd(24)} ${detail}
`);
  }
  pass(name, detail) {
    this.row("pass", name, detail);
  }
  fail(name, detail) {
    this.row("fail", name, detail);
  }
  warn(name, detail) {
    this.row("warn", name, detail);
  }
  tell(name, detail) {
    this.row("tell", name, detail);
  }
  note(name, detail) {
    this.row("note", name, detail);
  }
  /** How many rows failed. A module must not consult the verdict directly. */
  fails() {
    return this.rows.filter((r) => r.tier === "fail").length;
  }
  // --- prose ----------------------------------------------------------
  /** Human stdout, written through the moment it exists.
   *  Suppressed entirely under --json. */
  say(line) {
    if (!this.json) this.io.out(line + "\n");
  }
  /**
   * The rare line a human must see even under --json. Goes to STDERR,
   * because stdout under --json carries exactly one object and nothing else.
   */
  sayAlways(line) {
    this.io.err(line + "\n");
  }
  data(obj6) {
    Object.assign(this.dataParts, obj6);
  }
  extra(obj6) {
    Object.assign(this.extraParts, obj6);
  }
  // --- the one object, and the exit -----------------------------------
  build(summary) {
    const ok = this.fails() === 0;
    return {
      schema: "scrumux.cli/1",
      command: this.command,
      argv: this.argv,
      ok,
      exit: ok ? 0 : 1,
      summary,
      checks: this.rows,
      data: this.dataParts,
      ...this.extraParts
    };
  }
  emit(summary = "") {
    this.emitted = true;
    const env = this.build(summary);
    if (this.json) {
      this.io.out(jqFormat(env));
    } else if (summary !== "") {
      this.io.out(summary + "\n");
    }
    this.io.exit(env.exit);
  }
  /**
   * The dispatcher's safety net. A module that returns without emitting
   * still produces the one object, with a summary derived from its rows.
   * Never a licence -- every module emits explicitly -- but a missed
   * branch must not become a crash; it should still produce a valid
   * object (docs/port/PHILOSOPHY.md P-03).
   */
  finish() {
    if (this.emitted) this.io.exit(this.fails() === 0 ? 0 : 1);
    const n = this.fails();
    this.emit(n === 0 ? `scrumux ${this.command}: ok.` : `scrumux ${this.command}: ${n} check(s) failed.`);
  }
  /** A refusal is still an object under --json. exit 2, ok false. */
  refuse(kind, message) {
    if (this.json) {
      const env = {
        schema: "scrumux.cli/1",
        command: this.command,
        argv: this.argv,
        ok: false,
        exit: 2,
        summary: `scrumux ${this.command}: error: ${message}`,
        checks: this.rows,
        data: {},
        error: { kind, message }
      };
      this.io.out(jqFormat(env));
    }
    const prefix = this.command ? ` ${this.command}` : "";
    this.io.err(`scrumux${prefix}: error: ${message}
`);
    this.io.exit(2);
  }
  die(message) {
    return this.refuse("refused", message);
  }
  dieUsage(message) {
    return this.refuse("usage", message);
  }
};

// src/cli/argv.ts
var REDACTED = "<redacted>";
function redactArgv(noun, verb, args) {
  if (noun !== "secret" || verb !== "set" || args.length === 0) return [...args];
  const name = args[0];
  const head = name.startsWith("-") ? REDACTED : name;
  return [head, ...args.slice(1).map(() => REDACTED)];
}
function stripGlobalFlags(input) {
  const argv = [];
  let json = false;
  let passthru = false;
  for (const a of input) {
    if (passthru) {
      argv.push(a);
      continue;
    }
    if (a === "--") {
      passthru = true;
      continue;
    }
    if (a === "--json") {
      json = true;
      continue;
    }
    argv.push(a);
  }
  return { argv, json };
}

// src/cli/usage-text.ts
var NOUN_USAGE = {
  backlog: `scrumux backlog \u2014 open work in priority order.

  scrumux backlog tasks    [--full]
  scrumux backlog features [--full]

A number means a rank someone DECIDED. Work that has never been
prioritised is listed separately, without numbers, so an absent decision
can never read as a priority decision.

--full prints untruncated descriptions \u2014 the description is where the
ranking rationale lives.

Move an item: scrumux rank set <#|T-0001|F-0001> <new-#>
`,
  decide: `scrumux decide \u2014 record a decision; a person ratifies, rejects or acknowledges it.

  scrumux decide new --title T --decision TEXT --rationale TEXT --by WHO
                     [--authority direct|app:<session>|standing:D-XXXX]
                     [--scope repo|cross-repo] [--supersedes D-0001]
                     [--task T-0001] [--issue I-0001] [--push-hold <sha>]
  scrumux decide ratify D-0001 --by WHO --authority direct|app:<session>|standing:D-XXXX
  scrumux decide reject D-0001 --by WHO --reason TEXT
  scrumux decide acknowledge D-0001 --by WHO [--note TEXT]

\`new\` never refuses for authority (D-S039). With an --authority that
resolves, the decision is recorded status "ratified" with that authority.
Without one \u2014 or with one that does not resolve \u2014 it is recorded status
"proposed", authority "none": it binds nothing, retires nothing it
supersedes, and cannot be cited as standing:D-XXXX until a person ratifies
it. --by names who ran the command (recorded_by). Prints the new id.

An operator's message inside a session is not a ratification. Record what
you were told as a proposed decision and say so; the person acts in the app.

ratify, reject and acknowledge are a PERSON's acts (scrumux-app runs them
under the acting person's identity). ratify needs an authority that resolves;
reject records why and the decision binds nothing; acknowledge keeps a
proposed or authority-less record as it is and records who saw it. A record
written before D-S039 has no status and reads as ratified, authority unknown.

WRITING THE FREE TEXT. A decision is read by the session that is about to
undo it, so it carries the ruling and what was weighed. Real examples:

  --title      "Parallel dispatch admission: a per-sprint cap declared at
                planning"                                          (D-0084)
               The ruling, in one line. NOT "sprint changes".

  --decision   "A sprint carries parallel (integer >= 1, default 1), declared
                at scrumux sprint new --parallel N. The CLI admits a task to
                in_progress while the same RATIFIED sprint has fewer than
                parallel tasks in_progress ... The cap may be changed only
                while the sprint is proposed; changing it after ratification
                is a re-ratification, not an edit"                 (D-0084)
               The rule as it will be applied. NOT "we will allow parallel
               work" \u2014 every surface would invent its own version.

  --rationale  "Three shapes were put to User. A: a per-sprint cap declared
                at planning. B: per-worktree admission. C: the app is the
                gate. User ruled A ... B ties a governance rule to a git
                detail no journal models; C would leave a hand-driven session
                ungated entirely"                                  (D-0084)
               What was weighed, including the REJECTED options and what was
               wrong with each. That is the part a later session needs.
`,
  epic: `scrumux epic \u2014 epics.

  scrumux epic new --name N --desc TEXT [--feature F-0001]...
  scrumux epic update E-0001 [--add-feature F-0001]... [--remove-feature F-0001]...

WRITING THE FREE TEXT. Real examples from this repo:

  --name  "Self-knowledge: the harness sees its own code and its own
           governance"                                             (E-0005)
          The destination, said as a claim. NOT "Improvements".

  --desc  "The harness stands alone: it installs into any repo, proves it is
           live there, refuses only what is dangerous, runs its gates in
           seconds, and records enough about its own behaviour that the next
           round of priorities comes from data. Everything in this epic comes
           from the deep-dive review of 2026-08-20 and D-0058..D-0061"
                                                                   (E-0006)
          What changes when it lands, and where the scope came from \u2014 so a
          later reader can tell what belongs in it. NOT "various fixes".
`,
  exception: `scrumux exception \u2014 process findings on a session, NOT code discoveries.

  scrumux exception new --lens NAME --ref WHAT --finding TEXT
                        [--severity red|yellow]
                        [--disposition accept_and_track|requires_ratification|
                                       correct_the_record|reject_the_task]
                        [--source WHO] [--session ID] [--task T-0001]
                        [--sprint SP-0001] [--rule ID]
  scrumux exception resolve X-0001 --status tracked|ratified|corrected|
                        rejected|withdrawn --by WHO [--note TEXT]
                        [--authority direct|app:<session>|standing:D-XXXX]
  scrumux exception list
  scrumux exception ratify X-0001 --by WHO --authority direct|app:<session>|standing:D-XXXX
  scrumux exception reject X-0001 --by WHO --reason TEXT
  scrumux exception acknowledge X-0001 --by WHO [--note TEXT]

A resolution without an --authority that resolves is recorded
resolution_status "proposed" (D-S039) and listed until a person ratifies,
rejects (which reopens the finding) or acknowledges it.

An ISSUE is a code-level discovery: the schema is wrong, the gateway needs
another parameter, I am blocked by Y. An EXCEPTION is a finding about whether
the WORK FOLLOWED THE RULES \u2014 did the agent use the skills, did the scripts
run, were exceptions raised to it, did it act on them, did the actions
translate to resolution. Do not file one as the other.

Two exceptions, so the line has anchors and not only a definition (User,
2026-08-27):
  - a session CLOSED with a bad lint report
  - a tool call that VIOLATED a pre-tool hook check
Both are about how the work went, not about what the code is. A defect you
found in a file is an issue however serious it is.

A REVIEWER IS NEVER A BLOCKER. --disposition is a recommendation and defaults
to accept_and_track; nothing here moves a task, ratifies a sprint or corrects a
record. \`resolve\` records what a PERSON did \u2014 it does not do it.

correct_the_record means a bounded mechanical repair that must not require an
LLM call. Whatever performs it does so through its own verb, with its own
authority, and this journal records that it happened.

WRITING THE FREE TEXT. The person who decides was not in the session, so a
finding carries what happened AND what is still unproven. Real examples:

  --lens     "Repo standards" (X-0001), "scripts_run" (X-0002) \u2014 the question
             the reviewer was asking. NOT "review": it groups nothing.

  --ref      "harness .claude/scripts/lib/cmd-records.sh:264"      (X-0001)
             The exact thing, with a line number where there is one.
             NOT "the CLI" \u2014 nobody can open it.

  --finding  "Running records check through the control plane appended
              'printf: write error: Broken pipe' to the output the app
              displayed. The cause is believed to be grep -q closing the pipe
              under printf ... Eleven call sites were hardened and 497
              harness tests stay green, but the symptom was NOT reproduced in
              eight attempts, so the fix is not confirmed to address it"
                                                                  (X-0001)
             What happened, what is believed to explain it, what is still
             unproven. NOT "the session did not follow the rules".

  --note     on resolve: what the PERSON did and on what basis, since resolve
             records an act it did not perform. "Tracked against T-0219; the
             repro is the deliverable before any further hardening."
`,
  feature: `scrumux feature \u2014 one verb, \`new\`.

  scrumux feature new --name N --desc TEXT [--dep F-0001]...

Prints the new id.

WRITING THE FREE TEXT. Real examples from this repo:

  --name  "Gate integrity" (F-0009), "Deployability" (F-0013) \u2014 the
          capability, in two or three words. NOT "Phase 2 improvements".

  --desc  "No gate reports a pass it did not earn. The four cross-script
           dependencies fail closed instead of open; the destructive-command
           attestation leaves a record; the issue source field is a
           constrained enum so drift data has a reliable who-raised-this
           dimension"                                              (F-0009)
          What it makes possible and how you can tell. NOT "makes deploys
          better" \u2014 no mechanism, and no story can be written against it.
`,
  graph: `scrumux graph \u2014 the two derived graphs. No LLM in either path (D-0001):
both are repo fact, and a fact a model guessed at is not a fact.

  scrumux graph code build [--repo <path>]   (re)build the code index
  scrumux graph code index                   the freshness check
  scrumux graph code callers <id>            who calls this symbol or file
  scrumux graph code callees <id>            what this calls
  scrumux graph code symbols <file>          symbols defined in a file
  scrumux graph code find <name>             symbol ids matching a bare name
  scrumux graph code near <id> [n]           within n call-hops, both ways
  scrumux graph code stats                   counts, coverage, provenance

  scrumux graph gov build                    (re)build the governance index
  scrumux graph gov index                    exit 0 if current, rebuild if stale
  scrumux graph gov provenance <id>          what bears on a task, both directions
  scrumux graph gov inbound|outbound <id>    records pointing at / pointed at
  scrumux graph gov impact <id> [n]          what changing this touches
  scrumux graph gov orphans [kind]           records nothing points at
  scrumux graph gov dangling                 refs naming a record that is gone
  scrumux graph gov stats                    node and edge counts by kind
  scrumux graph gov bearing [--task T-0001] [--file <path>] [<path>...]
                                             the decisions and issues that
                                             BIND a file set (T-0153)

READER / BUILDER. Every \`graph code\` query answers from
governance/code-graph.json with NO tree-sitter and NO rebuild, stamped
with the commit it was built from and how far behind HEAD that is now.
Only \`build\` needs the grammars, it takes an explicit --repo, and
\`scrumux harness deploy\` runs it into every target it installs \u2014 so a
deployed repo has a working code graph without ever carrying a parser.

Nothing here depends on the scrumux-app. The app is one more optional
refresher and reader of the same on-disk file.

LANGUAGE-AGNOSTIC. The grammar set is a registry in
src/nouns/graph/code-build.ts, not a branch. A file whose language has no
installed grammar is COUNTED AND NAMED by \`stats\` and by \`build\` \u2014 never
skipped in silence, because a silently skipped file looks exactly like a
file with nothing in it.

A code symbol id is "<path>::<name>"; a code file id is the repo-relative
path. A governance id is a record id.
`,
  harness: `scrumux harness \u2014 install the machinery into a repo, and prove it is
installed there.

  scrumux harness deploy <target> [--json]
  scrumux harness verify <target> [--json]

deploy reports every item as CREATED, UPDATED, UNCHANGED, REMOVED or
KEPT by byte comparison (never timestamp) and fails if \`records check\`
does not come back clean against the target. It prunes payload files a
previous manifest claims and this one no longer ships, so a rename cannot
leave a stale runnable command behind \u2014 but never a file it SEEDS for the
repo to own, which is reported KEPT and dropped from the new manifest.

verify answers the one question a session cannot answer about itself: is
.claude/settings.json at the repo ROOT, where Claude Code resolved it at
launch? Anywhere else it is silently inert, and every hook chain in it is
dead while the repo looks entirely normal from the inside.

verify also EXECUTES every command surface it ships. Checks about files
can only confirm the copy happened; I-0104 is what that costs.

INSTALLED IS NOT LIVE. Every check is about the TARGET; whether a session
is governed by what is installed there is decided by the project root that
session was LAUNCHED with, and no command running inside it can change
that. When $CLAUDE_PROJECT_DIR names a different repo, verify says so in a
session-topology WARN \u2014 advisory, never part of the exit code.
`,
  health: `scrumux health \u2014 one verb, \`add\`.

  scrumux health add --name N --command CMD
                     [--type build|test|run|lint|other] [--timeout SECONDS]

Registers a repo-health check. The command runs from the repo root and
exit 0 means healthy. A \`lint\`-typed check that goes red is a TELL and
never fails a run (D-0072 boundary 7).

A CHECK IS KEYED BY ITS NAME. Adding a name that is already registered
REPLACES that entry and prints old -> new, so a typo in --command is
corrected by re-running \`add\` with the same --name. There is no \`remove\`
verb: nothing on this noun deletes a row, so a name that already sits on
two entries keeps both \u2014 the first is replaced and the stray is named.
`,
  issue: `scrumux issue \u2014 defects, drift, harness problems and ideas.

  scrumux issue new --type defect|harness --source WHO
                    (drift|idea|governance: User/human only)
                    --summary TEXT --fix TEXT
                    [--severity low|medium|high|critical]
                    [--task T-0001] [--file PATH]... [--waives T-0001]...
  scrumux issue update I-0001 [--status open|accepted|resolved|rejected]
                    [--severity low|medium|high|critical] [--task T-0001]
                    [--fix TEXT] [--waives T-0001]...
  scrumux issue validate I-0001
                    --verdict reproduced|evidenced|invalidated|duplicate
                    --evidence TEXT [--repro-cmd CMD] [--by WHO]
                    [--duplicate-of I-0001|T-0001] [--revalidate]
  scrumux issue authorize I-0001 --by WHO [--note TEXT]
  scrumux issue list [--status open|accepted|resolved|rejected|all]
                    [--type TYPE] [--task T-0001]
  scrumux issue find TEXT [--status ...] [--type TYPE] [--task T-0001]

Before filing, look: \`issue find 'receipt fresh'\` searches ids, summaries,
fix text, tasks and files (all statuses); \`issue list\` shows open issues.
The journal is governance/issues.json under GOV_ROOT \u2014 in a dispatched
worktree that is the main checkout, not the worktree's stale copy \u2014 so read
it through these verbs. \`issue new\` TELLs (never refuses) when an open
issue names the same file or most of the same summary words.

A verdict is write-once: both promotion gates read it, so a second
validate REFUSES rather than erasing the first validator's evidence.
--revalidate supersedes one deliberately and keeps the prior verdict in
.validation_history.

--waives names the task this issue is a knowing exception to; it must
resolve, so a waiver can never be anonymous. Hotfix promotion needs
validation OR authorization, and authorization never counts as
validation (I-0010).

WRITING THE FREE TEXT. A report is read by a validator who was not there.
Real examples from this repo, in the shape to copy:

  --summary   "harness deploy seeds no .gitignore lines for the views scrumux
               writes, so running a report dirties a deployed repo's tree.
               Repro: deploy into a git repo, commit, run scrumux views
               render, git status shows four untracked generated files"
                                                                    (I-0153)
              NOT "deploy is broken" \u2014 no site, no repro, nothing to confirm
              or refute.

  --fix       "deploy appends the ignore lines for exactly what views render
               writes into the target's .gitignore, once: append-only and
               append-if-absent, so a second deploy adds nothing"   (I-0153)
              It BOUNDS the work. NOT "fix it" / "investigate".

  --evidence  "cmd-session.sh:146 tests for a .git DIRECTORY; inside a
               worktree .git is a file, so the stray scan is silently skipped"
              Reproduced, or the line that makes it true. NOT "confirmed".
`,
  log: `scrumux log \u2014 the append-only work log.

  scrumux log new --title T --did TEXT [--task T-0001] [--verified TEXT]
                  [--pending TEXT]... [--actor NAME]
  scrumux log show L-0001 [L-0002]...
  scrumux log show --task T-0001

\`new\` appends one entry and prints the new id. \`show\` reads entries by id,
or every entry logged under a task \u2014 an order that cites L-XXXX means that
entry; \`scrumux task brief\` inlines the ones its order cites.

WRITING THE FREE TEXT. The log is the receipt a cold session reads, so it
carries evidence rather than narrative. Real examples from this repo:

  --title     "The prune stopped eating the two files deploy promises never
               to overwrite (I-0152, I-0153)"                       (L-0285)
              NOT "fixed hook" \u2014 names neither the hook nor what changed.

  --did       "harness deploy's seeding lane creates project-standards.md and
               project-walls.conf create-if-absent; the I-0143 prune then
               removed any path the previous manifest names that payload.list
               lacks. Fixed by writing each seeded path into seeded.list and
               skipping it in the prune. sh tests/harness-tests.sh rc=0;
               3 files changed, 61 insertions"                      (L-0285)
              The verify command and its rc, the diffstat, every refusal hit
              and what was done about it. NOT "created X, verified Y".

  --verified  "Planted first: 11 new assertions in tests/harness-tests.sh
               shown FAILING against 444dfd1 in a detached worktree,
               including 'deploy DESTROYED .claude/rules/project-standards.md
               because a previous manifest claimed it'. After the fix:
               harness-tests exits 0"                               (L-0285)
              The EVIDENCE block verbatim. A check planted before it passed
              is worth more than one that was green from the start.

  --pending   "seals.json is a record records-check reads and is correctly
               left out, so the first views render on a never-sealed target
               still leaves that one file untracked"
              What is knowingly not done, and why it is safe to leave.
`,
  memory: `scrumux memory \u2014 one verb, \`add\`.

  scrumux memory add --by WHO [--file PATH]

Appends a read-only agent's memory block to governance/validator-memory.md,
creating that file with its header on first use. Reads stdin when --file
is absent. The agent cannot write it itself \u2014 that is the point of it
being read-only \u2014 so scrumux does.

Append-only: nothing already in the file is ever rewritten. A file that
EXISTS and is empty has lost its header and is refused rather than
recreated \u2014 restore it from git, or delete it and run this again.
`,
  rank: `scrumux rank \u2014 backlog priority. A rank means someone DECIDED this
priority; an absent rank is not a low priority, it is no decision.

  scrumux rank set <#|T-0001|F-0001> <new-#>
  scrumux rank clear <#|T-0001|F-0001>

An F-XXXX ranks a FEATURE, in its own list: scrumux backlog features
Current numbering: scrumux backlog tasks
`,
  records: `scrumux records \u2014 the repo validator.

  scrumux records check                    the governance sweep (default)
  scrumux records check --structure        the same, named explicitly
  scrumux records check --standards [dir]  the mechanical D-0012 corpus rules
  scrumux records check --all              both, structure first

Exit 0 clean, 1 with one instructive line per finding, 2 if it could not
run. WARNings never affect the exit code.

--standards is silent where no matching code exists, so language-agnostic
and non-code trees stay clean. A repo's own standards live in
.claude/rules/project-standards.md, and anything mechanical about them is
registered with \`scrumux health add\`. That is the one extension pathway
for this layer.

There is no --porcelain. --json carries every finding as a row with its
own tier, name and fix; a second machine format for one finding set is
the drift this validator exists to catch.
`,
  repair: `scrumux repair \u2014 the one sanctioned correction with no other scrumux path.

  scrumux repair journal <name.json> --apply '<jq>' --why TEXT --by WHO

The write and its log entry are ONE operation, so the record cannot be
forgotten (T-0100), and the journal is resealed so the edit is not
reported as tampering afterwards.
`,
  secret: `scrumux secret \u2014 credentials for this repo's own code, stored never printed.

  printf %s '<value>' | scrumux secret set NAME
  scrumux secret set NAME VALUE       (discouraged \u2014 see below)
  scrumux secret list
  scrumux secret remove NAME

VALUE as an argument lands in shell history, in the agent transcript and
in the JSON every PreToolUse hook receives, so pipe it on stdin instead.

.env is gitignored BEFORE the value is written, chmod 600, and the write
is refused outright if git already tracks it.

There is no \`scrumux secret get\`. Nothing prints a value back.
`,
  session: `scrumux session \u2014 the session close.

  scrumux session check

Exit 1 if any check FAILS. WARNs print and never change the exit code.

The six checks are the ways a green receipt can lie, plus the two
irreversible states:
  1. every task claiming done carries a receipt
  2. the receipt ran the command the order names
  3. the receipt is newer than the last edit it covers
  4. the receipt actually ran something
  5. no secret-shaped file in the working tree
  6. nothing left in_progress

Sprint discipline and live stubs print as WARNs: worth seeing, not worth
stopping for.
`,
  sprint: `scrumux sprint \u2014 sprints.

  scrumux sprint new --epic E-0001 [--parallel N] | --hotfix --issue I-0001
  scrumux sprint add SP-0001 T-0001
  scrumux sprint update SP-0001 --parallel N
  scrumux sprint descope SP-0001 T-0001 --reason TEXT
  scrumux sprint ratify SP-0001 --by WHO --authority direct|app:<session>|standing:D-0001
  scrumux sprint status SP-0001 complete|abandoned

--parallel N (default 1) is how many of this sprint's tasks may be
in_progress at once (D-0084). It is declared at planning because the sprint
is what User ratifies, and it can be changed only while the sprint is still
\`proposed\` -- changing it afterwards is a re-ratification, not an edit.

Ratification is User's alone. A task with log entries is
refused by descope: it was worked, and descoping does not erase that \u2014
retire it with \`scrumux task status <id> superseded --reason ...\` instead.

A SPRINT CARRIES NO OBJECTIVE FIELD, and that is deliberate: what this
sprint is FOR is the epic's description plus the titles and acceptance
checks of the tasks in it. So the objective is only ever as clear as those
are \u2014 see \`scrumux help task\` for the shape a title and a check take here.

WRITING THE FREE TEXT. The one prose field on this noun:

  descope --reason  "I-0112's read-side self-heal on staleness is a NEW
                     capability and the freeze holds; the issue stays
                     documented and nothing here depends on it landing this
                     sprint"
                    What changed, and where the work went. NOT "out of
                    scope" \u2014 the plan already said what was in scope, so
                    that only restates the act.
`,
  status: `scrumux status \u2014 journal reports.

  scrumux status session     orientation block; ALWAYS exits 0
  scrumux status planning    sprint report + decision queue + validation sweep
  scrumux status sprint      the sprint report alone
  scrumux status sweep       the validation sweep alone

\`session\` is wired to the SessionStart hook and answers "where do we pick
up?" from the journals and git alone \u2014 never from chat memory. It cannot
exit nonzero: a failure to brief would be a failure to start work.

\`sprint\` and \`planning\` are User-inspection surface (D-0073). Nothing in
an agent's path gates on either. T-0144 retired the exit-3 hard stop: an
unfinished ratified sprint prints a TELL, and whether to plan alongside it
is User's call, not a script's.
`,
  story: `scrumux story \u2014 one verb, \`new\`.

  scrumux story new --feature F-0001 --narrative TEXT
                    --criterion TEXT [--criterion TEXT]...

At least one --criterion is required (acceptance_criteria, minItems 1).
Prints the new id.

WRITING THE FREE TEXT. Real examples from this repo:

  --narrative  "As User, I accept a task directly \u2014 my documented approval
                is the review \u2014 and acceptance refuses any task whose verify
                receipt is red, so a false close cannot recur"      (S-0069)
               "As the <specific who>, I <do what> so that <outcome>". The
               who is named. NOT "As a user, I want acceptance to work".

  --criterion  "scrumux accept T-XXXX --authority refuses a red or missing
                receipt and is write-once"                          (S-0069)
               "harness verify executes every registered surface"   (S-0070)
               One observable behaviour each, confirmable by looking at the
               running thing or its record. A criterion with "and" in it is
               usually two. NOT "acceptance is reliable".
`,
  task: `scrumux task \u2014 the work items, from new through accepted.

  scrumux task new    --title T --check "acceptance check"
                      [--feature F-0001] [--story S-0001] [--desc TEXT]
                      [--issue I-0001]
  scrumux task order  T-0001 --scope TEXT --verify CMD [--story S-0001] [--light]
                      [--fails-when TEXT]
                      [--out TEXT]... --file "path | why [| expected diff]"
                      [--ref D-0001]... [--command CMD]... [--interface TEXT]...
                      [--shape TEXT]... [--artifact PATH]...
  scrumux task status T-0001 proposed|ready|in_progress|in_review|blocked|accepted|superseded
                      (superseded needs --reason TEXT, optionally --by T-0002;
                       blocked takes an optional --reason TEXT: what it waits on)
  scrumux task update T-0001 [--feature F-0001] [--story S-0001] [--title TEXT]
  scrumux task lint   T-0001 [T-0002 ...] | --feature F-0001 [--hotfix]
  scrumux task brief  T-0001 [--allow-unsprinted]
  scrumux task verify T-0001
  scrumux task accept T-0001 --by WHO --authority direct|standing:D-0001
  scrumux task reject T-0001 --by WHO --reason TEXT

task order REPLACES the order rather than amending it: every flag left
off is a field emptied, and omitting --artifact drops the key entirely.
Restate the whole order each time; scrumux task brief T-0001 reads back
what it currently carries.

--artifact names a file the task must PRODUCE; --file names one it reads
or changes, and \`scrumux graph gov bearing\` reads the split.

WRITING THE FREE TEXT. These fields are what a cold session reads a week
from now, so they are written for that reader. Real examples from this
repo, in the shape to copy:

  --title   "The close is not blocked by bytecode"                (T-0217)
            "The graph does not crash on a repo it has never seen" (T-0213)
            NOT "fix session-check" \u2014 a file and a verb, and nothing about
            what was wrong or how anyone would know it stopped being wrong.

  --check   "A tree containing __pycache__ or .pyc files closes session-check
             exit 0 when everything else traces to a worked task, an
             unauthorised source file still FAILs by name, and
             tests/session-check-tests.sh exits 0"                (T-0217)
            NOT "works" / "tests pass" \u2014 neither says what would have to be
            false for the check to fail.

  --scope   "Add build and OS artefacts to session-check's scope exemption at
             :202, alongside governance/*, *.MD and .claude/*. Reproduced in
             canon acceptance run 4 \u2014 the close FAILed on
             agents/__pycache__/*.pyc"                            (T-0217)

  --verify  "sh tests/session-check-tests.sh"                     (T-0217)
            ONE command, stating how to run it. A bare tests/*.sh path exits
            126 on the 27 suites that are mode 644 (D-0041).

  --fails-when "the vault is unreachable, or the probe gets a 404 instead of
             the folder listing"
            The broken state the verify command must catch. A check that
            skips, cannot fail, or writes into real shared data is green and
            proves nothing; saying what must turn it red is how a reviewer
            (and the app, at acceptance) tells the difference.

  --out     "Any other exemption. Only build and OS artefacts \u2014 a file an
             agent wrote is still a file an order must own"       (T-0217)

  --file    ".claude/scripts/session-check | :202, the exemption case"
            "agents/lib/governance_graph.py | the writer I-0111 traces to"
            The why is what to look FOR in that file, never what the file is.

--light marks an order minted from User's message rather than
prepackaged: lint drops its story and context-files findings to TELL, and
\`sprint add\` takes it storyless. The acceptance check and the ONE
verification command are required in both lanes (D-0072 boundary 4).

Acceptance is final authority's alone and is write-once. It refuses a
missing or red receipt, and it RE-RUNS the order's verification command
rather than reading the receipt: a receipt records what happened when the
agent ran it, and cannot record whether the command still proves what the
order asked.

Exit: 0 the assertion held, 1 it did not, 2 the command could not run.
`,
  views: `scrumux views \u2014 the generated MD views of the journals.

  scrumux views render

AI_LOG.MD, DECISIONS.MD and BACKLOG.MD are GENERATED. The sources of
truth are the JSON journals under governance/ (D-0002); the MD files are
projections and are never hand-edited.

Rendering also rebuilds governance/governance-graph.json, which is a
generated view of the same journals (I-0063). T-0187 took this OFF the
write path \u2014 every gov write was re-rendering three files and rebuilding
the whole graph, ~0.15s of a ~0.19s write, for views nobody reads
mid-session \u2014 so it happens on demand and at the session close.
`
};
var NOUN_SUMMARY = [
  ["backlog", "open work in priority order, tasks or features"],
  ["decide", "ratified decisions"],
  ["epic", "epics"],
  ["exception", "process findings on a session, never code discoveries"],
  ["feature", "features"],
  ["graph", "the two derived graphs: code (what calls what) and gov (the journals)"],
  ["harness", "install the machinery into a repo, and prove it is installed there"],
  ["health", "this repo's registered health checks"],
  ["issue", "defects, drift, harness problems and ideas"],
  ["log", "the append-only work log"],
  ["memory", "a read-only agent's memory block"],
  ["rank", "backlog priority"],
  ["records", "the repo validator: journal schemas, refs, rule chains, rosters"],
  ["repair", "a bounded correction with no other scrumux path"],
  ["secret", "credentials for this repo's own code, stored never printed"],
  ["session", "the session close"],
  ["sprint", "sprints"],
  ["status", "journal reports: session, planning, sprint, sweep"],
  ["story", "user stories"],
  ["task", "the work items, from new through accepted"],
  ["views", "regenerate the MD views from the journals"]
];

// src/cli/usage.ts
var NOUNS = NOUN_SUMMARY.map(([n]) => n);
function nounKnown(noun) {
  return Object.prototype.hasOwnProperty.call(NOUN_USAGE, noun);
}
function usageNoun(noun) {
  const t = NOUN_USAGE[noun];
  if (t === void 0) {
    return `scrumux ${noun} \u2014 no usage block is compiled into this build.
`;
  }
  return t;
}
var HEAD = `scrumux \u2014 the harness command surface. One command, nouns and verbs.

usage: scrumux <noun> <verb> [--json] [args...]
       scrumux help <noun>          the verbs and flags of one noun
       scrumux version              the CLI contract version

nouns:
`;
var TAIL = `
Every verb takes --json and emits exactly ONE object on stdout carrying
\`ok\`, an \`exit\` code and a per-check array. Exit 0 means the assertion
held, 1 means it did not, 2 means the command could not run. Advisories
(WARN/TELL) never change the exit code.
`;
function usageTop() {
  const width = NOUN_SUMMARY.reduce((w, [n]) => Math.max(w, n.length), 0);
  const rows5 = NOUN_SUMMARY.map(([n, s2]) => `  ${n.padEnd(width)}  ${s2}`).join("\n");
  return `${HEAD}${rows5}
${TAIL}`;
}

// src/cli/ungoverned.ts
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
var UNGOVERNED_ALLOWED_NOUNS = "backlog graph harness records status";
var ALLOWED = new Set(UNGOVERNED_ALLOWED_NOUNS.split(" "));
var HELPISH = /* @__PURE__ */ new Set(["help", "-h", "--help"]);
function findMarker(root) {
  let dir = root;
  for (; ; ) {
    const p = join(dir, ".scrumux-ungoverned");
    if (existsSync(p)) return p;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}
function isAllowed(noun, verb) {
  if (ALLOWED.has(noun)) return true;
  if (HELPISH.has(noun) || noun === "version" || noun === "--version") return true;
  return HELPISH.has(verb);
}
function refusalMessage(command, marker) {
  let why = "";
  try {
    const first = readFileSync(marker, "utf8").split("\n")[0];
    why = first ?? "";
  } catch {
    why = "";
  }
  return `this repo is ungoverned by scrumux and '${command}' writes records or runs the governed workflow \u2014 refused.
  The marker: ${marker}${why === "" ? "" : ` \u2014 "${why}"`}
  Why: this repo BUILDS scrumux, so it must exist OUTSIDE the harness.
  Governing it with its own tool contaminates it with transient, often
  flawed policies and bakes their gaps into the permanent record, where
  the next session reads them as settled law.
  Rulings for this repo go directly in RULINGS.md at the repo root. That
  file is the whole governance record here \u2014 there is no journal, no
  sprint and no decision entry to write.
  Still available: ${UNGOVERNED_ALLOWED_NOUNS}, plus help and version.
  This refusal is working as intended. It is not a wall to route around.`;
}

// src/journal/paths.ts
import { execFileSync } from "node:child_process";
import { resolve, dirname as dirname2 } from "node:path";
function gitToplevel(cwd) {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const t = out.trim();
    return t.length > 0 ? t : null;
  } catch {
    return null;
  }
}
function resolveRoots(cwd, scriptsDir, env = process.env) {
  let root;
  const govRoot = env["GOV_ROOT"];
  if (govRoot !== void 0 && govRoot !== "") {
    root = govRoot;
  } else {
    root = gitToplevel(cwd) ?? resolve(scriptsDir, "..", "..");
  }
  let workRoot;
  const explicitWork = env["WORK_ROOT"];
  if (explicitWork !== void 0 && explicitWork !== "") {
    workRoot = explicitWork;
  } else {
    workRoot = gitToplevel(cwd) ?? root;
  }
  return { root, gov: resolve(root, "governance"), workRoot };
}

// src/cli/capture.ts
var ReportRefusal = class extends Error {
  constructor(detail) {
    super(detail);
    this.detail = detail;
    this.name = "ReportRefusal";
  }
};
var Report = class {
  /**
   * @param json  the `--json` flag: buffer for `.data.lines`, or write through.
   * @param io    where a human-mode line goes the moment it exists.
   */
  constructor(json, io) {
    this.json = json;
    this.io = io;
  }
  buf = "";
  /** One report line, written through in human mode or buffered under `--json`.
   *  The argument may itself be multi-line. */
  line(s2) {
    if (this.json) this.buf += s2 + "\n";
    else this.io.out(s2 + "\n");
  }
  /** Several lines, each disposed of the same way as `line`. */
  lines(ss) {
    for (const s2 of ss) this.line(s2);
  }
  /**
   * The buffered lines, split and with blank ones dropped. Empty in human
   * mode by construction: nothing was buffered, it was all written through.
   */
  dataLines() {
    return this.buf.split("\n").filter((l) => l.length > 0);
  }
};

// src/journal/read.ts
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";
import { basename } from "node:path";
var DEFAULT_JOURNAL = '{"entries":[]}';
function readJournal(path, defaultJson = DEFAULT_JOURNAL) {
  if (!existsSync2(path)) {
    return { kind: "absent", value: parsePreservingNumbers(defaultJson) };
  }
  let raw;
  try {
    raw = readFileSync2(path, "utf8");
  } catch (e) {
    return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) };
  }
  try {
    return { kind: "ok", value: parsePreservingNumbers(raw), raw };
  } catch (e) {
    return { kind: "unreadable", error: e instanceof Error ? e.message : String(e) };
  }
}
function journalUnreadable(path) {
  const n = basename(path);
  return `governance/${n} is not valid JSON \u2014 restore it from git, or repair it with scrumux repair journal ${n}`;
}

// src/nouns/lib/jqlike.ts
function truthy(v) {
  return v !== null && v !== void 0 && v !== false;
}
function alt(v, fallback) {
  return truthy(v) ? v : fallback;
}
function compact(v) {
  if (v === null || v === void 0) return "null";
  if (v instanceof RawNumber) return canonNumber(v.text);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return jqDouble(v);
  if (typeof v === "string") return jqString(v);
  if (Array.isArray(v)) return "[" + v.map(compact).join(",") + "]";
  const o = v;
  return "{" + Object.keys(o).map((k2) => jqString(k2) + ":" + compact(o[k2])).join(",") + "}";
}
function interp(v) {
  return typeof v === "string" ? v : compact(v);
}
function numberOf(v) {
  if (v instanceof RawNumber) return Number(v.text);
  if (typeof v === "number") return v;
  return null;
}
function rank(v) {
  if (v === null || v === void 0) return 0;
  if (v === false) return 1;
  if (v === true) return 2;
  if (v instanceof RawNumber || typeof v === "number") return 3;
  if (typeof v === "string") return 4;
  if (Array.isArray(v)) return 5;
  return 6;
}
function cmp(a, b) {
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra < rb ? -1 : 1;
  switch (ra) {
    case 0:
    case 1:
    case 2:
      return 0;
    case 3: {
      const x = numberOf(a);
      const y = numberOf(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    case 4:
      return cmpString(a, b);
    case 5: {
      const x = a;
      const y = b;
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) {
        const c = cmp(x[i], y[i]);
        if (c !== 0) return c;
      }
      return x.length < y.length ? -1 : x.length > y.length ? 1 : 0;
    }
    default: {
      const x = a;
      const y = b;
      const kx = Object.keys(x).sort(cmpString);
      const ky = Object.keys(y).sort(cmpString);
      const c = cmp(kx, ky);
      if (c !== 0) return c;
      for (const k2 of kx) {
        const d = cmp(x[k2], y[k2]);
        if (d !== 0) return d;
      }
      return 0;
    }
  }
}
function cmpString(a, b) {
  const x = Array.from(a);
  const y = Array.from(b);
  const n = Math.min(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const ca = x[i].codePointAt(0);
    const cb = y[i].codePointAt(0);
    if (ca !== cb) return ca < cb ? -1 : 1;
  }
  return x.length < y.length ? -1 : x.length > y.length ? 1 : 0;
}
function sortBy(items, key) {
  return items.map((v, i) => ({ v, i, k: key(v) })).sort((a, b) => cmp(a.k, b.k) || a.i - b.i).map((x) => x.v);
}
function unique(items) {
  const sorted = [...items].sort(cmp);
  const out = [];
  for (const v of sorted) {
    if (out.length === 0 || cmp(out[out.length - 1], v) !== 0) out.push(v);
  }
  return out;
}
function asObject(v) {
  if (v === null || v === void 0) return null;
  if (typeof v !== "object") return null;
  if (Array.isArray(v)) return null;
  if (v instanceof RawNumber) return null;
  return v;
}
function field(v, ...path) {
  let cur = v ?? null;
  for (const k2 of path) {
    const o = asObject(cur);
    if (o === null) return null;
    cur = Object.prototype.hasOwnProperty.call(o, k2) ? o[k2] : null;
  }
  return cur;
}
function asArray(v) {
  return Array.isArray(v) ? v : null;
}
function asString(v) {
  return typeof v === "string" ? v : null;
}
function entriesOf(doc) {
  return asArray(field(doc, "entries")) ?? [];
}
function strOr(v, fallback = "") {
  const a = alt(v, fallback);
  return typeof a === "string" ? a : interp(a);
}
function arrayOf(v, key) {
  return asArray(field(v, key)) ?? [];
}
function joinJq(xs, sep) {
  return xs.map((v) => v === null || v === void 0 ? "" : interp(v)).join(sep);
}
function codepoints(s2) {
  return Array.from(s2);
}
function clength(s2) {
  return codepoints(s2).length;
}
function cslice(s2, from, to) {
  return codepoints(s2).slice(from, to).join("");
}

// src/nouns/backlog.ts
import { existsSync as existsSync3 } from "node:fs";
import { join as join2 } from "node:path";
var VERBS_TSV = `tasks	open tasks in priority order
features	features in priority order, their own address space
`;
var USAGE = NOUN_USAGE["backlog"] ?? "";
function requireParses(path, message) {
  const r = readJournal(path);
  if (r.kind === "unreadable") throw new ReportRefusal(message);
  return r.value;
}
function descLine(e, full, verb) {
  const raw = field(e, "description");
  const d = typeof raw === "string" ? raw : "";
  if (clength(d) === 0) return [];
  const flat = d.replace(/\n/g, " ");
  if (full) return [`     ${flat}`];
  return [clength(d) > 150 ? `     ${cslice(flat, 0, 150)}\u2026  (scrumux backlog ${verb} --full)` : `     ${flat}`];
}
function ranked(items, row, desc, separator) {
  const withRank = sortBy(items.filter((e) => field(e, "rank") !== null), (e) => field(e, "rank"));
  const without = sortBy(items.filter((e) => field(e, "rank") === null), (e) => field(e, "id"));
  const out = [];
  withRank.forEach((e, i) => {
    out.push(`${i + 1}. ${row(e)}`);
    out.push(...desc(e));
  });
  if (without.length > 0) {
    out.push("");
    out.push(`--- Never ranked (${without.length}) \u2014 no priority set. Place one: ${separator} ---`);
    for (const e of without) {
      out.push(`- ${row(e)}`);
      out.push(...desc(e));
    }
  }
  return out;
}
function listFeatures(r, gov, today, full) {
  r.line(`=== FEATURES (${today}) \u2014 ranked = deliberate priority. Move: scrumux rank set <F-XXXX> <new-#> ===`);
  const designPath = join2(gov, "design.json");
  if (!existsSync3(designPath)) {
    r.line("(no design.json \u2014 nothing to rank)");
    return;
  }
  const design = requireParses(designPath, journalUnreadable(designPath));
  let tasks = { entries: [] };
  const tasksPath3 = join2(gov, "tasks.json");
  if (existsSync3(tasksPath3)) tasks = requireParses(tasksPath3, journalUnreadable(tasksPath3));
  const es = entriesOf(design);
  const epics = es.filter((e) => field(e, "kind") === "epic");
  const feats = es.filter((e) => field(e, "kind") === "feature");
  const taskEntries = entriesOf(tasks);
  const epicOf = (fid) => {
    const owning = epics.filter((e) => arrayOf(e, "features").some((x) => x === fid));
    return owning.length === 0 ? "unassigned" : interp(field(owning[0], "id"));
  };
  const counts2 = (f) => {
    const ns = arrayOf(f, "stories").length;
    const nt = taskEntries.filter((t) => field(t, "feature") === field(f, "id") && field(t, "status") !== "accepted" && field(t, "status") !== "superseded").length;
    return `stories=${ns} open-tasks=${nt}`;
  };
  const row = (f) => `${interp(field(f, "id"))} ${interp(field(f, "name"))}  (${epicOf(field(f, "id"))})  ${counts2(f)}`;
  const list = ranked(feats, row, (f) => descLine(f, full, "features"), "scrumux rank set <F-XXXX> <#>");
  if (list.length > 0) r.line(list.join("\n"));
  else r.line("(no features)");
}
function listTasks(r, gov, today, full) {
  r.line(`=== BACKLOG (${today}) \u2014 ranked = deliberate priority. Move: scrumux rank set <#|T-XXXX> <new-#> ===`);
  const tasksPath3 = join2(gov, "tasks.json");
  if (!existsSync3(tasksPath3)) {
    r.line("(no tasks.json \u2014 nothing to rank)");
    return;
  }
  const tasks = requireParses(tasksPath3, journalUnreadable(tasksPath3));
  let sprints = { entries: [] };
  const sprintsPath3 = join2(gov, "sprints.json");
  if (existsSync3(sprintsPath3)) sprints = requireParses(sprintsPath3, journalUnreadable(sprintsPath3));
  const sprintEntries = entriesOf(sprints);
  const sprintOf = (tid) => {
    const live = sprintEntries.filter((s2) => {
      const st = field(s2, "status");
      return (st === "ratified" || st === "proposed") && arrayOf(s2, "tasks").some((x) => x === tid);
    });
    return live.length === 0 ? "" : `  [${interp(field(live[0], "id"))} ${interp(field(live[0], "status"))}]`;
  };
  const row = (t) => {
    const feature = field(t, "feature");
    const story = field(t, "story");
    return `${interp(field(t, "id"))} [${interp(field(t, "status"))}] ${interp(field(t, "title"))}` + (truthy(feature) ? `  (${interp(feature)}${truthy(story) ? `/${interp(story)}` : ""})` : "") + sprintOf(field(t, "id"));
  };
  const open = entriesOf(tasks).filter((t) => field(t, "status") !== "accepted" && field(t, "status") !== "superseded");
  const list = ranked(open, row, (t) => descLine(t, full, "tasks"), "scrumux rank set <T-XXXX> <#>");
  if (list.length > 0) r.line(list.join("\n"));
  else r.line("(no open tasks)");
}
var MODULE = {
  verbs: () => VERBS_TSV,
  usage: () => USAGE,
  run(cli, ctx, verb, args) {
    if (verb !== "tasks" && verb !== "features") {
      return cli.dieUsage(`unknown verb '${verb}' for noun backlog \u2014 verbs: tasks, features. See: scrumux help backlog`);
    }
    const report = new Report(cli.json, ctx.io);
    try {
      let full = false;
      for (const a of args) {
        if (a === "--full") full = true;
        else throw new ReportRefusal(`backlog: unknown flag ${a} \u2014 usage: scrumux backlog tasks|features [--full]`);
      }
      if (verb === "features") listFeatures(report, ctx.roots.gov, ctx.today, full);
      else listTasks(report, ctx.roots.gov, ctx.today, full);
    } catch (e) {
      if (!(e instanceof ReportRefusal)) throw e;
      if (cli.json) ctx.io.exit(2);
      return cli.die(e.detail);
    }
    if (cli.json) cli.data({ lines: report.dataLines() });
    return cli.emit("");
  }
};

// src/nouns/decide.ts
import { join as join8 } from "node:path";

// src/journal/beat.ts
function emitted(cli, id) {
  cli.data({ id });
  cli.say(id);
  return cli.emit("");
}
function beat(cli, state, next) {
  cli.say(`  ${state}`);
  if (next !== void 0 && next !== "") cli.say(`  next: ${next}`);
}
function attested(cli, what, next) {
  cli.say(`  ${what} recorded as ATTESTED \u2014 your claim about your own work, pending verification.`);
  cli.say("  You may initiate verification; you may not be the thing that verifies it.");
  if (next !== void 0 && next !== "") cli.say(`  next: ${next}`);
}

// src/journal/refs.ts
import { existsSync as existsSync4, readFileSync as readFileSync3 } from "node:fs";
import { join as join3 } from "node:path";

// src/journal/refusal.ts
var JournalRefusal = class extends Error {
  constructor(message) {
    super(message);
    this.name = "JournalRefusal";
  }
};
function refusing(cli, fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof JournalRefusal) return cli.die(e.message);
    throw e;
  }
}

// src/journal/standing.ts
var AUTHORITY_NONE = "none";
var AUTHORITY_UNKNOWN = "unknown";
function strField(row, key) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return "";
  const v = row[key];
  return typeof v === "string" ? v : "";
}
function standingOf(row, statusKey = "status") {
  const raw = strField(row, statusKey);
  const status = raw === "proposed" || raw === "ratified" || raw === "rejected" ? raw : null;
  const authority = strField(row, "authority");
  return {
    status: status ?? "ratified",
    authority: authority !== "" ? authority : AUTHORITY_UNKNOWN,
    legacy: status === null,
    acknowledgedBy: strField(row, "acknowledged_by")
  };
}
function authorityProblem(guard) {
  try {
    guard();
    return null;
  } catch (e) {
    if (e instanceof JournalRefusal) return e.message;
    throw e;
  }
}
function bindingSupersedes(row) {
  const sup = strField(row, "supersedes");
  if (sup === "") return null;
  return standingOf(row).status === "ratified" ? sup : null;
}

// src/journal/refs.ts
function refJournal(gov, id) {
  if (id.startsWith("D-")) return join3(gov, "decisions.json");
  if (id.startsWith("I-")) return join3(gov, "issues.json");
  if (id.startsWith("T-")) return join3(gov, "tasks.json");
  if (id.startsWith("L-")) return join3(gov, "log.json");
  if (id.startsWith("SF-") || id.startsWith("S-") || id.startsWith("F-") || id.startsWith("E-") || id.startsWith("C-")) {
    return join3(gov, "design.json");
  }
  return null;
}
function load(path) {
  if (!existsSync4(path)) return null;
  try {
    return parsePreservingNumbers(readFileSync3(path, "utf8"));
  } catch {
    return null;
  }
}
function entriesOf2(doc) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  const e = doc["entries"];
  return Array.isArray(e) ? e : [];
}
function fieldOf(row, key) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return void 0;
  return row[key];
}
function refExists(path, id, pick = (r) => fieldOf(r, "id")) {
  const doc = load(path);
  if (doc === null) return false;
  return entriesOf2(doc).some((r) => pick(r) === id);
}
function refExistsAny(gov, id) {
  const path = refJournal(gov, id);
  if (path === null) return false;
  return refExists(path, id);
}
function requireTaskRef(gov, id) {
  if (refExists(join3(gov, "tasks.json"), id)) return;
  throw new JournalRefusal(
    `task ${id} not found in governance/tasks.json \u2014 create it first: scrumux task new --title ... --check ...`
  );
}
function jqRaw(v) {
  if (v === void 0 || v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}
function refResolve(gov, id) {
  const path = refJournal(gov, id);
  if (path === null) return null;
  const doc = load(path);
  if (doc === null) return "UNRESOLVED";
  const rows5 = entriesOf2(doc);
  const pickField = (kind, key, fallbackKey) => {
    const hits = rows5.filter((r) => fieldOf(r, "id") === id && (kind === null || fieldOf(r, "kind") === kind)).map((r) => {
      const v = fieldOf(r, key);
      if (fallbackKey !== void 0 && (v === void 0 || v === null || v === false)) {
        return jqRaw(fieldOf(r, fallbackKey));
      }
      return jqRaw(v);
    });
    return hits.join("\n");
  };
  let text2;
  if (id.startsWith("D-")) {
    text2 = pickField(null, "title");
    const own = rows5.find((r) => fieldOf(r, "id") === id);
    const st = own === void 0 ? null : standingOf(own);
    if (st !== null && st.status !== "ratified") text2 = `${text2} [${st.status.toUpperCase()} \u2014 not binding]`;
    const sup = rows5.find((r) => bindingSupersedes(r) === id);
    const supId = sup === void 0 ? "" : jqRawOrEmpty(fieldOf(sup, "id"));
    if (supId !== "") text2 = `${text2} [SUPERSEDED by ${supId} \u2014 read that instead]`;
  } else if (id.startsWith("I-")) {
    text2 = pickField(null, "summary");
  } else if (id.startsWith("T-") || id.startsWith("L-")) {
    text2 = pickField(null, "title");
  } else if (id.startsWith("SF-")) {
    text2 = pickField("surface", "name");
  } else if (id.startsWith("S-")) {
    text2 = pickField("story", "narrative");
  } else if (id.startsWith("F-")) {
    text2 = pickField("feature", "name");
  } else if (id.startsWith("E-")) {
    text2 = pickField("epic", "name");
  } else {
    text2 = pickField("control", "name", "id");
  }
  return text2 === "" ? "UNRESOLVED" : text2;
}
function jqRawOrEmpty(v) {
  if (v === void 0 || v === null || v === false) return "";
  return jqRaw(v);
}

// src/journal/seals.ts
import { createHash } from "node:crypto";
import { existsSync as existsSync5, readFileSync as readFileSync4, readdirSync, renameSync, rmSync, statSync as statSync2, writeFileSync } from "node:fs";
import { join as join4 } from "node:path";

// src/util/fs-predicates.ts
import { accessSync, constants, statSync } from "node:fs";
function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}
function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
function isExecutable(p) {
  try {
    accessSync(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
function isExecutableFile(p) {
  try {
    const st = statSync(p);
    return st.isFile() && (st.mode & 73) !== 0;
  } catch {
    return false;
  }
}

// src/journal/lock.ts
import { mkdirSync, rmdirSync } from "node:fs";
var DEFAULT_LOCK_TRIES = 100;
var LOCK_SLEEP_MS = 100;
function lockPathOf(path) {
  return `${path}.lock`;
}
function triesFrom(env) {
  const raw = env["JOURNAL_LOCK_TRIES"];
  if (raw === void 0 || raw === "") return DEFAULT_LOCK_TRIES;
  if (!/^-?[0-9]+$/.test(raw.trim())) return 0;
  return Number(raw.trim());
}
function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function staleLockMessage(path) {
  const lock = lockPathOf(path);
  return `timed out waiting for the journal lock ${lock} \u2014 another scrumux process is writing ${path}, or a previous one died holding it. If no scrumux is running, clear it: rmdir '${lock}'`;
}
function journalLock(path, env = process.env) {
  const lock = lockPathOf(path);
  const tries = triesFrom(env);
  let n = 0;
  for (; ; ) {
    try {
      mkdirSync(lock);
      return;
    } catch (e) {
      const code = e.code;
      if (code === "ENOENT") {
        throw new JournalRefusal(
          `cannot take the journal lock ${lock} \u2014 its parent directory does not exist`
        );
      }
      n += 1;
      if (!(n < tries)) throw new JournalRefusal(staleLockMessage(path));
      sleepSync(LOCK_SLEEP_MS);
    }
  }
}
function journalUnlock(path) {
  try {
    rmdirSync(lockPathOf(path));
  } catch {
  }
}

// src/journal/seals.ts
var SEAL_FILE_NAME = "seals.json";
var SEALED_JOURNALS = [
  "design.json",
  "tasks.json",
  "sprints.json",
  "decisions.json",
  "issues.json",
  "exceptions.json",
  "log.json",
  "repo-health.json"
];
function sealOf(path) {
  return createHash("sha256").update(readFileSync4(path)).digest("hex");
}
function govJsonFiles(gov) {
  let names;
  try {
    names = readdirSync(gov);
  } catch {
    return [];
  }
  return names.filter((n) => !n.startsWith(".")).filter((n) => n.endsWith(".json")).filter((n) => {
    try {
      return statSync2(join4(gov, n)).isFile();
    } catch {
      return false;
    }
  }).sort(cmpString);
}
function sealJournals(gov, today) {
  if (!isDir(gov)) return;
  let out = `{
  "sealed_at": "${today}",
  "journals": {`;
  let first = true;
  for (const name of SEALED_JOURNALS) {
    const p = join4(gov, name);
    if (!existsSync5(p) || !isFile(p)) continue;
    if (!first) out += ",";
    first = false;
    out += `
    "${name}": "${sealOf(p)}"`;
  }
  out += "\n  }\n}\n";
  const tmp = join4(gov, `${SEAL_FILE_NAME}.tmp.${process.pid}`);
  writeFileSync(tmp, out);
  renameSync(tmp, join4(gov, SEAL_FILE_NAME));
}
function sealBootstrap(gov, today) {
  const seals = join4(gov, SEAL_FILE_NAME);
  if (existsSync5(seals)) return;
  let hasContent = false;
  for (const name of govJsonFiles(gov)) {
    if (name === SEAL_FILE_NAME) continue;
    let doc;
    try {
      doc = parsePreservingNumbers(readFileSync4(join4(gov, name), "utf8"));
    } catch {
      continue;
    }
    const entries = field(doc, "entries");
    const n = Array.isArray(entries) ? entries.length : entries === null ? 0 : lengthOf(entries);
    if (n > 0) {
      hasContent = true;
      break;
    }
  }
  sealJournals(gov, today);
  if (hasContent && existsSync5(seals)) {
    let doc;
    try {
      doc = parsePreservingNumbers(readFileSync4(seals, "utf8"));
    } catch {
      return;
    }
    const o = asObject(doc);
    if (o === null) return;
    const next = { ...o, bootstrapped_over_existing_content: today };
    const tmp = `${seals}.tmp.${process.pid}`;
    const text2 = jqFormat(next);
    writeFileSync(tmp, text2);
    renameSync(tmp, seals);
  }
}
function sealsShapeProblem(gov) {
  const p = join4(gov, SEAL_FILE_NAME);
  if (!existsSync5(p)) return "";
  let doc;
  try {
    doc = parsePreservingNumbers(readFileSync4(p, "utf8"));
  } catch {
    return `${SEAL_FILE_NAME} is not valid JSON, so no journal is being checked against it`;
  }
  const journals = asObject(field(doc, "journals"));
  if (journals === null) {
    return `${SEAL_FILE_NAME} has no .journals object, so every journal compares clean and nothing is being checked`;
  }
  if (Object.keys(journals).length === 0) {
    return `${SEAL_FILE_NAME} records zero sealed journals, so nothing is being checked`;
  }
  return "";
}
function brokenSeals(gov) {
  const p = join4(gov, SEAL_FILE_NAME);
  if (!existsSync5(p)) return [];
  let doc;
  try {
    doc = parsePreservingNumbers(readFileSync4(p, "utf8"));
  } catch {
    return [];
  }
  const journals = asObject(field(doc, "journals"));
  if (journals === null) return [];
  const out = [];
  for (const [name, want] of Object.entries(journals)) {
    const jp = join4(gov, name);
    if (!existsSync5(jp) || !isFile(jp)) continue;
    if (sealOf(jp) !== String(want)) out.push(name);
  }
  return out;
}
function resealOne(gov, path, today, env = process.env) {
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (!SEALED_JOURNALS.includes(base)) return null;
  const seals = join4(gov, SEAL_FILE_NAME);
  if (!existsSync5(seals) || !isFile(seals)) return null;
  let hash;
  try {
    hash = sealOf(path);
  } catch {
    return null;
  }
  journalLock(seals, env);
  let failed = false;
  const tmp = `${seals}.tmp.${process.pid}`;
  try {
    let doc;
    try {
      doc = parsePreservingNumbers(readFileSync4(seals, "utf8"));
    } catch {
      throw new Error("unparseable");
    }
    const o = asObject(doc);
    if (o === null) throw new Error("not an object");
    const next = { ...o };
    next["sealed_at"] = today;
    const journals = asObject(next["journals"]);
    const merged = journals === null ? {} : { ...journals };
    merged[base] = hash;
    const kept = {};
    for (const [k2, v] of Object.entries(merged)) {
      if (SEALED_JOURNALS.includes(k2)) kept[k2] = v;
    }
    next["journals"] = kept;
    const text2 = jqFormat(next);
    writeFileSync(tmp, text2);
    renameSync(tmp, seals);
  } catch {
    failed = true;
  } finally {
    rmSync(tmp, { force: true });
    journalUnlock(seals);
  }
  if (!failed) return null;
  return `${SEAL_FILE_NAME}: could not update the seal for ${base} \u2014 the next records check will report it as changed outside scrumux, wrongly. Re-run the write, or reseal with: scrumux repair journal ${base}`;
}
function lengthOf(v) {
  const o = asObject(v);
  if (o !== null) return Object.keys(o).length;
  if (typeof v === "string") return Array.from(v).length;
  return 0;
}

// src/journal/write.ts
import {
  chmodSync,
  copyFileSync,
  existsSync as existsSync6,
  mkdirSync as mkdirSync2,
  readFileSync as readFileSync5,
  readdirSync as readdirSync2,
  renameSync as renameSync2,
  rmSync as rmSync2,
  statSync as statSync3,
  utimesSync,
  writeFileSync as writeFileSync2
} from "node:fs";
import { basename as basename2, dirname as dirname3, join as join5 } from "node:path";

// src/journal/ids.ts
function stripPrefix(text2, prefix) {
  const p = `${prefix}-`;
  return text2.startsWith(p) ? text2.slice(p.length) : text2;
}
function nextId(ids, prefix, journal = "the journal") {
  let max = 0;
  for (const raw of ids) {
    if (raw === null || raw === void 0) continue;
    let n;
    if (raw instanceof RawNumber || typeof raw === "number") {
      n = Number(raw instanceof RawNumber ? raw.text : raw);
      if (!Number.isFinite(n)) n = NaN;
    } else if (typeof raw === "string") {
      const suffix = stripPrefix(raw, prefix);
      n = /^[0-9]+$/.test(suffix) ? Number(suffix) : NaN;
    } else {
      n = NaN;
    }
    if (!Number.isFinite(n)) {
      throw new JournalRefusal(
        `refusing to allocate the next ${prefix}- id: ${journal} holds the id ${JSON.stringify(raw)}, whose suffix is not a number \u2014 bash would fall back to ${prefix}-0001 here and hand out an id that already exists (D-0085/OQ-7). Repair the id first: scrumux repair journal ${journal}`
      );
    }
    if (n > max) max = n;
  }
  return formatId(prefix, max + 1);
}
function formatId(prefix, n) {
  return `${prefix}-${String(n).padStart(4, "0")}`;
}

// src/journal/write.ts
var DEFAULT_JOURNAL_BACKUPS = 10;
var BACKUP_DIR_NAME = ".backups";
function writeJson(path, transform, opts) {
  const env = opts.env ?? process.env;
  journalLock(path, env);
  try {
    return writeJsonBody(path, transform, opts);
  } finally {
    journalUnlock(path);
  }
}
function appendWithId(path, idStream2, prefix, transform, opts) {
  const env = opts.env ?? process.env;
  journalLock(path, env);
  try {
    const doc = readForWrite(path);
    const id = nextId(idStream2(doc), prefix, basename2(path));
    const res = writeJsonBody(path, (d) => transform(d, id), opts, doc);
    return { ...res, id };
  } finally {
    journalUnlock(path);
  }
}
function readForWrite(path) {
  try {
    return parsePreservingNumbers(readFileSync5(path, "utf8"));
  } catch {
    throw new JournalRefusal(`jq write failed for ${path}`);
  }
}
function writeJsonBody(path, transform, opts, preread) {
  const env = opts.env ?? process.env;
  const before = preread ?? readForWrite(path);
  let out;
  try {
    out = transform(before);
  } catch (e) {
    if (e instanceof JournalRefusal) throw e;
    throw new JournalRefusal(`jq write failed for ${path}`);
  }
  const bytes = out === void 0 ? "" : jqFormat(out);
  if (bytes.length === 0) {
    throw new JournalRefusal(
      `refusing to write ${path}: the jq filter produced NO output, which would truncate the journal to zero bytes \u2014 check the filter (a streaming '.entries[] | select(...)' matching nothing does this)`
    );
  }
  const entriesAfter = entriesArrayOf(out);
  if (entriesAfter === null) {
    throw new JournalRefusal(
      `refusing to write ${path}: the jq filter produced output that is not an object with an entries array \u2014 check the filter (T-0157: every governance journal is {entries:[...]})`
    );
  }
  const nBefore = jqLength(fieldOf2(before, "entries"));
  const nAfter = entriesAfter.length;
  if (nAfter < nBefore && env["ALLOW_ENTRY_REMOVAL"] !== "1") {
    const lost = nBefore - nAfter;
    throw new JournalRefusal(
      `refusing to write ${path}: this would DROP ${lost} of ${nBefore} entries, leaving ${nAfter}. Governance journals are append-mostly and nothing in the CLI removes an entry by design. If the filter is meant to select rather than delete, it is probably a map/select shape that discards non-matching rows -- note that in jq, '(empty) as $x | body' produces nothing, so a stream binding that finds no match drops the whole row. If the removal IS intended, re-run with ALLOW_ENTRY_REMOVAL=1 and say why in the repair's --why.`
    );
  }
  const backup = takeBackup(path, opts);
  const tmp = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync2(tmp, bytes);
    renameSync2(tmp, path);
  } catch {
    rmSync2(tmp, { force: true });
    throw new JournalRefusal(`cannot move temp file onto ${path}`);
  }
  const resealWarning = resealOne(opts.gov, path, opts.today, env);
  if (resealWarning !== null) {
    const err = opts.err ?? ((s2) => void process.stderr.write(s2));
    err(resealWarning + "\n");
  }
  return { path, bytes, entriesBefore: nBefore, entriesAfter: nAfter, backup, resealWarning };
}
function takeBackup(path, opts) {
  const gov = opts.gov;
  if (!isDir(gov)) return null;
  const dir = join5(gov, BACKUP_DIR_NAME);
  try {
    mkdirSync2(dir, { recursive: true });
  } catch {
    return null;
  }
  try {
    const ignore = join5(dir, ".gitignore");
    if (!existsSync6(ignore)) writeFileSync2(ignore, "*\n");
  } catch {
  }
  const base = basename2(path);
  const dest = backupName(dir, base, (opts.now ?? (() => /* @__PURE__ */ new Date()))());
  try {
    copyFileSync(path, dest);
    const st = statSync3(path, { bigint: true });
    chmodSync(dest, Number(st.mode & 0o7777n));
    utimesSync(dest, Number(st.atimeNs) / 1e9, Number(st.mtimeNs) / 1e9);
  } catch {
    return null;
  }
  pruneBackups(dir, base, opts.env ?? process.env);
  return dest;
}
function backupName(dir, base, now) {
  const p = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${p(now.getFullYear(), 4)}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  const head = join5(dir, `${base}.${stamp}.${process.pid}`);
  if (!existsSync6(head)) return head;
  for (let n = 2; ; n++) {
    const cand = `${head}-${n}`;
    if (!existsSync6(cand)) return cand;
  }
}
function pruneBackups(dir, base, env) {
  const raw = env["JOURNAL_BACKUPS"];
  const keep = raw !== void 0 && /^[0-9]+$/.test(raw) ? Number(raw) : DEFAULT_JOURNAL_BACKUPS;
  let names;
  try {
    names = readdirSync2(dir).filter((n) => n.startsWith(`${base}.`));
  } catch {
    return;
  }
  const rows5 = [];
  for (const n of names) {
    try {
      const m = /\.([0-9]{8}-[0-9]{6})\.[0-9]+(?:-([0-9]+))?$/.exec(n);
      rows5.push({
        name: n,
        mtime: statSync3(join5(dir, n), { bigint: true }).mtimeNs,
        stamp: m?.[1] ?? "",
        // The de-collision suffix is a CREATION COUNTER, so it is compared as
        // a number: a plain lexicographic tie-break puts `-10` before `-2`,
        // and ten generations is exactly the default depth.
        seq: m?.[2] === void 0 ? 1 : Number(m[2])
      });
    } catch {
    }
  }
  rows5.sort((a, b) => {
    if (a.mtime !== b.mtime) return a.mtime > b.mtime ? -1 : 1;
    if (a.stamp !== b.stamp) return a.stamp > b.stamp ? -1 : 1;
    if (a.seq !== b.seq) return b.seq - a.seq;
    return a.name < b.name ? 1 : a.name > b.name ? -1 : 0;
  });
  for (const row of rows5.slice(keep)) {
    try {
      rmSync2(join5(dir, row.name), { force: true });
    } catch {
    }
  }
}
function entriesArrayOf(v) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const e = v["entries"];
  return Array.isArray(e) ? e : null;
}
function fieldOf2(v, key) {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return null;
  const x = v[key];
  return x === void 0 ? null : x;
}
function jqLength(v) {
  if (v === null || v === void 0) return 0;
  if (Array.isArray(v)) return v.length;
  if (typeof v === "string") return Array.from(v).length;
  if (typeof v === "object") return Object.keys(v).length;
  return 0;
}
function ensureFile(path, template) {
  try {
    if (statSync3(path).isFile()) return;
  } catch {
  }
  const dir = dirname3(path);
  try {
    mkdirSync2(dir, { recursive: true });
  } catch {
    throw new JournalRefusal(`cannot create ${dir}`);
  }
  try {
    writeFileSync2(path, template + "\n");
  } catch {
    throw new JournalRefusal(`cannot create ${path}`);
  }
}

// src/nouns/lib/context.ts
import { existsSync as existsSync7, lstatSync, readlinkSync } from "node:fs";
import { dirname as dirname4, isAbsolute, resolve as resolve2 } from "node:path";
import { fileURLToPath } from "node:url";
function harnessDirOf(root) {
  if (existsSync7(resolve2(root, ".claude"))) return ".claude";
  if (existsSync7(resolve2(root, ".deploy-claude"))) return ".deploy-claude";
  return ".claude";
}
function scriptsDirFromBundle(bundleDir) {
  return resolve2(bundleDir, "..", "scripts");
}
function logicalDirOf(entry, cwd = process.cwd()) {
  let p = resolve2(cwd, entry);
  for (let hop = 0; hop < 40; hop++) {
    let link;
    try {
      if (!lstatSync(p).isSymbolicLink()) break;
      link = readlinkSync(p);
    } catch {
      break;
    }
    p = isAbsolute(link) ? link : resolve2(dirname4(p), link);
  }
  return dirname4(p);
}
function defaultScriptsDir(argv = process.argv) {
  const entry = argv[1];
  if (entry !== void 0 && entry !== "") return scriptsDirFromBundle(logicalDirOf(entry));
  return scriptsDirFromBundle(dirname4(fileURLToPath(import.meta.url)));
}
function nounContext(ctx) {
  const scriptsDir = ctx.scriptsDir ?? defaultScriptsDir();
  return {
    root: ctx.roots.root,
    gov: ctx.roots.gov,
    workRoot: ctx.roots.workRoot,
    scriptsDir,
    codeRoot: resolve2(scriptsDir, "..", ".."),
    harnessDir: harnessDirOf(ctx.roots.root),
    today: ctx.today,
    env: ctx.env ?? process.env,
    cwd: ctx.cwd ?? process.cwd()
  };
}

// src/nouns/lib/writers.ts
function writeOpts(ctx, io) {
  return {
    gov: ctx.gov,
    today: ctx.today,
    env: ctx.env,
    err: (s2) => io.err(s2)
  };
}
function guardedWrite(cli, ctx, io, path, transform) {
  const r = refusing(cli, () => writeJson(path, transform, writeOpts(ctx, io)));
  warnReseal(cli, r.resealWarning);
  return r;
}
function guardedAppend(cli, ctx, io, path, idStream2, prefix, transform) {
  const r = refusing(cli, () => appendWithId(path, idStream2, prefix, transform, writeOpts(ctx, io)));
  warnReseal(cli, r.resealWarning);
  return r;
}
function warnReseal(cli, warning) {
  if (warning === null || !cli.json) return;
  cli.warn("reseal", warning);
}
function flagValue(cli, args, i, command) {
  const v = args[i];
  if (v === void 0) cli.die(`${command}: ${args[i - 1]} needs a value`);
  return v;
}
function shellWords(values) {
  return values.join("\n").split(/[ \t\n]+/).filter((s2) => s2 !== "");
}
var JqTypeError = class extends Error {
};
function typeName(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (v instanceof RawNumber || typeof v === "number") return "number";
  if (typeof v === "object") return "object";
  if (typeof v === "string") return "string";
  return "boolean";
}
function mapEntries(doc, f) {
  const o = asObject(doc);
  if (o === null) throw new JqTypeError(`Cannot index ${typeName(doc)} with string "entries"`);
  const entries = o["entries"];
  if (!Array.isArray(entries)) {
    throw new JqTypeError(`Cannot iterate over ${typeName(entries ?? null)}`);
  }
  return {
    ...o,
    entries: entries.map((row) => {
      const r = asObject(row);
      return r === null ? row : f(r);
    })
  };
}
function idStream(doc) {
  const o = asObject(doc);
  if (o === null) return [];
  const e = o["entries"];
  if (!Array.isArray(e)) return [];
  return e.map((row) => {
    const r = asObject(row);
    if (r === null) return null;
    const v = r["id"];
    return v === void 0 ? null : v;
  });
}
function appendEntry(doc, record) {
  if (doc === null) return { entries: [record] };
  const o = asObject(doc);
  if (o === null) throw new JqTypeError(`Cannot index ${typeName(doc)} with string "entries"`);
  const e = o["entries"];
  if (e === void 0 || e === null) return { ...o, entries: [record] };
  if (!Array.isArray(e)) {
    throw new JqTypeError(`${typeName(e)} and array cannot be added`);
  }
  return { ...o, entries: [...e, record] };
}

// src/journal/guards.ts
import { join as join6 } from "node:path";
import { existsSync as existsSync8, readFileSync as readFileSync6 } from "node:fs";
function authorityGuard(gov, value, verb = "accept") {
  const a = value ?? "";
  if (a === "") {
    throw new JournalRefusal(
      `${verb}: --authority is required \u2014 direct (a person said so in this session), app:<session> (taken through scrumux-app), or standing:D-XXXX (a ratified delegation). An act with no recorded authority is indistinguishable from an agent acting on its own say-so.`
    );
  }
  if (a === "direct" || a === "app") return;
  if (a.startsWith("app:") && a.length > 4) return;
  if (/^standing:D-[0-9]{4}$/.test(a)) {
    const dec = a.slice("standing:".length);
    if (refExists(join6(gov, "decisions.json"), dec)) {
      const st = decisionStandingById(gov, dec);
      if (st === "ratified") return;
      throw new JournalRefusal(
        `${verb}: --authority standing:${dec} names a ${st} decision \u2014 only a ratified decision delegates. A person ratifies it first (scrumux decide ratify ${dec} --by WHO --authority direct|app:<session>), or use --authority direct`
      );
    }
    throw new JournalRefusal(
      `${verb}: --authority standing:${dec} does not resolve in governance/decisions.json \u2014 a standing delegation must be a ratified decision; record it first (scrumux decide new ...) or use --authority direct`
    );
  }
  throw new JournalRefusal(
    `${verb}: --authority must be direct, app:<session>, or standing:D-XXXX, got '${a}'`
  );
}
function decisionStandingById(gov, id) {
  try {
    const doc = parsePreservingNumbers(readFileSync6(join6(gov, "decisions.json"), "utf8"));
    const row = rowsOf(doc).find((r) => str(r, "id") === id);
    return row === void 0 ? "ratified" : standingOf(row).status;
  } catch {
    return "ratified";
  }
}
function parallelGuard(value, verb) {
  const v = value ?? "";
  if (v === "") return;
  if (/[^0-9]/.test(v)) {
    throw new JournalRefusal(
      `${verb}: --parallel must be a whole number 1 or more, got '${v}' \u2014 it is how many tasks of this sprint may be in_progress at once (D-0084)`
    );
  }
  if (v === "0") {
    throw new JournalRefusal(
      `${verb}: --parallel must be a whole number 1 or more, got '0' \u2014 a sprint that admits nothing is an abandoned sprint (scrumux sprint status <id> abandoned)`
    );
  }
}
function admissionState(gov, taskId) {
  const tasksPath3 = join6(gov, "tasks.json");
  let tasksDoc;
  try {
    tasksDoc = parsePreservingNumbers(readFileSync6(tasksPath3, "utf8"));
  } catch {
    throw new JournalRefusal(`cannot read ${tasksPath3} \u2014 admission cannot be computed`);
  }
  const sprintsPath3 = join6(gov, "sprints.json");
  let sprintsDoc = { entries: [] };
  if (existsSync8(sprintsPath3)) {
    try {
      sprintsDoc = parsePreservingNumbers(readFileSync6(sprintsPath3, "utf8"));
    } catch {
      throw new JournalRefusal(`cannot read ${sprintsPath3} \u2014 admission cannot be computed`);
    }
  }
  const sps = rowsOf(sprintsDoc);
  const ts = rowsOf(tasksDoc);
  const home = (id) => {
    for (const s2 of sps) {
      if (str(s2, "status") !== "ratified") continue;
      const tasks = arr(s2, "tasks");
      if (tasks.some((t) => t === id)) return str(s2, "id") ?? "";
    }
    return "";
  };
  const mine = home(taskId);
  let cap2 = 1;
  if (mine !== "") {
    const sp = sps.find((s2) => str(s2, "id") === mine);
    const p = sp === void 0 ? void 0 : num(sp, "parallel");
    cap2 = p ?? 1;
  }
  const busy = ts.filter((t) => str(t, "status") === "in_progress" && str(t, "id") !== taskId);
  const same = [];
  const elsewhere = [];
  const elsewhereIds = [];
  for (const t of busy) {
    const id = str(t, "id") ?? "";
    const h = home(id);
    if (mine !== "" && h === mine) {
      same.push(id);
    } else {
      elsewhere.push(`${id} is in ${h === "" ? "no ratified sprint" : h}`);
      elsewhereIds.push(id);
    }
  }
  return { home: mine, cap: cap2, same, elsewhere, elsewhereIds };
}
function rowsOf(doc) {
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
  const e = doc["entries"];
  return Array.isArray(e) ? e : [];
}
function str(row, key) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const v = row[key];
  return typeof v === "string" ? v : null;
}
function arr(row, key) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return [];
  const v = row[key];
  return Array.isArray(v) ? v : [];
}
function num(row, key) {
  if (row === null || typeof row !== "object" || Array.isArray(row)) return null;
  const v = row[key];
  if (v === null || v === void 0) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// src/nouns/decide-acts.ts
import { join as join7 } from "node:path";

// src/nouns/lib/standing-acts.ts
function parseActFlags(noun, verb, args) {
  const f = { id: args[0] ?? "", by: "", authority: "", reason: "", note: "" };
  if (f.id === "" || f.id.startsWith("--")) return `${noun} ${verb}: which record? ${actUsage(noun, verb)}`;
  const allowed = {
    ratify: ["--by", "--authority"],
    reject: ["--by", "--reason"],
    acknowledge: ["--by", "--note"]
  };
  for (let i = 1; i < args.length; i += 2) {
    const flag = args[i];
    const v = args[i + 1];
    if (!allowed[verb].includes(flag)) return `${noun} ${verb}: unknown flag ${flag} \u2014 ${actUsage(noun, verb)}`;
    if (v === void 0) return `${noun} ${verb}: ${flag} needs a value \u2014 ${actUsage(noun, verb)}`;
    if (flag === "--by") f.by = v;
    else if (flag === "--authority") f.authority = v;
    else if (flag === "--reason") f.reason = v;
    else f.note = v;
  }
  if (f.by === "") return `${noun} ${verb}: --by is required \u2014 the person taking this act. ${actUsage(noun, verb)}`;
  if (verb === "reject" && f.reason === "") {
    return `${noun} reject: --reason is required \u2014 what is wrong with it, so whoever records the next one knows. ${actUsage(noun, verb)}`;
  }
  return f;
}
function actUsage(noun, verb) {
  const x = noun === "decide" ? "D-0001" : "X-0001";
  if (verb === "ratify") return `usage: scrumux ${noun} ratify ${x} --by WHO --authority direct|app:<session>|standing:D-XXXX`;
  if (verb === "reject") return `usage: scrumux ${noun} reject ${x} --by WHO --reason TEXT`;
  return `usage: scrumux ${noun} acknowledge ${x} --by WHO [--note TEXT]`;
}
function actRefusal(noun, verb, id, v) {
  const known = v.authority !== AUTHORITY_UNKNOWN && v.authority !== AUTHORITY_NONE;
  if (v.status === "rejected") {
    return `${noun} ${verb}: ${id} was rejected \u2014 a rejected record is not revived; record a new one`;
  }
  if (verb === "ratify" || verb === "reject") {
    if (v.status === "ratified" && !v.legacy && known) {
      return `${noun} ${verb}: ${id} is already ratified (authority ${v.authority}) \u2014 ${noun === "decide" ? "a ratified decision changes only by a new one that supersedes it (scrumux decide new --supersedes)" : "a ratified resolution stands; file a new finding if it was wrong"}`;
    }
    return null;
  }
  if (v.acknowledgedBy !== "") return `${noun} acknowledge: ${id} was already acknowledged by ${v.acknowledgedBy}`;
  if (v.status === "ratified" && known) {
    return `${noun} acknowledge: ${id} carries authority ${v.authority} \u2014 there is no variance to acknowledge`;
  }
  return null;
}
function applyAct(row, verb, f, today, statusKey) {
  if (verb === "ratify") {
    const out = { ...row };
    const prior = row["ratified_by"];
    if (typeof prior === "string" && prior !== "" && prior !== f.by) out["prior_ratified_by"] = prior;
    return { ...out, [statusKey]: "ratified", authority: f.authority, ratified_by: f.by, ratified_at: today };
  }
  if (verb === "reject") {
    return { ...row, [statusKey]: "rejected", rejected_by: f.by, rejected_at: today, rejection_reason: f.reason };
  }
  return {
    ...row,
    acknowledged_by: f.by,
    acknowledged_at: today,
    ...f.note === "" ? {} : { acknowledgement_note: f.note }
  };
}
function rowById(entries, id) {
  for (const r of entries) {
    if (r !== null && typeof r === "object" && !Array.isArray(r) && r["id"] === id) {
      return r;
    }
  }
  return null;
}
var STANDING_FIELDS = [
  "ratified_by",
  "ratified_at",
  "rejected_by",
  "rejected_at",
  "rejection_reason",
  "acknowledged_by",
  "acknowledged_at",
  "acknowledgement_note",
  "authority_claimed"
];
function withoutKeys(row, keys) {
  const out = {};
  for (const [k2, v] of Object.entries(row)) if (!keys.includes(k2)) out[k2] = v;
  return out;
}

// src/nouns/decide-acts.ts
function decideAct(cli, ctx, io, verb, args) {
  const f = parseActFlags("decide", verb, args);
  if (typeof f === "string") return cli.die(f);
  const path = join7(ctx.gov, "decisions.json");
  if (!isFile(path) || !refExists(path, f.id)) return cli.die(`decide ${verb}: ${f.id} not found in governance/decisions.json`);
  if (verb === "ratify") {
    if (f.authority === `standing:${f.id}`) {
      return cli.die(`decide ratify: ${f.id} cannot be its own authority \u2014 a record does not delegate its own ratification. Use --authority direct|app:<session>, or a different ratified delegation`);
    }
    refusing(cli, () => authorityGuard(ctx.gov, f.authority, "decide ratify"));
  }
  let after = null;
  guardedWrite(cli, ctx, io, path, (doc) => {
    const row = rowById(entriesOf(doc), f.id);
    const why = actRefusal("decide", verb, f.id, standingOf(row));
    if (why !== null) throw new JournalRefusal(why);
    after = applyAct(row, verb, f, ctx.today, "status");
    const sup = typeof row["supersedes"] === "string" ? row["supersedes"] : "";
    return mapEntries(doc, (r) => {
      if (r["id"] === f.id) return after;
      if (sup === "" || r["id"] !== sup) return r;
      if (verb === "ratify") return { ...r, superseded_by: f.id };
      if (verb === "reject" && r["superseded_by"] === f.id) return withoutKeys(r, ["superseded_by"]);
      return r;
    });
  });
  const v = standingOf(after);
  cli.data({ id: f.id, status: v.status, authority: v.authority, by: f.by });
  const said = verb === "ratify" ? `${f.id} ratified by ${f.by} (authority ${f.authority}).` : verb === "reject" ? `${f.id} rejected by ${f.by}: it binds nothing.` : `${f.id} acknowledged by ${f.by}; its standing is unchanged (${v.status}, authority ${v.authority}).`;
  return cli.emit(said);
}

// src/nouns/decide.ts
var VERBS_TSV2 = `new	record a decision \u2014 ratified with --authority, otherwise proposed (D-S039)
ratify	a person ratifies a proposed or authority-less decision
reject	a person rejects one, with a reason
acknowledge	a person keeps an authority-less record as it is, and says so
`;
var USAGE2 = NOUN_USAGE["decide"] ?? "";
var SEED = '{"entries": []}';
function parseDecideFlags(args, die) {
  const f = {
    title: "",
    decision: "",
    rationale: "",
    by: "",
    authority: "",
    scope: "",
    supersedes: "",
    task: "",
    issue: "",
    pushHold: ""
  };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`decide: ${flag} needs a value \u2014 see: scrumux help decide`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--title":
        f.title = value(a);
        break;
      case "--decision":
        f.decision = value(a);
        break;
      case "--rationale":
        f.rationale = value(a);
        break;
      case "--by":
        f.by = value(a);
        break;
      case "--authority":
        f.authority = value(a);
        break;
      case "--scope":
        f.scope = value(a);
        break;
      case "--supersedes":
        f.supersedes = value(a);
        break;
      case "--task":
        f.task = value(a);
        break;
      case "--issue":
        f.issue = value(a);
        break;
      case "--push-hold":
        f.pushHold = value(a);
        break;
      default:
        die(`decide: unknown flag ${a} \u2014 see: scrumux help decide`);
    }
  }
  return f;
}
function decideEntry(f, id, today, authorityOk = false) {
  const refs = {};
  if (f.task !== "") refs["task"] = f.task;
  if (f.issue !== "") refs["issue"] = f.issue;
  if (f.pushHold !== "") refs["push_hold"] = f.pushHold;
  const entry = {
    id,
    date: today,
    title: f.title,
    decision: f.decision,
    rationale: f.rationale
  };
  if (authorityOk) {
    entry["ratified_by"] = f.by;
    entry["status"] = "ratified";
    entry["authority"] = f.authority;
  } else {
    entry["status"] = "proposed";
    entry["authority"] = AUTHORITY_NONE;
    if (f.authority !== "") entry["authority_claimed"] = f.authority;
  }
  entry["recorded_by"] = f.by;
  if (f.scope !== "") entry["scope"] = f.scope;
  entry["refs"] = refs;
  entry["supersedes"] = f.supersedes === "" ? null : f.supersedes;
  return entry;
}
function decideNew(cli, ctx, io, args) {
  const f = parseDecideFlags(args, (m) => cli.die(m));
  if (f.title === "") {
    cli.die('decide: --title is required \u2014 the ruling itself in one line, so a reader who greps the journal gets the answer without opening it. GOOD "Parallel dispatch admission: a per-sprint cap declared at planning" (D-0084). GOOD "Rulings whose machinery was deleted are retired" (D-0081). GOOD "Four gates became advice, and the rulings still say fail" (D-0082). BAD "sprint changes" \u2014 names the area and withholds the ruling, which is the whole content.');
  }
  if (f.decision === "") {
    cli.die('decide: --decision is required (what was decided) \u2014 the rule as it will be applied: the shape, the defaults, and what each surface does about it. Write it so an implementer can act without asking a follow-up. GOOD "A sprint carries parallel (integer >= 1, default 1), declared at scrumux sprint new --parallel N. The CLI admits a task to in_progress while the same RATIFIED sprint has fewer than parallel tasks in_progress, and still refuses a task whose in-flight neighbour belongs to a DIFFERENT sprint. The cap may be changed only while the sprint is proposed; changing it after ratification is a re-ratification, not an edit. --hotfix implies parallel 1" (D-0084). BAD "we will allow parallel work" \u2014 a direction, not a rule; every surface would have to invent its own version of it.');
  }
  if (f.rationale === "") {
    cli.die('decide: --rationale is required (why) \u2014 what was weighed, including the options that were REJECTED and what was wrong with each. That is the part a later session needs when it is tempted to undo this. GOOD "Three shapes were put to User. A: a per-sprint cap declared at planning. B: per-worktree admission. C: the app is the gate. User ruled A. The sprint is already the unit he ratifies, so the cap is declared where the plan is made; B ties a governance rule to a git detail no journal models; C moves a guard out of the CLI into the app and would leave a hand-driven session ungated entirely" (D-0084). BAD "it is better this way" \u2014 it gives the next reader nothing to weigh against.');
  }
  if (f.by === "") {
    cli.die("decide: --by is required \u2014 name who is recording this (yourself, if you are an agent). With --authority direct|app:<session>|standing:D-XXXX the decision is recorded ratified; without one it is recorded PROPOSED until a person ratifies it (D-S039). Decisions are ratified, never assumed.");
  }
  if (!(f.scope === "" || f.scope === "repo" || f.scope === "cross-repo")) {
    cli.die("decide: --scope must be repo or cross-repo");
  }
  const decisions = join8(ctx.gov, "decisions.json");
  if (f.supersedes !== "" && !refExists(decisions, f.supersedes)) {
    cli.die(`decide: --supersedes ${f.supersedes} not found in decisions.json`);
  }
  if (f.task !== "") refusing(cli, () => requireTaskRef(ctx.gov, f.task));
  if (f.issue !== "" && !refExists(join8(ctx.gov, "issues.json"), f.issue)) {
    cli.die(`decide: --issue ${f.issue} not found in issues.json`);
  }
  const problem = authorityProblem(() => authorityGuard(ctx.gov, f.authority, "decide"));
  const ratified = problem === null;
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  const id = refusing(cli, () => {
    ensureFile(decisions, SEED);
    const res = appendWithId(
      decisions,
      (doc) => entriesOf(doc).map((r) => field(r, "id")),
      "D",
      (doc, newId) => appendEntry(doc, decideEntry(f, newId, ctx.today, ratified)),
      opts
    );
    warnReseal(cli, res.resealWarning);
    if (f.supersedes !== "" && ratified) {
      const stamp = writeJson(
        decisions,
        (doc) => mapEntries(doc, (row) => {
          if (field(row, "id") !== f.supersedes) return row;
          return { ...row, superseded_by: res.id };
        }),
        opts
      );
      warnReseal(cli, stamp.resealWarning);
    }
    return res.id;
  });
  sealBootstrap(ctx.gov, ctx.today);
  cli.data({ status: ratified ? "ratified" : "proposed", authority: ratified ? f.authority : AUTHORITY_NONE });
  if (!ratified) {
    cli.sayAlways(
      `TELL: ${id} is recorded PROPOSED (authority: none${f.authority === "" ? "" : `; '${f.authority}' did not resolve \u2014 ${problem ?? ""}`}). It binds nothing until a person ratifies it \u2014 in scrumux-app, or: scrumux decide ratify ${id} --by WHO --authority direct|app:<session>. An operator message in a session is not a ratification; say what you recorded and let the person act.`
    );
  }
  return emitted(cli, id);
}
var MODULE2 = {
  verbs: () => VERBS_TSV2,
  usage: () => USAGE2,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "new":
        return decideNew(cli, nounContext(ctx), ctx.io, args);
      case "ratify":
      case "reject":
      case "acknowledge":
        return decideAct(cli, nounContext(ctx), ctx.io, verb, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun decide \u2014 verbs: new, ratify, reject, acknowledge. See: scrumux help decide`
        );
    }
  }
};

// src/nouns/epic.ts
import { existsSync as existsSync9, readFileSync as readFileSync7 } from "node:fs";
import { join as join9 } from "node:path";
var VERBS_TSV3 = "new	create an epic, optionally with features\nupdate	add or remove features\n";
var USAGE3 = NOUN_USAGE["epic"] ?? "";
var DESIGN_SEED = '{"entries": []}';
function idsOfKind(doc, kind) {
  return entriesOf(doc).filter((r) => field(r, "kind") === kind).map((r) => field(r, "id"));
}
function designDoc(gov) {
  const path = join9(gov, "design.json");
  if (!existsSync9(path)) return null;
  try {
    return parsePreservingNumbers(readFileSync7(path, "utf8"));
  } catch {
    return null;
  }
}
function epicRow(doc, id) {
  if (doc === null) return null;
  for (const r of entriesOf(doc)) {
    if (field(r, "kind") === "epic" && field(r, "id") === id) return r;
  }
  return null;
}
function featuresOf(row) {
  if (row === null) return [];
  const f = field(row, "features");
  return asArray(f) ?? [];
}
function parseEpicNewFlags(args, die) {
  const f = { name: "", desc: "", features: [] };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`epic: ${flag} needs a value \u2014 see: scrumux help epic`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--name":
        f.name = value(a);
        break;
      case "--desc":
        f.desc = value(a);
        break;
      // REPEATED FLAGS ACCUMULATE WITH NO DE-DUPLICATION, at every call site
      // in this module group. `--feature F-0001 --feature F-0001` writes
      // `["F-0001","F-0001"]`; nothing dedupes it going in or reading it back
      // (design-nouns.md, "Deliberate looseness"). Reproduced.
      case "--feature":
        f.features.push(value(a));
        break;
      default:
        die(`epic: unknown flag ${a} \u2014 see: scrumux help epic`);
    }
  }
  return f;
}
function epicNew(cli, ctx, io, args) {
  const f = parseEpicNewFlags(args, (m) => cli.die(m));
  if (f.name === "") {
    cli.die('epic: --name is required \u2014 the state of the world the epic reaches, said as a claim rather than a heading. GOOD "Self-knowledge: the harness sees its own code and its own governance" (E-0005). GOOD "CLI MVP" (E-0006). BAD "Improvements" \u2014 it names no destination, so nothing can be said to be inside or outside it.');
  }
  if (f.desc === "") {
    cli.die('epic: --desc is required \u2014 what changes when the epic lands, and where the scope came from. GOOD "The harness stops reasoning about itself by reading and starts reasoning about itself by query. A code graph and a governance graph on one shared library, so context packs are derived rather than hand-assembled and impact questions are answered mechanically. Fulfils D-0009, ratified but never built, and closes I-0018" (E-0005). GOOD "The harness stands alone: it installs into any repo, proves it is live there, refuses only what is dangerous, runs its gates in seconds, and records enough about its own behaviour that the next round of priorities comes from data. Everything in this epic comes from the deep-dive review of 2026-08-20 and D-0058..D-0061" (E-0006). BAD "various fixes" \u2014 a later reader cannot tell what belongs in it.');
  }
  const design = join9(ctx.gov, "design.json");
  refusing(cli, () => ensureFile(design, DESIGN_SEED));
  for (const dep of shellWords(f.features)) {
    if (!refExists(design, dep, (r) => field(r, "kind") === "feature" ? field(r, "id") : void 0)) {
      cli.die(`epic: feature ${dep} not found \u2014 add it first: scrumux feature new --name ... --desc ...`);
    }
  }
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  const id = refusing(cli, () => {
    const res = appendWithId(
      design,
      (doc) => idsOfKind(doc, "epic"),
      "E",
      (doc, newId) => {
        const entry = {
          kind: "epic",
          id: newId,
          name: f.name,
          description: f.desc
        };
        if (f.features.length > 0) entry["features"] = [...f.features];
        return appendEntry(doc, entry);
      },
      opts
    );
    warnReseal(cli, res.resealWarning);
    return res.id;
  });
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, id);
}
function parseEpicUpdateFlags(args, die) {
  const f = { adds: [], dels: [] };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`epic update: ${flag} needs a value \u2014 see: scrumux help epic`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--add-feature":
        f.adds.push(value(a));
        break;
      case "--remove-feature":
        f.dels.push(value(a));
        break;
      default:
        die(`epic update: unknown flag ${a} \u2014 see: scrumux help epic`);
    }
  }
  return f;
}
function nextFeatures(current, adds, dels) {
  const drop = new Set(dels);
  return [...current, ...adds].filter((v) => !(typeof v === "string" && drop.has(v)));
}
function epicUpdate(cli, ctx, io, args) {
  const eid = args.length > 0 ? args[0] : "";
  const rest = args.slice(1);
  if (eid === "") {
    cli.die("usage: scrumux epic update E-0001 [--add-feature F-0001]... [--remove-feature F-0001]...");
  }
  const design = join9(ctx.gov, "design.json");
  if (!refExists(design, eid, (r) => field(r, "kind") === "epic" ? field(r, "id") : void 0)) {
    cli.die(`epic update: ${eid} not found in design.json \u2014 list ids: jq -r '.entries[] | select(.kind=="epic") | .id' governance/design.json`);
  }
  const f = parseEpicUpdateFlags(rest, (m) => cli.die(m));
  if (f.adds.length + f.dels.length === 0) {
    cli.die("epic update: nothing to update \u2014 pass --add-feature and/or --remove-feature");
  }
  const doc = designDoc(ctx.gov);
  const row = epicRow(doc, eid);
  const current = featuresOf(row);
  for (const add of shellWords(f.adds)) {
    if (!refExists(design, add, (r) => field(r, "kind") === "feature" ? field(r, "id") : void 0)) {
      cli.die(`epic update: feature ${add} not found \u2014 add it first: scrumux feature new --name ... --desc ...`);
    }
    if (current.some((v) => v === add)) {
      cli.die(`epic update: ${add} is already on ${eid} \u2014 an epic's features are a set`);
    }
  }
  for (const del of shellWords(f.dels)) {
    if (!current.some((v) => v === del)) {
      const shown = current.map((v) => asString(v) ?? "").join(", ");
      cli.die(`epic update: ${del} is not on ${eid} \u2014 nothing to remove; current: ${shown}`);
    }
  }
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  refusing(cli, () => {
    const res = writeJson(
      design,
      (d) => mapEntries(d, (r) => {
        if (field(r, "kind") !== "epic" || field(r, "id") !== eid) return r;
        const o = r;
        return { ...o, features: nextFeatures(asArray(field(r, "features")) ?? [], f.adds, f.dels) };
      }),
      opts
    );
    warnReseal(cli, res.resealWarning);
  });
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${eid} updated`);
}
var MODULE3 = {
  verbs: () => VERBS_TSV3,
  usage: () => USAGE3,
  run(cli, ctx, verb, args) {
    const nc = nounContext(ctx);
    switch (verb) {
      case "new":
        return args.length > 0 && args[0] === "update" ? epicUpdate(cli, nc, ctx.io, args.slice(1)) : epicNew(cli, nc, ctx.io, args);
      case "update":
        return epicUpdate(cli, nc, ctx.io, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun epic \u2014 verbs: new, update. See: scrumux help epic`
        );
    }
  }
};

// src/nouns/exception.ts
import { existsSync as existsSync10, readFileSync as readFileSync8 } from "node:fs";
import { join as join11 } from "node:path";

// src/nouns/exception-acts.ts
import { join as join10 } from "node:path";
function exceptionAct(cli, ctx, io, verb, args) {
  const f = parseActFlags("exception", verb, args);
  if (typeof f === "string") return cli.die(f);
  const path = join10(ctx.gov, "exceptions.json");
  if (!isFile(path) || !refExists(path, f.id)) return cli.die(`exception ${verb}: no ${f.id} in this repo`);
  if (verb === "ratify") refusing(cli, () => authorityGuard(ctx.gov, f.authority, "exception ratify"));
  let after = null;
  guardedWrite(cli, ctx, io, path, (doc) => {
    const row = rowById(entriesOf(doc), f.id);
    if (row["status"] === "open" && row["resolution_status"] === void 0) {
      throw new JournalRefusal(`exception ${verb}: ${f.id} is open \u2014 there is no resolution to ${verb}. A person resolves it: scrumux exception resolve ${f.id} --status tracked|ratified|corrected|rejected|withdrawn --by WHO --authority direct|app:<session>`);
    }
    const why = actRefusal("exception", verb, f.id, standingOf(row, "resolution_status"));
    if (why !== null) throw new JournalRefusal(why);
    after = applyAct(row, verb, f, ctx.today, "resolution_status");
    if (verb === "reject") after = { ...after, status: "open" };
    return mapEntries(doc, (r) => r["id"] === f.id ? after : r);
  });
  const v = standingOf(after, "resolution_status");
  cli.data({ id: f.id, resolution_status: v.status, authority: v.authority, by: f.by });
  const said = verb === "ratify" ? `${f.id}'s resolution ratified by ${f.by} (authority ${f.authority}).` : verb === "reject" ? `${f.id}'s resolution rejected by ${f.by}; the finding is open again.` : `${f.id}'s resolution acknowledged by ${f.by}; its standing is unchanged (${v.status}, authority ${v.authority}).`;
  return cli.emit(said);
}

// src/nouns/exception.ts
var VERBS_TSV4 = `new	file a process finding on a session
resolve	record what was done about one \u2014 ratified with --authority, otherwise proposed (D-S039)
list	the open findings, and resolutions awaiting a person
ratify	a person ratifies a proposed or authority-less resolution
reject	a person rejects a resolution, reopening the finding
acknowledge	a person keeps an authority-less resolution as it is
`;
var SEED2 = '{"entries": []}';
var DISPOSITIONS = [
  "accept_and_track",
  "requires_ratification",
  "correct_the_record",
  "reject_the_task"
];
var RESOLUTIONS = ["tracked", "ratified", "corrected", "rejected", "withdrawn"];
var exceptionsPath = (ctx) => join11(ctx.gov, "exceptions.json");
function rows(path) {
  if (!existsSync10(path)) return [];
  try {
    const doc = parsePreservingNumbers(readFileSync8(path, "utf8"));
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
    const e = doc["entries"];
    return Array.isArray(e) ? e : [];
  } catch {
    return [];
  }
}
function exceptionNew(cli, ctx, ictx, args) {
  let lens = "";
  let severity = "yellow";
  let ref = "";
  let finding = "";
  let disposition = "accept_and_track";
  let source = ctx.env["GOV_ACTOR"] === void 0 || ctx.env["GOV_ACTOR"] === "" ? "claude" : ctx.env["GOV_ACTOR"];
  let session = "";
  let task = "";
  let sprint = "";
  let rule = "";
  for (let i = 0; i < args.length; ) {
    const f = args[i];
    const v = () => flagValue(cli, args, i + 1, "exception");
    if (f === "--lens") {
      lens = v();
      i += 2;
      continue;
    }
    if (f === "--severity") {
      severity = v();
      i += 2;
      continue;
    }
    if (f === "--ref") {
      ref = v();
      i += 2;
      continue;
    }
    if (f === "--finding") {
      finding = v();
      i += 2;
      continue;
    }
    if (f === "--disposition") {
      disposition = v();
      i += 2;
      continue;
    }
    if (f === "--source") {
      source = v();
      i += 2;
      continue;
    }
    if (f === "--session") {
      session = v();
      i += 2;
      continue;
    }
    if (f === "--task") {
      task = v();
      i += 2;
      continue;
    }
    if (f === "--sprint") {
      sprint = v();
      i += 2;
      continue;
    }
    if (f === "--rule") {
      rule = v();
      i += 2;
      continue;
    }
    cli.die(`exception: unknown flag ${f} \u2014 see: scrumux help exception`);
  }
  if (lens === "") {
    cli.die(
      'exception: --lens is required (which reviewer raised it) \u2014 name the question the reviewer was asking, not the reviewer. GOOD "Scope against the order". GOOD "Repo standards" (X-0001). GOOD "scripts_run" (X-0002). BAD "review" \u2014 every finding comes from a review, so it separates nothing when the list is grouped.'
    );
  }
  if (ref === "") {
    cli.die(
      'exception: --ref is required (what it is about \u2014 a task, a file, a rule) \u2014 point at the exact thing, with a line number where there is one. GOOD "harness .claude/scripts/lib/cmd-records.sh:264" (X-0001). GOOD "T-0217" for a task. GOOD "issue-validation.md" for a rule. BAD "the CLI" \u2014 nobody can open it.'
    );
  }
  if (finding === "") {
    cli.die(
      'exception: --finding is required (what was found, in a sentence a person can act on) \u2014 say what happened, what is believed to explain it, and what remains unproven, because the person deciding was not there. GOOD "Running records check through the control plane appended printf: write error: Broken pipe to the output the app displayed. The cause is believed to be grep -q closing the pipe under printf, which only reports when the parent has SIGPIPE ignored \u2014 as Node does. Eleven call sites were hardened and 497 harness tests stay green, but the symptom was NOT reproduced in eight attempts, so the fix is not confirmed to address it" (X-0001). GOOD "The command refused by block-upstream-edit was re-run after the refusal, but the first run has null exitCode in scriptsRun; the evidence does not show whether it exited nonzero or was blocked pre-execution" (X-0002). BAD "the session did not follow the rules" \u2014 no act, no rule named, nothing a person can settle.'
    );
  }
  if (severity !== "red" && severity !== "yellow") {
    cli.die(
      `exception: --severity must be red or yellow, got '${severity}'. There is no green: a finding nobody needs to see is not filed.`
    );
  }
  if (!DISPOSITIONS.includes(disposition)) {
    cli.die(
      `exception: --disposition must be one of accept_and_track, requires_ratification, correct_the_record, reject_the_task \u2014 got '${disposition}'`
    );
  }
  if (task !== "") refusing(cli, () => requireTaskRef(ctx.gov, task));
  const path = exceptionsPath(ctx);
  refusing(cli, () => ensureFile(path, SEED2));
  const d = ctx.today;
  const r = guardedAppend(
    cli,
    ctx,
    ictx.io,
    path,
    idStream,
    "X",
    (doc, id) => appendEntry(doc, {
      id,
      lens,
      severity,
      ref,
      finding,
      disposition,
      status: "open",
      source,
      created_at: d,
      session: session === "" ? null : session,
      task: task === "" ? null : task,
      sprint: sprint === "" ? null : sprint,
      rule: rule === "" ? null : rule
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, r.id);
}
function exceptionResolve(cli, ctx, ictx, args) {
  const id = args[0] ?? "";
  if (id === "") {
    cli.die("exception: which exception? Example: scrumux exception resolve X-0001 --status tracked --by user");
  }
  const rest = args.slice(1);
  let status = "";
  let by = "";
  let note = "";
  let authority = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    const v = () => flagValue(cli, rest, i + 1, "exception");
    if (f === "--status") {
      status = v();
      i += 2;
      continue;
    }
    if (f === "--by") {
      by = v();
      i += 2;
      continue;
    }
    if (f === "--note") {
      note = v();
      i += 2;
      continue;
    }
    if (f === "--authority") {
      authority = v();
      i += 2;
      continue;
    }
    cli.die(`exception: unknown flag ${f} \u2014 see: scrumux help exception`);
  }
  const path = exceptionsPath(ctx);
  if (!isFile(path)) cli.die("exception: this repo has no exceptions.json yet");
  if (!refExists(path, id)) cli.die(`exception: no ${id} in this repo`);
  if (status === "") cli.die("exception: --status is required (tracked|ratified|corrected|rejected|withdrawn)");
  if (status === "open") cli.die("exception: --status open is the filing state; resolve moves it off open");
  if (!RESOLUTIONS.includes(status)) {
    cli.die(
      `exception: --status must be one of tracked, ratified, corrected, rejected, withdrawn \u2014 got '${status}'`
    );
  }
  if (by === "") cli.die("exception: --by is required. A finding settled by nobody is not settled.");
  const problem = authorityProblem(() => authorityGuard(ctx.gov, authority, "exception resolve"));
  const ratified = problem === null;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    path,
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== id) return row;
      const base = withoutKeys(row, STANDING_FIELDS);
      return {
        ...base,
        status,
        resolved_by: by,
        resolution: note === "" ? null : note,
        resolution_status: ratified ? "ratified" : "proposed",
        authority: ratified ? authority : AUTHORITY_NONE,
        recorded_by: by,
        ...ratified ? { ratified_by: by } : authority === "" ? {} : { authority_claimed: authority }
      };
    })
  );
  cli.data({ resolution_status: ratified ? "ratified" : "proposed", authority: ratified ? authority : AUTHORITY_NONE });
  if (!ratified) {
    cli.sayAlways(
      `TELL: ${id}'s resolution is recorded PROPOSED (authority: none${authority === "" ? "" : `; '${authority}' did not resolve`}). A person ratifies it \u2014 in scrumux-app, or: scrumux exception ratify ${id} --by WHO --authority direct|app:<session>.`
    );
  }
  warnReseal(cli, resealOne(ctx.gov, path, ctx.today, ctx.env));
  return emitted(cli, id);
}
function exceptionList(cli, ctx, io) {
  const path = exceptionsPath(ctx);
  if (!isFile(path)) {
    cli.say("no exceptions recorded in this repo");
    return cli.finish();
  }
  let shown = 0;
  for (const row of rows(path)) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row;
    const proposed = r["status"] !== "open" && r["resolution_status"] === "proposed" && r["acknowledged_by"] === void 0;
    if (r["status"] !== "open" && !proposed) continue;
    shown += 1;
    const mark = proposed ? `  [resolution PROPOSED: ${interp(r["status"])} by ${interp(r["recorded_by"])} \u2014 needs a person]` : "";
    io.out(
      `${interp(r["id"])}  ${interp(r["severity"])}  ${interp(r["disposition"])}  ${interp(r["lens"])} \u2014 ${interp(r["ref"])}: ${interp(r["finding"])}${mark}
`
    );
  }
  if (shown === 0) cli.say("(no open exceptions)");
  return cli.finish();
}
var MODULE4 = {
  verbs: () => VERBS_TSV4,
  usage: () => NOUN_USAGE["exception"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "new":
        return exceptionNew(cli, ctx, ictx, args);
      case "resolve":
        return exceptionResolve(cli, ctx, ictx, args);
      case "list":
        return exceptionList(cli, ctx, ictx.io);
      case "ratify":
      case "reject":
      case "acknowledge":
        return exceptionAct(cli, ctx, ictx.io, verb, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun exception \u2014 try new, resolve, list, ratify, reject or acknowledge. See: scrumux help exception`
        );
    }
  }
};

// src/nouns/feature.ts
import { join as join12 } from "node:path";
var VERBS_TSV5 = "new	the only verb\n";
var USAGE4 = NOUN_USAGE["feature"] ?? "";
var DESIGN_SEED2 = '{"entries": []}';
function parseFeatureFlags(args, die) {
  const f = { name: "", desc: "", deps: [] };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`feature: ${flag} needs a value \u2014 see: scrumux help feature`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--name":
        f.name = value(a);
        break;
      case "--desc":
        f.desc = value(a);
        break;
      case "--dep":
        f.deps.push(value(a));
        break;
      default:
        die(`feature: unknown flag ${a} \u2014 see: scrumux help feature`);
    }
  }
  return f;
}
function featureNew(cli, ctx, io, args) {
  const f = parseFeatureFlags(args, (m) => cli.die(m));
  if (f.name === "") {
    cli.die('feature: --name is required \u2014 two or three words naming the capability, not the work. GOOD "Governance graph" (F-0008). GOOD "Gate integrity" (F-0009). GOOD "Deployability" (F-0013). BAD "Phase 2 improvements" \u2014 a schedule, not a capability.');
  }
  if (f.desc === "") {
    cli.die('feature: --desc is required \u2014 what the capability makes possible and how you will be able to tell, in two or three sentences. GOOD "No gate reports a pass it did not earn. The four cross-script dependencies fail closed instead of open; the destructive-command attestation leaves a record; the issue source field is a constrained enum so drift data has a reliable who-raised-this dimension" (F-0009). GOOD "The harness installs into any repo and can prove it is actually live there. Root resolution decoupled from script location, harness deploy and harness verify as CLI commands with machine-readable output, and a read-only sandbox that works on Linux as well as darwin" (F-0013). BAD "makes deploys better" \u2014 no mechanism and nothing a story could be written against.');
  }
  const design = join12(ctx.gov, "design.json");
  refusing(cli, () => ensureFile(design, DESIGN_SEED2));
  for (const dep of shellWords(f.deps)) {
    if (!refExists(design, dep, (r) => field(r, "kind") === "feature" ? field(r, "id") : void 0)) {
      cli.die(`feature: --dep ${dep} not found`);
    }
  }
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  const id = refusing(cli, () => {
    const res = appendWithId(
      design,
      // The allocator's stream is narrowed to THIS kind, because five kinds
      // share the file and `F-` ids must not be counted against `S-` ones.
      (doc) => entriesOf(doc).filter((r) => field(r, "kind") === "feature").map((r) => field(r, "id")),
      "F",
      (doc, newId) => {
        const entry = {
          kind: "feature",
          id: newId,
          name: f.name,
          description: f.desc
        };
        if (f.deps.length > 0) entry["dependencies"] = [...f.deps];
        return appendEntry(doc, entry);
      },
      opts
    );
    warnReseal(cli, res.resealWarning);
    return res.id;
  });
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, id);
}
var MODULE5 = {
  verbs: () => VERBS_TSV5,
  usage: () => USAGE4,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "new":
        return featureNew(cli, nounContext(ctx), ctx.io, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun feature \u2014 the only verb is 'new'. See: scrumux help feature`
        );
    }
  }
};

// src/nouns/graph.ts
import { join as join17 } from "node:path";

// src/nouns/harness/util.ts
import { spawnSync } from "node:child_process";
function stripTrailingNewlines(s2) {
  return s2.replace(/\n+$/, "");
}
function shHead(s2, n) {
  let idx = 0;
  for (let i = 0; i < n; i++) {
    const nl = s2.indexOf("\n", idx);
    if (nl === -1) return s2;
    idx = nl + 1;
  }
  return s2.slice(0, idx);
}
function trNewlines(s2, ch) {
  return s2.split("\n").join(ch);
}
function firstLineCut(s2, n) {
  const line = s2.split("\n", 1)[0] ?? "";
  return [...line].slice(0, n).join("");
}
function grepHead3Semis(s2, re) {
  const hits = s2.split("\n").filter((l) => re.test(l)).slice(0, 3);
  return hits.map((l) => l + ";").join("");
}
function spawnCombinedWith(bin, argv, opts) {
  const r = spawnSync(bin, [...argv], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: "utf8",
    ...opts.maxBuffer === void 0 ? {} : { maxBuffer: opts.maxBuffer },
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (r.status === null || r.status === void 0) {
    return { rc: 127, combined: (r.stdout ?? "") + (r.stderr ?? "") };
  }
  return { rc: r.status, combined: (r.stdout ?? "") + (r.stderr ?? "") };
}
function selfBundle(env) {
  const override = env["SCRUMUX_SELF"];
  if (override !== void 0 && override !== "") return isFile(override) ? override : null;
  const entry = process.argv[1];
  if (entry === void 0 || entry === "") return null;
  return isFile(entry) ? entry : null;
}
function gitOut(cwd, args) {
  try {
    const r = spawnSync("git", ["-C", cwd, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    if (r.status !== 0 || typeof r.stdout !== "string") return null;
    return r.stdout.replace(/\n+$/, "");
  } catch {
    return null;
  }
}
function sealQuiet(p) {
  try {
    return sealOf(p);
  } catch {
    return "";
  }
}

// src/nouns/graph/code-index.ts
import { spawnSync as spawnSync2 } from "node:child_process";
import { closeSync, openSync, readSync, readdirSync as readdirSync3, readFileSync as readFileSync9, statSync as statSync4 } from "node:fs";
import { basename as basename3, join as join13, relative } from "node:path";

// src/schema/pyjson.ts
var PyInt = class {
  constructor(v) {
    this.v = v;
  }
};
var PyFloat = class {
  constructor(v) {
    this.v = v;
  }
};
var PyJsonDecodeError = class extends Error {
};
var WS = " 	\n\r";
function pyLoads(text2) {
  if (text2.startsWith("\uFEFF")) {
    throw decodeError(text2, "Unexpected UTF-8 BOM (decode using utf-8-sig)", 0);
  }
  let i = skipWs(text2, 0);
  const [value, end] = scanOnce(text2, i);
  i = skipWs(text2, end);
  if (i !== text2.length) throw decodeError(text2, "Extra data", i);
  return value;
}
function skipWs(s2, i) {
  while (i < s2.length && WS.includes(s2[i])) i += 1;
  return i;
}
function decodeError(doc, msg, pos) {
  let line = 1;
  let lineStart = 0;
  for (let k2 = 0; k2 < pos && k2 < doc.length; k2 += 1) {
    if (doc[k2] === "\n") {
      line += 1;
      lineStart = k2 + 1;
    }
  }
  const col = pos - lineStart + 1;
  return new PyJsonDecodeError(`${msg}: line ${line} column ${col} (char ${pos})`);
}
function pyDecodeMessage(text2) {
  try {
    pyLoads(text2);
  } catch (e) {
    if (e instanceof PyJsonDecodeError) return e.message;
  }
  return decodeError(text2, "Expecting value", skipWs(text2, 0)).message;
}
var NUMBER_RE = /^(-?(?:0|[1-9]\d*))(\.\d+)?([eE][-+]?\d+)?/;
function scanOnce(s2, idx) {
  const c = s2[idx];
  if (c === void 0) throw decodeError(s2, "Expecting value", idx);
  if (c === '"') return scanString(s2, idx + 1);
  if (c === "{") return scanObject(s2, idx + 1);
  if (c === "[") return scanArray(s2, idx + 1);
  if (s2.startsWith("null", idx)) return [null, idx + 4];
  if (s2.startsWith("true", idx)) return [true, idx + 4];
  if (s2.startsWith("false", idx)) return [false, idx + 5];
  const m = NUMBER_RE.exec(s2.slice(idx));
  if (m !== null && m[0] !== "") {
    const [whole, integer, frac, exp] = m;
    if (frac !== void 0 || exp !== void 0) {
      return [new PyFloat(Number(whole)), idx + whole.length];
    }
    return [new PyInt(BigInt(integer)), idx + whole.length];
  }
  if (s2.startsWith("NaN", idx)) return [new PyFloat(NaN), idx + 3];
  if (s2.startsWith("Infinity", idx)) return [new PyFloat(Infinity), idx + 8];
  if (s2.startsWith("-Infinity", idx)) return [new PyFloat(-Infinity), idx + 9];
  throw decodeError(s2, "Expecting value", idx);
}
var ESCAPES = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "	"
};
function scanString(s2, end) {
  const begin = end - 1;
  let out = "";
  let i = end;
  for (; ; ) {
    if (i >= s2.length) throw decodeError(s2, "Unterminated string starting at", begin);
    const ch = s2[i];
    const code = ch.charCodeAt(0);
    if (ch === '"') return [out, i + 1];
    if (ch === "\\") {
      const esc = s2[i + 1];
      if (esc === void 0) throw decodeError(s2, "Unterminated string starting at", begin);
      if (esc === "u") {
        const hex = s2.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw decodeError(s2, "Invalid \\uXXXX escape", i + 1);
        let cp = parseInt(hex, 16);
        let consumed = 6;
        if (cp >= 55296 && cp <= 56319 && s2.slice(i + 6, i + 8) === "\\u") {
          const hex2 = s2.slice(i + 8, i + 12);
          if (/^[0-9a-fA-F]{4}$/.test(hex2)) {
            const lo = parseInt(hex2, 16);
            if (lo >= 56320 && lo <= 57343) {
              cp = 65536 + (cp - 55296 << 10 | lo - 56320);
              consumed = 12;
            }
          }
        }
        out += String.fromCodePoint(cp);
        i += consumed;
        continue;
      }
      const rep = ESCAPES[esc];
      if (rep === void 0) throw decodeError(s2, "Invalid \\escape", i);
      out += rep;
      i += 2;
      continue;
    }
    if (code < 32) throw decodeError(s2, "Invalid control character at", i);
    out += ch;
    i += 1;
  }
}
function scanObject(s2, end) {
  const pairs = /* @__PURE__ */ new Map();
  let i = end;
  let nextchar = s2[i];
  if (nextchar !== '"') {
    if (nextchar !== void 0 && WS.includes(nextchar)) {
      i = skipWs(s2, i);
      nextchar = s2[i];
    }
    if (nextchar === "}") return [pairs, i + 1];
    if (nextchar !== '"') {
      throw decodeError(s2, "Expecting property name enclosed in double quotes", i);
    }
  }
  i += 1;
  for (; ; ) {
    const [key, afterKey] = scanString(s2, i);
    i = afterKey;
    if (s2[i] !== ":") {
      i = skipWs(s2, i);
      if (s2[i] !== ":") throw decodeError(s2, "Expecting ':' delimiter", i);
    }
    i = skipWs(s2, i + 1);
    const [value, afterValue] = scanOnce(s2, i);
    pairs.set(key, value);
    i = skipWs(s2, afterValue);
    nextchar = s2[i] ?? "";
    i += 1;
    if (nextchar === "}") break;
    if (nextchar !== ",") throw decodeError(s2, "Expecting ',' delimiter", i - 1);
    i = skipWs(s2, i);
    nextchar = s2[i] ?? "";
    i += 1;
    if (nextchar !== '"') {
      throw decodeError(s2, "Expecting property name enclosed in double quotes", i - 1);
    }
  }
  return [pairs, i];
}
function scanArray(s2, end) {
  const values = [];
  let i = skipWs(s2, end);
  if (s2[i] === "]") return [values, i + 1];
  for (; ; ) {
    const [value, afterValue] = scanOnce(s2, i);
    values.push(value);
    i = skipWs(s2, afterValue);
    const nextchar = s2[i] ?? "";
    i += 1;
    if (nextchar === "]") break;
    if (nextchar !== ",") throw decodeError(s2, "Expecting ',' delimiter", i - 1);
    i = skipWs(s2, i);
  }
  return [values, i];
}
function pyTypeName(v) {
  if (v === null) return "NoneType";
  if (typeof v === "boolean") return "bool";
  if (typeof v === "string") return "str";
  if (v instanceof PyInt) return "int";
  if (v instanceof PyFloat) return "float";
  if (Array.isArray(v)) return "list";
  return "dict";
}
function pyEq(a, b) {
  const an = numericOf(a);
  const bn = numericOf(b);
  if (an !== null && bn !== null) return an === bn;
  if (an !== null || bn !== null) return false;
  if (a === null || b === null) return a === b;
  if (typeof a === "string" || typeof b === "string") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => pyEq(x, b[i]));
  }
  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [k2, v] of a) {
      if (!b.has(k2)) return false;
      if (!pyEq(v, b.get(k2))) return false;
    }
    return true;
  }
  return false;
}
function numericOf(v) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof PyInt) return Number(v.v);
  if (v instanceof PyFloat) return v.v;
  return null;
}
function pyRepr(v) {
  if (v === null) return "None";
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "string") return pyStrRepr(v);
  if (v instanceof PyInt) return v.v.toString();
  if (v instanceof PyFloat) return pyFloatRepr(v.v);
  if (Array.isArray(v)) return "[" + v.map(pyRepr).join(", ") + "]";
  return "{" + [...v.entries()].map(([k2, x]) => `${pyStrRepr(k2)}: ${pyRepr(x)}`).join(", ") + "}";
}
function pyStr(v) {
  return typeof v === "string" ? v : pyRepr(v);
}
function pyStrRepr(s2) {
  const quote = s2.includes("'") && !s2.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s2) {
    const c = ch.codePointAt(0);
    if (ch === quote || ch === "\\") {
      out += "\\" + ch;
      continue;
    }
    if (ch === "\n") {
      out += "\\n";
      continue;
    }
    if (ch === "\r") {
      out += "\\r";
      continue;
    }
    if (ch === "	") {
      out += "\\t";
      continue;
    }
    if (c < 32 || c === 127) {
      out += "\\x" + c.toString(16).padStart(2, "0");
      continue;
    }
    out += ch;
  }
  return out + quote;
}
function pyFloatRepr(n) {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  const mag = Math.abs(n);
  const s2 = n !== 0 && (mag >= 1e16 || mag < 1e-4) ? n.toExponential() : String(n);
  const e = s2.indexOf("e");
  if (e < 0) return s2.includes(".") ? s2 : s2 + ".0";
  const mant = s2.slice(0, e);
  const rest = s2.slice(e + 1);
  const sign = rest.startsWith("-") ? "-" : "+";
  return `${mant}e${sign}${rest.replace(/^[-+]/, "").padStart(2, "0")}`;
}

// src/nouns/graph/code-index.ts
var IndexUnreadable = class extends Error {
};
var SKIP_DIRS = /* @__PURE__ */ new Set([".git", ".venv", "node_modules", "__pycache__", "dist", "build"]);
var EXTENSION_LANGUAGE = {
  ".py": "python",
  ".sh": "bash",
  ".bash": "bash",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".php": "php",
  ".java": "java",
  ".c": "c",
  ".h": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".hpp": "cpp",
  ".cxx": "cpp",
  ".cs": "c_sharp"
};
var SHEBANG_LANGUAGE = [
  [/^#!.*\b(ba|da|z|k)?sh\b/, "bash"],
  [/^#!.*\bpython[0-9.]*\b/, "python"],
  [/^#!.*\bnode\b/, "javascript"],
  [/^#!.*\bruby\b/, "ruby"],
  [/^#!.*\bphp\b/, "php"]
];
function pySuffix(name) {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i) : "";
}
function languageOf(path) {
  const name = basename3(path);
  const suffix = pySuffix(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(EXTENSION_LANGUAGE, suffix)) {
    return EXTENSION_LANGUAGE[suffix];
  }
  if (suffix !== "") return null;
  let head;
  try {
    const fd = openSync(path, "r");
    try {
      const buf = Buffer.alloc(128);
      const n = readSync(fd, buf, 0, 128, 0);
      head = buf.subarray(0, n).toString("latin1");
    } finally {
      closeSync(fd);
    }
  } catch {
    return null;
  }
  for (const [pattern, lang] of SHEBANG_LANGUAGE) {
    if (pattern.test(head)) return lang;
  }
  return null;
}
function* walkTree(root) {
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync3(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const dirs = [];
    const files = [];
    for (const e of entries) {
      if (e.isDirectory()) dirs.push(e.name);
      else files.push(e.name);
    }
    files.sort();
    for (const name of files) yield join13(dir, name);
    dirs.sort();
    for (let i = dirs.length - 1; i >= 0; i -= 1) {
      const d = dirs[i];
      if (SKIP_DIRS.has(d)) continue;
      stack.push(join13(dir, d));
    }
  }
}
function obj(v) {
  return v !== null && v !== void 0 && typeof v === "object" && !Array.isArray(v) && !(v instanceof RawNumber) ? v : null;
}
function str2(v) {
  return typeof v === "string" ? v : "";
}
function num2(v) {
  if (v instanceof RawNumber) return Number(v.text);
  if (typeof v === "number") return v;
  return null;
}
function git(root, ...args) {
  try {
    const r = spawnSync2("git", ["-C", root, ...args], {
      encoding: "utf8",
      timeout: 15e3
    });
    return r.status === 0 ? (r.stdout ?? "").trim() : "";
  } catch {
    return "";
  }
}
function loadIndex(path) {
  const text2 = readFileSync9(path, "utf8");
  let doc;
  try {
    doc = parsePreservingNumbers(text2);
  } catch {
    throw new IndexUnreadable(
      `${path} is not valid JSON (${pyDecodeMessage(text2)}) \u2014 the index is corrupt or truncated; rebuild it: scrumux graph code build`
    );
  }
  const o = obj(doc);
  if (o === null) {
    throw new IndexUnreadable(
      `${path} is valid JSON but not an index object \u2014 rebuild it: scrumux graph code build`
    );
  }
  return o;
}
function indexPath(dataRoot) {
  return join13(dataRoot, "governance", "code-graph.json");
}
function mtimeSeconds(path) {
  try {
    const s2 = statSync4(path, { bigint: true });
    return Number(s2.mtimeNs) / 1e9;
  } catch {
    return null;
  }
}
function isStaleGraph(graph, root) {
  const prov = obj(graph["provenance"]) ?? {};
  const at = num2(prov["built_at_epoch"]);
  const changed = [];
  for (const path of walkTree(root)) {
    let isFile2 = false;
    try {
      isFile2 = statSync4(path).isFile();
    } catch {
      isFile2 = false;
    }
    if (!isFile2 || languageOf(path) === null) continue;
    const m = mtimeSeconds(path);
    if (at !== null && at !== 0 && m !== null && m > at) {
      changed.push(relative(root, path));
      if (changed.length >= 5) break;
    }
  }
  const filesList = Array.isArray(graph["files"]) ? graph["files"] : [];
  const gone = [];
  for (const rel of filesList) {
    if (typeof rel !== "string") continue;
    let ok = false;
    try {
      ok = statSync4(join13(root, rel)).isFile();
    } catch {
      ok = false;
    }
    if (!ok) gone.push(rel);
    if (gone.length >= 5) break;
  }
  if (changed.length > 0 && gone.length > 0) {
    return [true, `${changed.length}+ source file(s) changed since the build (e.g. ${changed.join(", ")}) and ${gone.length} indexed file(s) are gone (e.g. ${gone.join(", ")})`];
  }
  if (changed.length > 0) return [true, "source file(s) changed since the build: " + changed.join(", ")];
  if (gone.length > 0) return [true, "indexed file(s) no longer on disk: " + gone.join(", ")];
  if (at === null || at === 0) return [true, "this index carries no build stamp, so its age cannot be judged"];
  return [false, "index is newer than every source file"];
}
function indexAge(graph, root) {
  const prov = obj(graph["provenance"]) ?? {};
  const builtCommit = str2(prov["commit"]);
  const head = git(root, "rev-parse", "HEAD");
  let behind = null;
  if (builtCommit !== "" && head !== "" && !builtCommit.startsWith("unknown")) {
    if (builtCommit === head) behind = 0;
    else {
      const count = git(root, "rev-list", "--count", `${builtCommit}..${head}`);
      behind = /^\d+$/.test(count) ? parseInt(count, 10) : null;
    }
  }
  const [stale, reason] = isStaleGraph(graph, root);
  return {
    built_at: typeof prov["built_at"] === "string" ? prov["built_at"] : "unknown",
    built_from_commit: builtCommit === "" ? "unknown" : builtCommit,
    head_commit: head === "" ? "unknown" : head,
    commits_behind: behind,
    // `prov.get("dirty")` -- ABSENT stays absent (null), it does not become
    // false. An index built before the field existed says "unknown", and the
    // provenance line's `if age["built_from_dirty_tree"]` reads null as false
    // without claiming the tree was clean.
    built_from_dirty_tree: prov["dirty"] === void 0 ? null : prov["dirty"],
    stale,
    reason
  };
}
function edgesOf(graph) {
  const e = graph["edges"];
  if (!Array.isArray(e)) return [];
  const out = [];
  for (const row of e) {
    const o = obj(row);
    if (o !== null) out.push(o);
  }
  return out;
}
function symbolsOf(graph) {
  return obj(graph["symbols"]) ?? {};
}
function sortedUnique(xs) {
  return [...new Set(xs)].sort();
}
function callersOf(graph, target) {
  return sortedUnique(edgesOf(graph).filter((e) => e["to"] === target).map((e) => str2(e["from"])));
}
function calleesOf(graph, source) {
  return sortedUnique(edgesOf(graph).filter((e) => e["from"] === source).map((e) => str2(e["to"])));
}
function symbolsIn(graph, file) {
  const syms = symbolsOf(graph);
  return Object.keys(syms).filter((s2) => str2(obj(syms[s2])?.["file"]) === file).sort();
}
function findSymbol(graph, name) {
  const syms = symbolsOf(graph);
  return Object.keys(syms).filter((s2) => str2(obj(syms[s2])?.["name"]) === name).sort();
}
function neighbourhood(graph, target, depth) {
  const seen = /* @__PURE__ */ new Set([target]);
  let frontier = /* @__PURE__ */ new Set([target]);
  for (let i = 0; i < Math.max(0, depth); i += 1) {
    const next = /* @__PURE__ */ new Set();
    for (const node of frontier) {
      for (const c of callersOf(graph, node)) next.add(c);
      for (const c of calleesOf(graph, node)) next.add(c);
    }
    for (const s2 of seen) next.delete(s2);
    for (const s2 of next) seen.add(s2);
    frontier = next;
    if (frontier.size === 0) break;
  }
  const syms = symbolsOf(graph);
  const symbolIds = [...seen].filter((s2) => Object.prototype.hasOwnProperty.call(syms, s2)).sort();
  const fileSet = /* @__PURE__ */ new Set();
  for (const s2 of symbolIds) fileSet.add(str2(obj(syms[s2])?.["file"]));
  const files = Array.isArray(graph["files"]) ? graph["files"] : [];
  const fileIds = new Set(files.filter((f) => typeof f === "string"));
  for (const s2 of seen) if (fileIds.has(s2)) fileSet.add(s2);
  return { symbols: symbolIds, files: [...fileSet].sort() };
}

// src/nouns/graph/code-build-arm.ts
import { spawnSync as spawnSync3 } from "node:child_process";
import { join as join15, resolve as resolvePath } from "node:path";

// src/nouns/graph/code-build.ts
import { mkdirSync as mkdirSync3, readFileSync as readFileSync10, statSync as statSync5, writeFileSync as writeFileSync3 } from "node:fs";
import { dirname as dirname5, join as join14, relative as relative2 } from "node:path";
import { pathToFileURL } from "node:url";
var GRAMMAR_FILES = {
  python: "tree-sitter-python.wasm",
  bash: "tree-sitter-bash.wasm",
  javascript: "tree-sitter-javascript.wasm",
  typescript: "tree-sitter-typescript.wasm",
  go: "tree-sitter-go.wasm",
  rust: "tree-sitter-rust.wasm",
  ruby: "tree-sitter-ruby.wasm",
  php: "tree-sitter-php.wasm",
  java: "tree-sitter-java.wasm",
  c: "tree-sitter-c.wasm",
  cpp: "tree-sitter-cpp.wasm",
  c_sharp: "tree-sitter-c_sharp.wasm"
};
var DIALECT_BY_SUFFIX = {
  typescript: { ".tsx": "tree-sitter-tsx.wasm" }
};
var DEFINITION_NODES = {
  python: ["function_definition"],
  bash: ["function_definition"],
  javascript: ["function_declaration", "method_definition"],
  typescript: ["function_declaration", "method_definition"],
  go: ["function_declaration", "method_declaration"],
  rust: ["function_item"],
  ruby: ["method"],
  php: ["function_definition", "method_declaration"],
  java: ["method_declaration"],
  c: ["function_definition"],
  cpp: ["function_definition"],
  c_sharp: ["method_declaration"]
};
var CALL_NODES = {
  bash: ["command"]
};
var DEFAULT_CALL_NODES = [
  "call",
  "call_expression",
  "method_invocation",
  "function_call_expression"
];
function defNodesFor(lang) {
  return new Set(DEFINITION_NODES[lang] ?? ["function_definition"]);
}
function callNodesFor(lang) {
  return new Set(CALL_NODES[lang] ?? DEFAULT_CALL_NODES);
}
function grammarDir(codeRoot) {
  return join14(codeRoot, "tools", "grammars");
}
function runtimeDir(codeRoot) {
  return join14(codeRoot, "node_modules", "web-tree-sitter");
}
var GrammarUnavailable = class extends Error {
};
async function loadRuntime(codeRoot) {
  const dir = runtimeDir(codeRoot);
  const js = join14(dir, "web-tree-sitter.js");
  const wasm = join14(dir, "web-tree-sitter.wasm");
  const specifier = pathToFileURL(js).href;
  const rt = await import(specifier);
  await rt.Parser.init({ wasmBinary: new Uint8Array(readFileSync10(wasm)) });
  PARSER_CTOR = rt.Parser;
  return rt;
}
async function loadGrammars(codeRoot, langs) {
  const loaded = /* @__PURE__ */ new Map();
  const missing = /* @__PURE__ */ new Map();
  const wanted = [...langs].sort(cmpCodePoint);
  if (wanted.length === 0) return { loaded, missing };
  let rt;
  try {
    rt = await loadRuntime(codeRoot);
  } catch (e) {
    throw new GrammarUnavailable(
      `the tree-sitter runtime is not in this checkout (${msgOf(e)}). The BUILDER needs it; readers do not. It ships with the harness source repo only: run \`npm ci\` in a scrumux-cli checkout and build from there.`
    );
  }
  for (const lang of wanted) {
    const file = GRAMMAR_FILES[lang];
    if (file === void 0) {
      missing.set(lang, `no grammar module is registered for '${lang}' \u2014 add one to GRAMMAR_FILES in src/nouns/graph/code-build.ts`);
      continue;
    }
    try {
      const dialects = /* @__PURE__ */ new Map();
      for (const [suffix, blob] of Object.entries(DIALECT_BY_SUFFIX[lang] ?? {})) {
        dialects.set(suffix, await rt.Language.load(readGrammar(codeRoot, blob)));
      }
      loaded.set(lang, {
        lang,
        language: await rt.Language.load(readGrammar(codeRoot, file)),
        dialects
      });
    } catch (e) {
      missing.set(lang, `${file} could not be loaded: ${msgOf(e)}`);
    }
  }
  return { loaded, missing };
}
function readGrammar(codeRoot, file) {
  return new Uint8Array(readFileSync10(join14(grammarDir(codeRoot), file)));
}
async function buildCodeGraph(root, codeRoot) {
  const byLang = /* @__PURE__ */ new Map();
  let notSource = 0;
  for (const path of walkTree(root)) {
    let isFile2 = false;
    try {
      isFile2 = statSync5(path).isFile();
    } catch {
      isFile2 = false;
    }
    if (!isFile2) continue;
    const lang = languageOf(path);
    if (lang === null) {
      notSource += 1;
      continue;
    }
    const list = byLang.get(lang);
    if (list === void 0) byLang.set(lang, [path]);
    else list.push(path);
  }
  const { loaded, missing } = await loadGrammars(codeRoot, byLang.keys());
  if (byLang.size > 0 && loaded.size === 0) {
    const langs = [...byLang.keys()].sort(cmpCodePoint).join(", ");
    const why = [...missing.entries()].sort((a, b) => cmpCodePoint(a[0], b[0])).map(([k2, v]) => `${k2}: ${v}`).join("; ");
    throw new GrammarUnavailable(
      `this tree contains ${langs}, and no grammar could be loaded for any of them: ${why}`
    );
  }
  const files = [];
  const symbols = /* @__PURE__ */ new Map();
  const rawCalls = [];
  const rawSources = [];
  const parseErrors = [];
  const indexedByLang = /* @__PURE__ */ new Map();
  const skipped = [];
  for (const [lang, why] of [...missing.entries()].sort((a, b) => cmpCodePoint(a[0], b[0]))) {
    const paths = byLang.get(lang) ?? [];
    skipped.push({
      language: lang,
      files: paths.length,
      reason: why,
      examples: paths.map((p) => relKey(root, p)).sort(cmpCodePoint).slice(0, 5)
    });
  }
  for (const lang of [...loaded.keys()].sort(cmpCodePoint)) {
    const entry = loaded.get(lang);
    const defNodes = defNodesFor(lang);
    const callNodes = callNodesFor(lang);
    const parser = new PARSER_CTOR();
    try {
      for (const path of byLang.get(lang) ?? []) {
        const rel = relKey(root, path);
        files.push(rel);
        indexedByLang.set(lang, (indexedByLang.get(lang) ?? 0) + 1);
        const src = readFileSync10(path).toString("utf8");
        parser.setLanguage(languageFor(entry, rel));
        const tree = parser.parse(src);
        if (tree === null) {
          parseErrors.push(rel);
          continue;
        }
        try {
          if (tree.rootNode.hasError) parseErrors.push(rel);
          walkParseTree(
            tree,
            src,
            rel,
            lang,
            defNodes,
            callNodes,
            symbols,
            rawCalls,
            rawSources
          );
        } finally {
          tree.delete();
        }
      }
    } finally {
      parser.delete();
    }
  }
  files.sort(cmpCodePoint);
  parseErrors.sort(cmpCodePoint);
  return resolve3(
    root,
    files,
    symbols,
    rawCalls,
    rawSources,
    parseErrors,
    indexedByLang,
    skipped,
    notSource
  );
}
function languageFor(entry, rel) {
  if (entry.dialects.size === 0) return entry.language;
  const dot = rel.lastIndexOf(".");
  const suffix = dot > 0 ? rel.slice(dot).toLowerCase() : "";
  return entry.dialects.get(suffix) ?? entry.language;
}
var PARSER_CTOR = null;
function nodeText(node, src) {
  return src.slice(node.startIndex, node.endIndex);
}
function definitionName(node, src, lang) {
  if (lang === "python") {
    const ident2 = node.childForFieldName("name");
    return ident2 !== null ? nodeText(ident2, src) : null;
  }
  for (const child of node.children) {
    if (child !== null && child.type === "word") return nodeText(child, src);
  }
  const ident = node.childForFieldName("name");
  return ident !== null ? nodeText(ident, src) : null;
}
function calleeName(node, src, lang) {
  if (lang === "python") {
    const fn = node.childForFieldName("function");
    if (fn === null) return null;
    const text3 = nodeText(fn, src);
    return text3.slice(text3.lastIndexOf(".") + 1);
  }
  const name = node.childForFieldName("name");
  if (name === null) return null;
  const text2 = nodeText(name, src);
  return text2.includes("/") ? purePosixName(text2) : text2;
}
function sourcedFile(node, src) {
  for (const child of node.children.slice(1)) {
    if (child === null) continue;
    const text2 = pyStripChars(nodeText(child, src).trim(), `"'`);
    if (text2 === "" || text2.startsWith("-")) continue;
    const tail = pyStripChars(text2.slice(text2.lastIndexOf("/") + 1), `"'`);
    if (tail !== "" && !tail.includes("$")) return tail;
  }
  return null;
}
function importedModules(node, src) {
  const out = [];
  for (const child of node.children) {
    if (child === null) continue;
    if (child.type === "dotted_name" || child.type === "aliased_import" || child.type === "relative_import") {
      const text2 = nodeText(child, src).split(" as ")[0].trim();
      if (text2 !== "") out.push(text2.replaceAll(".", "/") + ".py");
    }
  }
  return out;
}
function walkParseTree(tree, src, rel, lang, defNodes, callNodes, symbols, rawCalls, rawSources) {
  const stack = [[tree.rootNode, null]];
  while (stack.length > 0) {
    const [node, inherited] = stack.pop();
    let enclosing = inherited;
    if (defNodes.has(node.type)) {
      const name = definitionName(node, src, lang);
      if (name !== null && name !== "") {
        const sid = `${rel}::${name}`;
        symbols.set(sid, {
          id: sid,
          name,
          file: rel,
          lang,
          line: node.startPosition.row + 1
        });
        enclosing = sid;
      }
    } else if (callNodes.has(node.type)) {
      const callee = calleeName(node, src, lang);
      if (callee === "." || callee === "source") {
        const target = sourcedFile(node, src);
        if (target !== null) rawSources.push([rel, target]);
      } else if (callee !== null && callee !== "") {
        rawCalls.push([enclosing ?? rel, callee, rel]);
      }
    } else if (node.type === "import_statement" || node.type === "import_from_statement") {
      for (const mod of importedModules(node, src)) rawSources.push([rel, mod]);
    }
    for (const child of node.children) {
      if (child !== null) stack.push([child, enclosing]);
    }
  }
}
function resolve3(root, files, symbols, rawCalls, rawSources, parseErrors, indexedByLang, skipped, notSource) {
  const byName = /* @__PURE__ */ new Map();
  for (const [sid, sym] of symbols) {
    const list = byName.get(sym.name);
    if (list === void 0) byName.set(sym.name, [sid]);
    else list.push(sid);
  }
  const byFile = /* @__PURE__ */ new Map();
  for (const f of files) byFile.set(f, f);
  for (const f of files) {
    const base = purePosixName(f);
    if (!byFile.has(base)) byFile.set(base, f);
  }
  const calls = [];
  for (const [caller, callee, inFile] of rawCalls) {
    const targets = byName.get(callee);
    if (targets !== void 0 && targets.length > 0) {
      const local = targets.filter((t) => symbols.get(t).file === inFile);
      const chosen = local.length > 0 ? local : targets.length === 1 ? [targets[0]] : [];
      for (const t of chosen) {
        if (t !== caller) calls.push({ from: caller, to: t, kind: "calls" });
      }
    } else {
      const f = byFile.get(callee);
      if (f !== void 0 && f !== caller) {
        calls.push({ from: caller, to: f, kind: "invokes" });
      }
    }
  }
  for (const [srcFile, target] of rawSources) {
    const resolved = byFile.get(target) ?? byFile.get(purePosixName(target));
    if (resolved !== void 0 && resolved !== "" && resolved !== srcFile) {
      calls.push({ from: srcFile, to: resolved, kind: "sources" });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const edges = [];
  for (const e of calls) {
    const key = JSON.stringify([e.from, e.to, e.kind]);
    if (!seen.has(key)) {
      seen.add(key);
      edges.push(e);
    }
  }
  edges.sort((a, b) => cmpCodePoint(a.from, b.from) || cmpCodePoint(a.to, b.to) || cmpCodePoint(a.kind, b.kind));
  return {
    root,
    files,
    symbols,
    edges,
    parse_errors: parseErrors,
    // --- coverage: what was indexed, and what was NOT -----------------
    // A skipped file used to be invisible. "31 files, 0 parse errors" over a
    // tree containing two PHP files is a true sentence and a false
    // impression, and the reader has no way to tell.
    coverage: {
      indexed: files.length,
      by_language: indexedByLang,
      skipped,
      not_source: notSource
    },
    // --- provenance: what this index was built FROM -------------------
    // A reader answers from an index without rebuilding it, so the index has
    // to say how old it is and against what. Without this a stale answer is
    // indistinguishable from a current one.
    provenance: provenanceOf(root)
  };
}
function provenanceOf(root) {
  const commit = git(root, "rev-parse", "HEAD");
  return {
    // `datetime.now(utc).replace(microsecond=0).isoformat()` with `+00:00`
    // rewritten to `Z`.
    built_at: (/* @__PURE__ */ new Date()).toISOString().slice(0, 19) + "Z",
    // A FLOAT, deliberately. Truncating to whole seconds made every index
    // look stale the moment it was built: a source file written at t=x.9
    // compares greater than a stamp of int(x). Python reads the clock a
    // SECOND time here, so the two fields can straddle a second boundary;
    // reproduced rather than collapsed to one read.
    built_at_epoch: Date.now() / 1e3,
    commit: commit !== "" ? commit : "unknown \u2014 the indexed tree is not a git checkout",
    dirty: commit !== "" ? git(root, "status", "--porcelain") !== "" : false,
    root,
    builder: "scrumux graph code build"
  };
}
function serializeIndex(g) {
  const L = [];
  L.push("{");
  L.push(`  ${k("root")}: ${s(g.root)},`);
  L.push(`  ${k("files")}: ${arr2(g.files.map(s), 2)},`);
  L.push(`  ${k("symbols")}: ${symbolsBlock(g.symbols)},`);
  L.push(`  ${k("edges")}: ${arr2(g.edges.map(edgeBlock), 2)},`);
  L.push(`  ${k("parse_errors")}: ${arr2(g.parse_errors.map(s), 2)},`);
  L.push(`  ${k("coverage")}: ${coverageBlock(g.coverage)},`);
  L.push(`  ${k("provenance")}: ${provenanceBlock(g.provenance)}`);
  L.push("}");
  return L.join("\n");
}
function symbolsBlock(syms) {
  if (syms.size === 0) return "{}";
  const rows5 = [];
  for (const [sid, r] of syms) {
    rows5.push(`    ${k(sid)}: {
      ${k("id")}: ${s(r.id)},
      ${k("name")}: ${s(r.name)},
      ${k("file")}: ${s(r.file)},
      ${k("lang")}: ${s(r.lang)},
      ${k("line")}: ${r.line}
    }`);
  }
  return `{
${rows5.join(",\n")}
  }`;
}
function edgeBlock(e) {
  return `{
      ${k("from")}: ${s(e.from)},
      ${k("to")}: ${s(e.to)},
      ${k("kind")}: ${s(e.kind)}
    }`;
}
function coverageBlock(c) {
  const langs = [...c.by_language.entries()].map(([lang, n]) => `      ${k(lang)}: ${n}`).join(",\n");
  const skipped = c.skipped.map((row) => `{
      ${k("language")}: ${s(row.language)},
      ${k("files")}: ${row.files},
      ${k("reason")}: ${s(row.reason)},
      ${k("examples")}: ${arr2(row.examples.map(s), 6)}
    }`);
  return `{
    ${k("indexed")}: ${c.indexed},
    ${k("by_language")}: ${langs === "" ? "{}" : `{
${langs}
    }`},
    ${k("skipped")}: ${arr2(skipped, 4)},
    ${k("not_source")}: ${c.not_source}
  }`;
}
function provenanceBlock(p) {
  return `{
    ${k("built_at")}: ${s(p.built_at)},
    ${k("built_at_epoch")}: ${pyFloat(p.built_at_epoch)},
    ${k("commit")}: ${s(p.commit)},
    ${k("dirty")}: ${p.dirty ? "true" : "false"},
    ${k("root")}: ${s(p.root)},
    ${k("builder")}: ${s(p.builder)}
  }`;
}
function arr2(items, indent) {
  if (items.length === 0) return "[]";
  const pad = " ".repeat(indent + 2);
  return `[
${items.map((i) => pad + i).join(",\n")}
${" ".repeat(indent)}]`;
}
var k = (key) => s(key);
function s(v) {
  let out = '"';
  for (const ch of v) {
    const c = ch.codePointAt(0);
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (ch === "\n") out += "\\n";
    else if (ch === "	") out += "\\t";
    else if (ch === "\r") out += "\\r";
    else if (ch === "\b") out += "\\b";
    else if (ch === "\f") out += "\\f";
    else if (c < 32) out += `\\u${c.toString(16).padStart(4, "0")}`;
    else out += ch;
  }
  return out + '"';
}
function pyFloat(v) {
  return Number.isInteger(v) ? `${v}.0` : String(v);
}
function writeIndex(g, path) {
  const payload = serializeIndex(g) + "\n";
  if (payload.trim() === "") throw new Error("refusing to write an empty index");
  mkdirSync3(dirname5(path), { recursive: true });
  writeFileSync3(path, payload);
}
function purePosixName(text2) {
  const parts = text2.split("/").filter((p) => p !== "" && p !== ".");
  return parts.length === 0 ? "" : parts[parts.length - 1];
}
function relKey(root, path) {
  return relative2(root, path).replaceAll("\\", "/");
}
function pyStripChars(text2, chars) {
  let a = 0;
  let b = text2.length;
  while (a < b && chars.includes(text2[a])) a += 1;
  while (b > a && chars.includes(text2[b - 1])) b -= 1;
  return text2.slice(a, b);
}
function cmpCodePoint(a, b) {
  if (a === b) return 0;
  const ai = [...a];
  const bi = [...b];
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i += 1) {
    const x = ai[i].codePointAt(0);
    const y = bi[i].codePointAt(0);
    if (x !== y) return x < y ? -1 : 1;
  }
  return ai.length === bi.length ? 0 : ai.length < bi.length ? -1 : 1;
}
function msgOf(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/nouns/graph/code-build-arm.ts
var CHILD = "SCRUMUX_CODE_GRAPH_CHILD";
var TREE_ROOT = "SCRUMUX_CODE_GRAPH_TREE_ROOT";
var DATA_ROOT = "SCRUMUX_CODE_GRAPH_DATA_ROOT";
function isBuildChild(env) {
  return env[CHILD] === "1";
}
function canBuild(ctx) {
  return isDir(grammarDir(ctx.codeRoot)) && isFile(join15(runtimeDir(ctx.codeRoot), "web-tree-sitter.js")) && selfBundle2(ctx) !== null;
}
function selfBundle2(ctx) {
  const override = ctx.env["SCRUMUX_CODE_GRAPH_SELF"];
  if (override !== void 0 && override !== "") return isFile(override) ? override : null;
  const entry = process.argv[1];
  if (entry === void 0 || entry === "") return null;
  return isFile(entry) ? entry : null;
}
async function runBuildChild(env, io) {
  const treeRoot = env[TREE_ROOT] ?? "";
  const dataRoot = env[DATA_ROOT] ?? "";
  const path = indexPath(dataRoot);
  let g;
  try {
    g = await buildCodeGraph(treeRoot, env["SCRUMUX_CODE_GRAPH_CODE_ROOT"] ?? treeRoot);
  } catch (e) {
    if (!(e instanceof GrammarUnavailable)) throw e;
    io.err(`graph code build: error: ${e.message}
  The BUILDER needs the grammars; readers do not \u2014 an existing index answers every query with no parser at all.
  Build from a harness checkout that has them:  scrumux graph code build --repo ${treeRoot}
  \`scrumux harness deploy\` does exactly this for every target it installs.
`);
    return 1;
  }
  try {
    writeIndex(g, path);
  } catch (e) {
    io.err(`graph code build: error: cannot write the index to ${path} \u2014 ${msgOf2(e)}
`);
    return 1;
  }
  const cov = g.coverage;
  io.out(`graph code: ${g.files.length} files, ${g.symbols.size} symbols, ${g.edges.length} edges -> ${path}
`);
  io.out("  indexed: " + [...cov.by_language.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([lang, n]) => `${lang}=${n}`).join(", ") + "\n");
  for (const s2 of cov.skipped) {
    io.out(`  NOT INDEXED: ${s2.files} ${s2.language} file(s) \u2014 ${s2.reason}` + (s2.examples.length > 0 ? ` (e.g. ${s2.examples.join(", ")})` : "") + "\n");
  }
  io.out(`  other files: ${cov.not_source} (no language mapped)
`);
  if (g.parse_errors.length > 0) {
    io.err("parse errors in: " + g.parse_errors.slice(0, 5).join(", ") + (g.parse_errors.length > 5 ? ` (+${g.parse_errors.length - 5} more)` : "") + " \u2014 indexed without their symbols; the index is written\n");
  }
  return 0;
}
function codeBuildChildArm(io, env) {
  void runBuildChild(env, io).then(
    (rc) => {
      process.exitCode = rc;
    },
    (e) => {
      io.err(`graph code build: error: ${msgOf2(e)}
`);
      process.exitCode = 2;
    }
  );
  return void 0;
}
function buildViaChild(ctx, treeRoot, dataRoot) {
  const self = selfBundle2(ctx);
  if (self === null) {
    return {
      rc: 1,
      stdout: "",
      stderr: "graph code build: error: this build carries no bundle path to run the indexer in \u2014 the parse runs in a child process and there is nothing here to spawn.\n",
      combined: ""
    };
  }
  const r = spawnSync3(process.execPath, [self, "graph", "code", "build"], {
    cwd: ctx.cwd,
    env: {
      ...ctx.env,
      [CHILD]: "1",
      [TREE_ROOT]: treeRoot,
      [DATA_ROOT]: dataRoot,
      SCRUMUX_CODE_GRAPH_CODE_ROOT: ctx.codeRoot
    },
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  });
  const stdout = r.stdout ?? "";
  const stderr = r.stderr ?? "";
  return {
    rc: r.status === null || r.status === void 0 ? 2 : r.status,
    stdout,
    stderr,
    // STDERR FIRST in the combined stream, deliberately: `graph code index`
    // cuts this capture with `head -3`, so the join order decides which
    // three lines a failure names. Parse errors (stderr) come before the
    // summary report (stdout) here regardless of the order the child
    // actually wrote them in.
    combined: stderr + stdout
  };
}
function codeBuild(cli, ctx, args) {
  let repo = ctx.codeRoot;
  let data = ctx.root;
  for (let i = 0; i < args.length; ) {
    const a = args[i];
    if (a === "--repo") {
      const v = args[i + 1] ?? "";
      if (v === "") cli.die("--repo needs a path");
      repo = v;
      data = v;
      i += 2;
    } else {
      cli.dieUsage(`graph code build: unknown argument '${a}' \u2014 usage: scrumux graph code build [--repo <path>]`);
    }
  }
  if (!isDir(resolvePath(ctx.cwd, repo))) {
    cli.die(`graph code build: ${repo} is not a directory`);
  }
  return buildViaChild(ctx, resolvePath(ctx.cwd, repo), resolvePath(ctx.cwd, data));
}
function codeBuildArm(cli, ctx, io, args) {
  const r = codeBuild(cli, ctx, args);
  io.out(r.stdout);
  io.err(r.stderr);
  if (r.rc !== 0) {
    cli.fail("code-graph", `build failed (exit ${r.rc}) \u2014 see the message above`);
    cli.emit("graph code build: failed.");
  }
  cli.pass("code-graph", "index rebuilt");
  cli.emit("");
}
function msgOf2(e) {
  return e instanceof Error ? e.message : String(e);
}

// src/nouns/graph/gov-graph.ts
import { existsSync as existsSync11, mkdirSync as mkdirSync4, readFileSync as readFileSync11, statSync as statSync6, writeFileSync as writeFileSync4 } from "node:fs";
import { dirname as dirname6, join as join16 } from "node:path";
var GovIndexUnreadable = class extends Error {
};
var JOURNALS = [
  "design.json",
  "tasks.json",
  "sprints.json",
  "reviews.json",
  "decisions.json",
  "issues.json",
  "log.json"
];
var ID_FULL = /^(?:SP|[EFSTRDIL])-\d{4}$/;
function isRecordId(s2) {
  return ID_FULL.test(s2);
}
var GRAPH_SCHEMA = 2;
var FILE_EDGE_KINDS = ["changes", "reads"];
var NO_DIFF = /^(expected[\s-]+)?(none|no[\s-]+(change|changes|diff|edit|edits|new)|unchanged|untouched|read[\s-]?only|n\/?a|nil)\b/i;
function obj2(v) {
  return v !== null && v !== void 0 && typeof v === "object" && !Array.isArray(v) && !(v instanceof RawNumber) ? v : null;
}
function loadJournal(root, name) {
  const path = join16(root, "governance", name);
  if (!existsSync11(path) || !isFile(path)) return [];
  const text2 = readFileSync11(path, "utf8");
  let doc;
  try {
    doc = parsePreservingNumbers(text2);
  } catch {
    throw new Error(pyDecodeMessage(text2));
  }
  const o = obj2(doc);
  if (o === null) return [];
  const e = o["entries"];
  if (!Array.isArray(e)) return [];
  const out = [];
  for (const row of e) {
    const r = obj2(row);
    if (r !== null) out.push(r);
  }
  return out;
}
function kindOf(entry, journal) {
  if (journal === "design.json") {
    const k2 = entry["kind"];
    return typeof k2 === "string" ? k2 : k2 === void 0 ? "design" : String(k2);
  }
  return {
    "tasks.json": "task",
    "sprints.json": "sprint",
    "reviews.json": "review",
    "decisions.json": "decision",
    "issues.json": "issue",
    "log.json": "log"
  }[journal];
}
function diffIsChange(expectedDiff) {
  if (typeof expectedDiff !== "string") return false;
  const text2 = expectedDiff.trim().replace(/^[-—–:.]+/, "").replace(/[-—–:.]+$/, "").trim();
  if (text2 === "") return false;
  return !NO_DIFF.test(text2);
}
function orderPaths(entry) {
  const order = obj2(entry["task_order"]) ?? {};
  const context = obj2(order["context"]) ?? {};
  const out = /* @__PURE__ */ new Map();
  const files = context["files"];
  if (Array.isArray(files)) {
    for (const f of files) {
      const fo = obj2(f);
      if (fo === null) continue;
      const path = fo["path"];
      if (typeof path !== "string" || path.trim() === "") continue;
      out.set(path.trim(), diffIsChange(fo["expected_diff"]) ? "changes" : "reads");
    }
  }
  const artifacts = context["expected_artifacts"];
  if (Array.isArray(artifacts)) {
    for (const path of artifacts) {
      if (typeof path === "string" && path.trim() !== "") out.set(path.trim(), "changes");
    }
  }
  return out;
}
function build(root) {
  const nodes = /* @__PURE__ */ new Map();
  const edges = [];
  const dangling = [];
  const loaded = /* @__PURE__ */ new Map();
  const journalEntries = (name) => {
    let e = loaded.get(name);
    if (e === void 0) {
      e = loadJournal(root, name);
      loaded.set(name, e);
    }
    return e;
  };
  for (const journal of JOURNALS) {
    for (const entry of journalEntries(journal)) {
      const rid = entry["id"];
      if (typeof rid !== "string" || rid === "") continue;
      nodes.set(rid, {
        id: rid,
        kind: kindOf(entry, journal),
        journal,
        // `or ""` -- Python's falsy chain, so an empty string or a null falls
        // through to the next field and finally to "".
        title: firstTruthy([entry["title"], entry["name"], entry["summary"], entry["narrative"]]),
        status: entry["status"] === void 0 ? null : entry["status"]
      });
    }
  }
  const edge = (src, dst, kind) => {
    if (isFalsy(dst)) return;
    const targets = Array.isArray(dst) ? dst : [dst];
    for (const target of targets) {
      if (typeof target !== "string" || !isRecordId(target)) continue;
      if (nodes.has(target)) edges.push({ from: src, to: target, kind });
      else dangling.push({ from: src, to: target, kind });
    }
  };
  for (const journal of JOURNALS) {
    for (const entry of journalEntries(journal)) {
      const rid = entry["id"];
      if (typeof rid !== "string" || rid === "") continue;
      const refs = obj2(entry["refs"]) ?? {};
      edge(rid, refs["issue"], "refs_issue");
      edge(rid, refs["task"], "refs_task");
      edge(rid, entry["supersedes"], "supersedes");
      edge(rid, entry["task"], "on_task");
      edge(rid, entry["feature"], "in_feature");
      edge(rid, entry["story"], "for_story");
      edge(rid, entry["epic"], "in_epic");
      edge(rid, entry["tasks"], "carries");
      edge(rid, entry["features"], "groups");
      edge(rid, entry["stories"], "has_story");
      edge(rid, entry["dependencies"], "depends_on");
      edge(rid, entry["source_issue"], "from_issue");
      edge(rid, (obj2(entry["validation"]) ?? {})["duplicate_of"], "duplicate_of");
    }
  }
  for (const entry of journalEntries("tasks.json")) {
    const rid = entry["id"];
    if (typeof rid !== "string" || rid === "") continue;
    for (const [path, relation] of [...orderPaths(entry).entries()].sort((a, b) => cmp2(a[0], b[0]))) {
      if (isRecordId(path)) continue;
      if (!nodes.has(path)) {
        nodes.set(path, { id: path, kind: "file", journal: null, title: "", status: null });
      }
      edges.push({ from: rid, to: path, kind: relation });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  const unique2 = [];
  for (const e of edges) {
    const key = `${e.from}\0${e.to}\0${e.kind}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique2.push(e);
    }
  }
  unique2.sort((a, b) => cmp2(a.from, b.from) || cmp2(a.to, b.to) || cmp2(a.kind, b.kind));
  const nodeObj = {};
  for (const [k2, v] of nodes) nodeObj[k2] = v;
  return {
    schema: GRAPH_SCHEMA,
    root,
    nodes: nodeObj,
    edges: unique2.map((e) => ({ from: e.from, to: e.to, kind: e.kind })),
    dangling: dangling.map((e) => ({ from: e.from, to: e.to, kind: e.kind }))
  };
}
function firstTruthy(candidates) {
  for (const c of candidates) {
    if (isFalsy(c)) continue;
    return c;
  }
  return "";
}
function isFalsy(v) {
  if (v === void 0 || v === null || v === false || v === "") return true;
  if (v instanceof RawNumber) return Number(v.text) === 0;
  if (typeof v === "number") return v === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}
function cmp2(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
function govIndexPath(root) {
  return join16(root, "governance", "governance-graph.json");
}
function writeGovIndex(graph, path) {
  const payload = pyJsonDumps(graph, 2) + "\n";
  if (payload.trim() === "") throw new Error("refusing to write an empty index");
  mkdirSync4(dirname6(path), { recursive: true });
  writeFileSync4(path, payload);
}
function pyJsonDumps(value, indent, depth = 0) {
  const pad = " ".repeat(indent * (depth + 1));
  const padEnd = " ".repeat(indent * depth);
  if (value === null || value === void 0) return "null";
  if (value instanceof RawNumber) return value.text;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return pyNumber(value);
  if (typeof value === "string") return pyJsonString(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return "[\n" + value.map((v) => pad + pyJsonDumps(v, indent, depth + 1)).join(",\n") + "\n" + padEnd + "]";
  }
  const keys = Object.keys(value);
  if (keys.length === 0) return "{}";
  return "{\n" + keys.map((k2) => pad + pyJsonString(k2) + ": " + pyJsonDumps(value[k2], indent, depth + 1)).join(",\n") + "\n" + padEnd + "}";
}
function pyNumber(n) {
  return String(n);
}
function pyJsonString(s2) {
  let out = '"';
  for (const ch of s2) {
    const c = ch.codePointAt(0);
    if (ch === '"') {
      out += '\\"';
      continue;
    }
    if (ch === "\\") {
      out += "\\\\";
      continue;
    }
    if (c === 8) {
      out += "\\b";
      continue;
    }
    if (c === 9) {
      out += "\\t";
      continue;
    }
    if (c === 10) {
      out += "\\n";
      continue;
    }
    if (c === 12) {
      out += "\\f";
      continue;
    }
    if (c === 13) {
      out += "\\r";
      continue;
    }
    if (c < 32) {
      out += "\\u" + c.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out + '"';
}
function loadGovIndex(path) {
  let doc;
  const text2 = readFileSync11(path, "utf8");
  try {
    doc = parsePreservingNumbers(text2);
  } catch {
    throw new GovIndexUnreadable(
      `${path} is not valid JSON (${pyDecodeMessage(text2)}) \u2014 the index is corrupt or truncated; rebuild it: scrumux graph gov build`
    );
  }
  const o = obj2(doc);
  if (o === null) {
    throw new GovIndexUnreadable(
      `${path} is valid JSON but not an index object \u2014 rebuild it: scrumux graph gov build`
    );
  }
  return o;
}
function loadGovIndexCurrent(path, root) {
  const doc = loadGovIndex(path);
  const schema = doc["schema"];
  const schemaNum = schema instanceof RawNumber ? Number(schema.text) : schema;
  if (schemaNum === GRAPH_SCHEMA) return [doc, null];
  const rebuilt = build(root);
  let where;
  try {
    writeGovIndex(rebuilt, path);
    where = "rewritten";
  } catch {
    where = "in memory only, the index on disk is not writable";
  }
  return [rebuilt, `index schema ${pyRepr2(schema)} predates ${GRAPH_SCHEMA} \u2014 rebuilt (${where})`];
}
function pyRepr2(v) {
  if (v === void 0 || v === null) return "None";
  if (v instanceof RawNumber) return v.text;
  if (typeof v === "boolean") return v ? "True" : "False";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return `'${v.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
  return JSON.stringify(v);
}
function isStale(graphPath, root) {
  if (!isFile(graphPath)) {
    return [true, `no index at ${graphPath} \u2014 run: scrumux graph gov build`];
  }
  let onDisk;
  try {
    onDisk = obj2(parsePreservingNumbers(readFileSync11(graphPath, "utf8")))?.["schema"];
  } catch {
    onDisk = void 0;
  }
  const onDiskNum = onDisk instanceof RawNumber ? Number(onDisk.text) : onDisk;
  if (onDiskNum !== GRAPH_SCHEMA) {
    return [true, `index schema ${pyRepr2(onDisk)} predates ${GRAPH_SCHEMA} \u2014 run: scrumux graph gov build`];
  }
  const mtime2 = mtimeSeconds2(graphPath);
  for (const name of JOURNALS) {
    const p = join16(root, "governance", name);
    if (!isFile(p)) continue;
    const m = mtimeSeconds2(p);
    if (m !== null && mtime2 !== null && m > mtime2) {
      return [true, `governance/${name} is newer than the index \u2014 run: scrumux graph gov build`];
    }
  }
  return [false, "index is newer than every journal"];
}
function mtimeSeconds2(path) {
  try {
    return Number(statSync6(path, { bigint: true }).mtimeNs) / 1e9;
  } catch {
    return null;
  }
}
function edgesOf2(graph) {
  const e = graph["edges"];
  if (!Array.isArray(e)) return [];
  const out = [];
  for (const row of e) {
    const o = obj2(row);
    if (o === null) continue;
    out.push({
      from: typeof o["from"] === "string" ? o["from"] : "",
      to: typeof o["to"] === "string" ? o["to"] : "",
      kind: typeof o["kind"] === "string" ? o["kind"] : ""
    });
  }
  return out;
}
function nodesOf(graph) {
  return obj2(graph["nodes"]) ?? {};
}
function nodeKind(graph, id) {
  const n = obj2(nodesOf(graph)[id]);
  if (n === null) return null;
  return typeof n["kind"] === "string" ? n["kind"] : null;
}
function outbound(graph, id) {
  return edgesOf2(graph).filter((e) => e.from === id);
}
function inbound(graph, id) {
  return edgesOf2(graph).filter((e) => e.to === id);
}
var PROVENANCE_BUCKETS = {
  decision: "decisions",
  issue: "issues",
  review: "reviews",
  story: "stories",
  feature: "features",
  sprint: "sprints",
  log: "log",
  file: "files"
};
function provenance(graph, taskId) {
  const touching = /* @__PURE__ */ new Set();
  for (const e of inbound(graph, taskId)) touching.add(e.from);
  for (const e of outbound(graph, taskId)) touching.add(e.to);
  const out = {
    decisions: [],
    issues: [],
    reviews: [],
    stories: [],
    features: [],
    sprints: [],
    log: [],
    files: [],
    other: []
  };
  for (const rid of [...touching].sort(cmp2)) {
    const kind = nodeKind(graph, rid) ?? "";
    out[PROVENANCE_BUCKETS[kind] ?? "other"].push(rid);
  }
  return out;
}
function impact(graph, nodeId, depth) {
  if (!Object.prototype.hasOwnProperty.call(nodesOf(graph), nodeId)) {
    return { error: "unknown record id", reached: {}, total: 0, depth };
  }
  const seen = /* @__PURE__ */ new Set([nodeId]);
  let frontier = /* @__PURE__ */ new Set([nodeId]);
  for (let i = 0; i < Math.max(0, depth); i += 1) {
    const next = /* @__PURE__ */ new Set();
    for (const rid of frontier) {
      for (const e of outbound(graph, rid)) next.add(e.to);
      for (const e of inbound(graph, rid)) next.add(e.from);
    }
    for (const r of [...next]) if (nodeKind(graph, r) === "file") next.delete(r);
    for (const s2 of seen) next.delete(s2);
    for (const s2 of next) seen.add(s2);
    frontier = next;
    if (frontier.size === 0) break;
  }
  const grouped = {};
  for (const rid of [...seen].filter((r) => r !== nodeId).sort(cmp2)) {
    const kind = nodeKind(graph, rid) ?? "unknown";
    (grouped[kind] ??= []).push(rid);
  }
  return { reached: grouped, total: Object.values(grouped).reduce((a, v) => a + v.length, 0), depth };
}
var ROOT_KINDS = /* @__PURE__ */ new Set(["epic", "sprint", "log", "review", "decision"]);
var OWNS_OUTWARD = {
  issue: /* @__PURE__ */ new Set(["refs_task"])
};
function orphans(graph, kinds) {
  const targeted = new Set(edgesOf2(graph).map((e) => e.to));
  const out = /* @__PURE__ */ new Map();
  const nodes = nodesOf(graph);
  for (const rid of Object.keys(nodes)) {
    const kind = nodeKind(graph, rid) ?? "";
    if (ROOT_KINDS.has(kind)) continue;
    if (kinds !== null && !kinds.has(kind)) continue;
    if (targeted.has(rid)) continue;
    const owning = OWNS_OUTWARD[kind];
    if (owning !== void 0 && outbound(graph, rid).some((e) => owning.has(e.kind))) continue;
    (out.get(kind) ?? out.set(kind, []).get(kind)).push(rid);
  }
  const sorted = [...out.entries()].sort((a, b) => cmp2(a[0], b[0])).map(([k2, v]) => [k2, [...v].sort(cmp2)]);
  return { orphans: sorted, total: [...out.values()].reduce((a, v) => a + v.length, 0) };
}
var BEARING_KINDS = /* @__PURE__ */ new Set(["decision", "issue"]);
var BEARING_RELAY = /* @__PURE__ */ new Set(["review", "log"]);
function adjacency(graph) {
  const adj = /* @__PURE__ */ new Map();
  for (const e of edgesOf2(graph)) {
    (adj.get(e.from) ?? adj.set(e.from, /* @__PURE__ */ new Set()).get(e.from)).add(e.to);
    (adj.get(e.to) ?? adj.set(e.to, /* @__PURE__ */ new Set()).get(e.to)).add(e.from);
  }
  return adj;
}
function recordsAround(graph, taskId, adj) {
  const first = /* @__PURE__ */ new Set();
  for (const r of adj.get(taskId) ?? []) if (nodeKind(graph, r) !== "file") first.add(r);
  const reached = new Set(first);
  for (const rid of first) {
    if (!BEARING_RELAY.has(nodeKind(graph, rid) ?? "")) continue;
    for (const r of adj.get(rid) ?? []) if (nodeKind(graph, r) !== "file") reached.add(r);
  }
  return reached;
}
function bearing(graph, paths, task) {
  const adj = adjacency(graph);
  const byPath = /* @__PURE__ */ new Map();
  for (const e of edgesOf2(graph)) {
    if (!FILE_EDGE_KINDS.includes(e.kind)) continue;
    (byPath.get(e.to) ?? byPath.set(e.to, []).get(e.to)).push([e.from, e.kind]);
  }
  const pathRows = [];
  const found = /* @__PURE__ */ new Map();
  for (const path of paths) {
    const touching = [...byPath.get(path) ?? []].sort((a, b) => cmp2(a[0], b[0]) || cmp2(a[1], b[1]));
    let relation;
    if (task !== null && touching.some(([t]) => t === task)) {
      const mine = touching.filter(([t]) => t === task).map(([, k2]) => k2);
      relation = mine.includes("changes") ? "changes" : "reads";
    } else if (touching.length > 0) {
      relation = touching.some(([, k2]) => k2 === "changes") ? "changes" : "reads";
    } else {
      relation = "absent";
    }
    pathRows.push({ path, relation, tasks: [...new Set(touching.map(([t]) => t))].sort(cmp2) });
    for (const [src, kind] of touching) {
      if (task !== null && src === task) continue;
      const rel = task !== null ? relation : kind;
      for (const rid of recordsAround(graph, src, adj)) {
        const nodeK = nodeKind(graph, rid);
        if (nodeK === null || !BEARING_KINDS.has(nodeK)) continue;
        const prev = found.get(rid);
        if (prev === void 0 || prev.relation !== "changes" && rel === "changes") {
          found.set(rid, { id: rid, kind: nodeK, path, relation: rel, via: src });
        }
      }
    }
  }
  const records = [...found.values()].sort((a, b) => cmp2(a.kind, b.kind) || cmp2(a.id, b.id));
  return { paths: pathRows, records, total: records.length };
}

// src/nouns/graph.ts
var CODE_CMDS = "build|index|callers|callees|symbols|find|near|stats";
var GOV_CMDS = "build|index|provenance|inbound|outbound|impact|orphans|dangling|stats|bearing";
var VERBS_TSV6 = "code	what calls what, over the source tree\ngov	the governance journals traversed as a graph\n";
var USAGE5 = `scrumux graph \u2014 the two derived graphs. No LLM in either path (D-0001):
both are repo fact, and a fact a model guessed at is not a fact.

  scrumux graph code build [--repo <path>]   (re)build the code index
  scrumux graph code index                   the freshness check
  scrumux graph code callers <id>            who calls this symbol or file
  scrumux graph code callees <id>            what this calls
  scrumux graph code symbols <file>          symbols defined in a file
  scrumux graph code find <name>             symbol ids matching a bare name
  scrumux graph code near <id> [n]           within n call-hops, both ways
  scrumux graph code stats                   counts, coverage, provenance

  scrumux graph gov build                    (re)build the governance index
  scrumux graph gov index                    exit 0 if current, rebuild if stale
  scrumux graph gov provenance <id>          what bears on a task, both directions
  scrumux graph gov inbound|outbound <id>    records pointing at / pointed at
  scrumux graph gov impact <id> [n]          what changing this touches
  scrumux graph gov orphans [kind]           records nothing points at
  scrumux graph gov dangling                 refs naming a record that is gone
  scrumux graph gov stats                    node and edge counts by kind
  scrumux graph gov bearing [--task T-0001] [--file <path>] [<path>...]
                                             the decisions and issues that
                                             BIND a file set (T-0153)

READER / BUILDER. Every \`graph code\` query answers from
governance/code-graph.json with NO tree-sitter and NO rebuild, stamped
with the commit it was built from and how far behind HEAD that is now.
Only \`build\` needs the grammars, it takes an explicit --repo, and
\`scrumux harness deploy\` runs it into every target it installs \u2014 so a
deployed repo has a working code graph without ever carrying a parser.

Nothing here depends on the scrumux-app. The app is one more optional
refresher and reader of the same on-disk file.

LANGUAGE-AGNOSTIC. The grammar set is a registry in
src/nouns/graph/code-build.ts, not a branch. A file whose language has no
installed grammar is COUNTED AND NAMED by \`stats\` and by \`build\` \u2014 never
skipped in silence, because a silently skipped file looks exactly like a
file with nothing in it.

A code symbol id is "<path>::<name>"; a code file id is the repo-relative
path. A governance id is a record id.
`;
function codeRead(cli, ctx, json, cmd, args) {
  const dataRoot = ctx.root;
  const treeRoot = ctx.codeRoot;
  const path = indexPath(dataRoot);
  if (!isFile(path)) {
    cli.sayAlways(
      `graph code: error: no index at ${path}, so there is nothing to read.
  Build it here (needs the tree-sitter grammars):  scrumux graph code build
  Or from a harness checkout that has them:        scrumux graph code build --repo ${treeRoot}
  \`scrumux harness deploy\` builds one into every target it installs, so a
  deployed repo normally has one without ever needing a parser.`
    );
    return { ok: false, code: 1 };
  }
  let g;
  try {
    g = loadIndex(path);
  } catch (e) {
    if (!(e instanceof IndexUnreadable)) throw e;
    cli.sayAlways(`graph code: error: ${e.message}`);
    return { ok: false, code: 1 };
  }
  const age = indexAge(g, treeRoot);
  const short = (c) => (
    // "unknown — the indexed tree is not a git checkout" truncated to 8
    // characters reads as a commit hash that happens to say "unknown".
    c !== "" && !c.startsWith("unknown") ? c.slice(0, 8) : "no git commit"
  );
  let provLine = `graph code: index built from ${short(age.built_from_commit)} at ${age.built_at}; HEAD is ${short(age.head_commit)}`;
  if (age.commits_behind !== null) provLine += ` \u2014 ${age.commits_behind} commit(s) behind`;
  if (truthy2(age.built_from_dirty_tree)) provLine += "; built from a DIRTY tree";
  if (age.stale) {
    provLine += `. STALE: ${age.reason}. `;
    provLine += canBuild(ctx) ? "Refresh: scrumux graph code build" : `Refresh from a harness checkout: scrumux graph code build --repo ${treeRoot}`;
  } else provLine += ". Current.";
  const cov = objOf(g["coverage"]) ?? {};
  const skipped = Array.isArray(cov["skipped"]) ? cov["skipped"] : [];
  if (!json) {
    cli.sayAlways(provLine);
    for (const s2 of skipped) {
      const so = objOf(s2) ?? {};
      cli.sayAlways(`graph code: NOT INDEXED \u2014 ${intOf(so["files"])} ${strOf(so["language"])} file(s): ${strOf(so["reason"])}`);
    }
  }
  const lines = [];
  if (cmd === "stats") {
    const symbols = objOf(g["symbols"]) ?? {};
    const langs = /* @__PURE__ */ new Map();
    for (const s2 of Object.values(symbols)) {
      const lang = strOf((objOf(s2) ?? {})["lang"]);
      langs.set(lang, (langs.get(lang) ?? 0) + 1);
    }
    const files = Array.isArray(g["files"]) ? g["files"] : [];
    const edges = Array.isArray(g["edges"]) ? g["edges"] : [];
    const parseErrors = Array.isArray(g["parse_errors"]) ? g["parse_errors"] : [];
    lines.push(`files   ${files.length} indexed`);
    lines.push(`symbols ${Object.keys(symbols).length}  ` + [...langs.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([k2, v]) => `${k2}=${v}`).join(" "));
    lines.push(`edges   ${edges.length}`);
    for (const s2 of skipped) {
      const so = objOf(s2) ?? {};
      lines.push(`NOT INDEXED  ${intOf(so["files"])} ${strOf(so["language"])} file(s) \u2014 ${strOf(so["reason"])}`);
    }
    if (skipped.length === 0) {
      lines.push("NOT INDEXED  none \u2014 every source language in this tree has a grammar");
    }
    lines.push(`other files  ${intOf(cov["not_source"])} (no language mapped: docs, data, binaries)`);
    if (parseErrors.length > 0) {
      lines.push(`parse errors ${parseErrors.length}: ${parseErrors.slice(0, 5).map((p) => strOf(p)).join(", ")}`);
    }
  } else if (args.length === 0) {
    cli.sayAlways(`graph code: error: ${cmd} needs an argument`);
    return { ok: false, code: 2 };
  } else if (cmd === "callers") {
    lines.push(...callersOf(g, args[0]));
  } else if (cmd === "callees") {
    lines.push(...calleesOf(g, args[0]));
  } else if (cmd === "symbols") {
    lines.push(...symbolsIn(g, args[0]));
  } else if (cmd === "find") {
    lines.push(...findSymbol(g, args[0]));
  } else if (cmd === "near") {
    const depth = args.length > 1 ? parseInt(args[1], 10) : 1;
    const n = neighbourhood(g, args[0], Number.isNaN(depth) ? 1 : depth);
    lines.push(...n.files, ...n.symbols);
  } else {
    cli.sayAlways(`graph code: error: unknown reader ${cmd}`);
    return { ok: false, code: 2 };
  }
  return { ok: true, lines, provenance: age, coverage: cov };
}
function codeReaderArm(cli, ctx, cmd, args) {
  if (cli.json) {
    const r2 = codeRead(cli, ctx, true, cmd, args);
    if (!r2.ok) {
      cli.die(`graph code ${cmd}: the reader could not answer \u2014 see stderr`);
    }
    cli.data({
      provenance: r2.provenance,
      coverage: r2.coverage,
      lines: r2.lines
    });
    cli.emit("");
  }
  const r = codeRead(cli, ctx, false, cmd, args);
  if (!r.ok) {
    cli.fail("code-graph", "the reader could not answer \u2014 see the message above");
    cli.emit("");
  }
  for (const l of r.lines) cli.say(l);
  cli.emit("");
}
function codeIndex(cli, ctx) {
  const builder = canBuild(ctx);
  const idx = join17(ctx.gov, "code-graph.json");
  if (!isFile(idx)) {
    if (builder) {
      const r = codeBuild(cli, ctx, []);
      const out = stripTrailingNewlines(r.combined);
      if (r.rc !== 0) {
        cli.fail("code-graph", `no index, and the build failed: ${trNewlines(shHead(out, 3), " ")}`);
        cli.emit("graph code index: no index and the rebuild failed.");
      }
      cli.say(out);
      cli.pass("code-graph", "no index existed; built one");
      cli.emit("graph code index: built.");
    }
    cli.fail(
      "code-graph",
      `no index at governance/code-graph.json and no tree-sitter grammars here to build one. Build it from a harness checkout that has them: scrumux graph code build --repo ${ctx.root}. (scrumux harness deploy installs an index into every target, so a deployed repo normally has one.)`
    );
    cli.emit("graph code index: no index, and nothing here can build one.");
  }
  const age = readAgeQuietly(ctx);
  if (age === null) {
    cli.fail(
      "code-graph",
      `index exists but its provenance is unreadable (corrupt) \u2014 a real defect (D-0044). Rebuild from a harness checkout: scrumux graph code build --repo ${ctx.root}`
    );
    cli.emit("graph code index: provenance unreadable \u2014 the index is corrupt.");
  }
  if (age.stale === false) {
    cli.pass("code-graph", `index current \u2014 ${age.reason}`);
    cli.emit("graph code index: current.");
  }
  if (builder) {
    const r = codeBuild(cli, ctx, []);
    const out = stripTrailingNewlines(r.combined);
    if (r.rc !== 0) {
      cli.fail(
        "code-graph",
        `index is stale (${age.reason}) and the rebuild failed: ${trNewlines(shHead(out, 3), " ")}`
      );
      cli.emit("graph code index: stale, and the rebuild failed.");
    }
    cli.say(out);
    cli.pass("code-graph", `was stale (${age.reason}) \u2014 rebuilt (D-0043)`);
    cli.emit("graph code index: rebuilt.");
  }
  cli.tell(
    "code-graph",
    `index is stale (${age.reason}) and there are no tree-sitter grammars here to rebuild it. Every query still answers, stamped with how far behind it is. Refresh from a harness checkout: scrumux graph code build --repo ${ctx.root}`
  );
  cli.emit("graph code index: stale, reported; readers still answer with provenance.");
}
function readAgeQuietly(ctx) {
  try {
    const path = indexPath(ctx.root);
    if (!isFile(path)) return null;
    return indexAge(loadIndex(path), ctx.codeRoot);
  } catch {
    return null;
  }
}
function govRun(cli, ctx, quiet, cmd, args) {
  const err = (line) => {
    if (!quiet) cli.sayAlways(line);
  };
  const root = ctx.root;
  const path = govIndexPath(root);
  const out = [];
  if (cmd === "build") {
    let g2;
    try {
      g2 = build(root);
      writeGovIndex(g2, path);
    } catch (e) {
      err(`graph gov: error: build failed \u2014 ${msgOf3(e)}`);
      return { ok: false };
    }
    const dangling = Array.isArray(g2["dangling"]) ? g2["dangling"] : [];
    if (dangling.length > 0) {
      err(`dangling refs: ${dangling.length} (scrumux graph gov dangling)`);
    }
    return {
      ok: true,
      lines: [`graph gov: ${Object.keys(nodesOf(g2)).length} nodes, ${edgesOf2(g2).length} edges -> ${path}`]
    };
  }
  if (cmd === "index") {
    const [stale, why] = isStale(path, root);
    if (!stale) return { ok: true, lines: [`graph gov: index current \u2014 ${why}`] };
    let g2;
    try {
      g2 = build(root);
      writeGovIndex(g2, path);
    } catch (e) {
      err(`graph gov: error: index is stale and cannot be rebuilt \u2014 ${msgOf3(e)}`);
      return { ok: false };
    }
    const dangling = Array.isArray(g2["dangling"]) ? g2["dangling"] : [];
    return {
      ok: true,
      lines: [`graph gov: rebuilt \u2014 ${Object.keys(nodesOf(g2)).length} nodes, ${edgesOf2(g2).length} edges` + (dangling.length > 0 ? `, ${dangling.length} dangling` : "")]
    };
  }
  if (!isFile(path)) {
    try {
      const g2 = build(root);
      writeGovIndex(g2, path);
      err(`graph gov: no index \u2014 built one (${Object.keys(nodesOf(g2)).length} nodes, ${edgesOf2(g2).length} edges)`);
    } catch (e) {
      err(`graph gov: error: no index and it cannot be built \u2014 ${msgOf3(e)}
  the governance journals are the source; check they parse: scrumux records check`);
      return { ok: false };
    }
  }
  let g;
  let notice;
  try {
    [g, notice] = loadGovIndexCurrent(path, root);
  } catch (e) {
    err(`graph gov: error: ${msgOf3(e)}`);
    return { ok: false };
  }
  if (notice !== null) err(`graph gov: ${notice}`);
  const nodes = nodesOf(g);
  const edges = edgesOf2(g);
  if (cmd === "stats") {
    const kinds = /* @__PURE__ */ new Map();
    for (const n of Object.values(nodes)) {
      const k2 = strOf((objOf(n) ?? {})["kind"]);
      kinds.set(k2, (kinds.get(k2) ?? 0) + 1);
    }
    const ekinds = /* @__PURE__ */ new Map();
    for (const e of edges) ekinds.set(e.kind, (ekinds.get(e.kind) ?? 0) + 1);
    const dangling = Array.isArray(g["dangling"]) ? g["dangling"] : [];
    out.push(`nodes ${Object.keys(nodes).length}: ` + counts(kinds));
    out.push(`edges ${edges.length}: ` + counts(ekinds));
    out.push(`dangling ${dangling.length}`);
    return { ok: true, lines: out };
  }
  if (cmd === "orphans") {
    const o = orphans(g, args.length > 0 ? /* @__PURE__ */ new Set([args[0]]) : null);
    for (const [kind, ids] of o.orphans) {
      const shown = ids.map((i) => {
        const st = (objOf(nodes[i]) ?? {})["status"];
        return truthy2(st) ? `${i}[${pyStr2(st)}]` : i;
      });
      out.push(`${kind} (${ids.length}): ` + shown.join(" "));
    }
    out.push(`total ${o.total} \u2014 epics, sprints, log entries, reviews and decisions are authored roots, not orphans; a homed issue is owned outward`);
    return { ok: true, lines: out };
  }
  if (cmd === "bearing") return govBearingRun(ctx, g, args, err);
  if (cmd === "dangling") {
    const dangling = Array.isArray(g["dangling"]) ? g["dangling"] : [];
    for (const e of dangling) {
      const o = objOf(e) ?? {};
      out.push(`${strOf(o["from"])} --${strOf(o["kind"])}--> ${strOf(o["to"])}  (target does not exist)`);
    }
    return { ok: true, lines: out };
  }
  if (args.length === 0) {
    err(`graph gov: error: ${cmd} needs a record id`);
    return { ok: false };
  }
  const rid = args[0];
  if (cmd === "impact") {
    const depth = args.length > 1 ? parseInt(args[1], 10) : 2;
    const r = impact(g, rid, Number.isNaN(depth) ? 2 : depth);
    if (r.error !== void 0) {
      err(`graph gov: error: ${rid} \u2014 ${r.error}`);
      return { ok: false };
    }
    for (const kind of Object.keys(r.reached).sort()) {
      out.push(`${kind} (${r.reached[kind].length}): ` + r.reached[kind].join(" "));
    }
    out.push(`total ${r.total} records within ${r.depth} hops`);
    return { ok: true, lines: out };
  }
  if (cmd === "provenance") {
    const p = provenance(g, rid);
    for (const key of ["decisions", "issues", "reviews", "stories", "features", "sprints", "log", "other"]) {
      if ((p[key] ?? []).length > 0) out.push(`${key}: ` + p[key].join(" "));
    }
    return { ok: true, lines: out };
  }
  if (cmd === "inbound") {
    for (const e of edges.filter((x) => x.to === rid)) out.push(`${e.from} --${e.kind}--> ${rid}`);
    return { ok: true, lines: out };
  }
  if (cmd === "outbound") {
    for (const e of edges.filter((x) => x.from === rid)) out.push(`${rid} --${e.kind}--> ${e.to}`);
    return { ok: true, lines: out };
  }
  err(`graph gov: error: unknown subcommand ${cmd}`);
  return { ok: false };
}
function counts(m) {
  return [...m.entries()].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0).map(([k2, v]) => `${k2}=${v}`).join(" ");
}
function govBearingRun(ctx, g, args, err) {
  let task = null;
  const paths = [];
  const rest = [...args];
  while (rest.length > 0) {
    const a = rest.shift();
    if (a === "--task" || a === "--file") {
      if (rest.length === 0) {
        err(`graph gov: error: bearing ${a} needs ${a === "--task" ? "a task id" : "a path"}`);
        return { ok: false };
      }
      if (a === "--task") task = rest.shift();
      else paths.push(rest.shift());
    } else if (a.startsWith("-") && a !== "-") {
      err(`graph gov: error: bearing: unknown flag ${a} \u2014 usage: scrumux graph gov bearing [--task T-XXXX] [--file <path>] [<path>...]`);
      return { ok: false };
    } else {
      paths.push(a);
    }
  }
  if (task !== null && !Object.prototype.hasOwnProperty.call(nodesOf(g), task)) {
    err(`graph gov: error: ${task} is not a task in the graph`);
    return { ok: false };
  }
  let want = paths;
  if (want.length === 0) {
    if (task === null) {
      err("graph gov: error: bearing needs one or more paths, or --task T-XXXX to take them from that order");
      return { ok: false };
    }
    want = [...new Set(outbound(g, task).filter((e) => FILE_EDGE_KINDS.includes(e.kind)).map((e) => e.to))].sort();
  }
  const b = bearing(g, want, task);
  const lines = [];
  for (const row of b.paths) {
    const others = row.tasks.filter((t) => t !== task);
    let shown = others.slice(0, 6).join(" ");
    if (others.length > 6) shown += ` (+${others.length - 6} more)`;
    lines.push(shown !== "" ? `path ${row.relation} ${row.path}  also ${shown}` : `path ${row.relation} ${row.path}`);
  }
  for (const r of b.records) {
    const resolved = refResolve(ctx.gov, r.id);
    const text2 = resolved === null ? "UNKNOWN PREFIX" : resolved === "" ? "UNRESOLVED \u2014 the record named by an edge is gone" : resolved;
    lines.push(`${r.id} [${r.relation} ${r.path} via ${r.via}] ${text2}`);
  }
  lines.push(`bearing: ${b.total} decision(s)/issue(s) over ${b.paths.length} path(s)`);
  return { ok: true, lines };
}
function govArm(cli, ctx, cmd, args) {
  if (cli.json) {
    const r2 = govRun(cli, ctx, true, cmd, args);
    if (!r2.ok) {
      cli.fail("gov-graph", `graph gov ${cmd} could not answer`);
      cli.emit("");
    }
    cli.data({ lines: r2.lines.filter((l) => l.length > 0) });
    cli.emit("");
  }
  const r = govRun(cli, ctx, false, cmd, args);
  if (!r.ok) {
    cli.fail("gov-graph", `graph gov ${cmd} could not answer \u2014 see the message above`);
    cli.emit("");
  }
  for (const l of r.lines) cli.say(l);
  cli.emit("");
}
function bearingArm(cli, ctx, args) {
  const r = govRun(cli, ctx, false, "bearing", args);
  if (!r.ok) {
    cli.fail("gov-graph", "bearing could not answer \u2014 see the message above");
    cli.emit("graph gov bearing: no answer.");
  }
  if (cli.json) cli.data({ lines: r.lines.filter((l) => l.length > 0) });
  else for (const l of r.lines) cli.say(l);
  cli.emit("");
}
function objOf(v) {
  if (v === null || v === void 0 || typeof v !== "object") return null;
  if (Array.isArray(v) || v instanceof RawNumber) return null;
  return v;
}
function strOf(v) {
  return typeof v === "string" ? v : "";
}
function intOf(v) {
  if (typeof v === "number") return v;
  if (v instanceof RawNumber) return Number(v.text);
  return 0;
}
function truthy2(v) {
  if (v === void 0 || v === null || v === false || v === "" || v === 0) return false;
  if (v instanceof RawNumber) return Number(v.text) !== 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return true;
}
function pyStr2(v) {
  if (typeof v === "string") return v;
  if (v === null || v === void 0) return "None";
  if (v === true) return "True";
  if (v === false) return "False";
  if (v instanceof RawNumber) return v.text;
  return String(v);
}
function msgOf3(e) {
  return e instanceof Error ? e.message : String(e);
}
var MODULE6 = {
  verbs: () => VERBS_TSV6,
  usage: () => USAGE5,
  run(cli, dispatchCtx, verb, args) {
    const ctx = nounContext(dispatchCtx);
    switch (verb) {
      case "code": {
        const c = args[0] ?? "";
        if (c === "") cli.dieUsage(`graph code needs a subcommand \u2014 one of: ${CODE_CMDS}`);
        const rest = args.slice(1);
        switch (c) {
          case "build":
            if (isBuildChild(ctx.env)) return codeBuildChildArm(dispatchCtx.io, ctx.env);
            return codeBuildArm(cli, ctx, dispatchCtx.io, rest);
          case "index":
            if (rest.length !== 0) cli.dieUsage("graph code index takes no arguments");
            return codeIndex(cli, ctx);
          case "callers":
          case "callees":
          case "symbols":
          case "find":
          case "near":
          case "stats":
            return codeReaderArm(cli, ctx, c, rest);
          default:
            return cli.dieUsage(`graph code: unknown subcommand '${c}' \u2014 one of: ${CODE_CMDS}`);
        }
      }
      case "gov": {
        const c = args[0] ?? "";
        if (c === "") cli.dieUsage(`graph gov needs a subcommand \u2014 one of: ${GOV_CMDS}`);
        const rest = args.slice(1);
        switch (c) {
          case "bearing":
            return bearingArm(cli, ctx, rest);
          // `build` shares this arm with every gov reader (`build|index|…|
          // stats`): it takes the same envelope, the same `row_fail
          // gov-graph`, and the same double invocation under `--json` -- so
          // it needs one word added here, not a second arm.
          case "build":
          case "index":
          case "provenance":
          case "inbound":
          case "outbound":
          case "impact":
          case "orphans":
          case "dangling":
          case "stats":
            return govArm(cli, ctx, c, rest);
          default:
            return cli.dieUsage(`graph gov: unknown subcommand '${c}' \u2014 one of: ${GOV_CMDS}`);
        }
      }
      default:
        return cli.dieUsage(
          `unknown domain '${verb}' for noun graph \u2014 the graphs are 'code' and 'gov'. See: scrumux help graph`
        );
    }
  }
};

// src/nouns/harness.ts
import { accessSync as accessSync2, constants as constants2, statSync as statSync9 } from "node:fs";
import { resolve as resolve4 } from "node:path";

// src/nouns/harness/deploy.ts
import {
  chmodSync as chmodSync3,
  copyFileSync as copyFileSync2,
  mkdirSync as mkdirSync5,
  readFileSync as readFileSync17,
  statSync as statSync8,
  unlinkSync,
  utimesSync as utimesSync2,
  writeFileSync as writeFileSync7,
  appendFileSync
} from "node:fs";
import { spawnSync as spawnSync6 } from "node:child_process";
import { dirname as dirname8, join as join23 } from "node:path";

// src/nouns/harness/payload.ts
import { opendirSync, readFileSync as readFileSync12 } from "node:fs";
import { join as join18 } from "node:path";
var PAYLOAD_DIRS = ["scripts", "schemas", "rules", "skills", "agents", "dist"];
var PAYLOAD_CLAUDE_MD = "CLAUDE.md.payload";
var JOURNALS2 = [
  "log.json",
  "decisions.json",
  "issues.json",
  "exceptions.json",
  "tasks.json",
  "design.json",
  "sprints.json",
  "repo-health.json"
];
var HOOK_CHAINS = [
  "PreToolUse:Bash|PowerShell",
  "PreToolUse:Read",
  "PreToolUse:Edit|Write|NotebookEdit",
  "SessionStart"
];
var HOOK_CHAIN_COUNT = HOOK_CHAINS.length;
var SHIPPED_MODULE_FILES = [];
var MACHINERY_DOCS = [];
var SURFACE_PROBES = [
  { name: "scrumux-help", argv: ".claude/scripts/scrumux help", refusal: "" },
  { name: "backlog", argv: ".claude/scripts/scrumux backlog tasks", refusal: "" },
  { name: "decide", argv: ".claude/scripts/scrumux decide help", refusal: "" },
  { name: "epic", argv: ".claude/scripts/scrumux epic help", refusal: "" },
  { name: "feature", argv: ".claude/scripts/scrumux feature help", refusal: "" },
  { name: "graph-code", argv: ".claude/scripts/scrumux graph code stats", refusal: "graph code: error: no index at" },
  { name: "graph-gov", argv: ".claude/scripts/scrumux graph gov stats", refusal: "" },
  { name: "harness", argv: ".claude/scripts/scrumux harness help", refusal: "" },
  { name: "health", argv: ".claude/scripts/scrumux health help", refusal: "" },
  { name: "issue", argv: ".claude/scripts/scrumux issue help", refusal: "" },
  { name: "log", argv: ".claude/scripts/scrumux log help", refusal: "" },
  { name: "memory", argv: ".claude/scripts/scrumux memory help", refusal: "" },
  { name: "rank", argv: ".claude/scripts/scrumux rank help", refusal: "" },
  { name: "records", argv: ".claude/scripts/scrumux records help", refusal: "" },
  { name: "repair", argv: ".claude/scripts/scrumux repair help", refusal: "" },
  { name: "secret", argv: ".claude/scripts/scrumux secret list", refusal: "" },
  { name: "session", argv: ".claude/scripts/scrumux session help", refusal: "" },
  { name: "sprint", argv: ".claude/scripts/scrumux sprint help", refusal: "" },
  { name: "status", argv: ".claude/scripts/scrumux status session", refusal: "" },
  { name: "story", argv: ".claude/scripts/scrumux story help", refusal: "" },
  { name: "task-usage", argv: ".claude/scripts/scrumux task", refusal: "scrumux task: error: task needs a verb" },
  { name: "task-lint", argv: ".claude/scripts/scrumux task lint", refusal: "scrumux task lint: error: usage:" },
  { name: "task-verify", argv: ".claude/scripts/scrumux task verify", refusal: "scrumux task verify: error: usage:" },
  { name: "task-brief", argv: ".claude/scripts/scrumux task brief", refusal: "scrumux task brief: error: usage:" },
  { name: "views", argv: ".claude/scripts/scrumux views help", refusal: "" }
];
var SURFACE_EXEMPT = [];
var PROBE_TIMEOUT = 30;
function srcPathOf(rel, srcClaude, srcRoot) {
  if (rel.startsWith(".claude/")) return `${srcClaude}/${rel.slice(".claude/".length)}`;
  return `${srcRoot}/${rel}`;
}
function rawEntries(dir) {
  const out = [];
  const d = opendirSync(dir);
  try {
    let e;
    while ((e = d.readSync()) !== null) out.push(e);
  } finally {
    d.closeSync();
  }
  return out;
}
function walkLikeFind(base) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = rawEntries(dir);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isFile()) out.push(join18(dir, e.name));
      else if (e.isDirectory()) walk(join18(dir, e.name));
    }
  };
  walk(base);
  return out;
}
function parseExcludeList(text2) {
  const rules = [];
  for (const raw of text2.split("\n")) {
    const line = raw.replace(/^[ \t]+/, "");
    if (line === "" || line.startsWith("#")) continue;
    const cutAt = line.search(/[ \t]/);
    const path = cutAt === -1 ? line : line.slice(0, cutAt);
    if (path === "") continue;
    rules.push(path.endsWith("/") ? { kind: "prefix", path } : { kind: "exact", path });
  }
  return rules;
}
function payloadExcluded(rel, rules) {
  return rules.some((r) => r.kind === "prefix" ? rel.startsWith(r.path) : r.path === rel);
}
function loadExcludeRules(srcClaude) {
  let text2;
  try {
    text2 = readFileSync12(join18(srcClaude, "payload-exclude.list"), "utf8");
  } catch {
    return [];
  }
  return parseExcludeList(text2);
}
function payloadFiles(dir, srcClaude, rules) {
  const base = join18(srcClaude, dir);
  if (!isDir(base)) return [];
  const out = [];
  for (const abs of walkLikeFind(base)) {
    const name = abs.slice(abs.lastIndexOf("/") + 1);
    if (name.endsWith(".pyc") || name === ".DS_Store" || name.startsWith(".")) continue;
    if (abs.includes("__pycache__")) continue;
    const rel = `.claude/${dir}/${abs.slice(base.length + 1)}`;
    if (payloadExcluded(rel, rules)) continue;
    out.push(rel);
  }
  return out;
}
function allPayloadFiles(srcClaude, srcRoot) {
  const rules = loadExcludeRules(srcClaude);
  const out = [];
  for (const d of PAYLOAD_DIRS) out.push(...payloadFiles(d, srcClaude, rules));
  for (const m of SHIPPED_MODULE_FILES) {
    if (isFile(join18(srcRoot, m))) out.push(m);
  }
  for (const m of MACHINERY_DOCS) {
    if (isFile(join18(srcRoot, m))) out.push(m);
  }
  return out;
}

// src/nouns/harness/settings.ts
import { closeSync as closeSync2, openSync as openSync2, readSync as readSync2, statSync as statSync7 } from "node:fs";
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function missingChains(doc) {
  try {
    if (!isObj(doc)) throw new Error("not an object");
    const hooksVal = doc["hooks"];
    const chain = (ev, m) => {
      let arr4;
      if (hooksVal === void 0 || hooksVal === null) arr4 = [];
      else if (isObj(hooksVal)) arr4 = hooksVal[ev] ?? null;
      else throw new Error("hooks is not indexable");
      let items;
      if (arr4 === null || arr4 === void 0) items = [];
      else if (Array.isArray(arr4)) items = arr4;
      else if (isObj(arr4)) items = Object.values(arr4);
      else throw new Error("chain entry is not iterable");
      let n = 0;
      for (const it of items) {
        if (m === "") {
          n += 1;
          continue;
        }
        if (it === null) continue;
        if (!isObj(it)) throw new Error("entry is not an object");
        const matcher = it["matcher"];
        const s2 = matcher === null || matcher === void 0 || matcher === false ? "" : matcher;
        if (typeof s2 !== "string") throw new Error("matcher is not a string");
        if (new RegExp(m).test(s2)) n += 1;
      }
      return n > 0;
    };
    const missing = [];
    if (!(chain("PreToolUse", "Bash") && chain("PreToolUse", "PowerShell"))) {
      missing.push("PreToolUse:Bash|PowerShell");
    }
    if (!chain("PreToolUse", "Read")) missing.push("PreToolUse:Read");
    if (!chain("PreToolUse", "Edit")) missing.push("PreToolUse:Edit|Write|NotebookEdit");
    if (!chain("SessionStart", "startup|resume")) missing.push("SessionStart");
    return missing.join(" ");
  } catch {
    return "";
  }
}
function hookTargets(doc) {
  const out = [];
  try {
    if (!isObj(doc)) throw new Error("not an object");
    const hooksVal = doc["hooks"];
    const hooks = hooksVal === null || hooksVal === void 0 ? {} : hooksVal;
    if (!isObj(hooks)) throw new Error("hooks is not an object");
    for (const value of Object.values(hooks)) {
      let items;
      if (Array.isArray(value)) items = value;
      else if (isObj(value)) items = Object.values(value);
      else continue;
      for (const item2 of items) {
        if (!isObj(item2)) continue;
        const inner = item2["hooks"];
        let hs;
        if (Array.isArray(inner)) hs = inner;
        else if (isObj(inner)) hs = Object.values(inner);
        else continue;
        for (const h of hs) {
          if (!isObj(h)) continue;
          const type = h["type"] === null || h["type"] === void 0 || h["type"] === false ? "command" : h["type"];
          if (type !== "command") continue;
          const cmd = h["command"];
          if (cmd === null || cmd === void 0 || cmd === false) continue;
          const raw = typeof cmd === "string" ? cmd : String(cmd);
          const args = h["args"];
          if (Array.isArray(args) && args.length > 0) {
            const a0 = args[0];
            out.push({
              form: "exec",
              program: raw,
              file: a0 === null || a0 === void 0 || a0 === false ? "" : String(a0),
              raw
            });
          } else {
            const sp = raw.indexOf(" ");
            out.push({ form: "shell", program: "", file: sp === -1 ? raw : raw.slice(0, sp), raw });
          }
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}
function expandProjectDir(s2, target) {
  return s2.split("${CLAUDE_PROJECT_DIR}").join(target).split("$CLAUDE_PROJECT_DIR").join(target);
}
function settingsFixText(srcClaude, target) {
  return `copy the missing chain(s) from ${srcClaude}/settings.json into ${target}/.claude/settings.json under .hooks (deploy will not merge for you); if the existing file has nothing worth keeping: cp ${srcClaude}/settings.json ${target}/.claude/settings.json`;
}
function lsMode(mode) {
  const triplet = (shift, special, specialChar) => {
    const r = mode >> shift + 2 & 1 ? "r" : "-";
    const w = mode >> shift + 1 & 1 ? "w" : "-";
    const xBit = mode >> shift & 1;
    let x;
    if (special) x = xBit ? specialChar[0] : specialChar[1];
    else x = xBit ? "x" : "-";
    return r + w + x;
  };
  const setuid = (mode & 2048) !== 0;
  const setgid = (mode & 1024) !== 0;
  const sticky = (mode & 512) !== 0;
  return "-" + triplet(6, setuid, ["s", "S"]) + triplet(3, setgid, ["s", "S"]) + triplet(0, sticky, ["t", "T"]);
}
function programResolves(program, env = process.env, platform = process.platform) {
  if (program === "") return false;
  const win = platform === "win32";
  const sep = win ? ";" : ":";
  if (program.includes("/") || win && program.includes("\\")) {
    return win ? isFile(program) : isExecutableFile(program);
  }
  const exts = win ? (env["PATHEXT"] ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => e !== "") : [""];
  for (const dir of (env["PATH"] ?? "").split(sep)) {
    if (dir === "") continue;
    for (const ext of exts) {
      const p = `${dir}${win ? "\\" : "/"}${program}${ext}`;
      if (win ? isFile(p) : isExecutableFile(p)) return true;
    }
  }
  return false;
}
function hookStartProblem(t, target, env = process.env, platform = process.platform) {
  const win = platform === "win32";
  const file = expandProjectDir(t.file, target);
  if (t.form === "exec") {
    const program = expandProjectDir(t.program, target);
    if (!programResolves(program, env, platform)) {
      return { path: program, why: `(exec form: '${program}' does not resolve to an executable on PATH here)` };
    }
    if (file !== "" && !isFile(file)) return { path: file, why: "(missing)" };
    return null;
  }
  if (!isFile(file)) return { path: file, why: "(missing)" };
  if (win) {
    if (shebangOf(file) !== "") {
      return {
        path: file,
        why: `(shell form: '${shebangOf(file)}' \u2014 Windows has no shebang handling and PowerShell cannot execute this file; redeploy so settings.json names the exec-form hook)`
      };
    }
    return null;
  }
  if (!isExecutableFile(file)) {
    return { path: file, why: `(mode ${lsMode(statSync7(file).mode)}, not executable)` };
  }
  return null;
}
function shebangOf(p) {
  try {
    const fd = openSync2(p, "r");
    try {
      const buf = Buffer.alloc(128);
      const n = readSync2(fd, buf, 0, 128, 0);
      const head = buf.subarray(0, n).toString("utf8");
      if (!head.startsWith("#!")) return "";
      const nl = head.indexOf("\n");
      return (nl === -1 ? head : head.slice(0, nl)).trim();
    } finally {
      closeSync2(fd);
    }
  } catch {
    return "";
  }
}

// src/nouns/harness/manifest.ts
import { readFileSync as readFileSync13, writeFileSync as writeFileSync5 } from "node:fs";
import { join as join19 } from "node:path";
function writeManifest(h, payloadList) {
  const srcManifest = join19(h.srcRoot, ".claude/DEPLOYED");
  let remote = "";
  let commit = "";
  let relay = null;
  let relaySource = null;
  if (isFile(srcManifest)) {
    try {
      relaySource = JSON.parse(readFileSync13(srcManifest, "utf8"));
    } catch {
      relaySource = null;
    }
  }
  const relayCommit = relaySource?.source_commit;
  if (relaySource !== null && relayCommit !== null && relayCommit !== void 0 && relayCommit !== false) {
    const r = relaySource.source_remote;
    remote = typeof r === "string" ? r : r === null || r === void 0 || r === false ? "" : String(r);
    commit = typeof relayCommit === "string" ? relayCommit : String(relayCommit);
    relay = {
      path: h.srcRoot,
      head: gitOut(h.srcRoot, ["rev-parse", "HEAD"]) ?? "unknown",
      note: "this deploy was relayed through a repo that is itself a deployment; source_commit above names the harness the payload came from, not this path"
    };
  } else {
    remote = gitOut(h.srcRoot, ["config", "--get", "remote.origin.url"]) ?? "";
    commit = gitOut(h.srcRoot, ["rev-parse", "HEAD"]) ?? "";
  }
  if (remote === "") remote = "unknown \u2014 the deploying checkout had no origin remote";
  if (commit === "") commit = "unknown";
  const files = {};
  for (const rel of [...payloadList].sort(cmpString)) {
    if (rel === "") continue;
    const p = join19(h.target, rel);
    if (!isFile(p)) continue;
    files[rel] = sealQuiet(p);
  }
  const doc = {
    source_remote: remote,
    source_commit: commit,
    deployed_at: h.ctx.today,
    ...relay === null ? {} : { deployed_from: relay },
    files
  };
  const bytes = jqFormat(doc);
  const dest = join19(h.target, ".claude/DEPLOYED");
  let status;
  if (!isFile(dest)) {
    status = "CREATED";
  } else {
    let prev = "";
    try {
      prev = readFileSync13(dest, "utf8");
    } catch {
      prev = "";
    }
    status = prev === bytes ? "UNCHANGED" : "UPDATED";
  }
  try {
    writeFileSync5(dest, bytes);
  } catch {
    h.cli.die(`cannot write ${h.target}/.claude/DEPLOYED \u2014 check the target's permissions`);
  }
  return { status, filesCount: Object.keys(files).length, sourceCommit: commit };
}

// src/nouns/harness/constitution.ts
var CLAUDE_POINTER = "\n## This repo had its own CLAUDE.md\n\nIt is preserved verbatim at `CLAUDE.pre-harness.md` and it still\napplies. Read it. Where it and this file disagree about how THIS repo\nworks, it wins; where they disagree about the governance loop, this file\nwins, and the disagreement is worth reporting.\n";
var OURS_MARKER = "governed by the **harness**";
function desiredConstitution(payload, preservedExists) {
  return preservedExists ? Buffer.concat([payload, Buffer.from(CLAUDE_POINTER)]) : payload;
}
function constitutionAct(current, payload, preservedExists) {
  if (current === null) return "install";
  if (current.equals(desiredConstitution(payload, preservedExists))) return "unchanged";
  if (current.toString("utf8").includes(OURS_MARKER)) return "update";
  return "preserve";
}

// src/nouns/harness/index-commit.ts
import { spawnSync as spawnSync4 } from "node:child_process";
import { readFileSync as readFileSync14 } from "node:fs";
import { join as join20 } from "node:path";
var INDEX_REL = "governance/code-graph.json";
var BUILD_STAMP_FIELDS = ["built_at", "built_at_epoch", "commit", "dirty"];
function withoutBuildStamp(text2) {
  let doc;
  try {
    doc = JSON.parse(text2);
  } catch {
    return null;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const o = doc;
  const prov = o["provenance"];
  if (prov !== null && typeof prov === "object" && !Array.isArray(prov)) {
    const stamp = new Set(BUILD_STAMP_FIELDS);
    o["provenance"] = Object.fromEntries(Object.entries(prov).filter(([k2]) => !stamp.has(k2)));
  }
  return JSON.stringify(o);
}
function indexNeedsCommit(committed, current) {
  if (current === null) return false;
  if (committed === null) return true;
  const a = withoutBuildStamp(committed);
  const b = withoutBuildStamp(current);
  return a === null || b === null || a !== b;
}
function committedText(target, rel) {
  const r = spawnSync4("git", ["-C", target, "show", `HEAD:${rel}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 && typeof r.stdout === "string" ? r.stdout : null;
}
function reusableIndex(target) {
  let onDisk;
  try {
    onDisk = readFileSync14(join20(target, INDEX_REL), "utf8");
  } catch {
    return { reuse: false, reason: "no index on disk" };
  }
  const committed = committedText(target, INDEX_REL);
  if (committed === null) return { reuse: false, reason: "no committed index" };
  if (committed !== onDisk) return { reuse: false, reason: "the index on disk differs from the committed one" };
  let stale;
  let why;
  try {
    [stale, why] = isStaleGraph(loadIndex(join20(target, INDEX_REL)), target);
  } catch (e) {
    return { reuse: false, reason: `the committed index is unreadable: ${e.message}` };
  }
  return stale ? { reuse: false, reason: `the committed index is stale: ${why}` } : { reuse: true, reason: why };
}

// src/nouns/harness/permissions.ts
import { chmodSync as chmodSync2, readFileSync as readFileSync15, renameSync as renameSync3, writeFileSync as writeFileSync6 } from "node:fs";
import { join as join21 } from "node:path";
var TOOL_SEEDS = [
  { manifest: "package.json", rules: ["Bash(npm *)", "Bash(npx *)"] },
  { manifest: "pyproject.toml", rules: ["Bash(uv *)"] },
  { manifest: "uv.lock", rules: ["Bash(uv *)"] }
];
function detectedToolSeeds(target) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const s2 of TOOL_SEEDS) {
    if (!isFile(join21(target, s2.manifest))) continue;
    const rules = s2.rules.filter((r) => !seen.has(r));
    rules.forEach((r) => seen.add(r));
    if (rules.length > 0) out.push({ manifest: s2.manifest, rules });
  }
  return out;
}
function allowOf(d) {
  const perms = d?.["permissions"];
  const a = perms?.["allow"];
  if (a === null || a === void 0 || a === false) return [];
  if (!Array.isArray(a)) throw new Error("allow is not an array");
  return a;
}
var eq = (x, y) => jqFormat(x) === jqFormat(y);
function unionAllow(cli, tset, rules) {
  let missing;
  try {
    const targetAllow = allowOf(JSON.parse(readFileSync15(tset, "utf8")));
    missing = rules.filter((x, i) => !targetAllow.some((y) => eq(x, y)) && rules.findIndex((z) => eq(z, x)) === i);
  } catch {
    return 0;
  }
  if (missing.length === 0) return 0;
  let doc;
  try {
    doc = parsePreservingNumbers(readFileSync15(tset, "utf8"));
  } catch {
    doc = null;
  }
  if (typeof doc !== "object" || doc === null || Array.isArray(doc)) cli.die(`cannot union permissions.allow into ${tset}`);
  const obj6 = doc;
  if (obj6["permissions"] === null || obj6["permissions"] === void 0) obj6["permissions"] = {};
  const perms = obj6["permissions"];
  if (typeof perms !== "object" || perms === null || Array.isArray(perms)) cli.die(`cannot union permissions.allow into ${tset}`);
  const permsObj = perms;
  const existing = Array.isArray(permsObj["allow"]) ? permsObj["allow"] : [];
  permsObj["allow"] = [...existing, ...missing];
  const tmp = `${tset}.tmp.${process.pid}`;
  try {
    writeFileSync6(tmp, jqFormat(doc));
  } catch {
    cli.die("cannot stage settings.json merge");
  }
  try {
    chmodSync2(tmp, 384);
  } catch {
  }
  try {
    renameSync3(tmp, tset);
  } catch {
    cli.die(`cannot write ${tset} \u2014 check the target's permissions`);
  }
  return missing.length;
}
function missingWriteTools(tset) {
  try {
    const allow = allowOf(JSON.parse(readFileSync15(tset, "utf8"))).map((x) => String(x));
    return ["Edit", "Write"].filter((t) => !allow.some((a) => a === t || a.startsWith(`${t}(`)));
  } catch {
    return null;
  }
}

// src/nouns/harness/state.ts
var WRITTEN = /* @__PURE__ */ new Set(["CREATED", "UPDATED", "SEEDED", "REMOVED"]);
function commitPaths(h) {
  const out = new Set(h.wrote ?? []);
  for (const it of h.items) if (WRITTEN.has(it.status)) out.add(it.path);
  return [...out].sort();
}
function item(h, path, status, detail = "") {
  h.items.push({ path, status, detail });
  if (detail !== "") h.cli.say(`  ${status.padEnd(9)} ${path} \u2014 ${detail}`);
  else h.cli.say(`  ${status.padEnd(9)} ${path}`);
}
function check(h, name, ok, detail) {
  h.rows += 1;
  if (ok) h.cli.pass(name, detail);
  else h.cli.fail(name, detail);
}
function warn(h, name, detail) {
  h.cli.warn(name, detail);
}
function harnessEmit(h, summary, extra2) {
  h.cli.extra({ target: h.target, items: h.items });
  if (extra2 !== void 0) h.cli.extra(extra2);
  h.cli.say("");
  return h.cli.emit(summary);
}

// src/nouns/harness/trust.ts
import { readFileSync as readFileSync16, realpathSync } from "node:fs";
import { dirname as dirname7, join as join22 } from "node:path";
import { spawnSync as spawnSync5 } from "node:child_process";
function claudeConfigPath(env) {
  const o = env["SCRUMUX_CLAUDE_CONFIG"];
  if (o !== void 0 && o !== "") return o;
  const home = env["HOME"];
  return home !== void 0 && home !== "" ? join22(home, ".claude.json") : null;
}
function trustRoot(target) {
  let root = target;
  const r = spawnSync5(
    "git",
    ["-C", target, "rev-parse", "--path-format=absolute", "--git-common-dir"],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
  );
  const common = r.status === 0 && typeof r.stdout === "string" ? r.stdout.trim() : "";
  if (common.endsWith("/.git")) root = dirname7(common);
  try {
    return realpathSync(root);
  } catch {
    return root;
  }
}
function trustOf(target, env) {
  const root = trustRoot(target);
  const cfg = claudeConfigPath(env);
  const fix = `open the repo once interactively with \`claude\` in ${root} and accept the trust dialog, or have the operator trust it in scrumux-app (Trust this repo)`;
  let doc;
  try {
    if (cfg === null) throw new Error("no HOME");
    doc = JSON.parse(readFileSync16(cfg, "utf8"));
  } catch {
    return { state: "unknown", root, detail: `trust not checked: no readable Claude Code config at ${cfg ?? "$HOME/.claude.json (HOME is not set)"} \u2014 unknown, not a failure. A dispatched session needs ${root} trusted or it silently ignores this repo's allow-list; if it is not, ${fix}` };
  }
  const projects = doc?.projects;
  const entry = projects !== null && typeof projects === "object" ? projects[root] : void 0;
  const accepted2 = entry !== null && typeof entry === "object" && entry.hasTrustDialogAccepted === true;
  if (accepted2) {
    return { state: "trusted", root, detail: `${root} is trusted by Claude Code, so sessions there (and in its worktrees) load this repo's permissions.allow` };
  }
  return { state: "untrusted", root, detail: `${root} is NOT trusted by Claude Code (${cfg} has no hasTrustDialogAccepted for it), so every session there \u2014 dispatched worktrees included \u2014 silently IGNORES this repo's permissions.allow and a headless session can run nothing. Fix: ${fix}` };
}

// src/nouns/harness/session-permissions.ts
function reportSessionPermissions(h, tset) {
  const t = trustOf(h.target, h.ctx.env);
  if (t.state === "untrusted") warn(h, "session-trust", t.detail);
  else h.cli.note("session-trust", t.detail);
  if (!isFile(tset)) return;
  const missing = missingWriteTools(tset);
  if (missing === null) {
    h.cli.note("session-write-tools", `not checked \u2014 ${tset} does not parse, so whether a session may Edit or Write is unknown`);
  } else if (missing.length > 0) {
    warn(h, "session-write-tools", `${tset} permissions.allow has no ${missing.join(" or ")}, so a dispatched headless session cannot change a file (nobody is there to approve it). Add ${missing.map((m) => `"${m}"`).join(" and ")} to permissions.allow \u2014 harness deploy seeds them from the current canon on its next run`);
  } else {
    h.cli.note("session-write-tools", "permissions.allow lets a session Edit and Write");
  }
}

// src/nouns/harness/deploy.ts
function cpP(src, dst) {
  copyFileSync2(src, dst);
  const st = statSync8(src);
  chmodSync3(dst, st.mode & 4095);
  utimesSync2(dst, st.atime, st.mtime);
}
function bytesEqual(a, b) {
  try {
    return readFileSync17(a).equals(readFileSync17(b));
  } catch {
    return false;
  }
}
function parseJson(path) {
  try {
    return JSON.parse(readFileSync17(path, "utf8"));
  } catch {
    return void 0;
  }
}
var PWALL_TEMPLATE = `# This repo's wall rules. The one place to extend the refusal layer.
#
#   refuse <extended-regex> | why this repo refuses it
#   allow  <extended-regex> | why this repo permits it
#
# \`refuse\` adds a pattern to every wall \u2014 what only this repo knows is
# dangerous here. \`allow\` exempts a command the built-in walls would stop,
# for work that legitimately needs it.
#
# Both need a reason after the pipe. A rule with no reason is ignored:
# an exemption nobody can read is an exemption nobody can audit.
# \`allow\` wins over \`refuse\`. Lines starting with # are comments.
#
# Examples:
#   refuse  flyctl deploy      | production is released by CI, never from a session
#   allow   api\\.openai\\.com   | this coursework calls the provider directly on purpose
`;
var PSTD_TEMPLATE = `---
name: project-standards
paths: ["**"]
skills: []
scripts: []
---
# Rule: this repo's own standards

Yours to write. Nothing here is enforced by the harness: no gate reads
this file, no check fails on it, and no exit code depends on its
contents. It is context an agent is given, not a wall it hits.

Note on \`paths\`: the CLI loads ALL rules every session regardless of
what \`paths\` declares (D-0008; path-scoping is tracked as I-0001), so
write these as standards that are always in context.

To give a standard teeth of your own, name a skill in \`skills:\` and the
scripts it calls in \`scripts:\` \u2014 the harness checks those pointers
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
`;
function postInstall(ctx, argv, extraEnv = {}) {
  const self = selfBundle(ctx.env);
  if (self === null) {
    return {
      rc: 127,
      combined: "",
      note: " \u2014 and this process has no bundle path to re-run the check on, so the check did not run at all",
      rerun: "scrumux"
    };
  }
  const r = spawnCombinedWith(process.execPath, [self, ...argv], {
    cwd: ctx.cwd,
    env: { ...ctx.env, ...extraEnv },
    // 64 MiB. `graph code build` reports a line per skipped language and can
    // print a long parse-error list over a big tree, and Node's 1 MiB default
    // truncates a child's stream while leaving its exit code intact -- a cut
    // report that still reads as a verdict.
    maxBuffer: 64 * 1024 * 1024
  });
  return { ...r, note: "", rerun: `${process.execPath} ${self}` };
}
function harnessDeploy(h) {
  const { cli, ctx, target } = h;
  cli.say(`=== HARNESS DEPLOY -> ${target} (${ctx.today}) ===`);
  let created = 0;
  let updated = 0;
  let unchanged = 0;
  const payloadList = allPayloadFiles(h.srcClaude, h.srcRoot);
  for (const rel of payloadList) {
    if (rel === "") continue;
    const src = srcPathOf(rel, h.srcClaude, h.srcRoot);
    const dst = join23(target, rel);
    if (!isFile(dst)) {
      try {
        mkdirSync5(dirname8(dst), { recursive: true });
      } catch {
        cli.die(`cannot create ${dirname8(dst)} \u2014 check the target's permissions`);
      }
      try {
        cpP(src, dst);
      } catch {
        cli.die(`cannot install ${rel} into ${target} \u2014 check the target's permissions`);
      }
      item(h, rel, "CREATED");
      created += 1;
    } else if (bytesEqual(src, dst)) {
      item(h, rel, "UNCHANGED");
      unchanged += 1;
    } else {
      try {
        cpP(src, dst);
      } catch {
        cli.die(`cannot update ${rel} in ${target} \u2014 check the target's permissions`);
      }
      item(h, rel, "UPDATED");
      updated += 1;
    }
  }
  const tClaude = join23(target, "CLAUDE.md");
  const srcClaudeMd = join23(h.srcClaude, PAYLOAD_CLAUDE_MD);
  if (isFile(srcClaudeMd)) {
    const payloadMd = readFileSync17(srcClaudeMd);
    const preserved = join23(target, "CLAUDE.pre-harness.md");
    const current = isFile(tClaude) ? readFileSync17(tClaude) : null;
    const act = constitutionAct(current, payloadMd, isFile(preserved));
    const install = (failure) => {
      try {
        writeFileSync7(tClaude, desiredConstitution(payloadMd, isFile(preserved)));
        const st = statSync8(srcClaudeMd);
        chmodSync3(tClaude, st.mode & 4095);
      } catch {
        cli.die(failure);
      }
    };
    if (act === "install") {
      install(`cannot install CLAUDE.md into ${target}`);
      item(h, "CLAUDE.md", "CREATED", isFile(preserved) ? "the constitution, at the repo root, pointing at the preserved CLAUDE.pre-harness.md" : "the constitution, at the repo root where every session reads it");
      created += 1;
    } else if (act === "unchanged") {
      item(h, "CLAUDE.md", "UNCHANGED");
      unchanged += 1;
    } else if (act === "update") {
      install(`cannot update CLAUDE.md in ${target}`);
      item(h, "CLAUDE.md", "UPDATED");
      updated += 1;
    } else {
      if (!isFile(preserved)) {
        try {
          cpP(tClaude, preserved);
        } catch {
          cli.die("cannot preserve the existing CLAUDE.md");
        }
        (h.wrote ??= []).push("CLAUDE.pre-harness.md");
      }
      install(`cannot install CLAUDE.md into ${target}`);
      item(h, "CLAUDE.md", "CREATED", "existing one preserved at CLAUDE.pre-harness.md and pointed at from the new one");
      created += 1;
    }
  }
  const tset = join23(target, ".claude/settings.json");
  let settingsTouched = false;
  if (!isFile(tset)) {
    try {
      mkdirSync5(join23(target, ".claude"), { recursive: true });
    } catch {
      cli.die(`cannot create ${target}/.claude \u2014 check the target's permissions`);
    }
    try {
      cpP(join23(h.srcClaude, "settings.json"), tset);
    } catch {
      cli.die(`cannot install .claude/settings.json into ${target} \u2014 check the target's permissions`);
    }
    item(h, ".claude/settings.json", "CREATED", "written verbatim at the repo ROOT, which is the only place Claude Code will resolve it");
    created += 1;
    settingsTouched = true;
  } else {
    let srcAllow = [];
    try {
      srcAllow = allowOf(JSON.parse(readFileSync17(join23(h.srcClaude, "settings.json"), "utf8")));
    } catch {
      srcAllow = [];
    }
    const newRules = unionAllow(cli, tset, srcAllow);
    if (newRules > 0) {
      item(h, ".claude/settings.json", "UPDATED", `permissions.allow unioned: ${newRules} canon rule(s) appended; hooks and env untouched`);
      updated += 1;
      settingsTouched = true;
    } else {
      const mc = missingChains(parseJson(tset));
      if (mc !== "") {
        item(h, ".claude/settings.json", "UNCHANGED", `kept \u2014 deploy does not merge; hook chain(s) absent: ${mc}`);
      } else {
        item(h, ".claude/settings.json", "UNCHANGED", `kept \u2014 deploy does not merge; all ${HOOK_CHAIN_COUNT} hook chains present`);
      }
      unchanged += 1;
    }
  }
  for (const seed of detectedToolSeeds(target)) {
    const n = isFile(tset) ? unionAllow(cli, tset, [...seed.rules]) : 0;
    if (n === 0) continue;
    item(h, ".claude/settings.json", "SEEDED", `permissions.allow: ${seed.rules.join(" ")} for ${seed.manifest} (${n} appended) \u2014 a dispatched session has nobody to approve its build tool`);
    if (!settingsTouched) {
      updated += 1;
      settingsTouched = true;
    }
  }
  for (const j of JOURNALS2) {
    const jp = join23(target, "governance", j);
    if (isFile(jp)) {
      item(h, `governance/${j}`, "UNCHANGED");
      unchanged += 1;
      continue;
    }
    refusing(cli, () => {
      ensureFile(jp, '{"entries": []}');
    });
    if (j === "repo-health.json") {
      item(h, `governance/${j}`, "CREATED", "seeded empty \u2014 register this repo's checks with scrumux health add");
    } else {
      item(h, `governance/${j}`, "CREATED");
    }
    created += 1;
  }
  const seededList = [];
  const seeded = (rel) => {
    seededList.push(rel);
  };
  seeded("governance/enforcement-posture.md");
  const pwallRel = ".claude/project-walls.conf";
  seeded(pwallRel);
  const pwall = join23(target, pwallRel);
  if (isFile(pwall)) {
    item(h, pwallRel, "UNCHANGED", "kept \u2014 a repo's own wall rules are never overwritten");
    unchanged += 1;
  } else {
    try {
      writeFileSync7(pwall, PWALL_TEMPLATE);
    } catch {
    }
    item(h, pwallRel, "CREATED", "the one pathway for this repo's own wall rules");
    created += 1;
  }
  const pstdRel = ".claude/rules/project-standards.md";
  seeded(pstdRel);
  const pstd = join23(target, pstdRel);
  if (isFile(pstd)) {
    item(h, pstdRel, "UNCHANGED", "kept \u2014 a repo's own standards are never overwritten");
    unchanged += 1;
  } else {
    try {
      mkdirSync5(join23(target, ".claude/rules"), { recursive: true });
    } catch {
      cli.die(`cannot create ${target}/.claude/rules \u2014 check the target's permissions`);
    }
    try {
      writeFileSync7(pstd, PSTD_TEMPLATE);
    } catch {
    }
    item(h, pstdRel, "CREATED", "empty template for this repo's own standards; advisory only, never overwritten");
    created += 1;
  }
  const viewFiles = ["AI_LOG.MD", "DECISIONS.MD", "BACKLOG.MD", "governance/governance-graph.json", ".scrumux/events.jsonl", ".scratch/"];
  const viewFilesStr = viewFiles.join(" ");
  const ign = join23(target, ".gitignore");
  const ignLines = isFile(ign) ? readFileSync17(ign, "utf8").split("\n") : null;
  let ignAdd = "";
  const ignAddList = [];
  for (const vf of viewFiles) {
    const re = new RegExp(`^/?${vf.replace(/\./g, "\\.")}[\\s]*$`);
    if (ignLines !== null && ignLines.some((l) => re.test(l))) continue;
    ignAdd += ` ${vf}`;
    ignAddList.push(vf);
  }
  if (ignAdd === "") {
    item(h, ".gitignore", "UNCHANGED", `kept \u2014 already ignores the generated views and scratch (${viewFilesStr})`);
    unchanged += 1;
  } else {
    const ignExisted = ignLines !== null;
    try {
      if (ignExisted) {
        const raw = readFileSync17(ign);
        if (raw.length > 0 && raw[raw.length - 1] !== 10) appendFileSync(ign, "\n");
      }
      let block = "";
      if (ignExisted) block += "\n";
      block += "# Written by scrumux, not by hand: the rendered views, the walls' event log and the session scratch directory.\n";
      block += "# The JSON under governance/ is the source of truth; these are projections.\n";
      for (const vf of ignAddList) block += `${vf}
`;
      appendFileSync(ign, block);
    } catch {
      cli.die(`cannot write ${ign} \u2014 check the target's permissions`);
    }
    if (ignExisted) {
      item(h, ".gitignore", "UPDATED", `appended${ignAdd} \u2014 scrumux writes them into the repo root (views render, the walls' event log, session scratch in .scratch/), and an untracked generated file reads as an uncommitted change`);
      updated += 1;
    } else {
      item(h, ".gitignore", "CREATED", `ignoring${ignAdd} \u2014 scrumux writes them into the repo root (views render, the walls' event log, session scratch in .scratch/), and an untracked generated file reads as an uncommitted change`);
      created += 1;
    }
  }
  const cgPath = join23(target, "governance/code-graph.json");
  const reuse = reusableIndex(target);
  const cg = reuse.reuse ? null : postInstall(ctx, ["graph", "code", "build", "--repo", target]);
  const cgout = cg === null ? "" : stripTrailingNewlines(cg.combined);
  if (cg === null) {
    cli.say(`  REUSED    governance/code-graph.json \u2014 committed and fresh (${reuse.reason})`);
    check(h, "code-graph-built", true, `the committed code index in ${target} is fresh (${reuse.reason}), so it was reused rather than rebuilt; every scrumux graph code query there answers from it`);
  } else if (cg.rc === 0) {
    let cgNow = null;
    try {
      cgNow = readFileSync17(cgPath, "utf8");
    } catch {
      cgNow = null;
    }
    if (indexNeedsCommit(committedText(target, "governance/code-graph.json"), cgNow)) {
      (h.wrote ??= []).push("governance/code-graph.json");
    }
    const first = (cgout.split("\n", 1)[0] ?? "").replace(/^graph code: /, "");
    const parseLine = cgout.split("\n").find((l) => l.startsWith("parse errors in: ")) ?? "";
    const partial = parseLine === "" ? "" : ` \u2014 ${parseLine}`;
    cli.say(`  BUILT     governance/code-graph.json \u2014 ${first}${partial}`);
    check(h, "code-graph-built", true, `the code index was built into ${target} from this checkout, so every scrumux graph code query there answers with no parser of its own${partial}${cg.note}`);
  } else {
    cli.say("  SKIPPED   governance/code-graph.json \u2014 not built");
    check(h, "code-graph-built", false, `the code index was NOT built into ${target}: ${trNewlines(shHead(cgout, 2), " ")} \u2014 every scrumux graph code query there will say it has no index. Build it from any harness checkout that has the tree-sitter grammars: scrumux graph code build --repo ${target}${cg.note}`);
  }
  let pruned = 0;
  const prevManifest = join23(target, ".claude/DEPLOYED");
  if (isFile(prevManifest)) {
    let was = [];
    try {
      const doc = JSON.parse(readFileSync17(prevManifest, "utf8"));
      const files = doc.files;
      if (files === null || files === void 0 || typeof files !== "object" || Array.isArray(files)) {
        throw new Error("no files map");
      }
      was = Object.keys(files).sort();
    } catch {
      was = [];
    }
    for (const old of was) {
      if (old === "") continue;
      if (payloadList.includes(old)) continue;
      if (seededList.includes(old)) {
        item(h, old, "KEPT", "repo-owned, not pruned \u2014 an older harness shipped it as payload and this manifest still claims it; dropped from the new manifest so no later deploy reconsiders it");
        continue;
      }
      if (!isFile(join23(target, old))) continue;
      try {
        unlinkSync(join23(target, old));
      } catch {
        continue;
      }
      item(h, old, "REMOVED", "no longer part of the payload");
      pruned += 1;
    }
  }
  const man = writeManifest(h, payloadList);
  item(h, ".claude/DEPLOYED", man.status, `manifest of ${man.filesCount} payload file(s) from ${[...man.sourceCommit].slice(0, 8).join("")}`);
  const total = created + updated + unchanged;
  cli.say("");
  cli.say("--- checks ---");
  if (isFile(tset)) {
    const mc = missingChains(parseJson(tset));
    if (mc !== "") {
      check(h, "settings-hook-chains", false, `${target}/.claude/settings.json is missing hook chain(s): ${mc} \u2014 ${settingsFixText(h.srcClaude, target)}`);
    } else {
      check(h, "settings-hook-chains", true, `all ${HOOK_CHAIN_COUNT} hook chains declared at the repo root`);
    }
  } else {
    check(h, "settings-hook-chains", false, `${target}/.claude/settings.json does not exist \u2014 install it: cp ${h.srcClaude}/settings.json ${target}/.claude/settings.json`);
  }
  if (isFile(tset)) {
    let deadhook = "";
    for (const t of hookTargets(parseJson(tset))) {
      if (t.file === "") continue;
      const dhp = expandProjectDir(t.file, target);
      if (!isFile(dhp)) {
        const shown = dhp.startsWith(`${target}/`) ? dhp.slice(target.length + 1) : dhp;
        deadhook += ` ${shown}`;
      }
    }
    if (deadhook !== "") {
      check(h, "settings-hook-commands", false, `${target}/.claude/settings.json declares hook command(s) naming a file that is not there:${deadhook} \u2014 every event on those chains fails silently, and the repo looks entirely normal from the inside. This repo kept its own settings.json (deploy never merges one), so a payload file renamed or dropped upstream leaves the pointer behind. Take the current settings verbatim: rm ${target}/.claude/settings.json && <this command> again \u2014 or edit those command(s) by hand if this repo's settings.json carries hooks of its own worth keeping.`);
    } else {
      check(h, "settings-hook-commands", true, "every hook command in the target's settings.json names a file that exists");
    }
  } else {
    check(h, "settings-hook-commands", false, "not checked \u2014 no settings.json at the repo root");
  }
  reportSessionPermissions(h, tset);
  const gv = postInstall(ctx, ["records", "check"], { GOV_ROOT: target });
  const gvout = stripTrailingNewlines(gv.combined);
  if (gv.rc === 0) {
    check(h, "records-check", true, `clean against ${target}${gv.note}`);
  } else {
    check(h, "records-check", false, `exited ${gv.rc} against ${target} \u2014 the install is NOT good; run GOV_ROOT=${target} ${gv.rerun} records check and fix each named finding. First lines: ${grepHead3Semis(gvout, /^ *(FAIL|WARN) /)}${gv.note}`);
  }
  let changed;
  let summary;
  if (created === 0 && updated === 0) {
    changed = false;
    summary = `harness deploy: nothing changed \u2014 all ${total} payload item(s) in ${target} already match this harness byte for byte, and .claude/DEPLOYED already describes them.`;
  } else {
    changed = true;
    summary = `harness deploy: ${created} created, ${updated} updated, ${unchanged} unchanged, ${pruned} removed (${total} payload item(s)) in ${target}, plus .claude/DEPLOYED.`;
  }
  if (cli.fails() !== 0) {
    summary += " The install FAILED its checks \u2014 see the check lines above; nothing was rolled back, fix and re-run.";
  }
  if (changed && isDir(join23(target, ".git"))) {
    let dirty = 0;
    try {
      const r = spawnSync6("git", ["-C", target, "status", "--porcelain"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
      const out = r.status === 0 && typeof r.stdout === "string" ? r.stdout : "";
      dirty = (out.match(/\n/g) ?? []).length;
    } catch {
      dirty = 0;
    }
    if (dirty > 0) {
      summary += ` ${target} now has ${dirty} uncommitted file(s). \`deliver\` refuses a dirty checkout, so commit them before accepting or dispatching work there.`;
    }
  }
  return harnessEmit(h, summary, {
    changed,
    created,
    updated,
    unchanged,
    // Additive (R-020): what a caller committing this deploy should stage.
    commit_paths: commitPaths(h)
  });
}

// src/nouns/harness/verify.ts
import { readFileSync as readFileSync19, opendirSync as opendirSync2 } from "node:fs";
import { join as join25 } from "node:path";

// src/journal/timeout.ts
import { spawnSync as spawnSync7 } from "node:child_process";
var SIGNUM = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGILL: 4,
  SIGTRAP: 5,
  SIGABRT: 6,
  SIGBUS: 10,
  SIGFPE: 8,
  SIGKILL: 9,
  SIGUSR1: 30,
  SIGSEGV: 11,
  SIGUSR2: 31,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15
};
var GRACE_MS = 5e3;
var SUPERVISOR = `
const { spawn, spawnSync } = require('node:child_process');
const { writeSync } = require('node:fs');
const [ms, grace, command] = [Number(process.argv[1]), Number(process.argv[2]), process.argv[3]];
const win = process.platform === 'win32';
const report = (r) => { try { writeSync(3, JSON.stringify(r)); } catch {} };
let child;
try {
  child = spawn('sh', ['-c', command], { detached: !win, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { report({ code: 127, signal: null, timedOut: false }); process.exit(0); }
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
let timedOut = false;
let exitCode = null;
let exitSignal = null;
let done = false;
const stopGroup = (sig) => {
  if (win) { spawnSync('taskkill', ['/pid', String(child.pid), '/t', '/f']); return; }
  try { process.kill(-child.pid, sig); } catch {}
};
const finish = () => {
  if (done) return;
  done = true;
  report({ code: exitCode, signal: exitSignal, timedOut });
  process.exitCode = 0;
  if (timedOut) process.exit(0);
};
let hard = null;
const timer = ms > 0 ? setTimeout(() => {
  timedOut = true;
  stopGroup('SIGTERM');
  hard = setTimeout(() => { stopGroup('SIGKILL'); finish(); }, grace);
}, ms) : null;
child.on('error', () => { if (timer) clearTimeout(timer); report({ code: 127, signal: null, timedOut: false }); process.exit(0); });
child.on('exit', (code, signal) => { exitCode = code; exitSignal = signal; });
child.on('close', () => {
  if (timer) clearTimeout(timer);
  if (hard) clearTimeout(hard);
  finish();
});
`;
function runWithTimeout(seconds, command, opts = {}) {
  const ms = seconds > 0 ? Math.round(seconds * 1e3) : 0;
  const res = spawnSync7(process.execPath, ["-e", SUPERVISOR, String(ms), String(GRACE_MS), command], {
    cwd: opts.cwd,
    env: opts.env,
    encoding: "utf8",
    stdio: opts.capture === true ? ["ignore", "pipe", "pipe", "pipe"] : ["ignore", "inherit", "inherit", "pipe"],
    maxBuffer: 256 * 1024 * 1024
  });
  const rawOut = typeof res.stdout === "string" ? res.stdout : "";
  const rawErr = typeof res.stderr === "string" ? res.stderr : "";
  const combine = opts.combine === true;
  const stdout = combine ? rawOut + rawErr : rawOut;
  const stderr = combine ? "" : rawErr;
  const r = supervisorReport(res.output?.[3]);
  if (r === null) return { code: 127, timedOut: false, signal: null, stdout, stderr };
  if (r.timedOut) return { code: 128 + SIGNUM["SIGALRM"], timedOut: true, signal: "SIGALRM", stdout, stderr };
  if (r.signal !== null) return { code: 128 + (SIGNUM[r.signal] ?? 0), timedOut: r.signal === "SIGALRM", signal: r.signal, stdout, stderr };
  return { code: r.code ?? 127, timedOut: false, signal: null, stdout, stderr };
}
function supervisorReport(raw) {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    const o = JSON.parse(raw);
    return {
      code: typeof o.code === "number" ? o.code : null,
      signal: typeof o.signal === "string" ? o.signal : null,
      timedOut: o.timedOut === true
    };
  } catch {
    return null;
  }
}

// src/walls/lib/ere.ts
var POSIX_CLASSES = {
  alpha: "A-Za-z",
  digit: "0-9",
  alnum: "0-9A-Za-z",
  upper: "A-Z",
  lower: "a-z",
  space: " \\t\\n\\r\\f\\v",
  blank: " \\t",
  punct: "!-/:-@\\[-`{-~",
  print: " -~",
  graph: "!-~",
  cntrl: "\\x00-\\x1f\\x7f",
  xdigit: "0-9A-Fa-f",
  word: "0-9A-Za-z_"
};
function bracket(src, start) {
  let i = start + 1;
  let out = "[";
  if (src[i] === "^") {
    out += "^";
    i += 1;
  }
  if (src[i] === "]") {
    out += "\\]";
    i += 1;
  }
  for (; i < src.length; i += 1) {
    const c = src[i];
    if (c === "]") return { body: out + "]", next: i + 1 };
    if (c === "[" && src[i + 1] === ":") {
      const end = src.indexOf(":]", i + 2);
      if (end < 0) {
        out += "\\[";
        continue;
      }
      const name = src.slice(i + 2, end);
      const cls = POSIX_CLASSES[name];
      if (cls === void 0) return null;
      out += cls;
      i = end + 1;
      continue;
    }
    if (c === "\\") {
      const n = src[i + 1];
      if (n === void 0) return null;
      out += "\\" + n;
      i += 1;
      continue;
    }
    out += c;
  }
  return null;
}
function translateEre(pattern, flags = "i") {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === "[") {
      const b = bracket(pattern, i);
      if (b === null) {
        return { ok: false, kind: "invalid", reason: `unterminated or unknown bracket expression at offset ${i}` };
      }
      out += b.body;
      i = b.next;
      continue;
    }
    if (c === "\\") {
      const n = pattern[i + 1];
      if (n === void 0) {
        return { ok: false, kind: "invalid", reason: "a trailing backslash escapes nothing" };
      }
      out += "\\" + n;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  let regex;
  try {
    regex = new RegExp(out, flags);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return looksLikeValidEre(pattern) ? { ok: false, kind: "untranslatable", reason: `valid ERE that JavaScript will not compile: ${msg}` } : { ok: false, kind: "invalid", reason: msg };
  }
  return { ok: true, regex };
}
function looksLikeValidEre(pattern) {
  let depth = 0;
  let inClass = false;
  for (let i = 0; i < pattern.length; i += 1) {
    const c = pattern[i];
    if (c === "\\") {
      i += 1;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      continue;
    }
    if (c === "[") {
      inClass = true;
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")") {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inClass;
}
function toLines(subject) {
  if (subject === "") return [];
  const lines = subject.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
function matchesAnyLine(regex, subject) {
  for (const line of toLines(subject)) if (regex.test(line)) return true;
  return false;
}
function ereMatches(pattern, subject) {
  const t = translateEre(pattern);
  return t.ok ? matchesAnyLine(t.regex, subject) : false;
}

// src/schema/check.ts
import { readFileSync as readFileSync18 } from "node:fs";
import { basename as basename4, join as join24 } from "node:path";
var TYPE_NAMES = /* @__PURE__ */ new Set([
  "object",
  "array",
  "string",
  "number",
  "integer",
  "boolean",
  "null"
]);
var KNOWN = /* @__PURE__ */ new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "items",
  "description",
  "$schema",
  "title"
]);
var PAIRS = [
  ["tasks.json", "task.schema.json"],
  ["issues.json", "issue.schema.json"],
  ["exceptions.json", "exception.schema.json"],
  ["decisions.json", "decision.schema.json"],
  ["log.json", "log-entry.schema.json"],
  ["sprints.json", "sprint.schema.json"],
  ["repo-health.json", "repo-health.schema.json"]
];
function schemaDir(root) {
  const claude = join24(root, ".claude", "schemas");
  if (isDir(claude)) return claude;
  const deploy = join24(root, ".deploy-claude", "schemas");
  if (isDir(deploy)) return deploy;
  return claude;
}
function unsupportedKeywords(schema, where = "") {
  const out = [];
  for (const key of schema.keys()) {
    if (!KNOWN.has(key)) out.push(`${where === "" ? "<root>" : where}: unsupported keyword '${key}'`);
  }
  const props = dictOrEmpty(schema.get("properties"));
  for (const [name, sub] of props) {
    if (sub instanceof Map) out.push(...unsupportedKeywords(sub, where === "" ? name : `${where}.${name}`));
  }
  const items = schema.get("items");
  if (items instanceof Map) out.push(...unsupportedKeywords(items, where === "" ? "[]" : `${where}[]`));
  return out;
}
function validate(record, schema, where = "") {
  const errs = [];
  const at = where === "" ? "<root>" : where;
  const declared = schema.get("type");
  const wanted = typeof declared === "string" ? [declared] : Array.isArray(declared) ? declared : [];
  const known = wanted.filter((w) => typeof w === "string" && TYPE_NAMES.has(w));
  if (known.length > 0) {
    let ok = known.some((w) => isInstance(record, w));
    if (ok && typeof record === "boolean" && !known.includes("boolean")) ok = false;
    if (!ok) {
      return [`${at}: expected ${wanted.map((w) => pyStr(w)).join("|")}, got ${pyTypeName(record)}`];
    }
  }
  const kind = typeof declared === "string" ? declared : record instanceof Map ? "object" : Array.isArray(record) ? "array" : "";
  if (kind === "object" && record instanceof Map) {
    const props = dictOrEmpty(schema.get("properties"));
    const required = schema.get("required");
    if (Array.isArray(required)) {
      for (const name of required) {
        if (typeof name === "string" && !record.has(name)) {
          errs.push(`${at}: missing required '${name}'`);
        }
      }
    }
    if (schema.get("additionalProperties") === false) {
      for (const name of record.keys()) {
        if (!props.has(name)) errs.push(`${at}: unexpected property '${name}'`);
      }
    }
    for (const [name, value] of record) {
      const sub = props.get(name);
      if (sub instanceof Map) errs.push(...validate(value, sub, where === "" ? name : `${where}.${name}`));
    }
  }
  if (kind === "array" && Array.isArray(record)) {
    const sub = schema.get("items");
    if (sub instanceof Map) {
      record.forEach((value, i) => {
        errs.push(...validate(value, sub, `${where}[${i}]`));
      });
    }
  }
  const allowed = schema.get("enum");
  if (allowed !== void 0 && allowed !== null) {
    const members = Array.isArray(allowed) ? allowed : [];
    if (!members.some((m) => pyEq(record, m))) {
      errs.push(`${at}: ${pyRepr(record)} not one of ${pyStr(allowed)}`);
    }
  }
  return errs;
}
function isInstance(record, want) {
  switch (want) {
    case "object":
      return record instanceof Map;
    case "array":
      return Array.isArray(record);
    case "string":
      return typeof record === "string";
    case "number":
      return record instanceof PyInt || record instanceof PyFloat || typeof record === "boolean";
    case "integer":
      return record instanceof PyInt || typeof record === "boolean";
    case "boolean":
      return typeof record === "boolean";
    case "null":
      return record === null;
    default:
      return false;
  }
}
function loadSchema(name, schemaRoot) {
  const path = join24(schemaDir(schemaRoot), name);
  return pyLoads(readText(path));
}
function checkJournal(journalPath, schemaName, schemaRoot) {
  const base = basename4(journalPath);
  if (!isFile(journalPath)) return [];
  const schema = loadSchema(schemaName, schemaRoot);
  const doc = pyLoads(readText(journalPath));
  if (!(doc instanceof Map)) throw attributeError(doc, "get");
  const entries = doc.get("entries");
  if (!Array.isArray(entries)) return [`${base}: no entries array`];
  const out = [];
  for (const entry of entries) {
    if (!(schema instanceof Map)) throw attributeError(schema, "get");
    const rid = entry instanceof Map ? pyStr(entry.get("id") ?? "?") : "?";
    for (const err of validate(entry, schema)) out.push(`${base} ${rid} ${err}`);
  }
  return out;
}
function sweep(govDir, schemaRoot) {
  const lines = [];
  let found = 0;
  for (const [journal, schema] of PAIRS) {
    try {
      for (const err of checkJournal(join24(govDir, journal), schema, schemaRoot)) {
        lines.push(err);
        found += 1;
      }
    } catch (e) {
      lines.push(`${journal}: schema check failed (${describeException(e)})`);
      found += 1;
    }
  }
  try {
    lines.push(...unsupportedSummary(schemaRoot));
  } catch (e) {
    return { lines, rc: 1, failure: describeException(e) };
  }
  return { lines, rc: found > 0 ? 1 : 0 };
}
function unsupportedSummary(schemaRoot) {
  const kinds = /* @__PURE__ */ new Set();
  let nKw = 0;
  let nSchema = 0;
  for (const [, schemaName] of PAIRS) {
    let schema;
    try {
      schema = loadSchema(schemaName, schemaRoot);
    } catch {
      continue;
    }
    if (!(schema instanceof Map)) throw attributeError(schema, "items");
    const found = unsupportedKeywords(schema);
    if (found.length === 0) continue;
    nSchema += 1;
    nKw += found.length;
    for (const line of found) {
      const parts = rsplit(line, "'", 2);
      if (parts.length >= 2) kinds.add(parts[parts.length - 2]);
    }
  }
  if (nKw === 0) return [];
  return [
    `UNSUPPORTED ${nKw} keyword(s) across ${nSchema} schema(s) declared but NOT enforced by this reader: ` + [...kinds].sort().join(", ")
  ];
}
function unsupportedReport(schemaRoot) {
  const out = [];
  for (const [, schemaName] of PAIRS) {
    let schema;
    try {
      schema = loadSchema(schemaName, schemaRoot);
    } catch (e) {
      out.push(`${schemaName}: could not load (${describeException(e)})`);
      continue;
    }
    if (!(schema instanceof Map)) throw attributeError(schema, "items");
    for (const line of unsupportedKeywords(schema)) out.push(`${schemaName}: ${line}`);
  }
  return out;
}
function describeException(e) {
  if (e instanceof PyJsonDecodeError) return `JSONDecodeError: ${e.message}`;
  if (e instanceof PyAttributeError) return `AttributeError: ${e.message}`;
  if (isErrno(e, "ENOENT")) {
    return `FileNotFoundError: [Errno 2] No such file or directory: '${errnoPath(e)}'`;
  }
  if (isErrno(e, "ENOTDIR")) {
    return `NotADirectoryError: [Errno 20] Not a directory: '${errnoPath(e)}'`;
  }
  if (isErrno(e, "EISDIR")) {
    return `IsADirectoryError: [Errno 21] Is a directory: '${errnoPath(e)}'`;
  }
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}
var PyAttributeError = class extends Error {
};
function attributeError(v, attr) {
  return new PyAttributeError(`'${pyTypeName(v)}' object has no attribute '${attr}'`);
}
function isErrno(e, code) {
  return typeof e === "object" && e !== null && e.code === code;
}
function errnoPath(e) {
  const p = e.path;
  return typeof p === "string" ? p : "";
}
function readText(path) {
  return readFileSync18(path, "utf8");
}
function dictOrEmpty(v) {
  return v instanceof Map ? v : /* @__PURE__ */ new Map();
}
function rsplit(s2, sep, maxsplit) {
  const parts = [];
  let rest = s2;
  for (let n = 0; n < maxsplit; n += 1) {
    const i = rest.lastIndexOf(sep);
    if (i < 0) break;
    parts.unshift(rest.slice(i + sep.length));
    rest = rest.slice(0, i);
  }
  parts.unshift(rest);
  return parts;
}

// src/nouns/harness/verify.ts
function driftClass(path) {
  return TRACKED_PREFIXES.some((p) => path.startsWith(p)) ? "tracked" : "frozen";
}
var TRACKED_PREFIXES = [".claude/rules/", ".claude/skills/", ".claude/schemas/"];
function probeVerdict(name, argv, refusal, rc, out) {
  let first = firstLineCut(out, 120);
  if (first === "") first = "(no output)";
  let why = "";
  if (out.includes("Traceback (most recent call last)")) {
    why = "a Python traceback reached the operator";
  }
  if (why === "") {
    switch (rc) {
      case 0:
        break;
      case 126:
        why = "rc 126 \u2014 present but not executable (a payload file that lost its mode bit)";
        break;
      case 127:
        why = "rc 127 \u2014 command or interpreter not found";
        break;
      case 142:
        why = `rc 142 \u2014 exceeded the ${PROBE_TIMEOUT}s probe budget`;
        break;
      default: {
        const lines = out.split("\n");
        if (refusal !== "" && lines.some((l) => ereMatches(refusal, l))) {
        } else if (refusal !== "") {
          why = `rc ${rc} and the output does not match its declared refusal /${refusal}/`;
        } else {
          why = `rc ${rc}, and this surface declares no refusal \u2014 its no-op must exit 0`;
        }
      }
    }
  }
  if (why === "") return "";
  return `${name} (${argv}): ${why} | first line: ${first}`;
}
function probeSurface(h, name, argv, refusal) {
  const r = runWithTimeout(PROBE_TIMEOUT, argv, {
    cwd: h.target,
    env: { ...h.ctx.env, GOV_ROOT: h.target },
    capture: true,
    combine: true
  });
  return probeVerdict(name, argv, refusal, r.code, stripTrailingNewlines(r.stdout));
}
function findByName(root, name) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      const d = opendirSync2(dir);
      entries = [];
      try {
        let e;
        while ((e = d.readSync()) !== null) entries.push(e);
      } finally {
        d.closeSync();
      }
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join25(dir, e.name);
      if (e.name === name && p.includes("/.claude/")) out.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(root);
  return out;
}
function schemaSweepCheck(target, scriptsDir) {
  const r = sweep(join25(target, "governance"), target);
  if (r.rc === 0) {
    return { ok: true, detail: `schema sweep clean against ${target}/governance` };
  }
  const scout = stripTrailingNewlines(r.lines.join("\n"));
  return {
    ok: false,
    detail: `the schema sweep exited ${r.rc} against ${target}/governance: ${trNewlines(shHead(scout, 3), ";")} \u2014 fix the record, or the schema if the contract genuinely changed; run GOV_ROOT=${target} ${scriptsDir}/scrumux records check for the full list`
  };
}
function parseJson2(path) {
  try {
    return JSON.parse(readFileSync19(path, "utf8"));
  } catch {
    return void 0;
  }
}
function harnessVerify(h) {
  const { cli, ctx, target } = h;
  cli.say(`=== HARNESS VERIFY -> ${target} (${ctx.today}) ===`);
  const tset = join25(target, ".claude/settings.json");
  if (isFile(tset)) {
    check(h, "settings-at-root", true, `settings.json is at the repo root (${tset}), which is where Claude Code resolves it at launch`);
  } else {
    const stray = findByName(target, "settings.json").slice(0, 5).map((p) => `${p} `).join("");
    if (stray !== "") {
      check(h, "settings-at-root", false, `no .claude/settings.json at the repo ROOT ${target}, but one exists deeper: ${stray} \u2014 a settings.json below the launch root is SILENTLY INERT (Claude Code resolves project settings and $CLAUDE_PROJECT_DIR once, at launch, from the launch directory; cd never re-resolves them), so every hook chain in it is dead. Move it: mv <that file> ${tset}`);
    } else {
      check(h, "settings-at-root", false, `no .claude/settings.json at the repo ROOT ${target} \u2014 every hook chain is absent. Install it: harness deploy ${target}`);
    }
  }
  {
    let cpd = h.ctx.env["CLAUDE_PROJECT_DIR"] ?? "";
    while (cpd.length > 1 && cpd.endsWith("/")) cpd = cpd.slice(0, -1);
    if (cpd !== "" && cpd !== target) {
      warn(h, "session-topology", `CLAUDE_PROJECT_DIR is ${cpd}, not ${target} \u2014 the session running this check resolved its project root elsewhere at launch, so the hook chains installed under ${target}/.claude/ are INERT FOR THIS SESSION: they are installed, and nothing here is running them. Claude Code resolves the project root ONCE, at launch, and cd never re-resolves it, so no command inside this session can turn them on \u2014 to work under them, launch a session with ${target} as the project root. Advisory: it says nothing about the install below, and never moves the exit code.`);
    }
  }
  const settingsDoc = isFile(tset) ? parseJson2(tset) : void 0;
  const settingsParse = settingsDoc !== void 0 && settingsDoc !== null && settingsDoc !== false;
  if (isFile(tset)) {
    if (settingsParse) {
      check(h, "settings-parses", true, "valid JSON");
      const mc = missingChains(settingsDoc);
      if (mc !== "") {
        check(h, "hook-chains", false, `hook chain(s) absent: ${mc} \u2014 ${settingsFixText(h.srcClaude, target)}`);
      } else {
        check(h, "hook-chains", true, `all ${HOOK_CHAIN_COUNT} chains declared: ${HOOK_CHAINS.join(" ")}`);
      }
    } else {
      check(h, "settings-parses", false, `${tset} is not valid JSON \u2014 Claude Code loads no hooks at all from an unparseable settings file; fix it (jq . ${tset} names the offending line)`);
      check(h, "hook-chains", false, "not checked \u2014 settings.json does not parse");
    }
  } else {
    check(h, "settings-parses", false, "not checked \u2014 no settings.json at the repo root");
    check(h, "hook-chains", false, "not checked \u2014 no settings.json at the repo root");
  }
  if (isFile(tset)) {
    let badhook = "";
    for (const t of hookTargets(settingsDoc)) {
      if (t.file === "" && t.program === "") continue;
      const p = hookStartProblem(t, target, h.ctx.env);
      if (p !== null) badhook += ` ${p.path}${p.why}`;
    }
    if (badhook !== "") {
      check(h, "hooks-executable", false, `declared hook(s) unusable:${badhook} \u2014 a hook that cannot start fails on every event it is wired to and is indistinguishable from one that never fired; Claude Code treats it as NON-BLOCKING, so the tool call proceeds and the wall is silently open. Restore the file, chmod +x it, or redeploy so settings.json names a hook this platform can run`);
    } else {
      check(h, "hooks-executable", true, `every hook declared in settings.json resolves and can start on this platform (${process.platform})`);
    }
  } else {
    check(h, "hooks-executable", false, "not checked \u2014 no settings.json at the repo root");
  }
  const roster = allPayloadFiles(h.srcClaude, h.srcRoot);
  let missingS = "";
  let nMissing = 0;
  for (const rel of roster) {
    if (rel === "") continue;
    if (!isFile(join25(target, rel))) {
      missingS += ` ${rel}`;
      nMissing += 1;
    }
  }
  const rcount = roster.length;
  if (missingS !== "") {
    check(h, "scripts-roster", false, `${nMissing} of ${rcount} payload file(s) absent from ${target}:${missingS} \u2014 re-run harness deploy ${target}`);
  } else {
    check(h, "scripts-roster", true, `all ${rcount} payload file(s) present`);
  }
  let missingJ = "";
  for (const j of JOURNALS2) {
    if (!isFile(join25(target, "governance", j))) missingJ += ` ${j}`;
  }
  if (missingJ !== "") {
    check(h, "journals", false, `journal(s) absent from ${target}/governance:${missingJ} \u2014 re-run harness deploy ${target}`);
  } else {
    check(h, "journals", true, `all ${JOURNALS2.length} journal skeleton(s) present`);
  }
  {
    const verdict = schemaSweepCheck(target, ctx.scriptsDir);
    check(h, "journal-schemas", verdict.ok, verdict.detail);
  }
  let probeFails = "";
  let probeN = 0;
  let probeNames = "";
  for (const p of SURFACE_PROBES) {
    probeN += 1;
    probeNames += ` ${p.name}`;
    const pfail = probeSurface(h, p.name, p.argv, p.refusal);
    if (pfail !== "") probeFails += `; ${pfail}`;
  }
  let unprobed = "";
  for (const sp of roster) {
    if (!sp.startsWith(".claude/scripts/")) continue;
    let cov = SURFACE_PROBES.some((p) => `${p.argv} `.startsWith(`${sp} `));
    if (!cov) {
      cov = SURFACE_EXEMPT.some((e) => e.path.endsWith("/") ? sp.startsWith(e.path) : e.path === sp);
    }
    if (!cov) unprobed += ` ${sp}`;
  }
  const exemptText = SURFACE_EXEMPT.length === 0 ? "none \u2014 every shipped command carries a probe" : SURFACE_EXEMPT.map((e) => `EXEMPT ${e.path} \u2014 ${e.reason}`).join("; ");
  if (unprobed !== "") {
    check(h, "surfaces-run", false, `shipped command(s) probed by nothing and declared exempt by nothing:${unprobed} \u2014 every payload script must carry a SURFACE_PROBES row (cheapest bounded non-mutating no-op) or a SURFACE_EXEMPT row stating why it has none; add it in the harness source at src/nouns/harness/payload.ts.${probeFails === "" ? "" : ` Also, probe failure(s)${probeFails}`}`);
  } else if (probeFails !== "") {
    check(h, "surfaces-run", false, `registered surface(s) that do NOT run in ${target}${probeFails} \u2014 the machinery is installed but not usable there; run the argv shown from inside ${target} to see it. Declared exemptions: ${exemptText}`);
  } else {
    check(h, "surfaces-run", true, `all ${probeN} registered surface(s) executed in ${target} and answered:${probeNames}. Declared exemptions: ${exemptText}`);
  }
  const man = join25(target, ".claude/DEPLOYED");
  const manDoc = isFile(man) ? parseJson2(man) : void 0;
  const filesVal = manDoc !== void 0 && manDoc !== null && typeof manDoc === "object" && !Array.isArray(manDoc) ? manDoc["files"] : void 0;
  if (!isFile(man)) {
    check(h, "machinery-drift", true, `no .claude/DEPLOYED in ${target} \u2014 deployed before the manifest existed, so drift cannot be computed and is not being claimed either way; re-run harness deploy ${target} to start recording it`);
  } else if (manDoc === void 0 || filesVal === void 0 || filesVal === null || filesVal === false) {
    check(h, "machinery-drift", false, `${target}/.claude/DEPLOYED does not parse or carries no files map \u2014 the one record of what was installed is unreadable; re-run harness deploy ${target}`);
  } else {
    const files = typeof filesVal === "object" && !Array.isArray(filesVal) ? filesVal : {};
    let driftFrozen = "";
    let driftTracked = "";
    let driftGone = "";
    let dcount = 0;
    for (const dp of Object.keys(files).sort()) {
      if (dp === "") continue;
      dcount += 1;
      const dh = String(files[dp]);
      if (!isFile(join25(target, dp))) {
        driftGone += ` ${dp}`;
        continue;
      }
      if (sealQuiet(join25(target, dp)) === dh) continue;
      if (driftClass(dp) === "tracked") driftTracked += ` ${dp}`;
      else driftFrozen += ` ${dp}`;
    }
    let orphans2 = "";
    for (const od of [".claude/scripts", ".claude/schemas", ".claude/dist"]) {
      if (!isDir(join25(target, od))) continue;
      for (const abs of walkLikeFind(join25(target, od))) {
        const name = abs.slice(abs.lastIndexOf("/") + 1);
        if (name.endsWith(".pyc") || name === ".DS_Store") continue;
        if (abs.includes("__pycache__")) continue;
        const rel = abs.startsWith(`${target}/`) ? abs.slice(target.length + 1) : abs;
        if (Object.prototype.hasOwnProperty.call(files, rel)) continue;
        if (driftClass(rel) === "tracked") {
          driftTracked += ` ${rel} (not in the manifest)`;
          continue;
        }
        orphans2 += ` ${rel}`;
      }
    }
    if (orphans2 !== "") {
      check(h, "machinery-orphans", false, `${target} holds machinery the manifest does not claim:${orphans2}. A stale command left by a rename still RUNS \u2014 an agent can invoke it and write records with a CLI one version out of date, which is worse than it being absent. Remove them, then re-run harness deploy ${target}. If any of these is genuinely this repo's own, it is in the wrong directory: .claude/scripts and .claude/dist are the harness's.`);
    } else {
      check(h, "machinery-orphans", true, "no unclaimed machinery under .claude/scripts or .claude/dist (an unclaimed schema is variance, reported with machinery-drift)");
    }
    const manCommitRaw = manDoc["source_commit"];
    const manCommit8 = [...String(manCommitRaw ?? "null")].slice(0, 8).join("");
    if (driftFrozen !== "" || driftGone !== "") {
      check(h, "machinery-drift", false, `the machinery in ${target} no longer matches what was installed.${driftFrozen === "" ? "" : ` CHANGED:${driftFrozen}.`}${driftGone === "" ? "" : ` MISSING:${driftGone}.`} The upstream wall should have made this impossible, so either it was evaded, the files were replaced out of band, or this repo was deployed from a different source (${manCommit8}). Restore them with harness deploy ${target}; a change that is genuinely wanted belongs upstream (see .claude/rules/harness-is-upstream.md).${driftTracked === "" ? "" : ` Rules, skills or schemas also vary:${driftTracked} \u2014 reported, not a failure.`}`);
    } else if (driftTracked !== "") {
      check(h, "machinery-drift", true, `all ${dcount} installed file(s) match the manifest, except variance the target carries in rules, skills or schemas:${driftTracked} \u2014 reported, never blocking (D-0072 boundary 7, R-019); these are where a repo or the operator's canon legitimately differs`);
    } else {
      check(h, "machinery-drift", true, `all ${dcount} installed file(s) match .claude/DEPLOYED byte for byte`);
    }
  }
  reportSessionPermissions(h, join25(target, ".claude/settings.json"));
  const nfail = cli.fails();
  const nall = h.rows;
  const summary = nfail === 0 ? `harness verify: ${target} is INSTALLED \u2014 ${nall}/${nall} checks pass. Installed is not live: whether these hooks fire is decided by the project root a session was LAUNCHED with, which nothing inside it can change.` : `harness verify: ${target} is NOT fully installed \u2014 ${nfail} of ${nall} checks failed. Each FAIL line above names the fix.`;
  return harnessEmit(h, summary);
}

// src/nouns/harness.ts
var VERBS_TSV7 = "deploy	install the machinery into a target repo\nverify	prove the machinery is INSTALLED in a target repo\n";
var USAGE6 = NOUN_USAGE["harness"] ?? "";
function harnessRun(cli, ctx, verb, args) {
  if (verb !== "deploy" && verb !== "verify") {
    cli.dieUsage(`unknown verb '${verb}' for noun harness \u2014 verbs: deploy, verify. See: scrumux help harness`);
  }
  let target = "";
  for (const a of args) {
    if (a.startsWith("-")) {
      cli.dieUsage(`unknown flag ${a} \u2014 usage: scrumux harness ${verb} <target> [--json]`);
    }
    if (target !== "") {
      cli.dieUsage(`harness takes ONE target, got '${target}' and '${a}' \u2014 usage: scrumux harness ${verb} <target> [--json]`);
    }
    target = a;
  }
  if (target === "") {
    cli.dieUsage(`${verb} needs a target repo \u2014 usage: scrumux harness ${verb} <target> [--json]`);
  }
  const nctx = nounContext(ctx);
  const abs = resolve4(nctx.cwd, target);
  let isDir2 = false;
  try {
    isDir2 = statSync9(abs).isDirectory();
  } catch {
    isDir2 = false;
  }
  if (!isDir2) {
    cli.die(`target ${target} is not a directory \u2014 create it first (mkdir -p '${target}'), then re-run`);
  }
  try {
    accessSync2(abs, constants2.X_OK);
  } catch {
    cli.die("cannot resolve  \u2014 check the path and its permissions");
  }
  const h = {
    cli,
    ctx: nctx,
    io: ctx.io,
    target: abs,
    // SRC_CLAUDE is derived from where the CLI lives, so it already carries
    // whichever name the source actually uses (`.deploy-claude/` here,
    // `.claude/` in a deployment) and nothing downstream needs to know which.
    srcClaude: resolve4(nctx.scriptsDir, ".."),
    srcRoot: nctx.codeRoot,
    items: [],
    rows: 0
  };
  if (verb === "deploy") return harnessDeploy(h);
  return harnessVerify(h);
}
var MODULE7 = {
  verbs: () => VERBS_TSV7,
  usage: () => USAGE6,
  run: harnessRun
};

// src/nouns/health.ts
import { join as join26 } from "node:path";
var VERBS_TSV8 = "add	the only verb\n";
var USAGE7 = NOUN_USAGE["health"] ?? "";
var SEED3 = '{"entries": []}';
function parseHealthFlags(args, die) {
  const f = { name: "", command: "", type: "", timeout: "" };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`health: ${flag} needs a value \u2014 see: scrumux help`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--name":
        f.name = value(a);
        break;
      case "--command":
        f.command = value(a);
        break;
      case "--type":
        f.type = value(a);
        break;
      case "--timeout":
        f.timeout = value(a);
        break;
      // NOTE the message: "see: scrumux help", not "scrumux help health".
      // Every other noun in this group names itself; this one does not, and
      // the wording is contract (Article 5) rather than a typo to correct.
      default:
        die(`health: unknown flag ${a} \u2014 see: scrumux help`);
    }
  }
  return f;
}
function healthEntry(f) {
  const entry = { name: f.name, command: f.command };
  if (f.type !== "") entry["type"] = f.type;
  if (f.timeout !== "") entry["timeout_seconds"] = new RawNumber(f.timeout);
  return entry;
}
function jqField(v) {
  if (v === void 0 || v === null) return "";
  if (typeof v === "string") return v;
  return JSON.stringify(v);
}
function objRow(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function registerEntry(doc, f) {
  const entry = healthEntry(f);
  const o = objRow(doc);
  const rows5 = o === null ? null : o["entries"];
  if (o === null || !Array.isArray(rows5)) return { doc: appendEntry(doc, entry), displaced: [] };
  const displaced = [];
  const out = [];
  for (const row of rows5) {
    const r = objRow(row);
    if (r === null || r["name"] !== f.name) {
      out.push(row);
      continue;
    }
    displaced.push(jqField(r["command"]));
    out.push(displaced.length === 1 ? entry : row);
  }
  if (displaced.length === 0) return { doc: appendEntry(doc, entry), displaced };
  return { doc: { ...o, entries: out }, displaced };
}
function healthAdd(cli, ctx, io, args) {
  const f = parseHealthFlags(args, (m) => cli.die(m));
  if (f.name === "") cli.die("health: --name is required");
  if (f.command === "") cli.die("health: --command is required (POSIX shell command; exit 0 = healthy)");
  if (!(f.type === "" || f.type === "build" || f.type === "test" || f.type === "run" || f.type === "lint" || f.type === "other")) {
    cli.die("health: --type must be build|test|run|lint|other");
  }
  if (f.timeout !== "" && /[^0-9]/.test(f.timeout)) {
    cli.die("health: --timeout must be an integer (seconds)");
  }
  const path = join26(ctx.gov, "repo-health.json");
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  let displaced = [];
  refusing(cli, () => {
    ensureFile(path, SEED3);
    const res = writeJson(path, (doc) => {
      const r = registerEntry(doc, f);
      displaced = r.displaced;
      return r.doc;
    }, opts);
    warnReseal(cli, res.resealWarning);
  });
  sealBootstrap(ctx.gov, ctx.today);
  if (displaced.length === 0) return cli.emit(`health check '${f.name}' registered`);
  if (displaced.length > 1) {
    cli.say(`  (this name is on ${displaced.length} entries; the first was replaced and the rest are untouched \u2014 nothing on this noun deletes a row. Drop them all and re-add: ALLOW_ENTRY_REMOVAL=1 scrumux repair journal repo-health.json --apply '.entries |= map(select(.name != "${f.name}"))' --why '<why>' --by <you>)`);
  }
  return cli.emit(`health check '${f.name}' re-registered: ${displaced[0] ?? ""} -> ${f.command}`);
}
var MODULE8 = {
  verbs: () => VERBS_TSV8,
  usage: () => USAGE7,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "add":
        return healthAdd(cli, nounContext(ctx), ctx.io, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun health \u2014 the only verb is 'add'. See: scrumux help health`
        );
    }
  }
};

// src/nouns/issue.ts
import { readFileSync as readFileSync21 } from "node:fs";
import { join as join28 } from "node:path";

// src/nouns/issue-read.ts
import { readFileSync as readFileSync20 } from "node:fs";
import { join as join27 } from "node:path";
var STATUSES = ["open", "accepted", "resolved", "rejected", "all"];
function issueRows(gov) {
  try {
    return entriesOf(parsePreservingNumbers(readFileSync20(join27(gov, "issues.json"), "utf8")));
  } catch {
    return [];
  }
}
var str3 = (v) => typeof v === "string" ? v : null;
var filesOf = (e) => {
  const f = field(e, "refs", "files");
  return Array.isArray(f) ? f.filter((x) => typeof x === "string") : [];
};
function view(e) {
  return {
    id: str3(field(e, "id")),
    type: str3(field(e, "type")),
    status: str3(field(e, "status")),
    severity: str3(field(e, "severity")),
    summary: str3(field(e, "summary")),
    resolution_pointer: str3(field(e, "resolution_pointer")),
    task: str3(field(e, "refs", "task")),
    files: filesOf(e),
    created_at: str3(field(e, "created_at"))
  };
}
function matchIssues(rows5, f) {
  const needle = f.text.toLowerCase();
  return rows5.filter((e) => {
    if (e === null || typeof e !== "object" || Array.isArray(e)) return false;
    if (f.status !== "all" && interp(field(e, "status")) !== f.status) return false;
    if (f.type !== "" && interp(field(e, "type")) !== f.type) return false;
    if (f.task !== "" && interp(field(e, "refs", "task")) !== f.task) return false;
    if (needle === "") return true;
    const hay = [field(e, "id"), field(e, "summary"), field(e, "resolution_pointer"), field(e, "refs", "task")].map((v) => typeof v === "string" ? v : "").concat(filesOf(e)).join("\n").toLowerCase();
    return hay.includes(needle);
  });
}
function issueRead(cli, ctx, verb, args) {
  const f = { status: verb === "list" ? "open" : "all", type: "", task: "", text: "" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--status" || a === "--type" || a === "--task") {
      const v = args[i + 1];
      if (v === void 0) return cli.die(`issue ${verb}: ${a} needs a value`);
      f[a.slice(2)] = v;
      i++;
      continue;
    }
    if (a.startsWith("--")) return cli.die(`issue ${verb}: unknown flag ${a} \u2014 see: scrumux help issue`);
    if (verb === "find") {
      f.text = f.text === "" ? a : `${f.text} ${a}`;
      continue;
    }
    return cli.die(`issue list: unexpected argument '${a}' \u2014 to search, use: scrumux issue find '${a}'`);
  }
  if (!STATUSES.includes(f.status)) return cli.die("issue: --status must be open|accepted|resolved|rejected|all");
  if (verb === "find" && f.text === "") return cli.die("issue find: what to look for? scrumux issue find 'receipt fresh' [--status open]");
  const hits = matchIssues(issueRows(ctx.gov), f);
  for (const e of hits) {
    const v = view(e);
    const extra = [v["task"] === null ? "" : ` [task ${String(v["task"])}]`, filesOf(e).length === 0 ? "" : ` [files ${filesOf(e).join(", ")}]`].join("");
    const summary = String(v["summary"] ?? "");
    cli.say(`${String(v["id"])}  ${String(v["status"])}  ${String(v["type"])}${v["severity"] === null ? "" : `/${String(v["severity"])}`}  ${summary.length > 160 ? `${summary.slice(0, 157)}...` : summary}${extra}`);
  }
  cli.data({ issues: hits.map(view) });
  return cli.emit(hits.length === 0 ? `(no ${f.status === "all" ? "" : `${f.status} `}issues match)` : `${hits.length} issue(s). The journal is governance/issues.json under GOV_ROOT; read it through these verbs.`);
}
function words(s2) {
  return new Set(s2.toLowerCase().match(/[a-z0-9_]{4,}/g) ?? []);
}
function nearDuplicates(gov, summary, files, exceptId = "") {
  const mine = words(summary);
  const out = [];
  for (const e of issueRows(gov)) {
    const id = interp(field(e, "id"));
    const st = interp(field(e, "status"));
    if (id === exceptId || st !== "open" && st !== "accepted") continue;
    const sharedFile = files.some((f) => filesOf(e).includes(f));
    const theirs = words(interp(field(e, "summary")));
    const common = [...mine].filter((w) => theirs.has(w)).length;
    if (sharedFile || common >= 3 && common * 2 >= mine.size) out.push(id);
  }
  return out;
}

// src/nouns/issue.ts
var VERBS_TSV9 = `new	raise a defect, drift, harness problem or idea
update	change status, severity, fix text or waivers
validate	record a read-only agent's verdict on the claim
authorize	record that the FIX is authorized (never a validation)
list	the open issues (or --status \u2026), read-only
find	issues whose id, summary, fix, task or files contain TEXT
`;
var SEED4 = '{"entries": []}';
var SOURCES = [
  "User",
  "human",
  "claude",
  "monitor",
  "implement-sop",
  "session-check",
  "session-review",
  "planning-session",
  "issue-validator",
  "simplicity-engineer",
  "panel-review",
  "debugger",
  "governance-validate",
  "decisions-pending",
  "arbiter-review",
  "audit-agent"
];
var TYPES = ["drift", "defect", "idea", "governance", "harness"];
var VERDICTS = ["reproduced", "evidenced", "invalidated", "duplicate"];
var STATUSES2 = ["open", "accepted", "resolved", "rejected"];
var SEVERITIES = ["low", "medium", "high", "critical"];
function issuesPath(ctx) {
  return join28(ctx.gov, "issues.json");
}
function requireIssue(cli, ctx, verb, id) {
  if (refExists(issuesPath(ctx), id)) return;
  cli.die(
    `issue ${verb}: ${id} not found in issues.json \u2014 list them: scrumux issue list --status all`
  );
}
function issueAuthorize(cli, ctx, ictx, args) {
  const iid = args[0] ?? "";
  const rest = args.slice(1);
  if (iid === "") {
    cli.die(
      "usage: scrumux issue authorize I-0001 --by WHO [--note TEXT] \u2014 records fix authorization; it does NOT validate the claim (I-0010)"
    );
  }
  requireIssue(cli, ctx, "authorize", iid);
  let by = "";
  let note = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--by") {
      by = flagValue(cli, rest, i + 1, "issue authorize");
      i += 2;
      continue;
    }
    if (f === "--note") {
      note = flagValue(cli, rest, i + 1, "issue authorize");
      i += 2;
      continue;
    }
    cli.die(`issue authorize: unknown flag ${f} \u2014 see: scrumux help issue`);
  }
  if (by === "") {
    cli.die("issue authorize: --by is required (whose word authorizes the fix \u2014 normally User)");
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    issuesPath(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== iid) return row;
      const authorization = note === "" ? { by, date: d } : { by, date: d, note };
      return { ...row, authorization, updated_at: d };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${iid} authorized by ${by}`);
}
function issueValidate(cli, ctx, ictx, args) {
  const iid = args[0] ?? "";
  const rest = args.slice(1);
  if (iid === "") {
    cli.die(
      "usage: scrumux issue validate I-0001 --verdict reproduced|evidenced|invalidated|duplicate --evidence TEXT [--repro-cmd CMD] [--duplicate-of I-0001|T-0001] [--by WHO]"
    );
  }
  requireIssue(cli, ctx, "validate", iid);
  let verdict = "";
  let evidence = "";
  let reproCmd = "";
  let by = "agent";
  let dupOf = "";
  let revalidate = false;
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    const v = () => flagValue(cli, rest, i + 1, "issue validate");
    if (f === "--verdict") {
      verdict = v();
      i += 2;
      continue;
    }
    if (f === "--evidence") {
      evidence = v();
      i += 2;
      continue;
    }
    if (f === "--repro-cmd") {
      reproCmd = v();
      i += 2;
      continue;
    }
    if (f === "--by") {
      by = v();
      i += 2;
      continue;
    }
    if (f === "--duplicate-of") {
      dupOf = v();
      i += 2;
      continue;
    }
    if (f === "--revalidate") {
      revalidate = true;
      i += 1;
      continue;
    }
    cli.die(`issue validate: unknown flag ${f} \u2014 see: scrumux help issue`);
  }
  if (!VERDICTS.includes(verdict)) {
    cli.die("issue validate: --verdict must be reproduced|evidenced|invalidated|duplicate");
  }
  if (evidence === "") {
    cli.die(
      'issue validate: --evidence is required \u2014 what you saw, or the disproof; validation without evidence is noise (D-0011). State how you reproduced it, what the run printed, and the line the mechanism sits on. GOOD (reproduced) "An independent read-only agent reproduced it against 444dfd1 in a detached worktree: deployed into a fresh target, wrote repo-owned content into both seeded files, stamped the previous manifest to claim them, redeployed. One run printed UNCHANGED ... kept for both files, then REMOVED ... no longer part of the payload; both were gone afterwards. Mechanism confirmed at cmd-harness.sh: neither path is in payload.list, so the grep guard never fires and rm -f runs" (I-0152). GOOD (evidenced, no repro needed) "cmd-session.sh:146 tests for a .git DIRECTORY; inside a worktree .git is a file, so the stray scan is silently skipped" (I-0052). GOOD (invalidated) "Ran the named command at HEAD in a sandbox GOV_ROOT: exit 0, no refusal printed. The behaviour described was removed by T-0189 and the report is against a build that no longer exists" \u2014 a disproof is a deliverable, not a failure. BAD "confirmed" or "looks right" \u2014 a verdict with no evidence is the reporter claim restated by a second name.'
    );
  }
  if (verdict === "duplicate") {
    if (dupOf === "") {
      cli.die("issue validate: verdict duplicate needs --duplicate-of <I-XXXX|T-XXXX> (the original it duplicates)");
    }
    if (dupOf.startsWith("I-")) {
      if (!refExists(issuesPath(ctx), dupOf)) {
        cli.die(`issue validate: duplicate-of ${dupOf} not found in issues.json`);
      }
    } else if (dupOf.startsWith("T-")) {
      refusing(cli, () => requireTaskRef(ctx.gov, dupOf));
    } else {
      cli.die("issue validate: --duplicate-of must be an issue (I-XXXX) or backlog task (T-XXXX) id");
    }
    if (dupOf === iid) cli.die("issue validate: an issue cannot duplicate itself");
  } else if (dupOf !== "") {
    cli.die("issue validate: --duplicate-of only goes with --verdict duplicate");
  }
  const src = firstSource(ctx, iid);
  if (src !== "" && src === by && by !== "User") {
    cli.die(
      `self-validation refused: ${iid} was raised by '${src}' and cannot be validated by '${by}' \u2014 the point of the gate is independent confirmation by an agent with its own tools and process. Dispatch a read-only agent whose identity is NOT '${src}' (any read-only definition in .claude/agents \u2014 issue-validator, debugger, context-gatherer \u2014 except '${src}'), let it reach its own verdict, and record that verdict with --by <that agent> (I-0054)`
    );
  }
  const prior = priorValidation(ctx, iid);
  if (prior !== null && !revalidate) {
    cli.die(
      `issue validate: ${iid} already carries a validation \u2014 '${prior.verdict}' recorded by '${prior.by}' on ${prior.date}. A verdict is what both promotion gates read, so it is never replaced silently: the second run would erase the first validator's evidence and nothing would show it had. Read it first: jq '.entries[] | select(.id=="${iid}") | .validation' governance/issues.json \u2014 then, if it genuinely must be superseded, re-run with --revalidate, which keeps the prior verdict in .validation_history`
    );
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    issuesPath(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== iid) return row;
      const validation = { verdict, evidence, by, date: d };
      if (reproCmd !== "") validation["repro_cmd"] = reproCmd;
      if (dupOf !== "") validation["duplicate_of"] = dupOf;
      const kept = row["validation"];
      if (revalidate && kept !== void 0 && kept !== null) {
        const hist = row["validation_history"];
        const prev = Array.isArray(hist) ? hist : [];
        return { ...row, validation, updated_at: d, validation_history: [...prev, kept] };
      }
      return { ...row, validation, updated_at: d };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  if (prior !== null) {
    return cli.emit(
      `${iid} re-validated: ${verdict} \u2014 the prior verdict '${prior.verdict}' by '${prior.by}' is kept in .validation_history`
    );
  }
  return cli.emit(`${iid} validated: ${verdict}`);
}
function firstSource(ctx, id) {
  const doc = loadIssues(ctx);
  if (doc === null) return "";
  for (const row of doc) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row;
    if (r["id"] !== id) continue;
    const s2 = r["source"];
    if (s2 === void 0 || s2 === null || s2 === false) return "";
    return typeof s2 === "string" ? s2 : String(s2);
  }
  return "";
}
function priorValidation(ctx, id) {
  const doc = loadIssues(ctx);
  if (doc === null) return null;
  for (const row of doc) {
    if (row === null || typeof row !== "object" || Array.isArray(row)) continue;
    const r = row;
    if (r["id"] !== id) continue;
    const v = r["validation"];
    if (v === void 0 || v === null) return null;
    if (typeof v !== "object" || Array.isArray(v)) {
      return { verdict: "(malformed)", by: "(unknown)", date: "(undated)" };
    }
    const o = v;
    const or = (x, dflt) => x === void 0 || x === null || x === false ? dflt : typeof x === "string" ? x : String(x);
    return {
      verdict: or(o["verdict"], "(none)"),
      by: or(o["by"], "(unknown)"),
      date: or(o["date"], "(undated)")
    };
  }
  return null;
}
function loadIssues(ctx) {
  const doc = readDoc(issuesPath(ctx));
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return null;
  const e = doc["entries"];
  return Array.isArray(e) ? e : null;
}
function issueUpdate(cli, ctx, ictx, args) {
  const iid = args[0] ?? "";
  const rest = args.slice(1);
  if (iid === "") {
    cli.die("usage: scrumux issue update I-0001 [--status ...] [--severity ...] [--task T-0001] [--fix TEXT]");
  }
  requireIssue(cli, ctx, "update", iid);
  let status = "";
  let severity = "";
  let task = "";
  let fix = "";
  const waives = [];
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    const v = () => flagValue(cli, rest, i + 1, "issue update");
    if (f === "--status") {
      status = v();
      i += 2;
      continue;
    }
    if (f === "--severity") {
      severity = v();
      i += 2;
      continue;
    }
    if (f === "--task") {
      task = v();
      i += 2;
      continue;
    }
    if (f === "--fix") {
      fix = v();
      i += 2;
      continue;
    }
    if (f === "--waives") {
      const w = v();
      refusing(cli, () => requireTaskRef(ctx.gov, w));
      waives.push(w);
      i += 2;
      continue;
    }
    cli.die(`issue update: unknown flag ${f} \u2014 see: scrumux help issue`);
  }
  if (status + severity + task + fix === "" && waives.length === 0) {
    cli.die("issue update: nothing to update \u2014 pass --status, --severity, --task, --fix, and/or --waives");
  }
  if (status !== "" && !STATUSES2.includes(status)) {
    cli.die("issue update: --status must be open|accepted|resolved|rejected");
  }
  if (severity !== "" && !SEVERITIES.includes(severity)) {
    cli.die("issue update: --severity must be low|medium|high|critical");
  }
  if (task !== "") refusing(cli, () => requireTaskRef(ctx.gov, task));
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    issuesPath(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== iid) return row;
      let out = { ...row };
      if (status !== "") out = { ...out, status };
      if (severity !== "") out = { ...out, severity };
      if (task !== "") {
        const refs = out["refs"];
        const base = refs !== null && typeof refs === "object" && !Array.isArray(refs) ? refs : {};
        out = { ...out, refs: { ...base, task } };
      }
      if (waives.length !== 0) out = { ...out, waives: [...waives] };
      if (fix !== "") {
        const prior = out["prior_resolution_pointers"];
        const priorArr = Array.isArray(prior) ? prior : [];
        const before = out["resolution_pointer"];
        out = {
          ...out,
          prior_resolution_pointers: [
            ...priorArr,
            { text: before === void 0 ? null : before, replaced_on: d }
          ]
        };
        out = { ...out, resolution_pointer: fix };
      }
      return { ...out, updated_at: d };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${iid} updated`);
}
function issueNew(cli, ctx, ictx, args) {
  let type = "";
  let source = "";
  let summary = "";
  let fix = "";
  let severity = "";
  let task = "";
  const files = [];
  const waives = [];
  for (let i = 0; i < args.length; ) {
    const f = args[i];
    const v = () => flagValue(cli, args, i + 1, "issue");
    if (f === "--type") {
      type = v();
      i += 2;
      continue;
    }
    if (f === "--source") {
      source = v();
      i += 2;
      continue;
    }
    if (f === "--summary") {
      summary = v();
      i += 2;
      continue;
    }
    if (f === "--fix") {
      fix = v();
      i += 2;
      continue;
    }
    if (f === "--severity") {
      severity = v();
      i += 2;
      continue;
    }
    if (f === "--task") {
      task = v();
      i += 2;
      continue;
    }
    if (f === "--file") {
      files.push(v());
      i += 2;
      continue;
    }
    if (f === "--waives") {
      const w = v();
      refusing(cli, () => requireTaskRef(ctx.gov, w));
      waives.push(w);
      i += 2;
      continue;
    }
    cli.die(`issue: unknown flag ${f} \u2014 see: scrumux help issue`);
  }
  if (!TYPES.includes(type)) {
    cli.die("issue: --type must be drift|defect|idea|governance|harness");
  }
  if (source === "") cli.die('issue: --source is required (hook name, agent name, or "human")');
  if (type === "drift" || type === "idea" || type === "governance") {
    if (source !== "User" && source !== "human") {
      cli.die(
        `issue: --type ${type} is not an agent's to file \u2014 an agent files bugs. Use --type defect when you SAW something behave wrong and can name the command that shows it, or --type harness when the harness itself misbehaved. An observation that something is untidy, inconsistent, duplicated or could-be-better is not filed at all (D-0079).`
      );
    }
  }
  if (!SOURCES.includes(source)) {
    cli.die(
      `issue: --source '${source}' is not one of the recorded sources \u2014 it is a closed vocabulary, not prose (T-0130). Valid: User human claude monitor implement-sop session-check session-review planning-session issue-validator simplicity-engineer panel-review debugger governance-validate decisions-pending arbiter-review audit-agent`
    );
  }
  if (summary === "") {
    cli.die(
      'issue: --summary is required \u2014 what you SAW, at which site, and the command or observation that shows it. A summary a validator cannot reproduce from is not a report. GOOD (defect) "harness deploy DELETES a repo own project-standards.md and project-walls.conf. The seeding lane creates both create-if-absent; the I-0143 prune then removes any path the PREVIOUS manifest names that payload.list lacks. Observed 2026-08-30 in ~/tools/scrumux-agents: UNCHANGED ... kept, then REMOVED ... no longer part of the payload, in ONE run" (I-0152). GOOD (defect) "harness deploy seeds no .gitignore lines for the views scrumux writes, so running a report dirties a deployed repo tree. Repro: deploy into a git repo, commit, run scrumux views render, git status shows four untracked generated files" (I-0153). GOOD (harness) "Three walls emit wall: project-walls.conf while the four named walls emit their own names; a reader grouping by wall cannot tell which project wall fired" (I-0151). BAD "deploy is broken" \u2014 no site, no repro, nothing a validator can confirm or refute.'
    );
  }
  if (fix === "") {
    cli.die(
      'issue: --fix is required (resolution_pointer \u2014 the rule/skill/script/step that resolves it, so no scope creep) \u2014 name the site and the shape of the repair and stop there; it BOUNDS the work, it is not the work. GOOD "The prune must never remove a path the seeding lane owns, and the exclusion must come from that lane rather than a second literal: the lane writes each path it seeds into TMPD/seeded.list and the prune skips anything on it" (I-0152). GOOD "deploy appends the ignore lines for exactly what views render writes into the target .gitignore, once: append-only and append-if-absent, so a second deploy adds nothing" (I-0153). GOOD "walls_record in .claude/hooks/walls-lib.sh should carry the wall own name rather than the file the rule came from" (I-0151). BAD "fix it" or "investigate" \u2014 neither bounds anything, so the next session picks its own scope.'
    );
  }
  if (severity !== "" && !SEVERITIES.includes(severity)) {
    cli.die("issue: --severity must be low|medium|high|critical");
  }
  if (task !== "") refusing(cli, () => requireTaskRef(ctx.gov, task));
  const path = issuesPath(ctx);
  refusing(cli, () => ensureFile(path, SEED4));
  const d = ctx.today;
  const r = guardedAppend(cli, ctx, ictx.io, path, idStream, "I", (doc, id) => {
    const rec = {
      id,
      type,
      source,
      summary,
      resolution_pointer: fix,
      status: "open",
      created_at: d
    };
    if (severity !== "") rec["severity"] = severity;
    if (waives.length !== 0) rec["waives"] = [...waives];
    const refs = { files: [...files] };
    if (task !== "") refs["task"] = task;
    rec["refs"] = refs;
    return appendEntry(doc, rec);
  });
  sealBootstrap(ctx.gov, ctx.today);
  const similar = nearDuplicates(ctx.gov, summary, files, r.id);
  if (similar.length > 0) {
    const tell = `open issue(s) that look like this one: ${similar.join(", ")} \u2014 read them (scrumux issue find ${similar[0]}); if this is the same defect, add what is new to it rather than keeping two`;
    cli.sayAlways(`TELL: ${tell}`);
    if (cli.json) cli.tell("possible duplicate", tell);
  }
  return emitted(cli, r.id);
}
function issueImpl(cli, ctx, ictx, argv) {
  const head = argv[0] ?? "";
  if (head === "authorize") return issueAuthorize(cli, ctx, ictx, argv.slice(1));
  if (head === "validate") return issueValidate(cli, ctx, ictx, argv.slice(1));
  if (head === "update") return issueUpdate(cli, ctx, ictx, argv.slice(1));
  return issueNew(cli, ctx, ictx, argv);
}
var MODULE9 = {
  verbs: () => VERBS_TSV9,
  usage: () => NOUN_USAGE["issue"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "new":
        return issueImpl(cli, ctx, ictx, args);
      case "update":
      case "validate":
      case "authorize":
        return issueImpl(cli, ctx, ictx, [verb, ...args]);
      case "list":
      case "find":
        return issueRead(cli, ctx, verb, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun issue \u2014 verbs: new, update, validate, authorize, list, find. See: scrumux help issue`
        );
    }
  }
};
function readDoc(path) {
  try {
    return parsePreservingNumbers(readFileSync21(path, "utf8"));
  } catch {
    return null;
  }
}

// src/nouns/log.ts
import { join as join30 } from "node:path";

// src/nouns/log-show.ts
import { readFileSync as readFileSync22 } from "node:fs";
import { join as join29 } from "node:path";
function logRows(gov) {
  try {
    return entriesOf(parsePreservingNumbers(readFileSync22(join29(gov, "log.json"), "utf8")));
  } catch {
    return [];
  }
}
var cap = (s2, n) => s2.length > n ? `${s2.slice(0, n - 3)}...` : s2;
var text = (v) => typeof v === "string" ? v : v === null ? "" : interp(v);
function renderLogEntry(e, limit = 0) {
  const c = (s2) => limit > 0 ? cap(s2, limit) : s2;
  const task = text(field(e, "task"));
  const lines = [`${text(field(e, "id"))}  ${text(field(e, "date"))}${task === "" ? "" : `  ${task}`}  ${text(field(e, "actor"))}: ${text(field(e, "title"))}`];
  const did = text(field(e, "what_was_done"));
  if (did !== "") lines.push(`    did: ${c(did)}`);
  const ver = text(field(e, "verification"));
  if (ver !== "") lines.push(`    verified: ${c(ver)}`);
  const pend = field(e, "pending");
  if (Array.isArray(pend)) for (const p of pend) lines.push(`    pending: ${c(text(p))}`);
  return lines;
}
function citedLogIds(texts) {
  const out = [];
  for (const t of texts) for (const m of t.matchAll(/\bL-[0-9]{4}\b/g)) if (!out.includes(m[0])) out.push(m[0]);
  return out;
}
function logShow(cli, ctx, args) {
  const ids = [];
  let task = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--task") {
      const v = args[i + 1];
      if (v === void 0) return cli.die("log show: --task needs a value, e.g. --task T-0003");
      task = v;
      i++;
    } else if (/^L-[0-9]{4}$/.test(a)) {
      ids.push(a);
    } else {
      return cli.die(`log show: '${a}' is neither an entry id (L-0001) nor --task T-0001 \u2014 usage: scrumux log show L-0001 [L-0002 ...] | scrumux log show --task T-0001`);
    }
  }
  if (ids.length === 0 && task === "") return cli.die("log show: which entries? scrumux log show L-0001 [L-0002 ...] | scrumux log show --task T-0001");
  const rows5 = logRows(ctx.gov);
  const byId2 = (id) => rows5.find((e) => field(e, "id") === id);
  const found = [];
  const missing = [];
  for (const id of ids) {
    const e = byId2(id);
    if (e === void 0) missing.push(id);
    else found.push(e);
  }
  if (task !== "") {
    for (const e of rows5) if (field(e, "task") === task && !found.includes(e)) found.push(e);
  }
  for (const e of found) for (const l of renderLogEntry(e)) cli.say(l);
  if (missing.length > 0) cli.say(`not in governance/log.json: ${missing.join(", ")}`);
  cli.data({ entries: found, missing });
  return cli.emit(found.length === 0 ? `(no log entries${task === "" ? "" : ` for ${task}`})` : "");
}

// src/nouns/log.ts
var VERBS_TSV10 = "new	append one entry\nshow	read entries by id, or every entry of a task (--task T-0001)\n";
var USAGE8 = NOUN_USAGE["log"] ?? "";
var SEED5 = '{"entries": []}';
function parseLogFlags(args, die, env) {
  const govActor = env["GOV_ACTOR"];
  const f = {
    title: "",
    did: "",
    task: "",
    verified: "",
    actor: govActor === void 0 || govActor === "" ? "claude" : govActor,
    pending: []
  };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`log: ${flag} needs a value \u2014 see: scrumux help log`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--title":
        f.title = value(a);
        break;
      case "--did":
        f.did = value(a);
        break;
      case "--task":
        f.task = value(a);
        break;
      case "--verified":
        f.verified = value(a);
        break;
      case "--actor":
        f.actor = value(a);
        break;
      case "--pending":
        f.pending.push(value(a));
        break;
      default:
        die(`log: unknown flag ${a} \u2014 see: scrumux help log`);
    }
  }
  return f;
}
function logEntry(f, id, today) {
  const entry = {
    id,
    date: today,
    // `task:(if $task=="" then null else $task end)` -- THE ONE optional field
    // in this entry that is written as an explicit null rather than omitted.
    // AI_LOG.MD's renderer tests `if .task then …`, so null and absent read
    // the same there; the schema is what wants the key present.
    task: f.task === "" ? null : f.task,
    actor: f.actor,
    title: f.title,
    what_was_done: f.did
  };
  if (f.verified !== "") entry["verification"] = f.verified;
  if (f.pending.length > 0) entry["pending"] = [...f.pending];
  return entry;
}
function logNew(cli, ctx, io, args) {
  const f = parseLogFlags(args, (m) => cli.die(m), ctx.env);
  if (f.title === "") {
    cli.die('log: --title is required \u2014 one sentence naming what changed and the record ids it settles, in the past tense. GOOD (build) "The prune stopped eating the two files deploy promises never to overwrite (I-0152, I-0153)" (L-0285). GOOD (defect) "A wall stops recording a sub-agent refusal as the session own (I-0154)". GOOD (governance) "Repair applied to governance/decisions.json" (L-0284). BAD "fixed hook" \u2014 eight words of jargon that name neither the hook nor what stopped being wrong.');
  }
  if (f.did === "") {
    cli.die('log: --did is required (what_was_done) \u2014 the EVIDENCE, not a story: the verify command and its rc, git diff --stat, and every refusal you hit and what you did about it. GOOD "harness deploy seeding lane creates .claude/rules/project-standards.md and .claude/project-walls.conf create-if-absent; the I-0143 prune then removed any path the previous manifest names that payload.list lacks. Fixed by writing each seeded path into TMPD/seeded.list and skipping it in the prune. sh tests/harness-tests.sh rc=0; 3 files changed, 61 insertions" (L-0285). GOOD "scrumux repair on governance/decisions.json. Reason: stamping the back-references for D-0081 and D-0082, without which the twenty dead rulings go on rendering as current law" (L-0284). BAD "created X, verified Y" \u2014 nothing there can be checked by a reader who was not present.');
  }
  if (f.task !== "") refusing(cli, () => requireTaskRef(ctx.gov, f.task));
  const logPath = join30(ctx.gov, "log.json");
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  const id = refusing(cli, () => {
    ensureFile(logPath, SEED5);
    const res = appendWithId(
      logPath,
      (doc) => entriesOf(doc).map((r) => field(r, "id")),
      "L",
      (doc, newId) => appendEntry(doc, logEntry(f, newId, ctx.today)),
      opts
    );
    warnReseal(cli, res.resealWarning);
    if (f.task !== "") {
      const back = writeJson(
        join30(ctx.gov, "tasks.json"),
        (doc) => mapEntries(doc, (row) => {
          if (field(row, "id") !== f.task) return row;
          const o = row;
          return { ...o, log_entries: [...asArray(field(row, "log_entries")) ?? [], res.id] };
        }),
        opts
      );
      warnReseal(cli, back.resealWarning);
    }
    return res.id;
  });
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, id);
}
var MODULE10 = {
  verbs: () => VERBS_TSV10,
  usage: () => USAGE8,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "new":
        return logNew(cli, nounContext(ctx), ctx.io, args);
      case "show":
        return logShow(cli, nounContext(ctx), args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun log \u2014 verbs: new, show. See: scrumux help log`
        );
    }
  }
};

// src/nouns/memory.ts
import { existsSync as existsSync12, mkdirSync as mkdirSync6, readFileSync as readFileSync23, statSync as statSync10, writeFileSync as writeFileSync8 } from "node:fs";
import { join as join31 } from "node:path";
var VERBS_TSV11 = "add	the only verb\n";
var USAGE9 = NOUN_USAGE["memory"] ?? "";
var MEMORY_HEADER = `# validator-memory.md \u2014 issue-validator's durable memory

Append-only prose. The issue-validator agent reads this before every
run and its \`memory-append:\` blocks land here verbatim (appended by the
orchestrating session \u2014 the agent itself is read-only). Not a journal:
no schema, no ids \u2014 codebase facts, issue fingerprints, and dead ends
that make the next validation run faster. Memory says where to look;
evidence says what is true.
`;
function parseMemoryFlags(args, die) {
  const f = { file: "", by: "" };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`memory: ${flag} needs a value \u2014 see: scrumux help memory`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--file":
        f.file = value(a);
        break;
      case "--by":
        f.by = value(a);
        break;
      default:
        die(`memory: unknown flag ${a} \u2014 see: scrumux help memory`);
    }
  }
  return f;
}
function stripTrailingNewlines2(s2) {
  return s2.replace(/\n+$/, "");
}
function blockLineCount(block) {
  let n = 1;
  for (const ch of block) if (ch === "\n") n += 1;
  return n;
}
var readStdin = () => {
  try {
    return readFileSync23(0, "utf8");
  } catch {
    return "";
  }
};
function memoryAdd(cli, ctx, args, stdin) {
  const f = parseMemoryFlags(args, (m) => cli.die(m));
  if (f.by === "") {
    cli.die("memory: --by is required (who produced this block \u2014 the agent name, so a reader can tell whose memory this is)");
  }
  let block;
  if (f.file !== "") {
    if (!isFile(f.file)) cli.die(`memory: --file ${f.file} does not exist`);
    try {
      block = stripTrailingNewlines2(readFileSync23(f.file, "utf8"));
    } catch {
      block = "";
    }
  } else {
    block = stripTrailingNewlines2(stdin());
  }
  if (block === "") {
    cli.die("memory: the block is empty \u2014 refusing to append a heading with nothing under it (an empty run is not a run)");
  }
  const mem = join31(ctx.gov, "validator-memory.md");
  let created = false;
  refusing(cli, () => {
    if (!isFile(mem)) {
      try {
        mkdirSync6(ctx.gov, { recursive: true });
      } catch {
        throw new JournalRefusal(`memory: cannot create ${ctx.gov}`);
      }
      try {
        writeFileSync8(mem, MEMORY_HEADER);
      } catch {
        throw new JournalRefusal(`memory: cannot create ${mem}`);
      }
      created = true;
    }
  });
  if (!isNonEmptyFile(mem)) {
    cli.die(`memory: ${mem} is empty \u2014 it exists and has lost its header, so this refuses rather than writing a new one over whatever was there. Restore it from git, or delete it and re-run: scrumux memory add creates a fresh one when the file is ABSENT`);
  }
  const heading = `## Run ${ctx.today} \u2014 ${f.by}`;
  refusing(cli, () => {
    try {
      writeFileSync8(mem, `
${heading}

${block}
`, { flag: "a" });
    } catch {
      throw new JournalRefusal(`memory: cannot append to ${mem}`);
    }
  });
  const n = blockLineCount(block);
  return cli.emit(created ? `created validator-memory.md and appended ${n} line(s) under '${heading}'` : `appended ${n} line(s) to validator-memory.md under '${heading}'`);
}
function isNonEmptyFile(p) {
  if (!existsSync12(p)) return false;
  try {
    return statSync10(p).size > 0;
  } catch {
    return false;
  }
}
var MODULE11 = {
  verbs: () => VERBS_TSV11,
  usage: () => USAGE9,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "add":
        return memoryAdd(cli, nounContext(ctx), args, readStdin);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun memory \u2014 the only verb is 'add'. See: scrumux help memory`
        );
    }
  }
};

// src/nouns/rank.ts
import { existsSync as existsSync13, readFileSync as readFileSync24 } from "node:fs";
import { join as join32 } from "node:path";
var VERBS_TSV12 = `set	move a backlog item to a position
clear	return an item to never-prioritised
`;
function rows2(path) {
  if (!existsSync13(path)) return [];
  try {
    const doc = parsePreservingNumbers(readFileSync24(path, "utf8"));
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
    const e = doc["entries"];
    return Array.isArray(e) ? e : [];
  } catch {
    return [];
  }
}
function obj3(v) {
  if (v === null || v === void 0 || typeof v !== "object" || Array.isArray(v)) return null;
  return v;
}
function idList(list) {
  const out = [];
  for (const row of list) {
    const o = obj3(row);
    const v = o === null ? void 0 : o["id"];
    out.push(v === void 0 || v === null ? "null" : typeof v === "string" ? v : String(v));
  }
  return out.filter((s2) => s2 !== "");
}
function insertAt(list, pos, id) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (i + 1 === pos) out.push(id);
    out.push(list[i]);
  }
  if (list.length < pos) out.push(id);
  return out;
}
function delRank(row) {
  const { rank: _drop, ...rest } = row;
  return rest;
}
function reRank(row, order) {
  const id = row["id"];
  if (typeof id !== "string") return row;
  const i = order.indexOf(id);
  return i < 0 ? row : { ...row, rank: i + 1 };
}
function densifyFeatures(doc, order, clearRef) {
  return mapEntries(doc, (row) => {
    if (row["kind"] !== "feature") return row;
    if (clearRef !== null && row["id"] === clearRef) return delRank(row);
    return reRank(row, order);
  });
}
function densifyTasks(doc, order, clearId) {
  return mapEntries(doc, (row) => {
    if (clearId !== null && row["id"] === clearId) return delRank(row);
    if (row["status"] === "accepted") return row;
    return reRank(row, order);
  });
}
function rankImpl(cli, ctx, ictx, ref, newposRaw, clear) {
  let newpos = 0;
  if (clear) {
    if (ref === "") {
      cli.die("usage: scrumux rank set <#|T-0001> --clear \u2014 current numbering: .claude/scripts/scrumux backlog tasks");
    }
  } else {
    if (ref === "" || newposRaw === "") {
      cli.die(
        "usage: scrumux rank set <#|T-0001> <new-#|--clear> \u2014 current numbering: .claude/scripts/scrumux backlog tasks"
      );
    }
    if (!/^[0-9]+$/.test(newposRaw)) {
      cli.die("scrumux rank: new-# must be a positive integer, or --clear to remove the rank");
    }
    newpos = Number(newposRaw);
    if (newpos < 1) cli.die("scrumux rank: new-# must be >= 1");
  }
  if (ref.startsWith("F-")) {
    const design = join32(ctx.gov, "design.json");
    if (!existsSync13(design)) cli.die("scrumux rank: no design.json yet \u2014 nothing to rank");
    const isFeature = (r) => {
      const o = obj3(r);
      return o !== null && o["kind"] === "feature" ? o["id"] : void 0;
    };
    if (!refExists(design, ref, isFeature)) {
      cli.die(
        `scrumux rank: feature ${ref} not found in design.json \u2014 list them: .claude/scripts/scrumux backlog tasks --features`
      );
    }
    const ranked3 = rows2(design).filter((r) => {
      const o = obj3(r);
      return o !== null && o["kind"] === "feature" && o["rank"] !== void 0 && o["rank"] !== null;
    });
    const forder = idList(sortBy(ranked3, (r) => obj3(r)?.["rank"] ?? null));
    const fcount = forder.length;
    let fnew;
    if (clear) {
      if (!forder.includes(ref)) {
        cli.die(
          `scrumux rank: ${ref} has no rank to clear \u2014 it is already unprioritised: .claude/scripts/scrumux backlog tasks --features`
        );
      }
      fnew = forder.filter((x) => x !== ref);
    } else {
      let fmax = forder.includes(ref) ? fcount : fcount + 1;
      if (fmax < 1) fmax = 1;
      if (newpos > fmax) newpos = fmax;
      fnew = insertAt(forder.filter((x) => x !== ref), newpos, ref);
    }
    guardedWrite(cli, ctx, ictx.io, design, (doc) => densifyFeatures(doc, fnew, clear ? ref : null));
    sealBootstrap(ctx.gov, ctx.today);
    return cli.emit(clear ? `${ref} -> rank cleared` : `${ref} -> rank ${newpos}`);
  }
  const tasks = join32(ctx.gov, "tasks.json");
  if (!existsSync13(tasks)) cli.die("scrumux rank: no tasks.json yet \u2014 nothing to rank");
  const all = rows2(tasks);
  const open = all.filter((r) => {
    const o = obj3(r);
    return o !== null && o["status"] !== "accepted";
  });
  const ranked2 = open.filter((r) => {
    const o = obj3(r);
    return o["rank"] !== void 0 && o["rank"] !== null;
  });
  const order = idList(sortBy(ranked2, (r) => obj3(r)?.["rank"] ?? null));
  const count = order.length;
  const openIds = idList(open);
  if (openIds.length === 0) cli.die("scrumux rank: no open tasks to rank");
  let tid;
  if (ref.startsWith("T-")) {
    tid = ref;
    if (!openIds.includes(tid)) {
      cli.die(`scrumux rank: ${tid} is not an open task \u2014 see the list: .claude/scripts/scrumux backlog tasks`);
    }
  } else if (!/^[0-9]+$/.test(ref)) {
    cli.die("scrumux rank: first arg must be a list # or a task id (T-0001)");
  } else {
    const n = Number(ref);
    if (!(n >= 1 && n <= count)) {
      cli.die(
        `scrumux rank: # ${ref} is out of range 1..${count} \u2014 see the list: .claude/scripts/scrumux backlog tasks`
      );
    }
    tid = order[n - 1];
  }
  if (clear) {
    if (!order.includes(tid)) {
      cli.die(
        `scrumux rank: ${tid} has no rank to clear \u2014 it is already unprioritised: .claude/scripts/scrumux backlog tasks`
      );
    }
    const neworder2 = order.filter((x) => x !== tid);
    guardedWrite(cli, ctx, ictx.io, tasks, (doc) => densifyTasks(doc, neworder2, tid));
    sealBootstrap(ctx.gov, ctx.today);
    return cli.emit(`${tid} -> rank cleared`);
  }
  let maxpos = order.includes(tid) ? count : count + 1;
  if (maxpos < 1) maxpos = 1;
  if (newpos > maxpos) newpos = maxpos;
  const neworder = insertAt(order.filter((x) => x !== tid), newpos, tid);
  guardedWrite(cli, ctx, ictx.io, tasks, (doc) => densifyTasks(doc, neworder, null));
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${tid} -> rank ${newpos}`);
}
var MODULE12 = {
  verbs: () => VERBS_TSV12,
  usage: () => NOUN_USAGE["rank"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "set":
        if (args.length !== 2) {
          return cli.dieUsage(
            "rank set takes <#|T-0001|F-0001> <new-#> \u2014 current numbering: scrumux backlog tasks"
          );
        }
        return rankImpl(cli, ctx, ictx, args[0], args[1], false);
      case "clear":
        if (args.length !== 1) return cli.dieUsage("rank clear takes one <#|T-0001|F-0001>");
        return rankImpl(cli, ctx, ictx, args[0], "", true);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun rank \u2014 verbs: set, clear. See: scrumux help rank`
        );
    }
  }
};

// src/nouns/records.ts
import { existsSync as existsSync14, readFileSync as readFileSync25, readdirSync as readdirSync4 } from "node:fs";
import { join as join33 } from "node:path";
var VERBS_TSV13 = "check	validate the journals, refs, rule chains, rosters and seals\n";
var USAGE10 = `scrumux records \u2014 the repo validator.

  scrumux records check                    the governance sweep (default)
  scrumux records check --structure        the same, named explicitly
  scrumux records check --standards [dir]  the mechanical D-0012 corpus rules
  scrumux records check --all              both, structure first
  scrumux records check --unsupported      the JSON Schema keywords the
                                           schemas declare and this reader
                                           does not enforce

Exit 0 clean, 1 with one instructive line per finding, 2 if it could not
run. WARNings never affect the exit code.

--standards is silent where no matching code exists, so language-agnostic
and non-code trees stay clean. A repo's own standards live in
.claude/rules/project-standards.md, and anything mechanical about them is
registered with \`scrumux health add\`. That is the one extension pathway
for this layer.

There is no --porcelain. --json carries every finding as a row with its
own tier, name and fix; a second machine format for one finding set is
the drift this validator exists to catch.
`;
var USAGE_LINE = "usage: scrumux records check [--structure|--standards|--all|--unsupported] [dir] \u2014 no mode flag means --structure; dir applies to --standards only";
var EM = " \u2014 ";
function splitName(msg) {
  const i = msg.indexOf(EM);
  return i < 0 ? msg : msg.slice(0, i);
}
function splitFix(msg) {
  const i = msg.indexOf(EM);
  return i < 0 ? "run scrumux records check for the full finding and follow its line" : msg.slice(i + EM.length);
}
function rosterSection(text2, want) {
  const lines = text2.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  let inside2 = false;
  let found = false;
  const out = [];
  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (inside2) break;
      const head = line.slice(3);
      if (head.toLowerCase().startsWith(want.toLowerCase())) {
        inside2 = true;
        found = true;
      }
      continue;
    }
    if (inside2) out.push(line);
  }
  return found ? out : null;
}
function rosterNames(lines, name) {
  const esc = name.replace(/[.[\\*^$()+?{}|\]]/g, "\\$&");
  const re = new RegExp(`(^|[^A-Za-z0-9_.-])${esc}([^A-Za-z0-9_.-]|$)`);
  return lines.some((l) => re.test(l));
}
function ruleFrontmatter(text2) {
  const lines = text2.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  const picked = [];
  let inRange = false;
  for (const l of lines) {
    if (l === "---") {
      picked.push(l);
      inRange = !inRange;
      continue;
    }
    if (inRange) picked.push(l);
  }
  if (picked.length <= 2) return [];
  return picked.slice(1, picked.length - 1);
}
function frontmatterList(fm, key) {
  const out = [];
  const re = new RegExp(`^${key}: *\\[(.*)\\]`);
  for (const l of fm) {
    const m = re.exec(l);
    if (m === null) continue;
    for (const part of m[1].split(",")) {
      const cleaned = part.replace(/[ "]/g, "");
      if (cleaned !== "") out.push(cleaned);
    }
  }
  return out;
}
function loadJournal2(path) {
  if (!existsSync14(path) || !isFile(path)) return { path, doc: null, broken: false };
  try {
    return { path, doc: parsePreservingNumbers(readFileSync25(path, "utf8")), broken: false };
  } catch {
    return { path, doc: null, broken: true };
  }
}
function ents(j) {
  return j.doc === null ? [] : entriesOf(j.doc);
}
function idsOf(entries) {
  const s2 = /* @__PURE__ */ new Set();
  for (const e of entries) {
    const id = field(e, "id");
    if (typeof id === "string") s2.add(id);
  }
  return s2;
}
function designView(doc) {
  const entries = doc === null ? [] : entriesOf(doc);
  const of = (kind) => entries.filter((e) => field(e, "kind") === kind);
  return {
    epics: of("epic"),
    features: of("feature"),
    stories: of("story"),
    surfaces: of("surface"),
    controls: of("control"),
    wireframe_refs: of("wireframe_ref")
  };
}
function recordsCheck(cli, ctx, argv) {
  let mode = "structure";
  let scan = "";
  let unsupported = false;
  for (const a of argv) {
    if (a === "--structure") mode = "structure";
    else if (a === "--standards") mode = "standards";
    else if (a === "--all") mode = "all";
    else if (a === "--unsupported") unsupported = true;
    else if (a.startsWith("-")) cli.dieUsage(`unknown flag '${a}' \u2014 ${USAGE_LINE}`);
    else {
      if (scan !== "") cli.dieUsage(`more than one directory given ('${scan}' and '${a}') \u2014 ${USAGE_LINE}`);
      scan = a;
    }
  }
  if (scan === "") scan = ctx.root;
  if (!isDir(scan)) cli.die(`no such directory '${scan}' \u2014 ${USAGE_LINE}`);
  if (unsupported) {
    const rows5 = unsupportedReport(ctx.codeRoot);
    for (const line of rows5) cli.say(line);
    cli.data({ unsupported: rows5 });
    return cli.emit(
      rows5.length === 0 ? "records check --unsupported: every keyword the schemas declare is enforced by this reader." : `records check --unsupported: ${rows5.length} declared keyword(s) this reader does not enforce.`
    );
  }
  const f = (msg) => {
    cli.fail(splitName(msg), splitFix(msg));
  };
  const w = (msg) => {
    cli.warn(splitName(msg), splitFix(msg));
  };
  const human = (s2) => {
    cli.say(s2);
  };
  const gov = ctx.gov;
  const root = ctx.root;
  const hd = ctx.harnessDir;
  const sweepStructure = () => {
    human(`=== VALIDATE \u2014 structure (${ctx.today}) ===`);
    for (const name of govJsonFiles(gov)) {
      const p = join33(gov, name);
      const j = loadJournal2(p);
      if (j.broken) {
        f(`${p} is not valid JSON \u2014 restore from git (git checkout -- ${p}) or repair by hand, then re-run`);
        continue;
      }
      const o = asObject(j.doc);
      const raw = o !== null && Object.prototype.hasOwnProperty.call(o, "entries") ? (asArray(o["entries"]) ?? []).map((e) => field(e, "id")) : [];
      const sorted = [...raw].sort(cmp);
      const dups = [];
      for (let i = 0; i < sorted.length; ) {
        let k2 = i + 1;
        while (k2 < sorted.length && cmp(sorted[i], sorted[k2]) === 0) k2 += 1;
        if (k2 - i > 1) dups.push(sorted[i] === null ? "" : interp(sorted[i]));
        i = k2;
      }
      const dupText = dups.join(", ");
      if (dupText !== "") {
        f(`${p} has duplicate ids: ${dupText} \u2014 ids are allocated by scrumux; hand-edits must not reuse them`);
      }
    }
    const tasksJ = loadJournal2(join33(gov, "tasks.json"));
    const designJ = loadJournal2(join33(gov, "design.json"));
    const decJ = loadJournal2(join33(gov, "decisions.json"));
    const issJ = loadJournal2(join33(gov, "issues.json"));
    const logJ = loadJournal2(join33(gov, "log.json"));
    const sprJ = loadJournal2(join33(gov, "sprints.json"));
    const healthJ = loadJournal2(join33(gov, "repo-health.json"));
    const des = designView(designJ.doc);
    const featureIds = idsOf(des["features"]);
    const storyIds = idsOf(des["stories"]);
    const surfaceIds = idsOf(des["surfaces"]);
    const epicIds = idsOf(des["epics"]);
    const decIds = idsOf(ents(decJ));
    const issIds = idsOf(ents(issJ));
    const logIds = idsOf(ents(logJ));
    const taskIds = idsOf(ents(tasksJ));
    const sweep2 = (j, produce) => {
      if (j.doc === null && !j.broken) return;
      if (j.broken) {
        f(`validator internal: jq failed on ${j.path}: could not parse \u2014 records-check itself needs fixing; do not trust this run`);
        return;
      }
      for (const line of produce()) if (line !== "") f(line);
    };
    sweep2(tasksJ, () => {
      const out = [];
      for (const e of ents(tasksJ)) {
        const id = strOr(field(e, "id"));
        const idShown = field(e, "id") === null ? "<no id>" : interp(field(e, "id"));
        if (!/^T-[0-9]{4}$/.test(id)) out.push(`tasks: ${idShown} bad id pattern (want T-NNNN)`);
        if (strOr(field(e, "title")) === "") out.push(`tasks: ${interp(field(e, "id"))} missing title`);
        if (strOr(field(e, "acceptance_check")) === "") {
          out.push(`tasks: ${interp(field(e, "id"))} missing acceptance_check \u2014 stated before work starts (CLAUDE.MD)`);
        }
        const accepted2 = alt(field(e, "acceptance", "accepted"), false) === true;
        const status = strOr(field(e, "status"));
        if (accepted2 && status !== "accepted" && status !== "superseded") {
          out.push(
            `tasks: ${interp(field(e, "id"))} carries acceptance.accepted=true but status is ${interp(field(e, "status"))} \u2014 a task cannot be both accepted and not; reverse an acceptance with scrumux reject, which records who and why`
          );
        }
        const feature = field(e, "feature");
        if (feature !== null && !featureIds.has(interp(feature))) {
          out.push(`tasks: ${interp(field(e, "id"))} feature ${interp(feature)} unresolved in design.json`);
        }
        const story = field(e, "story");
        if (story !== null && !storyIds.has(interp(story))) {
          out.push(`tasks: ${interp(field(e, "id"))} story ${interp(story)} unresolved in design.json`);
        }
        for (const d of asArray(alt(field(e, "decisions"), [])) ?? []) {
          if (!decIds.has(interp(d))) out.push(`tasks: ${interp(field(e, "id"))} decision ref ${interp(d)} unresolved`);
        }
        for (const i of asArray(alt(field(e, "issues"), [])) ?? []) {
          if (!issIds.has(interp(i))) out.push(`tasks: ${interp(field(e, "id"))} issue ref ${interp(i)} unresolved`);
        }
        for (const l of asArray(alt(field(e, "log_entries"), [])) ?? []) {
          if (!logIds.has(interp(l))) out.push(`tasks: ${interp(field(e, "id"))} log ref ${interp(l)} unresolved`);
        }
        const order = field(e, "task_order");
        if (order !== null) {
          if (strOr(field(order, "scope")) === "" || strOr(field(order, "verification_command")) === "") {
            out.push(
              `tasks: ${interp(field(e, "id"))} task_order missing scope or verification_command (D-0005) \u2014 scrumux task order ${interp(field(e, "id"))} ...`
            );
          }
          for (const tf of asArray(field(order, "context", "files")) ?? []) {
            if (strOr(field(tf, "path")) === "" || strOr(field(tf, "why")) === "") {
              out.push(`tasks: ${interp(field(e, "id"))} task_order context file missing path or why (D-0005)`);
            }
          }
        }
        const acc = field(e, "acceptance");
        if (status === "accepted" && (acc === null || field(acc, "accepted") !== true)) {
          out.push(
            `tasks: ${interp(field(e, "id"))} accepted with no recorded acceptance \u2014 acceptance lives on the task (D-0076); scrumux task accept ${interp(field(e, "id"))} --by WHO --authority direct|app:<session>|standing:D-XXXX`
          );
        }
        if (acc !== null && field(acc, "accepted") === true && strOr(field(acc, "by")).length === 0) {
          out.push(
            `tasks: ${interp(field(e, "id"))} is accepted but names nobody \u2014 an acceptance with no actor cannot be audited; repair it with the real actor (scrumux repair journal tasks.json --apply ... --why ... --by WHO)`
          );
        }
      }
      return out;
    });
    {
      const sps = ents(sprJ);
      const home = (id) => {
        for (const s2 of sps) {
          if (field(s2, "status") !== "ratified") continue;
          const list = asArray(alt(field(s2, "tasks"), [])) ?? [];
          if (list.some((t) => interp(t) === id)) return interp(field(s2, "id"));
        }
        return "";
      };
      const ip = ents(tasksJ).filter((e) => field(e, "status") === "in_progress").map((e) => ({ id: interp(field(e, "id")), home: home(interp(field(e, "id"))) }));
      const homes = [...new Set(ip.map((x) => x.home))].sort(cmpString);
      const adm = [];
      if (homes.length > 1) {
        adm.push(
          "tasks: work is in_progress across more than one sprint (" + ip.map((x) => `${x.id} in ${x.home === "" ? "no ratified sprint" : x.home}`).join(", ") + ") \u2014 one sprint at a time (D-0084); scrumux task status <id> in_review|blocked"
        );
      }
      for (const h of homes) {
        const g = ip.filter((x) => x.home === h);
        let cap2 = 1;
        if (h !== "") {
          const s2 = sps.find((x) => interp(field(x, "id")) === h);
          const p = s2 === void 0 ? null : alt(field(s2, "parallel"), 1);
          cap2 = p === null ? 1 : Number(interp(p));
        }
        if (!(g.length > cap2)) continue;
        if (h === "") {
          adm.push(
            `tasks: ${g.length} tasks in_progress outside any ratified sprint (${g.map((x) => x.id).join(", ")}) \u2014 one at a time there (D-0084); scrumux task status <id> in_review|blocked`
          );
        } else {
          adm.push(
            `tasks: ${g.length} tasks in_progress in ${h}, which declared ${cap2} (${g.map((x) => x.id).join(", ")}) \u2014 over the cap its plan was ratified with (D-0084); scrumux task status <id> in_review|blocked`
          );
        }
      }
      for (const line of adm) if (line !== "") f(line);
    }
    sweep2(issJ, () => {
      const out = [];
      const TYPES2 = ["drift", "defect", "idea", "governance", "harness"];
      for (const e of ents(issJ)) {
        const id = strOr(field(e, "id"));
        const idShown = field(e, "id") === null ? "<no id>" : interp(field(e, "id"));
        if (!/^I-[0-9]{4}$/.test(id)) out.push(`issues: ${idShown} bad id pattern`);
        if (!TYPES2.includes(interp(field(e, "type")))) {
          out.push(`issues: ${interp(field(e, "id"))} invalid type ${interp(field(e, "type"))}`);
        }
        if (strOr(field(e, "summary")) === "") out.push(`issues: ${interp(field(e, "id"))} missing summary`);
        if (strOr(field(e, "resolution_pointer")) === "") {
          out.push(
            `issues: ${interp(field(e, "id"))} missing resolution_pointer \u2014 issues must point to the fix (CLAUDE.MD architecture)`
          );
        }
        const ref = field(e, "refs", "task");
        if (ref !== null && !taskIds.has(interp(ref))) {
          out.push(`issues: ${interp(field(e, "id"))} task ref ${interp(ref)} unresolved`);
        }
      }
      return out;
    });
    sweep2(decJ, () => {
      const out = [];
      for (const e of ents(decJ)) {
        const id = strOr(field(e, "id"));
        const idShown = field(e, "id") === null ? "<no id>" : interp(field(e, "id"));
        if (!/^D-[0-9]{4}$/.test(id)) out.push(`decisions: ${idShown} bad id pattern`);
        const st = standingOf(e);
        const whoKey = st.status === "ratified" ? "ratified_by" : st.status === "proposed" ? "recorded_by" : "rejected_by";
        if (strOr(field(e, "decision")) === "" || strOr(field(e, "rationale")) === "" || strOr(field(e, whoKey)) === "") {
          out.push(
            `decisions: ${interp(field(e, "id"))} missing decision, rationale, or ${whoKey} \u2014 precedent needs all three`
          );
        }
        const sup = field(e, "supersedes");
        if (sup !== null && !decIds.has(interp(sup))) {
          out.push(`decisions: ${interp(field(e, "id"))} supersedes ${interp(sup)} which does not exist`);
        }
      }
      return out;
    });
    sweep2(logJ, () => {
      const out = [];
      for (const e of ents(logJ)) {
        const id = strOr(field(e, "id"));
        const idShown = field(e, "id") === null ? "<no id>" : interp(field(e, "id"));
        if (!/^L-[0-9]{4}$/.test(id)) out.push(`log: ${idShown} bad id pattern`);
        if (strOr(field(e, "what_was_done")) === "" || strOr(field(e, "actor")) === "") {
          out.push(`log: ${interp(field(e, "id"))} missing what_was_done or actor`);
        }
        const t = field(e, "task");
        if (t !== null && !taskIds.has(interp(t))) {
          out.push(`log: ${interp(field(e, "id"))} task ref ${interp(t)} unresolved`);
        }
      }
      return out;
    });
    sweep2(sprJ, () => {
      const out = [];
      const STATUSES5 = ["proposed", "ratified", "complete", "abandoned"];
      const orderedTasks = ents(tasksJ);
      for (const e of ents(sprJ)) {
        const id = strOr(field(e, "id"));
        const idShown = field(e, "id") === null ? "<no id>" : interp(field(e, "id"));
        if (!/^SP-[0-9]{4}$/.test(id)) out.push(`sprints: ${idShown} bad id pattern`);
        if (!STATUSES5.includes(interp(field(e, "status")))) {
          out.push(`sprints: ${interp(field(e, "id"))} invalid status ${interp(field(e, "status"))}`);
        }
        const hotfix = field(e, "hotfix");
        const epic = field(e, "epic");
        if (hotfix !== true && epic === null) {
          out.push(`sprints: ${interp(field(e, "id"))} non-hotfix sprint without epic (D-0004)`);
        }
        if (hotfix === true && field(e, "source_issue") === null) {
          out.push(`sprints: ${interp(field(e, "id"))} hotfix sprint without source_issue (D-0004)`);
        }
        if (epic !== null && !epicIds.has(interp(epic))) {
          out.push(`sprints: ${interp(field(e, "id"))} epic ${interp(epic)} unresolved`);
        }
        const ratified = field(e, "ratified");
        if (field(e, "status") === "ratified" && ratified === null) {
          out.push(
            `sprints: ${interp(field(e, "id"))} ratified without ratification record (D-0004); restore .ratified or set status back`
          );
        }
        if (field(e, "status") === "ratified" && ratified !== null && strOr(field(ratified, "by")).length === 0) {
          out.push(
            `sprints: ${interp(field(e, "id"))} is ratified but names nobody \u2014 a ratification with no actor cannot be audited`
          );
        }
        const list = asArray(field(e, "tasks")) ?? [];
        for (const t of list) {
          if (!taskIds.has(interp(t))) out.push(`sprints: ${interp(field(e, "id"))} task ${interp(t)} unresolved`);
        }
        for (const t of list) {
          const hit = orderedTasks.some((x) => interp(field(x, "id")) === interp(t) && field(x, "task_order") === null);
          if (hit) out.push(`sprints: ${interp(field(e, "id"))} task ${interp(t)} has no task_order \u2014 orders are the sprint entry gate (D-0005)`);
        }
      }
      return out;
    });
    sweep2(designJ, () => {
      const out = [];
      const entries = ents(designJ);
      for (const e of entries) {
        if (field(e, "kind") !== "epic") continue;
        for (const fid of asArray(alt(field(e, "features"), [])) ?? []) {
          if (!featureIds.has(interp(fid))) out.push(`design: epic ${interp(field(e, "id"))} feature ref ${interp(fid)} unresolved`);
        }
      }
      for (const e of entries) {
        if (field(e, "kind") !== "feature") continue;
        for (const sid of asArray(alt(field(e, "stories"), [])) ?? []) {
          if (!storyIds.has(interp(sid))) out.push(`design: feature ${interp(field(e, "id"))} story ref ${interp(sid)} unresolved`);
        }
      }
      for (const e of entries) {
        if (field(e, "kind") !== "feature") continue;
        for (const d of asArray(alt(field(e, "dependencies"), [])) ?? []) {
          if (!featureIds.has(interp(d))) out.push(`design: feature ${interp(field(e, "id"))} dependency ${interp(d)} unresolved`);
        }
      }
      for (const e of entries) {
        if (field(e, "kind") !== "story") continue;
        if (!featureIds.has(interp(field(e, "feature")))) {
          out.push(`design: story ${interp(field(e, "id"))} feature ${interp(field(e, "feature"))} unresolved`);
        }
      }
      for (const e of entries) {
        if (field(e, "kind") !== "story") continue;
        if ((asArray(alt(field(e, "acceptance_criteria"), [])) ?? []).length === 0) {
          out.push(`design: story ${interp(field(e, "id"))} has no acceptance criteria`);
        }
      }
      for (const e of entries) {
        if (field(e, "kind") !== "control") continue;
        if (!surfaceIds.has(interp(field(e, "surface")))) {
          out.push(`design: control ${interp(field(e, "id"))} surface ${interp(field(e, "surface"))} unresolved`);
        }
      }
      return out;
    });
    for (const r of globFiles(join33(root, hd, "rules"), (n2) => n2.endsWith(".md"))) {
      const rb = r.split("/").pop();
      let text2;
      try {
        text2 = readFileSync25(r, "utf8");
      } catch {
        continue;
      }
      const fm = ruleFrontmatter(text2);
      if (fm.length === 0) {
        f(`rules: ${rb} has no frontmatter \u2014 required per rule-frontmatter.schema.json (name, paths at minimum)`);
        continue;
      }
      if (!fm.some((l) => l.startsWith("name:"))) f(`rules: ${rb} frontmatter missing name`);
      if (!fm.some((l) => l.startsWith("paths:"))) f(`rules: ${rb} frontmatter missing paths`);
      for (const s2 of frontmatterList(fm, "skills")) {
        if (!isFile(join33(root, hd, "skills", s2, "SKILL.md"))) {
          w(`rules: ${rb} points to skill '${s2}' not in this repo's ${hd}/skills \u2014 fine if user-level; if not, it is drift`);
        }
      }
      for (const s2 of frontmatterList(fm, "scripts")) {
        if (!isFile(join33(root, s2))) {
          f(`rules: ${rb} points to script ${s2} which does not exist \u2014 fix the pointer or restore the script`);
        }
      }
      for (const s2 of frontmatterList(fm, "hooks")) {
        if (!isFile(join33(root, s2))) {
          f(`rules: ${rb} points to hook ${s2} which does not exist \u2014 fix the pointer or restore the hook`);
        }
      }
    }
    sweep2(healthJ, () => {
      const out = [];
      for (const c of ents(healthJ)) {
        if (strOr(field(c, "name")) === "" || strOr(field(c, "command")) === "") {
          out.push("repo-health: check missing name or command \u2014 scrumux health writes both; fix the entry");
        }
      }
      return out;
    });
    if (healthJ.doc !== null) {
      for (const c of ents(healthJ)) {
        const name = strOr(field(c, "name"));
        const cmd = strOr(field(c, "command"));
        if (name === "" || cmd === "") continue;
        let tok = cmd.split(" ")[0] ?? "";
        if (tok === "sh" || tok === "bash") {
          const rest = cmd.slice(cmd.indexOf(" ") + 1);
          tok = rest.split(" ")[0] ?? "";
        }
        if (!tok.includes("/")) continue;
        const p = tok.startsWith("/") ? tok : join33(root, tok);
        if (!existsSync14(p)) {
          f(
            `repo-health: check '${name}' runs '${cmd}' but ${tok} is not on disk \u2014 de-register the check (scrumux repair journal repo-health.json) or restore the file`
          );
        }
      }
    }
    const spec = join33(root, "PROJECT_SPEC.MD");
    const skidx = join33(root, "SKILLS_INDEX.MD");
    if (isFile(spec)) {
      const specText = readFileSync25(spec, "utf8");
      const rosters = {};
      for (const sec of ["Agents", "Skills", "Rules"]) {
        const got = rosterSection(specText, sec);
        if (got === null) {
          f(
            `roster section missing: PROJECT_SPEC.MD has no '## ${sec}' section, so the ${sec} roster cannot be checked against disk \u2014 nothing below is known to be documented`
          );
          rosters[sec] = [];
        } else {
          rosters[sec] = got;
        }
      }
      const scripts = rosterSection(specText, "Deterministic scripts");
      if (scripts === null) {
        f(
          "roster section missing: PROJECT_SPEC.MD has no '## Deterministic scripts' section, so the script roster cannot be checked against disk"
        );
        rosters["Scripts"] = [];
      } else {
        rosters["Scripts"] = scripts;
      }
      const idxLines = isFile(skidx) ? readFileSync25(skidx, "utf8").split("\n") : null;
      for (const a of globFiles(join33(root, hd, "agents"), (n2) => n2.endsWith(".md"))) {
        const ab = basenameNoExt(a, ".md");
        if (!rosterNames(rosters["Agents"], ab)) {
          f(
            `agents roster drift: ${ab} exists in ${hd}/agents/ but PROJECT_SPEC.MD's roster does not name it \u2014 add it to the Agents roster`
          );
        }
      }
      for (const s2 of globDirs(join33(root, hd, "skills"))) {
        const sb = s2.split("/").pop();
        if (!rosterNames(rosters["Skills"], sb)) {
          f(
            `skills roster drift: ${sb} exists in ${hd}/skills/ but PROJECT_SPEC.MD does not name it \u2014 add it to the Skills roster`
          );
        }
        if (idxLines !== null && !rosterNames(idxLines, sb)) {
          f(`skills index drift: ${sb} exists in ${hd}/skills/ but SKILLS_INDEX.MD does not list it \u2014 add its row`);
        }
      }
      for (const r of globFiles(join33(root, hd, "rules"), (n2) => n2.endsWith(".md"))) {
        const rb = basenameNoExt(r, ".md");
        if (!rosterNames(rosters["Rules"], rb)) {
          f(
            `rules roster drift: ${rb} exists in ${hd}/rules/ but PROJECT_SPEC.MD's roster does not name it \u2014 add it to the Rules roster`
          );
        }
      }
      for (const sc of globFiles(join33(root, hd, "scripts"), () => true)) {
        const scb = sc.split("/").pop();
        if (scb.startsWith(".")) continue;
        if (!rosterNames(rosters["Scripts"], scb)) {
          f(
            `scripts roster drift: ${scb} exists in ${hd}/scripts/ but PROJECT_SPEC.MD's Deterministic scripts section does not name it \u2014 add it there`
          );
        }
        if (idxLines !== null && !rosterNames(idxLines, scb)) {
          f(`scripts index drift: ${scb} exists in ${hd}/scripts/ but SKILLS_INDEX.MD does not list it \u2014 add its row`);
        }
      }
    }
    schemaSweep(ctx, f, w);
    const shape = sealsShapeProblem(gov);
    if (shape !== "") {
      f(
        `${shape} \u2014 restore it from git, or rebuild it with a gov write after checking the journals by hand. Until then this check is not speaking for any journal (T-0100/I-0047)`
      );
    }
    const sealsPath = join33(gov, SEAL_FILE_NAME);
    const sealsDoc = loadJournal2(sealsPath);
    const over = sealsDoc.doc === null ? null : field(sealsDoc.doc, "bootstrapped_over_existing_content");
    if (over !== null && truthy(over) && interp(over) !== "") {
      w(
        `seals were created on ${interp(over)} over journals that ALREADY had entries \u2014 anything changed before that date was made the trusted baseline and cannot be detected now. Expected in a repo that predates sealing; if seals.json was deleted and rebuilt, that is the hole this records (T-0100/I-0047)`
      );
    }
    if (isFile(sealsPath)) {
      let unsealed = "";
      const map = sealsDoc.doc === null ? null : asObject(field(sealsDoc.doc, "journals"));
      for (const sj of SEALED_JOURNALS) {
        if (!isFile(join33(gov, sj))) continue;
        if (map === null || !Object.prototype.hasOwnProperty.call(map, sj)) unsealed += ` ${sj}`;
      }
      if (unsealed !== "") {
        w(
          `sealed-listed journal(s) carrying no recorded hash:${unsealed} \u2014 each is on disk and named in SEALED_JOURNALS but absent from governance/${SEAL_FILE_NAME}, so nothing is comparing it and a change to it would not be detected. Any scrumux write to that journal seals it (T-0100/I-0047)`
        );
      }
    }
    for (const b of brokenSeals(gov)) {
      f(
        `governance/${b} was changed outside scrumux \u2014 its content does not match the seal recorded by the last gov write. If the change was intentional, make it with scrumux repair journal ${b} --apply '<jq>' --why '...' so the correction carries its own record; if not, restore it from git (T-0100/I-0047)`
      );
    }
    if (isFile(join33(gov, "tasks.json"))) {
      const noAuth = ents(tasksJ).filter((e) => {
        const acc = field(e, "acceptance");
        return acc !== null && field(acc, "accepted") === true && strOr(field(acc, "authority")).length === 0;
      }).length;
      if (noAuth > 0) {
        w(
          `${noAuth} accepted task(s) carry no recorded authority \u2014 they predate --authority becoming required (2026-08-28). Historical, and the CLI now refuses to write another. Not repaired in bulk: inventing an authority for an act nobody can now attest to would be worse than the gap.`
        );
      }
    }
    if (isFile(join33(gov, "sprints.json"))) {
      const noRAuth = ents(sprJ).filter((e) => {
        const r = field(e, "ratified");
        return r !== null && strOr(field(r, "authority")).length === 0;
      }).length;
      if (noRAuth > 0) {
        w(
          `${noRAuth} ratified sprint(s) carry no recorded authority \u2014 they predate --authority becoming required on sprint ratify (2026-08-28). Historical, and the CLI now refuses to write another. Not repaired in bulk: inventing an authority for an act nobody can now attest to would be worse than the gap.`
        );
      }
    }
    if (isFile(join33(gov, "issues.json"))) {
      const selfv = ents(issJ).filter((e) => {
        const v = field(e, "validation");
        const src = field(e, "source");
        return v !== null && src !== null && cmp(src, field(v, "by")) === 0 && src !== "User";
      }).map((e) => interp(field(e, "id")));
      if (selfv.length > 0) {
        w(
          `self-validated issues (raised and certified by the same agent, before scrumux refused it): ${selfv.join(" ")} \u2014 re-validate each by dispatching a read-only agent whose identity is NOT that row's own source (any read-only definition in .claude/agents \u2014 issue-validator, debugger, context-gatherer \u2014 minus that source) and recording it with --by <that agent>, when the row is next touched (I-0054/T-0111)`
        );
      }
    }
  };
  const sweepStandards = () => {
    human(`=== RECORDS CHECK \u2014 standards (${ctx.today}) ===`);
    cli.say("records check --standards: this mode no longer carries built-in stack rules.");
    cli.say("  A repo's own standards live in .claude/rules/project-standards.md,");
    cli.say("  and anything mechanical about them is registered with scrumux health add.");
  };
  if (mode === "structure") sweepStructure();
  else if (mode === "standards") sweepStandards();
  else {
    sweepStructure();
    human("");
    sweepStandards();
  }
  human("");
  const n = cli.fails();
  if (n > 0) {
    cli.emit(
      `records check --${mode}: ${n} finding(s). Each line names the fix; unresolved drift becomes a scrumux issue (scrumux issue new --type drift --source governance-validate ...).`
    );
  }
  switch (mode) {
    case "structure":
      cli.emit("records check --structure: clean \u2014 journals conform, refs resolve, rules chain intact.");
      break;
    case "standards":
      cli.emit("records check --standards: no built-in stack rules; a repo states its own.");
      break;
    default:
      cli.emit(
        "records check --all: clean \u2014 journals conform, refs resolve, rules chain intact, no mechanical standard violations."
      );
  }
}
function schemaSweep(ctx, f, w) {
  const r = sweep(ctx.gov, ctx.codeRoot);
  for (const line of r.lines) {
    if (line === "") continue;
    if (line.startsWith("UNSUPPORTED ")) {
      w(
        `schema coverage: ${line.slice("UNSUPPORTED ".length)} \u2014 the reader is a deliberate SUBSET of JSON Schema and adds no dependency, but a schema author must not believe an unenforced keyword is enforced. List them: scrumux records check --unsupported`
      );
    } else {
      f(
        `schema: ${line} \u2014 the record does not match .claude/schemas; fix the record, or update the schema if the contract genuinely changed (T-0113)`
      );
    }
  }
  if (r.rc > 1 || r.rc !== 0 && r.lines.length === 0) {
    f(
      `the schema sweep exited ${r.rc} with no findings to report (${r.failure ?? ""}) \u2014 the journal schema contracts were NOT checked this run and this sweep cannot speak for them; the failure is in a schema file rather than in a record, so read .claude/schemas and fix the one this names (T-0129: a dependency that fails must fail closed, not pass quietly)`
    );
  }
}
var MODULE13 = {
  verbs: () => VERBS_TSV13,
  usage: () => USAGE10,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "check":
        return recordsCheck(cli, nounContext(ctx), args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun records \u2014 the only verb is 'check'. See: scrumux help records`
        );
    }
  }
};
function globFiles(dir, keep) {
  let names;
  try {
    names = readdirSync4(dir);
  } catch {
    return [];
  }
  return names.filter((n) => !n.startsWith(".")).filter(keep).sort(cmpString).map((n) => join33(dir, n)).filter(isFile);
}
function globDirs(dir) {
  let names;
  try {
    names = readdirSync4(dir);
  } catch {
    return [];
  }
  return names.filter((n) => !n.startsWith(".")).sort(cmpString).map((n) => join33(dir, n)).filter(isDir);
}
function basenameNoExt(p, ext) {
  const b = p.split("/").pop();
  return b.endsWith(ext) ? b.slice(0, b.length - ext.length) : b;
}

// src/nouns/repair.ts
import { spawnSync as spawnSync8 } from "node:child_process";
import { createHash as createHash2 } from "node:crypto";
import { readFileSync as readFileSync26 } from "node:fs";
import { join as join34 } from "node:path";
var VERBS_TSV14 = `journal	a bounded correction to one journal, with its own log entry
`;
var SEED6 = '{"entries": []}';
function repairImpl(cli, ctx, ictx, argv) {
  const jf = argv[0] ?? "";
  if (jf === "") cli.die("repair journal needs a journal name");
  const rest = argv.slice(1);
  let expr = "";
  let why = "";
  let by = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    const v = () => flagValue(cli, rest, i + 1, "repair");
    if (f === "--apply") {
      expr = v();
      i += 2;
      continue;
    }
    if (f === "--why") {
      why = v();
      i += 2;
      continue;
    }
    if (f === "--by") {
      by = v();
      i += 2;
      continue;
    }
    cli.die(
      `repair: unknown flag ${f} \u2014 usage: scrumux repair journal <name.json> --apply '<jq>' --why TEXT --by WHO`
    );
  }
  if (expr === "") cli.die("repair: --apply is required \u2014 the jq expression that makes the correction");
  if (why === "") {
    cli.die("repair: --why is required \u2014 a repair with no recorded reason is the hand edit this command exists to replace");
  }
  if (by === "") {
    cli.die(
      "repair: --by is required \u2014 name who is repairing. It defaulted to User, which is the wrong name to put on the most consequential write in the CLI."
    );
  }
  const path = join34(ctx.gov, jf);
  if (!isFile(path)) cli.die(`repair: no journal at governance/${jf}`);
  const before = sealOf(path);
  const r = spawnSync8("jq", [expr, path], { encoding: "utf8" });
  if (r.status !== 0) {
    const said = firstLine(r.stderr ?? "");
    cli.die(
      `repair: the jq expression failed against governance/${jf} \u2014 ${said === "" ? "jq gave no diagnostic" : said}. Check the filter.`
    );
  }
  const produced = r.stdout ?? "";
  if (produced.length === 0) {
    cli.die(`repair: the jq expression produced NO output, which would truncate governance/${jf} \u2014 check the filter`);
  }
  const would = createHash2("sha256").update(Buffer.from(produced, "utf8")).digest("hex");
  if (before === would) {
    cli.die(
      `repair: the expression changed nothing in governance/${jf} \u2014 check the filter rather than recording a no-op repair`
    );
  }
  let parsed;
  try {
    parsed = parsePreservingNumbers(produced);
  } catch {
    cli.die(`jq write failed for ${path}`);
  }
  const nBefore = entryCount(path);
  const w = refusing(cli, () => writeJson(path, () => parsed, writeOpts(ctx, ictx.io)));
  if (w.resealWarning !== null && cli.json) cli.warn("reseal", w.resealWarning);
  const after = sealOf(path);
  const nAfter = entryCount(path);
  const lid = logRepair(cli, ctx, ictx.io, {
    jf,
    why,
    expr,
    by,
    before: before.slice(0, 12),
    after: after.slice(0, 12)
  });
  sealBootstrap(ctx.gov, ctx.today);
  if (lid !== "") cli.data({ id: lid });
  return cli.emit(
    `repaired governance/${jf} \u2014 entries ${nBefore} -> ${nAfter}, logged as ${lid === "" ? "(no id)" : lid}`
  );
}
function entryCount(path) {
  try {
    const doc = parsePreservingNumbers(readFileSync26(path, "utf8"));
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return 0;
    const e = doc["entries"];
    return Array.isArray(e) ? e.length : 0;
  } catch {
    return 0;
  }
}
function logRepair(cli, ctx, io, r) {
  const path = join34(ctx.gov, "log.json");
  const record = {
    date: ctx.today,
    task: null,
    actor: r.by,
    title: `Repair applied to governance/${r.jf}`,
    what_was_done: `scrumux repair on governance/${r.jf}. Reason: ${r.why}. Applied: ${r.expr}. Content hash ${r.before} -> ${r.after}.`,
    verification: "Journal reseals clean after the write; the correction and this record were made in one operation, so the record cannot be omitted (T-0100)."
  };
  try {
    ensureFile(path, SEED6);
    const res = appendWithId(
      path,
      idStream,
      "L",
      (doc, id) => appendEntry(doc, {
        id,
        date: record.date,
        task: record.task,
        actor: record.actor,
        title: record.title,
        what_was_done: record.what_was_done,
        verification: record.verification
      }),
      writeOpts(ctx, io)
    );
    if (res.resealWarning !== null && cli.json) cli.warn("reseal", res.resealWarning);
    return res.id;
  } catch (e) {
    if (!(e instanceof JournalRefusal)) throw e;
    io.err(`scrumux ${cli.command}: error: ${e.message}
`);
    io.exit(2);
  }
}
var MODULE14 = {
  verbs: () => VERBS_TSV14,
  usage: () => NOUN_USAGE["repair"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "journal":
        if (args.length === 0) {
          return cli.dieUsage(
            "repair journal needs a journal name \u2014 scrumux repair journal tasks.json --apply '<jq>' --why TEXT"
          );
        }
        return repairImpl(cli, ctx, ictx, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun repair \u2014 the only verb is 'journal'. See: scrumux help repair`
        );
    }
  }
};
function firstLine(s2) {
  const i = s2.indexOf("\n");
  return i < 0 ? s2 : s2.slice(0, i);
}

// src/nouns/secret.ts
import { spawnSync as spawnSync9 } from "node:child_process";
import { createHash as createHash3 } from "node:crypto";
import { appendFileSync as appendFileSync2, chmodSync as chmodSync4, readFileSync as readFileSync27, writeFileSync as writeFileSync9 } from "node:fs";
import { join as join35 } from "node:path";
var VERBS_TSV15 = `set	store a secret in this repo's .env (pipe the value on stdin)
list	names, sizes and fingerprints \u2014 never values
remove	drop one name from .env
`;
var USAGE11 = `scrumux secret \u2014 credentials for this repo's own code, stored never printed.

  printf %s '<value>' | scrumux secret set NAME
  scrumux secret set NAME VALUE       (discouraged \u2014 see below)
  scrumux secret list
  scrumux secret remove NAME

VALUE as an argument lands in shell history, in the agent transcript and
in the JSON every PreToolUse hook receives, so pipe it on stdin instead.

.env is gitignored BEFORE the value is written, chmod 600, and the write
is refused outright if git already tracks it.

There is no \`scrumux secret get\`. Nothing prints a value back.
`;
function envLines(text2) {
  const parts = text2.split("\n");
  parts.pop();
  return parts;
}
function parseEnv(text2) {
  const out = [];
  for (let line of envLines(text2)) {
    if (line === "" || line.startsWith("#")) continue;
    if (/^export[ \t\n\v\f\r]/.test(line)) line = line.slice("export".length);
    if (line.startsWith(" ")) line = line.slice(1);
    const eq2 = line.indexOf("=");
    if (eq2 < 0) continue;
    const k2 = line.slice(0, eq2);
    const v = line.slice(eq2 + 1);
    out.push({
      name: k2,
      // BYTES, not UTF-16 code units: `wc -c` reports a true byte count;
      // `.length` would under-report any multi-byte value and the
      // operator-visible number would stop matching what .env holds.
      bytes: Buffer.byteLength(v, "utf8"),
      sha256_prefix: createHash3("sha256").update(Buffer.from(v, "utf8")).digest("hex").slice(0, 8)
    });
  }
  return out;
}
function secretList(cli, ctx) {
  const envf = join35(ctx.root, ".env");
  if (!isFile(envf)) {
    cli.say("no .env yet \u2014 nothing stored");
    cli.emit("");
  }
  cli.say("secrets in .env (names and fingerprints only \u2014 values are never printed):");
  const rows5 = parseEnv(readFileSync27(envf, "utf8"));
  for (const r of rows5) {
    cli.say(`  ${r.name.padEnd(28)} ${r.bytes} bytes  sha256:${r.sha256_prefix}`);
  }
  cli.data({ secrets: rows5 });
  return cli.finish();
}
var NOT_A_NAME = ["get", "show", "read", "cat", "print", "reveal"];
function envMatcher(name) {
  return new RegExp(`^(export[ \\t\\v\\f\\r]+)?${name}=`);
}
function grepLines(text2) {
  if (text2 === "") return [];
  const parts = text2.split("\n");
  if (parts[parts.length - 1] === "") parts.pop();
  return parts;
}
function envDropText(text2, name) {
  const re = envMatcher(name);
  const rest = grepLines(text2).filter((l) => !re.test(l)).join("\n").replace(/\n+$/, "");
  return rest === "" ? "" : rest + "\n";
}
function envDrop(cli, file, name) {
  let text2;
  try {
    text2 = readFileSync27(file, "utf8");
  } catch {
    text2 = "";
  }
  const out = envDropText(text2, name);
  try {
    writeFileSync9(file, "");
  } catch {
    cli.die(`secret: cannot rewrite ${file}`);
  }
  secure(file);
  if (out !== "") appendFileSync2(file, out);
  secure(file);
}
function secure(file) {
  try {
    chmodSync4(file, 384);
  } catch {
  }
}
function gitignoreCoversEnv(text2) {
  return grepLines(text2).some((l) => /^\.env$/.test(l) || /^\.env[ \t\v\f\r]*$/.test(l) || /^\/\.env$/.test(l));
}
function gitTracksEnv(root) {
  const have = spawnSync9("sh", ["-c", "command -v git >/dev/null 2>&1"], { stdio: "ignore" });
  if (have.status !== 0) return false;
  const inRepo = spawnSync9("git", ["-C", root, "rev-parse", "--git-dir"], { stdio: "ignore" });
  if (inRepo.status !== 0) return false;
  const tracked = spawnSync9("git", ["-C", root, "ls-files", "--error-unmatch", ".env"], { stdio: "ignore" });
  return tracked.status === 0;
}
function readStdin2() {
  try {
    return readFileSync27(0, "utf8").replace(/\n+$/, "");
  } catch {
    return "";
  }
}
function parsePositional(cli, action, args) {
  let name = "";
  let val = "";
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a.startsWith("-")) {
      if (action === "set") {
        cli.dieUsage(
          `secret set: unknown flag in argument ${i + 1} (not echoed \u2014 on this noun an argument may be the secret itself) \u2014 usage: scrumux secret set NAME [VALUE] | scrumux secret list | scrumux secret remove NAME`
        );
      }
      cli.dieUsage(
        `secret ${action}: unknown flag ${a} \u2014 usage: scrumux secret set NAME [VALUE] | scrumux secret list | scrumux secret remove NAME`
      );
    }
    if (name === "") name = a;
    else val = a;
  }
  return { name, val };
}
function requireUsableName(cli, name) {
  if (NOT_A_NAME.includes(name)) {
    cli.die(
      `secret: there is no '${name}' \u2014 a stored value is never printed back, which is the point of storing it here. Names and fingerprints: scrumux secret list. The value is read by this repo's own code from .env at runtime.`
    );
  }
  if (name === "") {
    cli.dieUsage(
      "secret: usage: scrumux secret set NAME [VALUE] \u2014 the value may be omitted and piped on stdin instead, which keeps it out of shell history and out of every hook that reads the command string"
    );
  }
  if (/[^A-Za-z0-9_]/.test(name) || /^[0-9]/.test(name)) {
    cli.die(
      `secret: '${name}' is not a usable environment variable name \u2014 letters, digits and underscore only, not starting with a digit. The name is what the repo's code will reference, so it is not normalised for you`
    );
  }
}
function secretRemove(cli, ctx, args) {
  const { name } = parsePositional(cli, "remove", args);
  requireUsableName(cli, name);
  const envf = join35(ctx.root, ".env");
  if (!isFile(envf)) cli.die(`secret: no .env to remove ${name} from`);
  const re = envMatcher(name);
  const text2 = safeRead(envf);
  if (!grepLines(text2).some((l) => re.test(l))) {
    cli.die(`secret: ${name} is not in .env \u2014 nothing removed`);
  }
  envDrop(cli, envf, name);
  cli.data({ name, removed: true });
  return cli.emit(`${name} removed from .env`);
}
function secretSet(cli, ctx, args) {
  const say = (s2) => cli.say(s2);
  const { name, val: argvVal } = parsePositional(cli, "set", args);
  requireUsableName(cli, name);
  const envf = join35(ctx.root, ".env");
  const gi = join35(ctx.root, ".gitignore");
  let val = argvVal;
  let fromArgv = true;
  if (val === "") {
    fromArgv = false;
    if (process.stdin.isTTY === true) {
      cli.die(
        `secret: no value given and stdin is a terminal \u2014 either 'scrumux secret set ${name} <value>' or pipe it: printf %s '<value>' | scrumux secret set ${name}`
      );
    }
    val = readStdin2();
  }
  if (val === "") {
    cli.die(
      `secret: the value for ${name} is empty \u2014 refusing to store a blank secret, which would read as 'configured' and fail at the call site`
    );
  }
  if (val.includes("\n")) {
    cli.die(
      `secret: the value for ${name} contains a newline \u2014 .env is one line per name. Store the PATH to a multi-line credential (a .pem, a service-account json) rather than its contents`
    );
  }
  if (!isFile(gi)) {
    try {
      writeFileSync9(gi, "# secrets \u2014 never commit\n.env\n");
    } catch {
      cli.die(`secret: cannot create ${gi}`);
    }
    say("created .gitignore covering .env");
  } else if (!gitignoreCoversEnv(safeRead(gi))) {
    try {
      appendFileSync2(gi, "\n# secrets \u2014 never commit\n.env\n");
    } catch {
      cli.die(`secret: cannot append to ${gi}`);
    }
    say("added .env to .gitignore");
  }
  if (gitTracksEnv(ctx.root)) {
    cli.die(
      "secret: .env is ALREADY TRACKED by git \u2014 .gitignore does not apply to a tracked file and this would be committed. Untrack it first: git rm --cached .env"
    );
  }
  if (!isFile(envf)) {
    try {
      writeFileSync9(envf, "");
    } catch {
    }
  }
  try {
    chmodSync4(envf, 384);
  } catch {
    cli.die(`secret: cannot secure ${envf} to mode 600`);
  }
  const re = envMatcher(name);
  let verb = "stored";
  if (grepLines(safeRead(envf)).some((l) => re.test(l))) {
    envDrop(cli, envf, name);
    verb = "replaced";
  }
  try {
    appendFileSync2(envf, `${name}=${val}
`);
  } catch {
    cli.die(`secret: cannot write to ${envf}`);
  }
  secure(envf);
  const fp = createHash3("sha256").update(Buffer.from(val, "utf8")).digest("hex").slice(0, 8);
  const len = Buffer.byteLength(val, "utf8");
  say(`${name} ${verb} in .env (${len} bytes, sha256:${fp}) \u2014 mode 600, gitignored`);
  say(
    "the repo's code reads it from .env at runtime; nothing prints it back. Never echo it, never put it in a record, a log entry, a commit message or a notebook cell."
  );
  if (fromArgv) {
    say(
      "NOTE: you passed the value as an argument, so it is in this shell's history and in any transcript of this call. Scrub it: history -d $(history 1 | awk '{print $1}')  \u2014 or pipe the value on stdin next time."
    );
  }
  cli.data({ name, action: verb, bytes: len, sha256_prefix: fp });
  return cli.emit("");
}
function safeRead(p) {
  try {
    return readFileSync27(p, "utf8");
  } catch {
    return "";
  }
}
var MODULE15 = {
  verbs: () => VERBS_TSV15,
  usage: () => USAGE11,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "list":
        if (args.length !== 0) cli.dieUsage("secret list takes no arguments");
        return secretList(cli, nounContext(ctx));
      case "set":
        if (args.length === 0) {
          cli.dieUsage("secret set needs a NAME \u2014 printf %s '<value>' | scrumux secret set NAME");
        }
        return secretSet(cli, nounContext(ctx), args);
      case "remove":
        if (args.length !== 1) cli.dieUsage("secret remove takes exactly one NAME");
        return secretRemove(cli, nounContext(ctx), args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun secret \u2014 verbs: set, list, remove. See: scrumux help secret`
        );
    }
  }
};

// src/nouns/session.ts
import { spawnSync as spawnSync10 } from "node:child_process";
import { existsSync as existsSync15, readFileSync as readFileSync29, readdirSync as readdirSync6, statSync as statSync12 } from "node:fs";
import { join as join38 } from "node:path";

// src/nouns/task/receipt-freeze.ts
var POST_ACCEPTANCE_KEEP = 10;
var asRow = (v) => v !== null && v !== void 0 && typeof v === "object" && !Array.isArray(v) ? v : null;
function isAccepted(row) {
  return asRow(row["acceptance"])?.["accepted"] === true;
}
function frozenReceipt(row) {
  return asRow(asRow(row["acceptance"])?.["receipt"]) ?? asRow(row["receipt"]);
}
function withPostAcceptanceCheck(row, check2) {
  const prior = Array.isArray(row["post_acceptance_checks"]) ? row["post_acceptance_checks"] : [];
  return { ...row, post_acceptance_checks: [...prior, check2].slice(-POST_ACCEPTANCE_KEEP) };
}
var RECEIPT_HISTORY_KEEP = 10;
function withReceipt(row, receipt, history) {
  const prior = Array.isArray(row["receipt_history"]) ? row["receipt_history"] : [];
  return { ...row, receipt, receipt_history: [...prior, history].slice(-RECEIPT_HISTORY_KEEP) };
}
function redDrift(row) {
  const checks = Array.isArray(row["post_acceptance_checks"]) ? row["post_acceptance_checks"] : [];
  const last = asRow(checks[checks.length - 1]);
  if (last === null) return null;
  const n = (v) => v instanceof RawNumber ? Number(v.text) : Number(v ?? 0);
  return n(last["rc"]) !== 0 || n(last["checks_failed"]) !== 0 ? last : null;
}

// src/nouns/session-fresh.ts
import { statSync as statSync11 } from "node:fs";
import { join as join37 } from "node:path";

// src/nouns/task/fingerprint.ts
import { createHash as createHash4 } from "node:crypto";
import { lstatSync as lstatSync2, readdirSync as readdirSync5, readFileSync as readFileSync28 } from "node:fs";
import { isAbsolute as isAbsolute2, join as join36, normalize, relative as relative3, resolve as resolve5 } from "node:path";

// src/nouns/task/command-paths.ts
var DIR_FLAGS = /* @__PURE__ */ new Set(["--directory", "--cwd", "--prefix", "-C", "--project", "--root-dir", "--rootdir"]);
function commandWords(command) {
  return command.replace(/["'`]/g, " ").split(/[\s;&|()<>]+/).filter((w) => w !== "");
}
function commandWorkDirs(command) {
  const out = [];
  const words2 = commandWords(command);
  const add = (d) => {
    if (d === void 0 || d === "" || d.startsWith("-") || d.includes("$")) return;
    const n = d.replace(/^\.\//, "").replace(/\/+$/, "");
    if (n !== "" && n !== "." && !out.includes(n)) out.push(n);
  };
  for (let i = 0; i < words2.length; i++) {
    const w = words2[i];
    if (w === "cd" || w === "pushd" || DIR_FLAGS.has(w)) {
      add(words2[i + 1]);
      continue;
    }
    const eq2 = /^(--[a-z-]+)=(.+)$/.exec(w);
    if (eq2 !== null && DIR_FLAGS.has(eq2[1])) add(eq2[2]);
  }
  return out;
}
function commandPathWords(command) {
  const out = [];
  for (const raw of commandWords(command)) {
    const eq2 = /^--?[A-Za-z][A-Za-z0-9-]*=(.+)$/.exec(raw);
    const w = eq2 !== null ? eq2[1] : raw;
    if (w.startsWith("-") || w.includes("$") || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(w)) continue;
    if (!(w.includes("/") || /\.[A-Za-z0-9]{1,10}$/.test(w))) continue;
    if (!out.includes(w)) out.push(w);
  }
  return out;
}

// src/nouns/task/fingerprint.ts
var SKIP_DIRS2 = /* @__PURE__ */ new Set([".git", "node_modules", ".venv", "venv", "__pycache__", ".scratch", ".pytest_cache", "dist", "build"]);
var MAX_DIR_FILES = 2e3;
function sha256File(abs) {
  try {
    if (!lstatSync2(abs).isFile()) return null;
    return createHash4("sha256").update(readFileSync28(abs)).digest("hex");
  } catch {
    return null;
  }
}
function hashPath(abs) {
  let st;
  try {
    st = lstatSync2(abs);
  } catch {
    return null;
  }
  if (st.isFile()) return sha256File(abs);
  if (!st.isDirectory()) return null;
  const files = [];
  const walk = (dir, rel) => {
    let names;
    try {
      names = readdirSync5(dir).sort();
    } catch {
      return true;
    }
    for (const name of names) {
      const p = join36(dir, name);
      const r = rel === "" ? name : `${rel}/${name}`;
      let s2;
      try {
        s2 = lstatSync2(p);
      } catch {
        continue;
      }
      if (s2.isDirectory()) {
        if (SKIP_DIRS2.has(name)) continue;
        if (!walk(p, r)) return false;
      } else if (s2.isFile()) {
        files.push(r);
        if (files.length > MAX_DIR_FILES) return false;
      }
    }
    return true;
  };
  if (!walk(abs, "")) return null;
  const h = createHash4("sha256");
  for (const r of files) h.update(`${r}\0${sha256File(join36(abs, r)) ?? ""}
`);
  return h.digest("hex");
}
function fileHashes(workRoot, paths) {
  const out = {};
  for (const p of paths) {
    if (p === "" || p in out) continue;
    const h = sha256File(join36(workRoot, p));
    if (h !== null) out[p] = h;
  }
  return out;
}
function coveredPaths(row) {
  const order = row["task_order"];
  const ctx = order !== null && typeof order === "object" ? order["context"] : null;
  const c = ctx !== null && typeof ctx === "object" ? ctx : {};
  const files = Array.isArray(c["files"]) ? c["files"] : [];
  const arts = Array.isArray(c["expected_artifacts"]) ? c["expected_artifacts"] : [];
  const out = [];
  const add = (v) => {
    const s2 = typeof v === "string" ? v : "";
    for (const p of s2.split(/\s+/)) if (p !== "" && !out.includes(p)) out.push(p);
  };
  for (const f of files) add(f !== null && typeof f === "object" ? f["path"] : "");
  for (const a of arts) add(a);
  return out;
}
function inside(root, abs) {
  const rel = relative3(resolve5(root), resolve5(abs));
  if (rel === "" || rel.startsWith("..") || isAbsolute2(rel)) return null;
  return rel.split("\\").join("/");
}
function checkFingerprint(workRoot, command) {
  const files = {};
  const bases = ["", ...commandWorkDirs(command)];
  for (const w of commandPathWords(command)) {
    for (const base of bases) {
      const abs = isAbsolute2(w) ? w : resolve5(workRoot, normalize(join36(base, w)));
      const rel = inside(workRoot, abs);
      if (rel === null || rel in files) continue;
      const h = hashPath(abs);
      if (h !== null) files[rel] = h;
      if (isAbsolute2(w)) break;
    }
  }
  return { algo: "sha256", files };
}

// src/nouns/session-fresh.ts
var asRow2 = (v) => v !== null && v !== void 0 && typeof v === "object" && !Array.isArray(v) ? v : null;
function mtime(path) {
  try {
    return Math.floor(statSync11(path).mtimeMs / 1e3);
  } catch {
    return 0;
  }
}
function firstChanged(row, receipt, workRoot) {
  const hashes = asRow2(receipt["file_hashes"]);
  const at = Number(interp(receipt["at_epoch"] ?? null));
  for (const f of coveredPaths(row)) {
    const p = join37(workRoot, f);
    if (!isFile(p)) continue;
    if (hashes !== null) {
      const want = hashes[f];
      if (typeof want !== "string" || sha256File(p) !== want) return f;
      continue;
    }
    if (!Number.isFinite(at)) continue;
    if (mtime(p) > at) return f;
  }
  return "";
}
function receiptFreshness(tasks, claimed, workRoot) {
  const out = { stale: "", unstamped: "", drift: "" };
  for (const t of claimed) {
    const row = asRow2(tasks.find((e) => field(e, "id") === t));
    if (row === null) continue;
    const settled = isAccepted(row);
    const receipt = settled ? frozenReceipt(row) : asRow2(row["receipt"]);
    const at = receipt === null ? null : receipt["at_epoch"];
    if (receipt === null || at === void 0 || at === null || at === false) {
      out.unstamped += ` ${t}`;
      continue;
    }
    const changed = firstChanged(row, receipt, workRoot);
    if (changed === "") continue;
    if (settled) out.drift += ` ${t}:${changed}`;
    else out.stale += ` ${t}:${changed}`;
  }
  return out;
}
function acceptedWithOpenIssue(tasks, issues) {
  const out = [];
  for (const e of tasks) {
    const row = asRow2(e);
    if (row === null || !isAccepted(row) || typeof row["issue"] !== "string") continue;
    const iss = issues.find((i) => field(i, "id") === row["issue"]);
    const st = iss === void 0 ? "" : interp(field(iss, "status"));
    if (st === "open" || st === "accepted") out.push({ task: interp(row["id"] ?? null), issue: row["issue"] });
  }
  return out;
}

// src/nouns/session.ts
var VERBS_TSV16 = "check	the close: six deterministic checks over receipts, journals and git\n";
var USAGE12 = `scrumux session \u2014 the session close.

  scrumux session check

Exit 1 if any check FAILS. WARNs print and never change the exit code.

The six checks are the ways a green receipt can lie, plus the two
irreversible states:
  1. every task claiming done carries a receipt
  2. the receipt ran the command the order names
  3. the receipt covers the code as it is now (content hashes; an
     accepted task's changed file is drift, a WARN)
  4. the receipt actually ran something
  5. no secret-shaped file in the working tree
  6. nothing left in_progress

Sprint discipline and live stubs print as WARNs: worth seeing, not worth
stopping for.
`;
var PRUNE = [".git", "governance", "tests", "node_modules", ".venv", "venv", "dist", "build"];
var NOT_NAMED = ["AI_LOG.MD", "DECISIONS.MD", "BACKLOG.MD"];
function readDoc2(path) {
  if (!existsSync15(path)) return null;
  try {
    return parsePreservingNumbers(readFileSync29(path, "utf8"));
  } catch {
    return null;
  }
}
function byId(entries, id) {
  for (const e of entries) if (field(e, "id") === id) return e;
  return null;
}
function orEmpty(v) {
  return v === null || v === false ? "" : interp(v);
}
function stubScan(workRoot) {
  const out = [];
  const marker = /STUB\(I-[0-9]{4}\)/g;
  const walk = (dir, rel) => {
    let names;
    try {
      names = readdirSync6(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const childRel = rel === "" ? name : `${rel}/${name}`;
      if (rel === "" && PRUNE.includes(name)) continue;
      const p = join38(dir, name);
      let st;
      try {
        st = statSync12(p);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        walk(p, childRel);
        continue;
      }
      if (!st.isFile()) continue;
      if (NOT_NAMED.includes(name)) continue;
      let text2;
      try {
        text2 = readFileSync29(p, "utf8");
      } catch {
        continue;
      }
      const lines = text2.split("\n");
      if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
      for (let i = 0; i < lines.length; i++) {
        marker.lastIndex = 0;
        let m;
        while ((m = marker.exec(lines[i])) !== null) {
          out.push(`${childRel}:${i + 1}:${m[0]}`);
        }
      }
    }
  };
  walk(workRoot, "");
  return out;
}
function sessionCheck(cli, ctx) {
  const tasksDoc = readDoc2(join38(ctx.gov, "tasks.json"));
  const sprintsDoc = readDoc2(join38(ctx.gov, "sprints.json"));
  const issuesDoc = readDoc2(join38(ctx.gov, "issues.json"));
  const tasks = entriesOf(tasksDoc ?? void 0);
  const today = ctx.today;
  cli.say(`=== SESSION CHECK (${today}) ===`);
  cli.say("");
  const claimed = tasks.filter((e) => {
    const st = field(e, "status");
    return st === "in_review" || st === "accepted" && field(e, "updated_at") === today;
  }).map((e) => interp(field(e, "id"))).join(" ").split(/\s+/).filter((s2) => s2 !== "");
  let noReceipt = "";
  let redReceipt = "";
  for (const t of claimed) {
    const e = byId(tasks, t);
    const receipt = e === null ? null : field(e, "receipt");
    const rc = receipt === null ? "" : orEmpty(field(receipt, "rc"));
    if (rc === "") noReceipt += ` ${t}`;
    else if (rc !== "0") redReceipt += ` ${t}(rc=${rc})`;
  }
  if (noReceipt !== "") {
    cli.fail("receipt present", `claimed done with no receipt:${noReceipt} \u2014 nothing ran to prove it`);
  }
  if (redReceipt !== "") {
    cli.fail("receipt green", `claimed done on a red receipt:${redReceipt} \u2014 the command it named did not pass`);
  }
  if (noReceipt === "" && redReceipt === "") {
    cli.pass("receipt green", "every task claiming done carries a green receipt");
  }
  const drifted = [];
  for (const e of tasks) {
    const row = e !== null && typeof e === "object" && !Array.isArray(e) ? e : null;
    if (row === null || !isAccepted(row)) continue;
    const red = redDrift(row);
    if (red !== null) drifted.push(`${interp(field(e, "id"))}(rc=${orEmpty(field(red, "rc"))}, ${orEmpty(field(red, "date"))})`);
  }
  if (drifted.length > 0) {
    cli.warn("post-acceptance drift", `accepted work no longer passes its own command when re-verified: ${drifted.join(" ")} \u2014 its acceptance receipt is frozen and unchanged (D-S018). This is drift, not this session's failure: look at what changed around it, and raise an issue if it matters; do not re-litigate the acceptance.`);
  }
  let mismatch = "";
  for (const t of claimed) {
    const e = byId(tasks, t);
    if (e === null) continue;
    const rcmd = orEmpty(field(e, "receipt", "command"));
    const ocmd = orEmpty(field(e, "task_order", "verification_command"));
    if (rcmd === "" || ocmd === "") continue;
    if (rcmd !== ocmd) mismatch += ` ${t}`;
  }
  if (mismatch === "") {
    cli.pass("command match", "each receipt ran the command its order names");
  } else {
    cli.fail("command match", `receipt ran a different command than the order names:${mismatch}`);
  }
  const fresh = receiptFreshness(tasks, claimed, ctx.workRoot);
  if (fresh.stale !== "") {
    cli.fail("receipt fresh", `files changed after the receipt was written:${fresh.stale} \u2014 the receipt no longer covers the code`);
  } else if (fresh.unstamped !== "") {
    cli.warn("receipt fresh", `receipt predates the freshness stamp, cannot be judged:${fresh.unstamped}`);
  } else {
    cli.pass("receipt fresh", "no covered file changed after its receipt");
  }
  if (fresh.drift !== "") {
    cli.warn("post-acceptance drift", `files an ACCEPTED task covers changed after its acceptance receipt:${fresh.drift} \u2014 expected when later work touches them; its acceptance stands (D-S018). Not this session's failure; re-verify that task if the change could break it.`);
  }
  let zero = "";
  for (const t of claimed) {
    const e = byId(tasks, t);
    if (e === null) continue;
    const n = orEmpty(field(e, "receipt", "checks_run"));
    if (n === "") continue;
    if (Number(n) === 0) zero += ` ${t}`;
  }
  if (zero === "") {
    cli.pass("checks ran", "every receipt ran at least one check");
  } else {
    cli.fail("checks ran", `receipt reports zero checks run:${zero} \u2014 a green that proved nothing`);
  }
  if (isGitRepo(ctx.workRoot)) {
    const porcelain = spawnSync10("git", ["status", "--porcelain"], {
      cwd: ctx.workRoot,
      encoding: "utf8"
    });
    const stray = (porcelain.stdout ?? "").split("\n").filter((l) => l !== "").map((l) => l.trim().split(/[ \t]+/)[1] ?? "").filter((p) => /\.tmp\.|\.env$|id_rsa|\.pem$|\.key$/.test(p)).join("\n");
    if (stray === "") {
      cli.pass("strays/secrets", "no temp or secret-pattern files in the working tree");
    } else {
      cli.fail("strays/secrets", `secret-shaped files in the working tree: ${stray}`);
    }
  } else {
    cli.warn("strays/secrets", "not a git repo \u2014 stray check unavailable");
  }
  const inProgress = tasks.filter((e) => field(e, "status") === "in_progress");
  if (inProgress.length === 0) {
    cli.pass("nothing mid-flight", "no task left in_progress");
  } else {
    const ids = inProgress.map((e) => interp(field(e, "id")));
    const mine = ctx.env["SCRUMUX_TASK"] ?? "";
    if (mine !== "") {
      const mineIp = inProgress.filter((e) => field(e, "id") === mine).map((e) => interp(field(e, "id"))).join(",");
      const otherIp = inProgress.filter((e) => field(e, "id") !== mine).map((e) => interp(field(e, "id"))).join(",");
      if (mineIp !== "") {
        const also = otherIp !== "" ? `; also in flight, and not this session's to move: ${otherIp}` : "";
        cli.fail("nothing mid-flight", `still in_progress at close: ${mineIp} \u2014 this session was dispatched under it${also}`);
      } else {
        cli.warn(
          "nothing mid-flight",
          `this session's task (${mine}) is not in flight; another session's is: ${otherIp} \u2014 named, not failed (D-0084)`
        );
      }
    } else {
      cli.fail("nothing mid-flight", `still in_progress at close: ${ids.join(",")}`);
    }
  }
  const openFixed = acceptedWithOpenIssue(tasks, entriesOf(issuesDoc ?? void 0));
  if (openFixed.length > 0) {
    cli.warn("fixed issue open", `accepted task(s) whose issue is still open: ${openFixed.map((p) => `${p.task}->${p.issue}`).join(" ")} \u2014 if the fix is complete, a person resolves it: scrumux issue update ${openFixed[0].issue} --status resolved (in scrumux-app, the accept flow offers it). Never a failure.`);
  }
  const worked = tasks.filter((e) => {
    const st = field(e, "status");
    return field(e, "updated_at") === today && st !== "superseded" || st === "in_progress" || st === "in_review";
  }).map((e) => interp(field(e, "id"))).join(" ").split(/\s+/).filter((s2) => s2 !== "");
  const inSprintList = unique(
    entriesOf(sprintsDoc ?? void 0).filter((e) => {
      const st = field(e, "status");
      return st === "ratified" || st === "complete";
    }).flatMap((e) => asArray(field(e, "tasks")) ?? [])
  ).map(interp);
  const inSprint = new Set(inSprintList.join(" ").split(/\s+/).filter((s2) => s2 !== ""));
  let outside = "";
  for (const t of worked) {
    if (inSprint.has(t)) continue;
    outside += ` ${t}`;
  }
  if (outside.replace(/ /g, "") === "") {
    cli.pass("sprint discipline", "every worked task belongs to a ratified sprint");
  } else {
    cli.warn("sprint discipline", `worked outside any ratified sprint:${outside}`);
  }
  const issues = entriesOf(issuesDoc ?? void 0);
  let liveN = 0;
  let liveIds = "";
  let badSites = "";
  for (const m of stubScan(ctx.workRoot)) {
    const parts = m.split(":");
    const site = parts.slice(0, 2).join(":");
    const idm = /STUB\((I-[0-9]{4})\)/.exec(m);
    const id = idm === null ? "" : idm[1];
    const e = byId(issues, id);
    const st = e === null ? "unknown" : asString(field(e, "status")) ?? interp(field(e, "status"));
    if (st === "open" || st === "accepted") {
      liveN += 1;
      liveIds += ` ${id}`;
    } else {
      badSites += ` ${site}->${id}(${st})`;
    }
  }
  if (badSites !== "") {
    cli.warn("live stubs", `stub marker(s) whose issue is resolved/rejected/unknown:${badSites}`);
  }
  if (liveN > 0) {
    cli.warn("live stubs", `${liveN} live stub(s) parked on open issue(s):${liveIds}`);
  } else if (badSites === "") {
    cli.pass("live stubs", "no stub markers in live code");
  }
  cli.say("");
  const fails = cli.fails();
  const rows5 = cli.build("").checks.length;
  cli.say(`SUMMARY: ${fails} fail(s) of ${rows5} check(s)`);
  if (fails > 0) {
    cli.emit("VERDICT: session NOT clean \u2014 each FAIL above names work that is not finished.");
  }
  cli.emit("VERDICT: clean. Push is User's call.");
}
var MODULE16 = {
  verbs: () => VERBS_TSV16,
  usage: () => USAGE12,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "check":
        if (args.length !== 0) cli.dieUsage("session check takes no arguments");
        return sessionCheck(cli, nounContext(ctx));
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun session \u2014 the only verb is 'check'. See: scrumux help session`
        );
    }
  }
};
function isGitRepo(dir) {
  const r = spawnSync10("git", ["-C", dir, "rev-parse", "--git-dir"], { stdio: "ignore" });
  return r.status === 0;
}

// src/nouns/sprint.ts
import { existsSync as existsSync16, readFileSync as readFileSync30 } from "node:fs";
import { join as join39 } from "node:path";

// src/nouns/sprint-additions.ts
var asRow3 = (v) => v !== null && v !== void 0 && typeof v === "object" && !Array.isArray(v) ? v : null;
var tasksOf = (row) => Array.isArray(row["tasks"]) ? row["tasks"] : [];
function pendingAdditions(row) {
  const adds = Array.isArray(row["additions"]) ? row["additions"] : [];
  const carried = new Set(tasksOf(row).filter((t) => typeof t === "string"));
  const out = [];
  for (const a of adds) {
    const o = asRow3(a);
    if (o === null || typeof o["task"] !== "string") continue;
    if (o["ratified"] !== null && o["ratified"] !== void 0) continue;
    if (carried.has(o["task"]) && !out.includes(o["task"])) out.push(o["task"]);
  }
  return out;
}
function withAddition(row, tid, today, sortUnique) {
  const base = tasksOf(row);
  const already = base.includes(tid);
  const next = { ...row, tasks: sortUnique([...base, tid]), updated_at: today };
  if (row["status"] !== "ratified" || already) return { row: next, awaitsRatification: false };
  const prior = Array.isArray(row["additions"]) ? row["additions"] : [];
  next["additions"] = [...prior, { task: tid, date: today, ratified: null }];
  return { row: next, awaitsRatification: true };
}
function withAdditionsRatified(row, by, date, authority) {
  const pending = new Set(pendingAdditions(row));
  if (pending.size === 0) return null;
  const adds = Array.isArray(row["additions"]) ? row["additions"] : [];
  const ratified = adds.map((a) => {
    const o = asRow3(a);
    if (o === null || typeof o["task"] !== "string" || !pending.has(o["task"])) return a;
    if (o["ratified"] !== null && o["ratified"] !== void 0) return a;
    return { ...o, ratified: { by, date, authority } };
  });
  return { ...row, additions: ratified, updated_at: date };
}
function unratifiedAdditionSprint(rows5, tid) {
  for (const r of rows5) {
    const o = asRow3(r);
    if (o === null || o["status"] !== "ratified") continue;
    if (pendingAdditions(o).includes(tid)) return typeof o["id"] === "string" ? o["id"] : "";
  }
  return "";
}

// src/nouns/sprint.ts
var VERBS_TSV17 = `new	open a sprint against an epic, or a hotfix sprint from an issue
add	put a task in the sprint (it needs a complete order first)
update	change how many tasks the sprint runs at once, while it is still proposed
descope	remove UNWORKED work from a ratified plan
ratify	User's word turns a proposal into a plan
status	complete or abandon a sprint
`;
var SEED7 = '{"entries": []}';
var sprintsPath = (ctx) => join39(ctx.gov, "sprints.json");
var issuesPath2 = (ctx) => join39(ctx.gov, "issues.json");
var tasksPath = (ctx) => join39(ctx.gov, "tasks.json");
function rows3(path) {
  if (!existsSync16(path)) return [];
  try {
    const doc = parsePreservingNumbers(readFileSync30(path, "utf8"));
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return [];
    const e = doc["entries"];
    return Array.isArray(e) ? e : [];
  } catch {
    return [];
  }
}
function obj4(v) {
  if (v === null || v === void 0 || typeof v !== "object" || Array.isArray(v) || v instanceof RawNumber) {
    return null;
  }
  return v;
}
function rowById2(path, id) {
  for (const r of rows3(path)) {
    const o = obj4(r);
    if (o !== null && o["id"] === id) return o;
  }
  return null;
}
function sprintNew(cli, ctx, ictx, args) {
  let epic = "";
  let hotfix = 0;
  let issue = "";
  let parallel = "";
  for (let i = 0; i < args.length; ) {
    const f = args[i];
    if (f === "--epic") {
      epic = flagValue(cli, args, i + 1, "sprint new");
      i += 2;
      continue;
    }
    if (f === "--hotfix") {
      hotfix = 1;
      i += 1;
      continue;
    }
    if (f === "--issue") {
      issue = flagValue(cli, args, i + 1, "sprint new");
      i += 2;
      continue;
    }
    if (f === "--parallel") {
      parallel = flagValue(cli, args, i + 1, "sprint new");
      i += 2;
      continue;
    }
    cli.die(`sprint new: unknown flag ${f} \u2014 see: scrumux help sprint`);
  }
  refusing(cli, () => parallelGuard(parallel, "sprint new"));
  if (hotfix === 1) {
    if (!(parallel === "" || parallel === "1")) {
      cli.die(
        "sprint new: a hotfix sprint runs one task \u2014 it is one issue promoted to one task, so there is no second slot to declare (D-0084). Drop --parallel, or open an epic-lane sprint."
      );
    }
    parallel = "1";
    if (issue === "") {
      cli.die(
        "sprint new: hotfix sprints need --issue I-0001 (the issue being promoted, per D-0004) \u2014 scrumux sprint new --hotfix --issue I-XXXX"
      );
    }
    if (!refExists(issuesPath2(ctx), issue)) {
      cli.die(`sprint new: issue ${issue} not found in issues.json`);
    }
    if (epic !== "") cli.die("sprint new: --hotfix and --epic are mutually exclusive");
    hotfixGate(cli, ctx, issue);
  } else {
    if (epic === "") {
      cli.die(
        "sprint new: --epic E-0001 is required (sprints are epic-bounded, D-0004) \u2014 or use --hotfix --issue I-0001 for the fast lane"
      );
    }
    const found = refExists(join39(ctx.gov, "design.json"), epic, (r2) => {
      const o = obj4(r2);
      return o !== null && o["kind"] === "epic" ? o["id"] : void 0;
    });
    if (!found) {
      cli.die(`sprint new: epic ${epic} not found \u2014 add it first: scrumux epic new --name ... --desc ...`);
    }
  }
  const path = sprintsPath(ctx);
  refusing(cli, () => ensureFile(path, SEED7));
  const d = ctx.today;
  const p = parallel === "" ? 1 : Number(parallel);
  const r = guardedAppend(
    cli,
    ctx,
    ictx.io,
    path,
    idStream,
    "SP",
    (doc, id) => appendEntry(doc, {
      id,
      epic: epic === "" ? null : epic,
      hotfix: hotfix === 1,
      source_issue: issue === "" ? null : issue,
      tasks: [],
      status: "proposed",
      parallel: p,
      created_at: d
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, r.id);
}
function hotfixGate(cli, ctx, issue) {
  const row = rowById2(issuesPath2(ctx), issue);
  const validation = row === null ? null : obj4(row["validation"]);
  const vstate = row === null || row["validation"] === void 0 || row["validation"] === null ? "none" : validation === null ? jqRaw2(row["validation"]) : jqRaw2(validation["verdict"]);
  const authed = row !== null && row["authorization"] !== void 0 && row["authorization"] !== null;
  if (vstate === "reproduced" || vstate === "evidenced") return;
  if (vstate === "none") {
    if (!authed) {
      cli.die(
        `sprint new: ${issue} has neither validation nor authorization \u2014 validate it (scrumux issue validate ${issue} --verdict ... --evidence '<what you saw>') or record User's word (scrumux issue authorize ${issue} --by User)`
      );
    }
    return;
  }
  if (vstate === "invalidated") {
    cli.die(
      `sprint new: ${issue} was invalidated \u2014 close it instead of fixing it: scrumux issue update ${issue} --status rejected (the disproof is already recorded, D-0011)`
    );
  }
  if (vstate === "duplicate") {
    const dupRaw = validation === null ? void 0 : validation["duplicate_of"];
    const dup = dupRaw === void 0 || dupRaw === null || dupRaw === false ? "?" : jqRaw2(dupRaw);
    cli.die(
      `sprint new: ${issue} is a duplicate of ${dup} \u2014 work the original; attach and close this one: scrumux issue update ${issue} --task <T-XXXX> --status rejected`
    );
  }
  cli.die(
    `sprint new: ${issue} carries a validation verdict this gate does not recognise (verdict: ${vstate}) \u2014 the hotfix lane opens only on reproduced or evidenced, and closes on invalidated or duplicate. A verdict outside that vocabulary, or a validation carrying none at all, is refused rather than promoted: a verdict the gate cannot read is not a validation. Re-validate it: scrumux issue validate ${issue} --verdict reproduced|evidenced|invalidated|duplicate --evidence '<what you saw>'`
  );
}
function jqRaw2(v) {
  if (v === void 0 || v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof RawNumber) return v.text;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}
function sprintAdd(cli, ctx, ictx, args) {
  const sid = args[0] ?? "";
  const tid = args[1] ?? "";
  if (sid === "" || tid === "") cli.die("usage: scrumux sprint add SP-0001 T-0001");
  if (!refExists(sprintsPath(ctx), sid)) {
    cli.die(`sprint add: ${sid} not found in sprints.json \u2014 create it first: scrumux sprint new --epic E-XXXX`);
  }
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  const task = rowById2(tasksPath(ctx), tid);
  const order = task === null ? void 0 : task["task_order"];
  if (order === void 0 || order === null) {
    cli.die(
      `task order first: ${tid} has no task_order \u2014 complete it before it can enter a sprint (D-0005): scrumux task order ${tid} --scope ... --verify ... --file "path | why"`
    );
  }
  const sprint = rowById2(sprintsPath(ctx), sid);
  const hot = sprint === null ? "null" : jqRaw2(sprint["hotfix"]);
  const orderObj = obj4(order);
  const lit = orderObj !== null && orderObj["light"] === true ? "true" : "false";
  if (hot !== "true" && lit !== "true") {
    const story = task === null ? void 0 : task["story"];
    if (story === void 0 || story === null) {
      cli.die(
        `one user story per task: ${tid} has no story \u2014 set it via scrumux task order ${tid} --story S-XXXX ... (hotfix sprints and light orders are the storyless lanes; mint a light one with scrumux task order ${tid} --light ...)`
      );
    }
  }
  const d = ctx.today;
  let awaits = false;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    sprintsPath(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== sid) return row;
      const r = withAddition(row, tid, d, (xs) => unique(xs));
      awaits = r.awaitsRatification;
      return r.row;
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  if (awaits) {
    cli.tell("addition-awaits-ratification", `${sid} is already ratified, so ${tid} was added as an ADDITION awaiting ratification (D-S017): it is not dispatched until the addition is ratified (scrumux sprint ratify ${sid} --by WHO --authority direct|app|standing:D-XXXX \u2014 in scrumux-app, the ratify gate for ${sid}). The tasks already ratified are unaffected.`);
    return cli.emit(`${tid} added to ${sid} \u2014 awaiting ratification of the addition`);
  }
  return cli.emit(`${tid} added to ${sid}`);
}
function sprintDescope(cli, ctx, ictx, args) {
  const sid = args[0] ?? "";
  const tid = args[1] ?? "";
  const rest = args.length >= 2 ? args.slice(2) : args;
  let reason = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--reason") {
      reason = flagValue(cli, rest, i + 1, "sprint descope");
      i += 2;
      continue;
    }
    cli.die(`sprint descope: unknown flag ${f} \u2014 usage: scrumux sprint descope SP-0001 T-0001 --reason TEXT`);
  }
  if (sid === "" || tid === "") cli.die("usage: scrumux sprint descope SP-0001 T-0001 --reason TEXT");
  if (reason === "") {
    cli.die(
      'sprint descope: --reason is required \u2014 a descope with no recorded reason is indistinguishable from a task that vanished. Name what changed and where the work went. GOOD "I-0112 read-side self-heal on staleness is a NEW capability and the freeze holds; the issue stays documented and nothing here depends on it landing this sprint". GOOD "Superseded by T-0217, which covers the same session-check exemption and adds the negative case; this one would land the weaker half of it". BAD "out of scope" \u2014 the plan already said what was in scope, so that only restates the act.'
    );
  }
  if (!refExists(sprintsPath(ctx), sid)) cli.die(`sprint descope: ${sid} not found in sprints.json`);
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  const sprint = rowById2(sprintsPath(ctx), sid);
  const carried = sprint !== null && (() => {
    const t = sprint["tasks"];
    return Array.isArray(t) && t.some((x) => x === tid);
  })();
  if (!carried) {
    cli.die(`sprint descope: ${tid} is not carried by ${sid} \u2014 see the plan: .claude/scripts/scrumux status --sprint`);
  }
  const logPath = join39(ctx.gov, "log.json");
  if (existsSync16(logPath)) {
    const worked = rows3(logPath).filter((r) => {
      const o = obj4(r);
      return o !== null && o["task"] === tid;
    }).length;
    if (worked !== 0) {
      cli.say(
        `TELL: ${tid} has ${worked} log entry/entries \u2014 it was worked, and descoping does not erase them. Descoping anyway; retire it instead with scrumux task status ${tid} superseded --reason ... if that is what you meant.`
      );
    }
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    sprintsPath(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== sid) return row;
      const cur = row["tasks"];
      const kept = (Array.isArray(cur) ? cur : []).filter((x) => x !== tid);
      const prior = row["descoped"];
      const descoped = [...Array.isArray(prior) ? prior : [], { task: tid, reason, date: d }];
      return { ...row, tasks: kept, descoped, updated_at: d };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${tid} descoped from ${sid}`);
}
function sprintUpdate(cli, ctx, ictx, args) {
  const sid = args[0] ?? "";
  const rest = args.slice(1);
  let parallel = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--parallel") {
      parallel = flagValue(cli, rest, i + 1, "sprint update");
      i += 2;
      continue;
    }
    cli.die(
      `sprint update: unknown flag ${f} \u2014 the only field this verb changes is --parallel N; tasks, status and ratification have their own verbs (scrumux help sprint)`
    );
  }
  if (sid === "") cli.die("usage: scrumux sprint update SP-0001 --parallel N");
  if (parallel === "") {
    cli.die("sprint update: nothing to update \u2014 the only field this verb changes is --parallel N (D-0084)");
  }
  refusing(cli, () => parallelGuard(parallel, "sprint update"));
  if (!refExists(sprintsPath(ctx), sid)) {
    cli.die(
      `sprint update: ${sid} not found in sprints.json \u2014 see BACKLOG.MD Sprints section, or open it first: scrumux sprint new --epic E-XXXX --parallel N`
    );
  }
  const row = rowById2(sprintsPath(ctx), sid);
  const spst = row === null ? "null" : jqRaw2(row["status"]);
  const sphot = row === null ? "null" : jqRaw2(row["hotfix"]);
  if (sphot === "true") {
    cli.die(`sprint update: ${sid} is a hotfix sprint \u2014 one issue, one task, one slot; there is nothing to widen (D-0084)`);
  }
  if (spst !== "proposed") {
    cli.die(
      `sprint update: ${sid} is ${spst} \u2014 changing how many tasks a RATIFIED plan runs at once is a re-ratification, not an edit (D-0084). Open a new sprint for the extra work, or have User ratify the changed plan again.`
    );
  }
  const d = ctx.today;
  const p = Number(parallel);
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    sprintsPath(ctx),
    (doc) => mapEntries(doc, (row2) => row2["id"] === sid ? { ...row2, parallel: p, updated_at: d } : row2)
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${sid} updated \u2014 up to ${parallel} task(s) in flight once it is ratified`);
}
function sprintRatify(cli, ctx, ictx, args) {
  const sid = args[0] ?? "";
  const rest = args.slice(1);
  let by = "";
  let authority = "";
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--by") {
      by = flagValue(cli, rest, i + 1, "sprint ratify");
      i += 2;
      continue;
    }
    if (f === "--authority") {
      authority = flagValue(cli, rest, i + 1, "sprint ratify");
      i += 2;
      continue;
    }
    cli.die(`sprint ratify: unknown flag ${f} \u2014 see: scrumux help sprint`);
  }
  if (sid === "") {
    cli.die("usage: scrumux sprint ratify SP-0001 --by WHO --authority direct|app:<session>|standing:D-0001");
  }
  if (by === "") {
    cli.die(
      "sprint ratify: --by is required \u2014 name who is ratifying. It used to default to 'User', which wrote his name onto acts he did not take. Use --by User when he ratifies, or the agent's own id when it does."
    );
  }
  refusing(cli, () => authorityGuard(ctx.gov, authority, "sprint ratify"));
  if (!refExists(sprintsPath(ctx), sid)) {
    cli.die(`sprint ratify: ${sid} not found \u2014 see BACKLOG.MD Sprints section or create: scrumux sprint new`);
  }
  const row = rowById2(sprintsPath(ctx), sid);
  const tasks = row === null ? null : row["tasks"];
  const n = Array.isArray(tasks) ? tasks.length : 0;
  if (n < 1) {
    cli.die(
      `sprint ratify: ${sid} has no tasks \u2014 a sprint plan is a collection of 1 or more tasks; add them first (scrumux sprint add ${sid} T-XXXX)`
    );
  }
  const d = ctx.today;
  const pending = row !== null && row["status"] === "ratified" ? pendingAdditions(row) : [];
  if (pending.length > 0) {
    guardedWrite(
      cli,
      ctx,
      ictx.io,
      sprintsPath(ctx),
      (doc) => mapEntries(doc, (row2) => row2["id"] === sid ? withAdditionsRatified(row2, by, d, authority) ?? row2 : row2)
    );
    sealBootstrap(ctx.gov, ctx.today);
    cli.data({ id: sid, additions_ratified: pending });
    return cli.emit(`${sid} addition(s) ratified: ${pending.join(", ")} \u2014 the sprint's original ratification is unchanged`);
  }
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    sprintsPath(ctx),
    (doc) => mapEntries(
      doc,
      (row2) => row2["id"] === sid ? { ...row2, status: "ratified", ratified: { by, date: d, authority }, updated_at: d } : row2
    )
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${sid} ratified`);
}
function sprintStatus(cli, ctx, ictx, args) {
  const sid = args[0] ?? "";
  const st = args[1] ?? "";
  if (sid === "" || st === "") cli.die("usage: scrumux sprint status SP-0001 complete|abandoned");
  if (st !== "complete" && st !== "abandoned") {
    cli.die("sprint status: only complete|abandoned here (ratification has its own command: scrumux sprint ratify)");
  }
  if (!refExists(sprintsPath(ctx), sid)) cli.die(`sprint status: ${sid} not found`);
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    sprintsPath(ctx),
    (doc) => mapEntries(doc, (row) => row["id"] === sid ? { ...row, status: st, updated_at: d } : row)
  );
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit(`${sid} -> ${st}`);
}
var MODULE17 = {
  verbs: () => VERBS_TSV17,
  usage: () => NOUN_USAGE["sprint"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "new":
        return sprintNew(cli, ctx, ictx, args);
      case "add":
        return sprintAdd(cli, ctx, ictx, args);
      case "update":
        return sprintUpdate(cli, ctx, ictx, args);
      case "descope":
        return sprintDescope(cli, ctx, ictx, args);
      case "ratify":
        return sprintRatify(cli, ctx, ictx, args);
      case "status":
        return sprintStatus(cli, ctx, ictx, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun sprint \u2014 verbs: new, add, update, descope, ratify, status. See: scrumux help sprint`
        );
    }
  }
};

// src/nouns/status.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { existsSync as existsSync17 } from "node:fs";
import { join as join40 } from "node:path";
var VERBS_TSV18 = `session	the orientation block; ALWAYS exits 0
planning	sprint report + decision queue + validation sweep
sprint	the sprint report alone
sweep	the validation sweep alone
`;
var USAGE13 = NOUN_USAGE["status"] ?? "";
var State = class {
  constructor(gov, report) {
    this.gov = gov;
    this.report = report;
  }
  refused = /* @__PURE__ */ new Set();
  loaded = /* @__PURE__ */ new Map();
  tasksLoaded = false;
  taskView = [];
  designLoaded = false;
  design = null;
  sprintComputed = false;
  unfinished = 0;
  flight = "";
  active = 0;
  ratified = "";
  /** `refuse_journal` — one visible refusal per FILE, and it goes in the report. */
  refuse(path) {
    if (this.refused.has(path)) return;
    this.refused.add(path);
    this.report.line(`scrumux status: error: ${journalUnreadable(path)}`);
    this.report.line("  the section(s) below that read it are EMPTY because it could not be read, not because there is nothing in it.");
  }
  /**
   * The memoised loader. Returns the parsed journal, or null for BOTH
   * absent and unreadable, because every use site treats the two the same
   * way (falls back to a default rendering). The two states stay
   * distinguishable where it matters: only the unreadable one prints, and
   * it prints here.
   */
  load(name) {
    const hit = this.loaded.get(name);
    if (hit !== void 0) return hit;
    const path = join40(this.gov, name);
    const r = readJournal(path);
    let v;
    if (r.kind === "ok") v = r.value;
    else if (r.kind === "absent") v = null;
    else {
      this.refuse(path);
      v = null;
    }
    this.loaded.set(name, v);
    return v;
  }
};
function jv(j, fallback, lines) {
  if (j === null) return [fallback];
  try {
    return lines(j);
  } catch {
    return [];
  }
}
function loadTasks(st) {
  if (st.tasksLoaded) return;
  st.tasksLoaded = true;
  const path = join40(st.gov, "tasks.json");
  const r = readJournal(path);
  if (r.kind === "absent") return;
  if (r.kind === "unreadable") {
    st.refuse(path);
    return;
  }
  try {
    st.taskView = entriesOf(r.value).map((e) => ({
      id: field(e, "id"),
      title: field(e, "title"),
      status: field(e, "status"),
      feature: field(e, "feature"),
      story: field(e, "story"),
      ordered: field(e, "task_order") !== null,
      review: field(e, "review")
    }));
  } catch {
    st.taskView = [];
  }
}
function tasksFilePresent(st) {
  return existsSync17(join40(st.gov, "tasks.json"));
}
function loadDesign(st) {
  if (st.designLoaded) return;
  st.designLoaded = true;
  const path = join40(st.gov, "design.json");
  const r = readJournal(path);
  if (r.kind === "absent") return;
  if (r.kind === "unreadable") {
    st.refuse(path);
    return;
  }
  st.design = r.value;
}
function designView2(st) {
  if (st.design === null) return null;
  const es = entriesOf(st.design);
  return {
    epics: es.filter((e) => field(e, "kind") === "epic"),
    features: es.filter((e) => field(e, "kind") === "feature")
  };
}
function computeSprint(st) {
  if (st.sprintComputed) return;
  st.sprintComputed = true;
  loadTasks(st);
  const sprints = st.load("sprints.json");
  if (sprints === null) return;
  let live;
  try {
    live = entriesOf(sprints).filter((s2) => {
      const t = field(s2, "status");
      return t === "proposed" || t === "ratified";
    });
  } catch {
    return;
  }
  st.active = live.length;
  if (st.active === 0) return;
  const matches = (tid) => st.taskView.filter((t) => t.id === tid);
  const out = [];
  for (const s2 of live) {
    const head = `${interp(field(s2, "id"))} [${interp(field(s2, "status"))}]` + (truthy(field(s2, "hotfix")) ? ` HOTFIX from ${interp(field(s2, "source_issue"))}` : ` epic ${interp(field(s2, "epic"))}`) + ":";
    out.push(head);
    for (const tid of arrayOf(s2, "tasks")) {
      for (const t of matches(tid)) {
        out.push(`  ${interp(tid)} [${interp(t.status)}] ${interp(t.title)}`);
      }
    }
  }
  st.flight = out.join("\n");
  let unfinished = 0;
  for (const s2 of live) {
    if (field(s2, "status") !== "ratified") continue;
    for (const tid of arrayOf(s2, "tasks")) {
      for (const t of matches(tid)) if (t.status !== "accepted") unfinished += 1;
    }
  }
  st.unfinished = unfinished;
  const rat = joinJq(live.filter((s2) => field(s2, "status") === "ratified").map((s2) => field(s2, "id")), ", ");
  st.ratified = rat !== "" ? rat : "the ratified sprint";
}
function sprintVerdictLine(st) {
  return st.unfinished > 0 ? `VERDICT: a ratified sprint has ${st.unfinished} unfinished task(s) \u2014 working that sprint is usually right, but planning alongside it is User's call (D-0004 was a gate; T-0144 made it advice).` : "VERDICT: no ratified sprint in flight \u2014 clear to assemble one (scrumux sprint new --epic E-XXXX, then scrumux sprint add; User ratifies).";
}
function sectionSprint(st, today) {
  computeSprint(st);
  loadDesign(st);
  const issues = st.load("issues.json");
  const r = st.report;
  const dv = designView2(st);
  r.line(`=== SPRINT STATUS (${today}) ===`);
  r.line("");
  r.line("--- Sprints in flight ---");
  if (st.load("sprints.json") !== null) {
    if (st.active > 0) r.line(st.flight);
    else r.line("(none proposed or ratified)");
  } else {
    r.line("(no sprints.json yet \u2014 first sprint: scrumux sprint new --epic E-XXXX)");
  }
  r.line("");
  r.line("--- Epic coverage (epic -> features -> stories -> tasks) ---");
  if (dv !== null) {
    for (const e of dv.epics) {
      r.line(`${interp(field(e, "id"))} ${interp(field(e, "name"))}:`);
      for (const fid of arrayOf(e, "features")) {
        for (const f of dv.features.filter((x) => field(x, "id") === fid)) {
          const ft = st.taskView.filter((t) => t.feature === fid);
          const ns = arrayOf(f, "stories").length;
          r.line(
            `  ${interp(fid)} ${interp(field(f, "name"))}: stories=${ns} tasks=${ft.length}` + (ns === 0 ? `  <- NO STORIES: scrumux story new --feature ${interp(fid)} ...` : "") + (ft.length === 0 ? "  <- NO TASKS" : "")
          );
        }
      }
    }
    r.line("");
    r.line("Features not in any epic:");
    const streamed = dv.epics.map((e) => field(e, "features")).filter(truthy);
    const inEpic = (streamed.length === 0 ? [[]] : streamed).flatMap((v) => Array.isArray(v) ? v : [v]);
    const orphans2 = dv.features.filter((f) => !inEpic.some((i) => i === field(f, "id")));
    if (orphans2.length === 0) r.line("  (none)");
    else for (const f of orphans2) {
      r.line(`  ${interp(field(f, "id"))} ${interp(field(f, "name"))}  <- assign: scrumux epic new --name ... --desc ... --feature ${interp(field(f, "id"))} (or extend an epic later)`);
    }
  } else {
    r.line("(no design.json \u2014 design gate first: scrumux feature new / scrumux story new)");
  }
  r.line("");
  r.line("--- Backlog tasks not sprint-ready ---");
  if (st.tasksLoaded && tasksFilePresent(st)) {
    const notReady = st.taskView.filter((t) => t.status === "proposed" || t.status === "ready").filter((t) => t.ordered === false || t.story === null);
    if (notReady.length === 0) r.line("  (all proposed/ready tasks have story + task order)");
    else for (const t of notReady) {
      r.line(
        `  ${interp(t.id)} ${interp(t.title)}` + (t.story === null ? `  MISSING story (scrumux task order ${interp(t.id)} --story S-XXXX ...)` : "") + (t.ordered === false ? `  MISSING order (scrumux task order ${interp(t.id)} --scope ... --verify ... --file "path | why")` : "")
      );
    }
  } else {
    r.line("(no tasks.json)");
  }
  r.line("");
  r.line("--- Open issues ---");
  r.lines(jv(issues, "(no issues.json)", (j) => {
    const open = entriesOf(j).filter((i) => field(i, "status") === "open");
    if (open.length === 0) return ["  (none open)"];
    return open.map((i) => {
      const sev = truthy(field(i, "severity")) ? interp(field(i, "severity")) : "unrated";
      const head = `  ${interp(field(i, "id"))} [${interp(field(i, "type"))}/${sev}] ${interp(field(i, "summary"))}`;
      return head + (field(i, "type") === "idea" ? "\n      feature-request shaped -> backlog process (scrumux feature + scrumux story), not promotion" : `
      hotfix lane if urgent: scrumux sprint new --hotfix --issue ${interp(field(i, "id"))}`);
    });
  }));
  r.line("");
  r.line("--- Candidates for next sprint (dependency-ordered by feature) ---");
  if (dv !== null && tasksFilePresent(st)) {
    const sprints = st.load("sprints.json");
    const sprinted = sprints === null ? [] : entriesOf(sprints).filter((s2) => field(s2, "status") === "proposed" || field(s2, "status") === "ratified").flatMap((s2) => arrayOf(s2, "tasks"));
    const ordered = [
      ...dv.features.filter((f) => arrayOf(f, "dependencies").length === 0),
      ...dv.features.filter((f) => arrayOf(f, "dependencies").length > 0)
    ];
    for (const f of ordered) {
      const fid = field(f, "id");
      const ft = st.taskView.filter((t) => t.feature === fid && (t.status === "proposed" || t.status === "ready") && !sprinted.some((s2) => s2 === t.id));
      if (ft.length === 0) continue;
      const deps = arrayOf(f, "dependencies");
      r.line(`${interp(fid)} ${interp(field(f, "name"))}` + (deps.length > 0 ? ` (after ${joinJq(deps, ", ")})` : "") + ":");
      for (const t of ft) {
        r.line(`  ${interp(t.id)} ${interp(t.title)}` + (t.ordered && t.story !== null ? `  [READY: scrumux sprint add SP-XXXX ${interp(t.id)}]` : "  [not ready \u2014 see section above]"));
      }
    }
  }
  r.line("");
  r.line(sprintVerdictLine(st));
}
function sectionSweep(st, today) {
  const issues = st.load("issues.json");
  const r = st.report;
  r.line(`=== ISSUES PENDING VALIDATION (${today}) \u2014 rule on these before planning (T-0042) ===`);
  if (issues === null) {
    r.line("pending: 0 (no issues.json)");
    return;
  }
  let list;
  try {
    list = entriesOf(issues).filter((i) => field(i, "status") === "open" && field(i, "validation") === null && field(i, "authorization") === null).map((i) => {
      const sev = truthy(field(i, "severity")) ? interp(field(i, "severity")) : "unset";
      return `${interp(field(i, "id"))} ${sev} ${cslice(interp(field(i, "summary")), 0, 100)}`;
    });
  } catch {
    list = [];
  }
  const text2 = list.join("\n");
  const count = text2 === "" ? 0 : text2.split("\n").filter((l) => l.length > 0).length;
  if (text2 !== "") r.line(text2);
  r.line(`pending: ${count}${count !== 0 ? " \u2014 dispatch the issue-validator agent per issue; record verdicts via scrumux issue validate" : ""}`);
}
function gitLine(workRoot) {
  const git2 = (args) => {
    try {
      return execFileSync2("git", args, { cwd: workRoot, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return null;
    }
  };
  if (git2(["rev-parse", "--git-dir"]) === null) return null;
  const head = (git2(["log", "-1", "--format=%h %s"]) ?? "").replace(/\n+$/, "");
  const dirty = (git2(["status", "--porcelain"]) ?? "") !== "" ? " [DIRTY TREE]" : "";
  return `commit: ${head}${dirty}`;
}
function sectionSession(st, today, workRoot) {
  const r = st.report;
  r.line(`=== SESSION BRIEF (${today}) \u2014 generated by scrumux status session ===`);
  const g = gitLine(workRoot);
  if (g !== null) r.line(g);
  computeSprint(st);
  r.line(sprintVerdictLine(st));
  if (st.flight !== "") {
    for (const l of st.flight.split("\n")) {
      if (l.startsWith("SP-") || l.startsWith("  T-")) r.line(l);
    }
  }
  loadTasks(st);
  const ip = joinJq(st.taskView.filter((t) => t.status === "in_progress").map((t) => `${interp(t.id)} ${interp(t.title)}`), "; ");
  r.line(`in_progress: ${ip === "" ? "none" : ip}`);
  const tasks = st.load("tasks.json");
  const wait = jv(tasks, "", (j) => [joinJq(entriesOf(j).filter((e) => {
    if (field(e, "status") !== "in_review") return false;
    const a = field(e, "acceptance");
    return a === null ? true : field(a, "accepted") !== true;
  }).map((e) => field(e, "id")), " ")])[0] ?? "";
  const sprints = st.load("sprints.json");
  const prop = jv(sprints, "", (j) => [joinJq(entriesOf(j).filter((s2) => field(s2, "status") === "proposed").map((s2) => field(s2, "id")), " ")])[0] ?? "";
  r.line(`awaiting User: tasks[${wait === "" ? "none" : wait}] proposed-sprints[${prop === "" ? "none" : prop}] (ratify/accept are theirs alone)`);
  const log = st.load("log.json");
  const decisions = st.load("decisions.json");
  const proposedDecisions = jv(decisions, "", (j) => [joinJq(entriesOf(j).filter((e) => standingOf(e).status === "proposed" && standingOf(e).acknowledgedBy === "").map((e) => field(e, "id")), " ")])[0] ?? "";
  if (proposedDecisions !== "") {
    r.line(`awaiting User: proposed-decisions[${proposedDecisions}] (recorded without authority \u2014 binding only once User ratifies)`);
  }
  r.line("recent log:");
  r.lines(jv(log, "  (none)", (j) => entriesOf(j).slice(-3).map((e) => `  ${interp(field(e, "id"))} ${interp(field(e, "title"))}`)));
  r.line("recent decisions:");
  r.lines(jv(decisions, "  (none)", (j) => {
    const es = entriesOf(j);
    const dead = es.map((e) => bindingSupersedes(e)).filter((s2) => s2 !== null);
    return es.filter((e) => !dead.some((d) => d === field(e, "id")) && standingOf(e).status !== "rejected").slice(-2).map((e) => `  ${interp(field(e, "id"))} ${interp(field(e, "title"))}${standingOf(e).status === "proposed" ? " [PROPOSED \u2014 not ratified]" : ""}`);
  }));
  const issues = st.load("issues.json");
  const nopen = jv(issues, "0", (j) => [String(entriesOf(j).filter((i) => field(i, "status") === "open").length)])[0] ?? "";
  const ids = jv(issues, "", (j) => {
    const open = entriesOf(j).filter((i) => field(i, "status") === "open").map((i) => field(i, "id"));
    return [open.length === 0 ? "" : ` (${joinJq(open, " ")})`];
  })[0] ?? "";
  r.line(`open issues: ${nopen}${ids}`);
  r.line("next: state the active sprint before touching code (minimum-planning-requirements); no ratified sprint -> session-open skill; implementing -> implement-sop; closing -> session-review. Details: session-start skill.");
}
function statusPlanning(st, today) {
  st.report.line(`=== PLANNING STATUS (${today}) \u2014 generated by scrumux status planning ===`);
  st.report.line("");
  sectionSprint(st, today);
  st.report.line("");
  sectionSweep(st, today);
}
function tellUnfinished(cli, st) {
  if (st.unfinished <= 0) return;
  cli.tell("sprint-in-flight", `${st.ratified} has ${st.unfinished} unfinished task(s) \u2014 working that sprint is usually right, but planning alongside it is User's call (D-0004 was a gate; T-0144 made it advice).`);
}
var MODULE18 = {
  verbs: () => VERBS_TSV18,
  usage: () => USAGE13,
  run(cli, ctx, verb, args) {
    if (args.length > 0) cli.dieUsage(`status ${verb} takes no arguments`);
    const report = new Report(cli.json, ctx.io);
    const st = new State(ctx.roots.gov, report);
    switch (verb) {
      case "session":
        sectionSession(st, ctx.today, ctx.roots.workRoot);
        break;
      case "sprint":
        sectionSprint(st, ctx.today);
        break;
      case "sweep":
        sectionSweep(st, ctx.today);
        break;
      case "planning":
        statusPlanning(st, ctx.today);
        break;
      default:
        return cli.dieUsage(`unknown verb '${verb}' for noun status \u2014 verbs: session, planning, sprint, sweep. See: scrumux help status`);
    }
    if (verb === "sprint" || verb === "planning") tellUnfinished(cli, st);
    if (cli.json) cli.data({ lines: report.dataLines() });
    return cli.emit("");
  }
};

// src/nouns/story.ts
import { join as join41 } from "node:path";
var VERBS_TSV19 = "new	the only verb\n";
var USAGE14 = NOUN_USAGE["story"] ?? "";
var DESIGN_SEED3 = '{"entries": []}';
function parseStoryFlags(args, die) {
  const f = { feature: "", narrative: "", criteria: [] };
  let i = 0;
  const value = (flag) => {
    const v = args[i + 1];
    if (v === void 0) die(`story: ${flag} needs a value \u2014 see: scrumux help story`);
    i += 2;
    return v;
  };
  while (i < args.length) {
    const a = args[i];
    switch (a) {
      case "--feature":
        f.feature = value(a);
        break;
      case "--narrative":
        f.narrative = value(a);
        break;
      case "--criterion":
        f.criteria.push(value(a));
        break;
      default:
        die(`story: unknown flag ${a} \u2014 see: scrumux help story`);
    }
  }
  return f;
}
function storyNew(cli, ctx, io, args) {
  const f = parseStoryFlags(args, (m) => cli.die(m));
  if (f.feature === "") cli.die("story: --feature is required");
  if (f.narrative === "") {
    cli.die('story: --narrative is required \u2014 "As the <specific who>, I <do what> so that <outcome>". The who is a named person or system, never "a user". GOOD "As User, I accept a task directly \u2014 my documented approval is the review \u2014 and acceptance refuses any task whose verify receipt is red, so a false close cannot recur" (S-0069). GOOD "As User, I deploy the harness into another repo and every registered command actually runs there, and a cold agent in either lane arrives at working code without hunting" (S-0070). BAD "As a user, I want acceptance to work" \u2014 no named who, no outcome, and nothing an acceptance criterion could be written against.');
  }
  if (f.criteria.length === 0) {
    cli.die('story: at least one --criterion is required (acceptance_criteria, minItems 1) \u2014 each one an observable check a person could confirm or deny by looking at the running thing or its record: a shape returned, a refusal given, a record written, a command exiting a stated code. One behaviour per criterion; a criterion with "and" in it is usually two. GOOD "scrumux accept T-XXXX --authority refuses a red or missing receipt and is write-once" (S-0069). GOOD "harness verify executes every registered surface" (S-0070). GOOD "cold probes of the standalone and app lanes pass with task-verify under 15s and close under 10s" (S-0070). BAD "acceptance is reliable" \u2014 an adjective, not a check.');
  }
  const design = join41(ctx.gov, "design.json");
  refusing(cli, () => ensureFile(design, DESIGN_SEED3));
  if (!refExists(design, f.feature, (r) => field(r, "kind") === "feature" ? field(r, "id") : void 0)) {
    cli.die(`story: feature ${f.feature} not found \u2014 add it first: scrumux feature new --name ... --desc ...`);
  }
  const opts = { gov: ctx.gov, today: ctx.today, env: ctx.env, err: (s2) => io.err(s2) };
  const id = refusing(cli, () => {
    const res = appendWithId(
      design,
      (doc) => entriesOf(doc).filter((r) => field(r, "kind") === "story").map((r) => field(r, "id")),
      "S",
      (doc, newId) => {
        const appended = appendEntry(doc, {
          kind: "story",
          id: newId,
          feature: f.feature,
          narrative: f.narrative,
          acceptance_criteria: [...f.criteria]
        });
        return mapEntries(appended, (r) => {
          if (field(r, "kind") !== "feature" || field(r, "id") !== f.feature) return r;
          const o = r;
          return { ...o, stories: [...asArray(field(r, "stories")) ?? [], newId] };
        });
      },
      opts
    );
    warnReseal(cli, res.resealWarning);
    return res.id;
  });
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, id);
}
var MODULE19 = {
  verbs: () => VERBS_TSV19,
  usage: () => USAGE14,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "new":
        return storyNew(cli, nounContext(ctx), ctx.io, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun story \u2014 the only verb is 'new'. See: scrumux help story`
        );
    }
  }
};

// src/nouns/task.ts
import { join as join49 } from "node:path";

// src/nouns/task/accept-extras.ts
import { join as join45 } from "node:path";

// src/nouns/task/shared.ts
import { existsSync as existsSync18, readFileSync as readFileSync31 } from "node:fs";
import { spawnSync as spawnSync11 } from "node:child_process";
import { join as join42 } from "node:path";
function jqRaw3(v) {
  if (v === void 0 || v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof RawNumber) return v.text;
  if (typeof v === "number") return String(v);
  return JSON.stringify(v);
}
var interp2 = jqRaw3;
function rawOr(v, dflt) {
  if (v === void 0 || v === null || v === false) return dflt;
  return jqRaw3(v);
}
function obj5(v) {
  if (v === null || v === void 0 || typeof v !== "object" || Array.isArray(v) || v instanceof RawNumber) return null;
  return v;
}
function arr3(v) {
  return Array.isArray(v) ? v : [];
}
function rows4(path) {
  if (!existsSync18(path)) return [];
  try {
    const doc = parsePreservingNumbers(readFileSync31(path, "utf8"));
    const o = obj5(doc);
    if (o === null) return [];
    return arr3(o["entries"]);
  } catch {
    return [];
  }
}
function rowById3(path, id) {
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o !== null && o["id"] === id) return o;
  }
  return null;
}
var tasksPath2 = (ctx) => join42(ctx.gov, "tasks.json");
var sprintsPath2 = (ctx) => join42(ctx.gov, "sprints.json");
function directOut(io) {
  return (line) => io.out(line + "\n");
}
function stripTrailingNewlines3(s2) {
  return s2.replace(/\n+$/, "");
}
function tailOfCapture(captured, n) {
  return stripTrailingNewlines3(captured).split("\n").slice(-n);
}
function cliPath(ctx) {
  return join42(ctx.scriptsDir, "scrumux");
}
function runScrumux(ctx, args) {
  const r = spawnSync11(process.execPath, [cliPath(ctx), ...args], {
    cwd: ctx.cwd,
    env: ctx.env,
    encoding: "utf8"
  });
  return {
    rc: r.status === null || r.status === void 0 ? 127 : r.status,
    stdout: typeof r.stdout === "string" ? r.stdout : "",
    stderr: typeof r.stderr === "string" ? r.stderr : ""
  };
}
function bearingChangedPaths(bearing2) {
  const out = [];
  for (const line of bearing2.split("\n")) {
    const f = line.trim().split(/\s+/);
    if (f[0] === "path" && f[1] === "changes" && f[2] !== void 0) out.push(f[2]);
  }
  return out.join(" ");
}
function bearingChangeIds(bearing2) {
  const out = [];
  for (const line of bearing2.split("\n")) {
    const m = /^([DI]-[0-9]{4}) \[changes /.exec(line);
    if (m !== null) out.push(m[1]);
  }
  return out;
}
function bearingRecordLines(bearing2) {
  return bearing2.split("\n").filter((l) => /^[DI]-[0-9]{4} /.test(l));
}

// src/nouns/task/verify.ts
import { existsSync as existsSync19, mkdirSync as mkdirSync8, rmdirSync as rmdirSync2 } from "node:fs";
import { join as join44 } from "node:path";

// src/nouns/task/evidence.ts
import { mkdirSync as mkdirSync7, writeFileSync as writeFileSync10 } from "node:fs";
import { join as join43 } from "node:path";
var EVIDENCE_DIR = ".evidence";
var EVIDENCE_LINES = 40;
var LINE_CAP = 400;
var evidencePath = (gov, tid, kind) => join43(gov, EVIDENCE_DIR, `${tid}.${kind}.txt`);
function writeEvidence(gov, tid, kind, run, output) {
  try {
    const dir = join43(gov, EVIDENCE_DIR);
    mkdirSync7(dir, { recursive: true });
    writeFileSync10(join43(dir, ".gitignore"), "*\n");
    const lines = output.replace(/\n+$/, "").split("\n").slice(-EVIDENCE_LINES).map((l) => l.length > LINE_CAP ? `${l.slice(0, LINE_CAP)}\u2026` : l);
    const head = [
      `# scrumux task verify evidence (${kind}) \u2014 ${tid}`,
      `# command: ${run.command}`,
      `# rc: ${run.rc}`,
      `# date: ${run.date}`,
      `# at_epoch: ${run.atEpoch}`,
      `# output (last ${EVIDENCE_LINES} lines of the verification command):`
    ];
    writeFileSync10(evidencePath(gov, tid, kind), `${[...head, ...lines].join("\n")}
`);
  } catch {
  }
}

// src/nouns/task/verify.ts
var VERIFY_TIMEOUT_SECONDS = 600;
function taskVerify(cli, ctx, ictx, args) {
  const io = ictx.io;
  const tasks = tasksPath2(ctx);
  const health = join44(ctx.gov, "repo-health.json");
  const tid = args[0] ?? "";
  if (tid === "") cli.dieUsage("usage: scrumux task verify T-0001");
  if (!existsSync19(tasks)) cli.die("no governance/tasks.json");
  const row = rows4(tasks).map((r) => obj5(r)).find((o) => o !== null && o["id"] === tid);
  const order = row === void 0 ? null : obj5(row["task_order"]);
  const vc = order === null ? "" : rawOr(order["verification_command"], "");
  if (vc === "") {
    cli.die(`${tid} has no task_order.verification_command \u2014 task-breakdown skill first (scrumux task order ${tid} --verify ...)`);
  }
  let vcRc = 1;
  let checksRun = 0;
  let checksFailed = 0;
  let vcOutput = "";
  const runCheck = (label, command, timeoutSeconds = VERIFY_TIMEOUT_SECONDS) => {
    cli.say(`--- ${label}`);
    cli.say(`$ ${command}`);
    const r = runWithTimeout(timeoutSeconds, command, {
      cwd: ctx.workRoot,
      env: ctx.env,
      capture: true,
      combine: true
    });
    for (const l of tailOfCapture(r.stdout, 20)) io.out(l + "\n");
    if (vcOutput === "") vcOutput = r.stdout;
    if (r.code === 0) {
      cli.say("RESULT: PASS (exit 0)");
      cli.pass(label, "exit 0");
    } else if (r.code === 142) {
      cli.say(`RESULT: FAIL (TIMED OUT \u2014 declared timeout_seconds exceeded, T-0078: stopped after ${timeoutSeconds} s, with every process it started)`);
      cli.fail(label, `TIMED OUT \u2014 declared timeout_seconds exceeded (T-0078): stopped after ${timeoutSeconds} s, its whole process group with it (SX-029)`);
    } else {
      cli.say(`RESULT: FAIL (exit ${r.code})`);
      cli.fail(label, `exit ${r.code}`);
    }
    cli.say("");
    return r.code;
  };
  cli.say(`=== TASK VERIFY ${tid} (${ctx.today}) ===`);
  cli.say("");
  cli.say("EVIDENCE-BEGIN");
  vcRc = runCheck(`verification_command for ${tid}`, vc);
  checksRun += 1;
  if (vcRc !== 0) checksFailed += 1;
  if (existsSync19(health)) {
    const results = runHealthChecks(ctx, health);
    for (const res of results) {
      cli.say(`--- repo-health: ${res.name}`);
      cli.say(`$ ${res.registeredCommands}`);
      printTailOfFile(io, res.out, 20);
      checksRun += 1;
      if (res.status === "PASS") {
        cli.say("RESULT: PASS (exit 0)");
        cli.pass(`repo-health/${res.name}`, "exit 0");
      } else if (res.status === "TELL") {
        cli.say(`RESULT: TELL (advisory \u2014 type=lint check exited ${res.rc}; a red linter is a finding, not this task's failure: T-0144/D-0072 boundary 7. Not counted in checks_failed.)`);
        cli.tell(`repo-health/${res.name}`, `type=lint check exited ${res.rc} \u2014 a red linter is a finding, not this task's failure (T-0144/D-0072 boundary 7). Not counted in checks_failed.`);
      } else if (res.status === "TIMEOUT") {
        cli.say("RESULT: FAIL (TIMED OUT \u2014 declared timeout_seconds exceeded, T-0078)");
        cli.fail(`repo-health/${res.name}`, "TIMED OUT (T-0078)");
        checksFailed += 1;
      } else {
        cli.say(`RESULT: FAIL (exit ${res.rc})`);
        cli.fail(`repo-health/${res.name}`, `exit ${res.rc}`);
        checksFailed += 1;
      }
      cli.say("");
    }
  } else {
    cli.say("--- repo-health: none registered (scrumux health add --name ... --command ... \u2014 tracked as T-0016)");
    cli.say("");
  }
  cli.say("EVIDENCE-END");
  cli.say("");
  const covered = row === void 0 ? [] : coveredPaths(row);
  const settled = writeReceipt(cli, ctx, tid, vc, vcRc, checksRun, checksFailed, io, vcOutput, covered);
  cli.data({
    id: tid,
    receipt: { command: vc, rc: vcRc, checks_run: checksRun, checks_failed: checksFailed }
  });
  const fails = cli.fails();
  if (settled) {
    if (fails > 0) {
      cli.emit(`VERDICT: ${fails} check(s) FAILED on accepted ${tid} \u2014 recorded as post-acceptance DRIFT (D-S018). The acceptance and its receipt are unchanged and no status change is needed. Look at what changed around it; if it matters, raise it: scrumux issue new --type defect --task ${tid} ... (scrumux-app shows the drift to the operator).`);
    }
    return cli.emit(`VERDICT: all checks pass \u2014 recorded as a post-acceptance check on accepted ${tid} (D-S018). The acceptance and its receipt are unchanged; no log entry or status change is needed.`);
  }
  if (fails > 0) {
    cli.emit(`VERDICT: ${fails} check(s) FAILED. The task stays in_progress (D-0006). If the cause is not obvious, dispatch the debugger agent \u2014 never patch around a failure you don't understand.`);
  }
  return cli.emit(`VERDICT: all checks pass. Log it (scrumux log new --task ${tid} --verified "<EVIDENCE block>"), then scrumux task status ${tid} in_review. Acceptance is User's and reads the receipt above (scrumux task accept ${tid} --by User --authority ...).`);
}
function runHealthChecks(ctx, healthPath) {
  const entries = rows4(healthPath);
  const results = [];
  const childEnv = { ...ctx.env, HARNESS_IN_HEALTH_CHECKS: "1" };
  const tsvStr = (v) => v === void 0 || v === null ? "" : jqRaw3(v).replace(/\\/g, "\\\\").replace(/\t/g, "\\t").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
  for (const e of entries) {
    const o = obj5(e);
    if (o === null) continue;
    const name = tsvStr(o["name"]);
    if (name === "") continue;
    const command = tsvStr(o["command"]);
    const to = numberOr(o["timeout_seconds"], 120);
    const type = o["type"] === void 0 || o["type"] === null || o["type"] === false ? "test" : tsvStr(o["type"]);
    const r = runWithTimeout(to, command, { cwd: ctx.root, env: childEnv, capture: true, combine: true });
    const status = r.code === 0 ? "PASS" : r.code === 142 ? "TIMEOUT" : type === "lint" ? "TELL" : "FAIL";
    results.push({
      name,
      status,
      rc: r.code,
      out: r.stdout,
      registeredCommands: entries.map((x) => obj5(x)).filter((x) => x !== null && jqRaw3(x["name"]) === name).map((x) => jqRaw3(x["command"])).join("\n")
    });
  }
  return results;
}
function numberOr(v, dflt) {
  if (v === void 0 || v === null || v === false) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function printTailOfFile(io, content, n) {
  if (content === "") return;
  const endsWithNewline = content.endsWith("\n");
  const parts = content.split("\n");
  if (endsWithNewline) parts.pop();
  const tail = parts.slice(-n);
  for (let i = 0; i < tail.length; i++) {
    const last = i === tail.length - 1;
    io.out(tail[i] + (last && !endsWithNewline ? "" : "\n"));
  }
}
function writeReceipt(cli, ctx, tid, vc, rc, checksRun, checksFailed, io, output = "", covered = []) {
  const probe = join44(ctx.gov, `.receipt-probe.${process.pid}`);
  try {
    mkdirSync8(probe);
  } catch {
    io.err(`task verify: could not record the receipt on ${tid} \u2014 governance/ is not writable (read-only agent sandbox?). The verdict above stands; re-run outside the sandbox to leave a receipt for scrumux task accept.
`);
    return accepted(ctx, tid);
  }
  try {
    rmdirSync2(probe);
  } catch {
  }
  const atEpoch = Math.floor(Date.now() / 1e3);
  const run = { date: ctx.today, at_epoch: atEpoch, command: vc, rc, checks_run: checksRun, checks_failed: checksFailed };
  const settled = accepted(ctx, tid);
  writeEvidence(ctx.gov, tid, settled ? "post-acceptance" : "verify", { command: vc, rc, date: ctx.today, atEpoch }, output);
  const receipt = { ...run, file_hashes: fileHashes(ctx.workRoot, covered) };
  try {
    writeJson(
      tasksPath2(ctx),
      (doc) => mapEntries(
        doc,
        (r) => r["id"] !== tid ? r : isAccepted(r) ? withPostAcceptanceCheck(r, run) : withReceipt(r, receipt, run)
      ),
      { gov: ctx.gov, today: ctx.today, env: ctx.env, err: () => {
      } }
    );
    if (settled) {
      const drift = rc !== 0 || checksFailed !== 0;
      cli.say(`RECEIPT: ${tid} is ACCEPTED, so its acceptance receipt is frozen (D-S018) and was not changed. This run is recorded as a post-acceptance check (rc=${rc}, checks_run=${checksRun}, checks_failed=${checksFailed})${drift ? " \u2014 DRIFT: the accepted work does not pass its own command here now. That is drift to look into (what changed around it?), not a broken task; session check and scrumux-app surface it." : "."}`);
    } else {
      cli.say(`RECEIPT: recorded on ${tid} (rc=${rc}, checks_run=${checksRun}, checks_failed=${checksFailed})`);
    }
  } catch {
    io.err(`task verify: the receipt write on ${tid} FAILED \u2014 the verdict above stands, but scrumux task accept will refuse ${tid} until a receipt exists. Retry: .claude/scripts/scrumux task verify ${tid}
`);
  }
  return settled;
}
function accepted(ctx, tid) {
  const current = rows4(tasksPath2(ctx)).map((r) => obj5(r)).find((o) => o !== null && o["id"] === tid) ?? null;
  return current !== null && isAccepted(current);
}

// src/nouns/task/accept-extras.ts
var SHELL_SIGNALS = {
  SIGHUP: 1,
  SIGINT: 2,
  SIGQUIT: 3,
  SIGKILL: 9,
  SIGSEGV: 11,
  SIGPIPE: 13,
  SIGALRM: 14,
  SIGTERM: 15
};
function rerunVerification(cli, ctx, tid, command, seconds = VERIFY_TIMEOUT_SECONDS) {
  const started = Date.now();
  const r = runWithTimeout(seconds, command, { cwd: ctx.workRoot, env: ctx.env, capture: true, combine: true });
  const out = stripTrailingNewlines3(r.stdout);
  const tail5 = out.split("\n").slice(-5).join("\n");
  if (r.timedOut) {
    const elapsed = Math.round((Date.now() - started) / 1e3);
    cli.die(`accept: ${tid}'s verification re-run was STOPPED after ${elapsed} s \u2014 it passed the ${seconds} s ceiling task verify gives an order's command, so acceptance stopped it and every process it started (SIGTERM, then SIGKILL). Nothing was accepted.
  command: ${command}
  output:  ${tail5}
A check that needs longer than that cannot be accepted as it stands: make it finish inside the ceiling (split it, or move the slow part to a deployed check the operator runs), or find out why it hung.`);
  }
  const code = r.signal === null ? r.code : 128 + (SHELL_SIGNALS[r.signal] ?? 0);
  if (code !== 0) {
    cli.die(`accept: ${tid}'s own verification command FAILED when re-run just now (exit ${code}), even though its receipt is green.
  command: ${command}
  output:  ${tail5}
Acceptance re-runs rather than trusting a receipt, because a receipt records what happened when the agent ran it and cannot record whether the command still proves what the order asked. Either the tree changed since the receipt, or the command does not do what the receipt implies. Neither is something to accept.`);
  }
}
function acceptedFingerprint(ctx, command) {
  return checkFingerprint(ctx.workRoot, command);
}
function issueTell(cli, ctx, task, tid) {
  const iid = task === null || typeof task["issue"] !== "string" ? "" : task["issue"];
  if (iid === "") return;
  const row = rows4(join45(ctx.gov, "issues.json")).map((r) => obj5(r)).find((o) => o !== null && o["id"] === iid) ?? null;
  const status = row === null ? "unknown" : rawOr(row["status"], "unknown");
  cli.data({ issue: iid, issue_status: status });
  if (status === "resolved" || status === "rejected") return;
  cli.tell("fixes issue", `${tid} fixes ${iid} \u2014 resolve it with scrumux issue update ${iid} --status resolved (a person's call: nothing was written to the issue, because a task can fix part of one)`);
}

// src/nouns/task/lint.ts
import { existsSync as existsSync21 } from "node:fs";
import { join as join47 } from "node:path";

// src/nouns/task/reader.ts
var HOLLOW_GREENS = [
  "a test that SKIPS when its dependency is down (exit 0 with nothing proved) \u2014 make it fail instead",
  'an assertion that cannot fail (e.g. "not unreachable" also passes on a 404) \u2014 assert the positive outcome',
  "a test that writes into real shared data (a vault, a database, a folder other work reads) \u2014 acceptance re-runs the command, so it pollutes again; use a throwaway target or clean up",
  'a "nothing remains" check that enumerates the ids it expects instead of diffing the store against a snapshot taken before the run \u2014 what it did not expect to create is invisible to it',
  "an assertion over an empty input (a loop over no results, a search that returned []) \u2014 it proves nothing; assert the input is non-empty first"
];
function readerQuestion(verificationCommand, failsWhen) {
  const declared = failsWhen.trim() === "" ? 'This order declares no failure case \u2014 say what must make the check go red: scrumux task order \u2026 --fails-when "<the broken state this command must catch>".' : `This order says the check must FAIL when: ${failsWhen.trim()} \u2014 prove that case goes red before calling it green.`;
  return `READER (\xA74b): weakest artifact that passes '${verificationCommand}' \u2014 would you accept it? A green receipt is not a check that proves its claim; if a hollow artifact passes, the command is a proxy \u2014 fix it or stop the check claiming it. Hollow greens seen in practice: ${HOLLOW_GREENS.map((h, i) => `(${i + 1}) ${h}`).join("; ")}. ${declared}`;
}

// src/nouns/task/scope-paths.ts
import { existsSync as existsSync20 } from "node:fs";
import { isAbsolute as isAbsolute3, join as join46 } from "node:path";
var URL_SPAN = /\b[A-Za-z][A-Za-z0-9+.-]*:\/\/\S*/g;
var HOST_PORT_SPAN = /\b[A-Za-z0-9][A-Za-z0-9.-]*:[0-9]{2,5}(?:\/\S*)?/g;
var KNOWN_SUFFIX = /\.(py|sh|json|md|MD)$/;
var HAS_EXTENSION = /(^|\/)[^/]*\.[A-Za-z0-9]{1,10}$/;
var ENV_PREFIX = /^[A-Z][A-Z0-9_]*_[A-Z0-9_]*\//;
function isFileShaped(tok, workRoot) {
  if (!(tok.includes("/") || KNOWN_SUFFIX.test(tok))) return false;
  if (/^[DITSFE]-[0-9]/.test(tok)) return false;
  if (tok.startsWith("//")) return false;
  if (ENV_PREFIX.test(tok)) return false;
  if (HAS_EXTENSION.test(tok)) return true;
  const onDisk = isAbsolute3(tok) ? tok : join46(workRoot, tok);
  return existsSync20(onDisk);
}
function unlistedScopePaths(scopeText, listed, workRoot, workDirs = []) {
  const have = listed.filter((p) => p !== "");
  const out = [];
  const text2 = scopeText.replace(URL_SPAN, " ").replace(HOST_PORT_SPAN, " ");
  for (const raw of text2.replace(/[^A-Za-z0-9_./-]/g, " ").split(/\s+/)) {
    const tok = raw.replace(/\.+$/, "").replace(/^\.\//, "");
    if (tok === "" || out.includes(tok) || namesListed(tok, have, workDirs)) continue;
    if (isFileShaped(tok, workRoot)) out.push(tok);
  }
  return out;
}
function namesListed(tok, listed, workDirs = []) {
  if (listed.includes(tok)) return true;
  if (workDirs.some((d) => listed.includes(`${d}/${tok}`))) return true;
  const suffixed = listed.filter((p) => p.endsWith(`/${tok}`)).length;
  return tok.includes("/") ? suffixed >= 1 : suffixed === 1;
}

// src/nouns/task/lint.ts
function needValue(cli, args, i) {
  const v = args[i];
  if (v === void 0) cli.die(`task: ${args[i - 1]} needs a value \u2014 see: scrumux help task`);
  return v;
}
function taskLint(cli, ctx, _ictx, args) {
  const tasks = tasksPath2(ctx);
  if (!existsSync21(tasks)) {
    cli.die("no governance/tasks.json \u2014 create tasks first: scrumux task new --title ... --check ...");
  }
  let hotfix = 0;
  let idsStr = "";
  for (let i = 0; i < args.length; ) {
    const a = args[i];
    if (a === "--hotfix") {
      hotfix = 1;
      i += 1;
      continue;
    }
    if (a === "--feature") {
      const fid = needValue(cli, args, i + 1);
      i += 2;
      const matched = rows4(tasks).map((r) => obj5(r)).filter((o) => o !== null && o["feature"] === fid).map((o) => jqRaw3(o["id"])).join(" ");
      idsStr = `${idsStr} ${matched}`;
      if (idsStr.replace(/ /g, "") === "") {
        cli.die(`no tasks for feature ${fid} \u2014 create them: scrumux task new --feature ${fid} ...`);
      }
      continue;
    }
    if (/^T-[0-9]{4}$/.test(a)) {
      idsStr = `${idsStr} ${a}`;
      i += 1;
      continue;
    }
    cli.dieUsage("usage: scrumux task lint T-0001 [T-0002 ...] | scrumux task lint --feature F-0001 [--hotfix]");
  }
  if (idsStr.replace(/ /g, "") === "") {
    cli.dieUsage("usage: scrumux task lint T-0001 [...] | scrumux task lint --feature F-0001");
  }
  const ids = idsStr.split(/\s+/).filter((s2) => s2 !== "");
  for (const tid of ids) {
    const tell = (m) => cli.tell(tid, m);
    const failRow = (m) => cli.fail(tid, m);
    const warnRow = (m) => cli.warn(tid, m);
    cli.say(`== ${tid} ==`);
    const row = rows4(tasks).map((r) => obj5(r)).find((o) => o !== null && o["id"] === tid);
    if (row === void 0) {
      failRow(`${tid} not found in tasks.json \u2014 scrumux task new first`);
      continue;
    }
    const check2 = rawOr(row["acceptance_check"], "");
    const storyRaw = rawOr(row["story"], "");
    const order = obj5(row["task_order"]);
    const hasOrder = row["task_order"] !== void 0 && row["task_order"] !== null;
    const light = order !== null && order["light"] === true;
    const lightfail = (m) => {
      if (light) tell(m);
      else failRow(m);
    };
    if (check2 !== "") cli.say(`  check: ${check2}`);
    if (check2 === "") {
      failRow("no acceptance_check \u2014 stated before work starts (CLAUDE.MD); checks are immutable after task new: recreate the task with scrumux task new --check");
    }
    if (light) {
      cli.say("  lane: light (D-0073) \u2014 story and context-files findings are TELLs here; the acceptance check and the one verification command are not (boundary 4)");
    }
    if (hotfix === 0) {
      if (storyRaw === "" || storyRaw === "null") {
        lightfail(`no story \u2014 atomicity needs exactly one user story (D-0006): scrumux task order ${tid} --story S-XXXX ...`);
      } else if (!refExistsAny(ctx.gov, storyRaw)) {
        failRow(`story ${storyRaw} does not resolve in design.json \u2014 create it: scrumux story new --feature F-XXXX ...`);
      }
    }
    if (!hasOrder || order === null) {
      failRow(`no task_order (D-0005): scrumux task order ${tid} --scope ... --verify ... --file "path | why"`);
      continue;
    }
    const vc = rawOr(order["verification_command"], "");
    if (vc === "") failRow("empty verification_command \u2014 one command that proves the acceptance check (D-0006)");
    if (vc.includes(" && ") || vc.includes(" ; ") || vc.includes(" || ")) {
      failRow(`verification_command looks composite ('${vc}') \u2014 atomicity wants exactly ONE command; wrap multi-step verification in a script and point --verify at it`);
    }
    if (vc.startsWith("tests/")) {
      tell(`verification_command '${vc}' names a suite without an interpreter \u2014 write 'sh ${vc}'. It may run today only because that file happens to be executable; 27 of 38 suites are not, and the order must state how to run its suite rather than depend on a mode nobody set deliberately (D-0041)`);
    }
    cli.note(tid, readerQuestion(vc, rawOr(order["fails_when"], "")));
    if (arr3(order["out_of_scope"]).length === 0) {
      tell('out_of_scope is empty \u2014 name what must NOT be touched (D-0005); at minimum the adjacent files you considered and excluded. GOOD --out "Any other exemption. Only build and OS artefacts \u2014 a file an agent wrote is still a file an order must own" (T-0217). GOOD --out "I-0112 read-side self-heal on staleness \u2014 a NEW capability, frozen out; the issue stays documented" (T-0213). Each entry names the thing AND why it is out, so a later reader can tell a deliberate exclusion from an oversight.');
    }
    const context = obj5(order["context"]);
    const files = context === null ? [] : arr3(context["files"]);
    if (files.length === 0) {
      lightfail("context.files empty \u2014 the reading list IS the anti-search mechanism (D-0005)");
    }
    for (const f of files) {
      const fo = obj5(f);
      if (fo === null) continue;
      if (rawOr(fo["why"], "") === "") {
        const p = jqRaw3(fo["path"]);
        if (p === "") continue;
        lightfail(`context file ${p} has no why \u2014 every file needs its reason`);
      }
    }
    const refs = context === null ? [] : arr3(context["refs"]).map((r) => jqRaw3(r));
    for (const ref of refs) {
      if (!refExistsAny(ctx.gov, ref)) {
        failRow(`ref ${ref} does not resolve in any journal \u2014 fix the id or create the record`);
      }
    }
    const scopeText = rawOr(order["scope"], "");
    const arts = context === null ? [] : arr3(context["expected_artifacts"]).map((a) => jqRaw3(a));
    const listedArr = [...files.map((f) => {
      const fo = obj5(f);
      return fo === null ? "" : jqRaw3(fo["path"]);
    }), ...arts];
    const workDirs = commandWorkDirs(rawOr(order["verification_command"], ""));
    const unlisted = unlistedScopePaths(scopeText, listedArr, ctx.workRoot, workDirs).map((t) => ` ${t}`).join("");
    if (unlisted !== "") {
      tell(`the scope text names path(s) the order does not list:${unlisted} \u2014 session-check's close reads context.files and expected_artifacts, never the prose, so a file authorised only in a sentence FAILs the close and costs a whole task cycle to legitimise (I-0130). Add each one: --file '<path> | <why>' if it exists (a file the session only READS is listed too: --file '<path> | read: <what to look for>'), --artifact <path> if this task will create it. Do not delete a path from the prose to clear this: the next session needs the pointer. URLs, HTTP routes, host strings and package-relative spellings of listed paths are not counted (SX-011, SX-027); some of these may still be prose rather than paths, which is the cost of catching the real ones.`);
    }
    const bearing2 = isExecutable(cliPath(ctx)) ? stripTrailingNewlines3(runScrumux(ctx, ["graph", "gov", "bearing", "--task", tid]).stdout) : "";
    if (bearing2 === "") {
      tell(`graph gov bearing returned nothing for ${tid} \u2014 the governance graph is missing or unreadable, so the decisions binding this order's files were not checked. Rebuild it: .claude/scripts/scrumux graph gov build (it self-heals, D-0043)`);
    } else {
      const changed = bearingChangedPaths(bearing2);
      const nref = refs.length;
      const ndec = rows4(join47(ctx.gov, "decisions.json")).length;
      if (changed !== "" && nref === 0 && ndec === 0) {
        tell(`this order CHANGES ${changed} and cites no governance refs, and this repo has recorded no decisions yet \u2014 so there is nothing to cite and nothing to fix here. Cite one when one exists (D-0005)`);
      } else if (changed !== "" && nref === 0) {
        failRow(`this order CHANGES ${changed} and cites no governance refs \u2014 ${ndec} decision(s) exist and an order that names none leaves the implementer with whatever the writer happened to remember (D-0005). See what binds these files: .claude/scripts/scrumux graph gov bearing --task ${tid}, then re-issue the order with the ref added \u2014 task order REPLACES the order rather than amending it, so restate every flag it already carries (read them back: scrumux task brief ${tid}) plus --ref D-XXXX`);
      } else if (changed !== "") {
        let omitted = "";
        let nom = 0;
        for (const b of bearingChangeIds(bearing2)) {
          if (refs.includes(b)) continue;
          nom += 1;
          if (nom <= 8) omitted = `${omitted} ${b}`;
        }
        if (nom > 0) {
          if (nom > 8) omitted = `${omitted} (+${nom - 8} more)`;
          warnRow(`${nom} record(s) bear on the files this order CHANGES and are not in its refs:${omitted} \u2014 read them (.claude/scripts/scrumux graph gov bearing --task ${tid}) and cite the ones that bind this work. Advisory: bearing is reachability, not relevance, and only you can say which of these rule this change`);
        }
      }
    }
    if ((context === null ? [] : arr3(context["commands"])).length === 0) {
      warnRow("no ground-truth commands \u2014 fine for pure-doc tasks, wrong for code tasks");
    }
    cli.note(tid, "MANUAL: one-sitting check \u2014 can this complete without pausing mid-state? If not, split it; never widen it.");
  }
  cli.say("");
  const fails = cli.fails();
  if (fails > 0) {
    cli.emit(`task lint: ${fails} failure(s) \u2014 fix each named item, then re-run. Proceed only on exit 0.`);
  }
  return cli.emit("task lint: all checks pass (manual one-sitting judgment still yours).");
}

// src/nouns/task/brief.ts
import { existsSync as existsSync22, readFileSync as readFileSync32 } from "node:fs";
import { join as join48 } from "node:path";

// src/nouns/task/brief-notes.ts
function mustFailWhenLine(failsWhen) {
  if (failsWhen.trim() === "") return "";
  return `
MUST FAIL WHEN: ${failsWhen} \u2014 prove this case turns the check red; a check that skips, cannot fail, or writes into real shared data is not evidence.
  Prove it in a form the allow-list runs: a test that sets the bad value itself, or a wrapper under scripts/ run as \`bash scripts/<name>\`. Never \`VAR=value cmd\`, \`env \u2026\`, \`export \u2026\` or \`bash -c \u2026\` \u2014 no allow rule matches them. If no runnable form exists, say so in your log entry and stop: the operator proves it. Do not try variants.`;
}
var WORKING_NOTES = [
  "Run commands from the repo (or worktree) root and call the CLI as .claude/scripts/scrumux \u2014 `../.claude/scripts/scrumux` from a subdirectory matches no allow rule.",
  "Throwaway files go in .scratch/ at that root: it is gitignored, and `rm -rf .scratch/<name>` is allowed (D-S040). Do not create scratch anywhere else in the tree.",
  'A refused command is a stop, not a puzzle: record the exact command and refusal (scrumux issue new --type harness \u2026) and set the task blocked with that reason. Trying `bash -n x`, then `/bin/bash -n x`, then `env bash -n x`, then `bash -c "echo hi"` to see what is gated IS probing.',
  'A "nothing remains" / cleanup check diffs the shared store against a snapshot taken BEFORE the run (and after an interrupted run) \u2014 it never enumerates the ids it expects to have removed. An assertion over an empty result proves nothing: assert the input was not empty first.',
  "Before you close, every background process you started has ended \u2014 a check still running after the session keeps writing shared data."
];
function orderTexts(order) {
  const out = [];
  const push = (v) => {
    if (typeof v === "string") out.push(v);
  };
  push(field(order, "scope"));
  push(field(order, "fails_when"));
  const files = field(order, "context", "files");
  if (Array.isArray(files)) for (const f of files) {
    push(field(f, "why"));
    push(field(f, "path"));
  }
  const refs = field(order, "context", "refs");
  if (Array.isArray(refs)) for (const r of refs) push(r);
  return out;
}
function citedLogBlock(gov, order) {
  const ids = citedLogIds(orderTexts(order));
  if (ids.length === 0) return [];
  const rows5 = logRows(gov);
  const lines = [];
  for (const id of ids) {
    const e = rows5.find((r) => field(r, "id") === id);
    if (e === void 0) {
      lines.push(`  ${id}: UNRESOLVED \u2014 no such entry in governance/log.json`);
      continue;
    }
    for (const l of renderLogEntry(e, 600)) lines.push(`  ${l}`);
  }
  lines.push("  (full text: scrumux log show <id>)");
  return lines;
}

// src/nouns/task/brief.ts
function taskBrief(cli, ctx, ictx, args) {
  const out = directOut(ictx.io);
  const tasks = tasksPath2(ctx);
  let tid = "";
  let allow = 0;
  for (const a of args) {
    if (a === "--allow-unsprinted") {
      allow = 1;
      continue;
    }
    if (/^T-[0-9]{4}$/.test(a)) {
      tid = a;
      continue;
    }
    cli.dieUsage("usage: scrumux task brief T-0001 [--allow-unsprinted]");
  }
  if (tid === "") cli.dieUsage("usage: scrumux task brief T-0001 [--allow-unsprinted]");
  if (!existsSync22(tasks)) cli.die("no governance/tasks.json");
  const row = rows4(tasks).map((r) => obj5(r)).find((o) => o !== null && o["id"] === tid);
  if (row === void 0) cli.die(`${tid} not found in governance/tasks.json \u2014 check the task id`);
  cli.say(`=== TASK BRIEF ${tid} (${ctx.today}) ===`);
  out(`Title:  ${interp2(row["title"])}
Status: ${interp2(row["status"])}
Story:  ${rawOr(row["story"], "NONE")}
Feature: ${rawOr(row["feature"], "NONE")}
Acceptance check: ${interp2(row["acceptance_check"])}`);
  const acc = obj5(row["acceptance"]);
  const accepted2 = acc === null ? void 0 : acc["accepted"];
  if (accepted2 !== void 0 && accepted2 !== null && jqRaw3(accepted2) === "false") {
    cli.say("");
    cli.say("--- THIS TASK WAS REJECTED AND SENT BACK ---");
    out(`by:     ${acc === null ? "unknown" : rawOr(acc["by"], "unknown")}
date:   ${acc === null ? "unknown" : rawOr(acc["date"], "unknown")}
reason: ${acc === null ? "(none recorded)" : rawOr(acc["reason"], "(none recorded)")}`);
    cli.say("");
    cli.say("This is NOT new work. Fix what the reason names. The acceptance check has");
    cli.say("not changed, so passing it the same way it was passed before will be");
    cli.say("rejected the same way -- and acceptance RE-RUNS the verification command");
    cli.say("rather than trusting the receipt, so a command that only passes where you");
    cli.say("happen to be sitting will fail when someone else runs it.");
  }
  let gateFail = 0;
  const sprint = ratifiedSprintCarrying(sprintsPath2(ctx), tid);
  const pendingIn = unratifiedAdditionSprint(rows4(sprintsPath2(ctx)), tid);
  cli.say("");
  cli.say("--- Gates ---");
  if (pendingIn !== "") {
    cli.fail(`${tid}/sprint`, `${tid} was added to ${pendingIn} after ${pendingIn} was ratified, and the addition is not ratified yet (D-S017). It is not dispatched until it is: scrumux sprint ratify ${pendingIn} --by WHO --authority direct|app|standing:D-XXXX (in scrumux-app, the ratify gate for ${pendingIn}). The tasks ratified with the sprint are unaffected.`);
    gateFail = 1;
  } else if (sprint !== "") {
    cli.say(`sprint: ${tid} is in ratified sprint ${sprint} \u2014 OK (D-0004)`);
  } else if (allow === 1) {
    cli.say("sprint: NOT in a ratified sprint \u2014 proceeding on --allow-unsprinted (User-directed bootstrap only; session-check will flag it)");
  } else {
    cli.say(`sprint: TELL \u2014 ${tid} is not in any ratified sprint (D-0004). Fix: session-open skill, or scrumux sprint add SP-XXXX ${tid} + User's ratification. Proceeding; session-check will name it at close.`);
  }
  const as = refusing(cli, () => admissionState(ctx.gov, tid));
  if (as.home === "") {
    const busy = as.elsewhereIds.join(", ");
    if (busy !== "") {
      cli.say(`parallel: TELL \u2014 ${tid} is in no ratified sprint, so it is one task at a time and ${busy} already in_progress. Finish or move it first (scrumux task status ${busy} in_review|blocked). Proceeding; scrumux will refuse the status transition until you do.`);
    } else {
      cli.say("parallel: OK (1 of 1 slot \u2014 this task is in no ratified sprint)");
    }
  } else if (as.elsewhere.length > 0) {
    cli.say(`parallel: TELL \u2014 one sprint at a time: ${as.elsewhere.join(", ")}. Finish or move it first (scrumux task status <id> in_review|blocked). Proceeding; scrumux will refuse the status transition until you do.`);
  } else if (as.same.length >= as.cap) {
    cli.say(`parallel: TELL \u2014 ${as.home} allows ${as.cap} in flight: ${as.same.join(", ")} already in_progress. Finish or move one (scrumux task status <id> in_review|blocked). Proceeding; scrumux will refuse the status transition until you do.`);
  } else {
    cli.say(`parallel: OK (${as.same.length + 1} of ${as.cap} slots)`);
  }
  const order = obj5(row["task_order"]);
  const hasOrder = row["task_order"] !== void 0 && row["task_order"] !== null;
  if (!hasOrder) {
    cli.fail(`${tid}/order`, `${tid} has no order. There is nothing to work from.`);
    gateFail = 1;
  }
  if (hasOrder && order !== null) {
    const context = obj5(order["context"]);
    const files = context === null ? [] : arr3(context["files"]);
    const refs = context === null ? [] : arr3(context["refs"]).map((r) => jqRaw3(r));
    cli.say("");
    cli.say("--- Scope ---");
    const failsWhen = mustFailWhenLine(typeof order["fails_when"] === "string" ? order["fails_when"] : "");
    const scopeLines = [`IN:  ${interp2(order["scope"])}
VERIFY WITH: ${interp2(order["verification_command"])}${failsWhen}
OUT (do not touch):`];
    for (const o of arr3(order["out_of_scope"])) scopeLines.push(`  - ${interp2(o)}`);
    for (const l of scopeLines) out(l);
    cli.say("");
    cli.say("--- Reading list (open these, for these reasons \u2014 do not search) ---");
    for (const f of files) {
      const fo = obj5(f);
      const path = fo === null ? "null" : interp2(fo["path"]);
      const why = fo === null ? "null" : interp2(fo["why"]);
      const diff = fo === null ? void 0 : fo["expected_diff"];
      const suffix = diff !== void 0 && diff !== null && diff !== false ? `
    expected diff: ${interp2(diff)}` : "";
      out(`  ${path}
    why: ${why}${suffix}`);
    }
    cli.say("");
    cli.say(`--- Also bearing on these files (scrumux graph gov bearing --task ${tid}) ---`);
    let changes = "";
    const bearing2 = isExecutable(cliPath(ctx)) ? stripTrailingNewlines3(runScrumux(ctx, ["graph", "gov", "bearing", "--task", tid]).stdout) : "";
    if (bearing2 === "") {
      cli.say("  (no answer \u2014 the governance graph is missing or unreadable; run: .claude/scripts/scrumux graph gov build. It self-heals, D-0043)");
    } else {
      changes = bearingChangedPaths(bearing2);
      if (changes !== "") {
        cli.say(`  this order CHANGES: ${changes}`);
      } else {
        cli.say("  this order changes nothing it lists \u2014 every path is read-only, so task-lint's bearing checks stay silent (I-0070)");
      }
      let seen = 0;
      let dup = 0;
      for (const line of bearing2.split("\n")) {
        const m = /^([DI]-[0-9]{4}) /.exec(line);
        if (m === null) continue;
        seen += 1;
        if (refs.includes(m[1])) dup += 1;
      }
      for (const line of bearingRecordLines(bearing2)) {
        const id = line.split(" ")[0];
        if (refs.includes(id)) continue;
        cli.say(`  ${line}`);
      }
      cli.say(`  ${seen} bearing record(s) over this file set; ${dup} already in this order's refs and resolved below.`);
    }
    cli.say("");
    cli.say("--- Code graph: what changing these files touches ---");
    if (changes === "") {
      const derived = [
        ...files.map((f) => obj5(f)).filter((fo) => fo !== null && rawOr(fo["expected_diff"], "") !== "").map((fo) => jqRaw3(fo["path"])),
        ...context === null ? [] : arr3(context["expected_artifacts"]).map((a) => jqRaw3(a))
      ];
      changes = [...new Set(derived)].sort().join(" ");
    }
    if (!isExecutable(cliPath(ctx))) {
      cli.say("  (no .claude/scripts/scrumux \u2014 the code graph is unavailable, so nothing below was checked; this is NOT 'nothing calls these files')");
    } else if (changes === "") {
      cli.say("  this order changes no file it lists \u2014 nothing to trace (I-0070)");
    } else {
      let cgn = 0;
      for (const f of changes.split(/\s+/).filter((s2) => s2 !== "")) {
        cgn += 1;
        if (cgn > 8) {
          cli.say("  (+ more changed paths not traced \u2014 an order changing more than 8 files is a task-size problem, not a brief-length one)");
          break;
        }
        cli.say(`  ${f}`);
        for (const rel of ["callers", "callees"]) {
          const r = runScrumux(ctx, ["graph", "code", rel, f]);
          if (r.stderr !== "") ictx.io.err(r.stderr);
          if (r.rc !== 0) {
            const head1 = stripTrailingNewlines3(r.stdout + r.stderr).split("\n")[0] ?? "";
            cli.say(`    ${rel}: UNAVAILABLE \u2014 ${head1}. Nothing was traced for this file. Rebuild: .claude/scripts/scrumux graph code build`);
            continue;
          }
          const lines = stripTrailingNewlines3(r.stdout).split("\n").filter((l) => !l.startsWith("graph code: rebuilt")).filter((l) => !/^\s*$/.test(l));
          if (lines.length === 0) {
            cli.say(`    ${rel}: none in the index`);
          } else {
            for (const l of lines.slice(0, 12)) cli.say(`    ${rel}: ${l}`);
            if (lines.length > 12) cli.say(`    ${rel}: (+${lines.length - 12} more)`);
          }
        }
      }
    }
    cli.say("");
    cli.say("--- Governance refs resolved ---");
    for (const ref of refs) {
      let txt = refResolve(ctx.gov, ref);
      if (txt === null) txt = "UNKNOWN PREFIX";
      if (txt === "") txt = "UNRESOLVED \u2014 fix the id or create the record";
      cli.say(`  ${ref}: ${txt}`);
    }
    cli.say("");
    cli.say("--- Ground truth (run these before assuming) ---");
    const commands = context === null ? [] : arr3(context["commands"]);
    for (const c of commands) out(`  ${interp2(c)}`);
    if (commands.length === 0) out("  (none declared)");
    const ifaces = context === null ? [] : arr3(context["interfaces"]);
    if (ifaces.length > 0) {
      out("Interfaces to honor:");
      for (const i of ifaces) out(`  - ${interp2(i)}`);
    }
    const shapes = context === null ? [] : arr3(context["data_shapes"]);
    if (shapes.length > 0) {
      out("Data shapes:");
      for (const s2 of shapes) out(`  - ${interp2(s2)}`);
    }
    const cited = citedLogBlock(ctx.gov, order);
    if (cited.length > 0) {
      cli.say("");
      cli.say("--- Log entries this order cites ---");
      for (const l of cited) out(l);
    }
  }
  cli.say("");
  cli.say("--- Working here ---");
  for (const n of WORKING_NOTES) out(`  - ${n}`);
  cli.say("");
  cli.say(`--- History for ${tid} ---`);
  historyBlock(out, join48(ctx.gov, "log.json"), tid);
  cli.say("");
  if (gateFail === 1) {
    cli.emit("VERDICT: gates FAILED \u2014 fix the named items before implementing. Do not start.");
  }
  return cli.emit(`VERDICT: gates pass. Set in_progress (scrumux task status ${tid} in_progress) and implement within scope.`);
}
function ratifiedSprintCarrying(path, tid) {
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o === null || o["status"] !== "ratified") continue;
    const tasks = o["tasks"];
    if (Array.isArray(tasks) ? tasks.indexOf(tid) !== -1 : typeof tasks === "string" && tasks.includes(tid)) {
      return jqRaw3(o["id"]);
    }
  }
  return "";
}
function historyBlock(out, logPath, tid) {
  if (!existsSync22(logPath)) {
    out("  (no log.json)");
    return;
  }
  let doc;
  try {
    doc = parsePreservingNumbers(readFileSync32(logPath, "utf8"));
  } catch {
    return;
  }
  const o = obj5(doc);
  const entriesRaw = o === null ? void 0 : o["entries"];
  if (!Array.isArray(entriesRaw)) {
    return;
  }
  const entries = entriesRaw;
  const mine = entries.filter((e) => {
    const eo = obj5(e);
    return eo !== null && eo["task"] === tid;
  });
  if (mine.length === 0) {
    out("  (no log entries yet)");
    return;
  }
  for (const e of mine) {
    const eo = obj5(e);
    out(`  ${eo === null ? "null" : interp2(eo["id"])} ${eo === null ? "null" : interp2(eo["title"])}`);
  }
}

// src/nouns/task.ts
var VERBS_TSV20 = `new	create a task; the acceptance check is stated BEFORE work starts
order	attach the task order \u2014 scope, one verification command, reading list
status	move it through proposed|ready|in_progress|in_review|blocked|accepted|superseded
update	change its feature, story or title
lint	check the order against atomicity (D-0006) and completeness (D-0005)
brief	the full frame for implementing it: gates, scope, reading list, refs
verify	run its verification command plus every repo-health check; write the receipt
accept	record final-authority acceptance ON THE TASK (D-0076). Re-runs first.
reject	record final-authority rejection; the task returns to in_progress
`;
function need(cli, args, i) {
  const v = args[i];
  if (v === void 0) cli.die(`task: ${args[i - 1]} needs a value \u2014 see: scrumux help task`);
  return v;
}
function taskNew(cli, ctx, ictx, args) {
  let title = "";
  let check2 = "";
  let feat = "";
  let story = "";
  let desc = "";
  let fromIssue = "";
  for (let i = 0; i < args.length; ) {
    const f = args[i];
    if (f === "--title") {
      title = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--desc") {
      desc = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--issue") {
      fromIssue = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--check") {
      check2 = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--feature") {
      feat = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--story") {
      story = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    cli.die(`task new: unknown flag ${f} \u2014 see: scrumux help task`);
  }
  if (title === "") {
    cli.die('task new: --title is required \u2014 a sentence naming the state that will be true when the work is done, not a noun phrase and not an id. GOOD (build) "The graph does not crash on a repo it has never seen" (T-0213). GOOD (defect) "The close is not blocked by bytecode" (T-0217). GOOD (governance) "Rulings whose machinery was deleted are retired" (D-0081). BAD "fix session-check" \u2014 it names a file and a verb, so a later session reading the backlog cannot tell what was wrong or how it would know it no longer is.');
  }
  if (check2 === "") {
    cli.die('task new: --check is required (the acceptance check, stated BEFORE work starts) \u2014 a command-verifiable sentence naming what must be observably true AND the suite that shows it. GOOD (build) "graph gov build succeeds on a GOV_ROOT whose governance directory does not exist yet, and tests/graph-cli-tests.sh exits 0" (T-0213). GOOD (defect) "A tree containing __pycache__ or .pyc files closes session-check exit 0 when everything else traces to a worked task, an unauthorised source file still FAILs by name, and tests/session-check-tests.sh exits 0" (T-0217). GOOD (governance) "No rule or skill in the deploy payload instructs an agent to create harness work, and tests/deployed-surface-tests.sh asserts it against the payload roster, exiting 0" (T-0214). BAD "works", "tests pass", "the fix is applied" \u2014 none of them names what would have to be false for the check to fail.');
  }
  if (fromIssue !== "") {
    const issuesPath3 = join49(ctx.gov, "issues.json");
    if (!refExists(issuesPath3, fromIssue)) {
      cli.die(`task new: issue ${fromIssue} not found in issues.json`);
    }
    const row = rowById3(issuesPath3, fromIssue);
    const validation = row === null ? void 0 : row["validation"];
    const vo = obj5(validation);
    const iv = vo === null ? "" : rawOr(vo["verdict"], "");
    if (iv === "reproduced" || iv === "evidenced") {
    } else if (iv === "invalidated") {
      cli.die(`task new: ${fromIssue} was invalidated \u2014 close it instead of building on it (scrumux issue update ${fromIssue} --status rejected); the disproof is the deliverable (D-0011)`);
    } else if (iv === "duplicate") {
      cli.die(`task new: ${fromIssue} is a duplicate \u2014 attach it to the task that owns the fix rather than creating another`);
    } else {
      cli.die(`task new: ${fromIssue} has no validation verdict \u2014 an unvalidated issue is not backlog work. Dispatch a read-only agent whose identity is NOT the source that raised ${fromIssue} (any read-only definition in .claude/agents \u2014 issue-validator, debugger, context-gatherer \u2014 minus that source) and record its verdict (scrumux issue validate ${fromIssue} --verdict ... --by <that agent>), then promote it.`);
    }
  }
  if (feat !== "") {
    const found = refExists(designPathOf(ctx), feat, kindPick("feature"));
    if (!found) cli.die(`task new: feature ${feat} not found in design.json \u2014 add it: scrumux feature new --name ... --desc ...`);
  }
  if (story !== "") {
    const found = refExists(designPathOf(ctx), story, kindPick("story"));
    if (!found) cli.die(`task new: story ${story} not found in design.json \u2014 add it: scrumux story new --feature ... --narrative ... --criterion ...`);
  }
  const path = tasksPath2(ctx);
  refusing(cli, () => ensureFile(path, '{"entries": []}'));
  const d = ctx.today;
  const r = guardedAppend(
    cli,
    ctx,
    ictx.io,
    path,
    idStream,
    "T",
    (doc, id) => appendEntry(doc, {
      id,
      title,
      acceptance_check: check2,
      status: "proposed",
      created_at: d,
      feature: feat === "" ? null : feat,
      story: story === "" ? null : story,
      ...desc === "" ? {} : { description: desc },
      // D-S041 (SX-036): the issue this task was promoted from, kept, so
      // acceptance can name it and the close can see it is still open.
      ...fromIssue === "" ? {} : { issue: fromIssue }
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  return emitted(cli, r.id);
}
function designPathOf(ctx) {
  return join49(ctx.gov, "design.json");
}
function kindPick(kind) {
  return (r) => {
    const o = obj5(r);
    return o !== null && o["kind"] === kind ? o["id"] : void 0;
  };
}
var STATUSES3 = ["proposed", "ready", "in_progress", "in_review", "blocked", "accepted", "superseded"];
function taskStatus(cli, ctx, ictx, args) {
  const tid = args[0] ?? "";
  const st = args[1] ?? "";
  if (tid === "" || st === "") {
    cli.die("usage: scrumux task status T-0001 <proposed|ready|in_progress|in_review|blocked|accepted|superseded> [--reason TEXT] [--by T-0002]");
  }
  if (!STATUSES3.includes(st)) {
    cli.die(`task status: invalid status '${st}' \u2014 one of proposed|ready|in_progress|in_review|blocked|accepted|superseded`);
  }
  if (acceptedTrue(tasksPath2(ctx), tid) && st !== "accepted" && st !== "superseded") {
    cli.die(`task status: ${tid} is ACCEPTED and cannot be moved to '${st}' by a status change. Acceptance is a final-authority ruling; a status change carries no authority to undo one, and moving it would leave acceptance.accepted=true on a task whose status disagrees \u2014 a contradiction nothing downstream reads (I-0147). There is NO command that reverses an acceptance: scrumux task reject refuses an already-accepted task by design. If the RECORD is wrong, correct it with scrumux repair journal tasks.json --why '<reason>', which forces the reason onto the record. If the WORK needs more doing, that is a NEW task, not a reopened one.`);
  }
  let supReason = "";
  let supBy = "";
  const rest = args.slice(2);
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--reason") {
      supReason = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--by") {
      supBy = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    cli.die(`task status: unknown flag ${f} \u2014 only --reason (superseded, blocked) and --by (superseded)`);
  }
  if (st === "superseded") {
    if (supReason === "") {
      cli.die('task status: superseded needs --reason TEXT \u2014 a task retired without a recorded reason is indistinguishable from one that vanished (I-0059). Name what disproved the premise, and what now owns the ground. GOOD "D-0084 replaced the one-task-at-a-time rule this task was written to enforce, so its acceptance check advertises behaviour that no longer exists". GOOD "Duplicated by T-0217, which covers the same session-check exemption and carries the negative case as well". BAD "no longer needed" \u2014 the next reader cannot tell whether that was a ruling or a shrug.');
    }
    if (supBy !== "") refusing(cli, () => requireTaskRef(ctx.gov, supBy));
  } else if (st === "blocked") {
    if (supBy !== "") cli.die("task status: --by belongs to superseded only (--reason is allowed with blocked)");
  } else if (supReason !== "" || supBy !== "") {
    cli.die("task status: --reason belongs to superseded and blocked, --by to superseded only");
  }
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  if (st === "in_progress") {
    const as = refusing(cli, () => admissionState(ctx.gov, tid));
    if (as.home === "") {
      const busy = as.elsewhereIds.join(", ");
      if (busy !== "") {
        cli.die(`one task at a time: ${busy} is already in_progress \u2014 finish or move it first (scrumux task status ${busy} in_review|blocked)`);
      }
    } else {
      const elsew = as.elsewhere.join(", ");
      if (elsew !== "") {
        cli.die(`one sprint at a time: ${elsew} \u2014 finish or move that work first (scrumux task status <id> in_review|blocked), or run this task under the sprint that is already in flight (D-0084)`);
      }
      if (!(as.same.length < as.cap)) {
        cli.die(`${as.home} allows ${as.cap} in flight: ${as.same.join(", ")} already in_progress \u2014 finish or move one (scrumux task status <id> in_review|blocked). The cap is the plan's, so widening it is a re-ratification, not an edit (D-0084)`);
      }
    }
  }
  if (st === "accepted") {
    if (!acceptedStrictly(tasksPath2(ctx), tid)) {
      cli.die(`acceptance is User's: ${tid} has no recorded acceptance \u2014 record it (scrumux task accept ${tid} --by User --authority direct|standing:D-XXXX), which sets this status itself`);
    }
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    tasksPath2(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== tid) return row;
      const base = { ...row, status: st, updated_at: d };
      if (st !== "blocked") delete base["blocked"];
      if (st === "blocked") return supReason === "" ? base : { ...base, blocked: { reason: supReason, date: d } };
      if (supReason === "") return base;
      return {
        ...base,
        superseded: { reason: supReason, ...supBy === "" ? {} : { by: supBy } }
      };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  cli.data({ id: tid, status: st });
  if (!cli.json) {
    if (st === "in_review") {
      attested(cli, tid, "report it to whoever accepts; acceptance re-runs the order's verification command");
    } else if (st === "in_progress") {
      beat(cli, `${tid} is the work in flight. Its acceptance check is the one thing that settles it.`, `scrumux task order ${tid} names the single command that proves it`);
    } else if (st === "blocked") {
      beat(cli, `${tid} is blocked and the sprint knows it.`, "capture what blocks it with scrumux issue; do not work around it");
    }
  }
  return cli.emit(`${tid} -> ${st}`);
}
function acceptedTrue(path, tid) {
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o === null || o["id"] !== tid) continue;
    const acc = obj5(o["acceptance"]);
    if (acc === null) continue;
    const v = acc["accepted"];
    if (v === void 0 || v === null || v === false) continue;
    return jqRaw3(v) === "true";
  }
  return false;
}
function acceptedStrictly(path, tid) {
  return rows4(path).some((r) => {
    const o = obj5(r);
    if (o === null || o["id"] !== tid) return false;
    const acc = obj5(o["acceptance"]);
    return acc !== null && acc["accepted"] === true;
  });
}
function taskOrder(cli, ctx, ictx, args) {
  const tid = args[0] ?? "";
  if (tid === "") {
    cli.die('usage: scrumux task order T-0001 --scope ... --verify ... --file "path | why [| expected diff]" ...');
  }
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  let scope = "";
  let verify = "";
  let story = "";
  let failsWhen = "";
  let light = 0;
  const out = [];
  const files = [];
  const refs = [];
  const cmds = [];
  const ifaces = [];
  const shapes = [];
  const arts = [];
  const rest = args.slice(1);
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--scope") {
      scope = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--verify") {
      verify = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--story") {
      story = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--light") {
      light = 1;
      i += 1;
      continue;
    }
    if (f === "--fails-when") {
      failsWhen = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--out") {
      out.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    if (f === "--file") {
      const parts = need(cli, rest, i + 1).split(" | ");
      const entry = { path: parts[0] ?? "", why: parts[1] ?? "" };
      if ((parts[2] ?? "") !== "") entry.expected_diff = parts[2];
      files.push(entry);
      i += 2;
      continue;
    }
    if (f === "--ref") {
      refs.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    if (f === "--command") {
      cmds.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    if (f === "--interface") {
      ifaces.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    if (f === "--shape") {
      shapes.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    if (f === "--artifact") {
      arts.push(need(cli, rest, i + 1));
      i += 2;
      continue;
    }
    cli.die(`task order: unknown flag ${f} \u2014 see: scrumux help task`);
  }
  if (scope === "") {
    cli.die('task order: --scope is required (what this task changes) \u2014 name the change, the site it lands at, and the evidence it rests on, so the implementer does not have to search for any of the three. GOOD (build) "Create the governance directory before writing into it, on every graph write path, so a freshly deployed repo can build its own governance graph without a traceback" (T-0213). GOOD (defect) "Add build and OS artefacts to the session-check scope exemption at :202, alongside governance/*, *.MD and .claude/*: any path under __pycache__, any *.pyc, .pytest_cache, .DS_Store. Reproduced in canon acceptance run 4 \u2014 the close FAILed on agents/__pycache__/*.pyc" (T-0217). GOOD (governance) "Retire the seventeen rulings whose named script, journal, hook, schema or agent no longer exists, as one supersession with the per-decision evidence in the audit report" (D-0081). BAD "fix the graph" \u2014 it names neither the site nor what makes the change right.');
  }
  if (verify === "") {
    cli.die('task order: --verify is required (the command that proves the acceptance check passes) \u2014 exactly ONE runnable command, stating how to run it. GOOD "sh tests/session-check-tests.sh" (T-0217). GOOD "sh tests/graph-cli-tests.sh" (T-0213). GOOD ".venv/bin/python -m unittest discover -s service/tests -t ." for a Python suite. BAD "tests/session-check-tests.sh" \u2014 27 of the 38 suites are mode 644 and exit 126 when invoked bare (D-0041). BAD "sh tests/a.sh && sh tests/b.sh" \u2014 composite; wrap multi-step verification in a script and point --verify at that.');
  }
  if (files.length === 0) {
    cli.die('task order: at least one --file "path | why" is required \u2014 context is assembled, not searched (D-0005). GOOD --file ".claude/scripts/session-check | :202, the exemption case" (T-0217). GOOD --file "agents/lib/governance_graph.py | the writer I-0111 traces to" (T-0213). GOOD --file "tests/graph-cli-tests.sh | gains its own GOV_ROOT so it stops racing the live indexes" (T-0213). A file the task will CREATE goes on --artifact, not here.');
  }
  if (files.some((x) => x.why === "")) {
    cli.die('task order: every --file needs a why \u2014 format: --file "path | why this file matters [| expected diff]". The why is what the implementer is meant to look FOR in that file, never what the file is. GOOD "path | :202, the exemption case". GOOD "path | the writer I-0111 traces to". GOOD "path | gains its own GOV_ROOT so it stops racing the live indexes". BAD "path | the session check script" \u2014 a restatement of the filename tells the reader nothing they did not have.');
  }
  if (story !== "") {
    const found = refExists(designPathOf(ctx), story, kindPick("story"));
    if (!found) cli.die(`task order: story ${story} not found in design.json`);
  }
  const badRefs = refs.filter((r) => !/^(D|I|C|S|F|E|L)-[0-9]{4}$/.test(r)).join(", ");
  if (badRefs !== "") {
    cli.die(`task order: --ref must be a governance id (D-/I-/C-/S-/F-/E-/L-NNNN), got: ${badRefs}`);
  }
  const badArts = arts.filter((a) => /\s/.test(a)).join(", ");
  if (badArts !== "") {
    cli.die(`task order: --artifact paths cannot contain whitespace (session-check matches them as space-separated words), got: ${badArts}`);
  }
  const loss = orderLoss(rowById3(tasksPath2(ctx), tid), {
    out_of_scope: out.length,
    files: files.length,
    refs: refs.length,
    commands: cmds.length,
    interfaces: ifaces.length,
    data_shapes: shapes.length,
    expected_artifacts: arts.length
  });
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    tasksPath2(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== tid) return row;
      const withStory = story === "" ? row : { ...row, story };
      return {
        ...withStory,
        task_order: {
          ...light === 1 ? { light: true } : {},
          scope,
          out_of_scope: out,
          verification_command: verify,
          ...failsWhen.trim() === "" ? {} : { fails_when: failsWhen },
          context: {
            files,
            refs,
            commands: cmds,
            interfaces: ifaces,
            data_shapes: shapes,
            ...arts.length === 0 ? {} : { expected_artifacts: arts }
          }
        },
        updated_at: d
      };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  if (loss === "none") {
    cli.tell("order-replaced", `${tid} already carried an order and this REPLACED it; no field shrank. task order restates the whole order rather than amending it.`);
  } else if (loss !== "") {
    cli.tell("order-replaced", `${tid} already carried an order and this REPLACED it: ${loss}. task order restates the whole order rather than amending it, so a flag left off is a field emptied \u2014 re-issue with every flag the order carried if that was not intended (read them back: scrumux task brief ${tid}).`);
  }
  cli.data({ id: tid, ordered: true });
  return cli.emit(`${tid} order set`);
}
function taskUpdate(cli, ctx, ictx, args) {
  const tid = args[0] ?? "";
  if (tid === "") cli.die("usage: scrumux task update T-0001 [--feature F-0001] [--story S-0001] [--title TEXT]");
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  if (acceptedTrue(tasksPath2(ctx), tid)) {
    cli.die(`task update: ${tid} is ACCEPTED and its record is closed. Acceptance is a final-authority ruling, and every other path already refuses to move one \u2014 this was the last route around it. If the RECORD is wrong, correct it with scrumux repair journal tasks.json --apply '<jq>' --why '<reason>', which forces the reason onto the record. If the WORK needs more doing, that is a NEW task.`);
  }
  let feat = "";
  let story = "";
  let title = "";
  let desc = "";
  const rest = args.slice(1);
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--feature") {
      feat = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--story") {
      story = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--title") {
      title = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--desc") {
      desc = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    cli.die(`task update: unknown flag ${f} \u2014 see: scrumux help task`);
  }
  if (feat === "" && story === "" && title === "" && desc === "") {
    cli.die("task update: nothing to update \u2014 pass at least one of --feature/--story/--title/--desc");
  }
  if (feat !== "") {
    const found = refExists(designPathOf(ctx), feat, kindPick("feature"));
    if (!found) cli.die(`task update: feature ${feat} not found in design.json \u2014 add it: scrumux feature new --name ... --desc ...`);
  }
  if (story !== "") {
    const found = refExists(designPathOf(ctx), story, kindPick("story"));
    if (!found) cli.die(`task update: story ${story} not found in design.json \u2014 add it: scrumux story new --feature ... --narrative ... --criterion ...`);
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    tasksPath2(ctx),
    (doc) => mapEntries(doc, (row) => {
      if (row["id"] !== tid) return row;
      let r = row;
      if (desc !== "") r = { ...r, description: desc };
      if (feat !== "") r = { ...r, feature: feat };
      if (story !== "") r = { ...r, story };
      if (title !== "") r = { ...r, title };
      return { ...r, updated_at: d };
    })
  );
  sealBootstrap(ctx.gov, ctx.today);
  cli.data({ id: tid, updated: true });
  return cli.emit(`${tid} updated`);
}
function acceptanceTargetGuard(cli, id, verb) {
  if (id.startsWith("R-")) {
    cli.die(`acceptance targets the task now: scrumux ${verb} T-XXXX --by User --authority direct|standing:D-XXXX (D-0076 \u2014 the review panel is gone; documented approval IS the review)`);
  }
}
function taskAccept(cli, ctx, ictx, args) {
  const tid = args[0] ?? "";
  let by = "";
  let authority = "";
  const rest = args.length >= 1 ? args.slice(1) : args;
  for (let i = 0; i < rest.length; ) {
    const f = rest[i];
    if (f === "--by") {
      by = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    if (f === "--authority") {
      authority = need(cli, rest, i + 1);
      i += 2;
      continue;
    }
    cli.die(`accept: unknown flag ${f} \u2014 see: scrumux help`);
  }
  if (tid === "") {
    cli.die("usage: scrumux task accept T-0001 --by WHO --authority direct|app:<session>|standing:D-0001 \u2014 records final-authority acceptance ON THE TASK.");
  }
  if (by === "") {
    cli.die("accept: --by is required \u2014 name who is accepting. It used to default to 'User', which put his name on acts he did not take. Use --by User when he accepts, or the agent's own id when it does.");
  }
  acceptanceTargetGuard(cli, tid, "accept");
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  refusing(cli, () => authorityGuard(ctx.gov, authority, "accept"));
  const prior = priorAcceptance(tasksPath2(ctx), tid);
  if (prior !== "") {
    cli.die(`${tid} was already accepted by ${prior} \u2014 an acceptance is write-once and re-accepting would rewrite that date and restamp updated_at (I-0042). To reverse it: scrumux task reject ${tid} --by User --reason '...'`);
  }
  const task = rowById3(tasksPath2(ctx), tid);
  const receipt = task === null ? void 0 : task["receipt"];
  const rcpt = obj5(receipt);
  if (receipt === void 0 || receipt === null || receipt === false) {
    cli.die(`accept: ${tid} has no task-verify receipt \u2014 acceptance refuses work that was never verified (CLAUDE.MD boundary 5). Run: .claude/scripts/scrumux task verify ${tid}`);
  }
  const rrc = rcpt === null ? "1" : rawOr(rcpt["rc"], "1");
  const rcf = rcpt === null ? "0" : rawOr(rcpt["checks_failed"], "0");
  if (rrc !== "0" || rcf !== "0") {
    const rdate = rcpt === null ? "?" : rawOr(rcpt["date"], "?");
    cli.die(`accept: ${tid}'s last task-verify receipt is RED (rc=${rrc}, checks_failed=${rcf}, dated ${rdate}) \u2014 acceptance refuses a red receipt (CLAUDE.MD boundary 5). Fix the failure, re-run .claude/scripts/scrumux task verify ${tid}, then accept.`);
  }
  const order = task === null ? null : obj5(task["task_order"]);
  const averify = order === null ? "" : rawOr(order["verification_command"], "");
  if (averify === "") {
    cli.die(`accept: ${tid} has no verification_command in its task order, so there is nothing for acceptance to re-run. Acceptance re-runs rather than reading a receipt (I-0139); a task with no command to re-run cannot be accepted. Give it one: scrumux task order ${tid} --verify '<the single command that proves the check>'`);
  }
  ictx.io.err(`re-running ${tid}'s verification before accepting: ${averify}
`);
  rerunVerification(cli, ctx, tid, averify);
  ictx.io.err("  re-run passed (exit 0)\n");
  const fingerprint = acceptedFingerprint(ctx, averify);
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    tasksPath2(ctx),
    (doc) => mapEntries(
      doc,
      (row) => row["id"] === tid ? { ...row, acceptance: { accepted: true, by, date: d, authority, reverified: true, ...rcpt === null ? {} : { receipt: rcpt }, check_fingerprint: fingerprint }, status: "accepted", updated_at: d } : row
    )
  );
  cli.data({ id: tid, accepted: true, by, authority });
  cli.say(`${tid} accepted`);
  beat(cli, "VERIFIED \u2014 its command was re-run by the acceptor, not read off the receipt.", "the attested claim is now confirmed by something that is not its author");
  issueTell(cli, ctx, task, tid);
  const asprint = sprintCarrying(sprintsPath2(ctx), tid);
  if (asprint !== "") {
    const sp = rowById3(sprintsPath2(ctx), asprint);
    const spTasks = sp === null ? [] : arr3(sp["tasks"]);
    let allDone = true;
    for (const stRef of spTasks) {
      const t = rowById3(tasksPath2(ctx), jqRaw3(stRef));
      const stst = t === null ? "" : jqRaw3(t["status"]);
      if (stst !== "accepted") {
        allDone = false;
        break;
      }
    }
    if (allDone) {
      guardedWrite(
        cli,
        ctx,
        ictx.io,
        sprintsPath2(ctx),
        (doc) => mapEntries(doc, (row) => row["id"] === asprint ? { ...row, status: "complete" } : row)
      );
      cli.say(`${asprint} -> complete`);
      cli.data({ sprint_completed: asprint });
    }
  }
  sealBootstrap(ctx.gov, ctx.today);
  return cli.emit("");
}
function priorAcceptance(path, tid) {
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o === null || o["id"] !== tid) continue;
    const acc = obj5(o["acceptance"]);
    if (acc === null || acc["accepted"] !== true) continue;
    return `${jqRaw3(acc["by"])} on ${jqRaw3(acc["date"])} (authority: ${rawOr(acc["authority"], "unrecorded")})`;
  }
  return "";
}
function sprintCarrying(path, tid) {
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o === null || jqRaw3(o["status"]) !== "ratified") continue;
    if (arr3(o["tasks"]).some((t) => t === tid)) return jqRaw3(o["id"]);
  }
  return "";
}
function taskReject(cli, ctx, ictx, args) {
  let tid = "";
  let by = "";
  let reason = "";
  for (let i = 0; i < args.length; ) {
    const f = args[i];
    if (f === "--by") {
      by = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f === "--reason") {
      reason = need(cli, args, i + 1);
      i += 2;
      continue;
    }
    if (f.startsWith("-")) cli.die(`reject: unknown flag ${f} \u2014 see: scrumux help`);
    tid = f;
    i += 1;
  }
  if (tid === "") {
    cli.die("usage: scrumux task reject T-0001 --by WHO --reason TEXT \u2014 records final-authority rejection ON THE TASK; it returns to in_progress.");
  }
  if (by === "") {
    cli.die("reject: --by is required \u2014 name who is rejecting. It used to default to 'User', which put his name on a ruling he may not have made.");
  }
  acceptanceTargetGuard(cli, tid, "reject");
  refusing(cli, () => requireTaskRef(ctx.gov, tid));
  if (reason === "") {
    cli.die(`reject: --reason TEXT is required \u2014 a rejection with no recorded reason sends the task back with nothing to fix. Name what is wrong and what would settle it. GOOD "The receipt is green but its command is 'sh tests/graph-cli-tests.sh' while the order says 'sh tests/session-check-tests.sh' \u2014 re-verify against the order's own command". GOOD "The exemption at :202 also swallows an unauthorised source file; add the negative case to tests/session-check-tests.sh before this comes back". BAD "not done" \u2014 it names neither the defect nor the bar.`);
  }
  const prior = rejectPrior(tasksPath2(ctx), tid);
  if (prior === "true") {
    cli.die(`reject: ${tid} is already accepted \u2014 rejection would overwrite a recorded final-authority ruling; that needs User's explicit reversal, not this command`);
  }
  const as = refusing(cli, () => admissionState(ctx.gov, tid));
  const relse = as.elsewhere.join(", ");
  if (relse !== "") {
    cli.say(`TELL: rejected work resumes immediately, but one sprint at a time \u2014 ${relse}. Move it (scrumux task status <id> in_review|blocked). Recording the rejection anyway.`);
  } else if (as.home !== "" && as.same.length >= as.cap) {
    cli.say(`TELL: rejected work resumes immediately, but ${as.home} allows ${as.cap} in flight: ${as.same.join(", ")} already in_progress. Move one (scrumux task status <id> in_review|blocked). Recording the rejection anyway.`);
  }
  const d = ctx.today;
  guardedWrite(
    cli,
    ctx,
    ictx.io,
    tasksPath2(ctx),
    (doc) => mapEntries(
      doc,
      (row) => row["id"] === tid ? { ...row, acceptance: { accepted: false, by, date: d, reason }, status: "in_progress", updated_at: d } : row
    )
  );
  sealBootstrap(ctx.gov, ctx.today);
  cli.data({ id: tid, rejected: true, by });
  return cli.emit(`${tid} rejected -> in_progress`);
}
function rejectPrior(path, tid) {
  const lines = [];
  for (const r of rows4(path)) {
    const o = obj5(r);
    if (o === null || o["id"] !== tid) continue;
    const acc = o["acceptance"];
    if (acc === void 0 || acc === null) {
      lines.push("none");
      continue;
    }
    const accObj = obj5(acc);
    const v = accObj === null ? void 0 : accObj["accepted"];
    lines.push(v === void 0 || v === null ? "null" : jqRaw3(v));
  }
  return lines.join("\n");
}
var MODULE20 = {
  verbs: () => VERBS_TSV20,
  usage: () => NOUN_USAGE["task"] ?? "",
  run(cli, ictx, verb, args) {
    const ctx = nounContext(ictx);
    switch (verb) {
      case "new":
        return taskNew(cli, ctx, ictx, args);
      case "order":
        return taskOrder(cli, ctx, ictx, args);
      case "status":
        return taskStatus(cli, ctx, ictx, args);
      case "update":
        return taskUpdate(cli, ctx, ictx, args);
      case "lint":
        return taskLint(cli, ctx, ictx, args);
      case "brief":
        return taskBrief(cli, ctx, ictx, args);
      case "verify":
        return taskVerify(cli, ctx, ictx, args);
      case "accept":
        return taskAccept(cli, ctx, ictx, args);
      case "reject":
        return taskReject(cli, ctx, ictx, args);
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun task \u2014 verbs: new, order, status, update, lint, brief, verify, accept, reject. See: scrumux help task`
        );
    }
  }
};
function orderLoss(prior, next) {
  const p = prior === null ? null : obj5(prior["task_order"]);
  if (p === null) return "";
  const c = obj5(p["context"]) ?? {};
  const before = [
    ["out_of_scope", arr3(p["out_of_scope"]).length],
    ["files", arr3(c["files"]).length],
    ["refs", arr3(c["refs"]).length],
    ["commands", arr3(c["commands"]).length],
    ["interfaces", arr3(c["interfaces"]).length],
    ["data_shapes", arr3(c["data_shapes"]).length],
    ["expected_artifacts", arr3(c["expected_artifacts"]).length]
  ];
  const lost = [];
  for (const [k2, b] of before) {
    const a = next[k2] ?? 0;
    if (a < b) lost.push(`${k2} ${b} -> ${a}`);
  }
  return lost.length === 0 ? "none" : lost.join(", ");
}

// src/nouns/views-render.ts
import { existsSync as existsSync23, mkdirSync as mkdirSync9, readFileSync as readFileSync33, writeFileSync as writeFileSync11 } from "node:fs";
import { join as join50 } from "node:path";
var AI_LOG_HEADER = "# AI_LOG.MD\n<!-- GENERATED VIEW \u2014 source of truth: governance/log.json (append-only).\n     Do not edit by hand; run: .claude/scripts/scrumux views render -->\n\n";
var DECISIONS_HEADER = "# DECISIONS.MD\n<!-- GENERATED VIEW \u2014 source of truth: governance/decisions.json (append-only).\n     Do not edit by hand; run: .claude/scripts/scrumux views render -->\n\n";
var BACKLOG_HEADER = "# BACKLOG.MD\n<!-- GENERATED VIEW \u2014 sources of truth: governance/tasks.json, governance/sprints.json.\n     Do not edit by hand; run: .claude/scripts/scrumux views render -->\n\n";
var STATUSES4 = [
  "in_progress",
  "in_review",
  "blocked",
  "ready",
  "proposed",
  "accepted",
  "superseded"
];
function readForRender(path) {
  if (!existsSync23(path)) return null;
  try {
    return parsePreservingNumbers(readFileSync33(path, "utf8"));
  } catch {
    return null;
  }
}
function renderAiLog(doc) {
  let out = AI_LOG_HEADER;
  for (const e of entriesOf(doc ?? void 0)) {
    let s2 = `## ${interp(field(e, "id"))} \xB7 ${interp(field(e, "date"))} \u2014 ${interp(field(e, "title"))}
Actor: ${interp(field(e, "actor"))}.`;
    const task = field(e, "task");
    if (truthy(task)) s2 += ` Task: ${interp(task)}.`;
    s2 += `
${interp(field(e, "what_was_done"))}`;
    const ver = alt(field(e, "verification"), "");
    if (!(typeof ver === "string" && ver === "")) {
      s2 += `
Verified: ${interp(field(e, "verification"))}`;
    }
    const pending = asArray(alt(field(e, "pending"), []));
    if (pending !== null && pending.length > 0) {
      s2 += "\nPending:\n" + pending.map((p) => "- " + interp(p)).join("\n");
    }
    out += s2 + "\n\n";
  }
  return out;
}
function standingLine(e) {
  const v = standingOf(e);
  if (v.legacy) return `Ratified by: ${interp(field(e, "ratified_by"))}.`;
  const ack = v.acknowledgedBy === "" ? "" : ` Acknowledged by ${v.acknowledgedBy}.`;
  if (v.status === "ratified") return `Ratified by: ${interp(field(e, "ratified_by"))} (authority ${v.authority}).${ack}`;
  if (v.status === "proposed") {
    return `PROPOSED \u2014 recorded by ${interp(field(e, "recorded_by"))} with no authority; binds nothing until a person ratifies it.${ack}`;
  }
  return `REJECTED by ${interp(field(e, "rejected_by"))}: ${interp(field(e, "rejection_reason"))}`;
}
function renderDecisions(doc) {
  const entries = entriesOf(doc ?? void 0);
  const supby = /* @__PURE__ */ new Map();
  for (const e of entries) {
    const s2 = bindingSupersedes(e);
    if (s2 !== null) supby.set(s2, field(e, "id"));
  }
  for (const e of entries) {
    const b = field(e, "superseded_by");
    if (b !== null) supby.set(interp(field(e, "id")), b);
  }
  const supersededBy = (e) => {
    const id = field(e, "id");
    const k2 = interp(id);
    return supby.has(k2) ? supby.get(k2) : null;
  };
  const render = (e) => {
    let s2 = `## ${interp(field(e, "id"))} \xB7 ${interp(field(e, "date"))} \u2014 ${interp(field(e, "title"))}
` + standingLine(e);
    if (truthy(field(e, "scope"))) s2 += ` Scope: ${interp(field(e, "scope"))}.`;
    if (truthy(field(e, "supersedes"))) s2 += ` Supersedes: ${interp(field(e, "supersedes"))}.`;
    s2 += `
${interp(field(e, "decision"))}
Rationale: ${interp(field(e, "rationale"))}
`;
    return s2;
  };
  const rejected = (e) => standingOf(e).status === "rejected";
  const live = entries.filter((e) => supersededBy(e) === null && !rejected(e));
  const dead = entries.filter((e) => supersededBy(e) !== null && !rejected(e));
  const refused = entries.filter(rejected);
  let body = live.map(render).join("\n");
  if (dead.length > 0) {
    body += "\n# Superseded (archive \u2014 NOT current law)\n\n" + dead.map((e) => `SUPERSEDED by ${interp(supersededBy(e))}:
` + render(e)).join("\n");
  }
  if (refused.length > 0) {
    body += "\n# Rejected (NOT law \u2014 recorded, and refused by a person)\n\n" + refused.map(render).join("\n");
  }
  return DECISIONS_HEADER + body + "\n";
}
function renderBacklog(tasks, sprints) {
  let out = BACKLOG_HEADER;
  const sprintEntries = sprints === null ? [] : entriesOf(sprints);
  const live = sprintEntries.filter((e) => {
    const st = field(e, "status");
    return st === "proposed" || st === "ratified";
  });
  if (sprints !== null && live.length > 0) {
    out += "## Sprints\n";
    for (const e of live) {
      let s2 = `- **${interp(field(e, "id"))}** [${interp(field(e, "status"))}]`;
      if (truthy(field(e, "hotfix"))) {
        s2 += ` HOTFIX from ${interp(field(e, "source_issue"))}`;
      } else {
        s2 += ` epic ${interp(field(e, "epic"))}`;
      }
      const list = asArray(field(e, "tasks")) ?? [];
      s2 += " \u2014 tasks: " + (list.length === 0 ? "(none yet)" : list.map(interp).join(", "));
      out += s2 + "\n";
    }
    out += "\n";
  }
  const taskEntries = tasks === null ? [] : entriesOf(tasks);
  if (tasks !== null && taskEntries.length > 0) {
    for (const st of STATUSES4) {
      const rows5 = sortBy(
        taskEntries.filter((e) => field(e, "status") === st),
        (e) => [alt(field(e, "rank"), 9999), field(e, "id")]
      );
      if (rows5.length === 0) continue;
      const lines = rows5.map((e) => {
        let s2 = `- **${interp(field(e, "id"))}**`;
        if (truthy(field(e, "rank"))) s2 += ` (rank ${interp(field(e, "rank"))})`;
        s2 += ` ${interp(field(e, "title"))}`;
        if (truthy(field(e, "feature"))) {
          s2 += ` (${interp(field(e, "feature"))}`;
          if (truthy(field(e, "story"))) s2 += `/${interp(field(e, "story"))}`;
          s2 += ")";
        }
        s2 += `
  - accept when: ${interp(field(e, "acceptance_check"))}`;
        return s2;
      });
      out += `## ${st}
` + lines.join("\n") + "\n\n";
    }
  } else {
    out += "_No tasks yet. Create one: `.claude/scripts/scrumux task new --title ... --check ...`_\n";
  }
  return out;
}
function renderViews(ctx) {
  const warnings = [];
  const written = [];
  const logPath = join50(ctx.gov, "log.json");
  if (existsSync23(logPath)) {
    writeFileSync11(join50(ctx.root, "AI_LOG.MD"), renderAiLog(readForRender(logPath)));
    written.push("AI_LOG.MD");
  }
  const decPath = join50(ctx.gov, "decisions.json");
  if (existsSync23(decPath)) {
    writeFileSync11(join50(ctx.root, "DECISIONS.MD"), renderDecisions(readForRender(decPath)));
    written.push("DECISIONS.MD");
  }
  const tasksPath3 = join50(ctx.gov, "tasks.json");
  const sprintsPath3 = join50(ctx.gov, "sprints.json");
  writeFileSync11(
    join50(ctx.root, "BACKLOG.MD"),
    renderBacklog(
      existsSync23(tasksPath3) ? readForRender(tasksPath3) : null,
      existsSync23(sprintsPath3) ? readForRender(sprintsPath3) : null
    )
  );
  written.push("BACKLOG.MD");
  try {
    mkdirSync9(ctx.gov, { recursive: true });
  } catch {
  }
  let graphBuildFailed = false;
  const cliPath2 = join50(ctx.scriptsDir, "scrumux");
  if (isExecutable(cliPath2)) {
    try {
      const g = build(ctx.root);
      writeGovIndex(g, govIndexPath(ctx.root));
    } catch {
      graphBuildFailed = true;
      warnings.push(
        "scrumux: warning: graph gov build failed \u2014 governance/governance-graph.json is now STALE. Run .claude/scripts/scrumux graph gov build to see why.\n"
      );
    }
  } else {
    graphBuildFailed = true;
    warnings.push(
      "scrumux: warning: .claude/scripts/scrumux is missing or not executable \u2014 governance/governance-graph.json is STALE and every query over it is answering from old data.\n"
    );
  }
  sealBootstrap(ctx.gov, ctx.today);
  return { graphBuildFailed, warnings, written };
}

// src/nouns/views.ts
var VERBS_TSV21 = "render	regenerate AI_LOG.MD, DECISIONS.MD, BACKLOG.MD and the governance graph\n";
var USAGE15 = `scrumux views \u2014 the generated MD views of the journals.

  scrumux views render

AI_LOG.MD, DECISIONS.MD and BACKLOG.MD are GENERATED. The sources of
truth are the JSON journals under governance/ (D-0002); the MD files are
projections and are never hand-edited.

Rendering also rebuilds governance/governance-graph.json, which is a
generated view of the same journals (I-0063). T-0187 took this OFF the
write path \u2014 every gov write was re-rendering three files and rebuilding
the whole graph, ~0.15s of a ~0.19s write, for views nobody reads
mid-session \u2014 so it happens on demand and at the session close.
`;
function viewsRender(cli, ctx) {
  const r = renderViews(ctx);
  for (const w of r.warnings) cli.sayAlways(w.replace(/\n$/, ""));
  if (r.graphBuildFailed) {
    cli.fail(
      "governance-graph",
      "views regenerated, but the governance graph did NOT rebuild \u2014 governance/governance-graph.json is stale and every query over it is answering from old data. See the warning on stderr; run .claude/scripts/scrumux graph gov build to see why."
    );
    cli.emit("views regenerated, but the governance graph is STALE.");
  }
  cli.pass("views", "AI_LOG.MD, DECISIONS.MD, BACKLOG.MD and governance-graph.json regenerated");
  cli.emit("views regenerated");
}
var MODULE21 = {
  verbs: () => VERBS_TSV21,
  usage: () => USAGE15,
  run(cli, ctx, verb, args) {
    switch (verb) {
      case "render":
        if (args.length !== 0) cli.dieUsage("views render takes no arguments");
        return viewsRender(cli, nounContext(ctx));
      default:
        return cli.dieUsage(
          `unknown verb '${verb}' for noun views \u2014 the only verb is 'render'. See: scrumux help views`
        );
    }
  }
};

// src/nouns/registry.ts
var REGISTRY = {
  backlog: () => MODULE,
  decide: () => MODULE2,
  epic: () => MODULE3,
  exception: () => MODULE4,
  feature: () => MODULE5,
  graph: () => MODULE6,
  harness: () => MODULE7,
  health: () => MODULE8,
  issue: () => MODULE9,
  log: () => MODULE10,
  memory: () => MODULE11,
  rank: () => MODULE12,
  records: () => MODULE13,
  repair: () => MODULE14,
  secret: () => MODULE15,
  session: () => MODULE16,
  sprint: () => MODULE17,
  status: () => MODULE18,
  story: () => MODULE19,
  task: () => MODULE20,
  views: () => MODULE21
};
function loadNoun(noun) {
  const loader = REGISTRY[noun];
  return loader === void 0 ? null : loader();
}

// src/cli/dispatch.ts
var CLI_CONTRACT = "scrumux.cli/1";
var HELPISH2 = ["help", "-h", "--help"];
function todayLocal(d = /* @__PURE__ */ new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function selfScriptDir() {
  try {
    return new URL(".", import.meta.url).pathname;
  } catch {
    return process.cwd();
  }
}
function dispatch(input, io = processIo, opts = {}) {
  const { argv, json } = stripGlobalFlags(input);
  const noun = argv.length > 0 ? argv[0] : "help";
  const rest = argv.slice(1);
  const verb = rest.length > 0 ? rest[0] : "";
  const verbArgs = rest.slice(1);
  const roots = resolveRoots(opts.cwd ?? process.cwd(), selfScriptDir(), opts.env ?? process.env);
  if (!isAllowed(noun, verb)) {
    const marker = findMarker(roots.root);
    if (marker !== null) {
      const command = verb === "" ? noun : `${noun} ${verb}`;
      const cli2 = new Cli(command, [], json, io);
      cli2.die(refusalMessage(command, marker));
    }
  }
  if (HELPISH2.includes(noun)) {
    const cli2 = new Cli("help", [], json, io);
    let text2;
    if (rest.length > 0) {
      if (!nounKnown(verb)) {
        cli2.dieUsage(`unknown noun '${verb}' \u2014 run: scrumux help`);
      }
      text2 = usageNoun(verb);
    } else {
      text2 = usageTop();
    }
    emitReport(cli2, io, text2);
  }
  if (noun === "version" || noun === "--version") {
    const cli2 = new Cli("version", [], json, io);
    if (json) cli2.data({ contract: CLI_CONTRACT });
    else io.out(CLI_CONTRACT + "\n");
    cli2.emit("");
  }
  if (!nounKnown(noun)) {
    io.err(usageTop());
    const cli2 = new Cli(noun, [], json, io);
    cli2.dieUsage(`unknown noun '${noun}' \u2014 run: scrumux help`);
  }
  if (verb === "") {
    io.err(usageNoun(noun));
    const cli2 = new Cli(noun, [], json, io);
    cli2.dieUsage(
      `${noun} needs a verb \u2014 the usage above lists them. There are no default verbs: a command that guesses is a command that is sometimes wrong about what you asked for.`
    );
  }
  if (HELPISH2.includes(verb)) {
    io.out(usageNoun(noun));
    io.exit(0);
  }
  const mod = loadNoun(noun);
  const cli = new Cli(`${noun} ${verb}`, redactArgv(noun, verb, verbArgs), json, io);
  if (mod === null) {
    return cli.dieUsage(
      `${noun} ${verb} has no TypeScript module registered, though '${noun}' is a known noun \u2014 the registry (src/nouns/registry.ts) and the noun roster have drifted apart. This is a build bug: file it with scrumux issue new --type harness.`
    );
  }
  return mod.run(cli, { roots, today: todayLocal(), io }, verb, verbArgs);
}
function emitReport(cli, io, text2) {
  if (cli.json) {
    const lines = text2.split("\n").filter((l) => l.length > 0);
    cli.data({ lines });
  } else {
    io.out(text2);
  }
  cli.emit("");
}

// src/bin/scrumux.ts
var vp = nodeVersionProblem(process.version);
if (vp !== null) {
  process.stderr.write(vp + "\n");
  process.exit(2);
}
try {
  dispatch(process.argv.slice(2));
} catch (e) {
  if (e instanceof ExitSignal) {
    process.exitCode = e.code;
  } else {
    const msg = e instanceof Error ? e.message : String(e);
    process.stderr.write(`scrumux: error: ${msg}
`);
    process.exitCode = 2;
  }
}
