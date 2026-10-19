"use strict";

/**
 * Local, mechanical video-editing operations over ffmpeg/ffprobe. No network
 * calls, no credentials, no AI generation. This module is the free, local,
 * deterministic layer: trim, resize to a platform preset, extract audio,
 * burn in a caption file the member already has, inspect media, read a
 * transcript with timestamps, and cut a long recording (a webinar, a talk,
 * a podcast) into a short teaser from moments the agent picked.
 *
 * HyperFrames (HeyGen open source, Apache-2.0) adds animated captions, side
 * graphics, motion titles and branded recuts. `hyperframes` reports whether
 * it is ready; every operation here still works when it is not.
 *
 * Every write goes to an explicit output directory the caller names. This
 * module never edits, moves, or deletes the original input file, and never
 * overwrites an existing output.
 */

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const PRESETS = {
  "instagram-reel": { width: 1080, height: 1920 },
  tiktok: { width: 1080, height: 1920 },
  youtube: { width: 1920, height: 1080 },
  square: { width: 1080, height: 1080 },
};

function required(input, key) {
  if (input[key] === undefined || input[key] === null || input[key] === "") throw new Error(`Missing required input: ${key}`);
  return input[key];
}

function settings(input = {}) {
  return {
    ffmpegBin: input.ffmpegBin || process.env.FFMPEG_BIN || "ffmpeg",
    ffprobeBin: input.ffprobeBin || process.env.FFPROBE_BIN || "ffprobe",
  };
}

function assertInputFile(file) {
  const resolved = path.resolve(required({ file }, "file"));
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) throw new Error("The selected input file does not exist.");
  return resolved;
}

function assertOutputPath(outputDirectory, filename) {
  const directory = path.resolve(required({ outputDirectory }, "outputDirectory"));
  const output = path.join(directory, filename);
  if (fs.existsSync(output)) throw new Error(`Refusing to overwrite existing output: ${path.basename(output)}`);
  return { directory, output };
}

