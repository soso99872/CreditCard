import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { bankColor, bankColorOrder, CARD_HUES } from "../src/ui/card-color.mjs";

describe("src/ui/card-color.mjs — bankColorOrder（依銀行第一次出現的順序配色，不是依名次）", () => {
  test("依出現順序列出不重複的 bankId", () => {
    const recs = [{ bankId: "cathay" }, { bankId: "esun" }, { bankId: "cathay" }, { bankId: "ctbc" }];
    assert.deepEqual(bankColorOrder(recs), ["cathay", "esun", "ctbc"]);
  });

  test("空清單或 undefined 不丟錯", () => {
    assert.deepEqual(bankColorOrder([]), []);
    assert.deepEqual(bankColorOrder(undefined), []);
  });

  test("忽略沒有 bankId 的項目", () => {
    assert.deepEqual(bankColorOrder([{ bankId: "cathay" }, {}, { bankId: "esun" }]), ["cathay", "esun"]);
  });
});

describe("src/ui/card-color.mjs — bankColor（照抄 d-wallet.html 目前版本的 bankColor()：同一家銀行同色）", () => {
  test("同一家銀行不管名次都用同一個顏色", () => {
    const order = bankColorOrder([{ bankId: "cathay" }, { bankId: "cathay" }]);
    assert.equal(bankColor("cathay", order), bankColor("cathay", order));
  });

  test("不同銀行依第一次出現的順序分配 CARD_HUES[0]、[1]、...", () => {
    const order = bankColorOrder([{ bankId: "cathay" }, { bankId: "esun" }, { bankId: "ctbc" }]);
    assert.equal(bankColor("cathay", order), `hsl(${CARD_HUES[0]} 36% 30%)`);
    assert.equal(bankColor("esun", order), `hsl(${CARD_HUES[1]} 36% 30%)`);
    assert.equal(bankColor("ctbc", order), `hsl(${CARD_HUES[2]} 36% 30%)`);
  });

  test("超過 8 家銀行時色相循環使用", () => {
    const banks = Array.from({ length: 10 }, (_, i) => `bank-${i}`);
    const order = bankColorOrder(banks.map((bankId) => ({ bankId })));
    assert.equal(bankColor("bank-8", order), bankColor("bank-0", order));
    assert.equal(bankColor("bank-9", order), bankColor("bank-1", order));
  });

  test("找不到的 bankId（理論上不會發生）不丟錯，退回第一個色相", () => {
    assert.equal(bankColor("unknown-bank", []), `hsl(${CARD_HUES[0]} 36% 30%)`);
  });
});
