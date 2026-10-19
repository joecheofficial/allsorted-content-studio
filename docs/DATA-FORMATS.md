# Studio data formats

Use UTF-8 JSON. Paths in commands are relative to the run folder unless absolute. Studio-root rule: the studio root is the folder that contains this file. Use that folder when a command needs the studio root. Replace `RUN_DIR` with the current run folder.

## Shared brand and image inputs

`brand/BRAND-BRAIN.md` is canonical. Run `node "CONTENT_STUDIO_DIR/scripts/studio.mjs" brand-json` to generate `brand/brand.json`. Define `theme` (`light` or `dark`, default `dark`) and `colors.canvas`, `colors.ink`, and `colors.accent` once. Optional `colors.darkVariant` overrides the dark canvas, text ink, and accent roles. Every creative in a run uses the brand default theme unless the brief has a `Theme: light` or `Theme: dark` line; run data can set `theme` in image data, batch input, or `carousel-data.json` and takes precedence over the brief. Single-image templates use `brandName`, `brand`, `hook`, `body`, and `cta`; `hook` is the large line rendered on the image. `headline` is accepted as a legacy alias for `hook`. Optional `proof`, `tips`, and `image` fields depend on the template. Batch variations use `format` (`single` or `carousel`), `ratio` (`square`, `feed`, or `story`), and a `variations` array whose image text field is `hook`.

The Meta ad `headline` in `copy/ads.json` is separate copy shown with the ad and is not the on-image `hook`.

Theme role table (the selected theme supplies the shared canvas, ink, and accent colors; layouts and accent placement remain template-specific):

| Template | Canvas/background | Main text | Accent usage |
| --- | --- | --- | --- |
| `offer-card` | Theme canvas | Theme ink | Frame, brand label, CTA fill |
| `question-card` | Theme canvas | Theme ink | CTA fill |
| `hook-card` | Theme canvas | Theme ink | Brand label and CTA fill |
| `proof-card` | Theme canvas | Theme ink | Label, proof rule, note, CTA fill |
| `problem-solution` | Theme canvas | Theme ink | Brand label, arrow, CTA fill |
| `three-tips` | Theme canvas | Theme ink | Brand label, numbered tips, CTA fill |
| Carousel | Theme canvas | Theme ink | Eyebrow and CTA fill |

All image buttons and the carousel closing button choose the higher-contrast color from theme ink and theme canvas. The button accent is darkened when necessary to reach 4.5:1. QA checks both text against the canvas and CTA text against its button at 4.5:1. `darkVariant.canvas`, `darkVariant.ink`, and `darkVariant.accent` override the corresponding dark roles; absent dark values fall back to base ink, canvas, and accent respectively.

Per-image JSON inputs live in `RUN_DIR/data/` and use `<slug>_<nn>_<template>_<ratio>.json`. Single-image renders read the path supplied by `--data`; batch creates these files from each variation before rendering. Batch input is `RUN_DIR/images/batch.json`; outputs and `manifest.json` are directly in `RUN_DIR/images/`.

## copy/ads.json

Copy is per creative. `creative` is the run-relative path to the generated file. For a carousel, use `carousel/carousel-spec.json`. Each record supplies that creative's headline, primary text, link description, optional button wording, and explicit Meta `cta_type`. The studio passes the carousel entry's `cta_type` to the pinned engine `export-meta <id> --cta <value>` command and uses its exported `callToAction` in the handoff.

```json
{
  "ads": [
    {
      "creative": "images/sunrise-yoga_01_offer-card_square.png",
      "headline": "A calmer start",
      "primary_text": "Try a welcoming first yoga class at your own pace.",
      "link_description": "View beginner class times",
      "button_text": "See the beginner class schedule",
      "cta_type": "BOOK_NOW"
    },
    {
      "creative": "carousel/carousel-spec.json",
      "primary_text": "Take your first step with a welcoming class.",
      "link_description": "Browse beginner sessions",
      "button_text": "Explore the class schedule",
      "cta_type": "LEARN_MORE"
    }
  ]
}
```

Allowed `cta_type` values and when to use them:

- `LEARN_MORE`: use when the next step is to read details or explore an offer.
- `SHOP_NOW`: use when the destination is a product purchase page.
- `SIGN_UP`: use when the person should register or create an account.
- `BOOK_NOW`: use when the person should reserve a class, appointment, or service.
- `GET_OFFER`: use when the destination presents a specific promotion or offer.
- `CONTACT_US`: use when the desired next step is to contact the business.
- `SUBSCRIBE`: use when the person should subscribe to a publication or service.
- `DOWNLOAD`: use when the person should download an app, file, or resource.

