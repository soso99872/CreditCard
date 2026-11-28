import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildResultList, betterGatedCount } from "../src/ui/result-list.mjs";

const r = (cardId, group, effectiveRate) => ({ cardId, group, effectiveRate });

describe("src/ui/result-list.mjs — buildResultList", () => {
  const recs = [r("a", "direct", 3), r("b", "direct", 2), r("c", "direct", 1), r("a", "gated", 5), r("d", "gated", 4)];

  test("開（只看無腦刷）：只留 direct，順序不變", () => {
    assert.deepEqual(buildResultList(recs, true).map((x) => x.cardId), ["a", "b", "c"]);
  });

  test("關：每張卡只留實拿最高那列，全部由高到低，有門檻的可排第 1", () => {
    const out = buildResultList(recs, false);
    assert.deepEqual(out.map((x) => `${x.cardId}:${x.group}`), ["a:gated", "d:gated", "b:direct", "c:direct"]);
  });

  test("關：同分維持原順序", () => {
    const out = buildResultList([r("x", "direct", 2), r("y", "direct", 2), r("z", "direct", 2)], false);
    assert.deepEqual(out.map((x) => x.cardId), ["x", "y", "z"]);
  });

  test("空清單、undefined 不會丟錯", () => {
    assert.deepEqual(buildResultList([], false), []);
    assert.deepEqual(buildResultList(undefined, true), []);
  });

  test("betterGatedCount：關掉開關會多出幾張有條件、比第 1 名高的卡（同卡只算一次）", () => {
    assert.equal(betterGatedCount(recs, recs[0]), 2); // a 有條件 5%、d 4% 都高過無腦刷第 1 名 a 3%
    assert.equal(betterGatedCount(recs, r("x", "direct", 9)), 0);
    assert.equal(betterGatedCount(recs, null), 2);
    assert.equal(betterGatedCount([], null), 0);
  });
});
