import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { capOnlyBonus } from "../src/ui/rate-note.mjs";

describe("src/ui/rate-note.mjs — capOnlyBonus（上限只算加碼時不顯示「實拿約」）", () => {
  test("條件寫「上限僅計加碼部分」「上限只算加碼」「加碼部分」都算", () => {
    assert.equal(capOnlyBonus(["基本2%無上限，上限僅計加碼部分"]), true);
    assert.equal(capOnlyBonus(["限週六", "上限只算加碼"]), true);
    assert.equal(capOnlyBonus(["加碼部分合併共用每月回饋上限NT$300，基本1%不計入"]), true);
    // 真資料裡的其他寫法（sprint 010 組長掃出 45 條原本比對不到）
    assert.equal(capOnlyBonus(["加碼2.5%部分合併共用每月回饋上限NT$500（基本0.5%不計入）"]), true);
    assert.equal(capOnlyBonus(["上限只計加碼4%部分：綠色通路加碼共用每期帳單回饋上限NT$300"]), true);
    assert.equal(capOnlyBonus(["額外3%部分每月回饋上限NT$200"]), true);
    assert.equal(capOnlyBonus(["加碼5%部分每月上限NT$200"]), true);
    assert.equal(capOnlyBonus(["額外1.5%每戶每期上限NT$100，基本回饋不計入"]), true);
    assert.equal(capOnlyBonus(["加碼2%每月上限400點，另加於基本0.3%（合計2.3%）"]), true);
    assert.equal(capOnlyBonus(["基本1.2%之外的加碼10%每戶每年回饋上限NT$30,000"]), true);
    assert.equal(capOnlyBonus(["超過上限的部分改以一般消費1%計"]), true);
  });
  test("一般「5% 上限 100 元」的條件照常顯示（回傳 false）", () => {
    assert.equal(capOnlyBonus(["每月回饋上限NT$100", "限實體店面"]), false);
    assert.equal(capOnlyBonus([]), false);
    assert.equal(capOnlyBonus(undefined), false);
  });
});
