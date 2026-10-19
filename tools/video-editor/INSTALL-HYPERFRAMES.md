# Install or repair HyperFrames for the Video Editor

HyperFrames is HeyGen's open-source (Apache-2.0) HTML-to-MP4 renderer. The Video Editor uses it for animated captions, side graphics, motion titles and branded recuts. It renders on your own computer with headless Chrome and FFmpeg. It is not a HeyGen account connection and it bills nothing.

The studio installer sets it up for you. Use this prompt when the self-test says HyperFrames is not ready, after a new computer or agent install, or whenever the Video Editor offers to repair it.

Copy this prompt into your agent system:

```text
Set up HyperFrames for my All Sorted Content Studio Video Editor. The studio folder is CONTENT_STUDIO_DIR.

1. Run `node "CONTENT_STUDIO_DIR/tools/video-editor/index.js" hyperframes` and show me what it reports.
2. Requirements: Node.js 22 or newer, FFmpeg, and Google Chrome. For each one that is missing, ask me once, in one plain sentence, before installing system software. On macOS use Homebrew (`brew install ffmpeg`, `brew install node@22`); on Windows use winget; on Linux use the system package manager. If one truly needs me (a password, an admin prompt, a download page), ask me for that in one plain sentence and finish every other step.
3. Install HyperFrames for the agent I am using:
   - Claude Code: run `claude plugin marketplace add heygen-com/hyperframes`, then `claude plugin install hyperframes@hyperframes`, then tell me to restart Claude Code so the skills load.
   - Codex: run `npx skills add heygen-com/hyperframes` and pick the Core Skills group. If the picker cannot open in this session, run `npx hyperframes skills update`, which installs exactly the core set.
   You can also run `node "CONTENT_STUDIO_DIR/scripts/hyperframes-setup.mjs"`, which does the install, the telemetry step and the doctor in one go and prints a table.
4. Turn telemetry off for good. Add these two lines to my shell profile (~/.zshrc on macOS, ~/.bashrc on Linux) if they are not there yet. On Windows run `setx HYPERFRAMES_NO_TELEMETRY 1` and `setx DO_NOT_TRACK 1`.
   export HYPERFRAMES_NO_TELEMETRY=1
   export DO_NOT_TRACK=1
5. Verify: run `node "CONTENT_STUDIO_DIR/tools/video-editor/index.js" hyperframes --doctor`. FFmpeg, FFprobe and Chrome must be green. Docker and the optional voice and transcription extras are not needed.
6. If a step fails, read the error, fix the cause and try again, up to three tries per step. Do not guess and do not skip a step silently.
7. Finish with a table: Requirement or step | Result | What I need to do (blank when nothing). End with one line: HyperFrames ready, or HyperFrames not ready and the one thing still needed.

Never run `hyperframes publish`. Never use a HeyGen-hosted cloud or Lambda render. Renders stay local drafts that I review. Do not upload anything or spend money.
```

## What the Video Editor does without it

Everything else keeps working on FFmpeg: trim, resize, audio extraction, caption burn-in, and long-to-short teasers. The Video Editor tells you when a job would look better with HyperFrames and offers to run this prompt first.
