#!/usr/bin/env node
// 保鮮報告工具。
// 用法：node scripts/freshness.mjs [資料目錄] [今天日期 YYYY-MM-DD 或 --today=YYYY-MM-DD]
//   資料目錄預設 data；今天日期預設系統當天（可用參數覆寫方便測試）。
// 列出：
//   - stale：checkedAt 距今天超過 90 天的規則
//   - expiring：validTo 在今天起 14 天內（含今天、含第 14 天）的規則

import path from "node:path";
import { pathToFileURL } from "node:url";
import { diffDays, isValidDateString, loadBankFiles, todayString } from "./lib.mjs";

const STALE_DAYS = 90;
const EXPIRING_DAYS = 14;

/**
 * 回傳 { stale, expiring }，每筆為 { file, cardId, ruleId, checkedAt, validTo }。
 */
export async function freshnessReport(dataDir, today) {
  const bankFiles = await loadBankFiles(path.join(dataDir, "banks"));
  const stale = [];
  const expiring = [];

  for (const { file, data } of bankFiles) {
    for (const card of data.cards || []) {
      for (const rule of card.rules || []) {
        if (isValidDateString(rule.checkedAt)) {
          const age = diffDays(rule.checkedAt, today);
          if (age !== null && age > STALE_DAYS) {
            stale.push({
              file,
              cardId: card.id,
              ruleId: rule.id,
              checkedAt: rule.checkedAt,
              ageDays: age,
            });
          }
        }
        if (isValidDateString(rule.validTo)) {
          const remaining = diffDays(today, rule.validTo);
          if (remaining !== null && remaining >= 0 && remaining <= EXPIRING_DAYS) {
            expiring.push({
              file,
              cardId: card.id,
              ruleId: rule.id,
              validTo: rule.validTo,
              remainingDays: remaining,
            });
          }
        }
      }
    }
  }

  return { stale, expiring };
}

function parseArgs(argv) {
  let dataDir = "data";
  let today = todayString();
  const positional = [];
  for (const arg of argv) {
    if (arg.startsWith("--today=")) {
      today = arg.slice("--today=".length);
    } else {
      positional.push(arg);
    }
  }
  if (positional[0]) dataDir = positional[0];
  if (positional[1]) today = positional[1];
  return { dataDir, today };
}

async function main() {
  const { dataDir, today } = parseArgs(process.argv.slice(2));

  if (!isValidDateString(today)) {
    console.error(`今天日期格式錯誤："${today}"，應為 YYYY-MM-DD`);
    process.exit(1);
  }

  const { stale, expiring } = await freshnessReport(dataDir, today);

  console.log(`保鮮報告（資料目錄：${dataDir}，今天：${today}）`);
  console.log(`\n超過 ${STALE_DAYS} 天未檢核（共 ${stale.length} 條）：`);
  for (const item of stale) {
    console.log(
      `  - [banks/${item.file}] 卡片 ${item.cardId} 規則 ${item.ruleId}：checkedAt=${item.checkedAt}（${item.ageDays} 天前）`
    );
  }

  console.log(`\n${EXPIRING_DAYS} 天內即將到期（共 ${expiring.length} 條）：`);
  for (const item of expiring) {
    console.log(
      `  - [banks/${item.file}] 卡片 ${item.cardId} 規則 ${item.ruleId}：validTo=${item.validTo}（${item.remainingDays} 天後到期）`
    );
  }

  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
