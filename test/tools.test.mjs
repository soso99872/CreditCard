import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, mkdtemp, rm, cp } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import { execFileSync } from "node:child_process";

import {
  isValidDateString,
  diffDays,
  domainInWhitelist,
} from "../scripts/lib.mjs";
import { validate } from "../scripts/validate.mjs";
import { freshnessReport } from "../scripts/freshness.mjs";
import { getCoverageSummary } from "../scripts/coverage.mjs";
import { createServer } from "../scripts/server.mjs";
import { precheckBank } from "../scripts/precheck.mjs";

const PRODUCT_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(import.meta.dirname, "fixtures");
const VALID_DIR = path.join(FIXTURES, "valid");
const FRESHNESS_DIR = path.join(FIXTURES, "freshness");

/** 複製 valid fixture，並對銀行資料套用 mutator，回傳可丟棄的暫存目錄路徑。 */
async function makeMutatedFixture(mutateBank) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-fixture-"));
  await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
  await cp(path.join(VALID_DIR, "issuers.json"), path.join(dir, "issuers.json"));
  await mkdir(path.join(dir, "banks"));
  const bank = JSON.parse(
    await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8")
  );
  mutateBank(bank);
  await writeFile(
    path.join(dir, "banks", "testbank.json"),
    JSON.stringify(bank, null, 2)
  );
  return dir;
}

const BASE_ISSUER = {
  id: "testbank",
  name: "測試銀行",
  officialDomains: ["testbank.example.com"],
  cardListUrl: "https://testbank.example.com/credit-cards",
  batch: 1,
};

/** 建立只有 categories.json + issuers.json（沒有 data/banks/）的暫存目錄。 */
async function makeIssuersOnlyFixture(issuers) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-fixture-"));
  await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
  await writeFile(path.join(dir, "issuers.json"), JSON.stringify(issuers, null, 2));
  return dir;
}

describe("scripts/lib.mjs", () => {
  test("isValidDateString 接受合法 YYYY-MM-DD，拒絕格式或日期不存在", () => {
    assert.equal(isValidDateString("2026-10-10"), true);
    assert.equal(isValidDateString("2026-02-28"), true);
    assert.equal(isValidDateString("2026-13-01"), false); // 月份不存在
    assert.equal(isValidDateString("2026-02-30"), false); // 2026 非閏年，2/30 不存在
    assert.equal(isValidDateString("2026/10/10"), false); // 格式錯誤
    assert.equal(isValidDateString(undefined), false);
    assert.equal(isValidDateString(null), false);
  });

  test("diffDays 計算兩個日期之間的天數差", () => {
    assert.equal(diffDays("2026-10-01", "2026-10-10"), 9);
    assert.equal(diffDays("2026-10-10", "2026-10-01"), -9);
    assert.equal(diffDays("bad-date", "2026-10-10"), null);
  });

  test("domainInWhitelist 接受白名單網域與其子網域，拒絕其他", () => {
    const domains = ["testbank.example.com"];
    assert.equal(domainInWhitelist("https://testbank.example.com/x", domains), true);
    assert.equal(domainInWhitelist("https://www.testbank.example.com/x", domains), true);
    assert.equal(domainInWhitelist("https://evil.com/testbank.example.com", domains), false);
    assert.equal(domainInWhitelist("not-a-url", domains), false);
    assert.equal(domainInWhitelist("https://testbank.example.com/x", []), false);
  });
});

