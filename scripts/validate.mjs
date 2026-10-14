#!/usr/bin/env node
// 資料驗證工具。
// 用法：node scripts/validate.mjs [資料目錄]（預設 data）
// exit 0：資料完整；exit 1：至少一條規則有問題，並印出檔名、卡片 id、規則 id 與原因。

import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  isValidDateString,
  domainInWhitelist,
  loadJsonIfExists,
  loadBankFiles,
} from "./lib.mjs";

const VALID_CAP_UNITS = ["TWD", "point"];
const VALID_CAP_PERIODS = [
  "month",
  "quarter",
  "billing-cycle",
  "campaign",
  "year",
  "per-transaction",
];
const VALID_SCOPE_TYPES = ["general", "category", "merchant"];
const VALID_BATCHES = [1, 2, 3];
const ISSUER_ID_RE = /^[a-z0-9-]+$/;

/**
 * 檢查 issuers.json 本身的結構，回傳錯誤訊息陣列。
 * 不論 data/banks/ 是否有資料都會執行（只要 issuers.json 存在）。
 */
function validateIssuers(issuers) {
  const errors = [];

  if (!Array.isArray(issuers)) {
    errors.push(`[data/issuers.json] 內容必須是陣列`);
    return errors;
  }

  const seenIds = new Set();

  for (const [idx, issuer] of issuers.entries()) {
    const label = `[data/issuers.json] issuers[${idx}]（${issuer?.id ?? issuer?.name ?? "未知"}）`;

    if (!issuer || typeof issuer.id !== "string" || issuer.id === "") {
      errors.push(`${label}：缺少 id`);
    } else if (!ISSUER_ID_RE.test(issuer.id)) {
      errors.push(`${label}：id 格式錯誤，只能是小寫英數與連字號`);
    } else if (seenIds.has(issuer.id)) {
      errors.push(`${label}：id 重複`);
    } else {
      seenIds.add(issuer.id);
    }

    if (!issuer?.name || typeof issuer.name !== "string") {
      errors.push(`${label}：缺少 name`);
    }

    const domains = issuer?.officialDomains;
    let domainsValid = false;
    if (!Array.isArray(domains) || domains.length === 0) {
      errors.push(`${label}：officialDomains 必須是非空字串陣列`);
    } else {
      domainsValid = true;
      for (const domain of domains) {
        const isBadDomain =
          typeof domain !== "string" ||
          domain === "" ||
          /https?:\/\//i.test(domain) ||
          domain.includes("/") ||
          /\s/.test(domain);
        if (isBadDomain) {
          errors.push(`${label}：officialDomains 內的網域「${domain}」格式錯誤（不可包含 http(s):// 或路徑）`);
          domainsValid = false;
        }
      }
    }

    if (typeof issuer?.cardListUrl !== "string" || issuer.cardListUrl === "") {
      errors.push(`${label}：缺少 cardListUrl`);
    } else {
      let url = null;
      try {
        url = new URL(issuer.cardListUrl);
      } catch {
        errors.push(`${label}：cardListUrl 不是合法 URL`);
      }
      if (url && url.protocol !== "https:") {
        errors.push(`${label}：cardListUrl 必須是 https`);
      }
      if (url && domainsValid && !domainInWhitelist(issuer.cardListUrl, domains)) {
        errors.push(`${label}：cardListUrl 網域不在自己的 officialDomains 內`);
      }
    }

    if (!VALID_BATCHES.includes(issuer?.batch)) {
      errors.push(`${label}：batch 必須是 ${VALID_BATCHES.join("、")} 之一`);
    }
  }

  return errors;
}

/**
 * 執行驗證，回傳錯誤訊息陣列（空陣列代表通過）。
 * 拆成獨立函式方便測試直接呼叫，不必透過 process.exit。
 */
