import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  SCOPE,
  defaultScope,
  shouldPromptEmptyMyCards,
  effectiveScope,
  truncateTop,
  parseAmount,
  GENERAL_CATEGORY_ID,
  resolveSelectedCategoryId,
  visibleMyCardIds,
} from "../src/ui/view-state.mjs";

describe("src/ui/view-state.mjs — defaultScope（AC-11a：第一次開啟預設查我的卡片）", () => {
  test("預設查詢範圍固定為「我的卡片」", () => {
    assert.equal(defaultScope(), SCOPE.MY);
  });
});

describe("src/ui/view-state.mjs — shouldPromptEmptyMyCards（AC-11b）", () => {
  test("範圍是我的卡片且清單是空的時，該顯示提示", () => {
    assert.equal(shouldPromptEmptyMyCards(SCOPE.MY, []), true);
    assert.equal(shouldPromptEmptyMyCards(SCOPE.MY, undefined), true);
  });

  test("範圍是我的卡片但清單有卡片時，不顯示提示", () => {
    assert.equal(shouldPromptEmptyMyCards(SCOPE.MY, ["card-a"]), false);
  });

  test("範圍是全部卡別時，不論我的卡片是否為空都不顯示提示", () => {
    assert.equal(shouldPromptEmptyMyCards(SCOPE.ALL, []), false);
    assert.equal(shouldPromptEmptyMyCards(SCOPE.ALL, ["card-a"]), false);
  });
});

describe("src/ui/view-state.mjs — effectiveScope（PRD v2.2、AC-11b：我的卡片是空的時候查詢，自動改用全部卡別計算）", () => {
  test("選「我的卡片」但清單是空的時，實際查詢範圍自動變成「全部卡別」", () => {
    assert.equal(effectiveScope(SCOPE.MY, []), SCOPE.ALL);
    assert.equal(effectiveScope(SCOPE.MY, undefined), SCOPE.ALL);
  });

  test("選「我的卡片」且清單有卡片時，實際查詢範圍維持「我的卡片」（AC-11a：加卡後預設只顯示我的卡片）", () => {
    assert.equal(effectiveScope(SCOPE.MY, ["card-a"]), SCOPE.MY);
  });

  test("選「全部卡別」時，不論我的卡片是否為空都維持「全部卡別」", () => {
    assert.equal(effectiveScope(SCOPE.ALL, []), SCOPE.ALL);
    assert.equal(effectiveScope(SCOPE.ALL, ["card-a"]), SCOPE.ALL);
  });
});

describe("src/ui/view-state.mjs — truncateTop（AC-01：預設前 10 名，可展開全部）", () => {
  const list = Array.from({ length: 15 }, (_, i) => `card-${i}`);

  test("預設（未按顯示全部）只取前 10 名，並標記 hasMore", () => {
    const result = truncateTop(list, false);
    assert.equal(result.visible.length, 10);
    assert.deepEqual(result.visible, list.slice(0, 10));
    assert.equal(result.hasMore, true);
    assert.equal(result.total, 15);
  });

  test("showAll 為 true 時回傳全部，且 hasMore 為 false", () => {
    const result = truncateTop(list, true);
    assert.equal(result.visible.length, 15);
    assert.equal(result.hasMore, false);
  });

  test("清單長度不超過上限時，hasMore 為 false", () => {
    const shortList = ["a", "b", "c"];
    const result = truncateTop(shortList, false);
    assert.deepEqual(result.visible, shortList);
    assert.equal(result.hasMore, false);
  });

  test("清單為空或 undefined 時不會丟錯", () => {
    assert.deepEqual(truncateTop([], false), { visible: [], hasMore: false, total: 0 });
    assert.deepEqual(truncateTop(undefined, false), { visible: [], hasMore: false, total: 0 });
  });

  test("可自訂 limit", () => {
    const result = truncateTop(list, false, 5);
    assert.equal(result.visible.length, 5);
    assert.equal(result.hasMore, true);
  });
});

describe("src/ui/view-state.mjs — parseAmount（AC-10：金額試算輸入解析）", () => {
  test("合法的數字字串轉成數字", () => {
    assert.equal(parseAmount("1000"), 1000);
    assert.equal(parseAmount("0"), 0);
    assert.equal(parseAmount("1000.5"), 1000.5);
  });

  test("空白、null、undefined 都視為未填", () => {
    assert.equal(parseAmount(""), undefined);
    assert.equal(parseAmount("   "), undefined);
    assert.equal(parseAmount(null), undefined);
    assert.equal(parseAmount(undefined), undefined);
  });

  test("非數字字串視為未填，不丟錯", () => {
    assert.equal(parseAmount("abc"), undefined);
  });

  test("負數視為未填", () => {
    assert.equal(parseAmount("-100"), undefined);
  });
});

describe("src/ui/view-state.mjs — resolveSelectedCategoryId（AC-04：查無商家、也推測不出類別時，直接以一般消費排行為保底）", () => {
  test("使用者還沒選類別時，回傳一般消費類別 id", () => {
    assert.equal(resolveSelectedCategoryId(null), GENERAL_CATEGORY_ID);
    assert.equal(resolveSelectedCategoryId(undefined), GENERAL_CATEGORY_ID);
    assert.equal(resolveSelectedCategoryId(""), GENERAL_CATEGORY_ID);
  });

  test("使用者已點類別快選鈕時，回傳該類別 id", () => {
    assert.equal(resolveSelectedCategoryId("dining"), "dining");
  });
});

describe("src/ui/view-state.mjs — visibleMyCardIds（T17：保留看不到的我的卡片 id，只在畫面上濾掉）", () => {
  const cards = [{ id: "card-a" }, { id: "card-b" }];

  test("只保留目前資料中存在的 id，看不到的（例如草稿卡）被濾掉", () => {
    assert.deepEqual(visibleMyCardIds(["card-a", "card-draft", "card-b"], cards), [
      "card-a",
      "card-b",
    ]);
  });

  test("保留原本的順序", () => {
    assert.deepEqual(visibleMyCardIds(["card-b", "card-draft", "card-a"], cards), [
      "card-b",
      "card-a",
    ]);
  });

  test("myCardIds 或 cards 為 undefined／null 時不丟錯，回傳空陣列", () => {
    assert.deepEqual(visibleMyCardIds(undefined, cards), []);
    assert.deepEqual(visibleMyCardIds(null, cards), []);
    assert.deepEqual(visibleMyCardIds(["card-a"], undefined), []);
    assert.deepEqual(visibleMyCardIds(["card-a"], null), []);
  });

  test("全部都看得到時原樣回傳（不影響既有行為）", () => {
    assert.deepEqual(visibleMyCardIds(["card-a", "card-b"], cards), ["card-a", "card-b"]);
  });
});
