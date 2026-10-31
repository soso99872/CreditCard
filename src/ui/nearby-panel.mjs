// 「附近商家」全螢幕面板：按下才載入 Leaflet、OSM 圖磚與商家位置檔，頁面載入時不發任何地圖或 Overpass 請求（T18b）。
// 台灣境內先讀靜態商家檔（data/merchants-geo.json），沒有結果或在國外才問 Overpass（T21）。
// 純邏輯在 nearby-view.mjs、引擎在 engine/nearby.mjs；本檔只處理 DOM 與地圖。

import { buildMerchantIndex, buildOverpassQuery, parseNearby, decodeGeo, nearbyFromGeo, MAX_RESULTS } from "../engine/index.mjs";
import { DEFAULT_CENTER, SEARCH_RADIUS_M, distanceText, matchLabel, entryForItem, fetchOverpass, nearbyStatusText, noCoverageNote, dotStyle, BUSY_TEXT, ALL_FAILED_TEXT } from "./nearby-view.mjs";

const LEAFLET_JS = "vendor/leaflet/leaflet.js";
const LEAFLET_CSS = "vendor/leaflet/leaflet.css";
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> 貢獻者';
const GEO_TIMEOUT_MS = 8000;
const STALE_DISTANCE_M = 60; // 地圖中心離上次查詢超過這個距離，「查這裡」就變成建議動作

let leafletPromise = null;

function loadLeaflet() {
  leafletPromise ??= new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve(window.L);
    script.onerror = () => reject(new Error("地圖元件載入失敗"));
    document.head.append(css, script);
  }).catch((err) => {
    leafletPromise = null; // 失敗後允許重試
    throw err;
  });
  return leafletPromise;
}

/**
 * @param {{
 *   getData: () => {merchants: object[], categories: object[]},
 *   baseUrl: string, generalId: string,
 *   onPick: (entry: {kind: string, id?: string, name: string}) => void,
 *   onSearchByName: () => void,
 * }} options
 * @returns {{open: () => void}}
 */
