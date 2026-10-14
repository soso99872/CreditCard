#!/usr/bin/env node
// 產生 data/index.json：列出 data/banks/ 目錄下所有銀行資料檔的檔名。
// 瀏覽器無法列目錄，src/engine/data-loader.mjs 靠這份清單才知道要 fetch 哪些檔案。
// 用法：node scripts/build-index.mjs [資料目錄]（預設 data）
// 新增或移除 data/banks/*.json 後，記得重新執行本指令。

import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * 掃描 dataDir/banks/ 下的 .json 檔，回傳排序後的檔名陣列。目錄不存在則回傳空陣列。
 */
export async function listBankFiles(dataDir) {
  const banksDir = path.join(dataDir, "banks");
  let entries;
  try {
    entries = await readdir(banksDir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw new Error(`讀取 ${banksDir} 失敗：${err.message}`);
  }
  return entries.filter((f) => f.endsWith(".json")).sort();
}

/**
 * 產生 data/index.json，回傳寫入的內容（{ banks: string[] }）。
 */
export async function buildIndex(dataDir) {
  const banks = await listBankFiles(dataDir);
  const index = { banks };
  await writeFile(path.join(dataDir, "index.json"), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

async function main() {
  const dataDir = process.argv[2] || "data";
  const index = await buildIndex(dataDir);
  console.log(`已產生 ${path.join(dataDir, "index.json")}，共 ${index.banks.length} 個銀行檔。`);
}

// 僅在直接以 CLI 執行時跑 main()，被 import 時（測試）不執行。
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
