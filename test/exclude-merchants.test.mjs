// T20：scope.excludeMerchants
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { buildMerchantIndex } from "../src/engine/merchant-match.mjs";
import { selectBestRule } from "../src/engine/rules.mjs";
import { validate } from "../scripts/validate.mjs";

const MERCHANTS = [
  { id: "pxmart", name: "全聯", aliases: ["PX Mart"], category: "supermarket" },
  { id: "carrefour", name: "家樂福", aliases: [], category: "supermarket" },
];
const merchantIndex = buildMerchantIndex(MERCHANTS);
const rule = (id, rate, scope) => ({ id, rate, scope, validFrom: "2026-01-01", validTo: null });
const card = {
  rules: [
    rule("gen", 1, { type: "general" }),
    rule("cat", 3, { type: "category", categories: ["supermarket"], excludeMerchants: ["全聯"] }),
  ],
};
const pick = (merchantId) =>
  selectBestRule(card, { merchantId, categoryId: "supermarket", today: "2026-10-10", merchantIndex }).rule.id;

describe("selectBestRule — excludeMerchants", () => {
  test("排除名單內的商家退回 general", () => assert.equal(pick("pxmart"), "gen"));
  test("名單外同類商家照給類別回饋", () => assert.equal(pick("carrefour"), "cat"));
  test("名單用別名寫也會排除", () => {
    const c = { rules: [card.rules[0], rule("cat", 3, { type: "category", categories: ["supermarket"], excludeMerchants: ["PX Mart"] })] };
    const r = selectBestRule(c, { merchantId: "pxmart", categoryId: "supermarket", today: "2026-10-10", merchantIndex });
    assert.equal(r.rule.id, "gen");
  });
  test("general 規則也能排除，無其他規則時回 null", () => {
    const c = { rules: [rule("gen", 2, { type: "general", excludeMerchants: ["全聯"] })] };
    const args = { categoryId: null, today: "2026-10-10", merchantIndex };
    assert.equal(selectBestRule(c, { ...args, merchantId: "pxmart" }), null);
    assert.equal(selectBestRule(c, { ...args, merchantId: "carrefour" }).rule.id, "gen");
  });
});

describe("validate — excludeMerchants", () => {
  const VALID_DIR = path.join(import.meta.dirname, "fixtures", "valid");
  async function run(t, exclude) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-exclude-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
    await cp(path.join(VALID_DIR, "issuers.json"), path.join(dir, "issuers.json"));
    await mkdir(path.join(dir, "banks"));
    const bank = JSON.parse(await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8"));
    bank.cards[0].verified = true;
    const general = bank.cards[0].rules.find((r) => r.scope.type === "general");
    general.scope.excludeMerchants = exclude;
    await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank, null, 2));
    await writeFile(path.join(dir, "merchants.json"), JSON.stringify([
      { id: "pxmart", name: "全聯", aliases: ["PX Mart"], category: "supermarket" },
      { id: "seven", name: "7-ELEVEN", aliases: ["711"], category: "convenience-store" },
    ]));
    return { errors: await validate(dir), ruleId: general.id };
  }
  test("名稱對得到（含別名）通過", async (t) => assert.deepEqual((await run(t, ["全聯", "711"])).errors, []));
  test("名稱對不到：指出卡片、規則 id、商家名", async (t) => {
    const { errors, ruleId } = await run(t, ["不存在店"]);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /testbank-card-/);
    assert.ok(errors[0].includes(ruleId) && errors[0].includes("不存在店"));
  });
  test("非陣列、空陣列、空字串都報錯", async (t) => {
    for (const bad of ["全聯", [], [""]]) assert.equal((await run(t, bad)).errors.length, 1);
  });
});
