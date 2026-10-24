// T09-v24：第三方來源支援（validate、freshness、coverage、引擎）
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { validate } from "../scripts/validate.mjs";
import { freshnessReport } from "../scripts/freshness.mjs";
import { getCoverageSummary } from "../scripts/coverage.mjs";
import { recommend } from "../src/engine/recommend.mjs";

const FIXTURES = path.join(import.meta.dirname, "fixtures");
const VALID_DIR = path.join(FIXTURES, "valid");
const ENGINE_DIR = path.join(FIXTURES, "engine");

// valid fixture 的 testbank-card-general：checkedAt 2026-09-01、validFrom 2026-01-01、validTo null
const THIRD_PARTY = {
  sourceType: "third-party",
  sourceUrl: "https://blog-a.example.net/post/1",
  sourcePublishedAt: "2026-08-20",
  checkedAt: "2026-09-01",
};

/** 複製 valid fixture，把第一條規則換成「第三方規則 + overrides」（值為 undefined 代表刪掉該欄位）。 */
async function makeFixture(overrides, mutateBank = () => {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-3p-"));
  await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
  await cp(path.join(VALID_DIR, "issuers.json"), path.join(dir, "issuers.json"));
  await mkdir(path.join(dir, "banks"));
  const bank = JSON.parse(await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8"));
  const rule = { ...bank.cards[0].rules[0], ...THIRD_PARTY, ...overrides };
  for (const k of Object.keys(rule)) if (rule[k] === undefined) delete rule[k];
  bank.cards[0].rules[0] = rule;
  mutateBank(bank);
  await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank, null, 2));
  return dir;
}

async function errorsFor(t, overrides) {
  const dir = await makeFixture(overrides);
  t.after(() => rm(dir, { recursive: true, force: true }));
  return validate(dir);
}

describe("validate — 第三方來源規則", () => {
  test("合法：單一來源", async (t) => {
    assert.deepEqual(await errorsFor(t, {}), []);
  });

  test("合法：兩個來源（不同網域）與 sourceNote", async (t) => {
    const errors = await errorsFor(t, {
      secondSourceUrl: "https://news-b.example.org/a",
      secondSourcePublishedAt: "2026-08-25",
      sourceNote: "兩來源上限寫法略有不同",
    });
    assert.deepEqual(errors, []);
  });

  test("缺 sourcePublishedAt", async (t) => {
    const errors = await errorsFor(t, { sourcePublishedAt: undefined });
    assert.ok(errors.some((e) => e.includes("sourcePublishedAt")));
  });

  test("文章日期超過 90 天（91 天報錯、90 天通過）", async (t) => {
    const old = await errorsFor(t, { sourcePublishedAt: "2026-06-02" });
    assert.ok(old.some((e) => e.includes("超過 90 天")));
    assert.deepEqual(await errorsFor(t, { sourcePublishedAt: "2026-06-03" }), []);
  });

  test("文章日期晚於 checkedAt", async (t) => {
    const errors = await errorsFor(t, { sourcePublishedAt: "2026-09-02" });
    assert.ok(errors.some((e) => e.includes("晚於 checkedAt")));
  });

  test("兩來源同網域", async (t) => {
    const errors = await errorsFor(t, {
      secondSourceUrl: "https://blog-a.example.net/post/2",
      secondSourcePublishedAt: "2026-08-25",
    });
    assert.ok(errors.some((e) => e.includes("網域相同")));
  });

  test("只填一半第二來源（只有 URL、只有日期）", async (t) => {
    const onlyUrl = await errorsFor(t, { secondSourceUrl: "https://news-b.example.org/a" });
    assert.ok(onlyUrl.some((e) => e.includes("一起填")));
    const onlyDate = await errorsFor(t, { secondSourcePublishedAt: "2026-08-25" });
    assert.ok(onlyDate.some((e) => e.includes("一起填")));
  });

  test("第二來源文章日期超過 90 天", async (t) => {
    const errors = await errorsFor(t, {
      secondSourceUrl: "https://news-b.example.org/a",
      secondSourcePublishedAt: "2026-01-01",
    });
    assert.ok(errors.some((e) => e.includes("secondSourcePublishedAt") && e.includes("超過 90 天")));
  });

  test("validTo 早於 checkedAt", async (t) => {
    const errors = await errorsFor(t, { validTo: "2026-08-31" });
    assert.ok(errors.some((e) => e.includes("validTo") && e.includes("早於 checkedAt")));
  });

  test("validFrom 晚於 checkedAt", async (t) => {
    const errors = await errorsFor(t, { validFrom: "2026-09-02" });
    assert.ok(errors.some((e) => e.includes("validFrom") && e.includes("晚於 checkedAt")));
  });

  test("非 https（sourceUrl 與 secondSourceUrl）", async (t) => {
    const first = await errorsFor(t, { sourceUrl: "http://blog-a.example.net/post/1" });
    assert.ok(first.some((e) => e.includes("sourceUrl") && e.includes("https")));
    const second = await errorsFor(t, {
      secondSourceUrl: "http://news-b.example.org/a",
      secondSourcePublishedAt: "2026-08-25",
    });
    assert.ok(second.some((e) => e.includes("secondSourceUrl") && e.includes("https")));
  });

  test("缺 sourceUrl、sourceType 值不合法", async (t) => {
    const noUrl = await errorsFor(t, { sourceUrl: undefined });
    assert.ok(noUrl.some((e) => e.includes("缺少 sourceUrl")));
    const bad = await errorsFor(t, { sourceType: "blog" });
    assert.ok(bad.some((e) => e.includes("sourceType")));
  });

  test("第三方規則不檢查官方網域白名單；官方規則（沒寫 sourceType）仍檢查", async (t) => {
    assert.deepEqual(await errorsFor(t, {}), []);
    const official = await errorsFor(t, {
      sourceType: undefined,
      sourcePublishedAt: undefined,
      sourceUrl: "https://other.example.net/x",
    });
    assert.ok(official.some((e) => e.includes("官方網域白名單")));
  });
});

