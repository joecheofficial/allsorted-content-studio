import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

process.env.CONTENT_STUDIO_SKIP_UPDATES = '1';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const tool = path.join(root, 'tools/video-editor');
const hf = require(path.join(tool, 'hyperframes.js'));
const ve = require(path.join(tool, 'index.js'));
const hasBin = (bin) => spawnSync(bin, ['-version'], { encoding: 'utf8' }).status === 0;
const ffmpegOk = hasBin('ffmpeg') && hasBin('ffprobe');

function tmp(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function fakeBin(dir, name, body = 'exit 0') {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name);
  fs.writeFileSync(file, `#!/bin/sh\n${body}\n`);
  fs.chmodSync(file, 0o755);
  return file;
}
function installClaudePlugin(home) {
  const pluginRoot = path.join(home, '.claude', 'plugins', 'cache', 'hyperframes', 'hyperframes', '0.8.0');
  fs.mkdirSync(path.join(pluginRoot, 'skills', 'hyperframes', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(pluginRoot, 'skills', 'hyperframes', 'scripts', 'plugin-cli.mjs'), '');
  fs.writeFileSync(path.join(home, '.claude', 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'hyperframes@hyperframes': [{ installPath: pluginRoot, version: '0.8.0' }] } }));
  return pluginRoot;
}

test('HyperFrames missing: not installed, install steps name both routes and the repair prompt, doctor never runs', () => {
  const home = tmp('ve-hf-');
  const bin = path.join(home, 'bin'); fakeBin(bin, 'ffmpeg');
  const d = hf.detect({ home, env: { PATH: bin }, nodeVersion: '22.1.0' });
  assert.equal(d.installed, false); assert.equal(d.ready, false); assert.deepEqual(d.missing, ['hyperframes']);
  assert.match(hf.statusLine(d), /not installed/);
  const steps = hf.installSteps(d);
  for (const re of [/claude plugin marketplace add heygen-com\/hyperframes/, /claude plugin install hyperframes@hyperframes/, /npx skills add heygen-com\/hyperframes/, /HYPERFRAMES_NO_TELEMETRY=1/, /DO_NOT_TRACK=1/, /INSTALL-HYPERFRAMES\.md/, /Never run `hyperframes publish`/]) assert.match(steps, re);
  assert.deepEqual(hf.runDoctor(d), { ran: false, ok: false, output: '' });
  assert.equal(hf.cliCommand(d), null);
});

test('HyperFrames Claude plugin: ready, runs through the plugin launcher, all four switches off', () => {
  const home = tmp('ve-hf-');
  const bin = path.join(home, 'bin'); fakeBin(bin, 'ffmpeg');
  const pluginRoot = installClaudePlugin(home);
  const d = hf.detect({ home, env: { PATH: bin, HYPERFRAMES_NO_TELEMETRY: '1', DO_NOT_TRACK: '1' }, nodeVersion: '22.3.0' });
  assert.equal(d.ready, true); assert.equal(d.source.kind, 'claude-plugin');
  assert.deepEqual(hf.cliCommand(d), [process.execPath, path.join(pluginRoot, 'skills', 'hyperframes', 'scripts', 'plugin-cli.mjs')]);
  const env = hf.withTelemetryOff({ DO_NOT_TRACK: '0' });
  for (const key of ['HYPERFRAMES_NO_TELEMETRY', 'DO_NOT_TRACK', 'HYPERFRAMES_NO_UPDATE_CHECK', 'HYPERFRAMES_NO_AUTO_INSTALL']) assert.equal(env[key], '1', key);
});

