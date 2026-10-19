"use strict";

/**
 * HyperFrames (HeyGen open source, Apache-2.0) optional integration. Not vendored:
 * no HyperFrames code ships in this tool.
 *
 * HyperFrames turns an HTML composition into an MP4 on this computer (headless Chrome
 * plus FFmpeg): animated captions, side graphics, motion titles, branded recuts. It is
 * OPTIONAL. Every video-editor operation works without it; when it is missing the tool
 * keeps using its own ffmpeg operations and prints install steps instead of failing.
 *
 * detect() only reads local files and PATH. It never downloads, installs, renders or
 * publishes. The one exception is the doctor step, run only when the member asks for
 * it: it goes through the plugin's own launcher, which may fetch the CLI version that
 * plugin pins the first time it runs (the plugin's documented behaviour). Running and
 * checking HyperFrames never falls back to an unpinned CLI from a package registry.
 * (Installing it is separate: scripts/hyperframes-setup.mjs uses HyperFrames' own
 * documented installers.)
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// HyperFrames sends usage data by default, checks the package registry for updates
// and can install them in the background. Every run this tool starts turns all of
// that off. The first two are also the lines the member adds to their shell profile.
const TELEMETRY_OFF_ENV = { HYPERFRAMES_NO_TELEMETRY: "1", DO_NOT_TRACK: "1" };
const RUN_ENV = { ...TELEMETRY_OFF_ENV, HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1" };

const INSTALL_PROMPT = "tools/video-editor/INSTALL-HYPERFRAMES.md";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf-8")); } catch { return null; }
}

function onPath(bin, env = process.env) {
  const dirs = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext);
      try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* keep looking */ }
    }
  }
  return null;
}

// Claude Code plugin: ~/.claude/plugins/installed_plugins.json lists "hyperframes@<marketplace>".
function findClaudePlugin(home) {
  const data = readJson(path.join(home, ".claude", "plugins", "installed_plugins.json"));
  const plugins = data && (data.plugins || data);
  if (!plugins || typeof plugins !== "object") return null;
  for (const [key, entries] of Object.entries(plugins)) {
    if (!/^hyperframes@/.test(key)) continue;
    const list = Array.isArray(entries) ? entries : [entries];
    for (const entry of list) {
      const root = entry && entry.installPath;
      if (root && fs.existsSync(root)) return { kind: "claude-plugin", key, root, version: entry.version || null };
    }
  }
  return null;
}

// Codex plugin cache: ~/.codex/plugins/cache/<marketplace>/hyperframes[/<version>].
function findCodexPlugin(home) {
  const cache = path.join(home, ".codex", "plugins", "cache");
  let marketplaces = [];
  try { marketplaces = fs.readdirSync(cache); } catch { return null; }
  for (const m of marketplaces) {
    const dir = path.join(cache, m, "hyperframes");
    if (!fs.existsSync(dir)) continue;
    let root = dir;
    try {
      const versions = fs.readdirSync(dir).filter((v) => !v.startsWith(".")).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      if (versions.length && !fs.existsSync(path.join(dir, "skills"))) root = path.join(dir, versions[versions.length - 1]);
    } catch { /* use dir */ }
    return { kind: "codex-plugin", key: `hyperframes@${m}`, root, version: null };
  }
  return null;
}

// Standalone skills (npx skills add heygen-com/hyperframes).
function findStandaloneSkills(home) {
  for (const dir of [path.join(home, ".claude", "skills", "hyperframes"), path.join(home, ".agents", "skills", "hyperframes"), path.join(home, ".codex", "skills", "hyperframes")]) {
    if (fs.existsSync(path.join(dir, "SKILL.md"))) return { kind: "standalone-skills", key: "hyperframes", root: dir, version: null };
  }
  return null;
}

function findChrome(env, home = os.homedir()) {
  if (env.HYPERFRAMES_CHROME_PATH && fs.existsSync(env.HYPERFRAMES_CHROME_PATH)) return env.HYPERFRAMES_CHROME_PATH;
  if (process.platform === "darwin") {
    for (const base of ["/Applications", path.join(home, "Applications")]) {
      for (const app of ["Google Chrome.app", "Chromium.app", "Google Chrome Canary.app"]) if (fs.existsSync(path.join(base, app))) return path.join(base, app);
    }
  }
  if (process.platform === "win32") {
    for (const base of [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean)) {
      const exe = path.join(base, "Google", "Chrome", "Application", "chrome.exe");
      if (fs.existsSync(exe)) return exe;
    }
  }
  for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"]) {
    const hit = onPath(bin, env);
    if (hit) return hit;
  }
  return null;
}

/**
 * detect() -> { installed, source, cli, deps, telemetryOff, ready, missing, warnings }
 * installed: plugin/skills or CLI present. ready: installed + Node 22+ + FFmpeg.
 * Chrome is a warning only: the doctor step reports how to supply one.
 */
