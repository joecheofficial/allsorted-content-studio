"use strict";

const path = require("node:path");
const { readArg } = require("./_helpers");

module.exports.runRecipe = async function runRecipe(input = {}) {
  const file = String(readArg(input, ["file"], "") || "").trim();
  const segments = readArg(input, ["segments", "segmentsFile"], null);
  const outputDirectory = String(readArg(input, ["outputDirectory", "outputDir"], "") || "").trim();
  if (!file) return { status: "error", reply: "Provide the long recording to cut the teaser from." };
  if (!segments) return { status: "error", reply: "Provide segments: the moments to keep, as a list of { start, end } (seconds or HH:MM:SS)." };
  if (!outputDirectory) return { status: "error", reply: "Provide an output directory for the teaser." };
  const mod = require(path.join(__dirname, "..", "index.js"));
  try {
    const result = mod.makeTeaser({ ...input, file, segments, outputDirectory });
    const extras = [result.captions && `captions ${result.captions}`, result.captioned && `captioned copy ${result.captioned}`].filter(Boolean).join(", ");
    return { status: "ok", reply: `Teaser ${result.output}: ${result.segments.length} moments, ${result.durationSeconds} seconds, ${result.preset}${extras ? `, ${extras}` : ""}. Original untouched.`, metadata: result };
  } catch (error) {
    return { status: "error", reply: error.message };
  }
};
