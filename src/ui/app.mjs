// 網頁介面的進入點：負責載入資料、綁定畫面事件、呼叫推薦引擎並重新渲染。
// 只從 src/engine/index.mjs 匯入引擎 API（見 src/engine/README.md），不直接 import 引擎內部模組。
// 畫面照風格提案 D「錢包」（design-proposals/d-wallet.html，老闆 2026-10-15 選定）：
// 第 1 名是信用卡比例的實體卡＋下方收據，其餘名次是錢包裡疊起來的卡（<details>）。
// 可測的純邏輯已抽到同目錄的 date.mjs、storage.mjs、query-params.mjs、view-state.mjs、footer.mjs、
// suggest.mjs、card-color.mjs、bank-name.mjs、reason-text.mjs，本檔只處理 DOM，不另外寫測試
// （見 tasks.md T03、T12-2b）。

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
  hasHiddenMyCards,
} from "./view-state.mjs";
import { latestCheckedAt } from "./footer.mjs";
import { findSuggestions } from "./suggest.mjs";
import { loadRecent, addRecent, clearRecent } from "./recent.mjs";
import { resolveQuickPicks } from "./quick-picks.mjs";
import { showsCategoryFallback, typedQueryEntry } from "./entry.mjs";
import { bankColor, bankColorOrder } from "./card-color.mjs";
import { shortBankName } from "./bank-name.mjs";
import { shortReasonText } from "./reason-text.mjs";
import { createNearbyPanel } from "./nearby-panel.mjs";
import { thirdPartyInfo, THIRD_PARTY_SHORT } from "./source-label.mjs";

/** 常用類別：手機寬度（< 768px）預設只顯示這幾顆，其餘摺進「更多類別」（tasks.md T12-2b）。 */
const COMMON_CATEGORY_IDS = ["convenience-store", "supermarket", "coffee", "dining", "delivery", "gas"];

/** 直接依類別查詢時餵給引擎的查詢字串：不會對到任何商家或類別關鍵字，引擎就會走「使用者選類別」那條路。 */
const CATEGORY_PICK_QUERY = "◎";

const fmtAmount = new Intl.NumberFormat("zh-TW");

const els = {};

const state = {
  data: null, // loadAllData() 的結果
  loadError: null,
  storage: null,
  query: "",
  selectedCategoryId: null,
  pickedCategory: null, // 從快捷、建議或最近查詢直接點類別：{ id, name }；打字會清掉
  via: null, // 從附近商家點進來、類別是系統推測的：{ store, how }（nearby-view.mjs entryForItem）；打字會清掉
  recent: [], // 最近查詢（最多 5 筆，見 recent.mjs）
  amount: undefined,
  scope: defaultScope(),
  showAll: false,
  categoryPickerExpanded: false,
  // 「我的卡片」存在 storage 的完整清單，含目前看不到的 id（例如未開 ?draft=1 時的
  // 草稿卡）；畫面顯示與查詢範圍一律用 currentVisibleMyCardIds() 篩出的子集，
  // 新增或移除時才操作這個完整清單，避免看不到的 id 被覆寫掉（tasks.md T17）。
  myCardIds: [],
  cardSearch: "",
  match: null,
  recommendations: [],
  draftMode: false, // ?draft=1 時為 true：loadAllData／recommend 都帶 includeUnverified（tasks.md T17）
  checkingMode: false, // 資料載入成功，但目前沒有任何張 verified 卡（主管 T14 建議：不要顯示開發者文案）
};

let dealInObserver = null;
let nearbyPanel = null;
/** 上一次畫面上第 1 名是哪張（含查詢對象）；換了才播「從搜尋列抽出來」的動畫，輸入金額重算時不重播。 */
let lastTopKey = null;

/**
 * 目前資料中看得到的「我的卡片」id，見 state.myCardIds 的註解。
 * @returns {string[]}
 */
function currentVisibleMyCardIds() {
  return visibleMyCardIds(state.myCardIds, state.data?.cards);
}

