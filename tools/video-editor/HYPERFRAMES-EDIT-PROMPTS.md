# HyperFrames edit prompts

Ready prompts for the Video Editor when HyperFrames is installed. Fill the brackets. Each one produces a local MP4 and the editable HyperFrames project. Never run `hyperframes publish` and never use a hosted cloud render.

Before any of these, run `node tools/video-editor/index.js hyperframes`. If it is not ready, offer the member the setup prompt in `tools/video-editor/INSTALL-HYPERFRAMES.md` and wait for a yes. Without it, use the FFmpeg operations instead (resize, burn-captions, make-teaser).

Shared rules for every prompt:

- Use the member's brand from `brand/brand.json` (colors, fonts, voice). If there is none, ask three questions first: dark or light look, one accent color, and the mood. Propose a palette and two fonts and wait for a yes.
- Nothing ever covers the speaker's face. Keep the top 220 px and bottom 450 px of a 9:16 frame clear of the platform's buttons.
- Every number, name or claim on screen comes from what the speaker says or from approved proof in the brand file. Never invent one.
- No em dashes in on-screen text. Credit other creators on screen when their work appears.
- Download fonts locally so the render never needs the network.
- Show the beat plan (which words get which graphic, and when) before building. Prove the result from frames of the final MP4, not from the project file.

## 1. Finished 9:16 reel from an already-trimmed video

```text
Use HyperFrames to turn my trimmed vertical video into a finished reel. Deliver the rendered MP4 and the editable project, both inside [RUN_DIR]/video/.

Video: [FILE]
Brand: use brand/brand.json, or ask me the three look questions first.
Call to action: [WHAT I SAY AT THE END, UNLESS I GIVE YOU ONE]

1. Inspect resolution, frame rate, duration and audio. Keep every cut, my voice, my pace and the full spoken ending.
2. Pull five frames spread across the video, find where my head sits and which area is empty. Graphics only go in the empty area. Tell me where before building.
3. Transcribe with word timestamps (use the transcript I supply if there is one). Join split tokens, fix names and numbers. Show three or four words at a time, bold uppercase, on a soft dark plate, sitting over the lower chest. The word being spoken changes to the accent color with a small pop.
4. Mark four to eight beats worth a graphic: a comparison, a number, a named tool, a list, the call to action. One graphic per beat, timed to the exact word, built as HTML and CSS. Quick entrances (about 0.3 s), quicker exits. Leave some beats with just me and the captions.
5. Add a light vignette at top and bottom. My voice is the only audio unless I ask for music.
6. Lint and fix every error. Check six frames: spacing, wrapping, no card on my face, captions readable at phone size. Render 1080 x 1920 H.264 with AAC at the source frame rate, then check frames from the final MP4 before handing it over.
```

## 2. 16:9 video with animated side panels around vertical footage

```text
Use HyperFrames to turn my vertical recording [FILE] into a 1920 x 1080, 30 fps video. Keep the vertical footage centered at full height and build animated graphics in the left and right panels that illustrate what I am saying. Deliver the MP4 and the editable project inside [RUN_DIR]/video/.

1. Transcribe the whole recording and split it into beats by idea. Plan one visual per beat, appearing when that idea is spoken. Show me the plan before building.
2. Layout: footage centered, about 608 px wide, face clear. About 50 px of padding in each panel. One side carries the headline of the beat, the other a supporting diagram, demo or example. Word-synced captions sit in the lower part of the center video, below the mouth.
3. Style: the brand colors from brand/brand.json (or ask me), a subtle grid, fine borders, large headlines, short supporting text, one accent per panel. Everything readable on a phone.
4. Motion: build each visual in steps (the object, the action, the result), ease-out entrances of 0.3 to 0.5 s, related items staggered by under a tenth of a second, a short hold so each finished visual can be read.
5. Use real screenshots of tools and sites I name. Use generated images only when they help the explanation, and tell me before substituting a tool you do not have.
6. Optional quiet clicks or whooshes on key moments, always under my voice.
7. Inspect the final export for readable text, caption accuracy, audio sync, missing assets and overlaps before handing it over.
```

## 3. Polish a teaser cut by `make-teaser`

```text
Use HyperFrames to polish the teaser [RUN_DIR]/video/[TEASER].mp4. Its captions are in [TEASER].srt, already on the teaser's timeline. Keep the cuts and audio exactly as they are. Add animated word-by-word captions from that file, a title card for the first two seconds with the hook [HOOK], and an end card with the call to action [CTA]. Use brand/brand.json. Render 1080 x 1920 (or the teaser's own size), check frames from the final MP4, and save it next to the teaser with "-polished" in the name. Never overwrite the teaser.
```

## After each render

Append one line per correction the member made (caption position, a card over the face, a wrong word) to `learnings/LEARNINGS.md`, so the next run starts from it.