test('HyperFrames installed with old Node and no FFmpeg is not ready; broken plugin list counts as missing; skills and CLI are found', () => {
  const home = tmp('ve-hf-'); installClaudePlugin(home);
  const d = hf.detect({ home, env: { PATH: path.join(home, 'none') }, nodeVersion: '20.11.0' });
  assert.equal(d.installed, true); assert.equal(d.ready, false); assert.deepEqual(d.missing, ['node>=22', 'ffmpeg']);
  assert.doesNotMatch(hf.installSteps(d), /claude plugin install/);
  const broken = tmp('ve-hf-'); fs.mkdirSync(path.join(broken, '.claude', 'plugins'), { recursive: true });
  fs.writeFileSync(path.join(broken, '.claude', 'plugins', 'installed_plugins.json'), '{not json');
  assert.equal(hf.detect({ home: broken, env: { PATH: '' } }).installed, false);
  const skills = tmp('ve-hf-'); fs.mkdirSync(path.join(skills, '.agents', 'skills', 'hyperframes'), { recursive: true });
  fs.writeFileSync(path.join(skills, '.agents', 'skills', 'hyperframes', 'SKILL.md'), '---\nname: hyperframes\n---\n');
  assert.equal(hf.detect({ home: skills, env: { PATH: '' } }).source.kind, 'standalone-skills');
  const withCli = tmp('ve-hf-'); const cli = fakeBin(path.join(withCli, 'bin'), 'hyperframes');
  assert.deepEqual(hf.cliCommand(hf.detect({ home: withCli, env: { PATH: path.join(withCli, 'bin') } })), [cli]);
});

