import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { rewardUnitOf, rateUnitText, gainText } from "../src/ui/reward-text.mjs";

const rec = { plan: "", rate: 3, rawReward: "3% 小樹點" };

describe("src/ui/reward-text.mjs — 回饋單位（sprint 012 T11）", () => {
  test("卡層單位；pointValue 講同一個單位才帶 twdPerPoint", () => {
    const card = { rewardUnit: "活利積分", pointValue: { unit: "活利積分", twdPerPoint: 0.04 }, rules: [{ rate: 3, rawReward: "3% 小樹點" }] };
    assert.deepEqual(rewardUnitOf(rec, card), { unit: "活利積分", cash: false, twdPerPoint: 0.04 });
  });

  test("規則層 rewardUnit 優先，卡的 pointValue 是別的單位時不沿用換算", () => {
    const r = { plan: "", rate: 3, rawReward: "3% mo幣" };
    const card = { rewardUnit: "現金回饋", pointValue: { unit: "紅利點數", twdPerPoint: 0.1 }, rules: [{ rate: 1, rawReward: "1%" }, { rate: 3, rawReward: "3% mo幣", rewardUnit: "mo幣" }] };
    assert.deepEqual(rewardUnitOf(r, card), { unit: "mo幣", cash: false, twdPerPoint: null });
  });

  test("沒有單位不猜；找不到卡也不丟錯", () => {
    assert.deepEqual(rewardUnitOf(rec, { rules: [] }), { unit: null, cash: false, twdPerPoint: null });
    assert.equal(rewardUnitOf(rec, undefined).unit, null);
  });

  test("回饋率後面的單位字", () => {
    assert.equal(rateUnitText({ unit: "現金回饋", cash: true, twdPerPoint: null }), "現金回饋");
    assert.equal(rateUnitText({ unit: "小樹點", cash: false, twdPerPoint: null }), "小樹點");
    assert.equal(rateUnitText({ unit: "OPENPOINT", cash: false, twdPerPoint: 1 }), "OPENPOINT");
    assert.equal(rateUnitText({ unit: "活利積分", cash: false, twdPerPoint: 0.04 }), "等值活利積分");
    assert.equal(rateUnitText({ unit: null, cash: false, twdPerPoint: null }), "");
  });

  test("試算：現金、沒單位寫新台幣；點數知道換算寫點數＋約新台幣；不知道換算寫等值", () => {
    assert.equal(gainText(1200, { unit: "現金回饋", cash: true, twdPerPoint: null }), "回饋約 NT$1,200");
    assert.equal(gainText(300, { unit: null, cash: false, twdPerPoint: null }, true), "回饋約 NT$300（已達上限）");
    assert.equal(gainText(300, { unit: "活利積分", cash: false, twdPerPoint: 0.04 }), "回饋約 7,500 活利積分（約 NT$300）");
    assert.equal(gainText(490, { unit: "現金點", cash: false, twdPerPoint: 1 }, true), "回饋約 490 現金點（約 NT$490，已達上限）");
    assert.equal(gainText(900, { unit: "小樹點", cash: false, twdPerPoint: null }), "回饋約 NT$900 等值小樹點");
    assert.equal(gainText(300, { unit: "LINE POINTS", cash: false, twdPerPoint: null }), "回饋約 NT$300 等值 LINE POINTS");
  });
});