describe("scripts/validate.mjs", () => {
  test("資料完整時回傳空的錯誤陣列", async () => {
    const errors = await validate(VALID_DIR);
    assert.deepEqual(errors, []);
  });

  test("CLI：資料完整時 exit code 為 0", () => {
    const stdout = execFileSync(
      process.execPath,
      [path.join(PRODUCT_ROOT, "scripts", "validate.mjs"), VALID_DIR],
      { encoding: "utf8" }
    );
    assert.match(stdout, /驗證通過/);
  });

  test("缺少 rate 時回報問題並指出規則 id", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].rules[0].rate;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.includes("testbank-card-general") && e.includes("rate")));
  });

  test("缺少 sourceUrl 時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].rules[1].sourceUrl;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card-supermarket") && e.includes("sourceUrl")));
  });

  test("缺少 checkedAt 時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].rules[2].checkedAt;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card-pxmart") && e.includes("checkedAt")));
  });

  test("缺少 validFrom 時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].rules[0].validFrom;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card-general") && e.includes("validFrom")));
  });

  test("sourceUrl 網域不在白名單時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[0].sourceUrl = "https://not-official-bank.example.net/promo";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("白名單") && e.includes("testbank-card-general")));
  });

  test("卡片沒有 general 規則時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules = bank.cards[0].rules.filter((r) => r.scope.type !== "general");
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card") && e.includes("general")));
  });

  test("cards 為空陣列，但 coverage 全部為 excluded 且都有 reason 時視為合法（官網整站打不開）", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards = [];
      bank.coverage = [
        { cardName: "（無法取得卡片清單）", status: "excluded", reason: "官方讀不到：測試用途，官網連線失敗" },
      ];
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(!errors.some((e) => e.includes("cards 必須是至少一筆的陣列")));
  });

  test("cards 為空陣列，且 coverage 也是空陣列時仍報錯", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards = [];
      bank.coverage = [];
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cards 必須是至少一筆的陣列")));
  });

  test("cards 為空陣列，但 coverage 含 included 卡片時仍報錯", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards = [];
      bank.coverage = [
        { cardName: "測試卡", status: "included", cardId: "testbank-card" },
      ];
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cards 必須是至少一筆的陣列")));
  });

  test("cards 為空陣列，但 coverage 內有 excluded 卻缺少 reason 時仍報錯", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards = [];
      bank.coverage = [{ cardName: "（無法取得卡片清單）", status: "excluded" }];
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cards 必須是至少一筆的陣列")));
  });

  test("規則 id 重複時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[1].id = bank.cards[0].rules[0].id;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("id 重複")));
  });

  test("卡片 id 跨檔重複時回報問題", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-fixture-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
    await mkdir(path.join(dir, "banks"));

    const bank1 = JSON.parse(
      await readFile(path.join(VALID_DIR, "banks", "testbank.json"), "utf8")
    );
    const bank2 = structuredClone(bank1);
    bank2.bankId = "testbank2";
    // 卡片 id 故意沿用 bank1 的 id，製造跨檔重複
    await writeFile(path.join(dir, "banks", "testbank.json"), JSON.stringify(bank1, null, 2));
    await writeFile(path.join(dir, "banks", "testbank2.json"), JSON.stringify(bank2, null, 2));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("id 重複") && e.includes("testbank-card")));
  });

  test("日期格式錯誤（月份不存在）時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[0].checkedAt = "2026-13-01";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("checkedAt") && e.includes("testbank-card-general")));
  });

  test("bankId 與檔名不一致時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.bankId = "other-bank";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("bankId")));
  });

  test("data/banks/ 有資料但 issuers.json 不存在時視為錯誤", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-fixture-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
    await cp(path.join(VALID_DIR, "banks"), path.join(dir, "banks"), { recursive: true });
    // 注意：沒有複製 issuers.json

    const errors = await validate(dir);
    assert.ok(
      errors.some((e) => e.includes("data/issuers.json") && e.includes("找不到檔案"))
    );
  });

  test("銀行 id 不在 issuers.json 時視為錯誤", async (t) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "cardpick-fixture-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    await cp(path.join(VALID_DIR, "categories.json"), path.join(dir, "categories.json"));
    await cp(path.join(VALID_DIR, "banks"), path.join(dir, "banks"), { recursive: true });
    await writeFile(
      path.join(dir, "issuers.json"),
      JSON.stringify([{ ...BASE_ISSUER, id: "otherbank" }], null, 2)
    );

    const errors = await validate(dir);
    assert.ok(
      errors.some((e) => e.includes("testbank.json") && e.includes("找不到對應的銀行設定"))
    );
  });

  test("CLI：資料有問題時 exit code 為 1，並印出檔名與規則 id", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].rules[0].sourceUrl;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    assert.throws(() => {
      execFileSync(
        process.execPath,
        [path.join(PRODUCT_ROOT, "scripts", "validate.mjs"), dir],
        { encoding: "utf8" }
      );
    }, (err) => {
      assert.equal(err.status, 1);
      assert.match(err.stderr, /testbank\.json/);
      assert.match(err.stderr, /testbank-card-general/);
      return true;
    });
  });
});

