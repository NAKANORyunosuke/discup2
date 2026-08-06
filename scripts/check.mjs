import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const data = JSON.parse(await readFile(resolve(ROOT, "data", "missions.json"), "utf8"));
const controlData = JSON.parse(
  await readFile(resolve(ROOT, "data", "control-table.json"), "utf8"),
);
const patternData = JSON.parse(
  await readFile(resolve(ROOT, "data", "mission-patterns.json"), "utf8"),
);
const errors = [];

if (data.missions.length !== 222) {
  errors.push("missions.json must contain 222 missions");
}

const numbers = new Set(data.missions.map(function (mission) {
  return mission.no;
}));
if (numbers.size !== 222) {
  errors.push("Mission numbers must be unique");
}

for (let index = 1; index <= 222; index += 1) {
  const no = String(index).padStart(3, "0");
  if (!numbers.has(no)) errors.push("Missing mission " + no);
}

const allowedRanks = new Set(["NORMAL", "A", "S", "SS"]);
const expectedLeftCodes = new Set([
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "a", "b",
  "c", "d", "e", "f", "g", "h", "i", "j", "k", "l",
]);
if (
  Object.keys(data.leftPositions).length !== expectedLeftCodes.size ||
  Object.keys(data.leftPositions).some(function (code) {
    return !expectedLeftCodes.has(code);
  })
) {
  errors.push("missions.json must contain all 21 left reel positions");
}
for (const mission of data.missions) {
  if (!allowedRanks.has(mission.rank)) {
    errors.push("Invalid rank on mission " + mission.no);
  }
  if (!expectedLeftCodes.has(mission.left)) {
    errors.push("Invalid left reel position on mission " + mission.no);
  }
  const imagePath = resolve(ROOT, mission.image);
  try {
    await access(imagePath);
    const image = await stat(imagePath);
    if (image.size < 1000) errors.push("Image is unexpectedly small: " + mission.image);
  } catch {
    errors.push("Missing image: " + mission.image);
  }
}

if (controlData.stops.length !== 21) {
  errors.push("control-table.json must contain 21 stops");
}
if (controlData.totalPatterns !== 105) {
  errors.push("control-table.json must contain 105 patterns");
}

const allowedStates = new Set(["normal", "confirmed", "impossible"]);
for (const stop of controlData.stops) {
  if (stop.slips.length !== 5) {
    errors.push("Stop " + stop.number + " must contain 5 slip patterns");
  }
  for (const slip of stop.slips) {
    if (!allowedStates.has(slip.state)) {
      errors.push(
        "Invalid state on stop " + stop.number + ", slip " + slip.slip,
      );
    }
    if (slip.resultStop < 1 || slip.resultStop > 21) {
      errors.push(
        "Invalid result stop on stop " + stop.number + ", slip " + slip.slip,
      );
    }
    const expectedResult = ((stop.number - 1 + slip.slip) % 21) + 1;
    if (slip.resultStop !== expectedResult) {
      errors.push(
        "Unexpected reel wrap on stop " + stop.number + ", slip " + slip.slip,
      );
    }
    if (slip.state !== "impossible" && slip.roles.length === 0) {
      errors.push(
        "Missing roles on stop " + stop.number + ", slip " + slip.slip,
      );
    }
  }
  for (const imagePath of [stop.image, ...stop.slips.map(function (slip) {
    return slip.image;
  })]) {
    try {
      await access(resolve(ROOT, imagePath));
    } catch {
      errors.push("Missing control image: " + imagePath);
    }
  }
}

const reelNames = ["left", "middle", "right"];
const expectedWindowCounts = { left: 20, middle: 15, right: 17 };
const allowedSymbols = new Set(Object.keys(patternData.symbolLabels || {}));
const reelWindowKeys = {};
let actualWildcardColumns = 0;

if (patternData.total !== 222 || Object.keys(patternData.patterns || {}).length !== 222) {
  errors.push("mission-patterns.json must contain 222 patterns");
}
for (const reel of reelNames) {
  const windows = patternData.reelWindows && patternData.reelWindows[reel];
  const sequence = patternData.reelSequences && patternData.reelSequences[reel];
  if (
    !Array.isArray(sequence) || sequence.length !== 21 ||
    sequence.some(function (symbol) { return !allowedSymbols.has(symbol); })
  ) {
    errors.push("Invalid " + reel + " reel sequence in mission-patterns.json");
  }
  if (!Array.isArray(windows) || windows.length !== expectedWindowCounts[reel]) {
    errors.push(
      "Unexpected " + reel + " reel window count in mission-patterns.json",
    );
    reelWindowKeys[reel] = new Set();
    continue;
  }
  reelWindowKeys[reel] = new Set(windows.map(function (window) {
    return window.join("|");
  }));
  if (reelWindowKeys[reel].size !== windows.length) {
    errors.push("Duplicate " + reel + " reel window in mission-patterns.json");
  }
}
for (const mission of data.missions) {
  const pattern = patternData.patterns && patternData.patterns[mission.no];
  if (!pattern) {
    errors.push("Missing stopped pattern for mission " + mission.no);
    continue;
  }
  for (const reel of reelNames) {
    const window = pattern[reel];
    if (window === null && reel !== "left") {
      actualWildcardColumns += 1;
      continue;
    }
    if (!Array.isArray(window) || window.length !== 3) {
      errors.push("Invalid " + reel + " pattern on mission " + mission.no);
      continue;
    }
    if (window.some(function (symbol) { return !allowedSymbols.has(symbol); })) {
      errors.push("Unknown symbol on mission " + mission.no + " " + reel + " reel");
    }
    if (!reelWindowKeys[reel].has(window.join("|"))) {
      errors.push("Impossible reel window on mission " + mission.no + " " + reel);
    }
  }
}
if (patternData.validation?.leftPatternsVerified !== 222) {
  errors.push("All 222 left reel patterns must be verified");
}
if (
  typeof patternData.validation?.minimumConfidenceGap !== "number" ||
  patternData.validation.minimumConfidenceGap < 5
) {
  errors.push("Pattern classification confidence is below the required threshold");
}
if (patternData.validation?.wildcardColumns !== actualWildcardColumns) {
  errors.push("Pattern wildcard count does not match the generated index");
}

for (const file of [
  "index.html",
  "styles.css",
  "app.js",
  "table.html",
  "table.css",
  "table.js",
  "assets/favicon.svg",
  "assets/table/reel-array.png",
  "data/mission-patterns.json",
  "scripts/build-pattern-index.py",
]) {
  try {
    await access(resolve(ROOT, file));
  } catch {
    errors.push("Missing required file: " + file);
  }
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  const rankCounts = data.missions.reduce(function (counts, mission) {
    counts[mission.rank] = (counts[mission.rank] || 0) + 1;
    return counts;
  }, {});
  console.log(
    "PASS | missions=222 | mission_images=222 | control_stops=21 | " +
      "control_patterns=105 | mission_patterns=222 | pattern_wildcards=" +
      patternData.validation.wildcardColumns + " | ranks=" + JSON.stringify(rankCounts),
  );
}
