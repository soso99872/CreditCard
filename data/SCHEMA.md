# 資料格式說明

本文件定義 `data/` 目錄下各檔案的結構。所有任務（T02～T08）皆依此格式讀寫資料。

## 目錄結構

```
data/
  categories.json          類別清單（本檔，T01 產出，固定不變）
  issuers.json             發卡銀行與官方網域白名單（T04 產出）
  merchants.json           商家庫與別名（T08 產出）
  category-keywords.json   類別關鍵字（T08 產出）
  index.json               銀行資料檔清單，供瀏覽器載入（T02 的 build-index.mjs 產生）
  banks/
    <銀行 id>.json         每家銀行一檔（T05～T07 產出）
```

## `categories.json`

類別清單，`id` 一經指定不可變更（其他檔案以 id 參照）。

```json
[{ "id": "convenience-store", "name": "超商" }]
```

固定包含以下 16 個類別：超商（`convenience-store`）、量販超市（`supermarket`）、咖啡（`coffee`）、餐飲（`dining`）、外送（`delivery`）、網購（`online-shopping`）、交通（`transport`）、加油（`gas`）、百貨（`department-store`）、旅遊住宿（`travel`）、娛樂影音（`entertainment`）、藥妝（`pharmacy`）、海外（`overseas`）、行動支付（`mobile-payment`）、日本（`japan`）、一般消費（`general`）。

`japan`（日本）用於卡片針對日本消費（例如日本當地加碼、日系通路）的專屬規則；官方規則若寫明「日本消費」而非泛稱「海外」，應使用 `japan` 而非 `overseas`，不可用 `overseas` 代替。

`general` 是特殊類別 id，代表「卡片的一般消費回饋」，不透過類別關鍵字比對，只用於規則的 `scope.type: "general"`。

## `issuers.json`（T04 產出）

發卡銀行清單與官方網域白名單，用於驗證 `sourceUrl` 是否可信。

```json
[
  {
    "id": "cathay",
    "name": "國泰世華銀行",
    "officialDomains": ["cathaybk.com.tw", "cathay-cube.com.tw"],
    "cardListUrl": "https://www.cathaybk.com.tw/...",
    "batch": 1
  }
]
```

- `id`：銀行代號，對應 `data/banks/<id>.json` 的檔名與 `bankId`。
- `officialDomains`：官方網域清單（含子網域視為符合，例如白名單含 `cathaybk.com.tw` 時，`www.cathaybk.com.tw` 視為符合）。
- `batch`：1、2 或 3，對應 T05～T07 的分批。

## `data/banks/<銀行 id>.json`（T05～T07 產出）

```json
{
  "bankId": "cathay",
  "cardListUrl": "銀行官網信用卡列表 URL",
  "checkedAt": "2026-10-10",
  "coverage": [
    { "cardName": "CUBE 卡", "status": "included", "cardId": "cathay-cube" },
    { "cardName": "亞洲萬里通聯名卡", "status": "excluded", "reason": "哩程卡，本期不收錄" }
  ],
  "cards": [
    {
      "id": "cathay-cube",
      "name": "CUBE 卡",
      "sourceUrl": "卡片官方介紹頁",
      "pointValue": { "unit": "小樹點", "twdPerPoint": 1, "sourceUrl": "...", "checkedAt": "2026-10-10" },
      "rules": [
        {
          "id": "cathay-cube-general",
          "plan": "",
          "scope": { "type": "general" },
          "rate": 0.3,
          "rawReward": "0.3% 小樹點",
          "cap": null,
          "conditions": [],
          "validFrom": "2026-01-01",
          "validTo": null,
          "sourceUrl": "...",
          "checkedAt": "2026-10-10"
        },
        {
          "id": "cathay-cube-digital-l2",
          "plan": "玩數位方案 Level 2",
          "scope": { "type": "merchant", "merchants": ["蝦皮購物", "momo購物網"], "basis": "merchant-list" },
          "rate": 3,
          "rawReward": "3% 小樹點",
          "cap": { "amount": 1000, "unit": "point", "period": "month" },
          "conditions": ["需切換至玩數位方案", "需設定帳戶自動扣繳"],
          "validFrom": "2026-10-01",
          "validTo": "2026-11-30",
          "sourceUrl": "...",
          "checkedAt": "2026-10-10"
        }
      ]
    }
  ]
}
```

