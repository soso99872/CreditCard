import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { latestCheckedAt } from "../src/ui/footer.mjs";

describe("src/ui/footer.mjs — latestCheckedAt（AC-15：頁尾顯示資料最後檢核日期）", () => {
  test("取全部卡片、全部規則中最新的 checkedAt", () => {
    const cards = [
      { rules: [{ checkedAt: "2026-01-01" }, { checkedAt: "2026-03-15" }] },
      { rules: [{ checkedAt: "2026-02-10" }] },
    ];
    assert.equal(latestCheckedAt(cards), "2026-03-15");
  });

  test("也會比較 pointValue.checkedAt", () => {
    const cards = [
      { pointValue: { checkedAt: "2026-05-01" }, rules: [{ checkedAt: "2026-01-01" }] },
    ];
    assert.equal(latestCheckedAt(cards), "2026-05-01");
  });

  test("沒有卡片或沒有任何 checkedAt 時回傳 null，不丟錯", () => {
    assert.equal(latestCheckedAt([]), null);
    assert.equal(latestCheckedAt(undefined), null);
    assert.equal(latestCheckedAt([{ rules: [] }]), null);
  });
});
