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
