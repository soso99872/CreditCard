// sprint 010 T01：conditionTags 標註與 validate 檢查
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { validate } from "../scripts/validate.mjs";
import { tagsFor, loadRules, TAGS } from "../scripts/tag-conditions.mjs";

const VALID_DIR = path.join(import.meta.dirname, "fixtures", "valid");
const BANKS_DIR = path.join(import.meta.dirname, "..", "data", "banks");

const tag = (conditions, plan = "") => tagsFor({ id: "t", plan, conditions });

describe("tagsFor — 判斷規則", () => {
  test("放寬與否定的說法不標", () => {
    assert.deepEqual(tag(["LEVEL 1：未設定帳戶自動扣繳即享"]), []);
    assert.deepEqual(tag(["LEVEL 2：需設定台新帳戶自動扣繳（新申辦核卡60天內免設定亦享）"]), ["autopay"]);
    assert.deepEqual(tag(["需登錄（官方未寫名額限制）"]), ["register"]);
    assert.deepEqual(tag(["蝦皮購物累積消費金額未滿 NT$3,000"]), []);
  });

  test("單筆門檻：500 元以下不標，超過才標 spend", () => {
    assert.deepEqual(tag(["單筆結帳滿NT$500"]), []);
    assert.deepEqual(tag(["單筆結帳滿NT$501"]), ["spend"]);
    assert.deepEqual(tag(["單筆未滿1,000元不列入回饋"]), ["spend"]);
  });

  test("累積門檻與任務算 spend；每滿 N 元回饋、百分比不算", () => {
    assert.deepEqual(tag(["當月累積消費滿NT$3,000"]), ["spend"]);
    assert.deepEqual(tag(["需達3家不同品牌"]), ["spend"]);
    assert.deepEqual(tag(["當月累積每滿NT$100回饋1點"]), []);
    assert.deepEqual(tag(["上限只計加碼部分，超過後仍有0.5%"]), []);
  });

  test("綁定帳戶扣繳不算 register；綁定指定支付才算", () => {
    assert.deepEqual(tag(["需綁定DAWHO數位帳戶自動扣繳信用卡款"]), ["autopay"]);
    assert.deepEqual(tag(["須以LINE Pay卡綁定臺灣LINE Pay帳號"]), ["register"]);
    assert.deepEqual(tag(["限台灣Pay綁定本卡掃碼交易"]), []);
  });

  test("輸出已排序、不重複，值都在列舉內", () => {
    const tags = tag(["須同時申辦電子帳單、臺銀帳戶自動授扣並綁定台灣Pay", "當月帳單一般消費滿NT$15,000"]);
    assert.deepEqual(tags, ["autopay", "ebill", "register", "spend"]);
  });
});

describe("validate — conditionTags", () => {
  async function errorsWith(t, mutate) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-tags-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const f of ["categories.json", "issuers.json", "merchants.json"]) await cp(path.join(VALID_DIR, f), path.join(dir, f));
    await mkdir(path.join(dir, "banks"));
    const bank = JSON.parse(await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8"));
    bank.cards[0].verified = true;
    mutate(bank.cards[0].rules[0]);
    await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank, null, 2));
    return validate(dir);
  }

  test("合法：空陣列與排序正確的標籤", async (t) => {
    assert.deepEqual(await errorsWith(t, (r) => (r.conditionTags = [])), []);
    assert.deepEqual(await errorsWith(t, (r) => (r.conditionTags = ["autopay", "ebill"])), []);
  });

  test("verified 卡缺 conditionTags", async (t) => {
    const errors = await errorsWith(t, (r) => delete r.conditionTags);
    assert.ok(errors.some((e) => e.includes("缺少 conditionTags")));
  });

  test("不在列舉內、未排序、重複都報錯", async (t) => {
    for (const bad of [["vip"], ["ebill", "autopay"], ["plan", "plan"], "plan"]) {
      const errors = await errorsWith(t, (r) => (r.conditionTags = bad));
      assert.ok(errors.some((e) => e.includes("conditionTags")), JSON.stringify(bad));
    }
  });
});

describe("data/banks — 標註結果", () => {
  test("verified 規則都有 conditionTags，且與腳本結果一致", () => {
    const all = loadRules(BANKS_DIR);
    assert.ok(all.length > 0);
    for (const { rule } of all) {
      assert.ok(Array.isArray(rule.conditionTags), `${rule.id} 缺 conditionTags`);
      assert.deepEqual(rule.conditionTags, tagsFor(rule), rule.id);
      assert.ok(rule.conditionTags.every((x) => TAGS.includes(x)), rule.id);
    }
  });
});
