import { test } from "node:test";
import assert from "node:assert/strict";
import { pickDemoCard } from "../src/ui/demo-pick.mjs";

const card = (name, extra = {}) => ({ cardName: name, plan: "", conditions: [], ...extra });

test("第 1 名沒有門檻就直接用它", () => {
  assert.equal(pickDemoCard([card("A"), card("B")]).cardName, "A");
});

test("有方案的第 1 名被跳過", () => {
  assert.equal(pickDemoCard([card("A", { plan: "大戶PLUS" }), card("B")]).cardName, "B");
});

test("條件有資產、存款、月均、等級、帳戶字眼的卡被跳過", () => {
  const gated = ["當月平均資產100萬", "存款達10萬", "月均餘額", "需達大戶PLUS等級", "需綁定指定帳戶自動扣繳"];
  for (const text of gated) {
    assert.equal(pickDemoCard([card("A", { conditions: [text] }), card("B")]).cardName, "B", text);
  }
});

test("只有登錄、上限這類條件不算門檻", () => {
  assert.equal(pickDemoCard([card("A", { conditions: ["須每月登錄", "每月上限NT$500"] })]).cardName, "A");
});

test("全部都有門檻、或清單空，回 null", () => {
  assert.equal(pickDemoCard([card("A", { plan: "x" }), card("B", { conditions: ["存款"] })]), null);
  assert.equal(pickDemoCard([]), null);
  assert.equal(pickDemoCard(undefined), null);
});
