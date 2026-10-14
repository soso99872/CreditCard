// 網頁介面的進入點：負責載入資料、綁定畫面事件、呼叫推薦引擎並重新渲染。
// 只從 src/engine/index.mjs 匯入引擎 API（見 src/engine/README.md），不直接 import 引擎內部模組。
// 可測的純邏輯已抽到同目錄的 date.mjs、storage.mjs、query-params.mjs、view-state.mjs、footer.mjs，
// 本檔只處理 DOM，不另外寫測試（見 tasks.md T03）。

import { normalize, loadAllData, recommend } from "../engine/index.mjs";
import { localToday } from "./date.mjs";
import { getSafeLocalStorage, loadMyCardIds, addMyCardId, removeMyCardId } from "./storage.mjs";
import { resolveDataBaseUrl, isDraftMode } from "./query-params.mjs";
import {
  SCOPE,
  defaultScope,
  shouldPromptEmptyMyCards,
  effectiveScope,
  truncateTop,
  parseAmount,
  GENERAL_CATEGORY_ID,
  resolveSelectedCategoryId,
  visibleMyCardIds,
} from "./view-state.mjs";
import { latestCheckedAt } from "./footer.mjs";
import { findMerchantSuggestions } from "./suggest.mjs";

const els = {};

const state = {
  data: null, // loadAllData() 的結果
  loadError: null,
  storage: null,
  query: "",
  selectedCategoryId: null,
  amount: undefined,
  scope: defaultScope(),
  showAll: false,
  // 「我的卡片」存在 storage 的完整清單，含目前看不到的 id（例如未開 ?draft=1 時的
  // 草稿卡）；畫面顯示與查詢範圍一律用 currentVisibleMyCardIds() 篩出的子集，
  // 新增或移除時才操作這個完整清單，避免看不到的 id 被覆寫掉（tasks.md T17）。
  myCardIds: [],
  cardSearch: "",
  match: null,
  recommendations: [],
  draftMode: false, // ?draft=1 時為 true：loadAllData／recommend 都帶 includeUnverified（tasks.md T17）
};

/**
 * 目前資料中看得到的「我的卡片」id，見 state.myCardIds 的註解。
 * @returns {string[]}
 */
function currentVisibleMyCardIds() {
  return visibleMyCardIds(state.myCardIds, state.data?.cards);
}

function cacheEls() {
  els.loadError = document.getElementById("load-error");
  els.draftBanner = document.getElementById("draft-banner");
  els.querySection = document.getElementById("query-section");
  els.queryForm = document.getElementById("query-form");
  els.queryInput = document.getElementById("query-input");
  els.merchantSuggestions = document.getElementById("merchant-suggestions");
  els.categoryQuickPicker = document.getElementById("category-quick-picker");
  els.categoryQuickList = document.getElementById("category-quick-list");
  els.amountInput = document.getElementById("amount-input");
  els.scopeRadios = Array.from(document.querySelectorAll('input[name="scope"]'));
  els.matchHint = document.getElementById("match-hint");
  els.emptyMyCards = document.getElementById("empty-my-cards");
  els.addCardShortcutBtn = document.getElementById("add-card-shortcut-btn");
  els.resultsSection = document.getElementById("results-section");
  els.resultsList = document.getElementById("results-list");
  els.showAllBtn = document.getElementById("show-all-btn");
  els.myCardsSection = document.getElementById("my-cards-section");
  els.myCardsCount = document.getElementById("my-cards-count");
  els.myCardsList = document.getElementById("my-cards-list");
  els.cardSearchInput = document.getElementById("card-search-input");
  els.cardSearchResults = document.getElementById("card-search-results");
  els.footerCheckedAt = document.getElementById("footer-checked-at");
}

function bankNameById(bankId) {
  const issuer = state.data?.issuers.find((i) => i.id === bankId);
  return issuer ? issuer.name : bankId;
}

/**
 * 比對結果是不是「查無商家、也推測不出類別」而退回一般消費排行的狀態（AC-04）。
 * 畫面上這個狀態才需要顯示類別快選鈕；使用者點了快選鈕之後，match.categoryId
 * 會換成實際類別，但同一個查詢字串仍然落在這個分支，快選鈕要繼續顯示才能再切換。
 * @param {object | null} match
 * @returns {boolean}
 */
function isCategoryFallback(match) {
  return Boolean(match) && match.type === "category-selected";
}

