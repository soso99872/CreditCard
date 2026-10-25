// 「最近查詢」：最多 5 筆，存在 localStorage；讀寫都包 try/catch，storage 不可用時畫面照常，只是不記住（T19）。

const STORAGE_KEY = "cardpick:recent";
export const RECENT_LIMIT = 5;

/** 一筆最近查詢：商家 `{ kind: "merchant", name }`，類別 `{ kind: "category", id, name }`。 */
function isValidEntry(entry) {
  if (!entry || typeof entry.name !== "string" || entry.name === "") return false;
  if (entry.kind === "merchant") return true;
  return entry.kind === "category" && typeof entry.id === "string";
}

function sameEntry(a, b) {
  return a.kind === b.kind && (a.kind === "category" ? a.id === b.id : a.name === b.name);
}

export function loadRecent(storage) {
  if (!storage) return [];
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isValidEntry).slice(0, RECENT_LIMIT) : [];
  } catch {
    return [];
  }
}

function save(storage, list) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // 存不進去就算了，畫面仍用記憶體裡的清單
  }
}

/** 把一筆放到最前面（重複的先移除），超過 5 筆截掉最舊的；回傳新清單。 */
export function addRecent(storage, list, entry) {
  if (!isValidEntry(entry)) return list;
  const next = [entry, ...list.filter((item) => !sameEntry(item, entry))].slice(0, RECENT_LIMIT);
  save(storage, next);
  return next;
}

export function clearRecent(storage) {
  save(storage, []);
  return [];
}
