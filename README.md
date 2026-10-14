# 刷哪張（cardpick）

輸入消費商家或類別，依全台發卡銀行官方公布的回饋規則推薦信用卡。詳見 `../PRD.md`。

## 環境需求

- Node.js 24 以上（純用內建模組，不需 `npm install`，沒有任何外部套件依賴）

## 資料格式

見 `data/SCHEMA.md`。

## 指令

在本目錄（`product/`）下執行：

```bash
npm start           # 啟動靜態伺服器（預設 http://localhost:8080/，可用 PORT 環境變數改埠號）
npm test            # 執行單元測試（node --test）
npm run validate    # 驗證 data/ 下的資料（必填欄位、網域白名單、id 重複、日期格式等）
npm run precheck    # 資料疑點預檢（可能違反資料整理檢查清單的規則），交主管檢核前先跑
npm run freshness   # 列出檢核日期過舊（>90 天）或即將到期（14 天內）的規則
npm run coverage    # 印出涵蓋清單彙總（銀行數、收錄／未收錄卡數與原因）
```

`validate`、`freshness`、`coverage` 都可以加參數指定資料目錄，方便對 fixture 測試：

```bash
npm run validate -- test/fixtures/valid
npm run freshness -- test/fixtures/freshness --today=2026-10-10
npm run coverage -- test/fixtures/valid
```

- `validate`：資料完整時 exit code 0；有問題時 exit code 1，並印出檔名、卡片 id、規則 id 與原因。除了 `data/banks/*.json` 本身的欄位，也會檢查：
  - `data/issuers.json` 本身的結構（必須是陣列；`id` 唯一且為小寫英數與連字號；`name` 非空；`officialDomains` 為非空字串陣列且不含 `http(s)://` 或路徑；`cardListUrl` 須是合法 `https` URL，且網域要在自己的 `officialDomains` 內；`batch` 必須是 1、2 或 3）。這項檢查不需要 `data/banks/` 存在也會執行。
  - `data/banks/` 有資料但 `data/issuers.json` 不存在，或某銀行的 `bankId` 不在 `issuers.json` 內，都視為錯誤（無法確認官方網域白名單）。
- `precheck`：啟發式檢查，列出「疑點」（例如原文提到登錄但 conditions 沒寫、原文有結束日但 `validTo` 為 null、原文提到指定通路卻用 category）與「提示」（只有一般消費的卡）。預設一律 exit 0；加 `--strict` 時有疑點就 exit 1。可用 `--bank dbs,hsbc` 只看指定銀行。
- `freshness`：可用 `--today=YYYY-MM-DD` 指定「今天」，方便寫可重現的測試；不指定則用系統當天日期。
- `coverage`：統計 `issuers.json` 銀行數、各銀行收錄／未收錄卡片數，以及未收錄原因清單。

## 目錄結構

```
product/
  data/
    SCHEMA.md              資料格式說明
    categories.json         類別清單
    issuers.json            發卡銀行與官方網域白名單（T04）
    merchants.json          商家庫與別名（T08）
    category-keywords.json  類別關鍵字（T08）
    banks/<銀行id>.json      每家銀行的卡片與規則（T05～T07）
  scripts/
    lib.mjs                 共用工具（日期、網域、資料載入）
    validate.mjs            資料驗證
    precheck.mjs            資料疑點預檢
    freshness.mjs           保鮮報告
    coverage.mjs            涵蓋清單彙總
    server.mjs              靜態伺服器（npm start）
  src/                      推薦引擎與網頁介面（T02、T03）
  test/
    fixtures/               測試用假資料
    tools.test.mjs           scripts/ 的單元測試
```
