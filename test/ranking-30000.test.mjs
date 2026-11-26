// sprint 012 AC-03：真資料、全部卡別、填 30000，「只看無腦刷」開／關的第 1 名與試算金額。
// 期望值是組長用並行公式獨立重算的結果（sprints/012-cardpick-calc-toggle/checks/leader-calc-30000.txt），改 1 元就要失敗。
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { recommend } from "../src/engine/recommend.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";
import { buildResultList } from "../src/ui/result-list.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));
const data = await loadAllData({ baseUrl: "data/", fetchJson: readJson });
const TODAY = "2026-11-26";

const first = (query, onlyDirect) => {
  const { recommendations } = recommend({ ...data, query, today: TODAY, amount: 30000 });
  const [top] = buildResultList(recommendations, onlyDirect);
  return { cardId: top.cardId, amount: top.estimatedAmount };
};

describe("填 30000 的第 1 名（真資料、全部卡別）", () => {
  test("蝦皮：開關開、關都是滙豐 Live+ 1,352 元", () => {
    assert.deepEqual(first("蝦皮", true), { cardId: "hsbc-liveplus", amount: 1352 });
    assert.deepEqual(first("蝦皮", false), { cardId: "hsbc-liveplus", amount: 1352 });
  });

  test("全聯：關＝DAWHO 1,300 元（有門檻）、開＝凱基誠品 490 元", () => {
    assert.deepEqual(first("全聯", false), { cardId: "sinopac-dawho", amount: 1300 });
    assert.deepEqual(first("全聯", true), { cardId: "kgi-eslite", amount: 490 });
  });
});
