// 查詢範圍、金額輸入、推薦清單截斷等與 DOM 無關的純邏輯，抽出來方便單元測試。
// 見 PRD 4.「我的卡片」、AC-01（前 10 名截斷）、AC-10（金額試算）、
// AC-11a／AC-11b（查詢範圍預設值與我的卡片為空時的提示）。

/** 查詢範圍的兩個值，避免字串打錯字。 */
export const SCOPE = Object.freeze({ MY: "my", ALL: "all" });

/**
 * 第一次開啟頁面時的查詢範圍，固定為「我的卡片」（AC-11a）。
 * @returns {string}
 */
export function defaultScope() {
  return SCOPE.MY;
}

/**
 * 查詢範圍為「我的卡片」且清單是空的時，該顯示一行加卡提示（不取代推薦清單，
 * 推薦清單這時改用全部卡別直接顯示結果）（PRD v2.2、AC-11b）。
 * @param {string} scope SCOPE.MY 或 SCOPE.ALL
 * @param {string[]} myCardIds
 * @returns {boolean}
 */
export function shouldPromptEmptyMyCards(scope, myCardIds) {
  return scope === SCOPE.MY && (!myCardIds || myCardIds.length === 0);
}

/**
 * 查詢時實際要用的查詢範圍：使用者選「我的卡片」但清單是空的時，自動改用「全部卡別」
 * 計算推薦清單，不用使用者自己手動切換（PRD v2.2、AC-11b）；一旦加入至少 1 張卡，
 * 就照使用者選的範圍走（預設「我的卡片」，見 AC-11a）。
 * @param {string} scope SCOPE.MY 或 SCOPE.ALL（使用者在畫面上選的範圍）
 * @param {string[]} myCardIds
 * @returns {string} 實際要傳給 recommend() 判斷 cardIds 篩選的範圍
 */
export function effectiveScope(scope, myCardIds) {
  return shouldPromptEmptyMyCards(scope, myCardIds) ? SCOPE.ALL : scope;
}

/**
 * 推薦清單預設只顯示前 limit 名，可以展開全部（AC-01）。
 * @param {Array} list 已排序的推薦清單
 * @param {boolean} showAll 使用者是否已按下「顯示全部」
 * @param {number} [limit] 預設 10
 * @returns {{ visible: Array, hasMore: boolean, total: number }}
 */
export function truncateTop(list, showAll, limit = 10) {
  const items = list || [];
  if (showAll) {
    return { visible: items, hasMore: false, total: items.length };
  }
  return {
    visible: items.slice(0, limit),
    hasMore: items.length > limit,
    total: items.length,
  };
}

/**
 * 解析金額輸入框的字串成金額試算用的數字；空白、非數字或負數都視為「未填」（undefined），
 * 這樣就不會把無效輸入當作 0 元傳給引擎，也不會噴錯誤。
 * @param {string} raw
 * @returns {number | undefined}
 */
export function parseAmount(raw) {
  if (raw === null || raw === undefined) return undefined;
  const trimmed = String(raw).trim();
  if (trimmed === "") return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return undefined;
  return n;
}

/** categories.json 中「一般消費」的固定 id，與 data/categories.json 的 `general` 對應。 */
export const GENERAL_CATEGORY_ID = "general";

/**
 * 查無商家、也推測不出類別時（engine 回傳 match.type "need-category"），
 * 不要求使用者先選類別，直接以「一般消費」當作保底類別呼叫 recommend()，
 * 讓畫面立刻顯示一般消費的回饋排行（PRD v2.2、AC-04）。
 * 使用者點了類別快選鈕後，selectedCategoryId 會變成實際類別，一樣透過這個函式回填，
 * 對引擎而言「merchant」「category-guess」兩種比對結果本來就不理會這個參數，傳了也無影響。
 * @param {string | null | undefined} selectedCategoryId
 * @returns {string}
 */
export function resolveSelectedCategoryId(selectedCategoryId) {
  return selectedCategoryId || GENERAL_CATEGORY_ID;
}

/**
 * 從「我的卡片」完整清單中，挑出目前資料裡看得到的 id（例如草稿卡在沒開
 * `?draft=1` 時看不到）。畫面顯示與查詢範圍判斷都只看這批；寫回 storage 時
 * 仍要用完整清單，避免看不到的 id 被覆寫掉而永久消失（tasks.md T17）。
 * @param {string[] | null | undefined} myCardIds 完整清單（含目前看不到的 id）
 * @param {Array<{id: string}> | null | undefined} cards 目前資料中看得到的卡片清單
 * @returns {string[]}
 */
export function visibleMyCardIds(myCardIds, cards) {
  const ids = myCardIds || [];
  const visibleIdSet = new Set((cards || []).map((card) => card.id));
  return ids.filter((id) => visibleIdSet.has(id));
}