function binaryAvailable(bin) {
  try {
    execFileSync(bin, ["-version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

// Hard-burning captions needs the "subtitles" video filter, which only
// exists in ffmpeg builds compiled with libass. Not every distribution
// includes it (some minimal/Homebrew builds ship without it) -- detect this
// up front and fail with a clear, specific message instead of a raw ffmpeg
// stderr dump the member has no way to interpret.
function hasSubtitlesFilter(ffmpegBin) {
  try {
    const output = execFileSync(ffmpegBin, ["-hide_banner", "-filters"], { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
    return /\bsubtitles\b/.test(output);
  } catch {
    return false;
  }
}

// A local speech-to-text command, if the member installed one (openai-whisper
// or whisper.cpp). Only looks on PATH; never runs or installs anything.
function localTranscriber() {
  const { onPath } = require("./hyperframes.js");
  for (const bin of ["whisper", "whisper-cli", "whisper-cpp"]) {
    const hit = onPath(bin);
    if (hit) return { command: bin, path: hit };
  }
  return null;
}

function check(input = {}) {
  const { ffmpegBin, ffprobeBin } = settings(input);
  const ffmpegAvailable = binaryAvailable(ffmpegBin);
  const ffprobeAvailable = binaryAvailable(ffprobeBin);
  return {
    configured: ffmpegAvailable,
    ffmpegAvailable,
    ffprobeAvailable,
    ffmpegBin,
    ffprobeBin,
    captionBurnAvailable: ffmpegAvailable && hasSubtitlesFilter(ffmpegBin),
    teaserAvailable: ffmpegAvailable && ffprobeAvailable,
    localTranscriber: localTranscriber(),
    presets: Object.keys(PRESETS),
  };
}

function inspectMedia(input = {}) {
  const { ffprobeBin } = settings(input);
  const file = assertInputFile(input.file);
  if (!binaryAvailable(ffprobeBin)) throw new Error(`ffprobe was not found (${ffprobeBin}). Install ffmpeg, or set FFPROBE_BIN to its path.`);
  const raw = execFileSync(
    ffprobeBin,
    ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_name,duration", "-show_entries", "format=duration,size", "-of", "json", file],
    { stdio: ["ignore", "pipe", "pipe"] }
  ).toString("utf8");
  const parsed = JSON.parse(raw);
  const stream = (parsed.streams && parsed.streams[0]) || {};
  return {
    file: path.basename(file),
    width: stream.width ?? null,
    height: stream.height ?? null,
    codec: stream.codec_name ?? null,
    durationSeconds: Number(parsed.format?.duration ?? stream.duration ?? 0) || null,
    sizeBytes: Number(parsed.format?.size ?? 0) || null,
  };
}

function trimClip(input = {}) {
  const { ffmpegBin } = settings(input);
  const file = assertInputFile(input.file);
  const start = String(required(input, "start"));
  const end = input.end ? String(input.end) : null;
  if (!binaryAvailable(ffmpegBin)) throw new Error(`ffmpeg was not found (${ffmpegBin}). Install ffmpeg, or set FFMPEG_BIN to its path.`);
  const filename = input.outputFilename || `trim-${path.basename(file)}`;
  const { directory, output } = assertOutputPath(input.outputDirectory, filename);
  fs.mkdirSync(directory, { recursive: true });
  const args = ["-y", "-ss", start];
  if (end) args.push("-to", end);
  args.push("-i", file, "-map", "0:v:0?", "-map", "0:a:0?", "-dn", "-map_chapters", "-1", "-map_metadata", "-1", "-c", "copy", output);
  execFileSync(ffmpegBin, args, { stdio: "pipe" });
  return { input: path.basename(file), output: path.basename(output), start, end: end || null, originalUntouched: true };
}

function platformPreset(input = {}) {
  const { ffmpegBin } = settings(input);
  const file = assertInputFile(input.file);
  const preset = String(required(input, "preset"));
  const dims = PRESETS[preset];
  if (!dims) throw new Error(`Unknown preset "${preset}". Choose one of: ${Object.keys(PRESETS).join(", ")}.`);
  if (!binaryAvailable(ffmpegBin)) throw new Error(`ffmpeg was not found (${ffmpegBin}). Install ffmpeg, or set FFMPEG_BIN to its path.`);
  const filename = input.outputFilename || `${preset}-${path.basename(file)}`;
  const { directory, output } = assertOutputPath(input.outputDirectory, filename);
  fs.mkdirSync(directory, { recursive: true });
  const scaleFilter = `scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease,pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2`;
  execFileSync(ffmpegBin, ["-y", "-i", file, "-vf", scaleFilter, "-c:a", "copy", output], { stdio: "pipe" });
  return { input: path.basename(file), output: path.basename(output), preset, width: dims.width, height: dims.height, originalUntouched: true };
}

function extractAudio(input = {}) {
  const { ffmpegBin } = settings(input);
  const file = assertInputFile(input.file);
  if (!binaryAvailable(ffmpegBin)) throw new Error(`ffmpeg was not found (${ffmpegBin}). Install ffmpeg, or set FFMPEG_BIN to its path.`);
  const filename = input.outputFilename || `${path.parse(file).name}.wav`;
  const { directory, output } = assertOutputPath(input.outputDirectory, filename);
  fs.mkdirSync(directory, { recursive: true });
  execFileSync(ffmpegBin, ["-y", "-i", file, "-vn", "-acodec", "pcm_s16le", "-ar", "16000", "-ac", "1", output], { stdio: "pipe" });
  return { input: path.basename(file), output: path.basename(output), originalUntouched: true };
}

function burnCaptions(input = {}) {
  const { ffmpegBin } = settings(input);
  const file = assertInputFile(input.file);
  const captions = assertInputFile(input.captionsFile);
  if (!/\.(srt|vtt)$/i.test(captions)) throw new Error("Captions file must be .srt or .vtt. This module burns in captions you already have; it does not transcribe audio.");
  if (!binaryAvailable(ffmpegBin)) throw new Error(`ffmpeg was not found (${ffmpegBin}). Install ffmpeg, or set FFMPEG_BIN to its path.`);
  if (!hasSubtitlesFilter(ffmpegBin)) throw new Error("This ffmpeg build has no \"subtitles\" filter (it was not compiled with libass). Install an ffmpeg build with libass support to burn in captions -- other operations (trim-clip, resize-for-platform, extract-audio) do not need it.");
  const filename = input.outputFilename || `captioned-${path.basename(file)}`;
  const { directory, output } = assertOutputPath(input.outputDirectory, filename);
  fs.mkdirSync(directory, { recursive: true });
  // ffmpeg's own filtergraph parser (not the shell -- execFileSync passes
  // args directly, no shell involved) treats ":" as an option separator and
  // "'" as a quote inside a filter value, so escape those two characters
  // only. Do not wrap the value in quotes: with no shell in the loop there
  // is nothing for a quote pair to protect, and ffmpeg's parser fails to
  // find an option name if the whole value arrives pre-quoted.
  const escapedCaptions = captions.replace(/\\/g, "\\\\").replace(/:/g, "\\:").replace(/'/g, "\\'");
  execFileSync(ffmpegBin, ["-y", "-i", file, "-vf", `subtitles=${escapedCaptions}`, "-c:a", "copy", output], { stdio: "pipe" });
  return { input: path.basename(file), output: path.basename(output), captions: path.basename(captions), originalUntouched: true };
}

// ---------------------------------------------------------------------------
// Long-to-short: webinar or long recording -> short edited teaser.
// The agent reads the transcript (read-transcript), picks the moments, and
// make-teaser cuts and joins them in one ffmpeg pass. No model call, no upload.
// ---------------------------------------------------------------------------

const TEASER_MAX_SEGMENTS = 20;
const TEASER_DEFAULT_MAX_SECONDS = 180;
const TEASER_HARD_MAX_SECONDS = 600;

// "01:02:03.500", "01:02:03,500", "02:03.5", "75.25" or a number -> seconds.
function parseTime(value, label = "time") {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  const text = String(value ?? "").trim().replace(",", ".");
  if (/^\d+(\.\d+)?$/.test(text)) return Number(text);
  const m = text.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!m) throw new Error(`Could not read ${label} "${value}". Use seconds (75.5) or HH:MM:SS.mmm.`);
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

function formatTime(seconds, separator = ".") {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000), r = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${separator}${String(r).padStart(3, "0")}`;
}

// Parse SRT or WebVTT text into [{ start, end, text }]. Tolerates cue numbers,
// cue settings, NOTE/STYLE blocks, speaker tags and missing hours.
function parseCaptions(text) {
  const cues = [];
  const blocks = String(text).replace(/^﻿/, "").replace(/\r\n?/g, "\n").split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split("\n").filter((line) => line.trim() !== "");
    const at = lines.findIndex((line) => line.includes("-->"));
    if (at < 0) continue;
    const [left, right] = lines[at].split("-->");
    let start, end;
    try {
      start = parseTime(left.trim(), "cue start");
      end = parseTime(right.trim().split(/\s+/)[0], "cue end");
    } catch { continue; }
    const body = lines.slice(at + 1).join(" ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (body && end > start) cues.push({ start, end, text: body });
  }
  return cues.sort((a, b) => a.start - b.start);
}

function readCaptionsFile(file) {
  const resolved = assertInputFile(file);
  if (!/\.(srt|vtt)$/i.test(resolved)) throw new Error("The transcript must be an .srt or .vtt file (most meeting and webinar tools export one).");
  const cues = parseCaptions(fs.readFileSync(resolved, "utf8"));
  if (!cues.length) throw new Error("No timed lines were found in that transcript file.");
  return { resolved, cues };
}

function readTranscript(input = {}) {
  const { resolved, cues } = readCaptionsFile(input.captionsFile || input.transcriptFile || input.file);
  const lines = cues.map((cue) => `[${formatTime(cue.start)} - ${formatTime(cue.end)}] ${cue.text}`);
  const result = {
    transcript: path.basename(resolved),
    cueCount: cues.length,
    durationSeconds: Number(cues[cues.length - 1].end.toFixed(3)),
    words: cues.reduce((n, cue) => n + cue.text.split(/\s+/).length, 0),
    cues,
    text: lines.join("\n"),
  };
  if (input.outputDirectory) {
    const { directory, output } = assertOutputPath(input.outputDirectory, input.outputFilename || `${path.parse(resolved).name}.timed.txt`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(output, `${result.text}\n`, { flag: "wx" });
    result.output = path.basename(output);
  }
  return result;
}

function normalizeSegments(rawSegments, sourceDuration, maxSeconds) {
  let segments = rawSegments;
  if (typeof segments === "string") {
    const file = assertInputFile(segments);
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    segments = Array.isArray(parsed) ? parsed : parsed.segments;
  }
  if (!Array.isArray(segments) || !segments.length) throw new Error("Provide segments: a list of { start, end } moments (or a JSON file with a \"segments\" list).");
  if (segments.length > TEASER_MAX_SEGMENTS) throw new Error(`A teaser takes at most ${TEASER_MAX_SEGMENTS} segments; got ${segments.length}.`);
  const out = segments.map((segment, i) => {
    const start = parseTime(segment.start, `segment ${i + 1} start`);
    const end = parseTime(segment.end, `segment ${i + 1} end`);
    if (!(end > start)) throw new Error(`Segment ${i + 1} ends before it starts (${segment.start} to ${segment.end}).`);
    if (sourceDuration && start >= sourceDuration) throw new Error(`Segment ${i + 1} starts at ${formatTime(start)}, after the recording ends (${formatTime(sourceDuration)}).`);
    const clippedEnd = sourceDuration ? Math.min(end, sourceDuration) : end;
    if (clippedEnd - start < 0.1) throw new Error(`Segment ${i + 1} is shorter than a tenth of a second once it is clipped to the end of the recording (${formatTime(sourceDuration || end)}).`);
    return { start, end: clippedEnd, label: segment.label ? String(segment.label) : null };
  });
  const total = out.reduce((sum, s) => sum + (s.end - s.start), 0);
  if (total > maxSeconds) throw new Error(`The segments add up to ${total.toFixed(1)} seconds, over the ${maxSeconds} second teaser limit. Pick fewer or shorter moments, or raise maxSeconds (up to ${TEASER_HARD_MAX_SECONDS}).`);
  return { segments: out, total };
}

function probeStreams(ffprobeBin, file) {
  const raw = execFileSync(ffprobeBin, ["-v", "error", "-show_entries", "stream=codec_type", "-show_entries", "format=duration", "-of", "json", file], { stdio: ["ignore", "pipe", "pipe"] }).toString("utf8");
  const parsed = JSON.parse(raw);
  const types = (parsed.streams || []).map((s) => s.codec_type);
  return { hasVideo: types.includes("video"), hasAudio: types.includes("audio"), duration: Number(parsed.format?.duration) || null };
}

// Shift the source captions onto the teaser timeline, keeping only the parts
// that fall inside the chosen segments.
function teaserCaptions(cues, segments) {
  const out = [];
  let offset = 0;
  for (const segment of segments) {
    for (const cue of cues) {
      const start = Math.max(cue.start, segment.start), end = Math.min(cue.end, segment.end);
      if (end - start > 0.05) out.push({ start: offset + start - segment.start, end: offset + end - segment.start, text: cue.text });
    }
    offset += segment.end - segment.start;
  }
  return out.map((cue, i) => `${i + 1}\n${formatTime(cue.start, ",")} --> ${formatTime(cue.end, ",")}\n${cue.text}\n`).join("\n");
}

function makeTeaser(input = {}) {
  const { ffmpegBin, ffprobeBin } = settings(input);
  const file = assertInputFile(input.file);
  if (!binaryAvailable(ffmpegBin)) throw new Error(`ffmpeg was not found (${ffmpegBin}). Install ffmpeg, or set FFMPEG_BIN to its path.`);
  if (!binaryAvailable(ffprobeBin)) throw new Error(`ffprobe was not found (${ffprobeBin}). Install ffmpeg, or set FFPROBE_BIN to its path.`);
  const preset = input.preset ? String(input.preset) : null;
  const dims = preset ? PRESETS[preset] : null;
  if (preset && !dims) throw new Error(`Unknown preset "${preset}". Choose one of: ${Object.keys(PRESETS).join(", ")}, or leave it out to keep the source shape.`);
  const maxSeconds = Math.min(Number(input.maxSeconds) || TEASER_DEFAULT_MAX_SECONDS, TEASER_HARD_MAX_SECONDS);
  const streams = probeStreams(ffprobeBin, file);
  if (!streams.hasVideo) throw new Error("The selected file has no video track.");
  const { segments, total } = normalizeSegments(input.segments, streams.duration, maxSeconds);

  const base = input.outputFilename ? path.parse(String(input.outputFilename)).name : `teaser-${path.parse(file).name}`;
  const { directory, output } = assertOutputPath(input.outputDirectory, `${base}.mp4`);
  const captionsSource = input.captionsFile ? readCaptionsFile(input.captionsFile) : null;
  const srtPath = captionsSource ? assertOutputPath(input.outputDirectory, `${base}.srt`).output : null;
  if (captionsSource && input.burnCaptions) {
    assertOutputPath(input.outputDirectory, `${base}-captioned.mp4`);
    if (!hasSubtitlesFilter(ffmpegBin)) throw new Error("burnCaptions needs an ffmpeg build with libass (the \"subtitles\" filter), and this one has none. Leave burnCaptions off to get the teaser plus its .srt file, or install an ffmpeg build with libass.");
  }
  fs.mkdirSync(directory, { recursive: true });

  // Each moment is its own fast-seeking input, so ffmpeg decodes only the
  // moments (in any order) instead of buffering the recording in memory. One
  // filter graph joins them, fits the frame, and fades in and out.
  const fade = input.fade === false ? 0 : Math.min(0.4, total / 4);
  const args = ["-n"];
  const parts = [];
  const joins = [];
  segments.forEach((s, i) => {
    args.push("-ss", s.start.toFixed(3), "-t", (s.end - s.start).toFixed(3), "-i", file);
    parts.push(`[${i}:v:0]setpts=PTS-STARTPTS[v${i}]`);
    if (streams.hasAudio) parts.push(`[${i}:a:0]asetpts=PTS-STARTPTS[a${i}]`);
    joins.push(streams.hasAudio ? `[v${i}][a${i}]` : `[v${i}]`);
  });
  parts.push(`${joins.join("")}concat=n=${segments.length}:v=1:a=${streams.hasAudio ? 1 : 0}${streams.hasAudio ? "[vc][ac]" : "[vc]"}`);
  const videoChain = [];
  if (dims) videoChain.push(`scale=${dims.width}:${dims.height}:force_original_aspect_ratio=decrease`, `pad=${dims.width}:${dims.height}:(ow-iw)/2:(oh-ih)/2`, "setsar=1");
  else videoChain.push("scale=trunc(iw/2)*2:trunc(ih/2)*2", "setsar=1");
  if (fade) videoChain.push(`fade=t=in:st=0:d=${fade.toFixed(3)}`, `fade=t=out:st=${(total - fade).toFixed(3)}:d=${fade.toFixed(3)}`);
  videoChain.push("format=yuv420p");
  parts.push(`[vc]${videoChain.join(",")}[vout]`);
  if (streams.hasAudio) parts.push(fade ? `[ac]afade=t=in:st=0:d=${fade.toFixed(3)},afade=t=out:st=${(total - fade).toFixed(3)}:d=${fade.toFixed(3)}[aout]` : "[ac]anull[aout]");

  args.push("-filter_complex", parts.join(";"), "-map", "[vout]");
  if (streams.hasAudio) args.push("-map", "[aout]", "-c:a", "aac", "-b:a", "160k");
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-movflags", "+faststart", "-dn", "-map_chapters", "-1", "-map_metadata", "-1", output);
  try {
    execFileSync(ffmpegBin, args, { stdio: "pipe" });
  } catch (error) {
    // Never leave a half-written teaser behind: it would block a retry and look finished.
    fs.rmSync(output, { force: true });
    const detail = String(error.stderr || error.message || "").trim().split("\n").slice(-3).join(" ");
    throw new Error(`ffmpeg could not make the teaser: ${detail}`);
  }

  const result = {
    input: path.basename(file),
    output: path.basename(output),
    preset: preset || "source",
    segments: segments.map((s) => ({ start: formatTime(s.start), end: formatTime(s.end), seconds: Number((s.end - s.start).toFixed(3)), label: s.label })),
    durationSeconds: Number(total.toFixed(3)),
    hasAudio: streams.hasAudio,
    captions: null,
    captioned: null,
    originalUntouched: true,
  };
  if (captionsSource) {
    fs.writeFileSync(srtPath, teaserCaptions(captionsSource.cues, segments), { flag: "wx" });
    result.captions = path.basename(srtPath);
    if (input.burnCaptions) {
      const burned = burnCaptions({ ffmpegBin, ffprobeBin, file: output, captionsFile: srtPath, outputDirectory: directory, outputFilename: `${base}-captioned.mp4` });
      result.captioned = burned.output;
    }
  }
  return result;
}

async function run(command, input = {}) {
  if (command === "demo") return { ok: true, mode: "offline demo", network: false, filesWritten: 0, presets: Object.keys(PRESETS) };
  // "check-video-tools" and "resize-for-platform" are the documented (README)
  // command names; "check-ffmpeg" and "platform-preset" are kept as aliases
  // for backward compatibility with older callers.
  if (command === "check-ffmpeg" || command === "check-video-tools") return check(input);
  if (command === "inspect-media") return inspectMedia(input);
  if (command === "trim-clip") return trimClip(input);
  if (command === "platform-preset" || command === "resize-for-platform") return platformPreset(input);
  if (command === "extract-audio") return extractAudio(input);
  if (command === "burn-captions") return burnCaptions(input);
  if (command === "read-transcript") return readTranscript(input);
  if (command === "make-teaser") return makeTeaser(input);
  if (command === "hyperframes" || command === "check-hyperframes") return hyperframesStatus();
  throw new Error(`Unknown command: ${command}`);
}

// HyperFrames status. Never throws: a broken detection is reported as "not
// installed" so callers and recipes keep working on the ffmpeg path.
function hyperframesStatus() {
  const hyperframes = require("./hyperframes.js");
  let detected;
  try {
    detected = hyperframes.detect();
  } catch (error) {
    detected = { installed: false, source: null, cli: null, deps: { node: true, nodeVersion: process.versions.node, ffmpeg: null, chrome: null }, telemetryOff: false, ready: false, missing: ["hyperframes"], warnings: [`HyperFrames detection failed: ${error.message}`] };
  }
  return {
    installed: detected.installed,
    ready: detected.ready,
    sourceKind: detected.source ? detected.source.kind : (detected.cli ? "cli" : null),
    sourceVersion: detected.source ? detected.source.version : null,
    missing: detected.missing,
    warnings: detected.warnings,
    telemetryOff: detected.telemetryOff,
    statusLine: hyperframes.statusLine(detected),
    installSteps: detected.ready ? null : hyperframes.installSteps(detected),
    repairPrompt: hyperframes.INSTALL_PROMPT,
    detected,
  };
}

function printHyperframes(argv) {
  const status = hyperframesStatus();
  if (argv.includes("--json")) {
    const { detected, ...summary } = status;
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  console.log(status.statusLine);
  for (const warning of status.warnings) console.log(`Note: ${warning}`);
  if (status.installSteps) console.log(`\n${status.installSteps}`);
  if (argv.includes("--doctor")) {
    const result = require("./hyperframes.js").runDoctor(status.detected);
    if (!result.ran) console.log(`\nDoctor skipped: ${result.output || "install HyperFrames first (steps above)."}`);
    else {
      console.log(`\nhyperframes doctor${result.ok ? "" : " (reported problems)"}:\n${result.output}`);
      console.log("\nLocal renders need FFmpeg, FFprobe and Chrome green. Docker and the optional voice and transcription extras are not required.");
    }
  }
}

async function runRecipe(command, input = {}) {
  try {
    const result = await run(command, input);
    return { status: "ok", reply: `${command} completed.`, metadata: result };
  } catch (error) {
    return { status: "error", reply: error.message, metadata: { command } };
  }
}

async function main(argv = process.argv.slice(2)) {
  const command = argv[0] || "demo";
  if (command === "hyperframes") {
    try {
      printHyperframes(argv);
    } catch (error) {
      console.log(`HyperFrames: status check failed (${error.message}). Every other video-editor operation still works.`);
    }
    return;
  }
  const inputAt = argv.indexOf("--input");
  const input = inputAt >= 0 ? JSON.parse(argv[inputAt + 1] || "{}") : {};
  console.log(JSON.stringify(await run(command, input), null, 2));
}

if (require.main === module) main().catch((error) => { console.error(`[video-editor] ${error.message}`); process.exit(1); });
module.exports = { PRESETS, check, inspectMedia, trimClip, platformPreset, extractAudio, burnCaptions, parseTime, formatTime, parseCaptions, readTranscript, makeTeaser, teaserCaptions, hyperframesStatus, main, run, runRecipe };