describe("freshness — 第三方文章日期", () => {
  test("staleArticles 列出超過 90 天的文章日期，邊界 90 天不列；官方規則不列", async (t) => {
    const dir = await makeFixture({
      sourcePublishedAt: "2026-07-12",
      secondSourceUrl: "https://news-b.example.org/a",
      secondSourcePublishedAt: "2026-07-13",
    });
    t.after(() => rm(dir, { recursive: true, force: true }));
    // 今天 2026-10-11：07-12 距 91 天（列出），07-13 距 90 天（不列）
    const { staleArticles } = await freshnessReport(dir, "2026-10-11");
    assert.equal(staleArticles.length, 1);
    assert.equal(staleArticles[0].field, "sourcePublishedAt");
    assert.equal(staleArticles[0].ageDays, 91);
    assert.equal(staleArticles[0].ruleId, "testbank-card-general");

    const dir2 = await makeFixture({ sourceType: "official", sourcePublishedAt: "2026-01-01" });
    t.after(() => rm(dir2, { recursive: true, force: true }));
    assert.deepEqual((await freshnessReport(dir2, "2026-10-11")).staleArticles, []);
  });
});

describe("coverage — 官方／第三方張數", () => {
  test("verified 卡分成全官方與含第三方，草稿卡不計", async (t) => {
    const dir = await makeFixture({}, (bank) => {
      bank.cards[0].verified = true;
      const c2 = JSON.parse(JSON.stringify(bank.cards[0]));
      c2.id = "testbank-card-2";
      c2.rules = c2.rules.map((r, i) => ({ ...r, id: `testbank-card-2-r${i}`, sourceType: "official" }));
      bank.cards.push(c2);
      const c3 = JSON.parse(JSON.stringify(bank.cards[0]));
      c3.id = "testbank-card-3";
      c3.verified = false;
      bank.cards.push(c3);
    });
    t.after(() => rm(dir, { recursive: true, force: true }));
    const s = await getCoverageSummary(dir);
    assert.equal(s.verifiedCardCount, 2);
    assert.equal(s.verifiedWithThirdPartyCount, 1);
    assert.equal(s.verifiedOfficialOnlyCount, 1);
  });
});

describe("引擎 — 帶出來源欄位", () => {
  const read = async (...p) => JSON.parse(await readFile(path.join(ENGINE_DIR, ...p), "utf8"));

  test("第三方規則帶出 sourceType 與四個來源欄位；官方規則預設 official 與 null", async () => {
    const [categories, merchants, categoryKeywords, bank] = await Promise.all([
      read("categories.json"),
      read("merchants.json"),
      read("category-keywords.json"),
      read("banks", "testbank.json"),
    ]);
    const isPx = (r) => r.scope.type === "merchant" && r.scope.merchants.includes("全聯");
    const base = bank.cards.find((c) => c.rules.some(isPx));
    const merchantRule = base.rules.find(isPx);
    const mk = (id, extra) => ({
      ...base,
      id,
      bankId: bank.bankId,
      verified: true,
      rules: [{ ...merchantRule, id: `${id}-r`, validFrom: "2026-01-01", validTo: null, ...extra }],
    });
    const cards = [
      mk("tp-card", {
        sourceType: "third-party",
        sourcePublishedAt: "2026-09-20",
        secondSourceUrl: "https://news-b.example.org/a",
        secondSourcePublishedAt: "2026-09-25",
      }),
      mk("off-card", {}),
    ];
    const { recommendations } = recommend({
      query: "全聯", cards, merchants, categoryKeywords, categories, today: "2026-10-10",
    });
    const tp = recommendations.find((r) => r.cardId === "tp-card");
    const off = recommendations.find((r) => r.cardId === "off-card");
    assert.ok(tp && off, "兩張卡都要出現在推薦結果");
    assert.equal(tp.sourceType, "third-party");
    assert.equal(tp.sourcePublishedAt, "2026-09-20");
    assert.equal(tp.secondSourceUrl, "https://news-b.example.org/a");
    assert.equal(tp.secondSourcePublishedAt, "2026-09-25");
    assert.equal(off.sourceType, "official");
    assert.equal(off.sourcePublishedAt, null);
    assert.equal(off.secondSourceUrl, null);
    assert.equal(off.secondSourcePublishedAt, null);
  });
});
