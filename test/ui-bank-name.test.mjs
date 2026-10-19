import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { shortBankName } from "../src/ui/bank-name.mjs";

describe("src/ui/bank-name.mjs — shortBankName（卡面空間有限，照抄 d-wallet.html 的 shortBank()）", () => {
  test("去掉「商業銀行」字尾", () => {
    assert.equal(shortBankName("國泰世華商業銀行"), "國泰世華");
  });

  test("去掉「國際商業銀行」字尾", () => {
    assert.equal(shortBankName("中國信託商業銀行"), "中國信託");
  });

  test("去掉「(台灣)」與「商業儲蓄銀行」字尾", () => {
    assert.equal(shortBankName("滙豐(台灣)商業銀行"), "滙豐");
  });

  test("只有「銀行」字尾也會去掉", () => {
    assert.equal(shortBankName("台灣銀行"), "台灣");
  });

  test("沒有對應字尾時原樣回傳", () => {
    assert.equal(shortBankName("玉山"), "玉山");
  });

  test("空字串或未提供時回傳空字串，不丟錯", () => {
    assert.equal(shortBankName(""), "");
    assert.equal(shortBankName(undefined), "");
    assert.equal(shortBankName(null), "");
  });
});
