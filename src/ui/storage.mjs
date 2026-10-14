// 「我的卡片」存在瀏覽器 localStorage；讀寫都包在 try/catch，
// 存取失敗時（例如隱私模式封鎖、容量滿）仍可繼續使用畫面，只是不會記住清單。
// 見 PRD 4.「我的卡片」與 tasks.md T03。

const STORAGE_KEY = "cardpick:my-cards";

/**
 * 取得安全的 localStorage 參照。部分瀏覽器的隱私模式連存取 window.localStorage
 * 這個屬性本身都會丟錯，所以也要包 try/catch。
 * @param {object} [target] 預設 globalThis（瀏覽器為 window）
 * @returns {Storage | null}
 */
export function getSafeLocalStorage(target = globalThis) {
  try {
    return target.localStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 從 storage 讀出「我的卡片」id 清單。storage 不可用、沒有資料、或內容格式不對時回傳空陣列。
 * @param {Storage | null | undefined} storage
 * @returns {string[]}
 */
export function loadMyCardIds(storage) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string");
  } catch {
    return [];
  }
}

/**
 * 把「我的卡片」id 清單存回 storage。失敗時靜默失敗（畫面仍可用，只是不會保留）。
 * @param {Storage | null | undefined} storage
 * @param {string[]} ids
 * @returns {boolean} 是否存成功
 */
export function saveMyCardIds(storage, ids) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(ids));
    return true;
  } catch {
    return false;
  }
}

/**
 * 新增一張卡到「我的卡片」（已存在則不重複加入），並嘗試存回 storage。
 * @param {Storage | null | undefined} storage
 * @param {string[]} ids 目前的清單
 * @param {string} cardId
 * @returns {string[]} 新的清單（storage 存失敗時仍回傳更新後的記憶體清單，供畫面即時反映）
 */
export function addMyCardId(storage, ids, cardId) {
  const next = ids.includes(cardId) ? ids : [...ids, cardId];
  saveMyCardIds(storage, next);
  return next;
}

/**
 * 從「我的卡片」移除一張卡，並嘗試存回 storage。
 * @param {Storage | null | undefined} storage
 * @param {string[]} ids 目前的清單
 * @param {string} cardId
 * @returns {string[]} 新的清單
 */
export function removeMyCardId(storage, ids, cardId) {
  const next = ids.filter((id) => id !== cardId);
  saveMyCardIds(storage, next);
  return next;
}
