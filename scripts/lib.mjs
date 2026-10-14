// 共用工具：資料載入、日期與網域檢查。
// 給 scripts/validate.mjs、scripts/freshness.mjs、scripts/coverage.mjs 共用。

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * 檢查字串是否為合法的 YYYY-MM-DD 日期（含實際日期存在，例如拒絕 2026-02-30）。
 */
export function isValidDateString(value) {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * 將 YYYY-MM-DD 轉成 UTC 午夜的 Date，供天數計算；輸入不合法回傳 null。
 */
export function parseDateUTC(value) {
  if (!isValidDateString(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * 兩個日期字串之間的天數差（b - a），以日為單位。
 */
export function diffDays(aStr, bStr) {
  const a = parseDateUTC(aStr);
  const b = parseDateUTC(bStr);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * 回傳今天（本機時區）的 YYYY-MM-DD 字串，用於預設「今天」。
 */
export function todayString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 檢查 URL 的網域是否在白名單內（白名單網域或其子網域都算符合）。
 * URL 格式不合法，或沒有網域可解析時回傳 false。
 */
export function domainInWhitelist(url, domains) {
  if (typeof url !== "string" || !Array.isArray(domains) || domains.length === 0) {
    return false;
  }
  let hostname;
  try {
    hostname = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return domains.some((domain) => {
    const d = String(domain).toLowerCase();
    return hostname === d || hostname.endsWith(`.${d}`);
  });
}

/**
 * 載入 JSON 檔案；檔案不存在回傳 null；其他錯誤（例如 JSON 格式錯誤）往外丟。
 */
export async function loadJsonIfExists(filePath) {
  try {
    const text = await readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw new Error(`讀取 ${filePath} 失敗：${err.message}`);
  }
}

/**
 * 載入 data/banks/ 目錄下所有銀行檔案。目錄不存在回傳空陣列。
 * 回傳 [{ file, bankId, data }]，依檔名排序。
 */
export async function loadBankFiles(banksDir) {
  let entries;
  try {
    entries = await readdir(banksDir);
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw new Error(`讀取 ${banksDir} 失敗：${err.message}`);
  }
  const jsonFiles = entries.filter((f) => f.endsWith(".json")).sort();
  const results = [];
  for (const file of jsonFiles) {
    const filePath = path.join(banksDir, file);
    const text = await readFile(filePath, "utf8");
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`${file} 不是合法的 JSON：${err.message}`);
    }
    results.push({ file, bankId: path.basename(file, ".json"), data });
  }
  return results;
}