function detect({ home = os.homedir(), env = process.env, nodeVersion = process.versions.node } = {}) {
  const source = findClaudePlugin(home) || findCodexPlugin(home) || findStandaloneSkills(home);
  const cli = onPath("hyperframes", env);
  const nodeMajor = parseInt(String(nodeVersion).split(".")[0], 10) || 0;
  const deps = { node: nodeMajor >= 22, nodeVersion, ffmpeg: onPath("ffmpeg", env), chrome: findChrome(env, home) };
  const installed = !!(source || cli);
  const missing = [];
  if (!installed) missing.push("hyperframes");
  if (!deps.node) missing.push("node>=22");
  if (!deps.ffmpeg) missing.push("ffmpeg");
  const warnings = [];
  if (!deps.chrome) warnings.push("No Chrome/Chromium found; run the doctor step to confirm rendering works.");
  const telemetryOff = env.HYPERFRAMES_NO_TELEMETRY === "1" && env.DO_NOT_TRACK === "1";
  if (installed && !telemetryOff) warnings.push("Telemetry is on in your shell. The video editor turns it off for runs it starts, but add the two export lines from the install steps to your shell profile too.");
  return { installed, source, cli, deps, telemetryOff, ready: installed && deps.node && !!deps.ffmpeg, missing, warnings };
}

/**
 * Command prefix for the HyperFrames CLI, the way its plugin rules require: the
 * plugin's own launcher first (so the CLI version matches the installed skills),
 * then a CLI already on PATH. Returns null when neither exists; never `npx`.
 */
function cliCommand(d) {
  if (d.source && d.source.kind !== "standalone-skills") {
    const launcher = path.join(d.source.root, "skills", "hyperframes", "scripts", "plugin-cli.mjs");
    if (fs.existsSync(launcher)) return [process.execPath, launcher];
  }
  if (d.cli) return [d.cli];
  return null;
}

function withTelemetryOff(env = process.env) {
  return { ...env, ...RUN_ENV };
}

function statusLine(d) {
  if (d.ready) return `HyperFrames: available (${d.source ? d.source.kind : "cli"}${d.source && d.source.version ? ` ${d.source.version}` : ""}). Use it for animated captions, side graphics, motion titles and branded recuts.`;
  if (d.installed) return `HyperFrames: installed but not ready (missing ${d.missing.join(", ")}). Run \`node tools/video-editor/index.js hyperframes\` for fixes.`;
  return "HyperFrames: not installed (optional). Every video-editor operation still works with ffmpeg. To set it up, follow " + INSTALL_PROMPT + " after the member says yes.";
}

function installSteps(d) {
  const lines = [];
  lines.push("HyperFrames is optional. Install it when you want animated captions, side graphics,");
  lines.push("motion titles or branded recuts rendered on this computer for free (HTML to MP4, no API bill).");
  lines.push(`The full paste-ready setup prompt is ${INSTALL_PROMPT}.`);
  lines.push("");
  if (!d.installed) {
    lines.push("Install (Claude Code):");
    lines.push("  1. claude plugin marketplace add heygen-com/hyperframes");
    lines.push("  2. claude plugin install hyperframes@hyperframes");
    lines.push("  3. Restart Claude Code so the HyperFrames skills load.");
    lines.push("Install (Codex or other agents, standalone skills):");
    lines.push("  npx skills add heygen-com/hyperframes   (pick the Core Skills group)");
    lines.push("");
  }
  if (!d.deps.node) lines.push(`Node.js 22 or newer is required (found ${d.deps.nodeVersion}). Install it from nodejs.org.`);
  if (!d.deps.ffmpeg) lines.push("FFmpeg is required: `brew install ffmpeg` (macOS), `sudo apt install ffmpeg` (Linux) or `winget install ffmpeg` (Windows).");
  if (!d.deps.chrome) lines.push("Chrome or Chromium is used for rendering: install Google Chrome, or let the doctor step tell you what it needs.");
  lines.push("Turn off HyperFrames telemetry (add to ~/.zshrc or ~/.bashrc):");
  lines.push("  export HYPERFRAMES_NO_TELEMETRY=1");
  lines.push("  export DO_NOT_TRACK=1");
  lines.push("Check it: node tools/video-editor/index.js hyperframes --doctor   (FFmpeg and Chrome should be green)");
  lines.push("");
  lines.push("Never run `hyperframes publish` and never use a hosted cloud render: renders stay local drafts for review.");
  return lines.join("\n");
}

/**
 * Run `hyperframes doctor` with telemetry, update checks and auto-install off.
 * Only on explicit request and only when HyperFrames is installed; never installs it.
 */
function runDoctor(d, { cwd = process.cwd(), env = process.env } = {}) {
  if (!d.installed) return { ran: false, ok: false, output: "" };
  const command = cliCommand(d);
  if (!command) return { ran: false, ok: false, output: "No HyperFrames launcher or CLI was found, so the doctor step was skipped. In Claude Code or Codex, ask the HyperFrames skill to run its doctor instead." };
  const [cmd, ...pre] = command;
  const r = spawnSync(cmd, [...pre, "doctor"], { cwd, env: withTelemetryOff(env), encoding: "utf-8", timeout: 180000 });
  if (r.error) return { ran: true, ok: false, output: `The doctor step could not start: ${r.error.message}` };
  return { ran: true, ok: r.status === 0, output: `${r.stdout || ""}${r.stderr || ""}`.trim() };
}

module.exports = { TELEMETRY_OFF_ENV, RUN_ENV, INSTALL_PROMPT, onPath, detect, cliCommand, withTelemetryOff, statusLine, installSteps, runDoctor };