function cacheEls() {
  els.app = document.querySelector(".app");
  els.queryTools = document.getElementById("query-tools");
  els.queryClearBtn = document.getElementById("query-clear-btn");
  els.quickSection = document.getElementById("quick-section");
  els.recentGroup = document.getElementById("recent-group");
  els.recentList = document.getElementById("recent-list");
  els.recentClearBtn = document.getElementById("recent-clear-btn");
  els.quickList = document.getElementById("quick-list");
  els.nearbyBtn = document.getElementById("nearby-btn");
  els.checkedAt = document.getElementById("checked-at");
  els.loadingHint = document.getElementById("loading-hint");
  els.loadError = document.getElementById("load-error");
  els.draftBanner = document.getElementById("draft-banner");
  els.checkingBanner = document.getElementById("checking-banner");

  els.queryForm = document.getElementById("query-form");
  els.queryInput = document.getElementById("query-input");
  els.merchantSuggestions = document.getElementById("merchant-suggestions");
  els.amountInput = document.getElementById("amount-input");
  els.scopeRadios = Array.from(document.querySelectorAll('input[name="scope"]'));
  els.openMyCardsBtn = document.getElementById("open-my-cards-btn");
  els.toolbarMyCardsCount = document.getElementById("toolbar-my-cards-count");
  els.matchHint = document.getElementById("match-hint");
  els.categoryQuickPicker = document.getElementById("category-quick-picker");
  els.categoryQuickList = document.getElementById("category-quick-list");
  els.categoryMoreBtn = document.getElementById("category-more-btn");

  els.emptyMyCards = document.getElementById("empty-my-cards");
  els.emptyMyCardsText = document.getElementById("empty-my-cards-text");
  els.addCardShortcutBtn = document.getElementById("add-card-shortcut-btn");

  els.top = document.getElementById("top");
  els.resultTitle = document.getElementById("result-title");
  els.topCard = document.getElementById("top-card");
  els.receipt = document.getElementById("receipt");

  els.rest = document.getElementById("rest");
  els.stack = document.getElementById("stack");
  els.showAllBtn = document.getElementById("show-all-btn");

  els.resultsEmptyHint = document.getElementById("results-empty-hint");

  els.myCardsDialog = document.getElementById("my-cards-dialog");
  els.closeMyCardsBtn = document.getElementById("close-my-cards-btn");
  els.myCardsCount = document.getElementById("my-cards-count");
  els.myCardsList = document.getElementById("my-cards-list");
  els.cardSearchInput = document.getElementById("card-search-input");
  els.cardSearchResults = document.getElementById("card-search-results");
}

function bankNameById(bankId) {
  const issuer = state.data?.issuers.find((i) => i.id === bankId);
  return issuer ? issuer.name : bankId;
}

