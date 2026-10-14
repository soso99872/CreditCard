// 支援 ?data=<目錄> 指定資料目錄，方便在真實資料還沒到位時用測試資料
// （例如 test/fixtures/engine）走完查詢流程。沒有指定時預設 "data"。
// 見 tasks.md T03、T12-1。

/**
 * `?data=` 只接受站內相對路徑，擋掉可能被用來跳出站內資料目錄、
 * 或指到其他網域的值（PRD v2.2、T12-1）。
 *
 * 瀏覽器解析 http(s) 網址時會把 `\` 當成 `/`，所以不能只擋 `//`、`:`：
 * 像 `\\evil.com` 這種值也能讓 baseUrl 變成跨網域的網址。改用白名單：
 *   - 只允許 `[A-Za-z0-9_\-./]`（不含 `\`、`:`、`%` 等字元，
 *     因此 URL 編碼過的值，例如 `%2e%2e`、`%5C%5C`，一律因為含 `%` 被擋下）
 *   - 不能以 `/` 開頭（避免變成網站根目錄或 protocol-relative URL 的一部分）
 *   - 路徑片段不能是 `..`（避免跳出站內資料目錄）
 * @param {string} value 已 trim 過的 `data` 參數值
 * @returns {boolean}
 */
function isSafeRelativeDataPath(value) {
  if (!value) return false;
  if (!/^[A-Za-z0-9_\-./]+$/.test(value)) return false;
  if (value.startsWith("/")) return false;
  if (value.split("/").some((segment) => segment === "..")) return false;
  return true;
}

/**
 * 依網址查詢字串解析 data/ 的基底路徑，供 loadAllData({ baseUrl }) 使用。
 * 例如 "?data=test/fixtures/engine" → "test/fixtures/engine/"；
 * 沒有指定、指定空字串、或指定的值不是安全的站內相對路徑時 → 退回預設 "data/"。
 * @param {string} search 如 window.location.search
 * @returns {string} 以單一斜線結尾的基底路徑
 */
export function resolveDataBaseUrl(search) {
  const params = new URLSearchParams(search || "");
  const raw = params.get("data");
  const trimmed = raw && raw.trim() !== "" ? raw.trim() : "";
  const dir = isSafeRelativeDataPath(trimmed) ? trimmed : "data";
  return `${dir.replace(/\/+$/, "")}/`;
}

/**
 * 是否開啟草稿資料預覽模式（`?draft=1`）：開啟時 `loadAllData`／`recommend` 都要帶
 * `includeUnverified: true`，讓尚未核對過的草稿卡也出現在結果中，供預覽（tasks.md T17）。
 * 只有字串 `"1"` 才算開啟；`draft=0`、`draft=true`、沒有這個參數都視為關閉，避免意外打開。
 * @param {string} search 如 window.location.search
 * @returns {boolean}
 */
export function isDraftMode(search) {
  const params = new URLSearchParams(search || "");
  return params.get("draft") === "1";
}
