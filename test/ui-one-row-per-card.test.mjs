// sprint 012 C 段（老闆 2026-11-26 11:26）：同一張卡只列一次；只差切方案的卡，開關關列方案並寫「需切換：方案名」，開關開列基本、不標限制。
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { recommend } from "../src/engine/recommend.mjs";
import { loadAllData } from "../src/engine/data-loader.mjs";
import { buildResultList, needText, planItem } from "../src/ui/result-list.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const readJson = async (p) => JSON.parse(await readFile(path.join(ROOT, p), "utf8"));
const data = await loadAllData({ baseUrl: "data/", fetchJson: readJson });
const list = (query, onlyDirect) => buildResultList(recommend({ ...data, query, today: "2026-11-28" }).recommendations, onlyDirect);

describe("真資料：同一張卡只列一次", () => {
  for (const query of ["Mia C'bon", "全聯", "蝦皮", "加油", "海外"]) {
    for (const onlyDirect of [true, false]) {
      test(`${query}／只看無腦刷${onlyDirect ? "開" : "關"}：cardId 不重複`, () => {
        const ids = list(query, onlyDirect).map((r) => r.cardId);
        assert.ok(ids.length > 0);
        assert.equal(new Set(ids).size, ids.length);
      });
    }
  }

  test("Mia C'bon CUBE：關＝1.2%「需切換：固定回饋」；開＝0.3%、不標限制", () => {
    const off = list("Mia C'bon", false).filter((r) => r.cardId === "cathay-cube");
    assert.equal(off.length, 1);
    assert.equal(off[0].rate, 1.2);
    assert.equal(off[0].group, "gated");
    assert.equal(needText(off[0]), "需切換：固定回饋");
    assert.deepEqual(planItem(off[0]), { kind: "required", text: "需切換：固定回饋" });

    const on = list("Mia C'bon", true).filter((r) => r.cardId === "cathay-cube");
    assert.equal(on.length, 1);
    assert.equal(on[0].rate, 0.3);
    assert.equal(on[0].group, "direct");
    assert.equal(planItem(on[0]), null);
  });
});

describe("needText／planItem", () => {
  const rec = (o) => ({ cardId: "x", group: "gated", effectiveRate: 1, plan: "", conditionTags: [], ...o });

  test("方案卡沒有比基本好的方案：只剩基本那列，不標任何限制", () => {
    const out = buildResultList([rec({ group: "direct", effectiveRate: 1 })], false);
    assert.equal(out.length, 1);
    assert.equal(out[0].group, "direct");
    assert.equal(needText(out[0]), "");
    assert.equal(planItem(out[0]), null);
  });

  test("切方案加其他門檻：兩段都寫", () => {
    assert.equal(needText(rec({ plan: "A 方案", conditionTags: ["plan", "asset", "register"] })), "需切換：A 方案；需要：資產門檻");
  });

  test("有 plan 標籤但沒方案名：照舊寫「需要：切換方案」", () => {
    assert.equal(needText(rec({ conditionTags: ["plan"] })), "需要：切換方案");
  });

  test("沒有 plan 標籤的方案名（卡別、級距）歸說明，不當限制", () => {
    assert.deepEqual(planItem(rec({ group: "direct", plan: "大大（基本）" })), { kind: "info", text: "方案：大大（基本）" });
  });
});
