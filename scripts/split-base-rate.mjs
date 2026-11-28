#!/usr/bin/env node
// 從 rawReward／conditions 文字拆出每條「有上限」規則的 baseRate（不受上限的基本回饋 %）與 subCaps（加碼裡另有自己上限的部分）。
// 用法：node scripts/split-base-rate.mjs            統計填了幾條、沒填幾條
//       node scripts/split-base-rate.mjs --jsonl    每條輸出 {"id","baseRate","subCaps"}（給對照集比對）
//       node scripts/split-base-rate.mjs --audit    每條有填的列「id｜baseRate｜依據」，沒填的列原因分類
//       node scripts/split-base-rate.mjs --write    寫回 data/banks/*.json（有填才加 baseRate／subCaps）
// 原則：拆不出來就不填（null），不猜。文字規則判斷不了的，逐條看過原文後寫在下面 OVERRIDES（附理由）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadRules } from "./tag-conditions.mjs";

// 已逐條看過原文的規則（id → { baseRate, subCaps?, why }）
export const OVERRIDES = {
  // 上限直接套整個回饋率（原文「X%…每期最高／共用上限」，沒有另一段不受限的基本回饋）→ 0
  "fubon-momo-store": { baseRate: 0, why: "原文「3% mo幣每期帳單回饋上限2,000」，上限套整個3%" },
  "megabank-young-online-shopping": { baseRate: 0, why: "網購2.5%每期最高200（約月刷8,000），上限套整個2.5%" },
  "megabank-happy-online-shopping": { baseRate: 0, why: "同 megabank-young-online-shopping 的寫法：網購2.5%每期最高200" },
  "scsb-minions-overseas": { baseRate: 0, why: "國外一般消費2.234%，每期帳單最高回饋1,000，整個受上限" },
  "scsb-minions-general": { baseRate: 0, why: "國內一般消費1.234%，每期帳單最高回饋1,000，整個受上限（同 scsb-minions-overseas 寫法）" },
  "taishin-rose-dept": { baseRate: 0, why: "與一般消費共用每期1,500點上限，整個回饋率受限" },
  "taishin-rose-dining": { baseRate: 0, why: "同 taishin-rose-dept，與一般消費共用每期1,500點上限" },
  "taishin-rose-general": { baseRate: 0, why: "一般消費0.2%本身就在共用上限內" },
  // 抓得到數字但其實不是不受限的基本率
  "megabank-happy-travel-platform": { baseRate: null, why: "網購2.5%（上限200）＋加碼2.5%（上限200）兩段都受限，沒有不受上限的基本率" },
  // 基本率要用算的或兩處寫法不同
  "ctbc-uniopen-overseas-store-bonus": { baseRate: 3, why: "國外一般2%＋國外實體1%＋加碼8%＝11%，「上限僅計加碼8%部分」→ 基本 3%" },
  "tbb-titanium-gas-promo": { baseRate: 0.6, why: "原文「原0.6%＋活動3.4%」；條件寫「基本0.4%／0.6%不計入」（0.4% 是百貨那條）" },
  "kgi-eslite-store-gold-autodebit": { baseRate: 0.3, subCaps: [{ rate: 2, cap: { amount: 400, unit: "point", period: "month" } }, { rate: 3.7, cap: { amount: 1400, unit: "point", period: "month" } }], why: "「0.3%基本＋2%自動扣繳＋3.7%金卡加碼」，兩段各有上限（400、1,400 點），主 cap 1,800 點是合計；兩段都放 subCaps，主加碼剩 0" },
  "kgi-eslite-store-black-autodebit": { baseRate: 0.3, subCaps: [{ rate: 2, cap: { amount: 400, unit: "point", period: "month" } }, { rate: 4.7, cap: { amount: 4200, unit: "point", period: "month" } }], why: "「0.3%基本＋2%自動扣繳＋4.7%黑卡加碼」，兩段各有上限（400、4,200 點），主 cap 4,600 點是合計；兩段都放 subCaps，主加碼剩 0" },
  "megabank-young-online-shopping-ebill": { baseRate: 0.5, why: "2.5% 受每期200元上限，另加0.5%「無上限，超過後實際仍有0.5%」→ 不受上限的是 0.5%" },
  "megabank-young-mobile-payment-new": { baseRate: 0.5, why: "「0.5%＋指定支付加碼1%」，條件「加碼1%每期上限100元（cap僅計加碼部分）」" },
  // 有兩段上限
  "hsbc-liveplus-triple-channels-autopay": {
    baseRate: 0.88,
    subCaps: [{ rate: 1, cap: { amount: 200, unit: "point", period: "month" } }],
    why: "一般0.88%無上限；通路加碼3%上限888點（主 cap）；自動扣繳加碼1%另有上限200點/月",
  },
  // ---- sprint 012 T10（前半批）新增：bankchb～kgi 逐張驗算後補的覆寫 ----
  "bot-greengo-green-merchants": { baseRate: 1, why: "「國內一般消費基本1%＋加碼5%」，共用上限只計加碼；原文基本1%是否計入官方未明載，採對照集（bot-greengo-low-carbon 600）的算法" },
  "bot-greengo-low-carbon": { baseRate: 1, why: "同 bot-greengo-green-merchants：基本1%＋加碼5%上限300（舊戶）" },
  "bot-greengo-mobile-pay": { baseRate: 1, why: "同 bot-greengo-green-merchants：基本1%＋加碼1%" },
  "ctbc-allme-channel-pi-hami": { baseRate: 1, why: "「上限僅計加碼部分：每戶每月300點…（基本1%無上限）」，同 telecom-ecommerce 那條" },
  "fubon-costco-gas": { baseRate: 2, why: "原文「基本2%無上限，加碼1%部分每期帳單上限200元」" },
  "fubon-op-telecom-5g": { baseRate: 1, why: "原文「3.5%（1%無上限+2.5%加碼）」" },
  "fubon-op-telecom-4g": { baseRate: 1, why: "原文「2%（1%無上限+1%加碼）」" },
  "fubon-op-category-bonus": { baseRate: 1, why: "原文「最高2%（1%無上限+1%加碼）」，加碼上限與店內消費加碼合併" },
  "kgi-crypto-dining-gas": { baseRate: 1, why: "原文「基本回饋1%+指定通路加碼2%合計」「指定通路加碼每期帳單上限300點」" },
  "kgi-crypto-game-platform": { baseRate: 1, why: "原文「基本回饋1%+指定通路加碼2%合計」「指定通路加碼每期帳單上限200點」" },
  // 接力式「超過上限改以一般回饋計」用 baseRate＋subCaps 湊出同一個算式（數學等價，不改 calcReward）：
  // 回饋 = min(r×A, C) + 超出部分×g，等於 g×A ＋ min((r−g)×A, C×(1−g/r))
  "hsbc-cashback-titanium-selected-channels": { baseRate: 1, subCaps: [{ rate: 2, cap: { amount: 1333.33, unit: "point", period: "month" } }], why: "原文「3%部分最高2,000點/月，超過部分以一般消費1%計」→ 1%×A＋min(2%×A, 2000×2/3=1333.33)，A 超過約66,667 後每多刷1元拿1%" },
  "hncb-ishopping-online": { baseRate: 0.2, subCaps: [{ rate: 1.8, cap: { amount: 180, unit: "TWD", period: "billing-cycle" } }], why: "原文「現金回饋上限200元…超過後之網購消費改按每25元1點（1點NT$0.05＝0.2%）」→ 0.2%×A＋min(1.8%×A, 200×(1−0.2/2)=180)" },
};

