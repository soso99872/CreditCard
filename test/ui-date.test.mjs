import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { localToday } from "../src/ui/date.mjs";

describe("src/ui/date.mjs", () => {
  test("用本地日期組件（getFullYear/getMonth/getDate）組字串，不經過 toISOString()／UTC", () => {
    // 傳入只實作這三個方法的假物件，證明函式不會用 toISOString() 之類的 UTC 轉換，
    // 否則這個假物件會直接丟錯（沒有 toISOString 方法）。
    const fakeNow = { getFullYear: () => 2026, getMonth: () => 0, getDate: () => 5 };
    assert.equal(localToday(fakeNow), "2026-01-05");
  });

  test("月份與日期個位數要補零", () => {
    const fakeNow = { getFullYear: () => 2026, getMonth: () => 8, getDate: () => 1 };
    assert.equal(localToday(fakeNow), "2026-09-01");
  });

  test("月份從 0 開始，+1 才是人類看的月份", () => {
    const fakeNow = { getFullYear: () => 2026, getMonth: () => 11, getDate: () => 31 };
    assert.equal(localToday(fakeNow), "2026-12-31");
  });

  test("沒有帶參數時用真正的 Date，取本地年月日而非 UTC", () => {
    const now = new Date(2026, 9, 10); // 本地時間 2026-10-10
    assert.equal(localToday(now), "2026-10-10");
  });
});
