import { test } from "node:test";
import assert from "node:assert/strict";
import { precheckBank } from "../scripts/precheck.mjs";

function bank(rules, cardExtra = {}) {
  return { bankId: "demo", cards: [{ id: "demo-card", ...cardExtra, rules }] };
}

const general = { id: "g", scope: { type: "general" }, rate: 0.5, rawReward: "一般消費 0.5%", cap: null, conditions: [], validTo: null };

test("乾淨的規則沒有疑點", () => {
  const r = precheckBank(bank([general, { ...general, id: "o", scope: { type: "category", categories: ["overseas"], basis: "mcc" }, rate: 2, rawReward: "海外 2%，無上限" }]));
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

test("category 規則沒寫 basis（T14 加回的檢查）", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "category", categories: ["dining"] }, rate: 3, rawReward: "餐飲 3%" }]));
  assert.match(r.issues.join(), /scope\.basis/);
});

test("category 規則有寫 basis 時不算疑點（T14）", () => {
  const r = precheckBank(bank([general, { ...general, id: "x", scope: { type: "category", categories: ["dining"], basis: "mcc" }, rate: 3, rawReward: "餐飲 3%" }]));
  assert.doesNotMatch(r.issues.join(), /scope\.basis/);
});

test("每滿 NT$X 累積 1 點的基本累點寫法不算滿額門檻（T14 排除誤報）", () => {
  const r = precheckBank(bank([{ ...general, rawReward: "每滿 NT$30 累積 1 點" }]));
  assert.doesNotMatch(r.issues.join(), /滿額門檻/);
});

test("基本累點寫法以外，真正的滿額加碼條件仍要抓出來（T14）", () => {
  const r = precheckBank(bank([
    general,
    { ...general, id: "x", scope: { type: "category", categories: ["dining"], basis: "mcc" }, rate: 3, rawReward: "每滿 NT$30 累積 1 點，單筆消費滿 1000 元加碼 3%" },
  ]));
  assert.match(r.issues.join(), /滿額門檻/);
});

test("每滿NT$30累積活利積分1點（累積動詞與點數間夾點數名稱）不算滿額門檻（T16）", () => {
  const r = precheckBank(bank([{ ...general, rawReward: "每滿NT$30累積活利積分1點" }]));
  assert.doesNotMatch(r.issues.join(), /滿額門檻/);
});

test("一般消費每滿NT$1,000送100點，「送」不是基本累點動詞，仍要報滿額門檻（T16）", () => {
  const r = precheckBank(bank([{ ...general, rawReward: "一般消費每滿NT$1,000送100點" }]));
  assert.match(r.issues.join(), /滿額門檻/);
});

test("活動期間每滿 3,000 元可享 300 點加碼，「可享」不是基本累點動詞，仍要報滿額門檻（T16）", () => {
  const r = precheckBank(bank([{ ...general, rawReward: "活動期間每滿 3,000 元可享 300 點加碼" }]));
  assert.match(r.issues.join(), /滿額門檻/);
});