function matchHintText(match) {
  if (!match) return "";
  switch (match.type) {
    case "category-guess":
      return `依名稱推測為「${match.categoryName}」類別。`;
    case "need-category":
      // 理論上不會再出現：recompute() 一律帶保底類別呼叫 recommend()，
      // 保留這個分支只是避免引擎行為變動時畫面整個不顯示任何提示。
      return "資料庫中找不到這個商家，請選擇類別：";
    case "category-selected":
      return match.categoryId === GENERAL_CATEGORY_ID
        ? "找不到符合的信用卡回饋商家，以一般消費回饋排序："
        : `依你選擇的「${match.categoryName}」類別查詢。`;
    default:
      return "";
  }
}

function renderRecommendation(rec) {
  const li = document.createElement("li");
  li.className = "rec-card";

  const title = document.createElement("h3");
  title.className = "rec-title";
  title.textContent = rec.plan
    ? `${bankNameById(rec.bankId)}　${rec.cardName}（${rec.plan}）`
    : `${bankNameById(rec.bankId)}　${rec.cardName}`;
  li.appendChild(title);

  const rate = document.createElement("p");
  rate.className = "rec-rate";
  rate.textContent = `回饋 ${rec.rateText}　${rec.capText}`;
  li.appendChild(rate);

  const reason = document.createElement("p");
  reason.className = "rec-reason";
  reason.textContent = rec.reason;
  li.appendChild(reason);

  if (rec.conditions && rec.conditions.length > 0) {
    const tagList = document.createElement("ul");
    tagList.className = "tag-list";
    for (const condition of rec.conditions) {
      const tag = document.createElement("li");
      tag.className = "tag";
      tag.textContent = condition;
      tagList.appendChild(tag);
    }
    li.appendChild(tagList);
  }

  if (typeof rec.estimatedAmount === "number") {
    const estimate = document.createElement("p");
    estimate.className = "rec-estimate";
    estimate.textContent = rec.capped
      ? `預估回饋約 ${rec.estimatedAmount} 元（已達上限）`
      : `預估回饋約 ${rec.estimatedAmount} 元`;
    li.appendChild(estimate);
  }

  const meta = document.createElement("p");
  meta.className = "rec-meta";
  const link = document.createElement("a");
  link.href = rec.sourceUrl;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = "官方來源";
  meta.appendChild(link);
  const checkedAt = document.createElement("span");
  checkedAt.className = "rec-checked-at";
  checkedAt.textContent = `　檢核日期：${rec.checkedAt}`;
  meta.appendChild(checkedAt);
  li.appendChild(meta);

  return li;
}

/**
 * 查無商家、也推測不出類別時，在結果上方顯示類別快選鈕（餐飲、咖啡…），
 * 點了就改依該類別推薦（PRD v2.2、AC-04）。「一般消費」本身不開放手動選擇，
 * 它是比對不到時的保底結果，不應該出現在快選鈕裡。
 */
function renderCategoryQuickPicker(match) {
  const show = isCategoryFallback(match);
  els.categoryQuickPicker.hidden = !show;
  els.categoryQuickList.replaceChildren();
  if (!show) return;

  for (const category of state.data.categories || []) {
    if (category.id === GENERAL_CATEGORY_ID) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "category-quick-btn";
    button.textContent = category.name;
    const isActive = category.id === match.categoryId;
    button.setAttribute("aria-pressed", String(isActive));
    if (isActive) button.classList.add("is-active");
    button.addEventListener("click", () => {
      state.selectedCategoryId = category.id;
      state.showAll = false;
      recompute();
    });
    els.categoryQuickList.appendChild(button);
  }
}

function renderMatchAndResults() {
  const match = state.match;
  const hintText = matchHintText(match);
  els.matchHint.hidden = hintText === "";
  els.matchHint.textContent = hintText;

  renderCategoryQuickPicker(match);

  if (!match || match.type === "empty" || match.type === "need-category") {
    els.resultsSection.hidden = true;
    return;
  }

  els.resultsSection.hidden = false;
  const { visible, hasMore } = truncateTop(state.recommendations, state.showAll, 10);
  els.resultsList.replaceChildren();
  if (visible.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "找不到符合的信用卡回饋，可以試試其他商家名稱，或切換查詢範圍。";
    els.resultsList.appendChild(li);
  } else {
    for (const rec of visible) {
      els.resultsList.appendChild(renderRecommendation(rec));
    }
  }
  els.showAllBtn.hidden = !hasMore;
}

