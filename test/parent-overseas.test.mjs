// T22：商家境內／境外欄位、上位類別規則套到下位類別、validate 對 overseas／parent 的檢查
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, rm, cp, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { recommend } from "../src/engine/recommend.mjs";
import { selectBestRule } from "../src/engine/rules.mjs";
import { buildMerchantIndex } from "../src/engine/merchant-match.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";
import { validate } from "../scripts/validate.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const TODAY = "2026-10-31";
const data = await loadAllData({
  baseUrl: "data/",
  fetchJson: async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8")),
});
const run = (query, extra = {}) => recommend({ ...data, query, today: TODAY, ...extra });

describe("台灣有門市的日系品牌是境內商家", () => {
  for (const q of ["HANDS", "Loft", "ABC-MART"]) {
    test(`${q} 不出現日韓限定回饋（簡單卡 8%、小小兵 7.234%）`, () => {
      const { match, recommendations } = run(q);
      assert.equal(match.categoryId, "department-store");
      assert.ok(!recommendations.some((r) => (r.cardId === "scsb-visa-simple" || r.cardId === "scsb-minions") && r.rate >= 7));
    });
  }
});

describe("真海外商家放開泛用海外規則", () => {
  test("Harrods 出現 CUBE 3.3%，且標 viaOverseas", () => {
    const cube = run("Harrods").recommendations.find((r) => r.cardId === "cathay-cube");
    assert.equal(cube.rate, 3.3);
    assert.equal(cube.viaOverseas, true);
  });
  test("沒標 overseas 的地區分類商家（Olive Young）仍不套泛用海外規則", () => {
    assert.ok(!run("Olive Young").recommendations.some((r) => r.viaOverseas));
  });
  test("商家標 overseas 仍照 excludeRegions", () => {
    const card = { rules: [{ id: "o", scope: { type: "category", categories: ["overseas"], excludeRegions: ["europe"] }, rate: 4 }] };
    const args = { merchantId: "h", categoryId: "europe", today: TODAY, merchantIndex: new Map(), merchantOverseas: true };
    assert.equal(selectBestRule(card, args), null);
    assert.equal(selectBestRule(card, { ...args, categoryId: "japan" }).rule.id, "o");
    assert.equal(selectBestRule(card, { ...args, categoryId: "japan", merchantOverseas: false }), null);
  });
});

describe("上位類別規則套到下位類別", () => {
  const rule = (id, categories, rate, extra = {}) => ({ id, scope: { type: "category", categories, ...extra }, rate });
  const ctx = (extra) => ({ merchantId: null, categoryId: "coffee", today: TODAY, merchantIndex: new Map(), parentIds: ["dining"], ...extra });

  test("只標餐飲的規則會套到咖啡；沒帶 parentIds 時不會", () => {
    const card = { rules: [rule("d", ["dining"], 6)] };
    assert.equal(selectBestRule(card, ctx()).rule.id, "d");
    assert.equal(selectBestRule(card, ctx({ parentIds: [] })), null);
  });
  test("同率時下位專屬優先；上位較高時用上位", () => {
    assert.equal(selectBestRule({ rules: [rule("d", ["dining"], 5), rule("c", ["coffee"], 5)] }, ctx()).rule.id, "c");
    assert.equal(selectBestRule({ rules: [rule("c", ["coffee"], 5), rule("d", ["dining"], 5)] }, ctx()).rule.id, "c");
    assert.equal(selectBestRule({ rules: [rule("d", ["dining"], 6), rule("c", ["coffee"], 5)] }, ctx()).rule.id, "d");
  });
  test("上位規則的 excludeMerchants 照樣生效", () => {
    const merchantIndex = buildMerchantIndex([{ id: "sb", name: "星巴克", category: "coffee" }]);
    const card = { rules: [rule("d", ["dining"], 6, { excludeMerchants: ["星巴克"] })] };
    assert.equal(selectBestRule(card, ctx({ merchantId: "sb", merchantIndex })), null);
  });
  test("recommend 依 categories.json 的 parent 帶入：咖啡、外送出現只標餐飲的卡（元大鑽石 11.2%）", () => {
    for (const id of ["coffee", "delivery"]) {
      const r = run("x", { selectedCategoryId: id }).recommendations.find((x) => x.cardId === "yuanta-diamond-wealth");
      assert.equal(r?.rate, 11.2, id);
    }
  });
  test("原本就含 coffee 的規則照舊（chb-myle 咖啡 3%）", () => {
    assert.equal(run("咖啡").recommendations.find((x) => x.cardId === "chb-myle").rate, 3);
  });
  test("電影院套娛樂影音規則", () => {
    const card = { rules: [rule("e", ["entertainment"], 4)] };
    assert.equal(selectBestRule(card, ctx({ categoryId: "cinema", parentIds: ["entertainment"] })).rule.id, "e");
  });
});

describe("validate — overseas 與 parent", () => {
  const VALID_DIR = path.join(import.meta.dirname, "fixtures", "valid");
  async function makeDir(t, { merchants = [], categories }) {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-t22-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(path.join(VALID_DIR, "issuers.json"), path.join(dir, "issuers.json"));
    await mkdir(path.join(dir, "banks"));
    await cp(path.join(VALID_DIR, "banks", "testbank.json"), path.join(dir, "banks", "testbank.json"));
    const cats = JSON.parse(await readFile(path.join(VALID_DIR, "categories.json"), "utf8"));
    await writeFile(path.join(dir, "categories.json"), JSON.stringify(categories ? categories(cats) : cats));
    await writeFile(path.join(dir, "merchants.json"), JSON.stringify(merchants));
    return dir;
  }
  const withParent = (id, parent) => (cats) => cats.map((c) => (c.id === id ? { ...c, parent } : c));

  test("合法的 parent 與 overseas: true 通過", async (t) => {
    const merchants = [{ id: "h", name: "H", category: "supermarket", overseas: true }];
    assert.deepEqual(await validate(await makeDir(t, { merchants, categories: withParent("coffee", "dining") })), []);
  });
  test("overseas 不是布林要報", async (t) => {
    const errors = await validate(await makeDir(t, { merchants: [{ id: "h", name: "H", category: "supermarket", overseas: "yes" }] }));
    assert.ok(errors.some((e) => e.includes("overseas 必須是布林")));
  });
  test("parent 指向不存在的類別要報", async (t) => {
    const errors = await validate(await makeDir(t, { categories: withParent("coffee", "no-such") }));
    assert.ok(errors.some((e) => e.includes("no-such")));
  });
  test("parent 成環要報（含自己指自己）", async (t) => {
    const loop = (cats) => cats.map((c) => (c.id === "coffee" ? { ...c, parent: "dining" } : c.id === "dining" ? { ...c, parent: "coffee" } : c));
    assert.ok((await validate(await makeDir(t, { categories: loop }))).some((e) => e.includes("成環")));
    assert.ok((await validate(await makeDir(t, { categories: withParent("coffee", "coffee") }))).some((e) => e.includes("成環")));
  });
});
