#!/usr/bin/env node
// 判斷每張卡的回饋單位 rewardUnit（現金回饋／刷卡金／點數名稱），寫進 data/banks/*.json。
// 用法：node scripts/reward-unit.mjs            統計有單位幾張、待確認幾張
//       node scripts/reward-unit.mjs --jsonl    每張卡輸出 {"id","rewardUnit"}；判斷不了的不輸出
//       node scripts/reward-unit.mjs --pending  列待確認卡與缺 twdPerPoint 的點數卡
//       node scripts/reward-unit.mjs --write    寫回 data/banks/*.json（卡層與規則層覆寫）
// 原則：有 pointValue.unit 就用它；否則看一般消費那條的 rawReward 有沒有明寫單位；都沒有才看全部規則是否只有一種單位。判斷不了就不填，不猜。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// [原文寫法, 單位名]，由具體到一般；原文錯字（台新Piont）在這裡改成正確寫法
const PATTERNS = [
  [/LINE POINTS?/i, "LINE POINTS"],
  [/OPENPOINT/i, "OPENPOINT"],
  [/ALL ME 點/, "ALL ME 點"],
  [/台新(Point|Piont)/i, "台新Point"],
  [/Gogoro Smart Points/i, "Gogoro Smart Points"],
  [/T Points/, "T Points"],
  [/蝦幣/, "蝦幣"],
  [/街口幣/, "街口幣"],
  [/台新K幣/, "台新K幣"],
  [/P幣/, "P幣"],
  [/玉山e point/i, "玉山e point"],
  [/現金回饋/, "現金回饋"],
  [/鑽金紅利/, "鑽金紅利"],
  [/好多金/, "好多金"],
  [/小樹點/, "小樹點"],
  [/現金積點/, "現金積點"],
  [/銀行點/, "銀行點"],
  [/刷卡金(?!額)/, "刷卡金"],
];

export const CASH_UNITS = new Set(["現金回饋", "刷卡金"]);

// 逐張看過原文後判斷不了的卡（id → 理由）；對照集也要求這幾張不輸出
export const PENDING = {
  "fubon-jcard": "原文「J Cash 現金折抵帳單，或 J Points 為 LINE POINTS」，由持卡人選，單一單位裝不下",
  "coop-kanahei": "原文只寫「回饋金1%」，沒寫是現金回饋還是點數",
  "bot-greengo": "原文只寫「回饋」「當期折抵」，沒寫單位名稱",
  "bok-gold": "原文只寫「回饋千分之一」（「刷卡金額」是消費金額不是單位）",
  "bok-titanium": "原文只寫「回饋千分之一」（「刷卡金額」是消費金額不是單位）",
};

// 規則層單位跟卡不同的（規則 id → 單位）
export const RULE_OVERRIDES = {
  "rakuten-tiger-designated": "tigerpoints",
  "fubon-momo-store": "mo幣",
};

export function unitOf(text) {
  for (const [re, unit] of PATTERNS) if (re.test(text || "")) return unit;
  return null;
}

// 回傳 { unit, why }；unit 為 null 表示待確認
export function cardUnit(card) {
  if (PENDING[card.id]) return { unit: null, why: PENDING[card.id] };
  if (card.pointValue?.unit) return { unit: card.pointValue.unit, why: "既有 pointValue.unit" };
  const first = card.rules.find((r) => r.scope?.type === "general") || card.rules[0];
  const u = unitOf(first?.rawReward);
  if (u) return { unit: u, why: `一般消費原文：${(first.rawReward || "").slice(0, 40)}` };
  const all = new Set(card.rules.map((r) => unitOf(r.rawReward)).filter(Boolean));
  if (all.size === 1) return { unit: [...all][0], why: "一般消費原文沒寫單位，其他規則原文只有這一種" };
  return { unit: null, why: all.size ? `各規則單位不一致：${[...all].join("、")}` : "原文只寫「回饋」，沒寫單位" };
}

export function loadCards(dir) {
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
    const file = path.join(dir, f);
    for (const card of JSON.parse(fs.readFileSync(file, "utf8")).cards) out.push({ file, card });
  }
  return out;
}

// 在 "id": "<id>" 那行之後插一行（沿用該行縮排與換行字元）；name 行在 id 之後，卡層插在 name 行後
function insertAfter(text, lineRe, line) {
  const m = lineRe.exec(text);
  if (!m) throw new Error(`找不到 ${lineRe}`);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const at = m.index + m[0].length;
  return text.slice(0, at) + eol + m[1] + line + text.slice(at);
}


if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "banks");
  const all = loadCards(dir).map((x) => ({ ...x, ...cardUnit(x.card) }));
  const mode = process.argv[2];
  const filled = all.filter((x) => x.unit);
  if (mode === "--jsonl") {
    for (const x of filled) console.log(JSON.stringify({ id: x.card.id, rewardUnit: x.unit }));
  } else if (mode === "--pending") {
    for (const x of all.filter((y) => !y.unit)) console.log(`待確認｜${x.card.id}｜${x.card.name}｜${x.why}`);
    for (const x of filled.filter((y) => !CASH_UNITS.has(y.unit) && !y.card.pointValue)) console.log(`缺twdPerPoint｜${x.card.id}｜${x.card.name}｜${x.unit}`);
  } else if (mode === "--write") {
    const byFile = new Map();
    for (const x of filled) byFile.set(x.file, [...(byFile.get(x.file) || []), x]);
    const out = [];
    for (const [file, items] of byFile) {
      let text = fs.readFileSync(file, "utf8");
      for (const { card, unit } of items) {
        if (card.rewardUnit !== undefined) continue;
        text = insertAfter(text, new RegExp(`^( {6})"id": "${card.id}",[^\n]*\n? *"name": "[^"]*",?`, "m"), `"rewardUnit": ${JSON.stringify(unit)},`);
        for (const r of card.rules) {
          const ru = RULE_OVERRIDES[r.id];
          if (!ru || r.rewardUnit !== undefined) continue;
          const inline = `{"id": "${r.id}", `; // 有些檔的規則寫成單行
          text = text.includes(inline)
            ? text.replace(inline, `${inline}"rewardUnit": ${JSON.stringify(ru)}, `)
            : insertAfter(text, new RegExp(`^( {10})"id": "${r.id}",`, "m"), `"rewardUnit": ${JSON.stringify(ru)},`);
        }
      }
      out.push([file, text]);
    }
    for (const [file, text] of out) fs.writeFileSync(file, text); // 全部算好才寫
    console.log(`已寫入 ${filled.length} 張卡的 rewardUnit`);
  } else {
    const dist = {};
    for (const x of filled) dist[x.unit] = (dist[x.unit] || 0) + 1;
    console.log(`有單位 ${filled.length} 張，待確認 ${all.length - filled.length} 張，合計 ${all.length}`);
    for (const [u, n] of Object.entries(dist).sort((a, b) => b[1] - a[1])) console.log(`${n}\t${u}`);
  }
}
