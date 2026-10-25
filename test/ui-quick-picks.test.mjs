import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { QUICK_PICKS, resolveQuickPicks } from "../src/ui/quick-picks.mjs";

describe("src/ui/quick-picks.mjs — 常用快捷（AC-21）", () => {
  test("清單含全聯、7-11、全家、星巴克、蝦皮、麥當勞與加油、海外兩個類別", () => {
    assert.deepEqual(
      QUICK_PICKS.map((p) => p.name),
      ["全聯", "7-11", "全家", "星巴克", "蝦皮", "麥當勞", "加油", "海外"]
    );
  });

  test("商家用名稱或別名對得到才顯示，類別 id 存在才顯示", () => {
    const data = {
      merchants: [
        { id: "px", name: "全聯", aliases: [] },
        { id: "seven", name: "統一超商", aliases: ["7-11"] },
      ],
      categories: [{ id: "gas", name: "加油" }],
    };
    assert.deepEqual(resolveQuickPicks(data).map((p) => p.name), ["全聯", "7-11", "加油"]);
  });

  test("資料是空的就沒有快捷", () => {
    assert.deepEqual(resolveQuickPicks({ merchants: [], categories: [] }), []);
    assert.deepEqual(resolveQuickPicks(null), []);
  });
});
