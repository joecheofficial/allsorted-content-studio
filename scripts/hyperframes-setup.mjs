#!/usr/bin/env node
// Installs HyperFrames (HeyGen open source, Apache-2.0) for the Video Editor as part of the
// standard Content Studio install, and repairs it when asked. The installers call it; the
// repair prompt is tools/video-editor/INSTALL-HYPERFRAMES.md.
//
//   node scripts/hyperframes-setup.mjs [--home <dir>] [--check] [--no-doctor]
//
// What it does, in order:
//   1. Detects HyperFrames (Claude Code plugin, Codex/standalone skills, or a CLI on PATH).
//   2. When missing: Claude Code plugin route if the `claude` command exists, and the core
//      skills for Codex if Codex is present. Nothing else is installed.
//   3. Installs FFmpeg with Homebrew when it is missing and Homebrew exists. Any requirement it
//      cannot install itself (Node 22+, FFmpeg without Homebrew, Chrome) is named in one plain
//      sentence at the end. It is never skipped silently.
//   4. Turns telemetry off for good: the two export lines go into the shell profile once
//      (setx on Windows). Every run it starts also turns update checks and auto-install off.
//   5. Runs the HyperFrames doctor and prints a result table.
// It never runs `hyperframes publish`, never uses a hosted cloud render, and always exits 0 so
// the rest of the studio install finishes. --check only reports and changes nothing.
// CONTENT_STUDIO_SKIP_HYPERFRAMES=1 skips the whole step (the test suite uses it).

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const hf = require(path.join(STUDIO, 'tools/video-editor/hyperframes.js'));

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const home = path.resolve(opt('--home') || process.env.HOME || os.homedir());
const checkOnly = argv.includes('--check');
const noDoctor = argv.includes('--no-doctor');
const env = { ...process.env, HOME: home };
const isWin = process.platform === 'win32';
const say = (line) => console.log(line);
const rows = [];
const asks = [];
const row = (step, result, note = '') => rows.push([step, result, note]);

if (process.env.CONTENT_STUDIO_SKIP_HYPERFRAMES === '1') {
  say('HyperFrames setup skipped (CONTENT_STUDIO_SKIP_HYPERFRAMES=1). Later: node scripts/hyperframes-setup.mjs');
  process.exit(0);
}

function run(cmd, args, extraEnv = {}, timeout = 600000) {
  const r = spawnSync(cmd, args, { env: { ...env, ...hf.RUN_ENV, ...extraEnv }, encoding: 'utf8', timeout, shell: isWin && !/\.(exe|com)$/i.test(cmd) });
  const output = `${r.stdout || ''}${r.stderr || ''}`.trim();
  return { ok: !r.error && r.status === 0, output: r.error ? r.error.message : output };
}
const tail = (text) => String(text || '').split('\n').filter(Boolean).slice(-1)[0] || '';

say('');
say('HyperFrames (Video Editor: animated captions, side graphics, motion titles, recuts)');
let d = hf.detect({ home, env });

// 2. Install the skills/plugin.
if (d.installed) {
  row('HyperFrames', 'already installed', d.source ? d.source.kind : 'cli');
} else if (checkOnly) {
  row('HyperFrames', 'missing', 'run without --check to install');
} else {
  const claude = hf.onPath('claude', env);
  const codex = hf.onPath('codex', env) || fs.existsSync(path.join(home, '.codex'));
  if (claude) {
    const add = run(claude, ['plugin', 'marketplace', 'add', 'heygen-com/hyperframes']);
    if (!add.ok && !/already/i.test(add.output)) row('Claude Code marketplace', 'failed', tail(add.output));
    const inst = run(claude, ['plugin', 'install', 'hyperframes@hyperframes']);
    row('Claude Code plugin', inst.ok ? 'installed' : 'failed', inst.ok ? 'restart Claude Code to load the skills' : tail(inst.output));
  }
  if (codex) {
    // Non-interactive form of `npx skills add heygen-com/hyperframes` + "Core Skills": installs
    // exactly the core set, which is what HyperFrames documents for agent runs.
    const npx = hf.onPath('npx', env) || 'npx';
    const skills = run(npx, ['-y', 'hyperframes', 'skills', 'update'], { HYPERFRAMES_NO_AUTO_INSTALL: '' });
    row('Codex skills', skills.ok ? 'installed' : 'failed', skills.ok ? 'core skills' : tail(skills.output));
  }
  if (!claude && !codex) {
    row('HyperFrames', 'not installed', 'no Claude Code or Codex command found');
    asks.push('Install Claude Code or Codex, then run the HyperFrames setup prompt in tools/video-editor/INSTALL-HYPERFRAMES.md.');
  }
  d = hf.detect({ home, env });
}

