// 支援 ?data=<目錄> 指定資料目錄，方便在真實資料還沒到位時用測試資料
// （例如 test/fixtures/engine）走完查詢流程。沒有指定時預設 "data"。
// 見 tasks.md T03、T12-1。

/**
 * `?data=` 只接受站內相對路徑，擋掉可能被用來跳出站內資料目錄、
 * 或指到其他網域的值（PRD v2.2、T12-1）：
 *   - 含 `//`：可能是 protocol-relative URL（例如 `//evil.example/data`）
 *   - 含 `:`：可能帶 scheme（例如 `http://evil.example`）
 *   - 含 `..` 路徑片段：可能跳出站內目錄
 * @param {string} value 已 trim 過的 `data` 參數值
 * @returns {boolean}
 */
function isSafeRelativeDataPath(value) {
  if (!value) return false;
  if (value.includes("//")) return false;
  if (value.includes(":")) return false;
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