describe("scripts/validate.mjs — T11 新規則", () => {
  test("validFrom 為 null 時視為合法（官方未寫起日，引擎視為已生效）", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[0].validFrom = null;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.deepEqual(errors, []);
  });

  test("validFrom 為其他非日期格式（非 null）時仍報錯", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[0].validFrom = "not-a-date";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card-general") && e.includes("validFrom")));
  });

  test("validFrom 為 null 時不檢查 validTo 早於 validFrom", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].rules[0].validFrom = null;
      bank.cards[0].rules[0].validTo = "2020-01-01";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(!errors.some((e) => e.includes("validTo 早於 validFrom")));
  });

  test("cards 欄位完全缺失（非陣列）時一律報錯，即使 coverage 全部 excluded 且有 reason", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards;
      bank.coverage = [
        { cardName: "（無法取得卡片清單）", status: "excluded", reason: "官方讀不到：測試用途，官網連線失敗" },
      ];
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cards 必須是至少一筆的陣列")));
  });

  test("coverage 的 reason 只有空白字元時，視為缺少 reason（trim 後為空）", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.coverage[1].reason = "   ";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("excluded 時必須有 reason")));
  });
});

describe("scripts/validate.mjs — T14 新規則（verified）", () => {
  test("沒有 verified 欄位時視為合法（草稿卡，不是錯誤）", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      delete bank.cards[0].verified;
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.deepEqual(errors, []);
  });

  test("verified 為 true 或 false 時視為合法", async (t) => {
    const dirTrue = await makeMutatedFixture((bank) => {
      bank.cards[0].verified = true;
    });
    const dirFalse = await makeMutatedFixture((bank) => {
      bank.cards[0].verified = false;
    });
    t.after(() => rm(dirTrue, { recursive: true, force: true }));
    t.after(() => rm(dirFalse, { recursive: true, force: true }));

    assert.deepEqual(await validate(dirTrue), []);
    assert.deepEqual(await validate(dirFalse), []);
  });

  test("verified 不是布林值時回報問題", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].verified = "yes";
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("testbank-card") && e.includes("verified")));
  });
});

describe("scripts/validate.mjs — issuers.json 結構檢查", () => {
  test("資料齊全時通過（只有 issuers.json、沒有 data/banks/ 也要能驗證）", async (t) => {
    const dir = await makeIssuersOnlyFixture([BASE_ISSUER]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.deepEqual(errors, []);
  });

  test("issuers.json 不是陣列時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture({ not: "an array" });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("data/issuers.json") && e.includes("必須是陣列")));
  });

  test("id 格式錯誤（非小寫英數與連字號）時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([{ ...BASE_ISSUER, id: "Test_Bank" }]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("id 格式錯誤")));
  });

  test("id 重複時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([
      { ...BASE_ISSUER },
      { ...BASE_ISSUER, cardListUrl: "https://testbank.example.com/other" },
    ]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("id 重複")));
  });

  test("缺少 name 時回報問題", async (t) => {
    const { name, ...withoutName } = BASE_ISSUER;
    const dir = await makeIssuersOnlyFixture([withoutName]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("缺少 name")));
  });

  test("officialDomains 為空陣列時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([{ ...BASE_ISSUER, officialDomains: [] }]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("officialDomains 必須是非空字串陣列")));
  });

  test("officialDomains 含 http:// 時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([
      { ...BASE_ISSUER, officialDomains: ["https://testbank.example.com"] },
    ]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("不可包含 http(s):// 或路徑")));
  });

  test("officialDomains 含路徑時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([
      { ...BASE_ISSUER, officialDomains: ["testbank.example.com/promo"] },
    ]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("不可包含 http(s):// 或路徑")));
  });

  test("cardListUrl 不是 https 時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([
      { ...BASE_ISSUER, cardListUrl: "http://testbank.example.com/credit-cards" },
    ]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cardListUrl 必須是 https")));
  });

  test("cardListUrl 網域不在自己的 officialDomains 內時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([
      { ...BASE_ISSUER, cardListUrl: "https://other-domain.example.com/credit-cards" },
    ]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("cardListUrl 網域不在自己的 officialDomains 內")));
  });

  test("batch 不是 1、2、3 時回報問題", async (t) => {
    const dir = await makeIssuersOnlyFixture([{ ...BASE_ISSUER, batch: 4 }]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    const errors = await validate(dir);
    assert.ok(errors.some((e) => e.includes("batch 必須是")));
  });

  test("CLI：issuers.json 格式錯誤時 exit code 為 1", async (t) => {
    const dir = await makeIssuersOnlyFixture([{ ...BASE_ISSUER, batch: 4 }]);
    t.after(() => rm(dir, { recursive: true, force: true }));

    assert.throws(() => {
      execFileSync(
        process.execPath,
        [path.join(PRODUCT_ROOT, "scripts", "validate.mjs"), dir],
        { encoding: "utf8" }
      );
    }, (err) => {
      assert.equal(err.status, 1);
      assert.match(err.stderr, /issuers\.json/);
      return true;
    });
  });
});

