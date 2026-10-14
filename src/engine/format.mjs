// 顯示文字格式化與金額試算：回饋率文字、上限文字、推薦理由、金額試算。
// 見 PRD AC-05、AC-10 與 tasks.md T02。

const PERIOD_LABELS = {
  month: "每月",
  quarter: "每季",
  "billing-cycle": "每期帳單",
  campaign: "活動期間",
  year: "每年",
  "per-transaction": "每筆交易",
};

const UNIT_LABELS = {
  TWD: "元",
  point: "點",
};

/** 千分位加逗號（整數字串），避免依賴 Intl 的 locale 資料。 */
function withThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * 回饋率文字，例如 3 → "3%"、0.5 → "0.5%"。
 * @param {number} rate
 * @returns {string}
 */
export function formatRate(rate) {
  return `${rate}%`;
}

/**
 * 上限文字，例如 { amount: 1000, unit: "point", period: "month" } → "每月上限 1,000 點"；
 * 無上限（null）→ "無上限"。
 * @param {{amount: number, unit: "TWD" | "point", period: string} | null} cap
 * @returns {string}
 */
export function formatCap(cap) {
  if (!cap) return "無上限";
  const periodLabel = PERIOD_LABELS[cap.period] || cap.period;
  const unitLabel = UNIT_LABELS[cap.unit] || cap.unit;
  return `${periodLabel}上限 ${withThousands(cap.amount)} ${unitLabel}`;
}

/**
 * 產生推薦理由（中文一句，依最佳規則的比對層級變化）：
 *   - matchLevel "merchant"：「{displayName}屬於指定通路，回饋{rate}%」
 *   - matchLevel "category"：「依{categoryName}類別回饋{rate}%」
 *   - matchLevel "general"：「{displayName}無指定優惠，以一般消費回饋{rate}%」
 *     （displayName 不存在時改用 categoryName，兩者都沒有時只顯示「以一般消費回饋{rate}%」）
 * @param {{
 *   matchLevel: "merchant" | "category" | "general",
 *   displayName: string | null,
 *   categoryName: string | null,
 *   rate: number,
 * }} params
 * @returns {string}
 */
export function formatReason({ matchLevel, displayName, categoryName, rate }) {
  const rateText = formatRate(rate);

  if (matchLevel === "merchant") {
    return `${displayName}屬於指定通路，回饋${rateText}`;
  }

  if (matchLevel === "category") {
    return `依${categoryName}類別回饋${rateText}`;
  }

  // matchLevel === "general"
  if (displayName) {
    return `${displayName}無指定優惠，以一般消費回饋${rateText}`;
  }
  if (categoryName) {
    return `${categoryName}無指定優惠，以一般消費回饋${rateText}`;
  }
  return `以一般消費回饋${rateText}`;
}

/**
 * 金額試算：round(金額 × rate / 100)；若 cap 存在且試算值超過上限，改回傳上限值並標記 capped。
 * cap.unit 為 "point" 時，用 twdPerPoint 換算成等值新台幣再比較。
 * @param {{
 *   rate: number,
 *   amount: number,
 *   cap: {amount: number, unit: "TWD" | "point", period: string} | null,
 *   twdPerPoint?: number,
 * }} params
 * @returns {{ amount: number, capped: boolean }}
 */
export function estimateReward({ rate, amount, cap, twdPerPoint }) {
  const rawAmount = Math.round((amount * rate) / 100);

  if (!cap) {
    return { amount: rawAmount, capped: false };
  }

  const capInTwd = cap.unit === "point" ? cap.amount * (twdPerPoint ?? 1) : cap.amount;

  if (rawAmount > capInTwd) {
    return { amount: Math.round(capInTwd), capped: true };
  }

  return { amount: rawAmount, capped: false };
}
