// 卡面與卡堆上顯示的銀行簡稱：銀行全名（例如「國泰世華商業銀行」）印在信用卡比例的
// 卡面上太長會被截斷，照抄設計藍本 design-proposals/d-wallet.html 的 shortBank()。
// 見 tasks.md T12-2b。

/**
 * @param {string} name 銀行全名（issuers.json 的 name）
 * @returns {string} 去掉「(台灣)」與「(國際)商業(儲蓄)銀行」「銀行」字尾後的簡稱；
 *   規則套用後整段變空字串時（理論上不會發生，防呆用）改回原名，不顯示空白。
 */
export function shortBankName(name) {
  if (!name) return "";
  const shortened = name
    .replace("(台灣)", "")
    .replace(/(國際)?商業(儲蓄)?銀行$/, "")
    .replace(/銀行$/, "");
  return shortened || name;
}
