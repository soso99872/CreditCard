// 第 1 名卡面下方「為什麼」只需要說明比對依據，不重複講回饋率百分比——回饋率已經是
// 卡面與收據上最大的數字（見 design-proposals/d-wallet.html 的收據設計與其註解
// 「回饋率上面已經是最大的數字，理由裡就不再重複」）。
//
// 這裡刻意不沿用 d-wallet.html 原本用正規表示式拆解 src/engine 產生的 reason 句子的寫法：
// 那段規則式只在示範資料的固定句型下成立，真正資料裡同一次查詢的每張卡，best rule 的
// matchLevel 可能不同（例如比對到商家的查詢，某張卡其實是靠一般消費規則入選），
// 拆句子會把「依類別回饋」誤判成含「指定通路」或反過來，改成直接依 matchLevel 與
// recommend() 回傳的 match（商家名／類別名）組字，才不會跟其他卡混淆。
// 其餘名次（錢包卡堆）不套用這個精簡版，直接顯示 rec.reason 全文（含百分比），
// 滿足 AC-05「每張卡都要有推薦理由」。見 tasks.md T12-2b。

/**
 * @param {"merchant" | "category" | "general"} matchLevel 該張卡最佳規則的比對層級（rec.matchLevel）
 * @param {{ merchantName?: string, categoryName?: string | null } | null | undefined} match
 *   recommend() 回傳的 match（同一次查詢所有卡共用，商家名／類別名都在這裡）
 * @returns {string}
 */
export function shortReasonText(matchLevel, match) {
  if (matchLevel === "merchant") {
    return `${match?.merchantName ?? ""}屬於指定通路`;
  }
  if (matchLevel === "category") {
    return match?.categoryName ? `依「${match.categoryName}」類別回饋` : "依類別回饋";
  }
  return "沒有指定優惠，套用一般消費回饋";
}