describe("scripts/freshness.mjs", () => {
  test("列出超過 90 天未檢核、與 14 天內到期的規則，邊界值正確", async () => {
    const { stale, expiring } = await freshnessReport(FRESHNESS_DIR, "2026-10-10");

    const staleIds = stale.map((r) => r.ruleId);
    assert.ok(staleIds.includes("rule-stale-old"));
    assert.ok(staleIds.includes("rule-stale-91"));
    assert.ok(!staleIds.includes("rule-not-stale-90"));

    const expiringIds = expiring.map((r) => r.ruleId);
    assert.ok(expiringIds.includes("rule-expiring-10"));
    assert.ok(expiringIds.includes("rule-expiring-14"));
    assert.ok(!expiringIds.includes("rule-not-expiring-15"));
    assert.ok(!expiringIds.includes("rule-already-expired"));
    assert.ok(!expiringIds.includes("rule-no-expiry"));
  });

  test("CLI：可用 --today 指定今天日期以便測試", () => {
    const stdout = execFileSync(
      process.execPath,
      [
        path.join(PRODUCT_ROOT, "scripts", "freshness.mjs"),
        FRESHNESS_DIR,
        "--today=2026-10-10",
      ],
      { encoding: "utf8" }
    );
    assert.match(stdout, /rule-stale-old/);
    assert.match(stdout, /rule-expiring-14/);
    assert.doesNotMatch(stdout, /rule-not-expiring-15/);
  });
});

describe("scripts/coverage.mjs", () => {
  test("彙總收錄與未收錄卡片數", async () => {
    const summary = await getCoverageSummary(VALID_DIR);
    assert.equal(summary.issuerCount, 1);
    assert.equal(summary.bankFileCount, 1);
    assert.equal(summary.includedCount, 1);
    assert.equal(summary.excludedCount, 1);
    assert.equal(summary.excluded[0].cardName, "測試哩程卡");
    assert.equal(summary.excluded[0].reason, "哩程卡，本期不收錄");
  });

  test("CLI：印出涵蓋統計", () => {
    const stdout = execFileSync(
      process.execPath,
      [path.join(PRODUCT_ROOT, "scripts", "coverage.mjs"), VALID_DIR],
      { encoding: "utf8" }
    );
    assert.match(stdout, /收錄卡片數（included）：1/);
    assert.match(stdout, /未收錄卡片數（excluded）：1/);
    assert.match(stdout, /已核對卡片數（verified，AC-08 要求 50 張以上）：\d+/);
  });

  test("verifiedCardCount 只算 verified === true 的卡（T16，AC-08）", async (t) => {
    const dir = await makeMutatedFixture((bank) => {
      bank.cards[0].verified = false;
      bank.cards.push({ ...bank.cards[0], id: "testbank-card-2", verified: true });
    });
    t.after(() => rm(dir, { recursive: true, force: true }));

    const summary = await getCoverageSummary(dir);
    assert.equal(summary.verifiedCardCount, 1);
    assert.equal(summary.byBank[0].verifiedCount, 1);
    assert.equal(summary.byBank[0].cardCount, 2);
  });
});

describe("scripts/server.mjs", () => {
  test("提供 product/ 目錄下的靜態檔案，未知路徑回 404", async (t) => {
    const server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    const port = server.address().port;
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const ok = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/data/categories.json`, (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      }).on("error", reject);
    });
    assert.equal(ok.status, 200);
    const categories = JSON.parse(ok.body);
    assert.ok(Array.isArray(categories));
    assert.ok(categories.some((c) => c.id === "general"));

    const notFound = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/does-not-exist.json`, (res) => {
        resolve({ status: res.statusCode });
      }).on("error", reject);
    });
    assert.equal(notFound.status, 404);
  });
});

