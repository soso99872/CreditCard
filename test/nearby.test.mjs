import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildOverpassQuery, parseNearby } from "../src/engine/nearby.mjs";
import { buildMerchantIndex } from "../src/engine/merchant-match.mjs";

const load = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const fixture = load("./fixtures/overpass/nearby.json");
const osmCategories = load("../data/osm-categories.json");
const categories = load("../data/categories.json").map((c) => c.id);
const merchants = load("../data/merchants.json");
const deps = { merchantIndex: buildMerchantIndex(merchants), osmCategories };
const origin = { lat: 25.0478, lng: 121.517 };
const run = (json) => parseNearby(json, origin, deps);
const byName = (list, name) => list.find((r) => r.name === name);

test("buildOverpassQuery：含半徑、座標、center", () => {
  const q = buildOverpassQuery(25.04, 121.5, 300);
  assert.match(q, /around:300,25.04,121.5/);
  assert.match(q, /out center/);
});

test("parseNearby：依距離由近到遠，way 用 center", () => {
  const list = run(fixture);
  const d = list.map((r) => r.distanceM);
  assert.deepEqual(d, [...d].sort((a, b) => a - b));
  assert.equal(list[0].name, "星巴克 台北車站門市");
  assert.equal(list[0].distanceM, 0);
  assert.ok(byName(list, "FamilyMart 全家 北車店").distanceM > 100);
});

test("parseNearby：同名同位置去重、無名稱略過", () => {
  const list = run(fixture);
  assert.equal(list.filter((r) => r.name === "7-ELEVEN 鑫鑫門市").length, 1);
  assert.equal(list.length, 7);
});

test("match：商家（分店名、brand、全形英文、別名開頭）", () => {
  const list = run(fixture);
  assert.equal(byName(list, "星巴克 台北車站門市").match.merchant.id, "starbucks");
  assert.equal(byName(list, "7-ELEVEN 鑫鑫門市").match.merchant.id, "7-eleven");
  assert.equal(byName(list, "FamilyMart 全家 北車店").match.merchant.id, "familymart");
  assert.equal(byName(list, "某某(台北車站)").match.merchant.id, "mcdonald-s");
  assert.equal(byName(list, "OK超商").match.merchant.id, "ok");
});

test("match：只有類型 → category-guess；無法對應 → general", () => {
  const list = run(fixture);
  assert.deepEqual(byName(list, "路過咖啡").match, { type: "category-guess", categoryId: "coffee", by: "osm-tag" });
  assert.deepEqual(byName(list, "阿伯的雜貨").match, { type: "general" });
});

test("match：去掉分店字尾後完全相符；最長別名優先", () => {
  const idx = buildMerchantIndex([
    { id: "a", name: "好店", aliases: [], category: "dining" },
    { id: "b", name: "好店咖啡", aliases: [], category: "coffee" },
  ]);
  const el = (name) => ({ elements: [{ lat: 1, lon: 1, tags: { name } }] });
  const m = (name) => parseNearby(el(name), { lat: 1, lng: 1 }, { merchantIndex: idx, osmCategories })[0].match.merchant.id;
  assert.equal(m("好店 信義店"), "a");
  assert.equal(m("好店咖啡 信義門市"), "b");
});

test("parseNearby：最多 30 筆，保留最近的", () => {
  const elements = Array.from({ length: 45 }, (_, i) => ({
    lat: 25.0478 + i * 0.0001, lon: 121.517, tags: { name: `店${i}`, shop: "yes" },
  }));
  const list = run({ elements });
  assert.equal(list.length, 30);
  assert.equal(list[0].name, "店0");
  assert.equal(list[29].name, "店29");
});

test("osm-categories.json 的類別 id 都存在於 categories.json", () => {
  for (const map of Object.values(osmCategories)) {
    for (const id of Object.values(map)) assert.ok(categories.includes(id), id);
  }
});

// ---- T21：靜態商家檔 ----
import { decodeGeo, nearbyFromGeo, inTaiwan, matchByName, MAX_RESULTS } from "../src/engine/nearby.mjs";

const byId = new Map(merchants.map((m) => [m.id, m]));
const m1 = merchants[0].id;
const m2 = merchants[1].id;
// 編碼：緯度存與前一筆的差（E5），三個一組
const geo = { generated: "2026-10-31T00:00:00Z", merchants: [m1, m2], places: [0, 12151700, 0, 100, 12151800, 1, 100, 12151700, 0] };

test("decodeGeo：還原緯度差、座標與商家 id", () => {
  assert.deepEqual(decodeGeo(geo), [
    { lat: 0, lng: 121.517, merchantId: m1 },
    { lat: 0.001, lng: 121.518, merchantId: m2 },
    { lat: 0.002, lng: 121.517, merchantId: m1 },
  ]);
});

test("nearbyFromGeo：依距離排序、match 為 merchant、半徑外不收", () => {
  const places = decodeGeo({ ...geo, places: [2504780, 12151700, 1, 100, 12151700, 0, 500, 12151700, 0] });
  const list = nearbyFromGeo(places, { lat: 25.0478, lng: 121.517 }, 300, byId);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((r) => r.distanceM), [0, 111]);
  assert.equal(list[0].match.merchant.id, m2);
  assert.equal(list[0].name, byId.get(m2).name);
});

test("nearbyFromGeo：最多 30 筆", () => {
  const places = Array.from({ length: 50 }, (_, i) => ({ lat: 25.0478 + i * 1e-5, lng: 121.517, merchantId: m1 }));
  assert.equal(nearbyFromGeo(places, { lat: 25.0478, lng: 121.517 }, 300, byId).length, MAX_RESULTS);
});

test("nearbyFromGeo：台灣外或範圍內查無店回 null（需退回 Overpass）", () => {
  const places = [{ lat: 25.0478, lng: 121.517, merchantId: m1 }, { lat: 35.6812, lng: 139.7671, merchantId: m1 }];
  assert.equal(nearbyFromGeo(places, { lat: 35.6812, lng: 139.7671 }, 300, byId), null); // 東京：即使檔案有點也不用
  assert.equal(nearbyFromGeo(places, { lat: 25.1, lng: 121.6 }, 300, byId), null);
});

test("inTaiwan：本島、澎湖、金門、馬祖在內，東京、香港不在", () => {
  for (const p of [[25.05, 121.52], [23.57, 119.57], [24.43, 118.32], [26.16, 119.95]]) assert.ok(inTaiwan({ lat: p[0], lng: p[1] }), String(p));
  for (const p of [[35.68, 139.77], [22.3, 114.17]]) assert.ok(!inTaiwan({ lat: p[0], lng: p[1] }), String(p));
});

test("data/merchants-geo.json：格式可解碼，商家 id 都在商家庫，台北車站附近有店", () => {
  const real = load("../data/merchants-geo.json");
  assert.match(real.generated, /^\d{4}-\d\d-\d\d/);
  assert.ok(real.osmBase);
  assert.equal(real.places.length % 3, 0);
  assert.ok(real.merchants.every((id) => byId.has(id)));
  const list = nearbyFromGeo(decodeGeo(real), origin, 300, byId);
  assert.ok(list.length > 0 && list.every((r) => r.distanceM <= 300));
});

test("matchByName：與 parseNearby 同一套比對", () => {
  const tags = { name: "星巴克 台北車站門市" };
  assert.equal(matchByName(tags, deps.merchantIndex), byName(run(fixture), tags.name).match.merchant);
});
