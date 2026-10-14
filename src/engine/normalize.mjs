// 字串正規化：供商家名稱比對使用。
// 規則（見 data/SCHEMA.md「字串正規化規則」）：全形轉半形、轉小寫、移除空白與連字號。

/**
 * 將字串正規化以便比對商家名稱。
 * 例如「７－１１」「7-11」「711」正規化後皆為 "711"。
 * 非字串輸入（null、undefined 等）視為空字串。
 * @param {string} str
 * @returns {string}
 */
export function normalize(str) {
  if (typeof str !== "string") return "";
  return str
    // 全形字元（U+FF01～U+FF5E，含全形英數與符號）轉半形
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    // 全形空白轉半形空白，才能被下面的空白規則一併移除
    .replace(/　/g, " ")
    .toLowerCase()
    .replace(/[\s-]/g, "");
}
