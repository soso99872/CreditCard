// 回饋單位怎麼寫（sprint 012 T11，老闆：「回饋請寫清楚是回饋小樹點還是linepoint 還是現金回饋」）。純函式，方便測試。
// 單位：規則層 rewardUnit 優先，其次卡層；都沒有就不寫（不猜）。排名照引擎的等值新台幣，這裡只管字。

const CASH_UNITS = new Set(["現金回饋", "刷卡金"]);
const fmt = new Intl.NumberFormat("zh-TW");
const money = (n) => `NT$${fmt.format(n)}`;
// 「等值」接英文單位時中間空一格（等值 LINE POINTS），接中文不空（等值小樹點）
const worth = (unit) => `等值${/^[A-Za-z]/.test(unit) ? " " : ""}${unit}`;

/**
 * 這筆推薦用什麼單位。引擎結果沒帶規則本身，用 plan＋rate＋rawReward 找回卡上那條規則。
 * twdPerPoint 只在卡的 pointValue 講的就是這個單位時才用（規則層換成別的點數時不沿用）。
 * @param {{plan?: string, rate: number, rawReward: string}} rec
 * @param {{rewardUnit?: string, pointValue?: {unit: string, twdPerPoint?: number}, rules?: Array} | undefined} card
 * @returns {{unit: string | null, cash: boolean, twdPerPoint: number | null}}
 */
export function rewardUnitOf(rec, card) {
  const rule = (card?.rules || []).find((r) => r.rawReward === rec.rawReward && (r.plan || "") === (rec.plan || "") && r.rate === rec.rate);
  const unit = rule?.rewardUnit || card?.rewardUnit || null;
  const pv = card?.pointValue;
  const twdPerPoint = unit && pv?.unit === unit && typeof pv.twdPerPoint === "number" ? pv.twdPerPoint : null;
  return { unit, cash: CASH_UNITS.has(unit), twdPerPoint };
}

/**
 * 回饋率後面的單位字：「現金回饋」「小樹點」；點數不是 1 點 1 元時寫「等值活利積分」（回饋率是換算成新台幣的 %）。沒有單位回傳空字串。
 * @param {{unit: string | null, cash: boolean, twdPerPoint: number | null}} u
 */
export function rateUnitText(u) {
  if (!u.unit) return "";
  return !u.cash && u.twdPerPoint != null && u.twdPerPoint !== 1 ? worth(u.unit) : u.unit;
}

/**
 * 試算的回饋那段（全站同一套寫法）：
 *   現金類、沒有單位：「回饋約 NT$Y」
 *   點數、知道 1 點值多少：「回饋約 Z 小樹點（約 NT$Y）」（到上限寫「（約 NT$Y，已達上限）」，不疊兩組括號）
 *   點數、不知道 1 點值多少：「回饋約 NT$Y 等值小樹點」（不猜點數）
 * @param {number} amountTwd 引擎算的等值新台幣
 * @param {{unit: string | null, cash: boolean, twdPerPoint: number | null}} u
 * @param {boolean} [capped] 已達上限
 */
export function gainText(amountTwd, u, capped = false) {
  const tail = capped ? "（已達上限）" : "";
  if (!u.unit || u.cash) return `回饋約 ${money(amountTwd)}${tail}`;
  if (u.twdPerPoint) return `回饋約 ${fmt.format(Math.round(amountTwd / u.twdPerPoint))} ${u.unit}（約 ${money(amountTwd)}${capped ? "，已達上限" : ""}）`;
  return `回饋約 ${money(amountTwd)} ${worth(u.unit)}${tail}`;
}
