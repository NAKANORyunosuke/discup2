import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE_URL = "https://mokkun7.com/enjoy/discup2-table/";
const UPLOAD_BASE = "https://mokkun7.com/wp-content/uploads/2022/08/";
const TABLE_DIR = resolve(ROOT, "assets", "table");
const STOP_DIR = resolve(TABLE_DIR, "stops");
const RESULT_DIR = resolve(TABLE_DIR, "results");

const symbolNames = [
  "星", "チェリー", "スイカ", "リプレイ", "スイカ", "黒BAR", "星",
  "リプレイ", "チェリー", "リプレイ", "星", "スイカ", "青7", "星",
  "星", "ギザリプ", "星", "スイカ", "リプレイ", "赤7", "スイカ",
];

const circledNumbers = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩", "⑪",
  "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳", "㉑",
];

function decodeHtml(value) {
  return String(value)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, function (_, code) {
      return String.fromCodePoint(Number(code));
    })
    .replace(/&#x([0-9a-f]+);/gi, function (_, code) {
      return String.fromCodePoint(Number.parseInt(code, 16));
    })
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/[\t\r\n　 ]+/g, " ")
    .trim();
}

function roleTokens(value) {
  const cleaned = decodeHtml(value).replace(/^・+|・+$/g, "");
  if (!cleaned) return [];
  return cleaned.split("・").map(function (item) {
    return item.trim();
  }).filter(Boolean);
}

function resultNumberFromUrl(url) {
  const match = basename(url).match(/^dut2-(\d+)-1\.png$/);
  if (!match) throw new Error("Unexpected result image: " + url);
  return Number(match[1]);
}

async function fetchBuffer(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "DiscUp2-ReachMission local archive" },
  });
  if (!response.ok) {
    throw new Error(response.status + " " + response.statusText + ": " + url);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function mapConcurrent(items, limit, worker) {
  let cursor = 0;
  const runners = Array.from({ length: limit }, async function () {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

const html = (await fetchBuffer(SOURCE_URL)).toString("utf8");
const sectionPattern =
  /<h3><span id="toc\d+">([^<]*番を下段押し)<\/span><\/h3>([\s\S]*?)(?=<h3>|$)/g;
const rowPattern =
  /<p><strong>([\s\S]*?)<\/strong><\/p>\s*<p><img[\s\S]*?src="([^"]+)"[\s\S]*?<\/p>\s*<p>対応役：([\s\S]*?)<\/p>/g;
const redSpanPattern =
  /<span[^>]*style="[^"]*color:\s*#ff0000;?[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

const stops = [];
for (const sectionMatch of html.matchAll(sectionPattern)) {
  const number = stops.length + 1;
  const [, heading, block] = sectionMatch;
  const mainImageMatch = block.match(/src="([^"]*\/dut2-\d+\.png)"/);
  if (!mainImageMatch) {
    throw new Error("Missing main image for stop " + number);
  }

  const slips = [];
  for (const rowMatch of block.matchAll(rowPattern)) {
    const [, labelHtml, sourceImage, rolesHtml] = rowMatch;
    const label = decodeHtml(labelHtml);
    const annotationMatch = label.match(/\(([^)]+)\)/);
    const annotation = annotationMatch ? annotationMatch[1] : "";
    const hotSegments = [];
    for (const hotMatch of rolesHtml.matchAll(redSpanPattern)) {
      hotSegments.push(hotMatch[1]);
    }
    const normalHtml = rolesHtml.replace(redSpanPattern, "");
    const resultStop = resultNumberFromUrl(sourceImage);
    slips.push({
      slip: slips.length,
      label,
      annotation,
      state: annotation.includes("停止しない")
        ? "impossible"
        : annotation.includes("1確") ? "confirmed" : "normal",
      resultStop,
      image: "assets/table/results/" + String(resultStop).padStart(2, "0") + ".png",
      roles: roleTokens(rolesHtml),
      normalRoles: roleTokens(normalHtml),
      hotRoles: roleTokens(hotSegments.join("・")),
    });
  }

  if (slips.length !== 5) {
    throw new Error("Expected 5 slip rows for stop " + number + ", got " + slips.length);
  }

  stops.push({
    number,
    circled: circledNumbers[number - 1],
    heading: decodeHtml(heading),
    symbol: symbolNames[number - 1],
    image: "assets/table/stops/" + String(number).padStart(2, "0") + ".png",
    slips,
  });
}

if (stops.length !== 21) {
  throw new Error("Expected 21 stop sections, parsed " + stops.length);
}

await mkdir(STOP_DIR, { recursive: true });
await mkdir(RESULT_DIR, { recursive: true });

const downloads = [
  {
    url: UPLOAD_BASE + "du2tablem1-1024x882.png",
    path: resolve(TABLE_DIR, "reel-array.png"),
  },
];
for (let number = 1; number <= 21; number += 1) {
  downloads.push({
    url: UPLOAD_BASE + "dut2-" + number + ".png",
    path: resolve(STOP_DIR, String(number).padStart(2, "0") + ".png"),
  });
  downloads.push({
    url: UPLOAD_BASE + "dut2-" + number + "-1.png",
    path: resolve(RESULT_DIR, String(number).padStart(2, "0") + ".png"),
  });
}

await mapConcurrent(downloads, 8, async function (item, index) {
  await writeFile(item.path, await fetchBuffer(item.url));
  if ((index + 1) % 10 === 0 || index + 1 === downloads.length) {
    console.log("Downloaded " + (index + 1) + "/" + downloads.length);
  }
});

const payload = {
  source: SOURCE_URL,
  title: "ディスクアップ2 制御・スベリ対応表",
  fetchedAt: new Date().toISOString(),
  totalStops: stops.length,
  totalPatterns: stops.reduce(function (sum, stop) {
    return sum + stop.slips.length;
  }, 0),
  notes: [
    "各番号の左リール第一停止を下段に押した場合の対応表です。",
    "スベリコマ数は、対応番号を下段に押した場合を基準にしています。",
    "共通1枚役は、前ゲームでSBが入賞していないことが条件です。",
    "左⑯のギザリプはチェリーの代用図柄です。SB入賞に注意してください。",
    "ボーナス未成立時および成立時の制御です。",
  ],
  stops,
};

await writeFile(
  resolve(ROOT, "data", "control-table.json"),
  JSON.stringify(payload, null, 2) + "\n",
  "utf8",
);

console.log(
  "Wrote data/control-table.json with " + stops.length +
    " stops and " + payload.totalPatterns + " patterns.",
);
