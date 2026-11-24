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

// 頁首新鮮度燈（健檢 2026-11 R4、product-pitfalls 第 1、5 條）：超過 14 天變橘、45 天以上變紅。
export const STALE_DAYS = 14;
export const OLD_DAYS = 45;

/**
 * 頁首「最近核對 M/D」與新鮮度等級。日期都是 YYYY-MM-DD，用 UTC 換算天數避免時區差一天。
 * @param {string | null} latest 最新 checkedAt
 * @param {string} today 本地今天
 * @returns {{ text: string, level: "fresh" | "stale" | "old", days: number } | null}
 */
export function checkedAtBadge(latest, today) {
  if (!latest) return null;
  const toDay = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  const days = Math.max(0, Math.round(toDay(today) - toDay(latest)));
  const md = `${+latest.slice(5, 7)}/${+latest.slice(8, 10)}`;
  const level = days >= OLD_DAYS ? "old" : days > STALE_DAYS ? "stale" : "fresh";
  const note = level === "fresh" ? "" : level === "old" ? "，資料可能已過期" : "，部分資料可能已更新";
  return { text: `最近核對 ${md}${note}`, level, days };
}
