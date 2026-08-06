import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_URL = "https://p.datu.work/model/discup2/mission.html?mode=thum";
const IMAGE_BASE = "https://p.datu.work/images/model/discup2/mission";
const OUTPUT_DIR = resolve(ROOT, "assets", "missions");

const leftPositions = {
  "1": "下段チェリー（黒赤）",
  "2": "中段チェリー（黒赤）",
  "3": "上段チェリー（黒赤）",
  "4": "下段赤7",
  "5": "中段赤7",
  "6": "上段赤7",
  "7": "枠上赤7",
  "8": "スリホ（赤青）",
  "9": "ホリホ",
  a: "リホホ（枠下青7）",
  b: "下段青7",
  c: "中段青7",
  d: "上段青7",
  e: "枠上青7",
  f: "下段チェリー（青黒）",
  g: "中段チェリー（青黒）",
  h: "上段チェリー（青黒）",
  i: "下段黒BAR",
  j: "中段黒BAR",
  k: "上段黒BAR",
  l: "スリス",
};

function decodeHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\t\r\n　 ]+/g, " ")
    .trim();
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "DiskUp2-ReachMission local archive" },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${url}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

const html = (await fetchBuffer(SOURCE_URL)).toString("utf8");
const cardPattern = /<div class="thum list" no="(\d{3})" end="[^"]*" me="([^"]+)" rank="([^"]+)">\s*<div><span class="no">No\.\d{3} \((\d+)件\)<\/span><span class="rank">[^<]*<\/span><\/div>\s*<img[^>]*>\s*<div><button[^>]*>[^<]*<\/button><span class="osi">([\s\S]*?)<\/span><\/div>\s*<div class="thum-comment">([\s\S]*?)<\/div>\s*<\/div>/g;

const missions = [];
for (const match of html.matchAll(cardPattern)) {
  const [, no, left, rank, variants, constraint, note] = match;
  missions.push({
    no,
    rank,
    left,
    leftLabel: leftPositions[left] ?? "不明",
    variants: Number(variants),
    constraint: decodeHtml(constraint),
    note: decodeHtml(note),
    image: `assets/missions/${no}.jpg`,
  });
}

if (missions.length !== 222) {
  throw new Error(`Expected 222 missions, parsed ${missions.length}`);
}

await mkdir(OUTPUT_DIR, { recursive: true });
await mapConcurrent(missions, 10, async (mission, index) => {
  const image = await fetchBuffer(`${IMAGE_BASE}/${mission.no}.jpg`);
  await writeFile(resolve(OUTPUT_DIR, `${mission.no}.jpg`), image);
  if ((index + 1) % 25 === 0 || index + 1 === missions.length) {
    console.log(`Downloaded ${index + 1}/${missions.length}`);
  }
});

const payload = {
  source: SOURCE_URL,
  version: "20220502-01",
  fetchedAt: new Date().toISOString(),
  total: missions.length,
  leftPositions,
  missions,
};

await writeFile(
  resolve(ROOT, "data", "missions.json"),
  `${JSON.stringify(payload, null, 2)}\n`,
  "utf8",
);

console.log(`Wrote data/missions.json with ${missions.length} missions.`);
