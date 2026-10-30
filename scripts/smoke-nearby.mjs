// 附近商家冒煙測試：對每台備用 Overpass 伺服器實際送一次台北車站附近的查詢，列出成功／失敗、耗時、家數。
// 至少一台成功 exit 0，全部失敗 exit 1。不依賴瀏覽器；各台同時查，整體上限約 40 秒。
// 用法：npm run smoke:nearby

import { buildOverpassQuery } from "../src/engine/nearby.mjs";
import { OVERPASS_URLS, DEFAULT_CENTER, SEARCH_RADIUS_M } from "../src/ui/nearby-view.mjs";

const TIMEOUT_MS = 40000;
const query = buildOverpassQuery(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng, SEARCH_RADIUS_M);

async function probe(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "user-agent": "cardpick-smoke/1.0 (https://creditcardpick.pages.dev)", accept: "*/*" },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json.elements)) throw new Error("回應格式不對");
    const cors = res.headers.get("access-control-allow-origin");
    return { url, ok: true, ms: Date.now() - start, count: json.elements.length, cors };
  } catch (err) {
    return { url, ok: false, ms: Date.now() - start, error: err.name === "TimeoutError" ? "逾時" : err.message };
  }
}

const results = await Promise.all(OVERPASS_URLS.map(probe));
for (const r of results) {
  const host = new URL(r.url).host;
  console.log(r.ok
    ? `OK   ${host}  ${r.ms}ms  ${r.count} 筆  CORS=${r.cors ?? "無"}`
    : `FAIL ${host}  ${r.ms}ms  ${r.error}`);
}
const okCount = results.filter((r) => r.ok).length;
console.log(`${okCount}/${results.length} 台可用`);
process.exit(okCount > 0 ? 0 : 1);
