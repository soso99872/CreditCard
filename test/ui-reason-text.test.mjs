import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { shortReasonText } from "../src/ui/reason-text.mjs";

describe("src/ui/reason-text.mjs — shortReasonText（第 1 名收據「為什麼」：不重複回饋率百分比）", () => {
  test("matchLevel 為 merchant 時，顯示商家屬於指定通路", () => {
    assert.equal(shortReasonText("merchant", { merchantName: "全聯" }), "全聯屬於指定通路");
  });

  test("matchLevel 為 category 時，顯示依該類別回饋", () => {
    assert.equal(
      shortReasonText("category", { categoryName: "量販超市" }),
      "依「量販超市」類別回饋"
    );
  });

  test("matchLevel 為 general 時，顯示套用一般消費回饋", () => {
    assert.equal(shortReasonText("general", { merchantName: "鼎泰豐" }), "沒有指定優惠，套用一般消費回饋");
  });

  test("同一次查詢裡，不同卡的 matchLevel 各自獨立（不會被其他卡的比對層級污染）", () => {
    const match = { merchantName: "全聯", categoryName: "量販超市" };
    assert.equal(shortReasonText("merchant", match), "全聯屬於指定通路");
    assert.equal(shortReasonText("category", match), "依「量販超市」類別回饋");
    assert.equal(shortReasonText("general", match), "沒有指定優惠，套用一般消費回饋");
  });

  test("category 沒有 categoryName 時仍有合理文字，不印出 undefined", () => {
    assert.equal(shortReasonText("category", {}), "依類別回饋");
  });

  test("match 為 null／undefined 時不丟錯", () => {
    assert.equal(shortReasonText("merchant", null), "屬於指定通路");
    assert.equal(shortReasonText("general", undefined), "沒有指定優惠，套用一般消費回饋");
  });
});
