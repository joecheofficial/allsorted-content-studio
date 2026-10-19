# Video Editor

Local video editing over `ffmpeg`/`ffprobe`, plus HyperFrames for animated captions, side graphics and motion titles. It never uploads, never spends and needs no credentials.

## What it does

- `inspect-media` -- width, height, codec, duration, and file size via `ffprobe`.
- `trim-clip` -- cut `[start, end]` out of a file with a lossless stream copy.
- `resize-for-platform` -- scale and letterbox to `instagram-reel` / `tiktok` (1080x1920), `youtube` (1920x1080), or `square` (1080x1080).
- `extract-audio` -- pull the audio track out to a 16kHz mono WAV.
- `burn-captions` -- hard-burn an existing `.srt`/`.vtt` file into the video. Requires an ffmpeg build compiled with libass (the `subtitles` filter); run `check-video-tools` first to confirm `captionBurnAvailable`. This module does not transcribe audio -- bring your own caption file.
- `check-video-tools` -- reports whether `ffmpeg`/`ffprobe` are available, whether caption burning and teasers are supported, and whether a local transcriber is installed, with no network calls and no writes.
- `read-transcript` -- prints a `.srt`/`.vtt` transcript line by line with times, so the agent can pick moments.
- `make-teaser` -- cuts the chosen moments out of a long recording (a webinar, a talk, a podcast), joins them in one pass, fits a platform preset, fades in and out, and writes the teaser plus its captions shifted onto the teaser's timeline. See `LONG-TO-SHORT.md`.
- `hyperframes [--doctor] [--json]` -- reports whether HyperFrames is ready and, with `--doctor`, runs its health check. It never fails and never installs anything.

## HyperFrames

HyperFrames (HeyGen open source, Apache-2.0) renders HTML compositions to MP4 on your computer. The studio installer sets it up. To install or repair it later, use the prompt in `INSTALL-HYPERFRAMES.md`. Ready edit prompts are in `HYPERFRAMES-EDIT-PROMPTS.md`. Runs started here turn telemetry, update checks and auto-install off, and never publish or render in the cloud. When it is not ready, every other operation still works.

## Long recording to short teaser

Ask for "turn this webinar recording into a short edited teaser". The agent reads the transcript, picks the moments, shows you the plan, and cuts the teaser with `make-teaser`. Automatic clipping tools are listed in `LONG-TO-SHORT.md` as optional installs; none is bundled.

## What it does not do

No cloud transcript editing, no AI generation, no uploads, no paid transcription.

## Setup

1. Install `ffmpeg` (which includes `ffprobe`). Most package managers ship it; for caption burning specifically you need a build with libass support.
2. Optionally copy `config.example.json` to your own `config.json`, or set `FFMPEG_BIN`/`FFPROBE_BIN` if your binaries are not on `PATH`.
3. Run `node index.js check-video-tools` to confirm what's available before relying on any operation, and `node index.js hyperframes` for HyperFrames.
4. Run `node index.js demo` for an offline, dependency-free smoke check.

Every operation writes to an output directory you name, never touches your original file, and refuses to overwrite an existing output rather than silently replacing it.