describe("scripts/precheck.mjs — T11 主管追加的 4 種疑點", () => {
  function demoBank(overrides = {}) {
    return {
      bankId: "demo",
      coverage: [],
      cards: [],
      ...overrides,
    };
  }

  const baseRule = {
    id: "demo-card-general",
    scope: { type: "general" },
    rate: 0.5,
    rawReward: "一般消費 0.5%",
    cap: null,
    conditions: [],
    validFrom: "2026-01-01",
    checkedAt: "2026-09-01",
    validTo: null,
    sourceUrl: "https://bank.example.com/cards/demo",
  };

  test("疑點 1：卡名含「點」但沒有 pointValue", () => {
    const bank = demoBank({
      cards: [{ id: "demo-card", name: "幸福點數卡", sourceUrl: "https://bank.example.com/cards/demo", rules: [baseRule] }],
    });
    const { issues } = precheckBank(bank);
    assert.match(issues.join(), /卡名含「點／幣／Point」/);
  });

  test("疑點 1：rawReward 含「幣」但沒有 pointValue", () => {
    const bank = demoBank({
      cards: [
        {
          id: "demo-card",
          name: "測試卡",
          sourceUrl: "https://bank.example.com/cards/demo",
          rules: [{ ...baseRule, rawReward: "消費回饋 LINE 幣 1%" }],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.match(issues.join(), /rawReward 含「點／幣／Point」/);
  });

  test("疑點 1：有填 pointValue 時不算疑點", () => {
    const bank = demoBank({
      cards: [
        {
          id: "demo-card",
          name: "幸福點數卡",
          sourceUrl: "https://bank.example.com/cards/demo",
          pointValue: { unit: "點", twdPerPoint: 1, sourceUrl: "https://bank.example.com/points", checkedAt: "2026-09-01" },
          rules: [baseRule],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.doesNotMatch(issues.join(), /pointValue/);
  });

  test("疑點 2：validFrom 等於 checkedAt", () => {
    const bank = demoBank({
      cards: [
        {
          id: "demo-card",
          name: "測試卡",
          sourceUrl: "https://bank.example.com/cards/demo",
          rules: [{ ...baseRule, validFrom: "2026-09-01", checkedAt: "2026-09-01" }],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.match(issues.join(), /validFrom 等於 checkedAt/);
  });

  test("疑點 2：validFrom 為 null 時不算疑點（官方未寫起日，不是推算）", () => {
    const bank = demoBank({
      cards: [
        {
          id: "demo-card",
          name: "測試卡",
          sourceUrl: "https://bank.example.com/cards/demo",
          rules: [{ ...baseRule, validFrom: null, checkedAt: "2026-09-01" }],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.doesNotMatch(issues.join(), /validFrom 等於 checkedAt/);
  });

  test("疑點 3：coverage 的 reason 含「時間有限」「未查證」「未逐一」", () => {
    const bank = demoBank({
      coverage: [
        { cardName: "卡 A", status: "excluded", reason: "時間有限，暫不收錄" },
        { cardName: "卡 B", status: "excluded", reason: "未查證是否還在發行" },
        { cardName: "卡 C", status: "excluded", reason: "未逐一確認權益頁" },
        { cardName: "卡 D", status: "excluded", reason: "已停發" },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.equal(issues.filter((i) => i.includes("時間有限／未查證／未逐一")).length, 3);
    assert.doesNotMatch(issues.join(), /卡 D/);
  });

  test("疑點 4：sourceUrl 看起來是登入頁或申請頁（卡片、規則、pointValue 各自檢查）", () => {
    const bank = demoBank({
      cards: [
        {
          id: "demo-card",
          name: "測試卡",
          sourceUrl: "https://bank.example.com/login",
          pointValue: { unit: "點", twdPerPoint: 1, sourceUrl: "https://bank.example.com/apply/points", checkedAt: "2026-09-01" },
          rules: [{ ...baseRule, sourceUrl: "https://bank.example.com/apply/demo" }],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.equal(issues.filter((i) => i.includes("登入頁或申請頁")).length, 3);
  });

  test("正常的 sourceUrl、reason 不會誤判為疑點", () => {
    const bank = demoBank({
      coverage: [{ cardName: "卡 A", status: "excluded", reason: "哩程卡，本期不收錄" }],
      cards: [
        {
          id: "demo-card",
          name: "測試卡",
          sourceUrl: "https://bank.example.com/cards/demo",
          rules: [baseRule],
        },
      ],
    });
    const { issues } = precheckBank(bank);
    assert.deepEqual(issues, []);
  });
});
