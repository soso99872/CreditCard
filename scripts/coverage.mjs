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
 *   verifiedCardCount, // AC-08：verified === true 的卡數，要求達 50 張以上
 *   verifiedOfficialOnlyCount, // verified 卡中全部規則都是官方來源的張數
 *   verifiedWithThirdPartyCount, // verified 卡中含第三方來源規則的張數
 *   excluded: [{ bankId, cardName, reason }],
 *   byBank: [{ bankId, included, excluded, cardCount, verifiedCount }]
 * }
 */
export async function getCoverageSummary(dataDir) {
  const issuers = await loadJsonIfExists(path.join(dataDir, "issuers.json"));
  const bankFiles = await loadBankFiles(path.join(dataDir, "banks"));

  let includedCount = 0;
  let excludedCount = 0;
  let verifiedCardCount = 0;
  let verifiedOfficialOnlyCount = 0;
  let verifiedWithThirdPartyCount = 0;
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
    const cards = Array.isArray(data.cards) ? data.cards : [];
    const bankVerified = cards.filter((c) => c.verified === true).length;
    verifiedCardCount += bankVerified;
    for (const card of cards.filter((c) => c.verified === true)) {
      if ((card.rules || []).some((r) => r.sourceType === "third-party")) {
        verifiedWithThirdPartyCount += 1;
      } else {
        verifiedOfficialOnlyCount += 1;
      }
    }
    byBank.push({
      bankId,
      included: bankIncluded,
      excluded: bankExcluded,
      cardCount: cards.length,
      verifiedCount: bankVerified,
    });
  }

  return {
    issuerCount: Array.isArray(issuers) ? issuers.length : 0,
    bankFileCount: bankFiles.length,
    includedCount,
    excludedCount,
    verifiedCardCount,
    verifiedOfficialOnlyCount,
    verifiedWithThirdPartyCount,
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
  console.log(`已核對卡片數（verified，AC-08 要求 50 張以上）：${summary.verifiedCardCount}`);
  console.log(`  其中全部規則為官方來源：${summary.verifiedOfficialOnlyCount} 張`);
  console.log(`  其中含第三方來源規則：${summary.verifiedWithThirdPartyCount} 張`);

  console.log(`\n各銀行明細：`);
  for (const b of summary.byBank) {
    console.log(`  - ${b.bankId}：收錄 ${b.included} 張（cards.json 內 ${b.cardCount} 張，已核對 ${b.verifiedCount} 張），未收錄 ${b.excluded} 張`);
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
