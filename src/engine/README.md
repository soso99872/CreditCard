# 推薦引擎（src/engine/）

純函式模組，瀏覽器與 Node 都能 import（`<script type="module">` 或 `import ... from "./src/engine/index.mjs"`）。
T03（網頁介面）請只從 `index.mjs` 匯入，不要直接 import 內部檔案，以免引擎內部調整時影響到 UI。

資料格式見 `../../data/SCHEMA.md`；每個函式的參數與回傳值詳見程式內的 JSDoc，本檔只列出整體用法。

## 典型用法

```js
import { loadAllData, recommend } from "./src/engine/index.mjs";

// 1. 載入資料（瀏覽器環境直接呼叫即可，內部用 fetch 讀取 data/ 下的檔案）
const data = await loadAllData({ baseUrl: "data/" });

// 2. 計算推薦清單
const { match, recommendations } = recommend({
  query: "全聯",                 // 使用者輸入的商家名稱
  selectedCategoryId: null,      // 只有在 match.type === "need-category" 後，使用者選了類別才帶入
  cards: data.cards,
  merchants: data.merchants,
  categoryKeywords: data.categoryKeywords,
  categories: data.categories,
  cardIds: null,                 // 「我的卡片」時傳卡片 id 陣列；「全部卡別」傳 null
  today: new Date().toISOString().slice(0, 10),
  amount: 1000,                  // 選填，有填才會附上金額試算
});
```

## `verified` 與草稿卡（T14）

卡片的 `verified` 欄位（布林，缺少視為 `false`）標記資料是否已完整核對過官方頁，詳見 `data/SCHEMA.md`「`verified` 與草稿卡」一節。

`loadAllData()` 與 `recommend()` 預設都只使用 `verified === true` 的卡；草稿卡不會出現在推薦清單裡，但仍完整保留在 `data/banks/*.json` 檔案裡（`loadAllData()` 的回傳值不含被濾掉的草稿卡，只有檔案裡還留著）。兩個函式都接受 `includeUnverified: true` 選項，**兩處都要傳**才能讓草稿卡出現在最終結果中：

```js
const data = await loadAllData({ baseUrl: "data/", includeUnverified: true });
const { recommendations } = recommend({ ...otherParams, cards: data.cards, includeUnverified: true });
```

## `match` 的五種結果

| `match.type` | 說明 | UI 對應行為 |
|---|---|---|
| `empty` | 查詢字串為空白 | 不顯示錯誤，顯示初始提示即可（AC-04） |
| `merchant` | 第一層：比對到商家名稱／別名 | 直接顯示推薦清單 |
| `category-guess` | 第二層：名稱含類別關鍵字，推測出類別 | 顯示「依名稱推測為 XX 類別」，同時顯示推薦清單（AC-03） |
| `need-category` | 三層都比對不到 | 請使用者選擇類別，選好後帶著同一個 `query` 與 `selectedCategoryId` 再呼叫一次 `recommend()`（AC-04） |
| `category-selected` | 使用者在 `need-category` 後選了類別 | 顯示推薦清單 |

## `recommendations` 的每一筆

依回饋率由高到低排序（同率依卡名排序，結果穩定）。每筆欄位對應 AC-05：

- `cardId`、`cardName`、`bankId`、`plan`：卡片與方案資訊。
- `rate`（數字，如 `3` 代表 3%）、`rateText`（如 `"3%"`）、`rawReward`（官方原文寫法）。
- `cap`（原始物件或 `null`）、`capText`（已格式化的上限文字，如 `"每月上限 1,000 點"` 或 `"無上限"`）。
- `conditions`：條件標籤陣列，空陣列時 UI 不顯示。
- `sourceUrl`、`checkedAt`：官方來源連結與檢核日期。
- `matchLevel`：`"merchant"` / `"category"` / `"general"`，說明這條規則是依商家、類別或一般消費比對到的。
- `reason`：已產生好的中文推薦理由一句話。
- `estimatedAmount`、`capped`：只有呼叫 `recommend()` 時帶了 `amount` 才會有。`capped` 為 `true` 代表試算金額已被上限限制，UI 應標記「已達上限」（AC-10）。

## 「我的卡片」篩選

`recommend()` 的 `cardIds` 參數：傳入卡片 id 陣列時，只計算這些卡片；傳 `null`／不傳則計算全部卡片。T03 可將 `localStorage` 存的「我的卡片」id 清單直接傳入。

## 資料載入與 `data/index.json`

瀏覽器無法列目錄，因此 `loadAllData()` 透過 `data/index.json`（由 `npm run build-index` / `scripts/build-index.mjs` 產生）得知 `data/banks/` 下有哪些檔案。**新增或移除銀行資料檔後，記得重新執行 `npm run build-index`**，否則瀏覽器端讀不到新檔案。

`loadAllData()` 預設用全域 `fetch`；非瀏覽器環境（例如之後若要在 Node 腳本中重用引擎）可傳入 `fetchJson` 選項換成自訂的讀取方式。
