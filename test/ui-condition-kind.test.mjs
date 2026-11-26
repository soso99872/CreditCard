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

  test("講「怎樣會變少」的句子 → downgrade（不標必須，免得讀成要去做）", () => {
    for (const s of [
      "綁定第三方行動支付（如LINE Pay、街口支付）結帳僅享0.88%",
      "臺北捷運感應支付僅0.3%",
      "TWQR 形式消費僅享一般消費 1%，不適用精選通路加碼",
      "網路交易、條碼支付、第三方支付不算國外實體商店（僅一般1%）",
    ]) assert.equal(conditionKind(s), "downgrade", s);
    // 開頭是要做的事、或寫「才適用」的，仍是必須
    for (const s of [
      "需設定富邦帳戶自動扣繳信用卡費或申請電子帳單，否則僅0.5%回饋",
      "直接刷卡，或以LINE Pay、街口支付綁定iLEO付款才適用；綁其他電子支付（如悠遊付）帳單商家名稱不符，只有基本0.5%",
      "藥局僅一般實體門市（便利商店/量販店複合門市/機場店除外）；大樹藥局限全臺大樹實體門市、大樹健康購物網及官方APP；杏一醫療限全臺杏一實體門市（非開立杏一發票之門市不加碼）",
      "帳單通路名稱須符合樂天系統（LINE Pay 顯示連加*、連支*、LINE PAY*等），不符僅享一般回饋",
    ]) assert.equal(conditionKind(s), "required", s);
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
