// 推薦引擎主入口：整合商家比對、規則比對、排序與推薦理由產生。
// 見 PRD「任意商家都能查詢」「推薦清單」「金額試算」與 tasks.md T02。

import { buildMerchantIndex, matchMerchant } from "./merchant-match.mjs";
import { collectCandidates, pickBest, REGION_CATEGORY_IDS } from "./rules.mjs";
import { formatRate, formatCap, formatReason, estimateReward, calcReward } from "./format.mjs";

// 介面直接點類別（沒有打字）時傳進來的 query 佔位字元：只用來走「已選類別」分支，不能出現在理由句裡。
export const CATEGORY_PICK_QUERY = "◎";

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
 *   sourceType: "official" | "third-party",
 *   sourcePublishedAt: string | null, // 第三方來源的文章日期
 *   secondSourceUrl: string | null,
 *   secondSourcePublishedAt: string | null,
 *   matchLevel: "merchant" | "category" | "general",
 *   reason: string,
 *   group: "direct" | "gated", // direct＝直接拿得到；gated＝有門檻（conditionTags 含 asset、plan、quota、newcard、spend）
 *   effectiveRate: number, // 以使用者金額（沒填用類別預設）扣掉上限後的實拿回饋率，% 單位
 *   conditionTags: string[],
 *   baseRate: number | null, // 不受上限的基本回饋 %；null＝資料未確認
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
 *   categoryDefaults?: {default: number, categories: Record<string, number>}, // 沒填金額時，排序用的類別預設金額
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
 *   recommendations: Recommendation[], // 先 direct 組後 gated 組；組內依 effectiveRate 由高到低（見 compareEntries）
 * }}
 */
export function recommend({
  query,
  selectedCategoryId = null,
  cards,
  merchants,
  categoryKeywords,
  categories,
  categoryDefaults = null,
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

  const parentById = new Map((categories || []).map((c) => [c.id, c.parent]));
  let merchantId = null;
  let merchantOverseas = false;
  let categoryId = null;
  let displayName = null; // 用於推薦理由中的商家／查詢文字
  let categoryName = null;
  let match;

  if (matchResult.type === "merchant") {
    merchantId = matchResult.merchant.id;
    categoryId = matchResult.merchant.category;
    merchantOverseas = matchResult.merchant.overseas === true;
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
    displayName = query.trim() === CATEGORY_PICK_QUERY ? null : query.trim();
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

  const parentIds = []; // validate 保證 parent 不成環；加上限只是保險
  for (let p = parentById.get(categoryId); p && parentIds.length < 5; p = parentById.get(p)) parentIds.push(p);

  const ctx = { merchantId, categoryId, today, merchantIndex, parentIds, merchantOverseas };
  // 排序用金額：使用者有填用使用者的；否則依類別（→上位類別→海外地區→default）取預設
  const sortAmount = typeof amount === "number" && amount > 0 ? amount : defaultAmount(categoryId, parentIds, categoryDefaults);

  const recommendations = [];
  for (const card of pool) {
    // 每張卡在 direct、gated 各取 effectiveRate 最高的一條；gated 要比 direct 高才另外出現
    const best = { direct: null, gated: null };
    for (const candidate of collectCandidates(card, ctx)) {
      const effectiveRate = calcEffectiveRate(candidate.rule, card, sortAmount);
      const group = isGated(candidate.rule) ? "gated" : "direct";
      const cur = best[group];
      if (!cur || effectiveRate > cur.effectiveRate + EPS || (Math.abs(effectiveRate - cur.effectiveRate) <= EPS && pickBest([cur.candidate, candidate]) === candidate && candidate !== cur.candidate)) {
        best[group] = { candidate, effectiveRate };
      }
    }
    for (const group of ["direct", "gated"]) {
      const pick = best[group];
      if (!pick) continue;
      if (group === "gated" && best.direct && pick.effectiveRate <= best.direct.effectiveRate + EPS) continue;
      recommendations.push(buildEntry(card, pick, group));
    }
  }

  recommendations.sort(compareEntries);

  return { match, recommendations };

  function buildEntry(card, { candidate, effectiveRate }, group) {
    const { rule, matchLevel, viaOverseas } = candidate;
    const reason = formatReason({ matchLevel, displayName, categoryName, rate: rule.rate, viaOverseas });
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
      sourceType: rule.sourceType ?? "official",
      sourcePublishedAt: rule.sourcePublishedAt ?? null,
      secondSourceUrl: rule.secondSourceUrl ?? null,
      secondSourcePublishedAt: rule.secondSourcePublishedAt ?? null,
      matchLevel,
      viaOverseas: Boolean(viaOverseas),
      reason,
      group,
      effectiveRate,
      conditionTags: rule.conditionTags || [],
      baseRate: rule.baseRate ?? null,
    };
    if (typeof amount === "number") {
      const estimate = estimateReward({ ...rewardParams(rule, card), amount });
      entry.estimatedAmount = estimate.amount;
      entry.capped = estimate.capped;
    }
    return entry;
  }
}

const EPS = 1e-9;
const GATED_TAGS = ["asset", "plan", "quota", "newcard", "spend"];
const SPECIFICITY = { merchant: 3, category: 2, general: 1 };

function isGated(rule) {
  return (rule.conditionTags || []).some((t) => GATED_TAGS.includes(t));
}

/** 類別預設金額：該類別 → 上位類別 → 地區類別用 overseas → default。 */
function defaultAmount(categoryId, parentIds, defaults) {
  const table = defaults?.categories || {};
  for (const id of [categoryId, ...parentIds]) if (table[id]) return table[id];
  if (REGION_CATEGORY_IDS.has(categoryId) && table.overseas) return table.overseas;
  return defaults?.default || 1000;
}

/** 試算用的規則欄位；基本回饋與加碼並行算（見 format.mjs calcReward）。 */
function rewardParams(rule, card) {
  return { rate: rule.rate, baseRate: rule.baseRate ?? null, subCaps: rule.subCaps ?? null, cap: rule.cap, twdPerPoint: card.pointValue?.twdPerPoint };
}

/** effectiveRate = 實拿回饋（元）÷ A × 100；cap.period 本期不影響。 */
function calcEffectiveRate(rule, card, amountTwd) {
  return (calcReward({ ...rewardParams(rule, card), amount: amountTwd }).exact / amountTwd) * 100;
}

/** 先 direct 後 gated；組內 effectiveRate 高 → 官方先 → 具體度 → 卡名。 */
function compareEntries(a, b) {
  if (a.group !== b.group) return a.group === "direct" ? -1 : 1;
  if (Math.abs(b.effectiveRate - a.effectiveRate) > EPS) return b.effectiveRate - a.effectiveRate;
  if (a.sourceType !== b.sourceType) return a.sourceType === "official" ? -1 : 1;
  if (a.matchLevel !== b.matchLevel) return SPECIFICITY[b.matchLevel] - SPECIFICITY[a.matchLevel];
  return a.cardName < b.cardName ? -1 : a.cardName > b.cardName ? 1 : 0;
}