const N = "([\\d.]+)";
// 基本率寫法（回傳數字）
const BASE_PATTERNS = [
  new RegExp(`基本(?:回饋)?\\s*${N}\\s*[%％]`, "g"), // 基本1%、基本回饋1%、加基本0.4%
  new RegExp(`基礎回饋\\s*${N}\\s*%`, "g"),
  new RegExp(`一般(?:消費)?\\s*${N}\\s*%`, "g"), // 含一般1%、國內一般 1%、一般消費1%
  new RegExp(`原(?:國內回饋|海外回饋|國內|海外)?\\s*${N}\\s*%`, "g"), // 原0.5%、另加於原國內回饋1%
  new RegExp(`另加於[^，；｜（）]{0,15}?${N}\\s*%`, "g"), // 另加於平日4%、另加於簡單卡日韓實體消費3%
  new RegExp(`${N}\\s*%\\s*[(（]無上限`, "g"), // 1%(無上限)
  new RegExp(`${N}\\s*%\\s*基本`, "g"), // 0.3%基本
  new RegExp(`${N}\\s*%\\s*[＋+]\\s*[^，；｜%\\d]{0,8}(?:加碼|額外)`, "g"), // 1%＋加碼3%、0.5%＋指定支付加碼1%
];
// 上限只套在加碼那一段的寫法（捕獲加碼的 %）
const SCOPE_WITH_RATE = [
  new RegExp(`(?:加碼|額外)\\s*${N}\\s*%(?:部分)?[^，。；：:｜（）()]{0,12}?(?:上限|最高)`, "g"),
  new RegExp(`(?:只計|僅計)[^，。；｜%]{0,12}?${N}\\s*%`, "g"),
];
// 沒寫加碼 % 但說上限只算加碼
const SCOPE_NO_RATE = /(?:加碼|額外)(?:部分)?[^，。；：:｜（）()%]{0,10}(?:上限|最高)/;
// 基本回饋明說不計入上限／無上限
const STRONG = /基本[^，；｜]{0,12}(?:不計入|無上限)|不含一般消費\s*[\d.]+\s*%|[\d.]+\s*%\s*[(（]無上限/;
// 明說沒有基本
const NO_BASE = /(?:無|不含|不享)[^，；｜]{0,6}基本/;

const allNums = (text, patterns) => {
  const out = [];
  for (const re of patterns) for (const m of text.matchAll(re)) out.push(Number(m[1]));
  return out;
};
const same = (a, b) => Math.abs(a - b) < 1e-6;

/** 回傳 { baseRate: number|null, subCaps: null|[], why: 依據或沒填原因, kind } */
export function splitBaseRate(rule) {
  const ov = OVERRIDES[rule.id];
  if (ov) return { baseRate: ov.baseRate, subCaps: ov.subCaps ?? null, why: ov.why, kind: "override" }; // baseRate: null 也是覆寫（明確不填）
  const text = [rule.rawReward, ...(rule.conditions || [])].join("｜");
  const none = (why) => ({ baseRate: null, subCaps: null, why });

  if (/超過[^｜]{0,12}(?:改以|以一般|改按)/.test(text)) return none("接力寫法（超過上限改以一般回饋率計），不建模型");
  if (/基本[^｜；]{0,12}部分計入/.test(text)) return none("基本回饋另有共用上限（計入其他上限），不是不受限");
  if (/基本[^｜]{0,12}(?:未明載|未確認|未寫)|是否另加基本[^｜]{0,6}未確認/.test(text)) return none("原文寫基本回饋是否計入上限未明載");
  if (NO_BASE.test(text)) return { baseRate: 0, subCaps: null, why: "原文明說沒有基本回饋，整個回饋率都受上限", kind: "text" };

  const cands = [...new Set(allNums(text, BASE_PATTERNS))].filter((x) => x < rule.rate); // 等於總回饋率的數字是「一般消費X%」這類描述，不是基本率
  if (cands.length === 0) return none("原文沒有寫出基本回饋率");
  if (cands.length > 1) return none(`原文基本率有多個數字（${cands.join("／")}），無法確定`);
  const b = cands[0];

  if (STRONG.test(text)) return { baseRate: b, subCaps: null, why: "原文明說基本回饋不計入上限／無上限", kind: "text" };

  const ys = allNums(text, SCOPE_WITH_RATE);
  const hasScope = ys.length > 0 || SCOPE_NO_RATE.test(text);
  if (!hasScope) return none("上限句沒有說只算加碼部分");
  const pool = ys.length ? ys : allNums(text, [new RegExp(`(?:加碼|額外)\\s*${N}\\s*%`, "g")]);
  if (!pool.some((y) => same(b + y, rule.rate))) return none("基本率＋加碼率對不上總回饋率（多段加碼），無法確定");
  return { baseRate: b, subCaps: null, why: "原文寫明上限只套加碼部分，且基本＋加碼＝總回饋率", kind: "text" };
}

export function cappedRules(dir) {
  return loadRules(dir).filter(({ rule }) => rule.cap);
}

// 掃出規則物件最外層 key 的位置（略過字串與巢狀）
function scanKeys(text, from) {
  let depth = 0;
  const keys = {};
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (depth === 0 && /^\s*:/.test(text.slice(j + 1, j + 6))) keys[text.slice(i + 1, j)] = i;
      i = j;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      if (depth === 0) return keys;
      depth--;
    }
  }
  throw new Error("規則物件沒有結尾");
}

