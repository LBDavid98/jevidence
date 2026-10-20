#!/usr/bin/env node

// src/walls/block-secret-reads.ts
import { dirname } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// src/walls/lib/hook.ts
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

// src/walls/lib/hook.ts
function refuseOldNode(wall, io, version = process.version) {
  const problem = nodeVersionProblem(version);
  if (problem === null) return;
  refuse(
    io,
    "BLOCKED by " + wall + ": Node " + version + " is too old \u2014 this wall needs Node >=22.11 and cannot evaluate the tool call. Refusing rather than waving it through (fail-closed, CLI-1). Install a newer Node and retry; nothing was read or written."
  );
}
var WallExit = class extends Error {
  constructor(code) {
    super(`exit ${code}`);
    this.code = code;
    this.name = "WallExit";
  }
};
function processWallIo() {
  let input = "";
  try {
    input = readFileSync(0, "utf8");
  } catch {
  }
  return {
    input,
    err: (s) => {
      process.stderr.write(s);
    },
    out: (s) => {
      process.stdout.write(s);
    },
    exit: (code) => {
      throw new WallExit(code);
    }
  };
}
function str(o, k) {
  if (o === null || typeof o !== "object") return "";
  const v = o[k];
  return typeof v === "string" ? v : "";
}
function readHookInput(hookDir, io, env = process.env) {
  const raw = io.input;
  let payload = {};
  try {
    const p = JSON.parse(raw);
    if (p !== null && typeof p === "object" && !Array.isArray(p)) {
      payload = p;
    }
  } catch {
  }
  const toolInput = payload["tool_input"];
  const govRoot = env["GOV_ROOT"];
  const workRoot = env["WORK_ROOT"];
  return {
    payload,
    command: str(toolInput, "command"),
    filePath: str(toolInput, "file_path"),
    notebookPath: str(toolInput, "notebook_path"),
    root: govRoot !== void 0 && govRoot !== "" ? govRoot : `${hookDir}/../..`,
    workRoot: workRoot !== void 0 && workRoot !== "" ? resolve(workRoot) : resolve(hookDir, "..", ".."),
    cwd: str(payload, "cwd")
  };
}
function samePath(a, b) {
  const norm = (p) => {
    const abs = resolve(p);
    try {
      return realpathSync(abs);
    } catch {
      return abs;
    }
  };
  return norm(a) === norm(b);
}
function runAsEntry(wall, moduleUrl, main2, argv = process.argv, exit = process.exit, err = (s) => {
  process.stderr.write(s);
}) {
  const entry = argv[1];
  if (entry === void 0) return;
  if (!samePath(fileURLToPath(moduleUrl), entry)) return;
  try {
    main2();
  } catch (e) {
    if (e instanceof WallExit) {
      exit(e.code);
      return;
    }
    err(`BLOCKED by ${wall}: this wall failed while evaluating the tool call (${e instanceof Error ? e.message : String(e)}). Refusing rather than waving it through (fail-closed, CLI-1).
`);
    exit(2);
  }
}
function allow(io) {
  return io.exit(0);
}
function refuse(io, message) {
  io.err(message + "\n");
  return io.exit(2);
}

// src/walls/lib/conf.ts
import { readFileSync as readFileSync2, existsSync } from "node:fs";

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
function ereOrThrow(pattern, flags = "") {
  const t = translateEre(pattern, flags);
  if (!t.ok) {
    throw new Error(`ere: a pattern compiled into this build will not translate (${t.reason}): ${pattern}`);
  }
  return t.regex;
}