function renderCardSearchResults() {
  els.cardSearchResults.replaceChildren();
  const term = state.cardSearch.trim();
  if (term === "") return;

  const normalizedTerm = normalize(term);
  const matches = state.data.cards
    .filter((card) => {
      const bankName = bankNameById(card.bankId);
      return normalize(card.name).includes(normalizedTerm) || normalize(bankName).includes(normalizedTerm);
    })
    .slice(0, 20);

  if (matches.length === 0) {
    const li = document.createElement("li");
    li.className = "empty-hint";
    li.textContent = "找不到符合的銀行或卡名。";
    els.cardSearchResults.appendChild(li);
    return;
  }

  for (const card of matches) {
    const inMyCards = state.myCardIds.includes(card.id);
    const li = document.createElement("li");
    li.className = "card-search-item";

    const label = document.createElement("span");
    label.textContent = `${bankNameById(card.bankId)}　${card.name}`;
    li.appendChild(label);

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = inMyCards ? "移除" : "加入";
    button.addEventListener("click", () => {
      state.myCardIds = inMyCards
        ? removeMyCardId(state.storage, state.myCardIds, card.id)
        : addMyCardId(state.storage, state.myCardIds, card.id);
      recompute();
    });
    li.appendChild(button);

    els.cardSearchResults.appendChild(li);
  }
}

function renderMyCards() {
  const visibleIds = currentVisibleMyCardIds();
  els.myCardsCount.textContent = String(visibleIds.length);
  els.myCardsList.replaceChildren();

  for (const cardId of visibleIds) {
    const card = state.data.cards.find((c) => c.id === cardId);
    if (!card) continue; // 理論上不會發生（visibleIds 已篩過 data.cards），防呆用

    const li = document.createElement("li");
    li.className = "chip";
    const label = document.createElement("span");
    label.textContent = `${bankNameById(card.bankId)}　${card.name}`;
    li.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "移除";
    removeBtn.addEventListener("click", () => {
      state.myCardIds = removeMyCardId(state.storage, state.myCardIds, cardId);
      recompute();
    });
    li.appendChild(removeBtn);

    els.myCardsList.appendChild(li);
  }

  renderCardSearchResults();
}

function renderFooter() {
  const latest = latestCheckedAt(state.data.cards);
  els.footerCheckedAt.textContent = latest
    ? `資料最後檢核日期：${latest}`
    : "資料最後檢核日期：尚無資料";
}

function hideSuggestions() {
  els.merchantSuggestions.hidden = true;
  els.merchantSuggestions.replaceChildren();
  els.queryInput.setAttribute("aria-expanded", "false");
}

function showLoadError(message) {
  els.loadError.textContent = message;
  els.loadError.hidden = false;
  els.querySection.hidden = true;
  els.myCardsSection.hidden = true;
  els.resultsSection.hidden = true;
  els.emptyMyCards.hidden = true;
  els.categoryQuickPicker.hidden = true;
  hideSuggestions();
  els.footerCheckedAt.textContent = "";
}

function render() {
  if (state.loadError) {
    showLoadError(state.loadError);
    return;
  }

  els.loadError.hidden = true;
  els.querySection.hidden = false;
  els.myCardsSection.hidden = false;

  renderMyCards();

  // 「我的卡片」是空的時候，查詢已經自動改用全部卡別計算（見 recompute()），這裡只負責
  // 顯示／隱藏上方那一行加卡提示，不影響下面推薦清單的顯示（PRD v2.2、AC-11b）。
  els.emptyMyCards.hidden = !shouldPromptEmptyMyCards(state.scope, currentVisibleMyCardIds());
  renderMatchAndResults();

  renderFooter();
}

function recompute() {
  if (!state.data) return;

  // 「我的卡片」是空的時候，自動改用全部卡別計算，不用使用者自己手動切換範圍
  // （PRD v2.2、AC-11b）；一旦加入至少 1 張卡，就照使用者選的範圍走（預設「我的卡片」，AC-11a）。
  // 這裡只看目前看得到的卡（currentVisibleMyCardIds()），存在 storage 裡但看不到的
  // 草稿卡 id 不計入「有沒有加卡」的判斷，也不會被拿去篩推薦清單（tasks.md T17）。
  const visibleIds = currentVisibleMyCardIds();
  const useScope = effectiveScope(state.scope, visibleIds);

  const result = recommend({
    query: state.query,
    // 查無商家、也推測不出類別時，一律帶保底的「一般消費」類別，直接顯示一般消費排行，
    // 不用等使用者先選類別（AC-04）；「merchant」「category-guess」兩種比對結果本來就
    // 不理會這個參數，傳了也沒有影響。
    selectedCategoryId: resolveSelectedCategoryId(state.selectedCategoryId),
    cards: state.data.cards,
    merchants: state.data.merchants,
    categoryKeywords: state.data.categoryKeywords,
    categories: state.data.categories,
    cardIds: useScope === SCOPE.MY ? visibleIds : null,
    today: localToday(),
    amount: state.amount,
    includeUnverified: state.draftMode, // ?draft=1 時納入草稿卡（tasks.md T17）
  });

  state.match = result.match;
  state.recommendations = result.recommendations;
  render();
}