`button_text` is display wording and does not determine `cta_type`. If `cta_type` is absent only, handoff may map a recognized legacy button phrase through its narrow alias table. If no valid value results, handoff uses `LEARN_MORE` and prints `WARNING: <ad name> ...`. An invalid present `cta_type` warns and defaults to `LEARN_MORE`; it does not consult aliases. A missing ad entry warns and uses `FILL_IN_HEADLINE`, `FILL_IN_PRIMARY_MESSAGE`, and `FILL_IN_LINK_DESCRIPTION` for missing copy. No creative inherits another creative's copy.

For single images, all four copy fields belong to that image. For carousels, put one `primary_text`, `link_description`, and `cta_type` on the carousel entry; each card headline continues to come from its slide data in `carousel-spec.json`.

## carousel-data.json and filenames

Provide a `title`, `preset` (`square`, `feed`, or `story`), and two to ten `slides`. Each slide accepts an engine `layout` and its fields, or `headline` (or `heading`) and `body`; the adapter defaults to editorial statement slides and uses the engine's `10-cta-comment-keyword` closing layout on the final slide. The closing slide renders `eyebrow` above `headline`, then the CTA button, then `body` as supporting text. `headline` is also the Meta card headline; if missing, the eyebrow is used, clipped at a word boundary to 40 characters. If both are missing, the card headline stays blank and QA/handoff warns rather than borrowing body copy. Set an explicit `layout` on individual slides to use another engine template. Use `showCta: true` only to opt into the engine closing layout on an earlier slide. The final-slide CTA is part of the engine closing layout.

Carousel filenames are derived from `title` in these exact steps: convert the title to a string (default `creative`); Unicode-normalize with NFKD; remove every character outside `[\w\s-]`; trim; lowercase; replace each run of spaces or hyphens with one hyphen; take the first 48 characters; and use `creative` if the result is empty. Each slide is named `<slug>_<nn>_carousel_<ratio>.png`, where `nn` starts at `01` and is zero-padded to two digits.

```json
{
  "title": "Sunrise Yoga: Beginner Class!",
  "preset": "square",
  "slides": [
    { "eyebrow": "WHAT GETS IN THE WAY", "headline": "Starting yoga can feel unfamiliar", "body": "A first class is easier when you know what to expect." },
    { "eyebrow": "A BETTER WAY", "headline": "Begin with a gentle class", "body": "A small-group introduction gives you room to learn." },
    { "eyebrow": "THE OUTCOME", "headline": "Learn a few new movements", "body": "Try one welcoming class at your own pace.", "cta": "See the beginner class schedule" }
  ]
}
```

This title produces `sunrise-yoga-beginner-class_01_carousel_square.png` and subsequent two-digit slide numbers.

## studio.mjs check

Run `node "CONTENT_STUDIO_DIR/scripts/studio.mjs" check "RUN_DIR"`. It examines every file in each discovered `manifest.json` and prints one line per file per check. Each line is `PASS <run-relative-file>: <check> - ok` or `FAIL <run-relative-file>: <check> - <reason>`. Each check run appends one summary line to `run-log.jsonl`.

An empty carousel slide `headline` (and `heading`) is valid and means that card has no headline.

Ad Images checks are: file exists; file size is at most 30 MB; PNG dimensions exactly match manifest width and height; no manifest or measured overflow/overlap; CTA text exists; CTA has a nontransparent background or visible border; headline is at least 72 px (120 px for story), body at least 40 px (52 px for story), and visible text at least 32 px (48 px for story), scaled by image width / 1080; and for story, the layout box stays within x 0..1, y 14%..80%, with positive width. Failures identify the file and reason, for example `FAIL images/ad.png: headline, body, and visible text meet minimum sizes - headline text is too small (60px; minimum 72px)`.

Carousel checks are: file exists; PNG dimensions match the manifest; no reported overflow; CTA exists unless `showCta` is false; CTA has a nontransparent background or border; no text overlap; measured headline/body/eyebrow/counter are at least 72/40/32/28 px when those measurements exist; and manifest headline `fontSize`, when present, is at least 72 px. A failure includes the measured value and threshold, for example `FAIL carousel/slide.png: text meets minimum sizes - headline 60px < 72px`.

