#!/usr/bin/env node

// src/walls/block-governance-write.ts
import { dirname, resolve as resolve3 } from "node:path";
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

// src/walls/lib/record.ts
import { appendFileSync, mkdirSync, existsSync } from "node:fs";

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
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
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
    const leaf2 = raw.split(/[\\/]/).pop() ?? raw;
    const name = psFold(leaf2);
    if (PS_WRAPPERS.has(name)) continue;
    return name;
  }
  return "";
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

// src/walls/lib/gov-paths.ts
import { existsSync as existsSync2, realpathSync as realpathSync2 } from "node:fs";
import { isAbsolute, join, resolve as resolve2, sep } from "node:path";
var WIN = process.platform === "win32";
function canon(p) {
  const abs = resolve2(p);
  try {
    return realpathSync2(abs);
  } catch {
    return abs;
  }
}
function slashes(p) {
  return WIN ? p : p.split("\\").join("/");
}
function isGovernancePath(raw, ctx) {
  let p = slashes(raw.trim());
  if (p === "") return false;
  if (p.startsWith("~/") || p === "~") p = join(process.env["HOME"] ?? "~", p.slice(1));
  const segs = p.split(/[\\/]+/);
  const gi = segs.findIndex((s) => s === "governance" || WIN && s.toLowerCase() === "governance");
  if (gi < 0) return false;
  if (segs.slice(0, gi).some((s) => s.includes("$"))) return true;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(p)) return false;
  const abs = isAbsolute(p) ? p : resolve2(ctx.base, p);
  const absSegs = resolve2(abs).split(/[\\/]+/);
  const roots = /* @__PURE__ */ new Set([canon(ctx.root), canon(ctx.workRoot)]);
  for (let i = 0; i < absSegs.length; i += 1) {
    const s = absSegs[i];
    if (s !== "governance" && !(WIN && s.toLowerCase() === "governance")) continue;
    const parent = canon(absSegs.slice(0, i).join(sep) || sep);
    if (roots.has(parent)) return true;
    if (existsSync2(join(parent, ".claude", "DEPLOYED"))) return true;
  }
  return false;
}

// src/walls/lib/heredoc.ts
function closesHeredoc(line, open) {
  if (open.word === null) return false;
  let l = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (open.stripTabs) l = l.replace(/^\t+/, "");
  return l === open.word;
}