function matchHintText(match) {
  // 直接點類別（快捷、建議、最近查詢）不是「查不到」，標題已寫明類別，不再多一行提示
  if (!match || state.pickedCategory) return "";
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

/**
 * 結果標題「在 {商家}，刷這張」：照抄 d-wallet.html，但補上 D 的示範資料沒有涵蓋的
 * 比對結果（推測類別、使用者手動選類別、一般消費排行）。
 * @param {object} match recommend() 回傳的 match（已確定不是 empty／need-category）
 * @returns {Array<string | HTMLElement>}
 */
function resultTitleParts(match) {
  const strong = (text) => {
    const node = document.createElement("strong");
    node.textContent = text;
    return node;
  };
  switch (match.type) {
    case "merchant":
      return ["在", strong(match.merchantName), "，刷這張"];
    case "category-guess":
      return ["依名稱推測的", strong(match.categoryName), "類別，刷這張"];
    case "category-selected":
      // 從附近商家點進來：類別是依店家類型推測的，不是使用者選的，標題要寫出店名（T18b 主管退件①）
      if (state.via?.how === "osm-guess") return ["依店家類型推測", strong(state.via.store), "為", strong(match.categoryName), "，刷這張"];
      if (state.via?.how === "osm-none") return [strong(state.via.store), "對不到商家，以", strong("一般消費"), "排序"];
      return match.categoryId === GENERAL_CATEGORY_ID
        ? ["找不到符合的類別，以", strong("一般消費"), "排序"]
        : ["依你選的", strong(match.categoryName), "類別，刷這張"];
    default:
      return ["刷這張"];
  }
}

/**
 * 查無商家、也推測不出類別時，在結果上方顯示類別快選鈕（餐飲、咖啡…），
 * 點了就改依該類別推薦（PRD v2.2、AC-04）。「一般消費」本身不開放手動選擇，
 * 它是比對不到時的保底結果，不應該出現在快選鈕裡。
 * 目前共 21 顆：手機寬度先只顯示 6 顆常用類別，其餘摺進「更多類別」（tasks.md T12-2b）。
 */
function renderCategoryQuickPicker(match) {
  const show = showsCategoryFallback(match, state.pickedCategory);
  els.categoryQuickPicker.hidden = !show;
  els.categoryQuickList.replaceChildren();
  if (!show) return;

  const categories = (state.data.categories || []).filter((c) => c.id !== GENERAL_CATEGORY_ID);
  const hasExtra = categories.some((c) => !COMMON_CATEGORY_IDS.includes(c.id));
  // 目前選到的類別若剛好屬於「更多類別」收起來的那批，不能讓面板收起來後反而看不到
  // 自己選的是哪個，所以強制展開。「一般消費」是查無類別時的保底狀態，不會畫成快選鈕
  // （上面已經濾掉），不算在「選到的類別被收起來」這個情況裡，否則一進到保底狀態
  // 面板就會被強制展開，使用者還沒點「更多類別」就看到全部 21 顆。
  const activeIsExtra =
    match.categoryId !== GENERAL_CATEGORY_ID && !COMMON_CATEGORY_IDS.includes(match.categoryId);
  const expanded = state.categoryPickerExpanded || activeIsExtra;
  els.categoryQuickList.classList.toggle("is-expanded", expanded);

  for (const category of categories) {
    const isExtra = !COMMON_CATEGORY_IDS.includes(category.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = isExtra ? "category-quick-btn category-quick-btn--extra" : "category-quick-btn";
    button.textContent = category.name;
    const isActive = category.id === match.categoryId;
    button.setAttribute("aria-pressed", String(isActive));
    if (isActive) button.classList.add("is-active");
    button.addEventListener("click", () => {
      state.pickedCategory = null; // 不清掉的話 pickedCategory 優先，按鈕會變死按鈕
      state.via = null;
      state.selectedCategoryId = category.id;
      state.showAll = false;
      recompute();
    });
    els.categoryQuickList.appendChild(button);
  }

  els.categoryMoreBtn.hidden = !hasExtra;
  if (hasExtra) {
    els.categoryMoreBtn.textContent = expanded ? "收起類別" : "更多類別";
    els.categoryMoreBtn.setAttribute("aria-expanded", String(expanded));
  }
}

/** 停掉上一輪的「發牌」IntersectionObserver，避免捲動時觸發到已經不存在的卡堆。 */
function stopDealAnimation() {
  if (dealInObserver) {
    dealInObserver.disconnect();
    dealInObserver = null;
  }
}

/** 跟 styles.css 的 `min(var(--i, 0), 20)` 對應：延遲最多算到第 20 張，見那裡的註解。 */
const DEAL_STAGGER_CAP = 20;

/**
 * 卡片疊的進場動畫：捲到畫面內才依序滑上來，最後補一個兜底，時間到就拿掉動畫直接
 * 停在終點（電腦忙、掉幀時也不會卡在半路）。照抄 d-wallet.html；尊重
 * prefers-reduced-motion 的部分交給 CSS（styles.css 的對應 media query），這裡不用另外判斷。
 * @param {number} count 卡堆張數，用來算兜底的等待時間
 */
function startDealAnimation(count) {
  stopDealAnimation();
  dealInObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        els.stack.classList.add("is-in");
        stopDealAnimation();
        const staggerCount = Math.min(count, DEAL_STAGGER_CAP);
        setTimeout(() => els.stack.classList.add("dealt"), staggerCount * 55 + 700);
      }
    },
    { threshold: 0.1 }
  );
  dealInObserver.observe(els.stack);
}

/** 第 1 名：信用卡比例的實體卡面（role="img"，卡面本身只是裝飾，內容由 aria-label 提供）。 */
function buildCardFace(rec, color) {
  const face = document.createElement("div");
  face.className = "card";
  face.style.setProperty("--c", color);
  face.setAttribute("role", "img");
  face.setAttribute("aria-label", `${bankNameById(rec.bankId)} ${rec.cardName}`);

  const bank = document.createElement("span");
  bank.className = "card-bank";
  bank.textContent = shortBankName(bankNameById(rec.bankId));

  const chip = document.createElement("span");
  chip.className = "chip";
  chip.setAttribute("aria-hidden", "true");

  const name = document.createElement("span");
  name.className = "card-name";
  name.textContent = rec.cardName;

  face.append(bank, chip, name);
  return face;
}

