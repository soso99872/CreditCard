// 產生 data/merchants-geo.json：台灣境內「商家庫有的店」的位置，查附近時先讀這份檔，不必等 Overpass（T21）。
// 用法：npm run build:merchants（約 1～3 分鐘，視 Overpass 伺服器忙碌）；商家庫新增商家後、或每週跑一次。
// 比對規則與附近查詢同一套（engine/nearby.mjs 的 matchByName）；只留對得到商家庫的店。

import { readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { buildMerchantIndex, matchByName } from "../src/engine/index.mjs";

const URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const OUT = new URL("../data/merchants-geo.json", import.meta.url);
const QUERY = `[out:json][timeout:180];area["ISO3166-1"="TW"]->.tw;(
nwr["name"]["shop"](area.tw);
nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|fuel|pharmacy|cinema)$"](area.tw);
nwr["name"]["tourism"="hotel"](area.tw);
);out center tags;`;

async function fetchAll() {
  const errors = [];
  for (const url of URLS) {
    try {
      console.log(`查詢 ${new URL(url).host} …`);
      const res = await fetch(url, {
        method: "POST",
        headers: { "user-agent": "cardpick-build/1.0 (https://creditcardpick.pages.dev)", accept: "*/*" },
        body: new URLSearchParams({ data: QUERY }),
        signal: AbortSignal.timeout(300000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!Array.isArray(json.elements) || json.elements.length < 1000) throw new Error(`回應筆數不合理（${json.elements?.length}）`);
      return json;
    } catch (err) {
      errors.push(`${new URL(url).host}: ${err.message}`);
      console.log(`  失敗：${err.message}`);
    }
  }
  throw new Error(`所有 Overpass 伺服器都失敗\n${errors.join("\n")}`);
}

const merchants = JSON.parse(await readFile(new URL("../data/merchants.json", import.meta.url), "utf8"));
const merchantIndex = buildMerchantIndex(merchants);
const osm = await fetchAll();

const ids = [];
const idxOf = new Map();
const counts = new Map();
const seen = new Set();
const rows = [];
for (const el of osm.elements) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!tags.name || typeof lat !== "number" || typeof lng !== "number") continue;
  const merchant = matchByName(tags, merchantIndex);
  if (!merchant) continue;
  const latE5 = Math.round(lat * 1e5);
  const lngE5 = Math.round(lng * 1e5);
  const key = `${merchant.id}|${latE5}|${lngE5}`;
  if (seen.has(key)) continue; // 同一家店的節點與建築輪廓只留一筆
  seen.add(key);
  if (!idxOf.has(merchant.id)) idxOf.set(merchant.id, ids.push(merchant.id) - 1);
  counts.set(merchant.name, (counts.get(merchant.name) || 0) + 1);
  rows.push([latE5, lngE5, idxOf.get(merchant.id)]);
}
rows.sort((a, b) => a[0] - b[0]);
let prev = 0;
const places = rows.flatMap(([la, ln, i]) => { const r = [la - prev, ln, i]; prev = la; return r; });

const geo = { generated: new Date().toISOString(), osmBase: osm.osm3s?.timestamp_osm_base ?? null, merchants: ids, places };
const text = JSON.stringify(geo);
await writeFile(OUT, text);

console.log(`OSM 元素 ${osm.elements.length} 筆，對得到商家庫 ${rows.length} 筆，涵蓋 ${ids.length} 個商家`);
console.log(`前 10 名：${[...counts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([n, c]) => `${n} ${c}`).join("、")}`);
console.log(`檔案大小：原始 ${(text.length / 1024).toFixed(0)}KB，gzip ${(gzipSync(text).length / 1024).toFixed(0)}KB（目標 ≤ 300KB）`);