### 欄位規則

- `bankId`：必填，須與檔名（不含 `.json`）及 `issuers.json` 中的 `id` 一致。
- `checkedAt`（頂層）：本檔案（涵蓋清單）整理時的查閱日期，格式 `YYYY-MM-DD`。
- `coverage`：列出該銀行官網上**所有發行中**的信用卡，不限於收錄的卡。
  - `status`：`included` 或 `excluded`。
  - `cardId`：`included` 時必填，對應 `cards[].id`。
  - `reason`：`excluded` 時必填，中文說明（例如「哩程卡，本期不收錄」「純聯名權益卡」「已停發」「頁面為 PDF，無法確認回饋規則」）。
- `cards[].id`：全站唯一（跨銀行也不可重複），建議 `<銀行 id>-<卡片代稱>`。
- `cards[].sourceUrl`：卡片官方介紹頁，網域必須在該銀行 `officialDomains` 內。
- `cards[].pointValue`：若回饋為點數，填點數換算新台幣的規則；現金回饋可省略此欄位。
- `cards[].rules`：每張卡至少一條 `scope.type === "general"` 的規則。
  - `id`：全站唯一，建議 `<卡片 id>-<說明>`。
  - `plan`：方案或等級名稱，單一方案的卡可填空字串 `""`。
  - `scope.type`：
    - `general`：一般消費，無需其他欄位。
    - `category`：`scope.categories` 為 `categories.json` 中的 id 陣列。
    - `merchant`：`scope.merchants` 為官方公告上的商家名稱陣列（照官方寫法，比對時經由 `merchants.json` 別名表解析）；`scope.basis` 為 `mcc` 或 `merchant-list`。
  - `rate`：換算成新台幣後的回饋百分比數字（`3` 代表 3%）。點數回饋需先用 `pointValue.twdPerPoint` 換算成等值 % 再填入；`rawReward` 保留官方原文寫法（例如「3% 小樹點」），供人工核對。
  - `cap`：`null` 代表無上限；否則為 `{ amount, unit, period }`：
    - `unit`：`TWD` 或 `point`。
    - `period`：`month`、`quarter`、`billing-cycle`、`campaign`、`year`、`per-transaction` 之一。
  - `conditions`：中文短標籤陣列，沒有條件則為 `[]`（畫面上不顯示）。
  - `validFrom`：`YYYY-MM-DD`，或 `null`（代表官方頁沒有寫明起日，引擎視為已生效）。**只有官方真的沒寫起日時才能填 `null`，不得自行編造或推算起日**；官方若有寫起日（即使只是活動公告日），一律照官方填寫。
  - `validTo`：`null` 代表官方未載明結束日；否則為 `YYYY-MM-DD`，且不得早於 `validFrom`（`validFrom` 為 `null` 時不檢查此項）。
  - `sourceUrl`：必填，網域必須在該銀行 `officialDomains` 內（含子網域）。
  - `checkedAt`：必填，`YYYY-MM-DD`，實際查閱官方頁面的日期。

## `merchants.json`（T08 產出）

```json
[{ "id": "pxmart", "name": "全聯", "aliases": ["全聯福利中心", "PX Mart"], "category": "supermarket" }]
```

- `id`：全站唯一。
- `aliases`：別名陣列，比對時與 `name` 一起視為相同商家（正規化後比對，見下）。
- `category`：所屬類別 id，用於「類別」規則比對與推測類別顯示。

## `category-keywords.json`（T08 產出）

```json
{ "coffee": ["咖啡", "cafe", "coffee"], "gas": ["加油站", "加油"] }
```

- 鍵為 `categories.json` 的 id（`general` 除外），值為關鍵字陣列，每個類別至少 3 個關鍵字。

## 字串正規化規則（T02 實作，供資料整理時參考命名一致性）

比對商家名稱前，一律：全形轉半形、轉為小寫、移除空白與連字號（`-`）。例如「７－１１」「7-11」「711」正規化後相同。

## 日期格式

所有日期欄位（`checkedAt`、`validFrom`、`validTo`）皆為 `YYYY-MM-DD`（ISO 8601 日期），必須是合法日期（例如不可為 `2026-02-30`）。