/** 第 1 名：卡面下方的「收據」，回饋率是全頁最大的數字（照抄 d-wallet.html）。 */
function buildReceipt(rec, match) {
  const rate = document.createElement("p");
  rate.className = "rate num";
  const rateLabel = document.createElement("small");
  rateLabel.textContent = "這筆回饋";
  rate.append(rateLabel, rec.rateText);

  const gain = document.createElement("p");
  gain.className = "gain";
  if (typeof rec.estimatedAmount === "number") {
    const strong = document.createElement("strong");
    strong.className = "num";
    strong.textContent = rec.capped
      ? `${fmtAmount.format(rec.estimatedAmount)} 元（已達上限）`
      : `${fmtAmount.format(rec.estimatedAmount)} 元`;
    gain.append(`NT$${fmtAmount.format(state.amount)} 約可拿回`, strong);
  } else {
    gain.textContent = "填金額可試算預估回饋";
  }

  const main = document.createElement("div");
  main.className = "receipt-main";
  main.append(rate, gain);

  const facts = document.createElement("dl");
  facts.className = "facts";
  const addFact = (label, value) => {
    const row = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (typeof value === "string") dd.textContent = value;
    else dd.appendChild(value);
    row.append(dt, dd);
    facts.appendChild(row);
  };

  addFact("為什麼", shortReasonText(rec.matchLevel, match));
  addFact("上限", rec.capText);

  const needs = [...(rec.plan ? [`方案：${rec.plan}`] : []), ...rec.conditions];
  if (needs.length) {
    const ul = document.createElement("ul");
    for (const text of needs) {
      const li = document.createElement("li");
      li.textContent = text;
      ul.appendChild(li);
    }
    addFact("要注意", ul);
  }

  const source = document.createElement("div");
  source.className = "source";
  const third = thirdPartyInfo(rec);
  const checkedAt = document.createElement("span");
  checkedAt.className = "num";
  checkedAt.textContent = third ? third.dateText : `核對於 ${rec.checkedAt}`;
  const links = document.createElement("span");
  links.className = "source-links";
  for (const l of third ? third.links : [{ url: rec.sourceUrl, text: "看銀行原文" }]) {
    links.appendChild(buildSourceLink(l.url, l.text));
  }
  source.append(checkedAt, links);

  const fragment = document.createDocumentFragment();
  if (third) fragment.append(main, buildThirdPartyTag(third.label), facts, source);
  else fragment.append(main, facts, source);
  return fragment;
}

/** 來源連結：新分頁開啟。 */
function buildSourceLink(url, text) {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = text;
  return link;
}

/** 第三方來源標籤（DESIGN.md「非官方來源標籤」）。 */
function buildThirdPartyTag(text) {
  const tag = document.createElement("p");
  tag.className = "source-tag";
  tag.textContent = text;
  return tag;
}

/**
 * 其餘名次：錢包裡疊起來的一張卡（<details>，點開看條件）。跟第 1 名不同，這裡直接顯示
 * 完整的 rec.reason（含百分比），滿足 AC-05「每張卡都要有推薦理由」——D 的示範資料只做了
 * 第 1 名，沒有處理這塊，是這次要補的正式功能。
 * @param {object} rec
 * @param {number} rank 0-based 總名次（0 = 第 1 名，這裡一定是 1 以上）
 * @param {string} color bankColor() 算好的顏色
 */
