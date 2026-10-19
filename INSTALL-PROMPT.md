# Install All Sorted Content Studio

The studio includes six tools: HookLab, Ad Images, Carousel Builder, HeyGen Ad Videos, Video Editor, and Launch Video. The install also sets up HyperFrames (HeyGen open source), which the Video Editor uses for animated captions, side graphics and motion titles.

Copy this prompt into your agent system:

```text
Set up All Sorted Content Studio for me.

1. Clone https://github.com/josephtandle/allsorted-content-studio and work from the repository root. The repository root contains install.sh and install.ps1.
2. Run the installer for my operating system from that root: `sh install.sh` on macOS or Linux, or `.\install.ps1` in PowerShell on Windows. The first install can take up to 15 minutes because it downloads HyperFrames (and FFmpeg with Homebrew on a Mac that lacks it), so run it with a long timeout or in the background and wait for it to finish.
3. The installer also sets up HyperFrames for the Video Editor (animated captions, side graphics, motion titles). Show me its result table. HyperFrames needs Node.js 22 or newer, FFmpeg and Google Chrome. On a Mac with Homebrew the installer already installs FFmpeg when it is missing. For anything still missing, ask me once in one plain sentence before installing it with my system's package manager (for example `brew install node@22` on macOS or winget on Windows). If one truly needs me (a password, an admin prompt, a download page), ask me for that in one plain sentence and finish every other step. Then follow the prompt in `tools/video-editor/INSTALL-HYPERFRAMES.md` until `node tools/video-editor/index.js hyperframes --doctor` shows FFmpeg and Chrome green. If I use Claude Code, tell me to restart it afterwards so the HyperFrames skills load.
4. Run `node scripts/studio.mjs self-test` and show me every result. The HyperFrames line must say ready, or name exactly what is still missing.
5. Run `node scripts/studio.mjs render-test`, open the printed test image path, and show me the image.
6. Confirm that the `/content-studio` skill and the `content-director` agent are installed in my agent workspace.
7. If any step fails, read the error, fix the cause and retry, up to three tries. If it still fails, stop and tell me exactly which step failed and show the exact error. Do not guess.
8. Finish with a table of every step and its result.

Do not connect an advertising account, upload anything, or spend money. Never run `hyperframes publish` or a cloud render.
```

## Update

Copy this prompt into your agent system:

```text
Update my All Sorted Content Studio installation. Find its existing clone, run `git pull` in that clone, then run the installer again from the repository root for my operating system: `sh install.sh` on macOS or Linux, or `.\install.ps1` in PowerShell on Windows. Run `node scripts/studio.mjs self-test` and show me the results. If the HyperFrames line is not ready, follow the prompt in `tools/video-editor/INSTALL-HYPERFRAMES.md`, asking me once in one plain sentence before installing system software. If any step fails, stop and tell me exactly which step failed and show the exact error. Do not connect an advertising account, upload anything, or spend money.
```
