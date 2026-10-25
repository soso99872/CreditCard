import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { findMerchantSuggestions } from "../src/ui/suggest.mjs";

const merchants = [
  { id: "pxmart", name: "全聯", aliases: ["全聯福利中心", "PX Mart"] },
  { id: "seven", name: "統一超商", aliases: ["7-11", "7-ELEVEN", "７－１１", "seven", "711"] },
  { id: "starbucks", name: "星巴克", aliases: ["Starbucks"] },
];

describe("src/ui/suggest.mjs — findMerchantSuggestions（AC-17：輸入時即時顯示商家建議）", () => {
  test("輸入字串含在商家名稱中就列入建議（例：「全」→「全聯」）", () => {
    const result = findMerchantSuggestions("全", merchants);
    assert.deepEqual(result.map((m) => m.id), ["pxmart"]);
  });

  test("別名也會比對（含全半形、大小寫正規化）", () => {
    assert.deepEqual(findMerchantSuggestions("seven", merchants).map((m) => m.id), ["seven"]);
    assert.deepEqual(findMerchantSuggestions("ＳＥＶＥＮ", merchants).map((m) => m.id), ["seven"]);
    assert.deepEqual(findMerchantSuggestions("7-11", merchants).map((m) => m.id), ["seven"]);
  });

  test("查無相符商家時回傳空陣列", () => {
    assert.deepEqual(findMerchantSuggestions("鼎泰豐", merchants), []);
  });

  test("空白、純空格輸入回傳空陣列，不報錯", () => {
    assert.deepEqual(findMerchantSuggestions("", merchants), []);
    assert.deepEqual(findMerchantSuggestions("   ", merchants), []);
    assert.deepEqual(findMerchantSuggestions(null, merchants), []);
    assert.deepEqual(findMerchantSuggestions(undefined, merchants), []);
  });

  test("最多回傳 limit 筆（預設 8）", () => {
    const manyMerchants = Array.from({ length: 20 }, (_, i) => ({ id: `shop-${i}`, name: `測試商店${i}` }));
    const result = findMerchantSuggestions("測試商店", manyMerchants);
    assert.equal(result.length, 8);
  });

  test("可自訂 limit", () => {
    const manyMerchants = Array.from({ length: 20 }, (_, i) => ({ id: `shop-${i}`, name: `測試商店${i}` }));
    const result = findMerchantSuggestions("測試商店", manyMerchants, 3);
    assert.equal(result.length, 3);
  });

  test("merchants 為 undefined 時不會丟錯", () => {
    assert.deepEqual(findMerchantSuggestions("全聯", undefined), []);
  });
});

import { findSuggestions } from "../src/ui/suggest.mjs";

describe("src/ui/suggest.mjs — findSuggestions（T19：建議清單同時列商家與類別）", () => {
  const categories = [
    { id: "coffee", name: "咖啡" },
    { id: "general", name: "一般消費" },
    { id: "dining", name: "餐飲" },
  ];
  const shops = [
    { id: "starbucks", name: "星巴克", aliases: [] },
    { id: "louisa", name: "路易莎咖啡", aliases: [] },
  ];

  test("輸入「咖啡」：類別「咖啡」排在商家前面", () => {
    const result = findSuggestions("咖啡", shops, categories);
    assert.deepEqual(result.map((r) => `${r.kind}:${r.name}`), ["category:咖啡", "merchant:路易莎咖啡"]);
    assert.equal(result[0].id, "coffee");
  });

  test("「一般消費」是保底狀態，不列入建議", () => {
    assert.deepEqual(findSuggestions("一般", shops, categories), []);
  });

  test("空白輸入回傳空陣列；總數不超過 limit", () => {
    assert.deepEqual(findSuggestions("  ", shops, categories), []);
    assert.equal(findSuggestions("咖啡", shops, categories, 1).length, 1);
  });
});
