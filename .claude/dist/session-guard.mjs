#!/usr/bin/env node

// src/walls/session-guard.ts
import { resolve as resolve2 } from "node:path";
import { dirname as dirname2 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { readFileSync as readFileSync3 } from "node:fs";

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

// src/nouns/harness/settings.ts
import { closeSync, openSync, readSync, statSync as statSync2 } from "node:fs";

// src/util/fs-predicates.ts
import { accessSync, constants, statSync } from "node:fs";
function isFile(p) {
  try {
    return statSync(p).isFile();
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

// src/nouns/harness/settings.ts
function isObj(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function missingChains(doc) {
  try {
    if (!isObj(doc)) throw new Error("not an object");
    const hooksVal = doc["hooks"];
    const chain = (ev, m) => {
      let arr;
      if (hooksVal === void 0 || hooksVal === null) arr = [];
      else if (isObj(hooksVal)) arr = hooksVal[ev] ?? null;
      else throw new Error("hooks is not indexable");
      let items;
      if (arr === null || arr === void 0) items = [];
      else if (Array.isArray(arr)) items = arr;
      else if (isObj(arr)) items = Object.values(arr);
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
        const s = matcher === null || matcher === void 0 || matcher === false ? "" : matcher;
        if (typeof s !== "string") throw new Error("matcher is not a string");
        if (new RegExp(m).test(s)) n += 1;
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
      for (const item of items) {
        if (!isObj(item)) continue;
        const inner = item["hooks"];
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
function expandProjectDir(s, target) {
  return s.split("${CLAUDE_PROJECT_DIR}").join(target).split("$CLAUDE_PROJECT_DIR").join(target);
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
    return { path: file, why: `(mode ${lsMode(statSync2(file).mode)}, not executable)` };
  }
  return null;
}
function shebangOf(p) {
  try {
    const fd = openSync(p, "r");
    try {
      const buf = Buffer.alloc(128);
      const n = readSync(fd, buf, 0, 128, 0);
      const head = buf.subarray(0, n).toString("utf8");
      if (!head.startsWith("#!")) return "";
      const nl = head.indexOf("\n");
      return (nl === -1 ? head : head.slice(0, nl)).trim();
    } finally {
      closeSync(fd);
    }
  } catch {
    return "";
  }
}

// src/cli/ungoverned.ts
import { existsSync, readFileSync as readFileSync2 } from "node:fs";
import { dirname, join } from "node:path";
var UNGOVERNED_ALLOWED_NOUNS = "backlog graph harness records status";
var ALLOWED = new Set(UNGOVERNED_ALLOWED_NOUNS.split(" "));
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

// src/walls/session-guard.ts
function shellToolHere(platform = process.platform) {
  return platform === "win32" ? "PowerShell" : "Bash";
}
function refuseSession(io, message) {
  io.err(message + "\n");
  io.out(jqCompact({
    continue: false,
    stopReason: message,
    systemMessage: message,
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: message
    }
  }) + "\n");
  return io.exit(0);
}
function main(io = processWallIo()) {
  const hookDir = dirname2(fileURLToPath2(import.meta.url));
  const input = readHookInput(hookDir, io);
  const root = resolve2(input.root);
  if (findMarker(root) !== null) return io.exit(0);
  const tset = `${root}/.claude/settings.json`;
  if (!isFile(tset)) return io.exit(0);
  const old = nodeVersionProblem(process.version);
  if (old !== null) {
    refuseSession(io, `scrumux: this session is REFUSED \u2014 the four walls in ${root} cannot run. Node ${process.version} is too old (>=22.11 is required), so every wall bundle would fail to start, and Claude Code treats a hook that cannot start as NON-BLOCKING: the tool call proceeds and the wall is silently open. Install a newer Node and reopen the session. Nothing was read or written.`);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync3(tset, "utf8"));
  } catch {
    refuseSession(io, `scrumux: this session is REFUSED \u2014 ${tset} is not valid JSON, so Claude Code loads NO hooks at all from it and all four walls are absent while the repo looks entirely normal from the inside. Fix the file (jq . ${tset} names the offending line), then reopen the session.`);
  }
  const missing = missingChains(doc);
  if (missing !== "") {
    refuseSession(io, `scrumux: this session is REFUSED \u2014 ${tset} is missing hook chain(s): ${missing}. On ${process.platform} Claude Code routes shell commands through the ${shellToolHere()} tool, and a chain that does not match it never fires: the walls are declared and dead. Re-run harness deploy against this repo, or copy the missing chain(s) in by hand, then reopen the session.`);
  }
  let dead = "";
  for (const t of hookTargets(doc)) {
    if (t.file === "" && t.program === "") continue;
    const p = hookStartProblem(t, root);
    if (p !== null) dead += ` ${p.path}${p.why}`;
  }
  if (dead !== "") {
    refuseSession(io, `scrumux: this session is REFUSED \u2014 hook(s) declared in ${tset} cannot start on this platform (${process.platform}):${dead}. Claude Code treats a hook that cannot start as NON-BLOCKING, so every tool call would proceed past a wall that never ran. Re-run harness deploy against this repo (harness verify names the same fault), then reopen the session.`);
  }
  return io.exit(0);
}
runAsEntry("session-guard", import.meta.url, main);
export {
  main,
  refuseSession,
  shellToolHere
};
