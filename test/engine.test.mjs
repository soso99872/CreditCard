import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

import { normalize } from "../src/engine/normalize.mjs";
import { buildMerchantIndex, resolveMerchantId, matchMerchant } from "../src/engine/merchant-match.mjs";
import { isRuleActive, selectBestRule } from "../src/engine/rules.mjs";
import { formatRate, formatCap, formatReason, estimateReward } from "../src/engine/format.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";
import { recommend } from "../src/engine/recommend.mjs";
import { buildIndex, listBankFiles } from "../scripts/build-index.mjs";

const PRODUCT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(import.meta.dirname, "fixtures", "engine");

// 與 fixture 中的日期搭配設計過期／未開始情境的「今天」
const TODAY = "2026-10-10";

async function loadFixtureJson(...parts) {
  return JSON.parse(await readFile(path.join(FIXTURES, ...parts), "utf8"));
}

// 本測試檔共用的 fixture 資料，模擬 loadAllData() 攤平後的結果
const categories = await loadFixtureJson("categories.json");
const merchants = await loadFixtureJson("merchants.json");
const categoryKeywords = await loadFixtureJson("category-keywords.json");
const bank = await loadFixtureJson("banks", "testbank.json");
const cards = bank.cards.map((card) => ({ ...card, bankId: bank.bankId }));
const merchantIndex = buildMerchantIndex(merchants);

function findCard(id) {
  const card = cards.find((c) => c.id === id);
  if (!card) throw new Error(`fixture 找不到卡片 ${id}`);
  return card;
}

/** 建立測試用規則，帶入一般必填欄位的預設值，只需指定 id、scope、rate 等差異欄位。 */
function makeRule(overrides) {
  return {
    plan: "",
    rawReward: `${overrides.rate}%`,
    cap: null,
    conditions: [],
    validFrom: "2026-01-01",
    validTo: null,
    sourceUrl: "https://x.example.com",
    checkedAt: "2026-01-01",
    ...overrides,
  };
}

describe("src/engine/normalize.mjs", () => {
  test("全形轉半形、不分大小寫、去除空白與連字號，等義字串正規化後相同（AC-02）", () => {
    const forms = ["７－１１", "7-11", "711", " 7 - 1 1 ", "7-ELEVEN".toUpperCase()];
    // 不含「7-ELEVEN」本身因為字母不同；另外驗證 7-11 系列彼此相等
    assert.equal(normalize("７－１１"), normalize("7-11"));
    assert.equal(normalize("7-11"), normalize("711"));
    assert.equal(normalize(" 7 - 1 1 "), normalize("711"));
    assert.equal(normalize("7-ELEVEN"), normalize("7-eleven"));
  });

  test("非字串輸入視為空字串", () => {
    assert.equal(normalize(undefined), "");
    assert.equal(normalize(null), "");
    assert.equal(normalize(123), "");
  });
});

describe("src/engine/merchant-match.mjs", () => {
  test("buildMerchantIndex 把名稱與別名都索引到同一個商家", () => {
    const merchant = merchantIndex.get(normalize("全聯福利中心"));
    assert.equal(merchant.id, "pxmart");
    assert.equal(merchantIndex.get(normalize("全聯")).id, "pxmart");
    assert.equal(merchantIndex.get(normalize("PX Mart")).id, "pxmart");
  });

  test("resolveMerchantId 解析官方規則上的商家名稱；查不到回傳 null", () => {
    assert.equal(resolveMerchantId("統一超商", merchantIndex), "seven");
    assert.equal(resolveMerchantId("不存在的商家", merchantIndex), null);
  });

  test("matchMerchant 第一層：商家名稱／別名比對，不分大小寫全半形（AC-02）", () => {
    for (const query of ["7-11", "7-ELEVEN", "７－１１", "統一超商", "seven", "711"]) {
      const result = matchMerchant(query, { merchantIndex, categoryKeywords });
      assert.equal(result.type, "merchant");
      assert.equal(result.merchant.id, "seven");
    }
  });

  test("matchMerchant 第二層：名稱含類別關鍵字時推測類別（AC-03）", () => {
    const result = matchMerchant("阿明咖啡", { merchantIndex, categoryKeywords });
    assert.deepEqual(result, { type: "category-guess", categoryId: "coffee" });
  });

  test("matchMerchant 第三層：都比對不到時回傳 need-category（AC-04）", () => {
    const result = matchMerchant("不存在商店123", { merchantIndex, categoryKeywords });
    assert.deepEqual(result, { type: "need-category" });
  });

  test("matchMerchant 空白輸入回傳 empty，不丟錯誤（AC-04）", () => {
    assert.deepEqual(matchMerchant("", { merchantIndex, categoryKeywords }), { type: "empty" });
    assert.deepEqual(matchMerchant("   ", { merchantIndex, categoryKeywords }), { type: "empty" });
    assert.deepEqual(matchMerchant(undefined, { merchantIndex, categoryKeywords }), { type: "empty" });
  });
});