// src/walls/lib/gov-lex.ts
function lexShell(cmd) {
  const commands = [];
  const nested = [];
  let cur = { words: [], writes: [], bodies: [] };
  let word = "";
  let inWord = false;
  let next = "word";
  let stripTabs = false;
  const pending = [];
  const endWord = () => {
    if (!inWord) return;
    if (next === "write") cur.writes.push(word);
    else if (next === "heredoc") pending.push({ open: { word, stripTabs }, owner: cur });
    else if (next !== "skip") cur.words.push(word);
    next = "word";
    word = "";
    inWord = false;
  };
  const endCmd = () => {
    endWord();
    if (cur.words.length > 0 || cur.writes.length > 0 || cur.bodies.length > 0) commands.push(cur);
    cur = { words: [], writes: [], bodies: [] };
  };
  const subst = (i) => {
    let depth = 0;
    let q = "";
    for (let j = i; j < cmd.length; j += 1) {
      const c = cmd[j];
      if (q !== "") {
        if (c === "\\" && q === '"') j += 1;
        else if (c === q) q = "";
        continue;
      }
      if (c === "'" || c === '"') {
        q = c;
        continue;
      }
      if (c === "(") depth += 1;
      if (c === ")") {
        depth -= 1;
        if (depth === 0) {
          nested.push(cmd.slice(i + 1, j));
          return j;
        }
      }
    }
    nested.push(cmd.slice(i + 1));
    return cmd.length;
  };
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (c === "\\") {
      if (cmd[i + 1] === "\n") {
        i += 1;
        continue;
      }
      word += cmd[i + 1] ?? "";
      inWord = true;
      i += 1;
      continue;
    }
    if (c === "'") {
      const j = cmd.indexOf("'", i + 1);
      const end = j < 0 ? cmd.length : j;
      word += cmd.slice(i + 1, end);
      inWord = true;
      i = end;
      continue;
    }
    if (c === '"') {
      inWord = true;
      let j = i + 1;
      for (; j < cmd.length && cmd[j] !== '"'; j += 1) {
        if (cmd[j] === "\\" && j + 1 < cmd.length) {
          word += cmd[j + 1];
          j += 1;
          continue;
        }
        if (cmd[j] === "$" && cmd[j + 1] === "(") {
          const k = subst(j + 1);
          word += cmd.slice(j, k + 1);
          j = k;
          continue;
        }
        if (cmd[j] === "`") {
          const k = cmd.indexOf("`", j + 1);
          const e = k < 0 ? cmd.length : k;
          nested.push(cmd.slice(j + 1, e));
          j = e;
          continue;
        }
        word += cmd[j];
      }
      i = j;
      continue;
    }
    if (c === "$" && cmd[i + 1] === "(") {
      const k = subst(i + 1);
      word += cmd.slice(i, k + 1);
      inWord = true;
      i = k;
      continue;
    }
    if (c === "`") {
      const k = cmd.indexOf("`", i + 1);
      const e = k < 0 ? cmd.length : k;
      nested.push(cmd.slice(i + 1, e));
      i = e;
      inWord = true;
      continue;
    }
    if (c === "#" && !inWord) {
      const k = cmd.indexOf("\n", i);
      i = (k < 0 ? cmd.length : k) - 1;
      continue;
    }
    if (c === " " || c === "	" || c === "\r") {
      endWord();
      continue;
    }
    if (c === "\n") {
      endCmd();
      while (pending.length > 0) {
        const { open, owner } = pending.shift();
        const lines = [];
        let k = i + 1;
        let closed = false;
        while (k <= cmd.length) {
          const nl = cmd.indexOf("\n", k);
          const line = cmd.slice(k, nl < 0 ? cmd.length : nl);
          k = nl < 0 ? cmd.length + 1 : nl + 1;
          if (closesHeredoc(line, open)) {
            closed = true;
            break;
          }
          lines.push(line);
        }
        owner.bodies.push(lines.join("\n"));
        i = Math.min(k, cmd.length) - 1;
        if (!closed) {
          i = cmd.length;
          break;
        }
      }
      continue;
    }
    if (c === ";" || c === "(" || c === ")" || c === "{" && !inWord || c === "}" && !inWord) {
      endCmd();
      continue;
    }
    if (c === "|") {
      if (cmd[i + 1] === "|" || cmd[i + 1] === "&") i += 1;
      endCmd();
      continue;
    }
    if (c === "&") {
      if (cmd[i + 1] === ">") {
        endWord();
        i += cmd[i + 2] === ">" ? 2 : 1;
        next = "write";
        continue;
      }
      if (cmd[i + 1] === "&") i += 1;
      endCmd();
      continue;
    }
    if (c === ">" || c === "<" && cmd[i + 1] === ">") {
      if (inWord && /^\d+$/.test(word)) {
        word = "";
        inWord = false;
      } else endWord();
      if (c === "<") i += 1;
      if (cmd[i + 1] === ">" || cmd[i + 1] === "|") i += 1;
      if (cmd[i + 1] === "&") {
        i += 1;
        if (/^[\d-]/.test(cmd[i + 1] ?? "")) {
          while (/[\d-]/.test(cmd[i + 1] ?? "")) i += 1;
          continue;
        }
      }
      next = "write";
      continue;
    }
    if (c === "<") {
      endWord();
      if (cmd[i + 1] === "<" && cmd[i + 2] === "<") {
        i += 2;
        next = "skip";
        continue;
      }
      if (cmd[i + 1] === "<") {
        i += 1;
        stripTabs = cmd[i + 1] === "-";
        if (stripTabs) i += 1;
        next = "heredoc";
        continue;
      }
      next = "skip";
      continue;
    }
    word += c;
    inWord = true;
  }
  endCmd();
  return { commands, nested };
}