export async function validate(dataDir) {
  const errors = [];

  const categories = await loadJsonIfExists(path.join(dataDir, "categories.json"));
  if (!categories) {
    errors.push(`[data/categories.json] 找不到檔案，無法驗證類別 id`);
  }
  const categoryIds = new Set((categories || []).map((c) => c.id));

  const issuers = await loadJsonIfExists(path.join(dataDir, "issuers.json"));
  const bankFiles = await loadBankFiles(path.join(dataDir, "banks"));

  if (issuers === null) {
    if (bankFiles.length > 0) {
      errors.push(`[data/issuers.json] 找不到檔案，但 data/banks/ 已有資料，無法檢查官方網域白名單`);
    }
  } else {
    errors.push(...validateIssuers(issuers));
  }

  const issuerById = new Map(
    Array.isArray(issuers) ? issuers.map((i) => [i.id, i]) : []
  );

  const seenCardIds = new Map(); // cardId -> file
  const seenRuleIds = new Map(); // ruleId -> file

  for (const { file, bankId, data } of bankFiles) {
    const loc = `[banks/${file}]`;

    if (!data || typeof data !== "object") {
      errors.push(`${loc} 內容不是物件`);
      continue;
    }

    if (data.bankId !== bankId) {
      errors.push(`${loc} bankId（"${data.bankId}"）與檔名（"${bankId}"）不一致`);
    }

    if (!isValidDateString(data.checkedAt)) {
      errors.push(`${loc} 缺少或格式錯誤的 checkedAt（涵蓋清單查閱日期）`);
    }

    const issuer = issuerById.get(bankId);
    if (issuers && !issuer) {
      errors.push(`${loc} 在 issuers.json 中找不到對應的銀行設定（id: ${bankId}）`);
    }

    if (!Array.isArray(data.coverage) || data.coverage.length === 0) {
      errors.push(`${loc} coverage 必須是至少一筆的陣列`);
    } else {
      for (const [idx, item] of data.coverage.entries()) {
        const covLoc = `${loc} coverage[${idx}]（${item?.cardName ?? "未命名"}）`;
        if (!item || typeof item.cardName !== "string" || item.cardName === "") {
          errors.push(`${covLoc}：缺少 cardName`);
        }
        if (item?.status !== "included" && item?.status !== "excluded") {
          errors.push(`${covLoc}：status 必須是 included 或 excluded`);
        } else if (item.status === "included" && !item.cardId) {
          errors.push(`${covLoc}：included 時必須有 cardId`);
        } else if (item.status === "excluded" && !String(item.reason ?? "").trim()) {
          errors.push(`${covLoc}：excluded 時必須有 reason`);
        }
      }
    }

    if (!Array.isArray(data.cards)) {
      errors.push(`${loc} cards 必須是至少一筆的陣列`);
      continue;
    }

    if (data.cards.length === 0) {
      // 例外：整家銀行官方網站打不開，coverage 已列出至少一筆、且全部是 excluded
      // 並附上原因時，允許 cards 為空陣列（代表完全無法查證任何卡片）。
      // 注意：這個例外只接受 cards 本身就是空陣列（Array.isArray(cards) && cards.length === 0），
      // 若 cards 根本不是陣列（例如欄位缺漏、型別錯誤），一律視為錯誤，不適用此例外。
      const allExcludedWithReason =
        Array.isArray(data.coverage) &&
        data.coverage.length > 0 &&
        data.coverage.every(
          (item) => item && item.status === "excluded" && String(item.reason ?? "").trim()
        );
      if (!allExcludedWithReason) {
        errors.push(`${loc} cards 必須是至少一筆的陣列`);
      }
      continue;
    }

    for (const card of data.cards) {
      const cardLabel = card?.id ?? card?.name ?? "(未知卡片)";
      const cardLoc = `${loc} 卡片 ${cardLabel}`;

      if (!card.id) {
        errors.push(`${cardLoc}：缺少 id`);
      } else if (seenCardIds.has(card.id)) {
        errors.push(`${cardLoc}：id 重複（已出現在 ${seenCardIds.get(card.id)}）`);
      } else {
        seenCardIds.set(card.id, file);
      }

      if (!card.name) {
        errors.push(`${cardLoc}：缺少 name`);
      }

      if (card.verified !== undefined && typeof card.verified !== "boolean") {
        errors.push(`${cardLoc}：verified 必須是布林值（沒有這個欄位則視為 false，草稿卡）`);
      }

      if (!card.sourceUrl) {
        errors.push(`${cardLoc}：缺少 sourceUrl`);
      } else if (issuer && !domainInWhitelist(card.sourceUrl, issuer.officialDomains)) {
        errors.push(`${cardLoc}：sourceUrl（${card.sourceUrl}）網域不在 ${bankId} 的官方網域白名單內`);
      }

      if (card.pointValue) {
        const pv = card.pointValue;
        if (typeof pv.twdPerPoint !== "number" || !Number.isFinite(pv.twdPerPoint)) {
          errors.push(`${cardLoc}：pointValue.twdPerPoint 必須是數字`);
        }
        if (!pv.sourceUrl) {
          errors.push(`${cardLoc}：pointValue 缺少 sourceUrl`);
        } else if (issuer && !domainInWhitelist(pv.sourceUrl, issuer.officialDomains)) {
          errors.push(`${cardLoc}：pointValue.sourceUrl（${pv.sourceUrl}）網域不在白名單內`);
        }
        if (!isValidDateString(pv.checkedAt)) {
          errors.push(`${cardLoc}：pointValue 缺少或格式錯誤的 checkedAt`);
        }
      }

      if (!Array.isArray(card.rules) || card.rules.length === 0) {
        errors.push(`${cardLoc}：rules 必須是至少一筆的陣列`);
        continue;
      }

      let hasGeneralRule = false;

      for (const rule of card.rules) {
        const ruleLabel = rule?.id ?? "(未知規則)";
        const ruleLoc = `${cardLoc} 規則 ${ruleLabel}`;

        if (!rule.id) {
          errors.push(`${ruleLoc}：缺少 id`);
        } else if (seenRuleIds.has(rule.id)) {
          errors.push(`${ruleLoc}：id 重複（已出現在 ${seenRuleIds.get(rule.id)}）`);
        } else {
          seenRuleIds.set(rule.id, file);
        }

        if (typeof rule.rate !== "number" || !Number.isFinite(rule.rate) || rule.rate < 0) {
          errors.push(`${ruleLoc}：缺少或格式錯誤的 rate（必須是非負數字）`);
        }

        const scope = rule.scope;
        if (!scope || !VALID_SCOPE_TYPES.includes(scope.type)) {
          errors.push(`${ruleLoc}：scope.type 必須是 ${VALID_SCOPE_TYPES.join("/")} 之一`);
        } else {
          if (scope.type === "general") {
            hasGeneralRule = true;
          } else if (scope.type === "category") {
            if (!Array.isArray(scope.categories) || scope.categories.length === 0) {
              errors.push(`${ruleLoc}：scope.type 為 category 時必須有 categories 陣列`);
            } else if (categories) {
              for (const catId of scope.categories) {
                if (!categoryIds.has(catId)) {
                  errors.push(`${ruleLoc}：scope.categories 含未知類別 id「${catId}」`);
                }
              }
            }
          } else if (scope.type === "merchant") {
            if (!Array.isArray(scope.merchants) || scope.merchants.length === 0) {
              errors.push(`${ruleLoc}：scope.type 為 merchant 時必須有 merchants 陣列`);
            }
            if (scope.basis && scope.basis !== "mcc" && scope.basis !== "merchant-list") {
              errors.push(`${ruleLoc}：scope.basis 必須是 mcc 或 merchant-list`);
            }
          }
        }

        if (rule.cap !== null && rule.cap !== undefined) {
          const cap = rule.cap;
          if (typeof cap.amount !== "number" || !Number.isFinite(cap.amount) || cap.amount < 0) {
            errors.push(`${ruleLoc}：cap.amount 必須是非負數字`);
          }
          if (!VALID_CAP_UNITS.includes(cap.unit)) {
            errors.push(`${ruleLoc}：cap.unit 必須是 ${VALID_CAP_UNITS.join("/")} 之一`);
          }
          if (!VALID_CAP_PERIODS.includes(cap.period)) {
            errors.push(`${ruleLoc}：cap.period 必須是 ${VALID_CAP_PERIODS.join("/")} 之一`);
          }
        }

        if (rule.conditions !== undefined && !Array.isArray(rule.conditions)) {
          errors.push(`${ruleLoc}：conditions 必須是陣列`);
        }

        if (rule.validFrom !== null && !isValidDateString(rule.validFrom)) {
          errors.push(`${ruleLoc}：缺少或格式錯誤的 validFrom（可填 null 代表官方未寫起日，不得是其他格式錯誤）`);
        }

        if (rule.validTo !== null && rule.validTo !== undefined) {
          if (!isValidDateString(rule.validTo)) {
            errors.push(`${ruleLoc}：validTo 格式錯誤（應為 YYYY-MM-DD 或 null）`);
          } else if (isValidDateString(rule.validFrom) && rule.validTo < rule.validFrom) {
            errors.push(`${ruleLoc}：validTo 早於 validFrom`);
          }
        }

        if (!rule.sourceUrl) {
          errors.push(`${ruleLoc}：缺少 sourceUrl`);
        } else if (issuer && !domainInWhitelist(rule.sourceUrl, issuer.officialDomains)) {
          errors.push(`${ruleLoc}：sourceUrl（${rule.sourceUrl}）網域不在 ${bankId} 的官方網域白名單內`);
        }

        if (!isValidDateString(rule.checkedAt)) {
          errors.push(`${ruleLoc}：缺少或格式錯誤的 checkedAt`);
        }
      }

      if (!hasGeneralRule) {
        errors.push(`${cardLoc}：沒有 scope.type 為 general 的一般消費規則`);
      }
    }
  }

  return errors;
}

async function main() {
  const dataDir = process.argv[2] || "data";
  const errors = await validate(dataDir);

  if (errors.length === 0) {
    console.log(`驗證通過（資料目錄：${dataDir}）`);
    process.exit(0);
  }

  console.error(`驗證失敗，共 ${errors.length} 個問題（資料目錄：${dataDir}）：`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

// 僅在直接以 CLI 執行時跑 main()，被 import 時（測試）不執行。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