/**
 * 商家即時建議：輸入時列出名稱或別名相符的前幾筆商家，點選就直接查詢，
 * 不需要按 Enter 或送出鈕（AC-17）。
 */
function renderSuggestions() {
  const suggestions = findMerchantSuggestions(state.query, state.data.merchants, 8);
  els.merchantSuggestions.replaceChildren();
  const show = suggestions.length > 0;
  els.merchantSuggestions.hidden = !show;
  els.queryInput.setAttribute("aria-expanded", String(show));
  if (!show) return;

  for (const merchant of suggestions) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.textContent = merchant.name;
    button.addEventListener("click", () => {
      state.query = merchant.name;
      els.queryInput.value = merchant.name;
      state.selectedCategoryId = null;
      state.showAll = false;
      hideSuggestions();
      recompute();
    });
    li.appendChild(button);
    els.merchantSuggestions.appendChild(li);
  }
}

function wireEvents() {
  els.queryForm.addEventListener("submit", (event) => event.preventDefault());

  els.queryInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.selectedCategoryId = null;
    state.showAll = false;
    renderSuggestions();
    recompute();
  });

  // 點輸入框或建議清單以外的地方，收起建議清單（不綁在 input 的 blur，避免點建議項目時
  // blur 先觸發、建議清單先被收起來，導致點擊事件沒有機會送到按鈕上）。
  document.addEventListener("click", (event) => {
    if (els.merchantSuggestions.hidden) return;
    if (els.queryInput.contains(event.target) || els.merchantSuggestions.contains(event.target)) return;
    hideSuggestions();
  });

  els.queryInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSuggestions();
  });

  els.amountInput.addEventListener("input", (event) => {
    state.amount = parseAmount(event.target.value);
    recompute();
  });

  for (const radio of els.scopeRadios) {
    radio.addEventListener("change", (event) => {
      if (!event.target.checked) return;
      state.scope = event.target.value;
      state.showAll = false;
      recompute();
    });
  }

  els.showAllBtn.addEventListener("click", () => {
    state.showAll = true;
    renderMatchAndResults();
  });

  // 加卡入口：查詢範圍已經自動改用全部卡別顯示結果了（見 recompute()），這個按鈕
  // 不用再手動切換範圍，只負責帶使用者去下方「我的卡片管理」把卡加進來（AC-11b）。
  els.addCardShortcutBtn.addEventListener("click", () => {
    els.cardSearchInput.focus();
  });

  els.cardSearchInput.addEventListener("input", (event) => {
    state.cardSearch = event.target.value;
    renderMyCards();
  });
}

async function loadData() {
  const baseUrl = resolveDataBaseUrl(window.location.search);
  try {
    const data = await loadAllData({ baseUrl, includeUnverified: state.draftMode });
    if (!data.cards || data.cards.length === 0) {
      state.loadError =
        "目前資料庫沒有任何卡片資料。請確認資料目錄是否正確，或加上網址參數載入測試資料，" +
        '例如：?data=test/fixtures/engine。';
      render();
      return;
    }
    state.data = data;
    state.storage = getSafeLocalStorage();
    // 讀出完整清單即可，不在這裡篩掉看不到的 id——篩選交給 currentVisibleMyCardIds()，
    // 否則新增或移除卡片時會把看不到的 id 一起覆寫掉，永久從 storage 消失（tasks.md T17）。
    state.myCardIds = loadMyCardIds(state.storage);
  } catch (err) {
    state.loadError =
      `資料載入失敗：${err.message}。請確認資料目錄「${baseUrl}」是否正確，` +
      '或加上網址參數載入測試資料，例如：?data=test/fixtures/engine。';
  }
  render();
}

function bootstrap() {
  cacheEls();
  // 是否開啟草稿資料預覽模式（?draft=1），在最前面就決定好，loadData() 載入資料與
  // 之後每次 recompute() 都要用同一個值（tasks.md T17）。
  state.draftMode = isDraftMode(window.location.search);
  els.draftBanner.hidden = !state.draftMode;
  wireEvents();
  loadData();
}

bootstrap();