export function createNearbyPanel({ getData, baseUrl, generalId, onPick, onSearchByName }) {
  const $ = (id) => document.getElementById(id);
  const dialog = $("nearby-dialog");
  const statusEl = $("nearby-status");
  const searchBtn = $("nearby-search-btn");
  const listEl = $("nearby-list");

  let map = null;
  let markers = null; // L.layerGroup：搜尋範圍圈＋各店圓點
  const dots = new Map(); // 店家 → 地圖上的圓點
  let osmCategories = null;
  let geoPromise = null; // 商家位置檔；載入失敗就清掉，下次再試
  let lastOrigin = null;
  let retryMode = false;
  let token = 0; // 只接受最新一次查詢的結果

  const categoryName = (id) => getData().categories.find((c) => c.id === id)?.name ?? id;

  function setStatus(text) {
    statusEl.textContent = text;
  }

  function setRetry(on) {
    retryMode = on;
    searchBtn.textContent = on ? "重試" : "查這裡";
    searchBtn.classList.toggle("is-stale", on); // 失敗時「重試」是該按的主要動作
  }

  async function loadGeo() {
    geoPromise ??= fetch(`${baseUrl}merchants-geo.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((geo) => ({ date: geo.generated.slice(0, 10), places: decodeGeo(geo) }));
    try {
      return await geoPromise;
    } catch {
      geoPromise = null;
      return null;
    }
  }

  function renderList(items, onMore) {
    listEl.replaceChildren();
    for (const item of items) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "nearby-item";
      const name = document.createElement("span");
      name.className = "nearby-item-name";
      name.textContent = item.name;
      const dist = document.createElement("span");
      dist.className = "nearby-item-dist num";
      dist.textContent = distanceText(item.distanceM);
      const sub = document.createElement("span");
      sub.className = `nearby-item-sub nearby-item-sub--${item.match.type}`;
      sub.textContent = matchLabel(item, categoryName);
      button.append(name, dist, sub);
      // 滑過或聚焦清單項目，地圖上那家店的圓點放大，對得上是哪一家
      const dot = dots.get(item);
      const base = dotStyle(item);
      const light = (on) => dot?.setStyle(on ? { radius: 10, weight: 3 } : { radius: base.radius, weight: base.weight });
      button.addEventListener("pointerenter", () => light(true));
      button.addEventListener("pointerleave", () => light(false));
      button.addEventListener("focus", () => light(true));
      button.addEventListener("blur", () => light(false));
      button.addEventListener("click", () => {
        dialog.close();
        onPick(entryForItem(item, categoryName, generalId));
      });
      const li = document.createElement("li");
      li.appendChild(button);
      listEl.appendChild(li);
    }
    if (onMore) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "btn nearby-fallback-btn";
      more.textContent = "查更多店家（含小店）";
      more.addEventListener("click", onMore);
      const li = document.createElement("li");
      li.appendChild(more);
      listEl.appendChild(li);
    }
  }

  // 清單是空的時候（還沒查、查無、失敗）放一張說明卡；手機上改讓地圖長高（is-roomy），桌機留在右欄
  function renderEmpty(title, body, roomy = true, withSearchFallback = false) {
    listEl.replaceChildren();
    const li = document.createElement("li");
    li.className = "nearby-empty";
    const strong = document.createElement("strong");
    strong.textContent = title;
    const p = document.createElement("span");
    p.textContent = body;
    li.append(strong, p);
    if (withSearchFallback) {
      const fallback = document.createElement("button");
      fallback.type = "button";
      fallback.className = "btn nearby-fallback-btn";
      fallback.textContent = "改用店名搜尋";
      fallback.addEventListener("click", () => {
        dialog.close();
        onSearchByName();
      });
      li.append(fallback);
    }
    listEl.appendChild(li);
    if (roomy) setRoomy(true);
  }

  function setRoomy(on) {
    if (dialog.classList.contains("is-roomy") === on) return;
    dialog.classList.toggle("is-roomy", on);
    map?.invalidateSize();
  }

  function drawMarkers(origin, items) {
    const L = window.L;
    markers.clearLayers();
    L.circle([origin.lat, origin.lng], { radius: SEARCH_RADIUS_M, color: "#1b1b1a", weight: 1, dashArray: "4 4", fill: false, interactive: false }).addTo(markers);
    dots.clear();
    for (const item of items) {
      dots.set(item, L.circleMarker([item.lat, item.lng], { ...dotStyle(item), interactive: false }).addTo(markers));
    }
  }

  async function search(origin, { viaOverpass = false } = {}) {
    const mine = ++token;
    lastOrigin = origin;
    setRetry(false);
    searchBtn.disabled = true;
    renderEmpty("查詢中", "正在查這個位置附近有哪些店；若要向 OpenStreetMap 問，忙線時會自動換查詢伺服器，可能要多等一下。", false);
    listEl.setAttribute("aria-busy", "true");
    setStatus("查詢附近商家中…");
    try {
      if (!viaOverpass) {
        const geo = await loadGeo();
        if (mine !== token) return;
        const fromGeo = geo && nearbyFromGeo(geo.places, origin, SEARCH_RADIUS_M, new Map(getData().merchants.map((m) => [m.id, m])));
        if (fromGeo) {
          drawMarkers(origin, fromGeo);
          setRoomy(false);
          renderList(fromGeo, () => search(origin, { viaOverpass: true }));
          setStatus(`${nearbyStatusText(fromGeo.length, MAX_RESULTS)}（店家位置資料 ${geo.date}，只含有回饋資料的商家）`);
          return;
        }
      }
      osmCategories ??= await (await fetch(`${baseUrl}osm-categories.json`)).json();
      const json = await fetchOverpass(buildOverpassQuery(origin.lat, origin.lng, SEARCH_RADIUS_M), {
        onRetry: () => mine === token && setStatus(BUSY_TEXT),
      });
      if (mine !== token) return;
      const items = parseNearby(json, origin, { merchantIndex: buildMerchantIndex(getData().merchants), osmCategories });
      drawMarkers(origin, items);
      if (items.length) {
        setRoomy(false);
        renderList(items);
        setStatus(`${nearbyStatusText(items.length, MAX_RESULTS)}${noCoverageNote(items)}`);
      } else {
        renderEmpty("這附近查無商家", "換個位置再查：點地圖上別處，或拖動地圖後按「查這裡」。");
        setStatus(`${SEARCH_RADIUS_M} 公尺內查無商家，換個位置再查。`);
      }
    } catch (err) {
      if (mine !== token) return;
      setStatus(ALL_FAILED_TEXT);
      renderEmpty("這次沒查到資料", "查詢服務暫時無法使用，可以按「重試」，或先改用店名搜尋。", false, true);
      setRoomy(false);
      setRetry(true);
    } finally {
      if (mine === token) {
        searchBtn.disabled = false;
        listEl.removeAttribute("aria-busy");
      }
    }
  }

  function locate() {
    return new Promise((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: GEO_TIMEOUT_MS, maximumAge: 60000 }
      );
    });
  }

  async function init() {
    setStatus("定位中…");
    searchBtn.disabled = true;
    let L;
    try {
      L = await loadLeaflet();
    } catch (err) {
      setStatus(`${err.message}，請重試。`);
      renderEmpty("地圖沒載入", "按「重試」再載入一次。");
      setRetry(true);
      searchBtn.disabled = false;
      return;
    }
    const here = await locate();
    const center = here ?? DEFAULT_CENTER;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    map = L.map("nearby-map", { zoomAnimation: !still, fadeAnimation: !still, markerZoomAnimation: !still }).setView([center.lat, center.lng], 16);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);
    markers = L.layerGroup().addTo(map);
    // 點地圖：把那個位置移到中心並查附近；拖動後中心離上次查詢太遠，就把「查這裡」標成建議動作
    map.on("click", (e) => {
      map.panTo(e.latlng, { animate: !still });
      search({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    map.on("moveend", () => {
      if (!lastOrigin || retryMode) return;
      searchBtn.classList.toggle("is-stale", map.distance(map.getCenter(), [lastOrigin.lat, lastOrigin.lng]) > STALE_DISTANCE_M);
    });
    if (here) return search(center);
    setStatus("沒有取得你的位置，先顯示台北車站。拖動地圖、點一個位置，或按「查這裡」查附近商家。");
    renderEmpty("還沒查附近商家", "點地圖上的任一處，或拖動地圖後按「查這裡」，附近的商家會列在這裡。");
    searchBtn.disabled = false;
    searchBtn.classList.add("is-stale");
  }

  searchBtn.addEventListener("click", () => {
    if (!map) return init();
    if (retryMode) return search(lastOrigin ?? DEFAULT_CENTER);
    const c = map.getCenter();
    search({ lat: c.lat, lng: c.lng });
  });
  $("nearby-close-btn").addEventListener("click", () => dialog.close());
  // 點對話框外（backdrop）也關閉：dialog 全螢幕時點不到外面，桌機置中時才有用
  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) dialog.close();
  });

  return {
    open() {
      dialog.showModal();
      if (map) map.invalidateSize();
      else if (!searchBtn.disabled) init(); // 初始化中按鈕是停用的，不重複初始化
    },
  };
}
