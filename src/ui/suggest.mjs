// 商家即時建議：使用者在商家欄輸入時，列出名稱或別名相符的前幾筆商家，
// 點選就直接查詢，不需要按 Enter 或送出鈕（PRD v2.2、AC-17）。
// 只用 src/engine/index.mjs 匯出的 normalize，不直接 import 引擎內部模組（見 src/engine/README.md）。

import { normalize } from "../engine/index.mjs";

/**
 * 依商家名稱或別名（先經 normalize）比對使用者輸入，回傳前 limit 筆相符的商家。
 * 查詢字串為空白，或正規化後為空字串時，回傳空陣列（不顯示建議）。
 * @param {string} query 使用者目前在商家欄輸入的字串
 * @param {Array<{id: string, name: string, aliases?: string[]}>} merchants merchants.json
 * @param {number} [limit] 預設 8（AC-17：最多 8 筆）
 * @returns {Array<{id: string, name: string, aliases?: string[]}>}
 */
export function findMerchantSuggestions(query, merchants, limit = 8) {
  const trimmed = typeof query === "string" ? query.trim() : "";
  if (trimmed === "") return [];

  const target = normalize(trimmed);
  if (target === "") return [];

  const matches = [];
  for (const merchant of merchants || []) {
    const names = [merchant.name, ...(merchant.aliases || [])];
    const matched = names.some((name) => normalize(name).includes(target));
    if (matched) {
      matches.push(merchant);
      if (matches.length >= limit) break;
    }
  }
  return matches;
}
