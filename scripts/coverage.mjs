#!/usr/bin/env node
// 涵蓋清單彙總工具。
// 用法：node scripts/coverage.mjs [資料目錄]（預設 data）
// 印出：銀行數、收錄卡數、未收錄卡清單與原因。

import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadJsonIfExists, loadBankFiles } from "./lib.mjs";

/**
 * 回傳涵蓋統計：
 * {
 *   issuerCount, bankFileCount,
 *   includedCount, excludedCount,
 *   excluded: [{ bankId, cardName, reason }],
 *   byBank: [{ bankId, included, excluded, cardCount }]
 * }
 */
export async function getCoverageSummary(dataDir) {
  const issuers = await loadJsonIfExists(path.join(dataDir, "issuers.json"));
  const bankFiles = await loadBankFiles(path.join(dataDir, "banks"));

  let includedCount = 0;
  let excludedCount = 0;
  const excluded = [];
  const byBank = [];

  for (const { bankId, data } of bankFiles) {
    const coverage = Array.isArray(data.coverage) ? data.coverage : [];
    let bankIncluded = 0;
    let bankExcluded = 0;
    for (const item of coverage) {
      if (item.status === "included") {
        includedCount += 1;
        bankIncluded += 1;
      } else if (item.status === "excluded") {
        excludedCount += 1;
        bankExcluded += 1;
        excluded.push({ bankId, cardName: item.cardName, reason: item.reason });
      }
    }
    byBank.push({
      bankId,
      included: bankIncluded,
      excluded: bankExcluded,
      cardCount: Array.isArray(data.cards) ? data.cards.length : 0,
    });
  }

  return {
    issuerCount: Array.isArray(issuers) ? issuers.length : 0,
    bankFileCount: bankFiles.length,
    includedCount,
    excludedCount,
    excluded,
    byBank,
  };
}

async function main() {
  const dataDir = process.argv[2] || "data";
  const summary = await getCoverageSummary(dataDir);

  console.log(`涵蓋清單彙總（資料目錄：${dataDir}）`);
  console.log(`銀行總數（issuers.json）：${summary.issuerCount}`);
  console.log(`已整理資料的銀行檔數：${summary.bankFileCount}`);
  console.log(`收錄卡片數（included）：${summary.includedCount}`);
  console.log(`未收錄卡片數（excluded）：${summary.excludedCount}`);

  console.log(`\n各銀行明細：`);
  for (const b of summary.byBank) {
    console.log(`  - ${b.bankId}：收錄 ${b.included} 張（cards.json 內 ${b.cardCount} 張），未收錄 ${b.excluded} 張`);
  }

  console.log(`\n未收錄卡片與原因：`);
  if (summary.excluded.length === 0) {
    console.log(`  （無）`);
  } else {
    for (const e of summary.excluded) {
      console.log(`  - [${e.bankId}] ${e.cardName}：${e.reason}`);
    }
  }

  process.exit(0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
