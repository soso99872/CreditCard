// 第三方來源標示（AC-05、AC-06；tasks.md T09-UI）。純函式，方便測試。

// 精簡列表收合列用的短標籤
// 同一狀態只用一種寫法（product-pitfalls 第 2 條）：短標籤與完整標籤都說「第三方整理」
export const THIRD_PARTY_SHORT = "第三方整理";
export const THIRD_PARTY_LABEL = "第三方整理，未核對官方";

/**
 * 推薦結果若來自第三方整理，回傳要顯示的標籤、文章日期與來源連結；官方規則回傳 null。
 * @param {object} rec recommend() 回傳的一筆結果
 * @returns {{ label: string, dateText: string, links: Array<{ url: string, text: string }> } | null}
 */
export function thirdPartyInfo(rec) {
  if (rec?.sourceType !== "third-party") return null;
  const links = [{ url: rec.sourceUrl, text: rec.secondSourceUrl ? "第三方文章 1" : "看第三方文章" }];
  if (rec.secondSourceUrl) links.push({ url: rec.secondSourceUrl, text: "第三方文章 2" });
  return {
    label: THIRD_PARTY_LABEL,
    dateText: `文章日期 ${rec.sourcePublishedAt}`,
    links,
  };
}
