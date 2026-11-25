import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { capOnlyBonus } from "../src/ui/rate-note.mjs";

describe("src/ui/rate-note.mjs — capOnlyBonus（上限只算加碼時不顯示「實拿約」）", () => {
  test("條件寫「上限僅計加碼部分」「上限只算加碼」「加碼部分」都算", () => {
    assert.equal(capOnlyBonus(["基本2%無上限，上限僅計加碼部分"]), true);
    assert.equal(capOnlyBonus(["限週六", "上限只算加碼"]), true);
    assert.equal(capOnlyBonus(["加碼部分合併共用每月回饋上限NT$300，基本1%不計入"]), true);
  });
  test("一般「5% 上限 100 元」的條件照常顯示（回傳 false）", () => {
    assert.equal(capOnlyBonus(["每月回饋上限NT$100", "限實體店面"]), false);
    assert.equal(capOnlyBonus([]), false);
    assert.equal(capOnlyBonus(undefined), false);
  });
});