function buildStackItem(rec, rank, color) {
  const li = document.createElement("li");
  li.style.setProperty("--c", color);
  li.style.setProperty("--i", String(rank - 1));

  const summary = document.createElement("summary");
  const nameWrap = document.createElement("span");
  nameWrap.className = "row-name";
  const name = document.createElement("b");
  name.textContent = rec.cardName;
  const sub = document.createElement("span");
  sub.textContent = `${rank + 1}．${shortBankName(bankNameById(rec.bankId))}`;
  const thirdRow = thirdPartyInfo(rec);
  if (thirdRow) {
    // 收合狀態就要看得到：短標籤，完整說明在展開內容裡。
    const flag = document.createElement("em");
    flag.className = "row-flag";
    flag.textContent = THIRD_PARTY_SHORT;
    sub.append(" ", flag);
  }
  nameWrap.append(name, sub);
  const rate = document.createElement("span");
  rate.className = "row-rate num";
  rate.textContent = rec.rateText;
  summary.append(nameWrap, rate);

  const body = document.createElement("div");
  body.className = "row-body";

  const reason = document.createElement("p");
  reason.textContent = rec.reason;
  body.appendChild(reason);

  const capLine = document.createElement("p");
  capLine.textContent =
    typeof rec.estimatedAmount === "number"
      ? `${rec.capText}・約可拿回 ${fmtAmount.format(rec.estimatedAmount)} 元${rec.capped ? "（已達上限）" : ""}`
      : rec.capText;
  body.appendChild(capLine);

  if (rec.plan) {
    const plan = document.createElement("p");
    plan.textContent = `方案：${rec.plan}`;
    body.appendChild(plan);
  }

  for (const condition of rec.conditions) {
    const cond = document.createElement("p");
    cond.textContent = `要注意：${condition}`;
    body.appendChild(cond);
  }

  const third = thirdPartyInfo(rec);
  if (third) body.appendChild(buildThirdPartyTag(third.label));

  const meta = document.createElement("p");
  meta.className = "muted";
  meta.append(third ? `${third.dateText}・` : `核對於 ${rec.checkedAt}・`);
  const sourceLinks = third ? third.links : [{ url: rec.sourceUrl, text: "看銀行原文" }];
  sourceLinks.forEach((l, i) => {
    if (i) meta.append("・");
    meta.appendChild(buildSourceLink(l.url, l.text));
  });
  body.appendChild(meta);

  const details = document.createElement("details");
  details.append(summary, body);
  li.appendChild(details);
  return li;
}

function hideTopAndRest() {
  lastTopKey = null;
  els.top.hidden = true;
  els.rest.hidden = true;
  els.showAllBtn.hidden = true;
  stopDealAnimation();
}

function showEmptyHint(text) {
  els.resultsEmptyHint.hidden = false;
  els.resultsEmptyHint.textContent = text;
}

function hideEmptyHint() {
  els.resultsEmptyHint.hidden = true;
}