test('`hyperframes` CLI exits 0 without HyperFrames and the recipe reports ok', async () => {
  const home = tmp('ve-hf-');
  const r = spawnSync(process.execPath, [path.join(tool, 'index.js'), 'hyperframes'], { env: { HOME: home, PATH: '' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /not installed/); assert.match(r.stdout, /claude plugin install hyperframes@hyperframes/);
  const json = spawnSync(process.execPath, [path.join(tool, 'index.js'), 'hyperframes', '--json'], { env: { HOME: home, PATH: '' }, encoding: 'utf8' });
  assert.equal(JSON.parse(json.stdout).ready, false);
  const recipe = await require(path.join(tool, 'recipes/check-hyperframes.js')).runRecipe();
  assert.equal(recipe.status, 'ok');
});

test('setup script: Claude route, telemetry lines added once, check mode changes nothing, skip env honoured', () => {
  const home = tmp('ve-setup-');
  const bin = path.join(home, 'bin'), log = path.join(home, 'claude.log');
  fakeBin(bin, 'claude', `echo "$@ telemetry=$HYPERFRAMES_NO_TELEMETRY update=$HYPERFRAMES_NO_UPDATE_CHECK" >> "${log}"`);
  fakeBin(bin, 'ffmpeg');
  const env = { PATH: `${bin}:/usr/bin:/bin`, HOME: home, SHELL: '/bin/zsh' };
  const setup = path.join(root, 'scripts/hyperframes-setup.mjs');
  const checkRun = spawnSync(process.execPath, [setup, '--home', home, '--check'], { env, encoding: 'utf8' });
  assert.equal(checkRun.status, 0, checkRun.stderr);
  assert.equal(fs.existsSync(log), false, 'check mode installs nothing');
  assert.equal(fs.existsSync(path.join(home, '.zshrc')), false, 'check mode writes no profile');
  for (let i = 0; i < 2; i++) {
    const r = spawnSync(process.execPath, [setup, '--home', home, '--no-doctor'], { env, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /\| Step \| Result \| Note \|/);
  }
  const calls = fs.readFileSync(log, 'utf8');
  assert.match(calls, /plugin marketplace add heygen-com\/hyperframes telemetry=1 update=1/);
  assert.match(calls, /plugin install hyperframes@hyperframes/);
  assert.doesNotMatch(calls, /publish/);
  const profile = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.equal(profile.match(/export HYPERFRAMES_NO_TELEMETRY=1/g).length, 1);
  assert.equal(profile.match(/export DO_NOT_TRACK=1/g).length, 1);
  const skipped = spawnSync(process.execPath, [setup, '--home', home], { env: { ...env, CONTENT_STUDIO_SKIP_HYPERFRAMES: '1' }, encoding: 'utf8' });
  assert.equal(skipped.status, 0); assert.match(skipped.stdout, /skipped/);
});

test('setup script names a missing requirement in one plain sentence instead of skipping it', () => {
  const home = tmp('ve-setup-');
  const r = spawnSync(process.execPath, [path.join(root, 'scripts/hyperframes-setup.mjs'), '--home', home, '--check'], { env: { PATH: '/usr/bin:/bin', HOME: home, SHELL: '/bin/zsh' }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /HyperFrames: NOT READY/);
  assert.match(r.stdout, /ACTION NEEDED: Please install FFmpeg/);
});

test('captions parser reads SRT and VTT, and teaser captions land on the teaser timeline', () => {
  const vtt = 'WEBVTT\n\nNOTE skip me\n\n00:00:01.000 --> 00:00:04.000\n<v Host>Welcome in\n\n00:05.000 --> 00:09.000 align:start\nThe big idea\n';
  const srt = '1\n00:00:01,000 --> 00:00:04,000\nWelcome in\n\n2\n00:00:05,000 --> 00:00:09,000\nThe big idea\n';
  for (const text of [vtt, srt]) assert.deepEqual(ve.parseCaptions(text), [{ start: 1, end: 4, text: 'Welcome in' }, { start: 5, end: 9, text: 'The big idea' }]);
  assert.equal(ve.parseTime('01:02:03.5'), 3723.5); assert.equal(ve.parseTime('02:03,25'), 123.25); assert.equal(ve.parseTime(7), 7);
  assert.throws(() => ve.parseTime('soon'), /Could not read/);
  const shifted = ve.parseCaptions(ve.teaserCaptions(ve.parseCaptions(vtt), [{ start: 6, end: 9 }, { start: 2, end: 4 }]));
  assert.deepEqual(shifted, [{ start: 0, end: 3, text: 'The big idea' }, { start: 3, end: 5, text: 'Welcome in' }]);
});

test('make-teaser cuts chosen moments from a long recording into a 9:16 teaser with captions and never overwrites', { skip: !ffmpegOk && 'ffmpeg not installed' }, () => {
  const dir = tmp('ve-teaser-');
  const src = path.join(dir, 'webinar.mp4');
  const made = spawnSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc=size=640x360:rate=25:duration=20', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=20', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', src], { encoding: 'utf8' });
  assert.equal(made.status, 0, made.stderr);
  fs.writeFileSync(path.join(dir, 'webinar.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nWelcome to the session\n\n00:00:05.000 --> 00:00:09.000\nThe one idea that matters\n\n00:00:12.000 --> 00:00:16.000\nJoin us next week\n');
  const before = fs.readFileSync(src);
  const out = path.join(dir, 'video');
  const transcript = ve.readTranscript({ captionsFile: path.join(dir, 'webinar.vtt') });
  assert.equal(transcript.cueCount, 3); assert.match(transcript.text, /\[00:00:05\.000 - 00:00:09\.000\] The one idea/);
  fs.mkdirSync(out); fs.writeFileSync(path.join(out, 'teaser-plan.json'), JSON.stringify({ segments: [{ start: '00:00:05', end: 9, label: 'hook' }, { start: 1, end: 4 }, { start: 12, end: 16, label: 'cta' }] }));
  const result = ve.makeTeaser({ file: src, segments: path.join(out, 'teaser-plan.json'), preset: 'instagram-reel', captionsFile: path.join(dir, 'webinar.vtt'), outputDirectory: out });
  assert.equal(result.output, 'teaser-webinar.mp4'); assert.equal(result.durationSeconds, 11); assert.equal(result.captions, 'teaser-webinar.srt');
  const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,width,height', '-show_entries', 'format=duration', '-of', 'json', path.join(out, result.output)], { encoding: 'utf8' }).stdout);
  const video = probe.streams.find((s) => s.codec_type === 'video');
  assert.equal(video.width, 1080); assert.equal(video.height, 1920);
  assert.ok(probe.streams.some((s) => s.codec_type === 'audio'));
  assert.ok(Math.abs(Number(probe.format.duration) - 11) < 0.3, `duration ${probe.format.duration}`);
  assert.deepEqual(ve.parseCaptions(fs.readFileSync(path.join(out, result.captions), 'utf8')).map((c) => [c.start, c.end, c.text]), [[0, 4, 'The one idea that matters'], [4, 7, 'Welcome to the session'], [7, 11, 'Join us next week']]);
  assert.ok(fs.readFileSync(src).equals(before), 'original untouched');
  assert.throws(() => ve.makeTeaser({ file: src, segments: [{ start: 1, end: 2 }], outputDirectory: out }), /Refusing to overwrite/);
  assert.throws(() => ve.makeTeaser({ file: src, segments: [{ start: 30, end: 32 }], outputDirectory: out, outputFilename: 'late.mp4' }), /after the recording ends/);
  assert.throws(() => ve.makeTeaser({ file: src, segments: [{ start: 4, end: 2 }], outputDirectory: out, outputFilename: 'backwards.mp4' }), /ends before it starts/);
  assert.throws(() => ve.makeTeaser({ file: src, segments: [{ start: 0, end: 15 }], maxSeconds: 10, outputDirectory: out, outputFilename: 'long.mp4' }), /over the 10 second teaser limit/);
  const check = ve.check();
  assert.equal(check.teaserAvailable, true);
});

test('make-teaser and read-transcript recipes return plain errors for missing inputs', async () => {
  const teaser = await require(path.join(tool, 'recipes/make-teaser.js')).runRecipe({});
  assert.equal(teaser.status, 'error'); assert.match(teaser.reply, /long recording/);
  const read = await require(path.join(tool, 'recipes/read-transcript.js')).runRecipe({});
  assert.equal(read.status, 'error'); assert.match(read.reply, /transcript file/);
  for (const name of ['check-hyperframes', 'read-transcript', 'make-teaser']) {
    const recipe = JSON.parse(fs.readFileSync(path.join(tool, `recipes/${name}.recipe.json`), 'utf8'));
    assert.equal(recipe.id, `agent/video-editor/${name}`); assert.ok(fs.existsSync(path.join(tool, 'recipes', recipe.handler)));
  }
});

test('customer docs carry no version numbers and route HyperFrames and teasers', () => {
  for (const file of ['README.md', 'INSTALL-PROMPT.md', 'tools/video-editor/README.md', 'tools/video-editor/INSTALL-HYPERFRAMES.md', 'tools/video-editor/HYPERFRAMES-EDIT-PROMPTS.md', 'tools/video-editor/LONG-TO-SHORT.md']) {
    assert.doesNotMatch(fs.readFileSync(path.join(root, file), 'utf8'), /\bv?\d+\.\d+\.\d+\b/, `${file} has no version number`);
  }
  const install = fs.readFileSync(path.join(root, 'INSTALL-PROMPT.md'), 'utf8');
  assert.match(install, /HyperFrames/); assert.match(install, /Node\.js 22/); assert.match(install, /INSTALL-HYPERFRAMES\.md/);
  const director = fs.readFileSync(path.join(root, 'DIRECTOR.md'), 'utf8');
  assert.match(director, /set up HyperFrames/i); assert.match(director, /webinar/); assert.match(director, /LONG-TO-SHORT\.md/);
  const repair = fs.readFileSync(path.join(tool, 'INSTALL-HYPERFRAMES.md'), 'utf8');
  for (const re of [/claude plugin marketplace add heygen-com\/hyperframes/, /npx skills add heygen-com\/hyperframes/, /Core Skills/, /export HYPERFRAMES_NO_TELEMETRY=1/, /hyperframes --doctor/, /three tries/, /Never run `hyperframes publish`/, /Lambda/]) assert.match(repair, re);
});
