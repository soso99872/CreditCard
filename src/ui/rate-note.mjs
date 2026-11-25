/**
 * 條件文字是否寫明「上限只算加碼部分」。
 * 這種規則的上限不套整個回饋率，「以 NT$X 計，實拿約 Y%」的公式（整個回饋率被上限截掉）不成立，UI 不顯示那行。
 * @param {string[] | undefined} conditions 規則的 conditions
 */
export function capOnlyBonus(conditions) {
  return (conditions || []).some((c) => /上限僅計加碼|上限只算加碼|加碼部分/.test(c));
}
