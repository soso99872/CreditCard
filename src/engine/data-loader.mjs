// 資料載入：載入 categories、issuers、merchants、category-keywords 與所有 data/banks/*.json。
// 瀏覽器無法列目錄，所以銀行檔清單來自 data/index.json（由 scripts/build-index.mjs 產生）。
// 本模組只用 fetch，不使用任何 Node 專屬模組，瀏覽器與 Node 都能 import。

/**
 * 預設的 JSON 讀取函式，使用全域 fetch（瀏覽器與 Node 24 皆內建）。
 * @param {string} url
 * @returns {Promise<any>}
 */
async function defaultFetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`載入 ${url} 失敗：HTTP ${res.status}`);
  }
  return res.json();
}

/**
 * 載入推薦引擎需要的全部資料。
 * @param {{
 *   baseUrl?: string, // data/ 目錄的基底路徑或網址，需以斜線結尾，預設 "data/"
 *   fetchJson?: (url: string) => Promise<any>, // 讀取並解析 JSON，預設用全域 fetch；
 *                                               // 測試或非瀏覽器環境可注入自訂實作（例如直接讀檔）
 * }} [options]
 * @returns {Promise<{
 *   categories: Array,
 *   issuers: Array,
 *   merchants: Array,
 *   categoryKeywords: Record<string, string[]>,
 *   cards: Array, // 所有銀行的卡片攤平成一個陣列，每張卡多了 bankId 欄位
 * }>}
 */
export async function loadAllData({ baseUrl = "data/", fetchJson = defaultFetchJson } = {}) {
  const [categories, issuers, merchants, categoryKeywords, index] = await Promise.all([
    fetchJson(`${baseUrl}categories.json`),
    fetchJson(`${baseUrl}issuers.json`),
    fetchJson(`${baseUrl}merchants.json`),
    fetchJson(`${baseUrl}category-keywords.json`),
    fetchJson(`${baseUrl}index.json`),
  ]);

  const bankFiles = await Promise.all(
    (index.banks || []).map((file) => fetchJson(`${baseUrl}banks/${file}`))
  );

  const cards = bankFiles.flatMap((bank) =>
    (bank.cards || []).map((card) => ({ ...card, bankId: bank.bankId }))
  );

  return { categories, issuers, merchants, categoryKeywords, cards };
}
