# Changelog

## 1.2.2 (2026-10-13)

- Carousel Builder engine updated from v1.2.0 to v1.2.1 (renderer only): one headless browser renders a whole deck, each slide a tab, instead of one browser per slide; a headless-only Chrome is preferred so nothing flashes in the Dock; a browser that dies mid-deck fails the remaining slides at once instead of hanging. The engine's own self-updater is not included, Content Studio's weekly update covers it.
- Fixed: with only the regular Chrome app installed (no headless shell), every carousel slide and the contact sheet failed with "Target position can only be set for new windows". The renderer now opens each tab without a window size and sets the slide size on the page itself. New test renders through the real Chrome app.

## 1.2.1 (2026-10-11)

- Reliable browser capture and installed image rendering for Ad Images.

## 1.2.0 (2026-10-04)

- New sixth tool, Launch Video: the open-source /brag skill (latent-spaces/brag 0.4.0, MIT, pinned in `tools/launch-video/PINNED`). It turns a website or project into a 15 to 25 second launch video with music, a poster frame and share copy. The installer adds the `brag` and `brag-slim` skills and a `content-launch-video` worker.

## 1.1.5 (2026-10-04)

- Tests: the suite seeds the example brand when brand/brand.json is missing, so a fresh clone passes all 20 tests, and removes what it seeded afterwards.

## 1.1.4 (2026-10-04)

- Fix: `scripts/self-update.js` now runs in a fresh clone. The studio's package.json makes .js files ES modules, so the updater (CommonJS) died at its first `require`. `scripts/package.json` marks that folder as CommonJS; every command, path and document stays the same.

## 1.1.3

- Weekly self-update: the installer schedules `scripts/self-update.js`, which keeps this clone on the latest release once a week, backs up your brand, learnings and runs first, and rolls back if the self-test fails. Turn it off with `node scripts/self-update.js --off`, or skip scheduling with CONTENT_STUDIO_SKIP_UPDATES=1.
- Added a `selftest` script (the studio's no-render self-test: no browser, no network) that the updater runs after each update.

## 1.1.2

- Licensed under the All Sorted Personal Use License: use it for yourself, never sell or redistribute it. Every LICENSE file, package.json and README now says so.

## 1.1.1

- Replaced unresolved studio-root instructions in shipped root docs with a file-relative rule.
- Removed generated item counters from carousel eyebrow labels so the slide counter is the only count.
- Added installed-copy documentation and carousel counter regression tests.

## 1.1.0

- Enforced 4.5:1 canvas and CTA contrast with automatic CTA text selection and accent darkening.
- Rendered closing carousel headlines and limited Meta card headlines to slide headline/eyebrow copy.
- Aligned batch outputs, manifests, and per-image data with run folders; added batch overwrite support.
- Added generated run briefs, complete CLI usage, and exact overwrite command examples.
- Regenerated the proof run and its contact sheet.
- Replaced the old Carousel Builder app with the pinned All Sorted carousel engine v1.2.0. Carousel renders now use the shared brand palette, engine layout checks, and engine-generated Meta handoff with the requested CTA.
- Re-pinned HookLab from the shipped skills 1.3.2 distribution and kept the studio-specific mode file.
- Removed carousel npm dependencies and made installer npm flags compatibility no-ops.
- Made in-place installs leave shipped source files byte-identical; Claude skill and agent copies still resolve the studio-root placeholder.
- Added skill-pack frontmatter and sensitive setup wording checks.

## 1.0.4

- Windows installer: safe browser detection and parity with the Mac installer, tested under PowerShell 7.

## 1.0.3

- Made Carousel Builder browser proof self-contained with a local handoff validator, isolated server workspace, and repository path-escape guard.
- Consistent licence holder across all tools; corrected HookLab provenance; removed a private quote-source reference; stronger privacy checks.

## 1.0.2

- Matched copy to each creative and added explicit Meta CTA types.
- Made QA print a result for every check on every file.
- Documented copy, CTA, carousel filename, and QA rules for workers.
- Added a mixed proof run with separate image and carousel copy.
- Quoted installed studio and run paths so commands work from folders with spaces.
- Back up customized member skills and agents before updates, and keep identical installs unchanged.
- Added `--no-npm` and a read-only `--check` installer mode with a no-render self-test.
- Fixed URL-to-path handling for studio installs and tests under paths with spaces.
- Ensure installed and first-run learnings files are created from the shipped template.
- Unified brand color roles and carousel defaults, with per-run light or dark themes.
- Resolve the studio root from environment, script location, or an installed skill's `studio-root` marker, and report clearly when shared brand colors are unavailable.
- Add explicit `--overwrite` support with a refusal hint for image and carousel fix-round renders.
- Verify brand canvas colors from both an installed studio and a standalone Ad Images skill under a spaced test home.
- Documented check logging and empty carousel headlines.
- Documented `hook` as the single-image text field, with `headline` as an alias distinct from Meta ad copy.
- Reported the overflowing image element and its word or character limit in renderer errors, with body and CTA coverage.
- Applied the brand default, brief theme, or explicit run theme to every image template and carousel, documented per-template color roles, and verified shared canvases across all formats.

## 1.0.1

- Centered carousel content in the safe area, kept counters at the bottom, and showed CTA buttons only on the last slide by default.
- Updated the example proof run and confirmed the five tools: HookLab, Ad Images, Carousel Builder, HeyGen Ad Videos, and Video Editor.
- Added complete example brand setup and worker data-format documentation.
- Standardized creative filenames and added explicit, checked CTA buttons.
- Matched carousel themes to the shared brand and added mixed creative handoffs.
- Added a brief-driven HookLab mode and switched carousel browser control to `playwright-core`.


## 1.0.0

- Added the All Sorted Content Studio director protocol, seven worker agents, and entry skill.
- Packaged HookLab, Ad Images, Carousel Builder, HeyGen Ad Videos, and Video Editor.
- Added shared brand inputs, install scripts, a local studio command, and tests.
- Added an installer test that checks file contents and preserves brand, runs, and learnings.
- Added the self-test image command and tool checks.
- Set carousel storytelling to problem, solution, outcome, and CTA.
