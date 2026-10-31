import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { buildMerchantIndex } from "../src/engine/merchant-match.mjs";
import { recommend } from "../src/engine/recommend.mjs";
import { selectBestRule } from "../src/engine/rules.mjs";
import { formatReason } from "../src/engine/format.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const TODAY = "2026-10-31";
const data = await loadAllData({
  baseUrl: "data/",
  fetchJson: async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8")),
});
const run = (query) => recommend({ ...data, query, today: TODAY });

const rule = (id, categories, rate) => ({ id, scope: { type: "category", categories }, rate });
const ctx = (categoryId) => ({ merchantId: null, categoryId, today: TODAY, merchantIndex: new Map() });

describe("地區分類同時比對 overseas 規則", () => {
  for (const q of ["日本", "歐洲", "巴黎"]) {
    test(`搜「${q}」會出現 CUBE 趣旅行海外規則`, () => {
      const { recommendations } = run(q);
      const cube = recommendations.find((r) => r.cardName.includes("CUBE"));
      assert.ok(cube, "找不到 CUBE");
      assert.ok(cube.rate >= 3);
      assert.ok(recommendations.length > 5);
    });
  }

  test("地區專屬規則比一般海外高時用地區規則", () => {
    const card = { rules: [rule("a", ["overseas"], 2), rule("b", ["japan"], 5)] };
    assert.equal(selectBestRule(card, ctx("japan")).rule.id, "b");
  });

  test("一般海外比地區專屬高時用海外規則並標記 viaOverseas", () => {
    const card = { rules: [rule("a", ["overseas"], 3), rule("b", ["japan"], 2)] };
    const best = selectBestRule(card, ctx("japan"));
    assert.equal(best.rule.id, "a");
    assert.equal(best.viaOverseas, true);
  });

  test("同回饋率時地區專屬規則優先", () => {
    const card = { rules: [rule("a", ["overseas"], 3), rule("b", ["japan"], 3)] };
    const best = selectBestRule(card, ctx("japan"));
    assert.equal(best.rule.id, "b");
    assert.ok(!best.viaOverseas);
  });

  test("搜「海外」不會套用只限日本的規則", () => {
    const card = { rules: [rule("b", ["japan"], 5)] };
    assert.equal(selectBestRule(card, ctx("overseas")), null);
  });

  test("地區不同不互通：搜韓國不套用日本規則", () => {
    const card = { rules: [rule("b", ["japan"], 5)] };
    assert.equal(selectBestRule(card, ctx("korea")), null);
  });

  test("推薦理由標明海外類別", () => {
    assert.equal(
      formatReason({ matchLevel: "category", displayName: "日本", categoryName: "日本", rate: 3, viaOverseas: true }),
      "日本屬海外消費，依海外類別回饋3%",
    );
  });

  test("excludeRegions：排除歐洲的海外規則查歐洲回 null、查日本有結果", () => {
    const card = { rules: [{ ...rule("a", ["overseas"], 3), scope: { type: "category", categories: ["overseas"], excludeRegions: ["europe"] } }] };
    assert.equal(selectBestRule(card, ctx("europe")), null);
    assert.equal(selectBestRule(card, ctx("japan")).rule.id, "a");
  });

  test("onlyRegions：只限日韓泰的海外規則查歐洲回 null、查日本有結果", () => {
    const card = { rules: [{ ...rule("a", ["overseas"], 3), scope: { type: "category", categories: ["overseas"], onlyRegions: ["japan", "korea", "thailand"] } }] };
    assert.equal(selectBestRule(card, ctx("europe")), null);
    assert.equal(selectBestRule(card, ctx("korea")).rule.id, "a");
  });

  test("真實資料：歐洲、巴黎、Harrods 不會推薦官方排除歐洲的海外規則", () => {
    const excluded = /uniopen-overseas|linepay-.*-overseas-store|hsbc-cashback-signature-overseas|allme-overseas|feib-hwcard-overseas|rakuten-panda-j-overseas|sunnybank-.*-jkt/;
    for (const q of ["歐洲", "巴黎", "Harrods"]) {
      const { match, recommendations } = run(q);
      for (const rec of recommendations.filter((r) => r.viaOverseas)) {
        const card = data.cards.find((c) => c.id === rec.cardId);
        const best = selectBestRule(card, { merchantId: match.merchantId ?? null, categoryId: match.categoryId, today: TODAY, merchantIndex: buildMerchantIndex(data.merchants) });
        assert.ok(!excluded.test(best.rule.id), `${q}：${rec.cardName} 靠被排除的規則 ${best.rule.id} 入選`);
      }
      if (q !== "Harrods") assert.ok(recommendations.some((r) => r.cardName.includes("CUBE")), `${q} 應有 CUBE`);
    }
  });

  test("真實資料：搜日本、美國，uniopen 仍會出現", () => {
    for (const q of ["日本", "美國"]) {
      assert.ok(run(q).recommendations.some((r) => r.cardName.includes("uniopen")), q);
    }
  });

  test("真實資料：玉山 Unicard 海外加碼只含完整涵蓋的地區，歐洲（只含英法德義）不套用", () => {
    for (const q of ["El Corte Ingles", "Harrods", "歐洲", "南美洲", "Latin America", "美洲", "美國", "Walmart"]) {
      const uni = run(q).recommendations.find((r) => r.cardName.includes("Unicard"));
      assert.ok(!uni || uni.rate < 4.5, `${q}：Unicard 不該是海外加碼 4.5%`);
    }
    for (const q of ["日本", "新加坡"]) {
      assert.equal(run(q).recommendations.find((r) => r.cardName.includes("Unicard")).rate, 4.5, q);
    }
  });

  test("商家查詢（台灣也有門市的日系品牌）不套用泛用海外規則", () => {
    for (const q of ["台隆手創館", "Hands", "ABC-MART", "Loft", "3COINS", "SANRIO", "KIDDY LAND", "Alpen", "UNITED ARROWS"]) {
      const { match, recommendations } = run(q);
      assert.equal(match.type, "merchant", q);
      assert.ok(recommendations.every((r) => !r.viaOverseas), q);
      assert.ok(!recommendations.some((r) => r.rate >= 4 && /uniopen|Unicard/.test(r.cardName)), `${q}：不該出現海外 11%／4.5%`);
    }
  });
});
