"use strict";

const path = require("node:path");

// HyperFrames check. Always returns status "ok": a missing install is reported
// with install steps and the repair prompt, and the ffmpeg path keeps working.
module.exports.runRecipe = async function runRecipe() {
  try {
    const mod = require(path.join(__dirname, "..", "index.js"));
    const { detected, ...result } = mod.hyperframesStatus();
    const reply = result.installSteps ? `${result.statusLine}\n\n${result.installSteps}` : result.statusLine;
    return { status: "ok", reply, metadata: result };
  } catch (error) {
    return {
      status: "ok",
      reply: `HyperFrames: status check failed (${error.message}). Every other video-editor operation still works.`,
      metadata: { installed: false, ready: false },
    };
  }
};
