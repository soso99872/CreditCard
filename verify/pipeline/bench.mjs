// 推薦結果基準：用常用商家與類別各查一次，輸出前 3 名（卡片 id、回饋率）。
// 用法：node verify/pipeline/bench.mjs <資料目錄> <今天 YYYY-MM-DD>
import fs from "node:fs/promises";
import path from "node:path";
import { loadAllData, recommend } from "../../src/engine/index.mjs";
const dir = process.argv[2] || "data", today = process.argv[3] || new Date().toISOString().slice(0, 10);
const fetchJson = async (u) => JSON.parse(await fs.readFile(path.join(dir, u.replace(/^data\//, "")), "utf8"));
const d = await loadAllData({ baseUrl: "data/", fetchJson });
const MERCHANTS = ["全聯", "7-ELEVEN", "全家", "家樂福", "好市多", "蝦皮購物", "momo購物網", "PChome 24h購物", "Uber Eats", "foodpanda",
  "星巴克", "麥當勞", "台灣中油", "新光三越", "遠東SOGO", "屈臣氏", "康是美", "Netflix", "Spotify", "Agoda", "Booking.com", "台灣高鐵",
  "威秀影城", "LINE Pay", "街口支付", "IKEA", "Costco", "誠品", "寶雅", "全支付", "Apple 媒體服務", "Google Play", "YouTube Premium", "ChatGPT"];
const CATS = ["convenience-store", "supermarket", "coffee", "dining", "delivery", "online-shopping", "transport", "gas", "department-store",
  "travel", "entertainment", "pharmacy", "overseas", "mobile-payment", "japan"];
const out = {};
const top = (r) => r.recommendations.slice(0, 3).map((x) => ({ card: x.cardId ?? x.card?.id, rate: x.rate }));
for (const q of MERCHANTS) out[q] = top(recommend({ query: q, ...d, today }));
for (const c of CATS) out["類別:" + c] = top(recommend({ query: c, selectedCategoryId: c, ...d, today }));
console.log(JSON.stringify(out, null, 1));
