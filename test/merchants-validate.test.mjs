// T08 v2.5：validate 的商家庫檢查
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { validate } from "../scripts/validate.mjs";

const VALID_DIR = path.join(import.meta.dirname, "fixtures", "valid");
const MERCHANTS = [
  { id: "pxmart", name: "全聯", aliases: ["PX Mart"], category: "supermarket" },
  { id: "seven", name: "7-ELEVEN", aliases: ["711"], category: "convenience-store" },
];

/** valid fixture 的卡片改成 verified，並寫入 merchants.json（merchants 為 null 代表不寫檔）。 */
async function makeDir(t, merchants, { verified = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-merchants-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
  await cp(path.join(VALID_DIR, "issuers.json"), path.join(dir, "issuers.json"));
  await mkdir(path.join(dir, "banks"));
  const bank = JSON.parse(await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8"));
  bank.cards[0].verified = verified;
  await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank, null, 2));
  if (merchants) await writeFile(path.join(dir, "merchants.json"), JSON.stringify(merchants, null, 2));
  return dir;
}

describe("validate — 商家庫", () => {
  test("合法：規則商家對得上", async (t) => {
    assert.deepEqual(await validate(await makeDir(t, MERCHANTS)), []);
  });

  test("拿掉被規則用到的商家：指出卡片與規則 id 與商家名", async (t) => {
    const errors = await validate(await makeDir(t, [MERCHANTS[1]]));
    assert.equal(errors.length, 1);
    assert.match(errors[0], /testbank-card-pxmart/);
    assert.match(errors[0], /全聯/);
  });

  test("用別名也算對得上（正規化後比對）", async (t) => {
    const merchants = [{ ...MERCHANTS[0], name: "全聯福利中心", aliases: ["ＰＸ　Mart", "全聯"] }];
    assert.deepEqual(await validate(await makeDir(t, merchants)), []);
  });

  test("verified 卡有 merchant 規則但沒有 merchants.json：失敗", async (t) => {
    const errors = await validate(await makeDir(t, null));
    assert.ok(errors.some((e) => e.includes("merchants.json")));
  });

  test("草稿卡不檢查商家對應", async (t) => {
    assert.deepEqual(await validate(await makeDir(t, [MERCHANTS[1]], { verified: false })), []);
  });

  test("id 重複、無效類別、general 類別、正規化名稱重複都要報", async (t) => {
    const errors = await validate(
      await makeDir(t, [
        MERCHANTS[0],
        { id: "pxmart", name: "全聯2", aliases: [], category: "supermarket" },
        { id: "x1", name: "甲", aliases: [], category: "no-such" },
        { id: "x2", name: "乙", aliases: [], category: "general" },
        { id: "x3", name: "px mart", aliases: [], category: "supermarket" },
      ])
    );
    assert.ok(errors.some((e) => e.includes("id 重複")));
    assert.ok(errors.some((e) => e.includes("no-such")));
    assert.ok(errors.some((e) => e.includes("general")));
    assert.ok(errors.some((e) => e.includes("與商家 pxmart")));
  });
});
