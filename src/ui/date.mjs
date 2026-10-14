// 「今天」一律用瀏覽器的本地日期（YYYY-MM-DD），不可用 toISOString()／UTC，
// 否則在 UTC-8 以西或 UTC+ 以東的使用者，當地日期跨午夜時會跟畫面顯示差一天。
// 見 tasks.md T03「今天」用瀏覽器的本地日期。

/**
 * 把 Date（或相容物件，只需有 getFullYear/getMonth/getDate）轉成本地日期字串 YYYY-MM-DD，
 * 供 recommend() 的 today 參數使用。
 * @param {{getFullYear: () => number, getMonth: () => number, getDate: () => number}} [now]
 * @returns {string}
 */
export function localToday(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
