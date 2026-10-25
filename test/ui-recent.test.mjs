import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { loadRecent, addRecent, clearRecent, RECENT_LIMIT } from "../src/ui/recent.mjs";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe("src/ui/recent.mjs — 最近查詢（AC-21：最多 5 筆、重新整理後保留）", () => {
  test("新的排最前面，重複的移到最前面而不是多一筆", () => {
    const storage = fakeStorage();
    let list = [];
    list = addRecent(storage, list, { kind: "merchant", name: "全聯" });
    list = addRecent(storage, list, { kind: "category", id: "gas", name: "加油" });
    list = addRecent(storage, list, { kind: "merchant", name: "全聯" });
    assert.deepEqual(list.map((e) => e.name), ["全聯", "加油"]);
  });

  test("最多 5 筆，超過就丟掉最舊的", () => {
    const storage = fakeStorage();
    let list = [];
    for (let i = 1; i <= RECENT_LIMIT + 2; i += 1) {
      list = addRecent(storage, list, { kind: "merchant", name: `店${i}` });
    }
    assert.equal(list.length, RECENT_LIMIT);
    assert.equal(list[0].name, `店${RECENT_LIMIT + 2}`);
  });

  test("存進去後重新載入讀得回來；清除後是空的", () => {
    const storage = fakeStorage();
    addRecent(storage, [], { kind: "category", id: "coffee", name: "咖啡" });
    assert.deepEqual(loadRecent(storage), [{ kind: "category", id: "coffee", name: "咖啡" }]);
    clearRecent(storage);
    assert.deepEqual(loadRecent(storage), []);
  });

  test("storage 壞掉、內容格式不對、沒有 storage 都不會丟錯", () => {
    assert.deepEqual(loadRecent(null), []);
    assert.deepEqual(loadRecent(fakeStorage({ "cardpick:recent": "不是 JSON" })), []);
    assert.deepEqual(loadRecent(fakeStorage({ "cardpick:recent": '[{"kind":"x"},{"kind":"merchant","name":"全聯"}]' })).map((e) => e.name), ["全聯"]);
    const broken = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    assert.deepEqual(addRecent(broken, [], { kind: "merchant", name: "全聯" }).map((e) => e.name), ["全聯"]);
  });

  test("無效的項目（沒名稱、類別沒 id）不收", () => {
    assert.deepEqual(addRecent(fakeStorage(), [], { kind: "category", name: "加油" }), []);
    assert.deepEqual(addRecent(fakeStorage(), [], { kind: "merchant", name: "" }), []);
  });
});
