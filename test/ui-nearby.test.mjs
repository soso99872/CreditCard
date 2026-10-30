import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { distanceText, matchLabel, entryForItem, fetchOverpass, nearbyStatusText, noCoverageNote, dotStyle, OVERPASS_URLS } from "../src/ui/nearby-view.mjs";
import { MAX_RESULTS } from "../src/engine/index.mjs";

const names = { coffee: "咖啡", general: "一般消費" };
const categoryName = (id) => names[id];
const merchantItem = { match: { type: "merchant", merchant: { name: "星巴克" } } };
const guessItem = { name: "路易莎", match: { type: "category-guess", categoryId: "coffee", by: "osm-tag" } };
const generalItem = { name: "臺鐵售票處", match: { type: "general" } };

describe("src/ui/nearby-view.mjs — 附近商家面板（T18b）", () => {
  test("距離：1 公里內用公尺，以上用公里一位小數", () => {
    assert.equal(distanceText(85), "85 公尺");
    assert.equal(distanceText(999), "999 公尺");
    assert.equal(distanceText(1250), "1.3 公里");
  });

  test("三種比對各有說明文字", () => {
    assert.equal(matchLabel(merchantItem, categoryName), "對應商家：星巴克");
    assert.equal(matchLabel(guessItem, categoryName), "依店家類型推測為「咖啡」");
    assert.match(matchLabel(generalItem, categoryName), /一般消費/);
  });

  test("點商家用商家名查；推測類別與無法對應都直接依類別查（不是打字查詢）", () => {
    assert.deepEqual(entryForItem(merchantItem, categoryName, "general"), { kind: "merchant", name: "星巴克" });
    assert.deepEqual(entryForItem(guessItem, categoryName, "general"), {
      kind: "category", id: "coffee", name: "咖啡", via: { store: "路易莎", how: "osm-guess" },
    });
    assert.deepEqual(entryForItem(generalItem, categoryName, "general"), {
      kind: "category", id: "general", name: "一般消費", via: { store: "臺鐵售票處", how: "osm-none" },
    });
  });

  test("狀態列：滿 MAX_RESULTS 家表示被截斷，不寫「共 N 家」", () => {
    assert.match(nearbyStatusText(MAX_RESULTS, MAX_RESULTS), /^最近的 30 家（300 公尺內還有更多）/);
    assert.equal(nearbyStatusText(3, MAX_RESULTS), "300 公尺內共 3 家，點一家看該刷哪張。");
  });

  test("地圖圓點三階：商家實心深色、推測空心、查無對應淡灰小點", () => {
    const [m, g, n] = [merchantItem, guessItem, generalItem].map(dotStyle);
    assert.equal(m.fillColor, "#1b1b1a");
    assert.equal(g.fillColor, "#fff");
    assert.equal(g.color, "#1b1b1a");
    assert.ok(n.radius < g.radius && g.radius < m.radius);
  });

  test("fetchOverpass：成功回 JSON，HTTP 錯誤與逾時丟 Error", async () => {
    const ok = async () => ({ ok: true, json: async () => ({ elements: [] }) });
    assert.deepEqual(await fetchOverpass("q", { fetchFn: ok }), { elements: [] });

    const busy = async () => ({ ok: false, status: 429 });
    await assert.rejects(fetchOverpass("q", { fetchFn: busy }), /HTTP 429/);

    const hang = (url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))
      );
    await assert.rejects(fetchOverpass("q", { fetchFn: hang, timeoutMs: 20, lastTimeoutMs: 20 }), /逾時/);
  });

  test("fetchOverpass：第一台失敗就換第二台，並通知 onRetry", async () => {
    const calls = [];
    const fetchFn = async (url) => {
      calls.push(url);
      return url === "https://a" ? { ok: false, status: 504 } : { ok: true, json: async () => ({ elements: [{ id: 1 }] }) };
    };
    const retried = [];
    const json = await fetchOverpass("q", { fetchFn, urls: ["https://a", "https://b"], onRetry: (u, why) => retried.push([u, why]) });
    assert.deepEqual(json, { elements: [{ id: 1 }] });
    assert.deepEqual(calls, ["https://a", "https://b"]);
    assert.deepEqual(retried, [["https://a", "HTTP 504"]]);
  });

  test("fetchOverpass：200 但不是 Overpass 結果也換下一台；逾時換下一台", async () => {
    const fetchFn = (url, { signal }) => {
      if (url === "https://a") return Promise.resolve({ ok: true, json: async () => ({ remark: "runtime error" }) });
      if (url === "https://b")
        return new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("x"), { name: "AbortError" }))));
      return Promise.resolve({ ok: true, json: async () => ({ elements: [] }) });
    };
    assert.deepEqual(await fetchOverpass("q", { fetchFn, urls: ["https://a", "https://b", "https://c"], timeoutMs: 20, lastTimeoutMs: 20 }), { elements: [] });
  });

  test("fetchOverpass：全部失敗才丟錯，且每台都試過；最後一台失敗不呼叫 onRetry", async () => {
    const calls = [];
    const fetchFn = async (url) => { calls.push(url); return { ok: false, status: 503 }; };
    let retries = 0;
    await assert.rejects(fetchOverpass("q", { fetchFn, urls: ["https://a", "https://b", "https://c"], onRetry: () => retries++ }), /HTTP 503/);
    assert.equal(calls.length, 3);
    assert.equal(retries, 2);
  });

  test("OVERPASS_URLS：至少 2 台、都是 https 且不重複", () => {
    assert.ok(OVERPASS_URLS.length >= 2);
    assert.equal(new Set(OVERPASS_URLS).size, OVERPASS_URLS.length);
    for (const u of OVERPASS_URLS) assert.match(u, /^https:\/\//);
  });

  test("noCoverageNote：全是查無對應才提示只收錄台灣", () => {
    const g = { match: { type: "general" } };
    const m = { match: { type: "merchant" } };
    assert.equal(noCoverageNote([g, g]), "目前只收錄台灣的商家。");
    assert.equal(noCoverageNote([g, m]), "");
    assert.equal(noCoverageNote([]), "");
  });
});
