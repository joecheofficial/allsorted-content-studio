# Long recording to short teaser

Use this when the member asks for something like "turn this webinar recording into a short edited teaser", "cut a promo from my talk" or "make reels from this podcast".

The built-in path needs only FFmpeg. The agent itself picks the moments from the transcript, so there is no extra model bill, nothing is uploaded and nothing is installed.

## Built-in path

1. **Preflight.** `node tools/video-editor/index.js check-video-tools`. `teaserAvailable` must be true. `localTranscriber` shows whether a local speech-to-text command is installed.
2. **Get a transcript with timestamps.**
   - Best: the transcript the recording tool already made (Zoom, Teams, Riverside, StreamYard and YouTube all export `.vtt` or `.srt`). Never re-transcribe what already exists.
   - None? Extract the audio with `extract-audio`, then run a local transcriber if `localTranscriber` found one, for example `whisper audio.wav --model small --output_format srt --output_dir <RUN_DIR>/video`.
   - No local transcriber either: ask the member once whether to install one (`pip install -U openai-whisper`, MIT licence, or `brew install whisper-cpp`, MIT licence). Both run on this computer for free. Never send the audio to a paid transcription service without the member's explicit yes.
3. **Read it.** `read-transcript` with `{ "captionsFile": "<file>.vtt" }` prints every line with its time.
4. **Pick the moments.** Choose three to six moments that work cold, without the rest of the talk:
   - Open with the strongest hook: a surprising claim, a concrete number, a clear promise or a question.
   - Then the one idea worth the click, then proof, then the call to action or invitation.
   - Each moment starts and ends on a sentence boundary. Most are 3 to 15 seconds. A teaser is usually 20 to 60 seconds in total (the limit is 180 unless `maxSeconds` is raised, at most 600).
   - Order them for the story, not the clock. Never change what was said or stitch words into a claim the speaker did not make.
   - Save the plan as `<RUN_DIR>/video/teaser-plan.json` (`{ "segments": [{ "start": "00:12:04.5", "end": "00:12:13", "label": "hook" }] }`) and show it to the member before cutting.
5. **Cut it.** `make-teaser` with `{ "file": "<recording>", "segments": [...] or "<plan>.json", "preset": "instagram-reel", "captionsFile": "<file>.vtt", "outputDirectory": "<RUN_DIR>/video" }`. It trims each moment, joins them in one pass, fits the platform frame, adds a short fade in and out, and writes `teaser-<name>.mp4` plus `teaser-<name>.srt` with the captions moved onto the teaser's timeline. Add `"burnCaptions": true` for a captioned copy when `captionBurnAvailable` is true. Presets: `instagram-reel`, `tiktok` (1080x1920), `youtube` (1920x1080), `square`; leave it out to keep the source shape.
6. **Polish (when HyperFrames is ready).** Use prompt 3 in `HYPERFRAMES-EDIT-PROMPTS.md` for animated captions, a hook title and an end card. If HyperFrames is not ready, offer the setup prompt in `INSTALL-HYPERFRAMES.md`; if the member says no, deliver the FFmpeg teaser.
7. **Check it.** `inspect-media` on the result, then pull a few frames (`ffmpeg -ss <t> -i <teaser> -frames:v 1 <png>`) and look at them: no black opening, captions in sync, nothing clipped. Watch it before calling it ready.

A 16:9 source cut to 9:16 is letterboxed, not cropped, so nothing is lost. Ask before cropping in on a face.

## Automatic clippers (install on demand, never bundled)

These open-source tools find moments automatically and reframe to 9:16. None of them ships with the studio. Offer one only when the member wants many clips from many recordings and the built-in path is too slow for them, and only install it after a clear yes.

| Tool | Licence | Weight | Notes |
|---|---|---|---|
| OpenShorts (`github.com/mutonby/openshorts`) | MIT | Python server, Whisper, FFmpeg; Docker or a Python 3.11 setup | Finished 1080x1920 clips with burned captions, an optional hook line and a two-speaker layout. Ranks moments with an LLM using the member's own Gemini or OpenAI key. |
| AI YouTube Shorts Generator (`github.com/Anil-matcha/AI-Youtube-Shorts-Generator`) | MIT | Python, faster-whisper, OpenCV | Fast raw 9:16 face-centred crops, no captions. Ranks moments with the member's own OpenAI or Gemini key. Re-encode its output to H.264 before use. |
| SupoClip (`github.com/FujiwaraChoki/supoclip`) | AGPL-3.0 | Python backend, Postgres, Redis, Whisper, Torch | Captioned clips with hook titles. AGPL: the member installs and runs it for themselves; do not modify it, host it for others or ship it inside anything. |
| publikclip (`github.com/Blueturboguy07/publikclip`) | AGPL-3.0 | Python, WhisperX, Torch; several GB of models | Best moment scoring for podcasts and interviews, speaker-tracked framing. Same AGPL rules as SupoClip. |

Rules for all four:

- They spend the member's own LLM credits on every run. Say so and get a yes before the first run, and never paste a key into the chat (use the member's own secret storage).
- Install them in a folder the member chooses, outside the studio, following each project's README. Do not run their publish or upload features.
- Their output is candidates. The same review applies before anything ships: watch it, check claims against approved proof, and keep originals untouched.
