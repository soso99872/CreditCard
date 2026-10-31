// 附近商家：Overpass 查詢字串與結果對應（純邏輯，不發請求）。見 tasks.md T18a。

import { normalize } from "./normalize.mjs";

export const MAX_RESULTS = 30;

/**
 * 產生 Overpass QL：半徑內有 name 的 shop、常見 amenity、旅館（節點與 way，way 取 center）。
 * @returns {string}
 */
export function buildOverpassQuery(lat, lng, radiusM) {
  const around = `(around:${Number(radiusM)},${Number(lat)},${Number(lng)})`;
  return `[out:json][timeout:25];(
nwr["name"]["shop"]${around};
nwr["name"]["amenity"~"^(restaurant|cafe|fast_food|fuel|pharmacy|cinema)$"]${around};
nwr["name"]["tourism"="hotel"]${around};
);out center qt 200;`;
}

export function haversineM(lat1, lng1, lat2, lng2) {
  const rad = (d) => (d * Math.PI) / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * 6371000 * Math.asin(Math.sqrt(a)));
}

// 去掉結尾的括號註記（如「(台北車站)」）與分店字尾（門市、分店、店）
function stripBranch(normalized) {
  return normalized.replace(/[(（][^)）]*[)）]$/, "").replace(/(門市|分店|店)$/, "");
}

/** 以 OSM tags 的 brand／name 比對商家庫（parseNearby 與 build:merchants 共用）。 */
export function matchByName(tags, merchantIndex) {
  const names = [tags.brand, tags["brand:zh"], tags["name:zh"], tags.name]
    .filter(Boolean).map(normalize);
  for (const n of names) if (merchantIndex.has(n)) return merchantIndex.get(n);
  for (const n of names) {
    const s = stripBranch(n);
    if (merchantIndex.has(s)) return merchantIndex.get(s);
  }
  let best = null;
  let bestLen = 0;
  for (const n of names) {
    for (const [key, merchant] of merchantIndex) {
      if (key.length >= 2 && key.length > bestLen && n.startsWith(key)) {
        best = merchant;
        bestLen = key.length;
      }
    }
  }
  return best;
}

function guessCategory(tags, osmCategories) {
  for (const [key, map] of Object.entries(osmCategories)) {
    if (tags[key] && map[tags[key]]) return map[tags[key]];
  }
  return null;
}

/**
 * 把 Overpass 回傳轉成依距離由近到遠的店家清單（同名同位置去重、最多 30 筆）。
 * match 為 {type:"merchant", merchant} | {type:"category-guess", categoryId, by:"osm-tag"} | {type:"general"}
 * @param {{elements?: object[]}} overpassJson
 * @param {{lat: number, lng: number}} origin
 * @param {{merchantIndex: Map<string, object>, osmCategories: object}} deps
 * @returns {Array<{name: string, distanceM: number, lat: number, lng: number, match: object}>}
 */
export function parseNearby(overpassJson, origin, { merchantIndex, osmCategories }) {
  const seen = new Set();
  const results = [];
  for (const el of overpassJson?.elements || []) {
    const tags = el.tags || {};
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    if (!tags.name || typeof lat !== "number" || typeof lng !== "number") continue;
    const key = `${tags.name}|${lat.toFixed(4)}|${lng.toFixed(4)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const merchant = matchByName(tags, merchantIndex);
    const categoryId = merchant ? null : guessCategory(tags, osmCategories);
    const match = merchant ? { type: "merchant", merchant }
      : categoryId ? { type: "category-guess", categoryId, by: "osm-tag" }
      : { type: "general" };
    results.push({ name: tags.name, distanceM: haversineM(origin.lat, origin.lng, lat, lng), lat, lng, match });
  }
  return results.sort((a, b) => a.distanceM - b.distanceM).slice(0, MAX_RESULTS);
}

// ---- 靜態商家檔（data/merchants-geo.json，npm run build:merchants 產生）----
// 格式：{generated, osmBase, merchants:[商家 id], places:[latE5 與前一筆的差, lngE5, 商家索引, ...（三個一組，依緯度排序）]}

/** 台灣外框（含澎湖、金門、馬祖）；框內才用靜態檔，其餘退回 Overpass。 */
const TAIWAN_BOXES = [[21.7, 25.4, 119.3, 122.1], [24.15, 24.6, 118.1, 118.55], [25.9, 26.4, 119.9, 120.6]];
export const inTaiwan = ({ lat, lng }) => TAIWAN_BOXES.some(([s, n, w, e]) => lat >= s && lat <= n && lng >= w && lng <= e);

/** 把商家檔展開成 [{lat, lng, merchantId}]（座標還原成度）。 */
export function decodeGeo(geo) {
  const out = [];
  let latE5 = 0;
  for (let i = 0; i < geo.places.length; i += 3) {
    latE5 += geo.places[i];
    out.push({ lat: latE5 / 1e5, lng: geo.places[i + 1] / 1e5, merchantId: geo.merchants[geo.places[i + 2]] });
  }
  return out;
}

/**
 * 用商家檔查附近：回傳同 parseNearby 格式的清單（match 一律 merchant）；
 * 同商家 50 公尺內只留最近一筆（OSM 同一站常有多個點，例如台鐵）；
 * 不在台灣外框或半徑內沒有店回 null，呼叫端改走 Overpass。
 * @param {Array<{lat: number, lng: number, merchantId: string}>} places decodeGeo 的結果
 * @param {Map<string, object>} merchantsById
 */
const SAME_PLACE_M = 50;

export function nearbyFromGeo(places, origin, radiusM, merchantsById) {
  if (!inTaiwan(origin)) return null;
  const results = [];
  for (const p of places) {
    const merchant = merchantsById.get(p.merchantId);
    if (!merchant) continue;
    const distanceM = haversineM(origin.lat, origin.lng, p.lat, p.lng);
    if (distanceM <= radiusM) results.push({ name: merchant.name, distanceM, lat: p.lat, lng: p.lng, match: { type: "merchant", merchant } });
  }
  results.sort((a, b) => a.distanceM - b.distanceM);
  const kept = [];
  for (const r of results) {
    if (kept.length === MAX_RESULTS) break;
    if (!kept.some((k) => k.match.merchant === r.match.merchant && haversineM(k.lat, k.lng, r.lat, r.lng) < SAME_PLACE_M)) kept.push(r);
  }
  return kept.length ? kept : null;
}
