/**
 * 條件或原文是否看得出「回饋分好幾段」（基本＋加碼、上限只算加碼、單筆上限…）。
 * 「以 NT$X 計，實拿約 Y%」的公式假設上限套整個回饋率，只有單一回饋率的規則才成立。
 * 自由文字的寫法列舉不完，所以反過來：只要出現任何多段字樣就不顯示，寧可少顯示也不要顯示錯的數字。
 * @param {string[] | undefined} conditions 規則的 conditions
 * @param {string} [rawReward] 規則的 rawReward（官方原文）
 */
export function capOnlyBonus(conditions, rawReward = "") {
  const text = [...(conditions || []), rawReward || ""].join("；");
  return /加碼|額外|基本|一般(消費)?\s*[0-9.]+\s*%|另加|不計入|無上限|合計|單筆最高|含原|當日|每日/.test(text);
}