// src/walls/lib/conf.ts
var POSIX_LEAD = ereOrThrow("^[[:space:]]+", "g");
var POSIX_TRAIL = ereOrThrow("[[:space:]]+$", "g");
var VERB_RE = {
  allow: ereOrThrow("^[[:space:]]*allow[[:space:]]+"),
  refuse: ereOrThrow("^[[:space:]]*refuse[[:space:]]+")
};
function splitRule(verb, line) {
  const m = VERB_RE[verb].exec(line);
  if (m === null) return null;
  const rest = line.slice(m[0].length);
  const bar = rest.lastIndexOf("|");
  if (bar < 0) return null;
  return {
    // POSIX space here too, not `\s`: a pattern ending in a NBSP keeps it,
    // and a reason beginning with one keeps it too. Trimming more than true
    // POSIX whitespace would silently change what a repo's rule matches.
    pattern: rest.slice(0, bar).replace(POSIX_TRAIL, ""),
    reason: rest.slice(bar + 1).replace(POSIX_LEAD, "").replace(POSIX_TRAIL, "")
  };
}
function loadConf(root) {
  const path = `${root}/.claude/project-walls.conf`;
  const conf = { path, present: false, rules: [], warnings: [] };
  if (!existsSync(path)) return conf;
  conf.present = true;
  let raw;
  try {
    raw = readFileSync2(path, "utf8");
  } catch {
    conf.warnings.push(`project-walls.conf: cannot be read, so none of this repo's own rules apply: ${path}`);
    return conf;
  }
  for (const rawLine of raw.split("\n")) {
    const line = rawLine.replace(/#.*/, "");
    for (const verb of ["allow", "refuse"]) {
      const split = splitRule(verb, line);
      if (split === null) continue;
      const { pattern, reason } = split;
      if (pattern === "") continue;
      if (reason === "") {
        const w2 = `project-walls.conf: ignoring a ${verb} rule with no reason, so the rest still apply: ${pattern}`;
        conf.warnings.push(w2);
        conf.rules.push({ verb, pattern, reason, regex: null, skipped: w2, untranslatable: false });
        break;
      }
      const t = translateEre(pattern);
      if (t.ok) {
        conf.rules.push({ verb, pattern, reason, regex: t.regex, skipped: null, untranslatable: false });
        break;
      }
      if (t.kind === "untranslatable") {
        const w2 = `project-walls.conf: this build cannot evaluate a ${verb} pattern that grep accepts (${t.reason}): ${pattern}`;
        conf.warnings.push(w2);
        conf.rules.push({ verb, pattern, reason, regex: null, skipped: w2, untranslatable: true });
        break;
      }
      const w = `project-walls.conf: ignoring an invalid ${verb} pattern, so the rest still apply: ${pattern}`;
      conf.warnings.push(w);
      conf.rules.push({ verb, pattern, reason, regex: null, skipped: w, untranslatable: false });
      break;
    }
  }
  return conf;
}
function emitWarnings(conf, err = (s) => process.stderr.write(s)) {
  for (const w of conf.warnings) err(w + "\n");
}
function allows(conf, subject) {
  for (const r of conf.rules) {
    if (r.verb !== "allow" || r.regex === null) continue;
    if (matchesAnyLine(r.regex, subject)) return true;
  }
  return false;
}
function refuses(conf, subject) {
  for (const r of conf.rules) {
    if (r.verb !== "refuse") continue;
    if (r.untranslatable) return { refused: true, failedClosed: true };
    if (r.regex === null) continue;
    if (matchesAnyLine(r.regex, subject)) return { refused: true, failedClosed: false };
  }
  return { refused: false, failedClosed: false };
}
function reasonFor(conf, verb, subject) {
  for (const r of conf.rules) {
    if (r.verb !== verb || r.regex === null) continue;
    if (matchesAnyLine(r.regex, subject)) return r.reason;
  }
  return "";
}

// src/walls/lib/cmd-words.ts
var WRAPPERS = /* @__PURE__ */ new Set([
  "env",
  "sudo",
  "time",
  "nohup",
  "exec",
  "command",
  "nice",
  "ionice",
  "timeout",
  "xargs",
  "stdbuf",
  "setsid",
  "flock",
  "chrt",
  "doas",
  "busybox",
  "toybox"
]);
var PREFIXER_VALUE = /^[0-9]+[a-zA-Z]?$/;
var STRIP = /["'`()<>]/g;
function cmdWords(command) {
  const out = [];
  const records = command === "" ? [] : command.split("\n");
  if (records.length > 1 && records[records.length - 1] === "") records.pop();
  let sq = false;
  let dq = false;
  for (const rec of records) {
    let expect = true;
    let skipargs = false;
    let tok = "";
    const flush = () => {
      if (tok === "") return;
      if (expect) {
        if (tok.includes("=")) {
          tok = "";
          return;
        }
        if (WRAPPERS.has(tok)) {
          tok = "";
          skipargs = true;
          return;
        }
        if (skipargs && (tok.startsWith("-") || PREFIXER_VALUE.test(tok))) {
          tok = "";
          return;
        }
        skipargs = false;
        const slash = tok.lastIndexOf("/");
        if (slash >= 0) tok = tok.slice(slash + 1);
        tok = tok.replace(STRIP, "");
        if (tok !== "") out.push(tok);
        expect = false;
      }
      tok = "";
    };
    for (let i = 0; i < rec.length; i += 1) {
      const c = rec[i];
      if (c === "'" && !dq) {
        sq = !sq;
        continue;
      }
      if (c === '"' && !sq) {
        dq = !dq;
        continue;
      }
      if (sq || dq) {
        tok += c;
        continue;
      }
      if (c === " " || c === "	") {
        flush();
        continue;
      }
      if (c === ";") {
        flush();
        expect = true;
        skipargs = false;
        continue;
      }
      if (c === "|") {
        if (rec[i + 1] === "|") i += 1;
        flush();
        expect = true;
        skipargs = false;
        continue;
      }
      if (c === "&") {
        if (rec[i + 1] === "&") i += 1;
        flush();
        expect = true;
        skipargs = false;
        continue;
      }
      tok += c;
    }
    flush();
  }
  return out;
}

// src/walls/lib/predicates.ts
var READ_FILE = /* @__PURE__ */ new Set([
  "cat",
  "less",
  "more",
  "head",
  "tail",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  "awk",
  "sed",
  "cut",
  "sort",
  "uniq",
  "od",
  "xxd",
  "hexdump",
  "strings",
  "base64",
  "openssl",
  "jq",
  "yq",
  "diff",
  "cmp",
  "tee",
  "cp",
  "mv",
  "scp",
  "rsync",
  "tar",
  "zip",
  "gzip",
  "curl",
  "wget",
  "python",
  "python3",
  "node",
  "nodejs",
  "deno",
  "bun",
  "ruby",
  "perl",
  "php",
  "sh",
  "bash",
  "zsh",
  "source",
  ".",
  "docker",
  "dotenv",
  "export",
  "dd",
  "nl",
  "tac",
  "bat",
  "vim",
  "view",
  "ex"
]);
function canReadFile(command) {
  return cmdWords(command).some((w) => READ_FILE.has(w));
}
var SHELL_READS = ereOrThrow("(^|[^0-9<>])<[[:space:]]*[^<&|[:space:]]|[$]\\([[:space:]]*<|<>");
function shellReads(command) {
  return matchesAnyLine(SHELL_READS, command);
}
var SHELL_DIALS = ereOrThrow("/dev/(tcp|udp)/");

// src/walls/lib/record.ts
import { appendFileSync, mkdirSync, existsSync as existsSync2 } from "node:fs";

// src/walls/lib/jsonl.ts
var ESCAPES = {
  "\b": "\\b",
  "	": "\\t",
  "\n": "\\n",
  "\f": "\\f",
  "\r": "\\r",
  '"': '\\"',
  "\\": "\\\\"
};
function jqString(s) {
  let out = '"';
  for (const ch of s) {
    const esc = ESCAPES[ch];
    if (esc !== void 0) {
      out += esc;
      continue;
    }
    const code = ch.codePointAt(0);
    if (code < 32 || code === 127) {
      out += "\\u" + code.toString(16).padStart(4, "0");
      continue;
    }
    out += ch;
  }
  return out + '"';
}
function jqCompact(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "string") return jqString(value);
  if (Array.isArray(value)) return "[" + value.map(jqCompact).join(",") + "]";
  return "{" + Object.entries(value).map(([k, v]) => `${jqString(k)}:${jqCompact(v)}`).join(",") + "}";
}

// src/walls/lib/record.ts
function wallsRecord(args) {
  try {
    const dir = `${args.root}/.scrumux`;
    if (!existsSync2(dir)) mkdirSync(dir, { recursive: true });
    const p = args.payload ?? {};
    const at = (args.now ?? /* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
    const pid = String(args.pid ?? process.pid);
    const row = {
      v: 1,
      id: `${pid}-${Math.floor((args.now ?? /* @__PURE__ */ new Date()).getTime() / 1e3)}`,
      // NULL, NEVER A MADE-UP ID. A wall fires whenever a protected path is
      // touched -- including from a plain CLI run with no agent anywhere near
      // it -- and "unknown" was being grouped by scrumux-app into a SESSION
      // named unknown that showed as running for ever with no close event.
      // Same defect class as --by defaulting to User.
      sessionId: p["session_id"] ?? null,
      // AND WHO INSIDE THAT SESSION WAS REFUSED (I-0154). A Task-tool
      // sub-agent fires this hook under the PARENT session id, so sessionId
      // above is right and stays right -- the session owns the tree and
      // answers for what runs in it. What it cannot say alone is that the
      // refused act was a SUB-AGENT act, which left a wall record claiming the
      // session itself did something it never did. agent_id is present only on
      // a sub-agent call, so null here means the session itself was refused.
      subAgent: p["agent_id"] ?? null,
      repoPath: args.root,
      at,
      kind: "wall",
      wall: args.wall,
      refused: args.subject.slice(0, 200),
      reason: args.reason.slice(0, 400),
      sanctionedPath: null
    };
    appendFileSync(`${dir}/events.jsonl`, jqCompact(row) + "\n");
  } catch {
  }
}

// src/walls/lib/ps.ts
function psSegments(cmd, splitAmp = true) {
  const out = [];
  let cur = "";
  let sq = false;
  let dq = false;
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (c === "`" && !sq) {
      cur += c + (cmd[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (c === "'" && !dq) {
      sq = !sq;
      cur += c;
      continue;
    }
    if (c === '"' && !sq) {
      dq = !dq;
      cur += c;
      continue;
    }
    if (!sq && !dq) {
      if (c === ";" || c === "|" || c === "\n" || c === "&" && splitAmp) {
        if (c === "|" && cmd[i + 1] === "|" || c === "&" && cmd[i + 1] === "&") i += 1;
        out.push(cur);
        cur = "";
        continue;
      }
    }
    cur += c;
  }
  out.push(cur);
  return out;
}
function psTokenize(seg) {
  const out = [];
  let text = "";
  let quoted = false;
  let started = false;
  let sq = false;
  let dq = false;
  const flush = () => {
    if (started) out.push({ text, quoted });
    text = "";
    quoted = false;
    started = false;
  };
  for (let i = 0; i < seg.length; i += 1) {
    const c = seg[i];
    if (sq) {
      if (c === "'") {
        if (seg[i + 1] === "'") {
          text += "'";
          i += 1;
          continue;
        }
        sq = false;
        continue;
      }
      text += c;
      continue;
    }
    if (dq) {
      if (c === "`") {
        text += seg[i + 1] ?? "";
        i += 1;
        continue;
      }
      if (c === '"') {
        if (seg[i + 1] === '"') {
          text += '"';
          i += 1;
          continue;
        }
        dq = false;
        continue;
      }
      text += c;
      continue;
    }
    if (c === "`") {
      text += seg[i + 1] ?? "";
      i += 1;
      started = true;
      continue;
    }
    if (c === "'") {
      sq = true;
      quoted = true;
      started = true;
      continue;
    }
    if (c === '"') {
      dq = true;
      quoted = true;
      started = true;
      continue;
    }
    if (c === " " || c === "	" || c === "\r") {
      flush();
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}" || c === ",") {
      flush();
      continue;
    }
    text += c;
    started = true;
  }
  flush();
  return out;
}
function psFold(s) {
  return s.toLowerCase();
}
var PS_WRAPPERS = /* @__PURE__ */ new Set([
  "start-process",
  "start",
  "saps",
  "invoke-command",
  "icm",
  "measure-command",
  "sudo",
  "doas"
]);
function psCommandOf(tokens) {
  for (const t of tokens) {
    const raw = t.text;
    if (raw === "") continue;
    if (raw === "&" || raw === ".") continue;
    if (raw === "=") continue;
    if (/^\$[^=]*=?$/.test(raw)) continue;
    if (/^\$[A-Za-z_:][\w:]*=/.test(raw)) continue;
    const leaf = raw.split(/[\\/]/).pop() ?? raw;
    const name = psFold(leaf);
    if (PS_WRAPPERS.has(name)) continue;
    return name;
  }
  return "";
}
function psOperands(tokens) {
  const out = [];
  let seenCmd = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (t.text === "" || t.text === "&" || t.text === ".") continue;
    if (!seenCmd) {
      if (/^\$/.test(t.text) || t.text === "=") continue;
      seenCmd = true;
      continue;
    }
    if (!t.quoted && t.text.startsWith("-")) {
      continue;
    }
    out.push(t);
  }
  return out;
}
var IEX = /* @__PURE__ */ new Set(["invoke-expression", "iex"]);
var PS_HOSTS = /* @__PURE__ */ new Set(["powershell", "powershell.exe", "pwsh", "pwsh.exe", "cmd", "cmd.exe"]);
function psExpandOnce(cmd) {
  const extra = [];
  for (const seg of psSegments(cmd)) {
    const tokens = psTokenize(seg);
    if (tokens.length === 0) continue;
    const isHost = tokens.some((t) => PS_HOSTS.has(psFold(t.text.split(/[\\/]/).pop() ?? "")));
    for (let i = 0; i < tokens.length; i += 1) {
      const t = tokens[i];
      const lead = psFold(t.text.split(/[\\/]/).pop() ?? "");
      if (!t.quoted && IEX.has(lead)) {
        for (const rest of tokens.slice(i + 1)) if (rest.text !== "") extra.push(rest.text);
        continue;
      }
      if (!isHost || t.quoted) continue;
      const next = tokens[i + 1]?.text ?? "";
      if (next === "") continue;
      const slash = psFold(t.text);
      if (slash === "/c" || slash === "/k") {
        extra.push(next);
        continue;
      }
      if (!t.text.startsWith("-")) continue;
      const pname = psFold(t.text.slice(1).split(":")[0] ?? "");
      if (pname === "") continue;
      if ("encodedcommand".startsWith(pname)) {
        if (/^[A-Za-z0-9+/]{8,}={0,2}$/.test(next)) {
          const dec = Buffer.from(next, "base64").toString("utf16le");
          if (dec !== "") extra.push(dec);
        }
        continue;
      }
      if ("command".startsWith(pname)) extra.push(next);
      else if ("argumentlist".startsWith(pname) || "args".startsWith(pname)) extra.push(next);
    }
  }
  return extra;
}
function psExpand(cmd) {
  let out = cmd;
  for (let round = 0; round < 3; round += 1) {
    const extra = psExpandOnce(out);
    if (extra.length === 0) break;
    const cleaned = extra.map((e) => e.replace(/^\s*\/[cCkK]\s+/, ""));
    const next = `${out}
${cleaned.join("\n")}`;
    if (next === out) break;
    out = next;
  }
  return out;
}
function psNetCall(cmd, names) {
  for (const n of names) {
    const re = new RegExp(`\\[[\\w.]*\\b${n}\\s*\\]\\s*::`, "i");
    if (re.test(cmd)) return true;
  }
  return false;
}

