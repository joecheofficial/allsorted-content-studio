#!/bin/sh
set -eu
SRC=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
HOME_DIR=${HOME}
DEST=''
CHECK=0
NO_NPM=${ALLSORTED_NO_NPM:-0}
while [ "$#" -gt 0 ]; do
  case "$1" in
    --home) [ "$#" -ge 2 ] || { echo 'Provide a folder after --home.' >&2; exit 2; }; HOME_DIR=$2; shift 2;;
    --dir) [ "$#" -ge 2 ] || { echo 'Provide a folder after --dir.' >&2; exit 2; }; DEST=$2; shift 2;;
    --check) CHECK=1; shift;;
    --no-npm) NO_NPM=1; shift;;
    *) echo "Unknown option: $1" >&2; exit 2;;
  esac
done
[ -n "$DEST" ] || DEST="$HOME_DIR/allsorted-content-studio"
case "$DEST" in /*) ;; *) DEST="$PWD/$DEST";; esac
NODE=$(command -v node || true)
if [ -z "$NODE" ]; then echo 'Node.js 20.9 or later is required.' >&2; exit 1; fi
NODE_VERSION=$("$NODE" -p 'process.versions.node')
if ! "$NODE" -e 'const [a,b]=process.versions.node.split(".").map(Number); if(a<20||(a===20&&b<9)) process.exit(1)'; then echo "Node.js 20.9 or later is required. Found $NODE_VERSION." >&2; exit 1; fi

if [ "$CHECK" -eq 1 ]; then
  CHECK_ROOT=$SRC
  [ -f "$DEST/scripts/studio.mjs" ] && CHECK_ROOT=$DEST
  REQUIRED_STATUS=0
  for file in README.md DIRECTOR.md INSTALL-PROMPT.md AGENTS.md VERSION CHANGELOG.md package.json scripts/studio.mjs scripts/carousel.mjs scripts/install-files.mjs skill/SKILL.md docs/DATA-FORMATS.md brand/BRAND-BRAIN.template.md brand/BRAND-BRAIN.example.md brand/brand.example.json tools/hooklab/SKILL.md tools/ad-images/scripts/render.mjs tools/ad-images/scripts/cta-colors.mjs tools/carousel-builder/bin/carousel.js tools/heygen-ad-videos/scripts/heygen.mjs tools/video-editor/index.js tools/video-editor/hyperframes.js tools/video-editor/INSTALL-HYPERFRAMES.md scripts/hyperframes-setup.mjs tools/launch-video/brag/SKILL.md tools/launch-video/brag-slim/SKILL.md agents/content-checker.md agents/content-copywriter.md agents/content-carousel-maker.md agents/content-director.md agents/content-hook-writer.md agents/content-image-maker.md agents/content-launch-video.md agents/content-video-editor.md agents/content-video-maker.md; do
    if [ ! -f "$CHECK_ROOT/$file" ]; then echo "Required file: missing $file"; REQUIRED_STATUS=1; fi
  done
  set +e
  CONTENT_STUDIO_DIR="$CHECK_ROOT" "$NODE" "$CHECK_ROOT/scripts/studio.mjs" self-test --no-render
  SELF_STATUS=$?
  set -e
  [ "$REQUIRED_STATUS" -eq 0 ] && [ "$SELF_STATUS" -eq 0 ]
  exit $?
fi

if ! { command -v google-chrome >/dev/null 2>&1 || command -v google-chrome-stable >/dev/null 2>&1 || command -v microsoft-edge >/dev/null 2>&1 || { command -v open >/dev/null 2>&1 && { open -Ra 'Google Chrome' >/dev/null 2>&1 || open -Ra 'Microsoft Edge' >/dev/null 2>&1; }; } || [ -x "$HOME_DIR/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" ] || [ -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ] || [ -x '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge' ]; }; then echo 'Install Google Chrome or Microsoft Edge, then run this installer again.' >&2; exit 1; fi
mkdir -p "$DEST" "$HOME_DIR"
"$NODE" "$SRC/scripts/install-files.mjs" "$SRC" "$DEST" "$HOME_DIR"
# Kept for compatibility: the pinned carousel engine has zero npm dependencies.
CONTENT_STUDIO_DIR="$DEST" "$NODE" "$DEST/scripts/studio.mjs" self-test --no-render

# HyperFrames for the Video Editor is part of the standard install: Claude Code plugin
# or Codex core skills, FFmpeg through Homebrew when missing, telemetry off in the shell
# profile, then the doctor check. Anything it cannot install is named in one plain
# sentence. It always lets the install finish; the repair prompt is
# tools/video-editor/INSTALL-HYPERFRAMES.md. CONTENT_STUDIO_SKIP_HYPERFRAMES=1 skips it.
"$NODE" "$DEST/scripts/hyperframes-setup.mjs" --home "$HOME_DIR" || echo "HyperFrames setup did not finish. Run the prompt in $DEST/tools/video-editor/INSTALL-HYPERFRAMES.md"

# Weekly self-update: on by default, one line turns it off. It fast-forwards the
# git clone this installer came from, never touches brand/, learnings/, runs/ or
# any file you made, backs up first and rolls back if the self-test fails.
# The nested tools/carousel-builder copy does not register a job of its own.
UPDATE_ROOT=""
if [ -d "$SRC/.git" ]; then UPDATE_ROOT=$SRC; elif [ -d "$DEST/.git" ]; then UPDATE_ROOT=$DEST; fi
echo ""
if [ "${CONTENT_STUDIO_SKIP_UPDATES:-0}" = "1" ] || [ "${ALLSORTED_AUTO_UPDATE:-1}" = "0" ]; then
  echo "Weekly updates not scheduled (CONTENT_STUDIO_SKIP_UPDATES=1). Later: node \"$SRC/scripts/self-update.js\" --register"
elif [ -z "$UPDATE_ROOT" ]; then
  echo "Weekly updates need a git clone. Install with git clone to get them automatically."
else
  "$NODE" "$UPDATE_ROOT/scripts/self-update.js" --register || echo "Weekly updates could not be scheduled. Try later: node \"$UPDATE_ROOT/scripts/self-update.js\" --register"
fi
