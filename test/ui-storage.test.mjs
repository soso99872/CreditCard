import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  getSafeLocalStorage,
  loadMyCardIds,
  saveMyCardIds,
  addMyCardId,
  removeMyCardId,
} from "../src/ui/storage.mjs";

/** 用 Map 模擬 Storage 介面（getItem/setItem），不依賴瀏覽器環境。 */
function makeFakeStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
  };
}

/** 模擬隱私模式等情況：存取 storage 就丟錯。 */
function makeThrowingStorage() {
  return {
    getItem() {
      throw new Error("storage blocked");
    },
    setItem() {
      throw new Error("storage blocked");
    },
  };
}

describe("src/ui/storage.mjs — getSafeLocalStorage", () => {
  test("正常情況回傳 target.localStorage", () => {
    const storage = makeFakeStorage();
    assert.equal(getSafeLocalStorage({ localStorage: storage }), storage);
  });

  test("target 沒有 localStorage 時回傳 null", () => {
    assert.equal(getSafeLocalStorage({}), null);
  });

  test("存取 localStorage 屬性本身就丟錯時（例如隱私模式）回傳 null，不往外丟", () => {
    const target = {
      get localStorage() {
        throw new Error("blocked");
      },
    };
    assert.equal(getSafeLocalStorage(target), null);
  });
});

describe("src/ui/storage.mjs — 讀寫（我的卡片存在 localStorage，重新整理後保留，AC-11）", () => {
  test("storage 是 null／undefined 時，讀取回空陣列，不丟錯", () => {
    assert.deepEqual(loadMyCardIds(null), []);
    assert.deepEqual(loadMyCardIds(undefined), []);
  });

  test("沒有存過任何資料時讀取回空陣列", () => {
    assert.deepEqual(loadMyCardIds(makeFakeStorage()), []);
  });

  test("saveMyCardIds 存入後，loadMyCardIds 讀得到同一份清單", () => {
    const storage = makeFakeStorage();
    assert.equal(saveMyCardIds(storage, ["a", "b", "c"]), true);
    assert.deepEqual(loadMyCardIds(storage), ["a", "b", "c"]);
  });

  test("storage 內容不是合法 JSON 或不是陣列時，讀取回空陣列", () => {
    const storage = makeFakeStorage();
    storage.setItem("cardpick:my-cards", "{not json");
    assert.deepEqual(loadMyCardIds(storage), []);

    storage.setItem("cardpick:my-cards", JSON.stringify({ not: "an array" }));
    assert.deepEqual(loadMyCardIds(storage), []);
  });

  test("陣列中混入非字串元素時會被過濾掉", () => {
    const storage = makeFakeStorage();
    storage.setItem("cardpick:my-cards", JSON.stringify(["a", 1, null, "b"]));
    assert.deepEqual(loadMyCardIds(storage), ["a", "b"]);
  });

  test("storage 讀寫丟錯時（try/catch）仍回傳安全的預設值，畫面可以繼續用", () => {
    const storage = makeThrowingStorage();
    assert.deepEqual(loadMyCardIds(storage), []);
    assert.equal(saveMyCardIds(storage, ["a"]), false);
  });

  test("storage 是 null 時 saveMyCardIds 回傳 false，不丟錯", () => {
    assert.equal(saveMyCardIds(null, ["a"]), false);
  });
});

describe("src/ui/storage.mjs — addMyCardId／removeMyCardId", () => {
  test("加入新卡片會存進清單；加入已存在的卡片不會重複（AC-11）", () => {
    const storage = makeFakeStorage();
    let ids = addMyCardId(storage, [], "card-a");
    assert.deepEqual(ids, ["card-a"]);
    ids = addMyCardId(storage, ids, "card-b");
    assert.deepEqual(ids, ["card-a", "card-b"]);
    ids = addMyCardId(storage, ids, "card-a");
    assert.deepEqual(ids, ["card-a", "card-b"]);
    assert.deepEqual(loadMyCardIds(storage), ["card-a", "card-b"]);
  });

  test("移除卡片後清單只剩其他卡片，且已存回 storage（AC-11：加 3 張移除 1 張剩 2 張）", () => {
    const storage = makeFakeStorage();
    let ids = ["card-a", "card-b", "card-c"];
    saveMyCardIds(storage, ids);
    ids = removeMyCardId(storage, ids, "card-b");
    assert.deepEqual(ids, ["card-a", "card-c"]);
    assert.deepEqual(loadMyCardIds(storage), ["card-a", "card-c"]);
  });

  test("移除不存在的卡片 id 不影響清單", () => {
    const storage = makeFakeStorage();
    const ids = removeMyCardId(storage, ["card-a"], "not-in-list");
    assert.deepEqual(ids, ["card-a"]);
  });

  test("storage 丟錯時，記憶體中的清單仍正確更新（畫面即時反映，只是不保留）", () => {
    const storage = makeThrowingStorage();
    const ids = addMyCardId(storage, [], "card-a");
    assert.deepEqual(ids, ["card-a"]);
  });
});
