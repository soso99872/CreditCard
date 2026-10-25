// 查詢入口（打字、快捷、建議、最近查詢）共用的純判斷，抽出來好測（T19 主管退件①③）。

/**
 * 「找不到符合的商家，可以快選類別」面板與提示要不要出現：只有打字查不到、落到
 * category-selected 時才出現；從快捷、建議或最近查詢直接點類別（pickedCategory）不算查不到。
 * @param {object | null} match recommend() 回傳的 match
 * @param {object | null} pickedCategory
 * @returns {boolean}
 */
export function showsCategoryFallback(match, pickedCategory) {
  return Boolean(match) && match.type === "category-selected" && !pickedCategory;
}

/**
 * 打字查詢要記進最近查詢的項目：比對到商家或推測出類別才記，其餘（查不到、只打一半）不記。
 * @param {object | null} match
 * @returns {{kind: "merchant" | "category", id?: string, name: string} | null}
 */
export function typedQueryEntry(match) {
  if (!match) return null;
  if (match.type === "merchant") return { kind: "merchant", name: match.merchantName };
  if (match.type === "category-guess") return { kind: "category", id: match.categoryId, name: match.categoryName };
  return null;
}
