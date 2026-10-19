// 卡片顏色：依銀行配色，不是依名次（老闆 2026-10-15 改口，取代原本「同一色相、只用明度
// 分名次」的做法）。公式照抄設計藍本 design-proposals/d-wallet.html 目前版本的
// CARD_HUES／bankOrder／bankColor：8 個固定色相，依銀行在這次推薦結果裡第一次出現的
// 順序分配，同一家銀行同色、不同銀行不同色，超過 8 家銀行就循環使用。
// 色相表集中放在這裡（本模組），之後要換色或調整色盤只改這一處（tasks.md T12-2b）。
//
// 跟 d-wallet.html 的示範腳本不同的一點：這裡用 bankId 當配色的 key，不是 bankName。
// d-wallet.html 的示範資料裡 bankName 就是唯一識別，但正式資料的「配色依據」理論上該用
// 真正的唯一鍵（bankId），避免萬一有兩家顯示名稱恰好相同時配色混在一起。

/** 8 個固定色相，飽和度與明度固定 hsl(h 36% 30%)，白字對比在這個組合下都在 6 以上。 */
export const CARD_HUES = [178, 212, 335, 150, 248, 24, 290, 5];

const SATURATION = 36;
const LIGHTNESS = 30;

/**
 * 算出「這次推薦結果」裡每家銀行第一次出現的順序（配色用，不影響清單本身的排序）。
 * 建議傳整份 recommend() 結果（不是畫面上因「預設前 10 名」被截斷後的子集），這樣按
 * 「顯示全部」展開更多卡片時，已經顯示在畫面上那幾張卡的顏色不會跟著變。
 * @param {Array<{ bankId: string }>} recommendations
 * @returns {string[]} 依第一次出現順序排列、不重複的 bankId 清單
 */
export function bankColorOrder(recommendations) {
  const order = [];
  const seen = new Set();
  for (const rec of recommendations || []) {
    if (rec?.bankId && !seen.has(rec.bankId)) {
      seen.add(rec.bankId);
      order.push(rec.bankId);
    }
  }
  return order;
}

/**
 * @param {string} bankId 這張卡的銀行 id（rec.bankId）
 * @param {string[]} bankOrder bankColorOrder() 算好的銀行出現順序
 * @returns {string} 可直接設到 `--c` 的 hsl() 字串
 */
export function bankColor(bankId, bankOrder) {
  const index = (bankOrder || []).indexOf(bankId);
  const hue = CARD_HUES[(index < 0 ? 0 : index) % CARD_HUES.length];
  return `hsl(${hue} ${SATURATION}% ${LIGHTNESS}%)`;
}