describe("src/engine/rules.mjs — isRuleActive", () => {
  test("validFrom 晚於今天時不生效", () => {
    assert.equal(isRuleActive({ validFrom: "2099-01-01", validTo: null }, TODAY), false);
  });

  test("validTo 早於今天時不生效（AC-12）", () => {
    assert.equal(isRuleActive({ validFrom: "2025-01-01", validTo: "2026-01-01" }, TODAY), false);
  });

  test("validTo 為 null 代表未載明結束日，一直生效", () => {
    assert.equal(isRuleActive({ validFrom: "2025-01-01", validTo: null }, TODAY), true);
  });

  test("今天剛好等於 validFrom／validTo 時生效", () => {
    assert.equal(isRuleActive({ validFrom: TODAY, validTo: null }, TODAY), true);
    assert.equal(isRuleActive({ validFrom: "2025-01-01", validTo: TODAY }, TODAY), true);
  });

  test("validFrom 為 null 時代表官方未寫起日，一律視為已生效（T11）", () => {
    assert.equal(isRuleActive({ validFrom: null, validTo: null }, TODAY), true);
    assert.equal(isRuleActive({ validFrom: null, validTo: "2025-01-01" }, TODAY), false);
  });
});

describe("src/engine/rules.mjs — selectBestRule", () => {
  test("一律取回饋率最高者：商家、類別、一般規則中商家規則回饋率最高時選商家規則", () => {
    const card = findCard("testbank-super");
    const best = selectBestRule(card, {
      merchantId: "pxmart",
      categoryId: "supermarket",
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "merchant");
    assert.equal(best.rule.id, "testbank-super-pxmart");
    assert.equal(best.rule.rate, 5);
  });

  test("已過期的商家規則不會被選中（AC-12），改選仍生效的同類規則", () => {
    const card = findCard("testbank-super");
    const best = selectBestRule(card, {
      merchantId: "pxmart",
      categoryId: "supermarket",
      today: TODAY,
      merchantIndex,
    });
    // testbank-super-pxmart-expired 回饋率 10% 更高，但已過期，不應被選中
    assert.notEqual(best.rule.id, "testbank-super-pxmart-expired");
    assert.equal(best.rule.rate, 5);
  });

  test("沒有商家比對時，改選該類別的規則", () => {
    const card = findCard("testbank-super");
    const best = selectBestRule(card, {
      merchantId: null,
      categoryId: "supermarket",
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "category");
    assert.equal(best.rule.id, "testbank-super-category");
  });

  test("沒有商家也沒有類別比對時，改選一般消費規則", () => {
    const card = findCard("testbank-super");
    const best = selectBestRule(card, {
      merchantId: null,
      categoryId: null,
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "general");
    assert.equal(best.rule.id, "testbank-super-g");
  });

  test("尚未開始的規則（validFrom 在未來）不會被選中", () => {
    const card = findCard("testbank-super");
    const best = selectBestRule(card, {
      merchantId: null,
      categoryId: null,
      today: TODAY,
      merchantIndex,
    });
    assert.notEqual(best.rule.id, "testbank-super-future");
  });

  test("沒有任何生效規則時回傳 null", () => {
    const card = { id: "empty-card", rules: [{ id: "x", scope: { type: "general" }, rate: 1, validFrom: "2099-01-01", validTo: null }] };
    const best = selectBestRule(card, { merchantId: null, categoryId: null, today: TODAY, merchantIndex });
    assert.equal(best, null);
  });

  test("(a) 商家規則 1%、類別規則 3%、一般規則 0.5% 時，一律取回饋率最高者（類別規則）", () => {
    const card = {
      id: "mix-card-a",
      name: "混合卡 A",
      bankId: "x",
      rules: [
        makeRule({
          id: "a-merchant",
          scope: { type: "merchant", merchants: ["全聯"], basis: "merchant-list" },
          rate: 1,
        }),
        makeRule({ id: "a-category", scope: { type: "category", categories: ["supermarket"] }, rate: 3 }),
        makeRule({ id: "a-general", scope: { type: "general" }, rate: 0.5 }),
      ],
    };
    const best = selectBestRule(card, {
      merchantId: "pxmart",
      categoryId: "supermarket",
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "category");
    assert.equal(best.rule.id, "a-category");
    assert.equal(best.rule.rate, 3);
  });

  test("(b) 商家規則 2%、一般規則 2%（回饋率相同）時，依具體程度選商家規則", () => {
    const card = {
      id: "mix-card-b",
      name: "混合卡 B",
      bankId: "x",
      rules: [
        makeRule({
          id: "b-merchant",
          scope: { type: "merchant", merchants: ["全聯"], basis: "merchant-list" },
          rate: 2,
        }),
        makeRule({ id: "b-general", scope: { type: "general" }, rate: 2 }),
      ],
    };
    const best = selectBestRule(card, {
      merchantId: "pxmart",
      categoryId: null,
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "merchant");
    assert.equal(best.rule.id, "b-merchant");
  });

  test("(c) 類別規則 0.5%、一般規則 1% 時選一般規則，理由要標示「一般消費」", () => {
    const card = {
      id: "mix-card-c",
      name: "混合卡 C",
      bankId: "x",
      rules: [
        makeRule({ id: "c-category", scope: { type: "category", categories: ["supermarket"] }, rate: 0.5 }),
        makeRule({ id: "c-general", scope: { type: "general" }, rate: 1 }),
      ],
    };
    const best = selectBestRule(card, {
      merchantId: null,
      categoryId: "supermarket",
      today: TODAY,
      merchantIndex,
    });
    assert.equal(best.matchLevel, "general");
    assert.equal(best.rule.id, "c-general");

    const reason = formatReason({
      matchLevel: best.matchLevel,
      displayName: "全聯",
      categoryName: "量販超市",
      rate: best.rule.rate,
    });
    assert.match(reason, /一般消費/);
  });
});

describe("src/engine/format.mjs", () => {
  test("formatRate 輸出百分比文字", () => {
    assert.equal(formatRate(3), "3%");
    assert.equal(formatRate(0.5), "0.5%");
  });

  test("formatCap：無上限、TWD、point 三種情形（AC-05）", () => {
    assert.equal(formatCap(null), "無上限");
    assert.equal(formatCap({ amount: 500, unit: "TWD", period: "per-transaction" }), "每筆交易上限 500 元");
    assert.equal(formatCap({ amount: 1000, unit: "point", period: "month" }), "每月上限 1,000 點");
  });

  test("formatReason：商家層級", () => {
    assert.equal(
      formatReason({ matchLevel: "merchant", displayName: "全聯", categoryName: "量販超市", rate: 3 }),
      "全聯屬於指定通路，回饋3%"
    );
  });

  test("formatReason：類別層級", () => {
    assert.equal(
      formatReason({ matchLevel: "category", displayName: "全聯", categoryName: "量販超市", rate: 2 }),
      "依量販超市類別回饋2%"
    );
  });

  test("formatReason：一般消費層級，必須標示「一般消費」（AC-05）", () => {
    assert.equal(
      formatReason({ matchLevel: "general", displayName: "全聯", categoryName: "量販超市", rate: 0.5 }),
      "全聯無指定優惠，以一般消費回饋0.5%"
    );
    assert.equal(
      formatReason({ matchLevel: "general", displayName: null, categoryName: "咖啡", rate: 0.5 }),
      "咖啡無指定優惠，以一般消費回饋0.5%"
    );
    assert.equal(
      formatReason({ matchLevel: "general", displayName: null, categoryName: null, rate: 0.5 }),
      "以一般消費回饋0.5%"
    );
  });

  test("estimateReward：無上限時直接四捨五入（AC-10）", () => {
    assert.deepEqual(estimateReward({ rate: 3, amount: 1000, cap: null }), { amount: 30, capped: false });
    assert.deepEqual(estimateReward({ rate: 1, amount: 999, cap: null }), { amount: 10, capped: false });
  });

  test("estimateReward：TWD 上限超過時顯示上限並標記 capped", () => {
    assert.deepEqual(
      estimateReward({ rate: 5, amount: 10000, cap: { amount: 200, unit: "TWD", period: "month" } }),
      { amount: 200, capped: true }
    );
  });

  test("estimateReward：point 上限依 twdPerPoint 換算後比較", () => {
    assert.deepEqual(
      estimateReward({
        rate: 5,
        amount: 10000,
        cap: { amount: 100, unit: "point", period: "month" },
        twdPerPoint: 2,
      }),
      { amount: 200, capped: true }
    );
  });

  test("estimateReward：試算值未超過上限時不標記 capped", () => {
    assert.deepEqual(
      estimateReward({ rate: 1, amount: 1000, cap: { amount: 500, unit: "TWD", period: "month" } }),
      { amount: 10, capped: false }
    );
  });
});

describe("src/engine/recommend.mjs", () => {
  test("空白查詢回傳 empty，不產生推薦清單，也不報錯（AC-04）", () => {
    const { match, recommendations } = recommend({
      query: "",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.deepEqual(match, { type: "empty" });
    assert.deepEqual(recommendations, []);
  });

  test("第一層比對：商家名稱／別名完全相同時，所有別名得到完全相同的推薦清單（AC-02）", () => {
    const queries = ["全聯", "全聯福利中心", "PX Mart"];
    const results = queries.map((query) =>
      recommend({ query, cards, merchants, categoryKeywords, categories, today: TODAY })
    );
    for (const result of results) {
      assert.equal(result.match.type, "merchant");
      assert.equal(result.match.merchantName, "全聯");
      assert.deepEqual(result.recommendations, results[0].recommendations);
    }

    // 商家規則優先於一般規則，且排除過期的高回饋規則（AC-12）
    const [{ recommendations }] = results;
    const superEntry = recommendations.find((r) => r.cardId === "testbank-super");
    assert.equal(superEntry.matchLevel, "merchant");
    assert.equal(superEntry.rate, 5); // 不是已過期的 10%
    assert.equal(superEntry.reason, "全聯屬於指定通路，回饋5%");

    // 依回饋率由高到低排序
    assert.deepEqual(recommendations.map((r) => r.cardId), [
      "testbank-mycard-excluded",
      "testbank-super",
      "testbank-general",
    ]);
  });

  test("7-11 系列別名也得到完全相同的推薦清單（AC-02）", () => {
    const queries = ["7-11", "7-ELEVEN", "７－１１", "統一超商", "seven", "711"];
    const results = queries.map((query) =>
      recommend({ query, cards, merchants, categoryKeywords, categories, today: TODAY })
    );
    for (const result of results) {
      assert.deepEqual(result.recommendations, results[0].recommendations);
    }
    const [{ recommendations }] = results;
    const generalCard = recommendations.find((r) => r.cardId === "testbank-general");
    assert.equal(generalCard.matchLevel, "merchant");
    assert.equal(generalCard.rate, 4);
    assert.equal(generalCard.capText, "每月上限 1,000 元");
    assert.deepEqual(generalCard.conditions, ["限實體門市"]);
  });

  test("第二層比對：名稱含類別關鍵字時推測類別並附上推薦清單（AC-03）", () => {
    const { match, recommendations } = recommend({
      query: "阿明咖啡",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.deepEqual(match, { type: "category-guess", categoryId: "coffee", categoryName: "咖啡", query: "阿明咖啡" });

    const superEntry = recommendations.find((r) => r.cardId === "testbank-super");
    assert.equal(superEntry.matchLevel, "category");
    assert.equal(superEntry.reason, "依咖啡類別回饋1.5%");

    const generalEntry = recommendations.find((r) => r.cardId === "testbank-general");
    assert.equal(generalEntry.matchLevel, "general");
    assert.equal(generalEntry.reason, "阿明咖啡無指定優惠，以一般消費回饋0.5%");
  });

  test("第三層：都比對不到時回傳 need-category，不產生推薦清單；選擇類別後才計算（AC-04）", () => {
    const first = recommend({
      query: "不存在商店123",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.deepEqual(first.match, { type: "need-category", query: "不存在商店123" });
    assert.deepEqual(first.recommendations, []);

    const second = recommend({
      query: "不存在商店123",
      selectedCategoryId: "dining",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.equal(second.match.type, "category-selected");
    assert.equal(second.match.categoryId, "dining");
    assert.equal(second.recommendations.length, 3);
    assert.ok(second.recommendations.every((r) => r.matchLevel === "general"));
    assert.deepEqual(second.recommendations.map((r) => r.cardId), [
      "testbank-mycard-excluded",
      "testbank-general",
      "testbank-super",
    ]);
  });

  test("金額試算：四捨五入，超過上限時顯示上限並標記 capped（AC-10）", () => {
    const { recommendations } = recommend({
      query: "全聯",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
      amount: 10000,
    });
    const superEntry = recommendations.find((r) => r.cardId === "testbank-super");
    assert.equal(superEntry.estimatedAmount, 200); // 5% * 10000 = 500，超過 point 上限換算後的 200 元
    assert.equal(superEntry.capped, true);

    const generalEntry = recommendations.find((r) => r.cardId === "testbank-general");
    assert.equal(generalEntry.estimatedAmount, 50); // 0.5% * 10000，無上限
    assert.equal(generalEntry.capped, false);
  });

  test("不帶 amount 時不附上金額試算欄位", () => {
    const { recommendations } = recommend({
      query: "全聯",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    for (const entry of recommendations) {
      assert.equal("estimatedAmount" in entry, false);
      assert.equal("capped" in entry, false);
    }
  });

  test("「我的卡片」篩選：只計算指定的卡片 id（AC-11a）", () => {
    const { recommendations } = recommend({
      query: "全聯",
      cards,
      merchants,
      categoryKeywords,
      categories,
      cardIds: ["testbank-general", "testbank-super"],
      today: TODAY,
    });
    assert.deepEqual(recommendations.map((r) => r.cardId).sort(), ["testbank-general", "testbank-super"]);
    assert.equal(recommendations[0].cardId, "testbank-super");
    assert.equal(recommendations[0].rate, 5);
  });

  test("回饋率相同時依卡名排序，結果穩定", () => {
    const tieCards = [
      {
        id: "b-card",
        name: "B 卡",
        bankId: "x",
        verified: true,
        rules: [
          {
            id: "b-g",
            scope: { type: "general" },
            rate: 1,
            rawReward: "1%",
            cap: null,
            conditions: [],
            validFrom: "2026-01-01",
            validTo: null,
            sourceUrl: "https://x.example.com",
            checkedAt: "2026-01-01",
          },
        ],
      },
      {
        id: "a-card",
        name: "A 卡",
        bankId: "x",
        verified: true,
        rules: [
          {
            id: "a-g",
            scope: { type: "general" },
            rate: 1,
            rawReward: "1%",
            cap: null,
            conditions: [],
            validFrom: "2026-01-01",
            validTo: null,
            sourceUrl: "https://x.example.com",
            checkedAt: "2026-01-01",
          },
        ],
      },
    ];
    const { recommendations } = recommend({
      query: "xyz",
      selectedCategoryId: "dining",
      cards: tieCards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.deepEqual(recommendations.map((r) => r.cardId), ["a-card", "b-card"]);
  });

  test("預設只使用 verified 的卡，草稿卡（verified 缺少或不是 true）不出現在推薦裡（T14）", () => {
    const { recommendations } = recommend({
      query: "xyz",
      selectedCategoryId: "dining",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
    });
    assert.ok(!recommendations.some((r) => r.cardId === "testbank-draft"));
  });

  test("includeUnverified: true 時，草稿卡也納入推薦（T14）", () => {
    const { recommendations } = recommend({
      query: "xyz",
      selectedCategoryId: "dining",
      cards,
      merchants,
      categoryKeywords,
      categories,
      today: TODAY,
      includeUnverified: true,
    });
    const draftEntry = recommendations.find((r) => r.cardId === "testbank-draft");
    assert.ok(draftEntry);
    assert.equal(draftEntry.rate, 50);
    // 草稿卡回饋率最高，有 includeUnverified 時應排在第一名
    assert.equal(recommendations[0].cardId, "testbank-draft");
  });

  test("「我的卡片」篩選與 verified 過濾同時生效：即使指定了草稿卡的 id，預設仍不會出現（T14）", () => {
    const { recommendations } = recommend({
      query: "xyz",
      selectedCategoryId: "dining",
      cards,
      merchants,
      categoryKeywords,
      categories,
      cardIds: ["testbank-draft", "testbank-general"],
      today: TODAY,
    });
    assert.deepEqual(recommendations.map((r) => r.cardId), ["testbank-general"]);
  });
});

describe("src/engine/data-loader.mjs", () => {
  async function fetchJsonFromFixtures(url) {
    return JSON.parse(await readFile(path.join(FIXTURES, url), "utf8"));
  }

  test("loadAllData 載入所有資料並把各銀行的卡片攤平成一個陣列", async () => {
    const data = await loadAllData({ baseUrl: "", fetchJson: fetchJsonFromFixtures });

    assert.ok(Array.isArray(data.categories) && data.categories.length > 0);
    assert.ok(Array.isArray(data.issuers) && data.issuers.length === 1);
    assert.ok(Array.isArray(data.merchants) && data.merchants.length === 2);
    assert.ok(Array.isArray(data.categoryKeywords.coffee));
    assert.ok(Array.isArray(data.cards) && data.cards.length === 3);
    assert.ok(data.cards.every((c) => c.bankId === "testbank"));
    assert.ok(data.cards.some((c) => c.id === "testbank-super"));
  });

  test("注入的 fetchJson 失敗時，錯誤往外丟", async () => {
    const failing = async () => {
      throw new Error("載入失敗");
    };
    await assert.rejects(() => loadAllData({ baseUrl: "", fetchJson: failing }));
  });

  test("預設只回傳 verified 的卡，草稿卡不出現在 cards 裡（T14）", async () => {
    const data = await loadAllData({ baseUrl: "", fetchJson: fetchJsonFromFixtures });
    assert.equal(data.cards.length, 3);
    assert.ok(!data.cards.some((c) => c.id === "testbank-draft"));
  });

  test("includeUnverified: true 時，草稿卡也會出現在 cards 裡（T14）", async () => {
    const data = await loadAllData({
      baseUrl: "",
      fetchJson: fetchJsonFromFixtures,
      includeUnverified: true,
    });
    assert.equal(data.cards.length, 4);
    assert.ok(data.cards.some((c) => c.id === "testbank-draft"));
  });
});

describe("scripts/build-index.mjs", () => {
  test("listBankFiles：目錄不存在回傳空陣列；存在時回傳排序後的檔名", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-index-"));
    t.after(() => rm(dir, { recursive: true, force: true }));

    assert.deepEqual(await listBankFiles(dir), []);

    await mkdir(path.join(dir, "banks"));
    await writeFile(path.join(dir, "banks", "b.json"), "{}");
    await writeFile(path.join(dir, "banks", "a.json"), "{}");
    assert.deepEqual(await listBankFiles(dir), ["a.json", "b.json"]);
  });

  test("buildIndex 寫入 data/index.json 並回傳內容", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-index-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await mkdir(path.join(dir, "banks"));
    await writeFile(path.join(dir, "banks", "cathay.json"), "{}");

    const index = await buildIndex(dir);
    assert.deepEqual(index, { banks: ["cathay.json"] });

    const written = JSON.parse(await readFile(path.join(dir, "index.json"), "utf8"));
    assert.deepEqual(written, { banks: ["cathay.json"] });
  });

  test("CLI：執行後印出產生結果", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-index-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await mkdir(path.join(dir, "banks"));
    await writeFile(path.join(dir, "banks", "cathay.json"), "{}");

    const stdout = execFileSync(
      process.execPath,
      [path.join(PRODUCT_ROOT, "scripts", "build-index.mjs"), dir],
      { encoding: "utf8" }
    );
    assert.match(stdout, /index\.json/);
    assert.match(stdout, /共 1 個銀行檔/);
  });
});
