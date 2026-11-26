import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { conditionKind } from "../src/ui/condition-kind.mjs";

describe("src/ui/condition-kind.mjs — 要注意每條是必須、可選還是說明", () => {
  test("要做的動作、限定、排除、門檻 → required", () => {
    for (const s of [
      "需申請帳單e化",
      "LEVEL 2：需設定台新帳戶自動扣繳台新信用卡帳款（新申辦核卡60天內免設定亦享）",
      "綁定中國信託LINE Pay聯名卡並透過LINE Pay支付功能消費",
      "限官方網站",
      "分期付款消費不適用",
      "單筆結帳滿NT$300",
      "預設排序為第3順位，需符合4項以上資格條件才享有",
      "限新增一般消費，正附卡合併計算",
      "線上限臺灣官方網站；實體以簽單名稱判斷，百貨店中店（如UNIQLO、ZARA）不加碼",
      "加碼點數限量、贈完為止",
    ]) assert.equal(conditionKind(s), "required", s);
  });

  test("另享、另計、可選的支付方式 → optional", () => {
    for (const s of [
      "可綁 Apple Pay、Google Pay、Samsung Pay",
      "加碼部分，另計於蝦皮全站回饋之外",
      "日本交通儲值另享日韓5%加碼（各自上限），本條保守只計國內基本回饋",
    ]) assert.equal(conditionKind(s), "optional", s);
  });

  test("上限、計算、回饋時間、資料註記 → info", () => {
    for (const s of [
      "上限只計額外2.5%加碼部分",
      "每人每月上限150點",
      "正附卡合併計算",
      "紅利點數2年有效",
      "現金回饋於次月扣抵消費款，不得退還現金",
      "官方說法不一致（待確認）",
      "LEVEL 1：未設定帳戶自動扣繳即享",
    ]) assert.equal(conditionKind(s), "info", s);
  });

  test("判斷不了一律 required；空字串也不會壞", () => {
    assert.equal(conditionKind("依收單機構MCC碼認定之特約商店"), "required");
    assert.equal(conditionKind(""), "required");
    assert.equal(conditionKind(undefined), "required");
  });
});
