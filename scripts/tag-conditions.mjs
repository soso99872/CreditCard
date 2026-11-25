#!/usr/bin/env node
// 依 conditions（加 plan 欄位文字）替每條 verified 規則標 conditionTags。
// 用法：node scripts/tag-conditions.mjs            統計各標籤規則數
//       node scripts/tag-conditions.mjs --jsonl    每條輸出 {"id","conditionTags"}（給對照集比對）
//       node scripts/tag-conditions.mjs --write    寫回 data/banks/*.json（只加 conditionTags 一欄）
// 關鍵字對照做不到的，逐條看原文判斷，寫在下面 OVERRIDES（id → 標籤，附理由）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TAGS = ["asset", "autopay", "ebill", "newcard", "plan", "quota", "register", "spend"];

// 無法用關鍵字判斷、已逐條看過原文的規則（id → 標籤；理由寫在後面）
export const OVERRIDES = {
  // 彰銀 MyLe 四條：原文「須同時符合三項加碼條件：數位存款帳戶月均餘額達2萬、綁台灣Pay或Google Pay付款、電子帳單或本行帳戶自動扣繳」
  // 三項都是帳戶／綁定／帳單條件，不是消費門檻（關鍵字會把「三項」誤判成 spend）
  "chb-myle-overseas": ["asset", "autopay", "ebill", "register"],
  "chb-myle-supermarket": ["asset", "autopay", "ebill", "register"],
  "chb-myle-dining": ["asset", "autopay", "ebill", "register"],
  "chb-myle-department-store": ["asset", "autopay", "ebill", "register"],
  // 華南熊加碼三條：「七選一資格」符合一項即可，其中熊愛PAY 只要在華銀支付／台灣行動支付綁定熊Q卡且當期消費一筆＝綁定
  "hncb-bearq-general-bonus": ["register"],
  "hncb-bearq-overseas-bonus": ["register"],
  "hncb-bearq-jk-bonus": ["register"],
  // 華南熊指定通路六條：「需符合2項以上資格條件」，熊愛PAY 之外至少還要一項華南帳戶或產品（熊數位、熊有錢、熊有薪…），屬帳戶資格，不是消費門檻（例外：新熊友核卡 3 個月內視同 2 項資格，本站不收新戶優惠）
  "hncb-bearq-dept": ["asset", "register"],
  "hncb-bearq-dining": ["asset", "register"],
  "hncb-bearq-travel": ["asset", "register"],
  "hncb-bearq-gas": ["asset", "register"],
  "hncb-bearq-shopping": ["asset", "register"],
  "hncb-bearq-twpay": ["asset", "register"],
  // 凱基誠品四條：「限誠品會員金卡／黑卡」要在誠品累計消費 6,000／50,000 元才升等，屬累積消費門檻；出示會員卡另標 register
  "kgi-eslite-store-gold": ["register", "spend"],
  "kgi-eslite-store-black": ["register", "spend"],
  "kgi-eslite-store-gold-autodebit": ["autopay", "register", "spend"],
  "kgi-eslite-store-black-autodebit": ["autopay", "register", "spend"],
};

// 先把「放寬、否定、不是門檻」的說法拿掉，避免被關鍵字誤標
const NEUTRAL = [
  /未設定[^，；。]*?自動扣繳[^，；。]*?即享/g, // 未設定自動扣繳即享：不用扣繳
  /（[^）]*?免設定亦享）/g, // 新申辦核卡 N 天內免設定亦享：放寬
  /官方未寫名額限制/g,
  /累積未滿[^，；。]*/g, // 基本級距
  /(?<!單筆)未滿[^，；。]*/g, // 單筆未滿 X 不回饋是單筆門檻，要留著判斷
  /（會員點數[^）]*）/g,
  /月均餘額達[^，；。+＋]*/g, // 帳戶餘額不是消費門檻
  /換匯[^，；。]*/g,
  /需達大戶[^；。]*/g, // 資產資格，金額不當消費門檻
  /與[^，；。]{0,8}自動扣繳[^，；。]*/g, // 說明上限怎麼共用，不是條件
  /自動扣繳版/g,
  /授權自動扣款/g, // 排除項目
  /未申請帳單e化者/g, // 說明沒申請的那一檔
  /官方頁未載明[^，；。]*/g, // 沒寫就是沒有
  /每滿[^，；。]*/g, // 每滿 N 元回饋 1 點是回饋算法，不是門檻
  /現折優惠[^；。]*/g, // 現折優惠本站未收錄
  /資產[^，；。]*/g, // 資產金額不當消費門檻（asset 另用原文判斷）
  /(上限|最高)[^，；。]*/g,
];

const num = (s, unit) => {
  const n = Number(s.replace(/,/g, ""));
  return unit === "萬" ? n * 10000 : unit === "千" ? n * 1000 : n;
};
const AMOUNT = /(?:NT\$?|\$)?\s*([\d,]+(?:\.\d+)?)(?![\d.,]*[%％])\s*(萬|千)?/g;

// 當月／累積消費滿 X、達成任務、單筆滿 X 且 X > 500
function hasSpend(s) {
  for (const part of s.split(/[；。，]/)) {
    const trig = /(滿|達|超過|以上|累積|累計|符合.*項)/.test(part);
    if (!trig) continue;
    const amounts = [...part.matchAll(AMOUNT)].map((m) => num(m[1], m[2]));
    if (/(單筆|每筆|單次)/.test(part)) {
      if (amounts.some((a) => a > 500)) return true;
    } else if (amounts.length || /[家項]/.test(part)) return true;
  }
  return false;
}

