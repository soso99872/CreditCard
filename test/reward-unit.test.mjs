// sprint 012 T09：回饋單位 rewardUnit
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { unitOf, cardUnit, loadCards, CASH_UNITS } from "../scripts/reward-unit.mjs";

const BANKS_DIR = path.join(import.meta.dirname, "..", "data", "banks");

test("unitOf：原文寫法對到單位，錯字照正確寫法", () => {
  assert.equal(unitOf("一般消費享 0.3% 台新Piont(信用卡)"), "台新Point");
  assert.equal(unitOf("1% LINE POINTS"), "LINE POINTS");
  assert.equal(unitOf("每月刷卡金額未滿1萬元回饋千分之一"), null);
  assert.equal(unitOf("國內消費0.5%回饋"), null);
});

test("cardUnit：判斷不了不猜", () => {
  const card = { id: "x", rules: [{ scope: { type: "general" }, rawReward: "國內0.8%回饋" }] };
  assert.equal(cardUnit(card).unit, null);
});

test("資料：已填的 rewardUnit 與腳本結果一致，點數卡單位與 pointValue.unit 相同", () => {
  const all = loadCards(BANKS_DIR);
  assert.equal(all.length, 162);
  for (const { card } of all) {
    const { unit } = cardUnit(card);
    assert.equal(card.rewardUnit ?? null, unit, card.id);
    if (card.pointValue) assert.equal(card.rewardUnit, card.pointValue.unit, card.id);
  }
  assert.equal(all.find((x) => x.card.id === "cathay-cube").card.rewardUnit, "小樹點");
  assert.ok(CASH_UNITS.has("現金回饋"));
});
