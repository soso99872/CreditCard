// sprint 010 T02：排序 v2（direct／gated 分組、effectiveRate）對照集與單元測試
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { recommend } from "../src/engine/recommend.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));
const data = await loadAllData({ baseUrl: "data/", fetchJson: readJson });
const golden = await readJson("test/fixtures/engine/ranking-golden.json");

describe("排序對照集（真資料、不填金額、用類別預設金額）", () => {
  for (const q of golden.queries) {
    test(`${q.query}`, () => {
      const { recommendations } = recommend({
        ...data,
        query: q.query,
        selectedCategoryId: q.selectedCategoryId ?? null,
        today: golden.today,
      });
      assert.equal(recommendations[0].group, q.expectFirstGroup);
      const direct = recommendations.filter((r) => r.group === "direct").map((r) => r.cardId);
      assert.deepEqual(direct.slice(0, q.directTop.length), q.directTop);
      assert.ok(
        recommendations.some((r) => r.group === "gated" && r.cardId === q.gatedIncludes),
        `gated 組應含 ${q.gatedIncludes}`
      );
    });
  }
});

// 最小 fixture：同一類別下 A＝5% 上限 100 元、B＝3% 無上限、C＝4% 但要資產門檻
const rule = (rate, extra = {}) => ({
  rate, rawReward: `${rate}%`, scope: { type: "general" }, conditionTags: [], sourceType: "official",
  sourceUrl: "https://example.com", checkedAt: "2026-11-01", ...extra,
});
const card = (id, rules, extra = {}) => ({ id, name: id, bankId: "x", verified: true, rules, ...extra });
const base = {
  query: "任意店", selectedCategoryId: "other", today: "2026-11-25",
  merchants: [], categoryKeywords: {}, categories: [{ id: "other", name: "其他", parent: null }],
};

describe("effectiveRate（AC-05）", () => {
  const cards = [
    card("a", [rule(5, { cap: { amount: 100, unit: "TWD", period: "month" } })]),
    card("b", [rule(3)]),
    card("c", [rule(4, { conditionTags: ["asset"] })]),
    card("d", [rule(1, { cap: { amount: 100, unit: "point", period: "month" } })], { pointValue: { twdPerPoint: 0.5 } }),
  ];

  test("填 5,000：5% 上限 100 元 → effectiveRate 2，排在 3% 無上限卡後面", () => {
    const { recommendations: r } = recommend({ ...base, cards, amount: 5000 });
    assert.equal(r.find((x) => x.cardId === "a").effectiveRate, 2);
    const direct = r.filter((x) => x.group === "direct").map((x) => x.cardId);
    assert.deepEqual(direct, ["b", "a", "d"]);
  });

  test("沒填金額用 default 1000：5% 上限 100 元不受影響（50 元）", () => {
    const { recommendations: r } = recommend({ ...base, cards, categoryDefaults: { default: 1000, categories: {} } });
    assert.equal(r.find((x) => x.cardId === "a").effectiveRate, 5);
  });

  test("gated 組在 direct 之後；點數上限用 twdPerPoint 換算", () => {
    const { recommendations: r } = recommend({ ...base, cards, amount: 5000 });
    assert.equal(r.at(-1).cardId, "c");
    assert.equal(r.at(-1).group, "gated");
    assert.deepEqual(r.at(-1).conditionTags, ["asset"]);
    assert.equal(r.find((x) => x.cardId === "d").effectiveRate, 1); // min(50, 100×0.5)÷5000
  });

  test("同卡 gated 規則不比 direct 高時不重複出現；比較高時兩組各一次", () => {
    const lo = card("e", [rule(2), rule(2, { conditionTags: ["plan"] })]);
    const hi = card("f", [rule(2), rule(4, { conditionTags: ["plan"] })]);
    const { recommendations: r } = recommend({ ...base, cards: [lo, hi], amount: 1000 });
    assert.equal(r.filter((x) => x.cardId === "e").length, 1);
    assert.deepEqual(r.filter((x) => x.cardId === "f").map((x) => x.group), ["direct", "gated"]);
  });
});
