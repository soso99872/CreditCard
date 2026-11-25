// 未輸入時的常用商家（T19）與情境入口（sprint 009 T07）。商家用名稱查，情境直接查類別。
// 資料裡找不到的項目（例如預覽資料沒有該商家）不顯示，避免點了沒結果。

import { normalize } from "../engine/index.mjs";

export const QUICK_PICKS = [
  { kind: "merchant", name: "全聯" },
  { kind: "merchant", name: "7-11" },
  { kind: "merchant", name: "全家" },
  { kind: "merchant", name: "星巴克" },
  { kind: "merchant", name: "蝦皮" },
  { kind: "merchant", name: "麥當勞" },
];

// 情境入口（sprint 009 T07）：第一屏 4 張等寬小卡，點了查該類別。label 是卡上的字，name 是類別在資料裡的名稱（查詢、最近查詢用）。
export const SCENARIOS = [
  { kind: "category", id: "convenience-store", name: "超商", label: "超商" },
  { kind: "category", id: "online-shopping", name: "網購", label: "網購" },
  { kind: "category", id: "gas", name: "加油", label: "加油" },
  { kind: "category", id: "overseas", name: "海外", label: "海外" },
];

/** 情境入口：類別 id 在資料裡才顯示。 */
export function resolveScenarios(data) {
  const categoryIds = new Set((data?.categories || []).map((c) => c.id));
  return SCENARIOS.filter((s) => categoryIds.has(s.id));
}

/**
 * @param {{merchants?: Array<{name: string, aliases?: string[]}>, categories?: Array<{id: string}>}} data
 * @returns {typeof QUICK_PICKS}
 */
export function resolveQuickPicks(data) {
  const merchantNames = new Set();
  for (const m of data?.merchants || []) {
    for (const n of [m.name, ...(m.aliases || [])]) merchantNames.add(normalize(n));
  }
  return QUICK_PICKS.filter((p) => merchantNames.has(normalize(p.name)));
}
