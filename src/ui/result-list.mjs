// 把 recommend() 的結果整理成畫面上的一條清單（sprint 012）。純函式，方便測試。

/**
 * @param {Array<{cardId: string, group: "direct" | "gated", effectiveRate: number}>} recs recommend() 的 recommendations
 * @param {boolean} onlyDirect true＝只留不需門檻的列；false＝每張卡只留實拿最高那一列（可能有門檻），整體由高到低
 * @returns {Array} 清單（第 1 列＝第 1 名）
 */
export function buildResultList(recs, onlyDirect) {
  const list = recs || [];
  if (onlyDirect) return list.filter((r) => r.group !== "gated");
  const best = new Map();
  for (const rec of list) {
    const cur = best.get(rec.cardId);
    if (!cur || rec.effectiveRate > cur.effectiveRate) best.set(rec.cardId, rec);
  }
  // Array.prototype.sort 穩定：同分維持引擎原本的順序
  return list.filter((r) => best.get(r.cardId) === r).sort((a, b) => b.effectiveRate - a.effectiveRate);
}

export const TAG_TEXT = {
  register: "登錄／綁定",
  ebill: "電子帳單",
  autopay: "自動扣繳",
  plan: "切換方案",
  asset: "資產門檻",
  quota: "限量",
  spend: "消費門檻",
  newcard: "新戶",
};
export const GATED_TAGS = ["asset", "plan", "quota", "newcard", "spend"];

/** 有條件的卡要做什麼：要切方案的寫「需切換：方案名」，其他門檻寫「需要：…」；沒有門檻回傳空字串。 */
export function needText(rec) {
  const tags = (rec.conditionTags || []).filter((t) => GATED_TAGS.includes(t));
  const switchPlan = tags.includes("plan") && rec.plan;
  const names = tags.filter((t) => !(switchPlan && t === "plan")).map((t) => TAG_TEXT[t]);
  return [switchPlan ? `需切換：${rec.plan}` : "", names.length ? `需要：${names.join("、")}` : ""].filter(Boolean).join("；");
}

/**
 * 方案名放哪：要切方案才拿得到的（conditionTags 有 plan）是「必須」，寫「需切換：方案名」；
 * 其餘只是卡別或級距的名字（例如「大大（基本）」「雙幣白金卡」），歸說明，不當成限制。
 * @returns {{kind: "required" | "info", text: string} | null}
 */
export function planItem(rec) {
  if (!rec.plan) return null;
  return (rec.conditionTags || []).includes("plan") ? { kind: "required", text: `需切換：${rec.plan}` } : { kind: "info", text: `方案：${rec.plan}` };
}
