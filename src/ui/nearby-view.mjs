// 「附近商家」面板共用的純邏輯：距離文字、比對說明、點店家後的查詢項目、Overpass 請求（T18b）。

/** 公開 Overpass 伺服器，依序試；都要有 CORS（瀏覽器才讀得到回應）。換新伺服器時跑 npm run smoke:nearby 確認。 */
export const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
export const OVERPASS_TIMEOUT_MS = 10000; // 每台的等待上限；逾時就換下一台
export const OVERPASS_LAST_TIMEOUT_MS = 40000; // 最後一台沒有下一台可換，等久一點（實測 mail.ru 一次查詢要 17～25 秒）
export const BUSY_TEXT = "查詢服務忙線，正在換一台…";
export const ALL_FAILED_TEXT = "查詢服務暫時無法使用，請稍後再試。";
export const SEARCH_RADIUS_M = 300;
/** 拒絕定位或定位失敗時的預設中心：台北車站。 */
export const DEFAULT_CENTER = { lat: 25.0478, lng: 121.517 };

export function distanceText(meters) {
  return meters < 1000 ? `${meters} 公尺` : `${(meters / 1000).toFixed(1)} 公里`;
}

/**
 * 清單裡每家店的說明：比對到商家就寫商家名，只能靠店家類型就說「推測」，都不是就說明走一般消費。
 * @param {{match: object}} item parseNearby 的一筆
 * @param {(id: string) => string} categoryName 類別 id 轉名稱
 */
export function matchLabel(item, categoryName) {
  const { match } = item;
  if (match.type === "merchant") return `對應商家：${match.merchant.name}`;
  if (match.type === "category-guess") return `依店家類型推測為「${categoryName(match.categoryId)}」`;
  return "查無對應，看一般消費回饋";
}

/**
 * 點一家店後要查的項目，格式同 app.mjs 的 runEntry：商家用商家庫名稱查，推測類別與無法對應都直接依類別查
 * （不走打字查詢，才不會跳出「找不到符合的商家」面板）。類別是系統推測、不是使用者選的，
 * 所以帶 via（店名與怎麼來的），結果標題與輸入框才寫得出店名（T18b 主管退件①）。
 */
export function entryForItem(item, categoryName, generalId) {
  const { match } = item;
  if (match.type === "merchant") return { kind: "merchant", name: match.merchant.name };
  const guess = match.type === "category-guess";
  const id = guess ? match.categoryId : generalId;
  return { kind: "category", id, name: categoryName(id), via: { store: item.name, how: guess ? "osm-guess" : "osm-none" } };
}

/**
 * 地圖圓點分三階，跟清單說明同一套（DESIGN.md「附近商家面板」）：有回饋資料的商家實心深色、
 * 推測類別空心、查無對應淡灰小點。Leaflet 圖層只吃色碼：#1b1b1a＝--text，#a9a69e 比 --text-3 再淡一階。
 */
export const DOT_STYLE = {
  merchant: { radius: 6, color: "#fff", weight: 1.5, fillColor: "#1b1b1a", fillOpacity: 1 },
  "category-guess": { radius: 5, color: "#1b1b1a", weight: 2, fillColor: "#fff", fillOpacity: 1 },
  general: { radius: 3.5, color: "#fff", weight: 1, fillColor: "#a9a69e", fillOpacity: 1 },
};

export function dotStyle(item) {
  return DOT_STYLE[item.match.type] ?? DOT_STYLE.general;
}

/** 狀態列：引擎最多回 maxResults 家，剛好滿額就表示被截斷，不能寫「共 N 家」（T18b 主管退件②）。 */
export function nearbyStatusText(count, maxResults) {
  return count >= maxResults
    ? `最近的 ${count} 家（${SEARCH_RADIUS_M} 公尺內還有更多），點一家看該刷哪張。`
    : `${SEARCH_RADIUS_M} 公尺內共 ${count} 家，點一家看該刷哪張。`;
}

async function fetchOne(url, query, fetchFn, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchFn(url, {
      method: "POST",
      body: new URLSearchParams({ data: query }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.elements)) throw new Error("回應格式不對"); // 忙線時有些伺服器回 200 加錯誤文字
    return json;
  } catch (err) {
    throw new Error(err.name === "AbortError" ? "逾時" : err.message);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 依序向多台 Overpass 伺服器送查詢：一台逾時、HTTP 錯誤、非 JSON 就換下一台（換之前呼叫 onRetry）。
 * 全部失敗才丟 Error（message 為最後一台的原因）。
 * @param {string} query Overpass QL
 * @param {{fetchFn?: typeof fetch, timeoutMs?: number, lastTimeoutMs?: number, urls?: string[], onRetry?: (failedUrl: string, reason: string) => void}} [options]
 */
export async function fetchOverpass(query, { fetchFn = fetch, timeoutMs = OVERPASS_TIMEOUT_MS, lastTimeoutMs = OVERPASS_LAST_TIMEOUT_MS, urls = OVERPASS_URLS, onRetry } = {}) {
  let lastError;
  for (let i = 0; i < urls.length; i++) {
    try {
      return await fetchOne(urls[i], query, fetchFn, i === urls.length - 1 ? lastTimeoutMs : timeoutMs);
    } catch (err) {
      lastError = err;
      if (i < urls.length - 1) onRetry?.(urls[i], err.message);
    }
  }
  throw lastError;
}

/** 結果清單全是「查無對應」（例如在國外查）就補一句說明；資料庫只有台灣商家。 */
export function noCoverageNote(items) {
  return items.length > 0 && items.every((i) => i.match.type === "general") ? "目前只收錄台灣的商家。" : "";
}
