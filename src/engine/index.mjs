// 推薦引擎對外入口。T03（網頁介面）只應從這裡 import，不直接 import 內部模組。
// 各函式的詳細說明見同目錄下各檔案的 JSDoc，以及本目錄 README.md 的使用範例。

export { normalize } from "./normalize.mjs";
export { buildMerchantIndex, resolveMerchantId, matchMerchant } from "./merchant-match.mjs";
export { isRuleActive, selectBestRule } from "./rules.mjs";
export { formatRate, formatCap, formatReason, estimateReward } from "./format.mjs";
export { loadAllData } from "./data-loader.mjs";
export { recommend } from "./recommend.mjs";
export { buildOverpassQuery, parseNearby } from "./nearby.mjs";
