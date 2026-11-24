import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { latestCheckedAt, checkedAtBadge } from "../src/ui/footer.mjs";

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

describe("src/ui/footer.mjs — checkedAtBadge（頁首新鮮度燈，健檢 R4）", () => {
  test("14 天內：只寫日期，fresh", () => {
    assert.deepEqual(checkedAtBadge("2026-11-11", "2026-11-25"), { text: "最近核對 11/11", level: "fresh", days: 14 });
  });
  test("超過 14 天：stale，加一句提醒", () => {
    assert.deepEqual(checkedAtBadge("2026-10-31", "2026-11-25"), { text: "最近核對 10/31，部分資料可能已更新", level: "stale", days: 25 });
  });
  test("45 天以上：old；跨年也算對", () => {
    assert.equal(checkedAtBadge("2026-11-20", "2027-01-04").level, "old");
    assert.equal(checkedAtBadge("2026-11-20", "2027-01-04").days, 45);
  });
  test("沒有日期回傳 null", () => {
    assert.equal(checkedAtBadge(null, "2026-11-25"), null);
  });
});
