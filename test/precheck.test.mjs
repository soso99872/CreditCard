import { test } from "node:test";
import assert from "node:assert/strict";
import { precheckBank } from "../scripts/precheck.mjs";

function bank(rules, cardExtra = {}) {
  return { bankId: "demo", cards: [{ id: "demo-card", ...cardExtra, rules }] };
}

const general = { id: "g", scope: { type: "general" }, rate: 0.5, rawReward: "一般消費 0.5%", cap: null, conditions: [], validTo: null };

test("乾淨的規則沒有疑點", () => {
  const r = precheckBank(bank([general, { ...general, id: "o", scope: { type: "category", categories: ["overseas"] }, rate: 2, rawReward: "海外 2%，無上限" }]));
  assert.deepEqual(r.issues, []);
  assert.deepEqual(r.hints, []);
});

test("只有一般消費的卡列為提示，不是疑點", () => {
  const r = precheckBank(bank([general]));
  assert.equal(r.issues.length, 0);
  assert.equal(r.hints.length, 1);
});

test("rawReward 提到登錄但 conditions 沒寫", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "category", categories: ["dining"] }, rate: 3, rawReward: "需登錄，餐飲 3%" }]));
  assert.match(r.issues.join(), /登錄/);
});

test("category 規則原文提到指定通路", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "category", categories: ["dining"] }, rate: 3, rawReward: "指定餐廳 3%" }]));
  assert.match(r.issues.join(), /應改用 merchant/);
});

test("有日期但 validTo 為 null、提到上限但 cap 為 null", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "merchant", merchants: ["全聯"] }, rate: 3, rawReward: "2026/12/31 前 3%，每月上限 300 元" }]));
  assert.match(r.issues.join(), /validTo/);
  assert.match(r.issues.join(), /cap 為 null/);
});

test("「無上限」不算提到上限", () => {
  const r = precheckBank(bank([{ ...general, rawReward: "一般消費 0.5%，回饋無上限" }]));
  assert.doesNotMatch(r.issues.join(), /cap/);
});

test("現金回饋的 rate 不在原文數字中", () => {
  const r = precheckBank(bank([{ ...general, rate: 1.2, rawReward: "基本 1% 加碼 0.2%" }]));
  assert.match(r.issues.join(), /推算或加總/);
});

test("點數卡不做 rate 與原文數字比對", () => {
  const r = precheckBank(bank([{ ...general, rate: 1.2, rawReward: "每 100 元 1 點" }], { pointValue: { twdPerPoint: 1.2 } }));
  assert.doesNotMatch(r.issues.join(), /推算或加總/);
});

test("merchant 規則沒有商家", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "merchant", merchants: [] }, rate: 3, rawReward: "3%" }]));
  assert.match(r.issues.join(), /沒有列出商家/);
});
