/**
 * 「要注意」每一條是哪一種（sprint 012）：
 *   required＝不做就拿不到（要做的動作、限定通路或支付、排除項目、門檻）
 *   optional＝做了另有加碼、可選的支付方式、未計入本回饋率的另享
 *   downgrade＝講「怎樣會變少」的句子（「綁第三方支付僅享0.88%」），標「必須」會讀成要去做（主管第 1 輪問題 2）
 *   info＝上限、計算方式、回饋時間、有效期、資料註記，不是要使用者做的事
 * 自由文字列舉不完，判斷不了一律 required（寧可多提醒）。
 * @param {string} text 規則 conditions 的一條
 * @returns {"required" | "optional" | "downgrade" | "info"}
 */
export function conditionKind(text) {
  const s = String(text || "").trim();
  if (REQUIRED.test(s)) return "required";
  if (OPTIONAL.test(s)) return "optional";
  if (/^無基本|實際可能/.test(s)) return "info";
  if (DOWNGRADE.test(s)) return "downgrade";
  if (INFO.test(s)) return "info";
  return "required";
}

// 開頭就是要做的事或限定（「上限」「線上」「限量」「限額」不算），或寫明要符合資格
const REQUIRED = /^(level\s*\d+\s*：\s*)?[需須]|[需須]符合|才適用|^[^；，]{0,8}(?<![上線])限(?![量額])/i;

const INFO = new RegExp([
  "(?<!線)上限", "最高可刷", "可刷約", "(合併|分開)計算", "共用", "有效", "統一回饋", "服務費", "即享",
  "待確認", "不一致", "未收錄", "取自", "原文", "文章", "不再享", "預設排序", "^國外消費指",
  "發放", "扣抵", "折抵次期", "兌換", "活動至", "一覽頁", "鎖定至", "[以依][^，；]*計算",
].join("|"), "i");

const OPTIONAL = /^可[綁用使]|另享|另計/;

// 句子主幹是「變少的結果」：僅享、僅 X%、僅一般消費／回饋、只有基本、基本只有 X%（開頭是要做的事、或寫「才適用」時，上面 REQUIRED 先接走）
const DOWNGRADE = /僅享|僅\s*\d|僅一般(消費|回饋|\s*\d)|只有基本|只有[^，；]{0,6}\d/;
