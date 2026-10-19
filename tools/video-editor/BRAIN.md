# Video Editor Brain

## Mission

Local video editing over ffmpeg/ffprobe: inspect a file, trim it, resize it to a social-platform preset, pull out the audio track, burn in captions the member already has, and turn a long recording into a short teaser. HyperFrames, installed with the studio, adds animated captions, side graphics, motion titles and branded recuts, rendered on this computer. Be clear with the member about the boundaries:

- Cloud transcript-driven editing (cut by words, remove filler, polish, collaborate) is a different module's job, not this one's.
- AI image/video generation is a different module's job, not this one's.
- This module never uploads, never spends and never touches any credential. The ffmpeg operations make no network calls. HyperFrames renders locally; never run `hyperframes publish` and never use a hosted cloud or Lambda render.

## Scope boundary: this module does not transcribe

`burn-captions` burns an existing `.srt`/`.vtt` file into a video. This module does not transcribe audio itself. If the member has no caption file yet, use the transcript their recording tool exported, or a local transcriber as described in `LONG-TO-SHORT.md` (ask before installing one, never send audio to a paid service without a yes). Never invent caption text.

## Capability-availability honesty

`check-video-tools` reports what is actually true on this machine right now: whether `ffmpeg`/`ffprobe` are on `PATH` (or the configured `FFMPEG_BIN`/`FFPROBE_BIN`), and separately whether this ffmpeg build was compiled with libass (`captionBurnAvailable`). Not every ffmpeg distribution ships the `subtitles` filter -- some minimal builds omit libass entirely. When it's missing, `burn-captions` fails with a specific, actionable message instead of a wall of raw ffmpeg output; the other four operations (`trim-clip`, `resize-for-platform`, `extract-audio`, `inspect-media`) do not need libass at all and are unaffected. Never claim a capability is available without checking; run `check-video-tools` first when unsure, and never promise a caption burn will work before confirming `captionBurnAvailable` is true.

## Non-destructive by construction

Every operation reads the member's original file and writes a new file to an explicit output directory the member names. Nothing in this module ever edits, moves, renames, or deletes the original input. Every write also refuses to overwrite an existing output file rather than silently clobbering it -- if a name collision happens, report it and let the member choose a different name or directory. Never store or ship source paths, filenames that reveal a member's private directory structure, or any of the member's own media in this module's shipped code or context files.

## Platform presets

`resize-for-platform` supports `instagram-reel` and `tiktok` (1080x1920), `youtube` (1920x1080), and `square` (1080x1080), each scaled with aspect-ratio-preserving letterboxing rather than a distorting stretch. If the member needs a size not on this list, say so rather than silently picking the nearest preset.

## Non-invention rule

Never claim an operation completed, a file was written, or a duration/resolution was measured unless ffmpeg/ffprobe actually ran and returned that. Report the real command's real result, including errors, rather than a generic success message.

## Long recording to short teaser

When the member asks to turn a webinar, talk, podcast or other long recording into a teaser, promo or short clip, follow `LONG-TO-SHORT.md`:

1. `check-video-tools` (needs `teaserAvailable`).
2. Get a timed transcript (the recording tool's `.vtt`/`.srt` first) and run `read-transcript`.
3. Pick three to six moments yourself: hook first, one idea, proof, call to action, each on sentence boundaries, usually 20 to 60 seconds in total. Never change what was said or stitch words into a new claim. Save the plan to `video/teaser-plan.json` and show it to the member.
4. `make-teaser` with the segments, a preset and the transcript. It writes the teaser and an `.srt` already shifted onto the teaser's timeline, never touching the original.
5. Polish with HyperFrames when it is ready (prompt 3 in `HYPERFRAMES-EDIT-PROMPTS.md`), otherwise deliver the FFmpeg teaser, burning the `.srt` when `captionBurnAvailable` is true.
6. Inspect the result and look at frames before calling it ready.

Automatic clippers (OpenShorts, AI YouTube Shorts Generator, SupoClip, publikclip) are never bundled. Offer them only for high-volume clipping, explain that they spend the member's own LLM credits, and install only after a clear yes. SupoClip and publikclip are AGPL: the member runs them for themselves, unmodified, and nothing of theirs is shipped or hosted for others.

## HyperFrames

HyperFrames (`heygen-com/hyperframes`, HeyGen open source, Apache-2.0) writes HTML compositions and renders them to MP4 on this computer with headless Chrome and FFmpeg. It is not a HeyGen account connection: it makes no avatar and bills nothing. The studio installer sets it up; it is part of the standard install.

- **When to use it:** animated word-by-word captions, side graphics around vertical footage, motion titles, hook and end cards, branded recuts of a finished clip or teaser. Plain trims, resizes, audio extraction and burning an existing caption file stay on FFmpeg.
- **Check first:** `node tools/video-editor/index.js hyperframes` (or the `check-hyperframes` recipe) reports ready, installed but not ready, or not installed. Never claim it is ready without running the check.
- **When it is missing or not ready** and the job needs it: tell the member, and offer to run the setup prompt in `INSTALL-HYPERFRAMES.md` (or `node scripts/hyperframes-setup.mjs` from the studio root). Ask first. If they say no, fall back to the FFmpeg path and say what the result will lack.
- **How to run it:** through the plugin's own launcher, which `hyperframes.js` (`cliCommand()`) picks: the plugin launcher first, then a CLI already on PATH. Never a different CLI version through `npx`. Every run sets `HYPERFRAMES_NO_TELEMETRY=1`, `DO_NOT_TRACK=1`, `HYPERFRAMES_NO_UPDATE_CHECK=1` and `HYPERFRAMES_NO_AUTO_INSTALL=1` (`withTelemetryOff()`). In Claude Code or Codex, the HyperFrames skills do the composition work; set the same four variables for any command you start.
- **Local drafts only:** never run `hyperframes publish`, never use a HeyGen-hosted cloud or Lambda render. Output goes to the run's `video/` folder as a draft the member reviews.
- **Ready prompts:** `HYPERFRAMES-EDIT-PROMPTS.md` (finished 9:16 reel, 16:9 side panels around vertical footage, polish a teaser).
- **Brand:** use the member's `brand/brand.json`. No em dashes on screen. Nothing covers a face. Every number or claim on screen comes from what was said or from approved proof.
- **Health:** `node tools/video-editor/index.js hyperframes --doctor`. FFmpeg, FFprobe and Chrome should be green. Docker and the optional voice and transcription extras are not needed.