// src/walls/lib/ps-reads.ts
var PS_READERS = /* @__PURE__ */ new Set([
  "get-content",
  "gc",
  "cat",
  "type",
  "select-string",
  "sls",
  "import-csv",
  "import-clixml",
  "convertfrom-json",
  "get-filehash",
  "copy-item",
  "cp",
  "copy",
  "cpi",
  "move-item",
  "mv",
  "move",
  "mi",
  "out-string",
  "get-item",
  "gi",
  "send-mailmessage",
  // Piped destinations that a `Get-ChildItem | …` lands in.
  "foreach-object",
  "foreach",
  "%",
  "where-object",
  "where",
  "?"
]);
var PS_COPIERS = /* @__PURE__ */ new Set(["copy-item", "cp", "copy", "cpi", "move-item", "mv", "move", "mi"]);
function psCanReadFile(cmd) {
  for (const seg of psSegments(cmd)) {
    if (PS_READERS.has(psCommandOf(psTokenize(seg)))) return true;
  }
  return psNetCall(cmd, ["IO\\.File", "IO\\.StreamReader", "Text\\.Encoding"]);
}
function psReadOperands(cmd) {
  const out = [];
  for (const seg of psSegments(cmd)) {
    const tokens = psTokenize(seg);
    const name = psCommandOf(tokens);
    if (name === "" || !PS_READERS.has(name)) continue;
    let ops = psOperands(dropPsWriteTargets(tokens));
    if (PS_COPIERS.has(name)) {
      const inParam = tokens.some((t) => !t.quoted && /^-d(e(s(t(i(n(a(t(i(o(n)?)?)?)?)?)?)?)?)?)?$/i.test(t.text.split(":")[0] ?? ""));
      if (!inParam && ops.length >= 2) ops = ops.slice(0, -1);
    }
    for (const o of ops) {
      if (o.text === "") continue;
      out.push(o.text);
      if (o.text.includes("\\")) out.push(o.text.split("\\").join("/"));
    }
    for (const t of tokens) {
      const i = t.text.indexOf(":");
      if (t.text.startsWith("-") && i > 0) {
        const v = t.text.slice(i + 1);
        if (v !== "" && !v.startsWith("$")) out.push(v);
      }
    }
  }
  for (const m of cmd.matchAll(/::\s*\w+\s*\(\s*(["'])([^"']+)\1/g)) {
    out.push(m[2]);
  }
  return out;
}
function dropPsWriteTargets(tokens) {
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!t.quoted && /^(?:[0-9*]*)>>?$/.test(t.text)) {
      i += 1;
      continue;
    }
    if (!t.quoted && /^(?:[0-9*]*)>>?./.test(t.text)) continue;
    out.push(t);
  }
  return out;
}

// src/walls/block-secret-reads.ts
var STRONG = new RegExp(
  `(^|[/ "'=<(])\\.env(\\.[A-Za-z0-9_-]+)*($|[ "'<>)~])|(^|[/ "'=<(])[A-Za-z0-9_-]+\\.env($|[ "'<>)~])|id_rsa|id_ed25519|\\.pem($|[ "'])|\\.pfx($|[ "'])|(^|[/ "'])[^ ]*\\.key($|[ "'])|keys/apps/[^ ]*\\.json|GATEWAY_API_KEYS\\.json|secrets?\\.(json|ya?ml|env)($|[ "'])|\\.netrc|\\.npmrc|\\.pypirc`,
  "i"
);
var AMBIG_PATH = /credentials(\.(json|ya?ml|txt))?($|[ "'])|authorized_keys|known_hosts/i;
var AMBIG_CMD = /(^|[^A-Za-z0-9_])(credentials|authorized_keys|known_hosts)\.[A-Za-z0-9]+|[/~][^ "']*(credentials|authorized_keys|known_hosts)($|[ "'])/i;
var EXEMPT_SUFFIX = /\.(example|template|sample)\b/;
var BLOCK_MSG = "BLOCKED by block-secret-reads: this targets a credential/secret file pattern. CLAUDE.MD hard limit: never read credential or secret files. Reference secrets by path, never by value (see .claude/rules/no-direct-llm-calls.md token-handling rules). To put a secret where this repo's code can USE it, store it: printf %s '<value>' | .claude/scripts/scrumux secret NAME \u2014 it lands in .env, gitignored and mode 600, and is never printed back. Never paste a value into a file, a cell, a record or a commit message. To learn which variables exist, run .claude/scripts/scrumux secret list \u2014 names and fingerprints, never values; nothing needs the file read for that. If this file is genuinely not a secret, rename it out of the secret pattern or declare it in .claude/project-walls.conf with an allow line and a reason.";
function unquote(w) {
  return w.replace(/["'`()<>]/g, "");
}
function readOperands(command) {
  const out = [];
  for (const seg of command.split(/[;|&\n]/)) {
    if (seg === "") continue;
    const byProgram = canReadFile(seg) || readsBySubstitution(seg);
    if (!byProgram) {
      if (shellReads(seg)) out.push(...shellReadTargets(seg));
      continue;
    }
    const cw = cmdWords(seg)[0] ?? "";
    let words = dropWriteTargets(seg.split(/\s+/).filter((w) => w !== ""));
    if (cw === "tee") {
      words = words.filter((w, i) => i === 0 || w.startsWith("-"));
    }
    if (cw === "cp" || cw === "mv") {
      const inFlag = words.some((w) => /^--target-directory/.test(w) || /^-[A-Za-z]*t/.test(w));
      if (!inFlag) {
        const positional = words.filter((w) => !w.startsWith("-"));
        if (positional.length >= 3) words = positional.slice(0, -1);
      }
    }
    out.push(...words);
  }
  return out;
}
var INPUT_TARGET = /(?:^|[^<])<>?\s*([^<>&|\s][^\s]*)/g;
function shellReadTargets(segment) {
  return [...segment.matchAll(INPUT_TARGET)].map((m) => m[1]);
}
var SUBSTITUTION_WORD = /(?:\$\(|`|<\()\s*([^\s`()]+)/g;
function readsBySubstitution(segment) {
  for (const m of segment.matchAll(SUBSTITUTION_WORD)) {
    if (canReadFile(m[1])) return true;
  }
  return false;
}
function dropWriteTargets(words) {
  const out = [];
  const bare = /^(?:[0-9]*|&)>>?\|?$/;
  const attached = /^(?:[0-9]*|&)>>?\|?./;
  for (let i = 0; i < words.length; i += 1) {
    const w = words[i];
    if (bare.test(w)) {
      i += 1;
      continue;
    }
    if (attached.test(w)) continue;
    out.push(w);
  }
  return out;
}
function main(io = processWallIo()) {
  refuseOldNode("block-secret-reads", io);
  const hookDir = dirname(fileURLToPath2(import.meta.url));
  const input = readHookInput(hookDir, io);
  const fp = input.filePath;
  const cmd = input.command;
  if (fp === "" && cmd === "") allow(io);
  const conf = loadConf(input.root);
  emitWarnings(conf, io.err);
  const confRefusal = (subject, safe2) => {
    const r = refuses(conf, subject);
    if (!r.refused) return;
    const why = r.failedClosed ? "a refuse pattern this build cannot evaluate \u2014 refusing rather than waving it through (OQ-8, D-0085)" : reasonFor(conf, "refuse", subject);
    wallsRecord({ root: input.root, wall: "project-walls.conf", subject: safe2, reason: why, payload: input.payload });
    refuse(io, `BLOCKED by project-walls.conf: ${why}`);
  };
  if (fp !== "") {
    if (matchesAnyLine(EXEMPT_SUFFIX, fp)) allow(io);
    if (allows(conf, fp)) allow(io);
    confRefusal(fp, fp);
    if (matchesAnyLine(STRONG, fp) || matchesAnyLine(AMBIG_PATH, fp)) {
      wallsRecord({
        root: input.root,
        wall: "block-secret-reads",
        subject: fp,
        reason: "targets a credential or secret file pattern",
        payload: input.payload
      });
      refuse(io, BLOCK_MSG);
    }
    allow(io);
  }
  const safe = cmdWords(cmd)[0] ?? "";
  if (allows(conf, cmd)) allow(io);
  confRefusal(cmd, safe);
  const psCmd = psExpand(cmd);
  const arms = [];
  const posixOperands = readOperands(cmd);
  if (posixOperands.length > 0) arms.push({ operands: posixOperands });
  if (psCanReadFile(psCmd)) arms.push({ operands: psReadOperands(psCmd) });
  if (arms.length === 0) allow(io);
  for (const arm of arms) {
    for (const w of arm.operands) {
      if (!matchesAnyLine(STRONG, w) && !matchesAnyLine(AMBIG_CMD, w)) continue;
      const q = unquote(w);
      if (/\.(example|template|sample)$/.test(q)) continue;
      wallsRecord({
        root: input.root,
        wall: "block-secret-reads",
        subject: safe,
        reason: "targets a credential or secret file pattern",
        payload: input.payload
      });
      refuse(io, BLOCK_MSG);
    }
  }
  allow(io);
}
runAsEntry("block-secret-reads", import.meta.url, main);
export {
  dropWriteTargets,
  main,
  readOperands,
  readsBySubstitution,
  shellReadTargets
};
