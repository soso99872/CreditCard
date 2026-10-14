// 資料疑點預檢：在派主管檢核前先跑，用規則比對找出「可能違反資料整理檢查清單」的地方。
// 這是啟發式檢查，列出的是疑點不是錯誤：主管優先抽查疑點，再隨機抽查其他規則。
// 用法：node scripts/precheck.mjs [資料目錄] [--bank <id>,<id>] [--strict]
// 「疑點」是可能違反檢查清單的規則；「提示」只是請主管順手看一眼（例如只有一般消費的卡，多數是正常的）。
// exit 0：一律（--strict 時有疑點就 exit 1，提示不影響）。必填欄位與格式錯誤由 validate.mjs 負責，這裡不重複。

import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// rawReward 出現關鍵字，conditions 卻沒提到時視為疑點（檢查清單第 3 項：條件寫全）
const CONDITION_HINTS = [
  { label: "登錄", raw: /登錄/, cond: /登錄/ },
  { label: "自動扣繳", raw: /自動扣繳|自動轉帳|自動授扣/, cond: /自動扣繳|自動轉帳|自動授扣/ },
  { label: "電子帳單", raw: /電子帳單|帳單e化/, cond: /電子帳單|帳單e化/ },
  { label: "滿額門檻", raw: /滿\s*(NT\$|新臺幣|新台幣)?\s*[\d,]+|達\s*(NT\$)?\s*[\d,]+\s*元/, cond: /滿|達|以上/ },
  { label: "限量名額", raw: /限量|名額|前\s*[\d,]+\s*名/, cond: /限量|名額|名/ },
  { label: "新戶限定", raw: /新戶/, cond: /新戶/ },
  { label: "切換方案", raw: /切換/, cond: /切換|方案/ },
];

const DATE_IN_TEXT = /20\d{2}\s*[\/年.-]\s*\d{1,2}\s*[\/月.-]\s*\d{1,2}/;

// 基本累點寫法（例如「每滿 NT$30 累積 1 點」「每消費滿 100 元可得 1 點」），只是回饋率的
// 原始換算方式，不是需要另外標 conditions 的滿額門檻，比對「滿額門檻」疑點前先排除這段文字
// （2026-10-14 主管回報：此前的版本會誤報，見 review-log.md「T11」）。
// 「累積」「可得」等動詞與點數之間，常夾著點數名稱（例如「活利積分」），用有限長度的
// 排除數字／標點的萬用比對吃掉這段名稱，避免漏判。
const BASIC_POINT_ACCRUAL_RE =
  /每\s*(?:消費)?\s*滿\s*(?:NT\$|新臺幣|新台幣)?\s*[\d,]+\s*元?\s*(?:即可|可)?\s*(?:累積|可得|可享|送|兌換?)[^\d,，。；]{0,10}[\d,]+\s*點/g;

function stripBasicPointAccrual(text) {
  return String(text).replace(BASIC_POINT_ACCRUAL_RE, "");
}

// 主管追加疑點 1：rawReward 或卡名含「點」「幣」「Point」，但沒有 pointValue（可能漏填點數換算）
const POINT_WORD_RE = /點|幣|Point/i;

// 主管追加疑點 4：sourceUrl 看起來是登入頁或申請頁，不是權益說明頁
const LOGIN_OR_APPLY_URL_RE = /login|apply/i;

// 主管追加疑點 3：coverage 的 reason 含糊其辭，看起來沒有逐卡查證
const VAGUE_REASON_RE = /時間有限|未查證|未逐一/;

function percentNumbers(text) {
  return [...String(text).matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));
}