function renderMatchAndResults() {
  const match = state.match;
  const hintText = matchHintText(match);
  els.matchHint.hidden = hintText === "";
  els.matchHint.textContent = hintText;

  renderCategoryQuickPicker(match);

  const noQueryYet = !match || match.type === "empty";
  if (noQueryYet || match.type === "need-category") {
    hideTopAndRest();
    // 未輸入時有常用快捷就是最好的引導，不再多放一行說明字
    if (noQueryYet && resolveQuickPicks(state.data).length > 0) hideEmptyHint();
    else showEmptyHint(noQueryYet ? "輸入商家或選類別，立刻看推薦。" : "請選擇類別查詢。");
    return;
  }

  const { visible, hasMore } = truncateTop(state.recommendations, state.showAll, 10);

  if (visible.length === 0) {
    hideTopAndRest();
    showEmptyHint(
      state.checkingMode
        ? "資料正在核對中，暫時沒有可推薦的卡片。"
        : "找不到符合的信用卡回饋，可以試試其他商家名稱，或切換查詢範圍。"
    );
    return;
  }

  hideEmptyHint();

  const [top, ...rest] = visible;
  // 配色依據是「這次推薦結果」裡銀行第一次出現的順序，用完整清單（state.recommendations）
  // 而不是被「預設前 10 名」截斷後的 visible，這樣按「顯示全部」多展開幾張卡時，已經在
  // 畫面上的卡片顏色不會跟著變（tasks.md T12-2b，老闆 2026-10-15 決定）。
  const bankOrder = bankColorOrder(state.recommendations);

  els.top.hidden = false;
  els.resultTitle.replaceChildren(...resultTitleParts(match));
  const face = buildCardFace(top, bankColor(top.bankId, bankOrder));
  const topKey = [match.type, match.merchantName || match.categoryId, top.bankId, top.cardName].join("|");
  if (topKey !== lastTopKey) face.classList.add("is-fresh");
  lastTopKey = topKey;
  els.topCard.replaceChildren(face);
  els.receipt.replaceChildren(buildReceipt(top, match));

  stopDealAnimation();
  els.stack.classList.remove("is-in", "dealt");
  els.stack.replaceChildren();

  if (rest.length === 0) {
    els.rest.hidden = true;
  } else {
    els.rest.hidden = false;
    rest.forEach((rec, index) => {
      const rank = index + 1;
      els.stack.appendChild(buildStackItem(rec, rank, bankColor(rec.bankId, bankOrder)));
    });
    startDealAnimation(rest.length);
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
    button.className = "btn-small";
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
  els.toolbarMyCardsCount.textContent = String(visibleIds.length);
  els.myCardsList.replaceChildren();

  for (const cardId of visibleIds) {
    const card = state.data.cards.find((c) => c.id === cardId);
    if (!card) continue; // 理論上不會發生（visibleIds 已篩過 data.cards），防呆用

    const li = document.createElement("li");
    li.className = "chip-item";
    const label = document.createElement("span");
    label.textContent = `${bankNameById(card.bankId)}　${card.name}`;
    li.appendChild(label);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "btn-small";
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

/**
 * 加卡提示的文案要跟使用者記憶一致（主管 T17 建議）：真的沒加過卡，跟已經加過卡但
 * 目前全部看不到（例如存的是草稿卡 id、沒開 ?draft=1），要用不同句子。
 */
function emptyMyCardsText() {
  return hasHiddenMyCards(state.myCardIds, currentVisibleMyCardIds())
    ? "你加入的卡片目前還沒通過核對、暫時看不到。"
    : "「我的卡片」還沒有加入任何卡片。";
}

function renderCheckedAt() {
  const latest = latestCheckedAt(state.data.cards);
  els.checkedAt.hidden = !latest;
  els.checkedAt.textContent = latest ? `資料核對 ${latest}` : "";
}

function hideSuggestions() {
  els.merchantSuggestions.hidden = true;
  els.merchantSuggestions.replaceChildren();
  els.queryInput.setAttribute("aria-expanded", "false");
}

function showLoadError(message) {
  els.loadingHint.hidden = true;
  els.loadError.textContent = message;
  els.loadError.hidden = false;
  els.draftBanner.hidden = true;
  els.checkingBanner.hidden = true;
  els.queryForm.hidden = true;
  els.queryTools.hidden = true;
  els.openMyCardsBtn.hidden = true;
  els.emptyMyCards.hidden = true;
  els.categoryQuickPicker.hidden = true;
  hideTopAndRest();
  hideEmptyHint();
  hideSuggestions();
  els.checkedAt.hidden = true;
}

function render() {
  if (state.loadError) {
    showLoadError(state.loadError);
    return;
  }

  els.loadingHint.hidden = true;
  els.loadError.hidden = true;
  els.queryForm.hidden = false;
  els.queryTools.hidden = false;
  els.openMyCardsBtn.hidden = false;
  els.draftBanner.hidden = !state.draftMode;

  // 零張 verified 卡時（例如 preview 資料還在逐批核對），不要顯示開發者用的錯誤文案，
  // 改成「資料核對中」狀態；查詢功能仍可用，只是暫時沒有結果（主管 T14 建議）。
  // ?draft=1 時已經把草稿卡納入計算，不算在這個狀態裡。
  state.checkingMode = state.data.cards.length === 0 && !state.draftMode;
  els.checkingBanner.hidden = !state.checkingMode;

  renderMyCards();

  // 「我的卡片」是空的時候，查詢已經自動改用全部卡別計算（見 recompute()），這裡只負責
  // 顯示／隱藏上方那一行加卡提示，不影響下面推薦清單的顯示（PRD v2.2、AC-11b）。
  els.emptyMyCards.hidden = !shouldPromptEmptyMyCards(state.scope, currentVisibleMyCardIds());
  els.emptyMyCardsText.textContent = emptyMyCardsText();

  renderMatchAndResults();
  renderQuickAndRecent();
  els.queryClearBtn.hidden = els.queryInput.value === "";
  // 有結果時手機上搜尋列固定在頂端（styles.css 的 .has-result .query）
  els.app.classList.toggle("has-result", !els.top.hidden);
  renderCheckedAt();
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
    query: state.pickedCategory ? CATEGORY_PICK_QUERY : state.query,
    // 查無商家、也推測不出類別時，一律帶保底的「一般消費」類別，直接顯示一般消費排行，
    // 不用等使用者先選類別（AC-04）；「merchant」「category-guess」兩種比對結果本來就
    // 不理會這個參數，傳了也沒有影響。
    selectedCategoryId: resolveSelectedCategoryId(state.pickedCategory?.id ?? state.selectedCategoryId),
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
 * 一次查詢：商家用名稱查，類別直接查類別。建議、快捷、最近查詢三處共用，
 * 讓「點一下就出結果」只有一條路徑（T19）。
 * @param {{kind: "merchant" | "category", id?: string, name: string}} entry
 */
function runEntry(entry) {
  state.query = entry.name;
  state.pickedCategory = entry.kind === "category" ? { id: entry.id, name: entry.name } : null;
  state.via = entry.via ?? null;
  state.selectedCategoryId = null;
  state.showAll = false;
  state.categoryPickerExpanded = false;
  els.queryInput.value = entry.via?.store ?? entry.name; // 附近商家點進來時輸入框放店名，最近查詢仍記類別
  els.queryInput.blur(); // 收起手機鍵盤，結果才看得到
  hideSuggestions();
  state.recent = addRecent(state.storage, state.recent, {
    kind: entry.kind,
    name: entry.name,
    ...(entry.kind === "category" ? { id: entry.id } : {}),
  });
  recompute();
  if (window.scrollY > 0) window.scrollTo(0, 0);
}

/** 打字查詢（按 Enter 或離開輸入框）：把已經比對到商家（或推測出類別）的查詢記進最近查詢。 */
function rememberTypedQuery() {
  if (state.pickedCategory) return;
  const entry = typedQueryEntry(state.match);
  if (entry) state.recent = addRecent(state.storage, state.recent, entry);
}

function buildChip(entry, className) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = entry.name;
  button.addEventListener("click", () => runEntry(entry));
  return button;
}

/** 未輸入時的「最近查詢」與「常用」；有查詢（或有結果）時整塊收起，把第一屏留給結果。 */
function renderQuickAndRecent() {
  const noQueryYet = !state.match || state.match.type === "empty";
  els.quickSection.hidden = !noQueryYet;
  if (!noQueryYet) return;

  const categoryIds = new Set((state.data.categories || []).map((c) => c.id));
  const recent = state.recent.filter((r) => r.kind === "merchant" || categoryIds.has(r.id));
  els.recentGroup.hidden = recent.length === 0;
  els.recentList.replaceChildren(...recent.map((r) => buildChip(r, "quick-chip quick-chip--recent")));

  // 「附近商家」按鈕固定在列尾
  els.quickList.replaceChildren(
    ...resolveQuickPicks(state.data).map((p) => buildChip(p, "quick-chip")),
    els.nearbyBtn
  );
}

/** 輸入時即時建議：商家與類別一起列（類別有「類別」標籤），點選就直接查詢（AC-17）。 */
function renderSuggestions() {
  const suggestions = findSuggestions(state.query, state.data.merchants, state.data.categories, 8);
  els.merchantSuggestions.replaceChildren();
  const show = suggestions.length > 0;
  els.merchantSuggestions.hidden = !show;
  els.queryInput.setAttribute("aria-expanded", String(show));
  if (!show) return;

  for (const item of suggestions) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    if (item.kind === "category") {
      const tag = document.createElement("span");
      tag.className = "suggestion-kind";
      tag.textContent = "類別";
      button.appendChild(tag);
    }
    const label = document.createElement("span");
    label.textContent = item.name;
    button.appendChild(label);
    button.addEventListener("click", () => runEntry(item));
    li.appendChild(button);
    els.merchantSuggestions.appendChild(li);
  }
}

function wireEvents() {
  els.queryForm.addEventListener("submit", (event) => event.preventDefault());

  els.queryInput.addEventListener("input", (event) => {
    state.query = event.target.value;
    state.pickedCategory = null;
    state.via = null;
    state.selectedCategoryId = null;
    state.showAll = false;
    state.categoryPickerExpanded = false;
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

  // 沒按 Enter、直接點空白處或按清除離開輸入框，也算一次查詢（T19 主管退件③）
  els.queryInput.addEventListener("change", rememberTypedQuery);

  els.queryInput.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hideSuggestions();
    if (event.key === "Enter") {
      rememberTypedQuery();
      hideSuggestions();
      els.queryInput.blur();
      renderQuickAndRecent();
      if (window.scrollY > 0) window.scrollTo(0, 0);
    }
  });

  els.queryClearBtn.addEventListener("click", () => {
    els.queryInput.value = "";
    state.query = "";
    state.pickedCategory = null;
    state.via = null;
    state.selectedCategoryId = null;
    state.showAll = false;
    state.categoryPickerExpanded = false;
    hideSuggestions();
    recompute();
    els.queryInput.focus();
  });

  els.recentClearBtn.addEventListener("click", () => {
    state.recent = clearRecent(state.storage);
    renderQuickAndRecent();
    els.queryInput.focus(); // 清除鈕隨最近查詢消失，焦點移回輸入框，不要掉到頁面頂端
  });

  els.nearbyBtn.addEventListener("click", () => nearbyPanel.open());

  // 搜尋列固定在頂端時多一條底線，跟下面捲動的內容分得開；只讀一次捲動位置，用 rAF 節流。
  let scrollTick = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollTick) return;
      scrollTick = true;
      requestAnimationFrame(() => {
        scrollTick = false;
        els.queryForm.classList.toggle("is-stuck", window.scrollY > 24);
      });
    },
    { passive: true }
  );

  els.amountInput.addEventListener("input", (event) => {
    state.amount = parseAmount(event.target.value);
    recompute();
  });

  // 離開欄位後補上千分位（1000／1,500 不一致的問題一併解決），讓使用者看得出
  // 剛剛打的「1500」已經被正確解析（主管 2026-10-16 退件第 1 項）。
  els.amountInput.addEventListener("blur", () => {
    els.amountInput.value = state.amount === undefined ? "" : fmtAmount.format(state.amount);
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

  els.categoryMoreBtn.addEventListener("click", () => {
    state.categoryPickerExpanded = !state.categoryPickerExpanded;
    renderCategoryQuickPicker(state.match);
  });

  // 加卡入口：查詢範圍已經自動改用全部卡別顯示結果了（見 recompute()），這個按鈕
  // 只負責開啟「我的卡片管理」對話框並把焦點帶到搜尋欄（AC-11b；PRD 6.1 改成對話框後，
  // 搜尋欄不再是畫面上常駐可見的元素，一定要先開對話框才能聚焦）。
  els.addCardShortcutBtn.addEventListener("click", () => {
    els.myCardsDialog.showModal();
    els.cardSearchInput.focus();
  });

  els.openMyCardsBtn.addEventListener("click", () => {
    els.myCardsDialog.showModal();
  });

  els.closeMyCardsBtn.addEventListener("click", () => {
    els.myCardsDialog.close();
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
    state.data = data;
    state.loadError = null;
    state.storage = getSafeLocalStorage();
    // 讀出完整清單即可，不在這裡篩掉看不到的 id——篩選交給 currentVisibleMyCardIds()，
    // 否則新增或移除卡片時會把看不到的 id 一起覆寫掉，永久從 storage 消失（tasks.md T17）。
    state.myCardIds = loadMyCardIds(state.storage);
    state.recent = loadRecent(state.storage);
  } catch (err) {
    state.loadError =
      `資料載入失敗：${err.message}。請確認資料目錄「${baseUrl}」是否正確，` +
      "或加上網址參數載入測試資料，例如：?data=test/fixtures/engine。";
  }
  render();
}

function bootstrap() {
  cacheEls();
  nearbyPanel = createNearbyPanel({
    getData: () => state.data,
    baseUrl: resolveDataBaseUrl(window.location.search),
    generalId: GENERAL_CATEGORY_ID,
    onPick: (entry) => {
      runEntry(entry);
      els.resultTitle.focus(); // 面板關閉後焦點落在結果標題，螢幕閱讀器直接讀到結果
    },
  });
  // 是否開啟草稿資料預覽模式（?draft=1），在最前面就決定好，loadData() 載入資料與
  // 之後每次 recompute() 都要用同一個值（tasks.md T17）。
  state.draftMode = isDraftMode(window.location.search);
  wireEvents();
  loadData();
}

bootstrap();
