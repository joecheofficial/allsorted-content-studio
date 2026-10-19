# All Sorted Content Studio

The studio root is the folder that contains this file. Use that folder when a command needs the studio root.

All Sorted Content Studio helps you make ads from a brief. It creates images, carousels, copy, and video materials in one place. It checks the work and prepares a handoff for review.

## The six tools

- **HookLab** finds and ranks opening lines for your ad.
- **Ad Images** makes checked images for square, feed, and story formats.
- **Carousel Builder** turns one idea into a set of slides.
- **HeyGen Ad Videos** prepares video scripts and can render only with your approval.
- **Video Editor** trims and resizes your clips, adds captions, turns a long recording such as a webinar into a short teaser, and uses HyperFrames for animated captions, side graphics and motion titles.
- **Launch Video** turns your website or project into a 15 to 25 second launch video with music and share copy. Run `/brag` in your project folder, or ask the studio for a launch video.

## Ask for an ad

Use `/content-studio`, then tell it what you need. For example:

- “Make me three square ads for my beginner yoga offer.”
- “Write hooks for my ad and make a five-slide carousel.”
- “Edit this clip for stories and add the captions in this SRT file.”
- “Make a launch video of my new website.”
- “Turn this webinar recording into a short edited teaser.”
- “Add animated captions to this reel.”

## What you get

You get a contact sheet to review, the image and video files, the copy, quality check results, and a handoff for the Meta Ads agent. The handoff stays paused for review.

Your files live in `runs/<date>-<name>/` inside the studio folder. Each job has its own folder.

## Set up your brand

On the first run, the studio asks five questions:

1. What do you sell, and what does the customer receive?
2. Who is the specific audience, and what situation are they in?
3. What problem do they describe in their own words?
4. What outcome can you support with evidence, and what proof can be used?
5. What voice, look, and claims should the work use or avoid?

Your answers are saved in `brand/BRAND-BRAIN.md`.

## Install or update

Follow [INSTALL-PROMPT.md](INSTALL-PROMPT.md). It gives you a prompt to install or update the studio from the repository root.

## HyperFrames

The installer also sets up HyperFrames, HeyGen's open-source video renderer, for the Video Editor. It needs Node.js 22 or newer, FFmpeg and Google Chrome, and it renders on your computer for free. Telemetry is turned off. If the self-test says HyperFrames is not ready, ask the Video Editor to set it up, or use the prompt in `tools/video-editor/INSTALL-HYPERFRAMES.md`. Set `CONTENT_STUDIO_SKIP_HYPERFRAMES=1` before running the installer to leave it out.

## Updates

Updates arrive every week on their own. The installer schedules a small job that brings your copy up to the latest version, backs up your brand, learnings and runs first, and puts everything back if the new version fails its self-test. Your files are never touched.

- `node scripts/self-update.js --status` shows the setting and the last result.
- `node scripts/self-update.js --now` updates right away.
- `node scripts/self-update.js --off` turns weekly updates off, `--on` turns them back on.

To install without scheduling the job, set `CONTENT_STUDIO_SKIP_UPDATES=1` before running the installer.

## What it will never do

The studio will never upload an ad, spend money, or touch an ad account. HyperFrames renders stay local drafts: nothing is published or rendered in the cloud. A person and the Meta Ads agent handle any later advertising work.


## First run

Set up the included fictional example brand without overwriting existing brand files:

```sh
node scripts/studio.mjs use-example-brand
```

Use `node scripts/studio.mjs brand-json` after editing `brand/BRAND-BRAIN.md`. Exact worker JSON formats are in `docs/DATA-FORMATS.md`. Browser rendering tries Chrome, then Edge, and asks you to install Chrome if neither is installed. Carousel Builder is pinned (see `tools/carousel-builder/PINNED`), has zero npm dependencies, and needs Node 18+ plus local Chrome, Chromium, or Edge. The installer no longer runs an npm setup step; `--no-npm` and `ALLSORTED_NO_NPM=1` remain accepted as compatibility no-ops.

## Licence

All Sorted Personal Use License: use it for yourself, never sell or redistribute it. See LICENSE.

## Credits

HyperFrames is HeyGen's open-source renderer (github.com/heygen-com/hyperframes, Apache-2.0). The installer installs it from its own source; it is not bundled in this repository.

Launch Video is the open-source /brag skill by Shunit Haviv Hakimi (github.com/latent-spaces/brag), included unchanged under its MIT licence in `tools/launch-video/LICENSE`. That folder keeps its MIT terms; the rest of the studio is under the All Sorted Personal Use License.
