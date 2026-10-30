// 規則比對：排除過期規則，從該商家的 merchant 規則、該類別的 category 規則、general 規則
// 中一律取回饋率最高者；回饋率相同時，依商家＞類別＞一般消費的具體程度決定。
// 見 data/SCHEMA.md 的規則欄位說明與 tasks.md T02「規則比對」。

import { resolveMerchantId } from "./merchant-match.mjs";

/**
 * 規則在指定日期是否生效（未過期、已開始）。
 * `validFrom` 為 `null` 時代表官方頁沒有寫明起日，視為已生效（不檢查開始日）。
 * @param {object} rule data/banks/*.json 裡的規則物件
 * @param {string} today YYYY-MM-DD
 * @returns {boolean}
 */
export function isRuleActive(rule, today) {
  if (!rule || !today) return false;
  if (rule.validFrom && rule.validFrom > today) return false;
  if (rule.validTo && rule.validTo < today) return false;
  return true;
}

/**
 * 把 scope.type === "merchant" 規則上的商家名稱（官方寫法）解析成商家 id 陣列。
 * 對應不到別名表的名稱會被忽略。
 */
function ruleMerchantIds(rule, merchantIndex) {
  if (rule.scope?.type !== "merchant") return [];
  return (rule.scope.merchants || [])
    .map((name) => resolveMerchantId(name, merchantIndex))
    .filter((id) => id !== null);
}

/** category／general 規則的 scope.excludeMerchants 命中查詢的商家時，該規則不適用。 */
function isExcluded(rule, merchantId, merchantIndex) {
  if (!merchantId) return false;
  return (rule.scope?.excludeMerchants || []).some((name) => resolveMerchantId(name, merchantIndex) === merchantId);
}

// 具體程度排名，只用來在回饋率相同時決定選哪一條（數字越大越具體）。
const SPECIFICITY_RANK = { merchant: 3, category: 2, general: 1 };

/**
 * 從一張卡的規則中選出最佳的一條：把該商家的 merchant 規則、該類別的 category 規則、
 * general 規則全部視為候選，一律取回饋率最高者；回饋率相同時依商家＞類別＞一般消費的
 * 具體程度決定。已過期或尚未開始的規則不列入候選。
 * @param {object} card data/banks/*.json 裡的卡片物件（需含 rules 陣列）
 * @param {{
 *   merchantId: string | null,
 *   categoryId: string | null,
 *   today: string,
 *   merchantIndex: Map<string, object>,
 * }} params
 * @returns {{ rule: object, matchLevel: "merchant" | "category" | "general" } | null}
 */
export function selectBestRule(card, { merchantId, categoryId, today, merchantIndex }) {
  const activeRules = (card.rules || []).filter((rule) => isRuleActive(rule, today));
  const candidates = [];

  if (merchantId) {
    for (const rule of activeRules) {
      if (
        rule.scope?.type === "merchant" &&
        ruleMerchantIds(rule, merchantIndex).includes(merchantId)
      ) {
        candidates.push({ rule, matchLevel: "merchant" });
      }
    }
  }

  if (categoryId) {
    for (const rule of activeRules) {
      if (
        rule.scope?.type === "category" &&
        (rule.scope.categories || []).includes(categoryId) &&
        !isExcluded(rule, merchantId, merchantIndex)
      ) {
        candidates.push({ rule, matchLevel: "category" });
      }
    }
  }

  for (const rule of activeRules) {
    if (rule.scope?.type === "general" && !isExcluded(rule, merchantId, merchantIndex)) {
      candidates.push({ rule, matchLevel: "general" });
    }
  }

  let best = null;
  for (const candidate of candidates) {
    if (
      !best ||
      candidate.rule.rate > best.rule.rate ||
      (candidate.rule.rate === best.rule.rate &&
        SPECIFICITY_RANK[candidate.matchLevel] > SPECIFICITY_RANK[best.matchLevel])
    ) {
      best = candidate;
    }
  }

  return best;
}
