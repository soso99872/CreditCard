import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { capOnlyBonus } from "../src/ui/rate-note.mjs";

describe("src/ui/rate-note.mjs — capOnlyBonus（回饋分好幾段時不顯示「實拿約」）", () => {
  test("真資料裡各種多段寫法都算（sprint 010 主管第 2 輪點名的 6 條＋組長掃出的）", () => {
    // ctbc-uniopen 海外
    assert.equal(capOnlyBonus(["基本2%無上限，上限僅計加碼部分"]), true);
    // dbs-eco-overseas-5
    assert.equal(capOnlyBonus(["加碼4%每月上限600點，另加於原1%"]), true);
    // esun-unicard-up-overseas、ubot-linebank-online-bonus
    assert.equal(capOnlyBonus(["加碼每月上限5,000點（不含一般消費1%）"]), true);
    // firstbank-ileo-overseas
    assert.equal(capOnlyBonus(["加碼每期上限NT$200"]), true);
    // sc-beyond-overseas
    assert.equal(capOnlyBonus(["每季加碼回饋合計上限NT$3,000"]), true);
    // chb-myle、tbb-titanium
    assert.equal(capOnlyBonus(["加碼2.5%部分合併共用每月回饋上限NT$500（基本0.5%不計入）"]), true);
    assert.equal(capOnlyBonus(["額外1.5%每戶每期上限NT$100，基本回饋不計入"]), true);
    // 條件沒寫、只有 rawReward 寫
    assert.equal(capOnlyBonus([], "一般消費（不含網路消費）2倍紅利點數回饋（含原1倍）"), true);
    assert.equal(capOnlyBonus(["當日回饋上限250點"]), true);
  });
  test("單一回饋率＋上限的照常顯示（回傳 false）", () => {
    assert.equal(capOnlyBonus(["每月回饋上限NT$100", "限實體店面"]), false);
    assert.equal(capOnlyBonus(["單筆滿NT$1,500"], "魚中魚 LINE POINTS 4%，單筆滿NT$1,500，每人每月上限150"), false);
    assert.equal(capOnlyBonus([]), false);
    assert.equal(capOnlyBonus(undefined), false);
  });
});
