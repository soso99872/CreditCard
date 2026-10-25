import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { showsCategoryFallback, typedQueryEntry } from "../src/ui/entry.mjs";

describe("src/ui/entry.mjs — 查詢入口共用判斷（T19）", () => {
  const selected = { type: "category-selected", categoryId: "fuel", categoryName: "加油" };

  test("打字查不到（沒有 pickedCategory）才顯示類別快選面板", () => {
    assert.equal(showsCategoryFallback(selected, null), true);
  });

  test("從快捷、建議、最近查詢直接點類別，不顯示「找不到商家」面板", () => {
    assert.equal(showsCategoryFallback(selected, { id: "fuel", name: "加油" }), false);
  });

  test("商家、推測類別、空查詢都不顯示面板", () => {
    assert.equal(showsCategoryFallback({ type: "merchant" }, null), false);
    assert.equal(showsCategoryFallback({ type: "category-guess" }, null), false);
    assert.equal(showsCategoryFallback(null, null), false);
  });

  test("打字比對到商家或推測出類別才記進最近查詢", () => {
    assert.deepEqual(typedQueryEntry({ type: "merchant", merchantName: "蝦皮購物" }), { kind: "merchant", name: "蝦皮購物" });
    assert.deepEqual(typedQueryEntry({ type: "category-guess", categoryId: "cafe", categoryName: "咖啡" }), {
      kind: "category",
      id: "cafe",
      name: "咖啡",
    });
    assert.equal(typedQueryEntry({ type: "category-selected", categoryId: "general" }), null);
    assert.equal(typedQueryEntry({ type: "empty" }), null);
    assert.equal(typedQueryEntry(null), null);
  });
});