Malformed manifests and runs without manifests fail the command with a visible error. Every check line names the creative and the check result; the command exits nonzero if any check fails. A passing mechanical check does not replace visual review.

## handoff.json

The root object has `status: "PAUSED"`, explicit `blanks`, and `ads`. Each ad remains PAUSED. Page ID and landing-page URL remain `FILL_IN` values for the receiving Meta Ads agent. Image ads carry their own `headline`, `primary_text`, `link_description`, and `cta_type`/`callToAction`; carousel cards carry slide headlines and the carousel uses one primary text and CTA.

```json
{
  "status": "PAUSED",
  "blanks": { "pageId": "FILL_IN_META_PAGE_ID", "link": "FILL_IN_LANDING_PAGE_URL", "message": "FILL_IN_PRIMARY_MESSAGE" },
  "ads": [
    { "type": "image", "name": "A calmer start", "status": "PAUSED", "pageId": "FILL_IN_META_PAGE_ID", "link": "FILL_IN_LANDING_PAGE_URL", "image": "./images/sunrise-yoga_01_offer-card_square.png", "headline": "A calmer start", "primary_text": "Try a welcoming first yoga class at your own pace.", "link_description": "View beginner class times", "cta_type": "BOOK_NOW", "callToAction": "BOOK_NOW" },
    { "type": "carousel", "name": "Sunrise Yoga", "status": "PAUSED", "pageId": "FILL_IN_META_PAGE_ID", "link": "FILL_IN_LANDING_PAGE_URL", "primary_text": "Take your first step with a welcoming class.", "link_description": "Browse beginner sessions", "cta_type": "LEARN_MORE", "callToAction": "LEARN_MORE", "cards": [{ "image": "./carousel/sunrise-yoga_01_carousel_square.png", "headline": "Begin with a gentle class" }], "child_attachments": [{ "image": "./carousel/sunrise-yoga_01_carousel_square.png", "headline": "Begin with a gentle class", "link": "" }] }
  ]
}
```
# CLI commands

`node scripts/studio.mjs` prints full usage. Subcommands: `self-test [--no-render]`, `render-test`, `brand-json`, `use-example-brand`, `new-run <slug>`, `brief <run-dir>`, `contact-sheet <run-dir>`, `check <run-dir>`, and `handoff <run-dir>`. `new-run` creates `request.md`; `brief` combines that request with available brand and offer fields into `brief.md` and lists unresolved items. `contact-sheet` creates a visual contact sheet, `check` runs mechanical QA and logs it, and `handoff` writes the reviewed PAUSED handoff.

# Render overwrite behavior

`tools/ad-images/scripts/render.mjs` refuses to replace an existing output by default. For an intentional fix-round re-render, use this exact flag syntax:

```sh
node tools/ad-images/scripts/render.mjs --template tools/ad-images/templates/offer-card.html --data RUN_DIR/data/sunrise-yoga_01_offer-card_square.json --out RUN_DIR/images/sunrise-yoga_01_offer-card_square.png --width 1080 --height 1080 --manifest RUN_DIR/images/manifest.json --overwrite
```

Batch overwrite syntax:

```sh
node tools/ad-images/scripts/batch.mjs RUN_DIR/images/batch.json --overwrite
```

Carousel overwrite syntax:

```sh
node scripts/carousel.mjs RUN_DIR --overwrite
```

# Video Editor teaser plan

`RUN_DIR/video/teaser-plan.json` records the moments picked for a long-to-short teaser. `make-teaser` accepts this file (or the same list inline) as `segments`. Times are seconds or `HH:MM:SS.mmm` on the source recording. Order is the order in the teaser. At most 20 segments; the total must stay within 180 seconds unless `maxSeconds` is raised (at most 600).

```json
{ "segments": [
  { "start": "00:12:04.5", "end": "00:12:13", "label": "hook" },
  { "start": 1830, "end": 1842.2, "label": "idea" },
  { "start": "00:58:40", "end": "00:58:51", "label": "cta" }
] }
```

`make-teaser` writes `teaser-<name>.mp4` and, when a transcript is given, `teaser-<name>.srt` on the teaser's own timeline (plus `teaser-<name>-captioned.mp4` with `burnCaptions`). It never overwrites an existing file.