// 3. Requirements.
if (!d.deps.ffmpeg && !checkOnly) {
  const brew = hf.onPath('brew', env);
  if (brew) {
    const r = run(brew, ['install', 'ffmpeg'], {}, 1800000);
    row('FFmpeg', r.ok ? 'installed with Homebrew' : 'failed', r.ok ? '' : tail(r.output));
    d = hf.detect({ home, env });
  }
}
row('Node.js 22+', d.deps.node ? 'ok' : 'missing', `found ${d.deps.nodeVersion}`);
row('FFmpeg', d.deps.ffmpeg ? 'ok' : 'missing', d.deps.ffmpeg || '');
row('Chrome', d.deps.chrome ? 'ok' : 'missing', '');
if (!d.deps.node) asks.push(`Please install Node.js 22 or newer from nodejs.org (this computer has ${d.deps.nodeVersion}), then run the HyperFrames setup again.`);
if (!d.deps.ffmpeg) asks.push(isWin ? 'Please install FFmpeg (for example `winget install ffmpeg`), then run the HyperFrames setup again.' : 'Please install FFmpeg (`brew install ffmpeg` on macOS or `sudo apt install ffmpeg` on Linux), then run the HyperFrames setup again.');
if (!d.deps.chrome) asks.push('Please install Google Chrome, then run the HyperFrames setup again.');

// 4. Telemetry off for good.
const marker = '# All Sorted Content Studio: HyperFrames telemetry off';
const exportsBlock = `\n${marker}\nexport HYPERFRAMES_NO_TELEMETRY=1\nexport DO_NOT_TRACK=1\n`;
if (isWin) {
  if (checkOnly) row('Telemetry off', process.env.HYPERFRAMES_NO_TELEMETRY === '1' ? 'ok' : 'not set', '');
  else {
    const a = run('setx', ['HYPERFRAMES_NO_TELEMETRY', '1'], {}, 30000), b = run('setx', ['DO_NOT_TRACK', '1'], {}, 30000);
    row('Telemetry off', a.ok && b.ok ? 'set for your user' : 'failed', a.ok && b.ok ? '' : tail(a.output || b.output));
  }
} else {
  const shell = path.basename(process.env.SHELL || '');
  const profile = path.join(home, shell === 'bash' ? '.bashrc' : shell === 'zsh' || process.platform === 'darwin' ? '.zshrc' : '.profile');
  let text = '';
  try { text = fs.readFileSync(profile, 'utf8'); } catch { /* new file */ }
  const hasBoth = /^\s*export\s+HYPERFRAMES_NO_TELEMETRY=1\s*$/m.test(text) && /^\s*export\s+DO_NOT_TRACK=1\s*$/m.test(text);
  if (hasBoth) row('Telemetry off', 'ok', path.basename(profile));
  else if (checkOnly) row('Telemetry off', 'not in profile', path.basename(profile));
  else {
    try { fs.appendFileSync(profile, exportsBlock); row('Telemetry off', 'added', path.basename(profile)); }
    catch (error) { row('Telemetry off', 'failed', error.message); asks.push(`Please add these two lines to your shell profile: export HYPERFRAMES_NO_TELEMETRY=1 and export DO_NOT_TRACK=1.`); }
  }
}

// 5. Doctor.
if (!d.installed) row('Doctor', 'skipped', 'HyperFrames is not installed');
else if (checkOnly || noDoctor) row('Doctor', 'not run', '');
else {
  const doc = hf.runDoctor(d, { cwd: STUDIO, env });
  row('Doctor', !doc.ran ? 'skipped' : doc.ok ? 'passed' : 'reported problems', !doc.ran ? tail(doc.output) : doc.ok ? '' : tail(doc.output));
}

const ready = d.installed && d.deps.node && !!d.deps.ffmpeg;
say('');
say('| Step | Result | Note |');
say('|---|---|---|');
for (const [step, result, note] of rows) say(`| ${step} | ${result} | ${String(note).replace(/\|/g, '/')} |`);
say('');
say(ready ? `HyperFrames: ready. ${hf.statusLine(d)}` : 'HyperFrames: NOT READY. The rest of the studio works; the Video Editor uses ffmpeg until this is fixed.');
for (const ask of [...new Set(asks)]) say(`ACTION NEEDED: ${ask}`);
say('Never run `hyperframes publish` and never use a hosted cloud render: renders stay local drafts.');
process.exit(0);
