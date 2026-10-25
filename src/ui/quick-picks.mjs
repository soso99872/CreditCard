// 未輸入時的常用快捷（T19）：商家用名稱查，類別直接查類別。
// 資料裡找不到的項目（例如預覽資料沒有該商家）不顯示，避免點了沒結果。

import { normalize } from "../engine/index.mjs";

export const QUICK_PICKS = [
  { kind: "merchant", name: "全聯" },
  { kind: "merchant", name: "7-11" },
  { kind: "merchant", name: "全家" },
  { kind: "merchant", name: "星巴克" },
  { kind: "merchant", name: "蝦皮" },
  { kind: "merchant", name: "麥當勞" },
  { kind: "category", id: "gas", name: "加油" },
  { kind: "category", id: "overseas", name: "海外" },
];

/**
 * @param {{merchants?: Array<{name: string, aliases?: string[]}>, categories?: Array<{id: string}>}} data
 * @returns {typeof QUICK_PICKS}
 */
export function resolveQuickPicks(data) {
  const merchantNames = new Set();
  for (const m of data?.merchants || []) {
    for (const n of [m.name, ...(m.aliases || [])]) merchantNames.add(normalize(n));
  }
  const categoryIds = new Set((data?.categories || []).map((c) => c.id));
  return QUICK_PICKS.filter((p) =>
    p.kind === "merchant" ? merchantNames.has(normalize(p.name)) : categoryIds.has(p.id)
  );
}
