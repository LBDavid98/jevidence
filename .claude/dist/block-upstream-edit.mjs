#!/usr/bin/env node

// src/walls/block-upstream-edit.ts
import { dirname } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { readFileSync as readFileSync2, existsSync as existsSync2 } from "node:fs";

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
    const leaf = raw.split(/[\\/]/).pop() ?? raw;
    const name = psFold(leaf);
    if (PS_WRAPPERS.has(name)) continue;
    return name;
  }
  return "";
}
function psHasParam(tokens, name) {
  const want = psFold(name);
  return tokens.some((t) => {
    if (t.quoted) return false;
    if (!t.text.startsWith("-") || t.text.startsWith("--")) return false;
    const body = psFold(t.text.slice(1).split(":")[0] ?? "");
    return body !== "" && want.startsWith(body);
  });
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

// src/walls/lib/heredoc.ts
var OPEN = /(?<!<)<<(?!<)(-?)[ \t]*(?:'([^']*)'|"([^"]*)"|\\?([^\s;&|<>()'"`]+))?/g;
function heredocOpens(line) {
  const out = [];
  for (const m of line.matchAll(OPEN)) {
    const word = m[2] ?? m[3] ?? m[4] ?? null;
    out.push({ word: word === "" ? null : word, stripTabs: m[1] === "-" });
  }
  return out;
}
function closesHeredoc(line, open) {
  if (open.word === null) return false;
  let l = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (open.stripTabs) l = l.replace(/^\t+/, "");
  return l === open.word;
}

