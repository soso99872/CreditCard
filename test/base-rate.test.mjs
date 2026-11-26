// sprint 012 T01：基本回饋 baseRate／subCaps 並行算、拆分腳本、validate 檢查
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { calcReward, estimateReward } from "../src/engine/format.mjs";
import { validate } from "../scripts/validate.mjs";
import { splitBaseRate, cappedRules } from "../scripts/split-base-rate.mjs";

const VALID_DIR = path.join(import.meta.dirname, "fixtures", "valid");
const BANKS_DIR = path.join(import.meta.dirname, "..", "data", "banks");
const cap400 = { amount: 400, unit: "TWD", period: "month" };

describe("estimateReward — 基本與加碼並行", () => {
  test("基本1%＋加碼3%（上限400元）：A＝10,000／13,334／30,000 → 400／533／700", () => {
    const at = (amount) => estimateReward({ rate: 4, baseRate: 1, amount, cap: cap400 });
    assert.deepEqual(at(10000), { amount: 400, capped: false });
    assert.deepEqual(at(13334), { amount: 533, capped: true });
    assert.deepEqual(at(30000), { amount: 700, capped: true });
  });

  test("baseRate＝0 與舊算法相同", () => {
    for (const amount of [1000, 10000, 30000]) {
      const old = estimateReward({ rate: 4, amount, cap: cap400 });
      assert.deepEqual(estimateReward({ rate: 4, baseRate: 0, amount, cap: cap400 }), old);
    }
  });

  test("沒有 baseRate（undefined 或 null）與舊算法相同", () => {
    assert.deepEqual(estimateReward({ rate: 4, amount: 30000, cap: cap400 }), { amount: 400, capped: true });
    assert.deepEqual(estimateReward({ rate: 4, baseRate: null, amount: 30000, cap: cap400 }), { amount: 400, capped: true });
    assert.deepEqual(estimateReward({ rate: 3, baseRate: null, amount: 1000, cap: null }), { amount: 30, capped: false });
  });

  test("點數上限用 twdPerPoint 換算", () => {
    const cap = { amount: 300, unit: "point", period: "month" };
    assert.deepEqual(estimateReward({ rate: 3, baseRate: 1, amount: 30000, cap, twdPerPoint: 0.5 }), { amount: 450, capped: true });
  });

  test("subCaps：滙豐 Live+ 0.88% 基本＋3% 上限888點＋1% 上限200點，A＝30,000", () => {
    const params = {
      rate: 4.88,
      baseRate: 0.88,
      subCaps: [{ rate: 1, cap: { amount: 200, unit: "point", period: "month" } }],
      cap: { amount: 888, unit: "point", period: "month" },
      amount: 30000,
      twdPerPoint: 1,
    };
    // 基本 264 ＋ min(900, 888) ＋ min(300, 200)
    assert.deepEqual(estimateReward(params), { amount: 1352, capped: true });
    // A＝10,000：基本 88 ＋ 300 ＋ 100，都沒到上限
    assert.deepEqual(estimateReward({ ...params, amount: 10000 }), { amount: 488, capped: false });
  });

  test("subCaps 兩段：凱基誠品黑卡 0.3% 基本＋2% 上限400點＋4.7% 上限4,200點（主加碼剩 0）", () => {
    const pt = (amount) => ({ amount, unit: "point", period: "month" });
    const params = { rate: 7, baseRate: 0.3, subCaps: [{ rate: 2, cap: pt(400) }, { rate: 4.7, cap: pt(4200) }], cap: pt(4600), twdPerPoint: 1 };
    // 90 ＋ min(600, 400) ＋ min(1410, 4200)
    assert.deepEqual(estimateReward({ ...params, amount: 30000 }), { amount: 1900, capped: true });
    // 300 ＋ 400 ＋ 4200
    assert.deepEqual(estimateReward({ ...params, amount: 100000 }), { amount: 4900, capped: true });
  });

  test("calcReward 回傳未四捨五入的元", () => {
    assert.ok(Math.abs(calcReward({ rate: 4, baseRate: 1, amount: 13334, cap: cap400 }).exact - 533.34) < 1e-9);
  });
});