// 須／需…綁定（帳戶、證券交割戶不算：那是扣繳或資產條件）
const NEED_BIND = /(須|需)[^，；。]{0,30}綁定(?![^，；。]{0,8}(帳戶|交割戶))/;

function tagString(s, tags) {
  const t = NEUTRAL.reduce((x, re) => x.replace(re, ""), s);
  if (/資產|存款|AUM|大戶|理財|財富管理|貴賓|子女帳戶|薪轉|持有外幣/i.test(s)) tags.add("asset");
  if (/切換|任意選方案|UP選方案/.test(t)) tags.add("plan");
  if (/限量|名額|前\s*\d+\s*名|額滿|贈完/.test(t)) tags.add("quota");
  if (/(?<!免)登錄|連結[^，；。]*會員|註冊會員|會員卡|同一身分證|已綁定LINE Pay卡|^綁定[^，；。]*聯名卡/.test(t) || NEED_BIND.test(t)) tags.add("register");
  if (/電子帳單|帳單e化|行動帳單|電子或行動帳單/.test(t)) tags.add("ebill");
  if (/自動扣繳|自動授扣|自扣|自動扣款|帳戶扣繳|自動轉帳扣款/.test(t)) tags.add("autopay");
  if (/新戶|首刷|新申辦(?!核卡)|新辦|未持有[^，；。]*信用卡/.test(t)) tags.add("newcard");
  if (hasSpend(t) || /(須|需)完成[^，；。]*任務|符合[^，；。]*資格條件/.test(t)) tags.add("spend");
}

export function tagsFor(rule) {
  if (OVERRIDES[rule.id]) return OVERRIDES[rule.id];
  const tags = new Set();
  for (const s of [...(rule.conditions || []), rule.plan || ""]) tagString(s, tags);
  return [...tags].sort();
}

export function loadRules(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const file = path.join(dir, f);
    const bank = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const card of bank.cards || []) {
      if (card.verified !== true) continue;
      for (const rule of card.rules || []) out.push({ file, rule });
    }
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "banks");
  const all = loadRules(dir);
  const mode = process.argv[2];
  if (mode === "--jsonl") {
    for (const { rule } of all) console.log(JSON.stringify({ id: rule.id, conditionTags: tagsFor(rule) }));
  } else if (mode === "--write") {
    const byFile = new Map();
    for (const { file, rule } of all) byFile.set(file, [...(byFile.get(file) || []), rule]);
    const out = [];
    for (const [file, rules] of byFile) {
      let text = fs.readFileSync(file, "utf8");
      for (const rule of rules) text = insertTags(text, rule.id, tagsFor(rule));
      out.push([file, text]);
    }
    for (const [file, text] of out) fs.writeFileSync(file, text); // 全部算好才寫，中途出錯不留半套
    console.log(`已寫入 ${all.length} 條規則`);
  } else {
    const count = Object.fromEntries(TAGS.map((t) => [t, 0]));
    let empty = 0;
    for (const { rule } of all) {
      const tags = tagsFor(rule);
      if (!tags.length) empty++;
      for (const t of tags) count[t]++;
    }
    console.log(`規則 ${all.length} 條，覆寫 ${Object.keys(OVERRIDES).length} 條，無標籤 ${empty} 條`);
    console.log(count);
  }
}

// 掃出規則物件裡最外層的 key 位置（略過字串與巢狀），回傳 { end, keys: {key: 起點} }
function scanObject(text, from) {
  let depth = 0;
  let i = from;
  const keys = {};
  while (i < text.length) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      if (depth === 0 && /^\s*:/.test(text.slice(j + 1, j + 6))) keys[text.slice(i + 1, j)] = i;
      i = j + 1;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      if (depth === 0) return { end: i, keys };
      depth--;
    }
    i++;
  }
  throw new Error("規則物件沒有結尾");
}

// 插入 conditionTags，不動其他內容：有 conditions 就放在它前面；沒有就放在 id 後面。
// 多行規則插一行（沿用縮排），單行規則插在同一行。
function insertTags(text, ruleId, tags) {
  const m = new RegExp(`"id":\\s*"${ruleId}"`).exec(text);
  if (!m) throw new Error(`找不到規則 ${ruleId}`);
  const { keys } = scanObject(text, m.index + m[0].length);
  if (keys.conditionTags !== undefined) throw new Error(`規則 ${ruleId} 已有 conditionTags`);
  const item = `"conditionTags": [${tags.map((t) => `"${t}"`).join(", ")}]`;
  let at = keys.conditions;
  if (at === undefined) {
    const after = m.index + m[0].length;
    if (text[after] !== ",") throw new Error(`規則 ${ruleId} 沒有 conditions，且 id 後面不是逗號`);
    at = after + 1;
    // id 行後面是換行：插到下一行；否則插在同一行的逗號後面
    const nl = /^[ \t]*\n/.exec(text.slice(at));
    if (!nl) return text.slice(0, at) + " " + item + "," + text.slice(at);
    at += nl[0].length;
    const indent = /^[ \t]*/.exec(text.slice(at))[0];
    return text.slice(0, at) + indent + item + ",\n" + text.slice(at);
  }
  if (!text.slice(m.index, at).includes("\n")) return text.slice(0, at) + item + ", " + text.slice(at);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  return text.slice(0, lineStart) + text.slice(lineStart, at) + item + ",\n" + text.slice(lineStart);
}