// src/walls/block-upstream-edit.ts
function isProtected(path) {
  const p = path.includes("\\") ? path.split("\\").join("/") : path;
  return /\.claude\/(scripts|schemas|agents|dist)(\/|$)/.test(p);
}
function redirGluedTarget(tok) {
  const m = /^(?:[0-9]{1,2}|&)?>>?(.+)$/.exec(tok);
  if (m === null) return "";
  return stripTok(m[1]);
}
function stripTok(t) {
  return t.replace(/["'`;|&()<>]/g, "");
}
var MUTATORS = /* @__PURE__ */ new Set([
  "cp",
  "mv",
  "rm",
  "ln",
  "install",
  "tee",
  "dd",
  "truncate",
  "touch",
  "chmod",
  "chown",
  "patch",
  "ed",
  "rsync",
  "unzip",
  "tar",
  "shred",
  "mkdir",
  "rmdir"
]);
var INTERPRETERS = /* @__PURE__ */ new Set([
  "python",
  "python3",
  "node",
  "nodejs",
  "ruby",
  "perl",
  "php",
  "sh",
  "bash",
  "zsh",
  "osascript"
]);
var WRAPPERS = /* @__PURE__ */ new Set(["env", "sudo", "time", "nohup", "exec", "command"]);
var GIT_MUTATING = /* @__PURE__ */ new Set(["apply", "checkout", "restore", "rm", "mv", "clean"]);
var PS_MUTATORS = /* @__PURE__ */ new Set([
  "set-content",
  "sc",
  "out-file",
  "add-content",
  "ac",
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
  "copy-item",
  "cp",
  "copy",
  "cpi",
  "move-item",
  "mv",
  "move",
  "mi",
  "rename-item",
  "rni",
  "ren",
  "set-itemproperty",
  "sp",
  "expand-archive",
  "compress-archive",
  "start-bitstransfer",
  "tee-object",
  "tee",
  "set-acl"
]);
var PS_INTERPRETERS = /* @__PURE__ */ new Set([
  "python",
  "python.exe",
  "python3",
  "node",
  "node.exe",
  "ruby",
  "perl",
  "php",
  "powershell",
  "powershell.exe",
  "pwsh",
  "pwsh.exe",
  "cmd",
  "cmd.exe",
  "invoke-expression",
  "iex"
]);
function scanCommand(cmd) {
  let expectCmd = true;
  let cls = "BENIGN";
  let redir = false;
  const pending = [];
  let cont = false;
  for (const line of cmd.split("\n")) {
    if (pending.length > 0) {
      if (closesHeredoc(line, pending[0])) {
        pending.shift();
        cont = false;
        continue;
      }
      const bodyHit = scanBodyLine(line);
      if (bodyHit !== null) return bodyHit;
      continue;
    }
    if (!cont) {
      expectCmd = true;
      cls = "BENIGN";
      redir = false;
    }
    const opens = heredocOpens(line);
    cont = line.endsWith("\\");
    for (const tok of line.split(/[ \t]+/)) {
      if (tok === "") continue;
      if (tok === ";" || tok === "&&" || tok === "||" || tok === "|") {
        expectCmd = true;
        cls = "BENIGN";
        redir = false;
        continue;
      }
      const trailing = /[;|]$|&&$|\|\|$/.test(tok);
      if ([">", ">>", "1>", "1>>", "2>", "2>>", "&>", "&>>"].includes(tok)) {
        redir = true;
        continue;
      }
      {
        const rt = redirGluedTarget(tok);
        if (rt !== "") {
          if (isProtected(rt)) return { path: rt };
          redir = false;
          if (trailing) {
            expectCmd = true;
            cls = "BENIGN";
          }
          continue;
        }
      }
      const t = stripTok(tok);
      if (t === "") {
        if (trailing) {
          expectCmd = true;
          cls = "BENIGN";
        }
        continue;
      }
      if (redir) {
        redir = false;
        if (isProtected(t)) return { path: t };
        if (trailing) {
          expectCmd = true;
          cls = "BENIGN";
        }
        continue;
      }
      if (expectCmd) {
        if (t.includes("=") || WRAPPERS.has(t)) {
        } else if (MUTATORS.has(t)) {
          cls = "MUTATOR";
          expectCmd = false;
        } else if (INTERPRETERS.has(t)) {
          cls = "INTERPRETER";
          expectCmd = false;
        } else if (t === "sed" || t === "awk") {
          cls = "SED";
          expectCmd = false;
        } else if (t === "git") {
          cls = "GIT";
          expectCmd = false;
        } else {
          cls = "BENIGN";
          expectCmd = false;
        }
      } else {
        if (cls === "SED" && t.startsWith("-i")) cls = "MUTATOR";
        else if (cls === "GIT") cls = GIT_MUTATING.has(t) ? "MUTATOR" : "BENIGN";
        if ((cls === "MUTATOR" || cls === "INTERPRETER") && isProtected(t)) return { path: t };
      }
      if (trailing) {
        expectCmd = true;
        cls = "BENIGN";
      }
    }
    pending.push(...opens);
  }
  return null;
}
function scanBodyLine(line) {
  for (const tok of line.split(/[ \t]+/)) {
    if (tok === "") continue;
    const rt = redirGluedTarget(tok);
    if (rt !== "" && isProtected(rt)) return { path: rt };
    const t = stripTok(tok);
    if (t !== "" && isProtected(t)) return { path: t };
  }
  return null;
}
function psScanCommand(cmd) {
  for (const seg of psSegments(cmd, false)) {
    const rtokens = psTokenize(seg);
    for (let i = 0; i < rtokens.length; i += 1) {
      const t = rtokens[i];
      if (t.quoted) continue;
      if ([">", ">>", "1>", "1>>", "2>", "2>>", "*>", "*>>"].includes(t.text)) {
        const target = rtokens[i + 1]?.text ?? "";
        if (target !== "" && isProtected(target)) return { path: target };
        continue;
      }
      const rt = redirGluedTarget(t.text.replace(/^\*(?=>)/, "2"));
      if (rt !== "" && isProtected(rt)) return { path: rt };
    }
  }
  for (const seg of psSegments(cmd)) {
    const tokens = psTokenize(seg);
    if (tokens.length === 0) continue;
    const name = psCommandOf(tokens);
    if (!PS_MUTATORS.has(name) && !PS_INTERPRETERS.has(name)) continue;
    if (name === "new-item" || name === "ni") {
      if (!psHasParam(tokens, "Force")) continue;
    }
    for (const t of tokens) {
      if (t.text === "") continue;
      if (isProtected(t.text)) return { path: t.text };
    }
  }
  for (const m of cmd.matchAll(/::\s*(Write\w*|Append\w*|Delete|Move|Copy|Create\w*)\s*\(\s*(["'])([^"']+)\2/gi)) {
    if (isProtected(m[3])) return { path: m[3] };
  }
  return null;
}
function main(io = processWallIo()) {
  refuseOldNode("block-upstream-edit", io);
  const hookDir = dirname(fileURLToPath2(import.meta.url));
  const input = readHookInput(hookDir, io);
  const marker = `${input.root}/.claude/DEPLOYED`;
  if (!existsSync2(marker)) allow(io);
  const block = (path) => {
    let remote = "the upstream harness repository";
    try {
      const m = JSON.parse(readFileSync2(marker, "utf8"));
      if (m !== null && typeof m === "object") {
        const sr = m["source_remote"];
        if (typeof sr === "string" && sr !== "") remote = sr;
      }
    } catch {
    }
    wallsRecord({
      root: input.root,
      wall: "block-upstream-edit",
      subject: path,
      reason: "harness machinery in a deployed repo is a dependency, not the work",
      payload: input.payload
    });
    refuse(io, `BLOCKED by block-upstream-edit: ${path} is harness machinery, and this repo is a DEPLOYMENT of the harness (.claude/DEPLOYED). D-0078 boundary 1: no writes to harness machinery in a deployed repo. Capture the problem where it will be seen \u2014 .claude/scripts/scrumux issue new --type harness --source <you> --summary '<what the harness does wrong>' --fix '<what it should do>' \u2014 then fix it upstream in ${remote} and redeploy. A denied call is a stop, not an obstacle: do not re-route this change through another tool (I-0121).`);
  };
  const fp = input.filePath !== "" ? input.filePath : input.notebookPath;
  if (fp !== "") {
    if (isProtected(fp)) block(fp);
    allow(io);
  }
  if (input.command === "") allow(io);
  const hit = scanCommand(input.command);
  if (hit !== null) block(hit.path);
  const psHit = psScanCommand(psExpand(input.command));
  if (psHit !== null) block(psHit.path);
  allow(io);
}
runAsEntry("block-upstream-edit", import.meta.url, main);
export {
  isProtected,
  main,
  psScanCommand,
  redirGluedTarget,
  scanCommand
};