describe("splitBaseRate — 文字拆分", () => {
  const rule = (rawReward, conditions, rate) => ({ id: "t", rawReward, conditions, rate });

  test("上限只計加碼、基本不計入 → 填基本率", () => {
    assert.equal(splitBaseRate(rule("網購加碼1%（基本1%+加碼1%=2%）", ["加碼部分合併共用每月回饋上限NT$300，基本1%不計入"], 2)).baseRate, 1);
    assert.equal(splitBaseRate(rule("加碼回饋", ["基本0.8%無上限，上限僅計加碼部分"], 2)).baseRate, 0.8);
  });

  test("明說沒有基本 → 0", () => {
    assert.equal(splitBaseRate(rule("僅5%、不含基本1%", ["上限300"], 5)).baseRate, 0);
  });

  test("上限句沒說只算加碼、或基本是否計入未明載、或接力寫法 → 不填", () => {
    assert.equal(splitBaseRate(rule("最高5%（一般1% + 加碼4%）", ["每人每月上限150點"], 5)).baseRate, null);
    assert.equal(splitBaseRate(rule("加碼5%（基本1%＋加碼5%）", ["基本1%部分是否計入共用上限官方未明載"], 6)).baseRate, null);
    assert.equal(splitBaseRate(rule("3%部分最高2,000點，超過部分以一般消費1%計", [], 3)).baseRate, null);
  });

  test("基本＋加碼對不上總回饋率（多段加碼）→ 不填", () => {
    assert.equal(splitBaseRate(rule("國內一般 1% + 集團加碼 2% + 踩點 1% = 4%", ["踩點加碼每月上限500點"], 4)).baseRate, null);
  });
});

describe("data/banks — 拆分結果", () => {
  test("寫進資料的 baseRate／subCaps 與腳本輸出一致，且有填的都在 0～rate 之間", () => {
    for (const { rule } of cappedRules(BANKS_DIR)) {
      const res = splitBaseRate(rule);
      assert.equal(rule.baseRate ?? null, res.baseRate, rule.id);
      assert.deepEqual(rule.subCaps ?? null, res.subCaps, rule.id);
      if (rule.baseRate !== undefined) assert.ok(rule.baseRate >= 0 && rule.baseRate <= rule.rate, rule.id);
    }
  });
});

describe("validate — baseRate／subCaps", () => {
  async function errorsWith(t, mutate) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-base-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const f of ["categories.json", "issuers.json", "merchants.json"]) await cp(path.join(VALID_DIR, f), path.join(dir, f));
    await mkdir(path.join(dir, "banks"));
    const bank = JSON.parse(await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8"));
    bank.cards[0].verified = true;
    const rule = bank.cards[0].rules[0];
    rule.conditionTags = [];
    rule.rate = 4;
    rule.cap = cap400;
    mutate(rule);
    await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank, null, 2));
    return validate(dir);
  }
  const sub = { rate: 1, cap: { amount: 200, unit: "TWD", period: "month" } };

  test("合法：baseRate 0、1、等於 rate；有 subCaps", async (t) => {
    for (const b of [0, 1, 4]) assert.deepEqual(await errorsWith(t, (r) => (r.baseRate = b)), [], String(b));
    assert.deepEqual(await errorsWith(t, (r) => ((r.baseRate = 1), (r.subCaps = [sub]))), []);
  });

  test("baseRate 超出 0～rate 或不是數字 → 報錯", async (t) => {
    for (const bad of [-1, 4.5, "1"]) {
      const errors = await errorsWith(t, (r) => (r.baseRate = bad));
      assert.ok(errors.some((e) => e.includes("baseRate")), JSON.stringify(bad));
    }
  });

  test("subCaps：baseRate＋Σsub.rate 超過 rate、沒 cap、沒 baseRate → 報錯", async (t) => {
    assert.ok((await errorsWith(t, (r) => ((r.baseRate = 3.5), (r.subCaps = [sub])))).some((e) => e.includes("合計不得超過")));
    assert.ok((await errorsWith(t, (r) => ((r.baseRate = 1), (r.cap = null), (r.subCaps = [sub])))).some((e) => e.includes("有 cap")));
    assert.ok((await errorsWith(t, (r) => (r.subCaps = [sub]))).some((e) => e.includes("必須填 baseRate")));
  });
});
