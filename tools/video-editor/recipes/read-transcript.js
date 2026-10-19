"use strict";

const path = require("node:path");
const { readArg } = require("./_helpers");

module.exports.runRecipe = async function runRecipe(input = {}) {
  const captionsFile = String(readArg(input, ["captionsFile", "transcriptFile", "file"], "") || "").trim();
  if (!captionsFile) return { status: "error", reply: "Provide the transcript file (.srt or .vtt) of the recording." };
  const mod = require(path.join(__dirname, "..", "index.js"));
  try {
    const result = mod.readTranscript({ ...input, captionsFile });
    return { status: "ok", reply: `${result.transcript}: ${result.cueCount} timed lines, about ${Math.round(result.durationSeconds / 60)} minutes.\n\n${result.text}`, metadata: result };
  } catch (error) {
    return { status: "error", reply: error.message };
  }
};