// 在 conditionTags 前面插入 baseRate（與 subCaps），不動其他內容
function insertBase(text, id, result) {
  const m = new RegExp(`"id":\\s*"${id}"`).exec(text);
  if (!m) throw new Error(`找不到規則 ${id}`);
  const keys = scanKeys(text, m.index + m[0].length);
  if (keys.baseRate !== undefined) throw new Error(`規則 ${id} 已有 baseRate`);
  const at = keys.conditionTags;
  if (at === undefined) throw new Error(`規則 ${id} 沒有 conditionTags`);
  const items = [`"baseRate": ${result.baseRate}`];
  if (result.subCaps) items.push(`"subCaps": ${JSON.stringify(result.subCaps).replace(/"([a-z]+)":/g, '"$1": ').replace(/,"/g, ', "')}`);
  const inline = !text.slice(m.index, at).includes("\n");
  if (inline) return text.slice(0, at) + items.join(", ") + ", " + text.slice(at);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  const indent = text.slice(lineStart, at);
  return text.slice(0, lineStart) + items.map((x) => `${indent}${x},\n`).join("") + text.slice(lineStart);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "banks");
  const all = cappedRules(dir).map(({ file, rule }) => ({ file, rule, res: splitBaseRate(rule) }));
  const mode = process.argv[2];
  if (mode === "--jsonl") {
    for (const { rule, res } of all) console.log(JSON.stringify({ id: rule.id, baseRate: res.baseRate, subCaps: res.subCaps }));
  } else if (mode === "--audit") {
    for (const { rule, res } of all) {
      console.log(`${rule.id}｜${res.baseRate === null ? "null" : res.baseRate}｜${res.subCaps ? JSON.stringify(res.subCaps) : "null"}｜${res.why}`);
    }
  } else if (mode === "--write") {
    const byFile = new Map();
    for (const x of all) if (x.res.baseRate !== null && x.rule.baseRate === undefined) byFile.set(x.file, [...(byFile.get(x.file) || []), x]);
    const out = [];
    for (const [file, items] of byFile) {
      let text = fs.readFileSync(file, "utf8");
      for (const { rule, res } of items) text = insertBase(text, rule.id, res);
      out.push([file, text]);
    }
    for (const [file, text] of out) fs.writeFileSync(file, text); // 全部算好才寫，中途出錯不留半套
    console.log(`已寫入 ${all.filter((x) => x.res.baseRate !== null && x.rule.baseRate === undefined).length} 條規則的 baseRate`);
  } else {
    const filled = all.filter((x) => x.res.baseRate !== null).length;
    console.log(`有上限的 verified 規則 ${all.length} 條：填 baseRate ${filled} 條，沒填 ${all.length - filled} 條，覆寫 ${Object.keys(OVERRIDES).length} 條`);
  }
}
