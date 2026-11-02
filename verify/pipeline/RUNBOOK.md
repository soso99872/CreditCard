# 刷哪張自動更新：每次執行的步驟

試行期（`MODE=trial`）只記錄判定，不改 `data/`。開放自動上線後（`MODE=live`），全過的修改才寫進資料並合併。

## 1. 抓頁面、偵測變動
- 雲端：在 `verify/2026-11` 分支把目前時間寫進 `verify/trigger.txt`，commit、push，等 GitHub Actions「驗證：抓來源頁快照與變動偵測」跑完（`gh run watch`），再 pull。
- 台灣網路（Soso 的電腦）：`python verify/snapshot.py` 後 `python verify/pipeline/detect.py 30`。中信、華南、第一銀行、臺銀和第三方網站擋國外 IP，只有這條路抓得到。
- 結果在 `verify/changes/latest.json`：`changed`（內容變了的頁和用到它的規則）、`blocked`（抓不到）、`expiring`（30 天內到期的規則）。

## 2. 要重抽的頁
- `changed` 裡的官方頁。
- `expiring` 規則：頁面內容有變才重抽；沒變就只列在報告裡（新期間常放在新網址，要靠信用卡列表頁的變動找）。
- 第三方網址一律不抽，列在報告裡當「要找官方來源」。

## 3. 兩次獨立抽取
每一頁派兩個彼此看不到的抽取員（A、B），都照 `verify/pipeline/EXTRACT.md`。卡片有 `pointValue.sourceUrl`（點數兌換頁）時，一起當附加頁給他們：
- 都不能讀 `data/banks/` 和對方的結果。
- A 照順序讀；B 用「挑剔的查核員」角度、倒序讀。
- 輸出到 `verify/runs/<日期>/A/<n>.json`、`B/<n>.json`。

## 4. 五道關卡
`python verify/pipeline/gates.py A/<n>.json B/<n>.json --today <日期>`（`MODE=live` 才加 `--apply`）
- 官方來源、兩份一致、數字在原文、合理範圍、資料檢查、推薦比對，全過才 `pass: true`。
- 結果寫進 `verify/runs/<日期>/gates.json`。

## 5. 回報
- 只回報例外：沒過關的頁和原因、抓不到的頁、快到期但官方還沒公布新期間的規則。
- 全過的列一行數量就好。

## 6. 稽核（每週一次）
- 隨機抽 20 條已上線的規則，派第三個抽取員獨立重讀官方頁，跟資料比。
- 抓到 1 條錯：`MODE` 改回 `trial`，通知 Soso。