export function precheckBank(bank) {
  const issues = [];
  const hints = [];
  const file = `banks/${bank.bankId}.json`;

  // 主管追加疑點 3：coverage 的 reason 含「時間有限」「未查證」「未逐一」
  for (const [idx, item] of (bank.coverage || []).entries()) {
    if (item?.status === "excluded" && VAGUE_REASON_RE.test(item.reason || "")) {
      issues.push(
        `[${file}] coverage[${idx}]（${item.cardName ?? "未命名"}）：reason 含「時間有限／未查證／未逐一」等字眼，確認是否已逐卡查證官方頁`
      );
    }
  }

  for (const card of bank.cards || []) {
    const rules = card.rules || [];
    const where = (r) => `[${file}] ${card.id}${r ? ` / ${r.id}` : ""}`;

    // 檢查清單第 1 項：權益全收
    if (rules.length > 0 && rules.every((r) => r.scope?.type === "general")) {
      hints.push(`${where()}：只有一般消費規則，確認官方頁是否還有類別、通路、海外或方案加碼`);
    }

    // 主管追加疑點 1：卡名含「點」「幣」「Point」，但沒有 pointValue
    if (!card.pointValue && POINT_WORD_RE.test(card.name || "")) {
      issues.push(`${where()}：卡名含「點／幣／Point」但沒有 pointValue，確認是否為點數回饋、是否漏填點數換算`);
    }

    // 主管追加疑點 4：卡片或點數換算的 sourceUrl 看起來是登入頁或申請頁
    if (LOGIN_OR_APPLY_URL_RE.test(card.sourceUrl || "")) {
      issues.push(`${where()}：sourceUrl（${card.sourceUrl}）看起來是登入頁或申請頁，確認是否為正確的權益說明頁`);
    }
    if (card.pointValue && LOGIN_OR_APPLY_URL_RE.test(card.pointValue.sourceUrl || "")) {
      issues.push(`${where()}：pointValue.sourceUrl（${card.pointValue.sourceUrl}）看起來是登入頁或申請頁，確認是否為正確的權益說明頁`);
    }

    for (const r of rules) {
      const raw = r.rawReward || "";
      const conds = (r.conditions || []).join("；");
      const scope = r.scope || {};

      for (const h of CONDITION_HINTS) {
        // 「滿額門檻」要先排除基本累點寫法（例如「每滿 NT$30 累積 1 點」），避免誤報
        const textForHint = h.label === "滿額門檻" ? stripBasicPointAccrual(raw) : raw;
        if (h.raw.test(textForHint) && !h.cond.test(conds)) {
          issues.push(`${where(r)}：rawReward 提到「${h.label}」，conditions 沒有對應標籤`);
        }
      }

      // 檢查清單第 2 項：範圍不放大
      if (scope.type === "merchant" && !(scope.merchants || []).length) {
        issues.push(`${where(r)}：merchant 規則沒有列出商家`);
      }
      if (scope.type === "category" && /指定|名單|特約|合作/.test(raw)) {
        issues.push(`${where(r)}：category 規則的原文提到指定或特約商家，官方若是商家名單應改用 merchant`);
      }
      // category 規則沒寫 basis（2026-10-14 主管要求加回，與上面的關鍵字檢查並存：
      // 2026-10-13 有人把這項結構檢查換成純關鍵字比對，造成漏報，見 review-log.md「T11」）
      if (scope.type === "category" && !scope.basis) {
        issues.push(`${where(r)}：scope.type 為 category 但沒有 scope.basis，確認官方是否以 MCC／行業別判定（請補 basis: "mcc"），若其實是商家名單應改用 merchant`);
      }

      // 檢查清單第 4 項：期間照官方
      if (r.validTo === null && DATE_IN_TEXT.test(raw)) {
        issues.push(`${where(r)}：rawReward 有日期但 validTo 為 null，確認官方是否有結束日`);
      }

      // 主管追加疑點 1：rawReward 含「點」「幣」「Point」，但沒有 pointValue
      if (!card.pointValue && POINT_WORD_RE.test(raw)) {
        issues.push(`${where(r)}：rawReward 含「點／幣／Point」但沒有 pointValue，確認是否為點數回饋、是否漏填點數換算`);
      }

      // 主管追加疑點 2：validFrom 等於 checkedAt，可能是用查閱日推算的起日而非官方公告的起日
      if (r.validFrom && r.validFrom === r.checkedAt) {
        issues.push(`${where(r)}：validFrom 等於 checkedAt，確認是否為官方公告的起日，而不是查閱當天推算的`);
      }

      // 主管追加疑點 4：規則的 sourceUrl 看起來是登入頁或申請頁
      if (LOGIN_OR_APPLY_URL_RE.test(r.sourceUrl || "")) {
        issues.push(`${where(r)}：sourceUrl（${r.sourceUrl}）看起來是登入頁或申請頁，確認是否為正確的權益說明頁`);
      }

      // 檢查清單第 5 項：上限正確
      const capText = (raw + conds).replace(/無(回饋)?上限|不設上限|上限無/g, "");
      if (r.cap === null && /上限|最高回饋|回饋最高/.test(capText)) {
        issues.push(`${where(r)}：文字提到上限但 cap 為 null`);
      }

      // 檢查清單第 6 項：不推算（現金回饋時 rate 應出現在原文）
      const nums = percentNumbers(raw);
      const isCash = !card.pointValue || card.pointValue.twdPerPoint === 1;
      if (isCash && nums.length > 0 && !nums.includes(Number(r.rate))) {
        issues.push(`${where(r)}：rate ${r.rate}% 不在 rawReward 的數字（${nums.join("、")}%）中，確認是否為推算或加總`);
      }
    }
  }
  return { issues, hints };
}

export async function precheck(dataDir, bankIds = null) {
  const dir = path.join(dataDir, "banks");
  const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const issues = [];
  const hints = [];
  for (const f of files) {
    const id = f.replace(/\.json$/, "");
    if (bankIds && !bankIds.includes(id)) continue;
    const bank = JSON.parse(await fs.readFile(path.join(dir, f), "utf8"));
    const r = precheckBank(bank);
    issues.push(...r.issues);
    hints.push(...r.hints);
  }
  return { issues, hints };
}

async function main() {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const bankIdx = args.indexOf("--bank");
  const bankIds = bankIdx >= 0 ? args[bankIdx + 1].split(",") : null;
  const dataDir = args.find((a, i) => !a.startsWith("--") && (bankIdx < 0 || i !== bankIdx + 1)) || "data";

  const { issues, hints } = await precheck(dataDir, bankIds);
  console.log(`預檢結果（資料目錄：${dataDir}）：疑點 ${issues.length} 項、提示 ${hints.length} 項。疑點不等於錯誤，交主管優先抽查。`);
  if (issues.length) console.log("\n疑點：");
  for (const i of issues) console.log(`  - ${i}`);
  if (hints.length) console.log("\n提示：");
  for (const h of hints) console.log(`  - ${h}`);
  process.exit(strict && issues.length ? 1 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
