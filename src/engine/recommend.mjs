// 推薦引擎主入口：整合商家比對、規則比對、排序與推薦理由產生。
// 見 PRD「任意商家都能查詢」「推薦清單」「金額試算」與 tasks.md T02。

import { buildMerchantIndex, matchMerchant } from "./merchant-match.mjs";
import { selectBestRule } from "./rules.mjs";
import { formatRate, formatCap, formatReason, estimateReward } from "./format.mjs";

/**
 * @typedef {{
 *   cardId: string,
 *   cardName: string,
 *   bankId: string,
 *   plan: string,
 *   rate: number,
 *   rateText: string,
 *   rawReward: string,
 *   cap: {amount: number, unit: string, period: string} | null,
 *   capText: string,
 *   conditions: string[],
 *   sourceUrl: string,
 *   checkedAt: string,
 *   matchLevel: "merchant" | "category" | "general",
 *   reason: string,
 *   estimatedAmount?: number,
 *   capped?: boolean,
 * }} Recommendation
 */

/**
 * 計算推薦清單。
 * @param {{
 *   query: string, // 使用者輸入的商家名稱；空白字串代表尚未輸入
 *   selectedCategoryId?: string | null, // 三層比對都落到「需選擇類別」後，使用者選擇的類別 id
 *   cards: Array, // 由 loadAllData() 取得的攤平卡片陣列（或其子集）
 *   merchants: Array, // merchants.json
 *   categoryKeywords: Record<string, string[]>, // category-keywords.json
 *   categories: Array<{id: string, name: string}>, // categories.json
 *   cardIds?: string[] | null, // 只計算這些卡片 id（「我的卡片」），null／undefined 代表全部卡別
 *   today: string, // YYYY-MM-DD，用於排除過期規則
 *   amount?: number, // 選填，提供時會附上每張卡的金額試算
 *   includeUnverified?: boolean, // T14：預設 false，只計算 verified === true 的卡；
 *                                 // 草稿卡（verified 不是 true）須明確傳 true 才會納入計算，
 *                                 // 供預覽或測試查看未核對的資料
 * }} params
 * @returns {{
 *   match:
 *     | { type: "empty" }
 *     | { type: "need-category", query: string }
 *     | { type: "merchant", merchantId: string, merchantName: string, categoryId: string }
 *     | { type: "category-guess", categoryId: string, categoryName: string, query: string }
 *     | { type: "category-selected", categoryId: string, categoryName: string, query: string },
 *   recommendations: Recommendation[], // 已依回饋率由高到低排序（同率時依卡名排序）
 * }}
 */
export function recommend({
  query,
  selectedCategoryId = null,
  cards,
  merchants,
  categoryKeywords,
  categories,
  cardIds = null,
  today,
  amount,
  includeUnverified = false,
}) {
  const merchantIndex = buildMerchantIndex(merchants);
  const categoryNameById = new Map((categories || []).map((c) => [c.id, c.name]));

  const matchResult = matchMerchant(query, { merchantIndex, categoryKeywords });

  if (matchResult.type === "empty") {
    return { match: { type: "empty" }, recommendations: [] };
  }

  let merchantId = null;
  let categoryId = null;
  let displayName = null; // 用於推薦理由中的商家／查詢文字
  let categoryName = null;
  let match;

  if (matchResult.type === "merchant") {
    merchantId = matchResult.merchant.id;
    categoryId = matchResult.merchant.category;
    displayName = matchResult.merchant.name;
    categoryName = categoryNameById.get(categoryId) ?? null;
    match = {
      type: "merchant",
      merchantId,
      merchantName: displayName,
      categoryId,
    };
  } else if (matchResult.type === "category-guess") {
    categoryId = matchResult.categoryId;
    categoryName = categoryNameById.get(categoryId) ?? null;
    displayName = query.trim();
    match = {
      type: "category-guess",
      categoryId,
      categoryName,
      query: displayName,
    };
  } else {
    // need-category：若呼叫端已帶 selectedCategoryId（使用者選擇後再次呼叫），視為已解析的查詢
    if (!selectedCategoryId) {
      return { match: { type: "need-category", query: query.trim() }, recommendations: [] };
    }
    categoryId = selectedCategoryId;
    categoryName = categoryNameById.get(categoryId) ?? null;
    displayName = query.trim();
    match = {
      type: "category-selected",
      categoryId,
      categoryName,
      query: displayName,
    };
  }

  // T14：預設只使用 verified === true 的卡；草稿卡（verified 不是 true）要明確傳
  // includeUnverified: true 才會納入計算，不出現在一般的推薦清單裡。
  const verifiedPool = includeUnverified
    ? cards
    : cards.filter((card) => card.verified === true);
  const pool = cardIds ? verifiedPool.filter((card) => cardIds.includes(card.id)) : verifiedPool;

  const recommendations = [];
  for (const card of pool) {
    const best = selectBestRule(card, { merchantId, categoryId, today, merchantIndex });
    if (!best) continue;

    const { rule, matchLevel } = best;
    const reason = formatReason({
      matchLevel,
      displayName,
      categoryName,
      rate: rule.rate,
    });

    const entry = {
      cardId: card.id,
      cardName: card.name,
      bankId: card.bankId,
      plan: rule.plan || "",
      rate: rule.rate,
      rateText: formatRate(rule.rate),
      rawReward: rule.rawReward,
      cap: rule.cap,
      capText: formatCap(rule.cap),
      conditions: rule.conditions || [],
      sourceUrl: rule.sourceUrl,
      checkedAt: rule.checkedAt,
      matchLevel,
      reason,
    };

    if (typeof amount === "number") {
      const estimate = estimateReward({
        rate: rule.rate,
        amount,
        cap: rule.cap,
        twdPerPoint: card.pointValue?.twdPerPoint,
      });
      entry.estimatedAmount = estimate.amount;
      entry.capped = estimate.capped;
    }

    recommendations.push(entry);
  }

  recommendations.sort((a, b) => {
    if (b.rate !== a.rate) return b.rate - a.rate;
    return a.cardName < b.cardName ? -1 : a.cardName > b.cardName ? 1 : 0;
  });

  return { match, recommendations };
}