// src/walls/lib/gov-program.ts
var SINKS = [
  { re: /\bPath\s*\((?=[^)]*\)\s*\.\s*(?:write_text|write_bytes|unlink|rename|replace|touch)\s*\()/g, args: "first" },
  { re: /\bPath\s*\((?=[^)]*\)\s*\.\s*open\s*\(\s*(?:mode\s*=\s*)?['"][rbt]*[wax+])/g, args: "first" },
  { re: /\b(?:writeFileSync|writeFile|appendFileSync|appendFile|createWriteStream|truncateSync|truncate|unlinkSync|unlink|rmSync|rm|rmdirSync|file_put_contents)\s*\(/g, args: "first" },
  { re: /\b(?:File|IO)\s*\.\s*(?:write|binwrite|delete|unlink)\s*\(/g, args: "first" },
  { re: /\bos\s*\.\s*(?:remove|unlink|truncate)\s*\(/g, args: "first" },
  { re: /\bshutil\s*\.\s*rmtree\s*\(/g, args: "first" },
  { re: /\b(?:os\s*\.\s*(?:replace|rename)|shutil\s*\.\s*(?:move|copy|copy2|copyfile|copytree)|renameSync|rename|copyFileSync|copyFile|cpSync|FileUtils\s*\.\s*(?:mv|cp))\s*\(/g, args: "both" }
];
var PERL_OPEN = /\bopen\s*\(?\s*(?:my\s+)?[$\w]+\s*,\s*(['"])\+?>>?\s*([^'"]*)\1(?:\s*,\s*(['"])([^'"]+)\3)?/g;
var AWK_PRINT = /\bprintf?\b[^;\n]*?>>?\s*"([^"]+)"/g;
function literals(text) {
  const out = [];
  for (const m of text.matchAll(/(?:\b[rbfuRBFU]{1,2})?(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) out.push(m[2]);
  return out;
}
function argsAt(text, at) {
  const out = [];
  let depth = 0;
  let q = "";
  let cur = "";
  for (let i = at; i < text.length; i += 1) {
    const c = text[i];
    if (q !== "") {
      cur += c;
      if (c === "\\") {
        cur += text[i + 1] ?? "";
        i += 1;
      } else if (c === q) q = "";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      q = c;
      cur += c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth -= 1;
    }
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}
function literalArg(arg) {
  const m = /^(?:[rbfuRBFU]{1,2})?(["'`])((?:\\.|(?!\1)[^\\])*)\1$/.exec(arg);
  return m === null ? null : m[2];
}
function programWrite(text, argv, ctx) {
  let unknown = false;
  const judge2 = (lit) => {
    if (lit === null) {
      unknown = true;
      return null;
    }
    return isGovernancePath(lit, ctx) ? lit : null;
  };
  for (const m of text.matchAll(/\bopen\s*\(/g)) {
    const args = argsAt(text, (m.index ?? 0) + m[0].length);
    const mode = args.slice(1).map((a) => a.replace(/^(?:mode|flags?)\s*[:=]\s*/, "")).find((a) => /^['"][rbt]*[wax+][rbtwax+]*['"]$/.test(a));
    if (mode === void 0 || args[0] === void 0 || args[0] === "") continue;
    const hit = judge2(literalArg(args[0]));
    if (hit !== null) return { path: hit };
  }
  for (const s of SINKS) {
    for (const m of text.matchAll(s.re)) {
      const args = argsAt(text, (m.index ?? 0) + m[0].length);
      const picked = s.args === "both" ? args.slice(0, 2) : args.slice(0, 1);
      for (const a of picked) {
        if (a === "") continue;
        const hit = judge2(literalArg(a));
        if (hit !== null) return { path: hit };
      }
    }
  }
  for (const m of text.matchAll(PERL_OPEN)) {
    const hit = judge2(m[2] !== "" ? m[2] : m[4] ?? null);
    if (hit !== null) return { path: hit };
  }
  for (const m of text.matchAll(AWK_PRINT)) {
    const hit = judge2(m[1]);
    if (hit !== null) return { path: hit };
  }
  if (!unknown) return null;
  for (const lit of literals(text)) {
    if (lit === "governance" || isGovernancePath(lit, ctx)) return { path: lit };
  }
  for (const w of argv) if (isGovernancePath(w, ctx)) return { path: w };
  return null;
}

// src/walls/lib/gov-shell.ts
var ANY_OPERAND = /* @__PURE__ */ new Set([
  "rm",
  "unlink",
  "mv",
  "tee",
  "sponge",
  "truncate",
  "touch",
  "shred",
  "patch",
  "ed",
  "ex",
  "rmdir"
]);
var DEST_ONLY = /* @__PURE__ */ new Set(["cp", "install", "ln", "rsync"]);
var SHELLS = /* @__PURE__ */ new Set(["sh", "bash", "zsh", "dash", "ksh"]);
var INTERPRETERS = /* @__PURE__ */ new Set([
  "python",
  "python3",
  "node",
  "nodejs",
  "deno",
  "bun",
  "ruby",
  "perl",
  "php",
  "awk",
  "gawk",
  "mawk",
  "osascript"
]);
var WRAPPERS = /* @__PURE__ */ new Set(["env", "sudo", "time", "nohup", "exec", "command", "nice", "ionice", "stdbuf", "xargs", "timeout", "builtin"]);
function leaf(w) {
  const b = w.split("/").pop() ?? w;
  return /^python3?(\.\d+)?$/.test(b) ? b.replace(/\.\d+$/, "") : b;
}
function isCli(word) {
  return leaf(word) === "scrumux" || leaf(word) === "scrumux.mjs";
}
function commandWords(words) {
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w)) {
      i += 1;
      continue;
    }
    const l = leaf(w);
    if (WRAPPERS.has(l)) {
      i += 1;
      while (i < words.length && (words[i].startsWith("-") || l === "timeout" && /^\d/.test(words[i]))) i += 1;
      continue;
    }
    if (l === "uv" && words[i + 1] === "run") {
      i += 2;
      continue;
    }
    break;
  }
  return words.slice(i);
}
function operands(rest) {
  return rest.filter((w) => !w.startsWith("-") || w === "-");
}
function judge(sc, ctx, depth) {
  const gov = (p) => isGovernancePath(p, ctx);
  for (const w of sc.writes) if (gov(w)) return { path: w };
  const words = commandWords(sc.words);
  const head = words[0] ?? "";
  const name = leaf(head);
  const rest = words.slice(1);
  const bodiesAsScripts = () => {
    for (const b of sc.bodies) {
      const v = programWrite(b, [], ctx);
      if (v !== null && gov(v.path)) return v;
    }
    return null;
  };
  if (head === "" || isCli(head) || name === "git") return bodiesAsScripts();
  if ((name === "node" || name === "nodejs") && rest[0] !== void 0 && isCli(rest[0])) return bodiesAsScripts();
  if (ANY_OPERAND.has(name)) {
    const hit = operands(rest).find(gov);
    if (hit !== void 0) return { path: hit };
  }
  if (DEST_ONLY.has(name)) {
    const t = rest.findIndex((w) => w === "-t" || w === "--target-directory");
    const glued = rest.find((w) => w.startsWith("--target-directory="));
    const dest = t >= 0 ? rest[t + 1] : glued !== void 0 ? glued.split("=")[1] : operands(rest).slice(1).pop();
    if (dest !== void 0 && gov(dest)) return { path: dest };
  }
  if (name === "dd") {
    const of = rest.find((w) => w.startsWith("of="));
    if (of !== void 0 && gov(of.slice(3))) return { path: of.slice(3) };
  }
  if (name === "tar") {
    for (let i = 0; i < rest.length; i += 1) {
      const w = rest[i];
      const v = /^--(?:directory|file)=(.*)$/.exec(w)?.[1] ?? (w === "-C" || w === "--directory" || w === "--file" || /^-[A-Za-z]*f$/.test(w) || /^[A-Za-z]*f$/.test(w) && i === 0 ? rest[i + 1] : void 0);
      if (v !== void 0 && gov(v)) return { path: v };
    }
  }
  if (name === "sed" && rest.some((w) => /^-[A-Za-z]*i/.test(w) || w.startsWith("--in-place"))) {
    const hit = operands(rest).find(gov);
    if (hit !== void 0) return { path: hit };
  }
  if (name === "perl" && rest.some((w) => /^-[A-Za-z0-9]*i/.test(w))) {
    const hit = operands(rest).find(gov);
    if (hit !== void 0) return { path: hit };
  }
  if ((name === "awk" || name === "gawk") && rest.some((w, i) => w === "-i" && rest[i + 1] === "inplace" || w === "-iinplace")) {
    const hit = operands(rest).find(gov);
    if (hit !== void 0) return { path: hit };
  }
  if (name === "find" && rest.some((w) => ["-delete", "-exec", "-execdir", "-ok", "-okdir"].includes(w))) {
    const hit = rest.find(gov);
    if (hit !== void 0) return { path: hit };
  }
  if (SHELLS.has(name) || name === "eval") {
    if (depth > 4) return null;
    const ci = rest.findIndex((w) => /^-[a-z]*c[a-z]*$/.test(w));
    const texts = name === "eval" ? [rest.join(" ")] : ci >= 0 && rest[ci + 1] !== void 0 ? [rest[ci + 1]] : [];
    for (const t of [...texts, ...sc.bodies]) {
      const hit = scanShell(t, ctx, depth + 1);
      if (hit !== null) return hit;
    }
    return null;
  }
  if (INTERPRETERS.has(name)) {
    const v = programWrite([...rest, ...sc.bodies].join("\n"), rest, ctx);
    if (v !== null) return v;
    return null;
  }
  return bodiesAsScripts();
}
function scanShell(cmd, ctx, depth = 0) {
  const { commands, nested } = lexShell(cmd);
  for (const sc of commands) {
    const hit = judge(sc, ctx, depth);
    if (hit !== null) return hit;
  }
  if (depth > 4) return null;
  for (const n of nested) {
    const hit = scanShell(n, ctx, depth + 1);
    if (hit !== null) return hit;
  }
  return null;
}

// src/walls/lib/gov-ps.ts
var ANY_OPERAND2 = /* @__PURE__ */ new Set([
  "set-content",
  "sc",
  "add-content",
  "ac",
  "out-file",
  "clear-content",
  "clc",
  "new-item",
  "ni",
  "remove-item",
  "rm",
  "del",
  "erase",
  "rd",
  "rmdir",
  "ri",
  "move-item",
  "mv",
  "move",
  "mi",
  "rename-item",
  "rni",
  "ren",
  "tee-object",
  "tee"
]);
var COPY = /* @__PURE__ */ new Set(["copy-item", "cp", "copy", "cpi"]);
var INTERPRETERS2 = /* @__PURE__ */ new Set([
  "python",
  "python.exe",
  "python3",
  "py",
  "py.exe",
  "node",
  "node.exe",
  "ruby",
  "perl",
  "php",
  "deno",
  "bun"
]);
var VALUE_PARAMS = ["path", "literalpath", "filepath", "destination", "destinationpath", "value", "encoding", "itemtype", "name", "newname"];
function split(tokens, name) {
  const params = /* @__PURE__ */ new Map();
  const positional = [];
  let seen = false;
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (!seen) {
      if (psFold(t.text.split(/[\\/]/).pop() ?? "") === name) seen = true;
      continue;
    }
    if (!t.quoted && /^-[A-Za-z]/.test(t.text)) {
      const [p, glued] = t.text.slice(1).split(":");
      const pn = psFold(p ?? "");
      const full = VALUE_PARAMS.find((v) => v.startsWith(pn)) ?? pn;
      if (glued !== void 0 && glued !== "") {
        params.set(full, glued);
        continue;
      }
      if (VALUE_PARAMS.some((v) => v.startsWith(pn)) && tokens[i + 1] !== void 0) {
        params.set(full, tokens[i + 1].text);
        i += 1;
      }
      continue;
    }
    positional.push(t.text);
  }
  return { params, positional };
}
function stripComments(cmd) {
  let out = "";
  let q = "";
  for (let i = 0; i < cmd.length; i += 1) {
    const c = cmd[i];
    if (q !== "") {
      if (c === q) q = "";
      out += c;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      out += c;
      continue;
    }
    if (c === "#" && (i === 0 || /\s/.test(cmd[i - 1]))) {
      const nl = cmd.indexOf("\n", i);
      if (nl < 0) break;
      i = nl - 1;
      continue;
    }
    out += c;
  }
  return out;
}
function scanPowerShell(raw, ctx) {
  const gov = (p) => isGovernancePath(p, ctx);
  const cmd = stripComments(raw);
  for (const seg of psSegments(cmd, false)) {
    const toks = psTokenize(seg);
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted) continue;
      const op = /^(?:[0-9*]|&)?>>?(.*)$/.exec(t.text);
      if (op === null) continue;
      const target = op[1] !== "" ? op[1] : toks[i + 1]?.text ?? "";
      if (/^&?\d$/.test(target)) continue;
      if (target !== "" && gov(target)) return { path: target };
    }
  }
  for (const seg of psSegments(cmd)) {
    const toks = psTokenize(seg);
    const name = psCommandOf(toks);
    if (name === "" || name === "git" || name === "git.exe" || isCli(name)) continue;
    const { params, positional } = split(toks, name);
    if (ANY_OPERAND2.has(name)) {
      for (const k of ["path", "literalpath", "filepath"]) {
        const v = params.get(k);
        if (v !== void 0 && gov(v)) return { path: v };
      }
      const hit = positional.find(gov);
      if (hit !== void 0) return { path: hit };
    }
    if (COPY.has(name)) {
      const dest = params.get("destination") ?? positional[params.has("path") || params.has("literalpath") ? 0 : 1];
      if (dest !== void 0 && gov(dest)) return { path: dest };
    }
    if (name === "expand-archive") {
      const dest = params.get("destinationpath") ?? positional[1];
      if (dest !== void 0 && gov(dest)) return { path: dest };
    }
    if (INTERPRETERS2.has(name)) {
      if (name.startsWith("node") && positional[0] !== void 0 && isCli(positional[0])) continue;
      const v = programWrite(positional.join("\n"), positional, ctx);
      if (v !== null) return v;
    }
  }
  for (const m of cmd.matchAll(/::\s*(Write\w*|Append\w*|Delete|Move|Copy|Replace|Create\w*|Open(?:Write)?)\s*\(\s*(["'])([^"']+)\2(?:\s*,\s*(["'])([^"']+)\4)?/gi)) {
    if (psFold(m[1]) !== "copy" && gov(m[3])) return { path: m[3] };
    if (m[5] !== void 0 && gov(m[5])) return { path: m[5] };
  }
  return null;
}

// src/walls/block-governance-write.ts
var WALL = "block-governance-write";
function governanceMessage(path) {
  return `BLOCKED by ${WALL}: ${path} is the governance record, and governance/ is written only by the scrumux CLI \u2014 it validates the write, records who made it and on what authority, and reseals the journal; a hand edit has none of that. Make the change as one literal call: .claude/scripts/scrumux <noun> <verb> \u2026 (\`.claude/scripts/scrumux help\` lists the nouns; \`.claude/scripts/scrumux help <noun>\` names every verb and flag). Reading is allowed \u2014 status, backlog tasks, task brief, issue find, or the Read tool. If no verb records what you need, that is a harness gap, not a reason to write the file: .claude/scripts/scrumux issue new --type harness --source <you> --summary '<the act the CLI cannot record>' --fix '<the verb it needs>', then set the task blocked and say so. If User asked for this correction by hand, the path is his: .claude/scripts/scrumux repair journal <name.json> --apply '<jq>' --why '<his reason>' --by '<who asked>' writes it with its own log entry, or he runs the command himself as ! <command>. A denied call is a stop, not an obstacle: do not re-route this write through another tool.`;
}
function main(io = processWallIo()) {
  refuseOldNode(WALL, io);
  const hookDir = dirname(fileURLToPath2(import.meta.url));
  const input = readHookInput(hookDir, io);
  const ctx = {
    root: resolve3(input.root),
    workRoot: input.workRoot,
    base: input.cwd !== "" ? input.cwd : resolve3(input.root)
  };
  const block = (path) => {
    wallsRecord({
      root: input.root,
      wall: WALL,
      subject: path,
      reason: "governance/ is written only by the scrumux CLI",
      payload: input.payload
    });
    refuse(io, governanceMessage(path));
  };
  const fp = input.filePath !== "" ? input.filePath : input.notebookPath;
  if (fp !== "") {
    if (isGovernancePath(fp, ctx)) block(fp);
    allow(io);
  }
  if (input.command === "") allow(io);
  const hit = scanShell(input.command, ctx) ?? scanPowerShell(psExpand(input.command), ctx);
  if (hit !== null) block(hit.path);
  allow(io);
}
runAsEntry(WALL, import.meta.url, main);
export {
  WALL,
  governanceMessage,
  main
};
