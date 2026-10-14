// 頁尾顯示「資料最後檢核日期」：全部資料中最新的 checkedAt（AC-15）。
// 見 tasks.md T03。

/**
 * 從攤平後的卡片清單（loadAllData() 回傳的 cards，每張卡含 rules，選填 pointValue）中，
 * 找出最新的 checkedAt（規則的 checkedAt 與點數換算的 checkedAt 都算）。
 * checkedAt 皆為 YYYY-MM-DD，可直接用字串比較大小。
 * 完全沒有任何 checkedAt 時回傳 null。
 * @param {Array} cards
 * @returns {string | null}
 */
export function latestCheckedAt(cards) {
  let latest = null;
  for (const card of cards || []) {
    const candidates = [card.pointValue?.checkedAt, ...((card.rules || []).map((rule) => rule.checkedAt))];
    for (const checkedAt of candidates) {
      if (checkedAt && (!latest || checkedAt > latest)) {
        latest = checkedAt;
      }
    }
  }
  return latest;
}
