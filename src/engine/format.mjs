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
 *   - matchLevel "general"：「{displayName}沒有指定優惠，以一般消費回饋{rate}%」
 *     （displayName 不存在時改用 categoryName，兩者都沒有時只顯示「以一般消費回饋{rate}%」）
 * @param {{
 *   matchLevel: "merchant" | "category" | "general",
 *   displayName: string | null,
 *   categoryName: string | null,
 *   rate: number,
 *   viaOverseas?: boolean, // 地區分類套用了泛用海外規則
 * }} params
 * @returns {string}
 */
export function formatReason({ matchLevel, displayName, categoryName, rate, viaOverseas = false }) {
  const rateText = formatRate(rate);

  if (viaOverseas) {
    return `${displayName || categoryName}屬海外消費，依海外類別回饋${rateText}`;
  }

  if (matchLevel === "merchant") {
    return `${displayName}屬於指定通路，回饋${rateText}`;
  }

  if (matchLevel === "category") {
    return `依${categoryName}類別回饋${rateText}`;
  }

  // matchLevel === "general"
  if (displayName) {
    return `${displayName}沒有指定優惠，以一般消費回饋${rateText}`;
  }
  if (categoryName) {
    return `${categoryName}沒有指定優惠，以一般消費回饋${rateText}`;
  }
  return `以一般消費回饋${rateText}`;
}

/**
 * 一條規則在金額 A 下的回饋（元，未四捨五入）與是否碰到上限。
 * 有 baseRate：回饋＝baseRate×A ＋ min((rate−baseRate−Σsub.rate)×A, cap) ＋ Σ min(sub.rate×A, sub.cap)
 * （基本回饋與加碼並行，不是加碼滿了才算基本）；沒有 baseRate：min(rate×A, cap)，與舊算法相同。
 * 點數上限用 twdPerPoint 換算成元；任何一段到上限即 capped。
 * @param {{
 *   rate: number,
 *   baseRate?: number | null,
 *   subCaps?: Array<{rate: number, cap: {amount: number, unit: string, period: string}}> | null,
 *   amount: number,
 *   cap: {amount: number, unit: "TWD" | "point", period: string} | null,
 *   twdPerPoint?: number,
 * }} params
 * @returns {{ exact: number, capped: boolean }}
 */
export function calcReward({ rate, baseRate = null, subCaps = null, amount, cap, twdPerPoint }) {
  const toTwd = (c) => (c.unit === "point" ? c.amount * (twdPerPoint ?? 1) : c.amount);
  const piece = (r, c) => {
    const gross = (amount * r) / 100;
    if (!c) return { value: gross, capped: false };
    const limit = toTwd(c);
    return gross > limit ? { value: limit, capped: true } : { value: gross, capped: false };
  };
  if (baseRate === null || baseRate === undefined) {
    const p = piece(rate, cap);
    return { exact: p.value, capped: p.capped };
  }
  const subs = subCaps || [];
  const bonusRate = Math.max(0, rate - baseRate - subs.reduce((s, x) => s + x.rate, 0));
  const parts = [{ value: (amount * baseRate) / 100, capped: false }, piece(bonusRate, cap), ...subs.map((x) => piece(x.rate, x.cap))];
  return { exact: parts.reduce((s, p) => s + p.value, 0), capped: parts.some((p) => p.capped) };
}

/**
 * 金額試算：calcReward 的結果四捨五入成整數元，並帶 capped 標記。
 * 見 PRD AC-05、AC-10。
 * @param {Parameters<typeof calcReward>[0]} params
 * @returns {{ amount: number, capped: boolean }}
 */
export function estimateReward(params) {
  const { exact, capped } = calcReward(params);
  return { amount: Math.round(exact), capped };
}
