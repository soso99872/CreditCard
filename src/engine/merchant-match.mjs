// 商家比對：三層比對的第一、二層（第三層「需選擇類別」由呼叫端處理使用者輸入）。
// 見 PRD「任意商家都能查詢（三層比對）」與 tasks.md T02。

import { normalize } from "./normalize.mjs";

/**
 * 依 merchants.json 建立「正規化名稱／別名 → 商家資料」索引，供比對與別名解析共用。
 * @param {Array<{id: string, name: string, aliases?: string[], category: string}>} merchants
 * @returns {Map<string, object>} 正規化字串 → merchants.json 中的商家物件
 */
export function buildMerchantIndex(merchants) {
  const index = new Map();
  for (const merchant of merchants || []) {
    const names = [merchant.name, ...(merchant.aliases || [])];
    for (const name of names) {
      index.set(normalize(name), merchant);
    }
  }
  return index;
}

/**
 * 將商家名稱（可能是官方規則上寫的名稱，或使用者輸入）解析成商家 id。
 * 對應不到時回傳 null。
 * @param {string} name
 * @param {Map<string, object>} merchantIndex 由 buildMerchantIndex 建立
 * @returns {string | null}
 */
export function resolveMerchantId(name, merchantIndex) {
  const merchant = merchantIndex.get(normalize(name));
  return merchant ? merchant.id : null;
}

/**
 * 三層比對中的第一、二層：
 *   1. 商家名稱／別名完全比對（正規化後）
 *   2. 類別關鍵字比對（名稱中含關鍵字，推測類別）
 * 都比對不到時回傳 "need-category"，由呼叫端請使用者選擇類別。
 * 查詢字串為空白時回傳 "empty"。
 * @param {string} query 使用者輸入的商家名稱
 * @param {{merchantIndex: Map<string, object>, categoryKeywords: Record<string, string[]>}} deps
 * @returns {
 *   { type: "empty" } |
 *   { type: "merchant", merchant: object } |
 *   { type: "category-guess", categoryId: string } |
 *   { type: "need-category" }
 * }
 */
export function matchMerchant(query, { merchantIndex, categoryKeywords }) {
  const trimmed = typeof query === "string" ? query.trim() : "";
  if (trimmed === "") {
    return { type: "empty" };
  }

  const normalized = normalize(trimmed);

  const merchant = merchantIndex.get(normalized);
  if (merchant) {
    return { type: "merchant", merchant };
  }

  for (const [categoryId, keywords] of Object.entries(categoryKeywords || {})) {
    for (const keyword of keywords) {
      if (normalized.includes(normalize(keyword))) {
        return { type: "category-guess", categoryId };
      }
    }
  }

  return { type: "need-category" };
}
