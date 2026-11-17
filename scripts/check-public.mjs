// 檢查線上網站有沒有漏出原始碼：git 追蹤、但不在 dist/ 的檔案，線上要抓不到（404，或內容跟首頁一樣＝Pages 找不到檔案時回首頁）。
// 不在 dist 的檔全部查（不抽樣）；先確認首頁抓得到、一個 dist 的檔內容跟本機一樣，網址錯了才不會誤判成沒漏。
// 另檢查 dist 裡沒有混進敏感檔。
// 只查本機建出來的 dist；Cloudflare 自己重建的那份以線上回應為準。
// 用法：node scripts/check-public.mjs [網址]（預設 https://creditcardpick.pages.dev），先跑 node scripts/build-public.mjs。
// 全過回 0，有漏回 1，網站抓不到或回應不對回 2。每個請求逾時 CHECK_PUBLIC_TIMEOUT 毫秒（預設 20000），失敗重試一次。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "https://creditcardpick.pages.dev").replace(/\/+$/, "");
const dist = resolve(process.env.CHECK_PUBLIC_DIST || join(root, "dist"));
const TIMEOUT = Number(process.env.CHECK_PUBLIC_TIMEOUT) || 20000;
// src/*.mjs 本來就是前端程式，會公開，不能列進來
const SENSITIVE = /^(scripts|test|\.github)\/|\.test\.|\.(py|toml|ya?ml|sh|ps1|env)$/;

if (!existsSync(dist)) { console.error("先跑 node scripts/build-public.mjs"); process.exit(1); }
const shipped = new Set();
(function walk(p) {
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    e.isDirectory() ? walk(f) : shipped.add(f.slice(dist.length + 1).replace(/\\/g, "/"));
  }
})(dist);

// -z：中文檔名才不會被 git 加引號轉成八進位
const hidden = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" }).split("\0").filter((f) => f && !shipped.has(f));

const url = (path) => `${base}/${path.split("/").map(encodeURIComponent).join("/")}`;
const once = async (path) => {
  try {
    const r = await fetch(url(path), { redirect: "follow", signal: AbortSignal.timeout(TIMEOUT) });
    return { status: r.status, body: await r.text() };
  } catch (e) { return { status: 0, body: String(e) }; }
};
const get = async (path) => { const r = await once(path); return r.status === 200 || r.status === 404 ? r : once(path); };

const report = (leaks, distLeaks, errors) => {
  console.log(`${base}：查不公開檔 ${hidden.length} 個，漏出 ${leaks.length} 個；dist 混進敏感檔 ${distLeaks.length} 個；回應不對 ${errors.length} 個`);
  for (const l of leaks) console.log("  漏出：" + l);
  for (const l of distLeaks) console.log("  dist 混進：" + l);
  for (const l of errors.slice(0, 10)) console.log("  回應不對：" + l);
  process.exit(leaks.length || distLeaks.length ? 1 : errors.length ? 2 : 0);
};

const distLeaks = [...shipped].filter((f) => SENSITIVE.test(f));

// 網址對不對：首頁要 200；挑一個非空的 css/js/json，線上內容要跟本機 dist 一樣
const errors = [];
const home = await get("");
if (home.status !== 200) errors.push(`首頁回 ${home.status}`);
const probe = [...shipped].sort().find((f) => /\.(css|js|json)$/.test(f) && statSync(join(dist, f)).size > 0);
if (!probe) errors.push("dist 裡找不到可以對照的 css/js/json");
else {
  const r = await get(probe);
  if (r.status !== 200 || r.body !== readFileSync(join(dist, probe), "utf8")) errors.push(`dist 的 ${probe} 線上內容跟本機不同（${r.status}），網址可能不對`);
}
if (errors.length) report([], distLeaks, errors);   // 網址不對，查漏沒有意義

const leaks = [];
for (const f of hidden) {
  const { status, body } = await get(f);
  if (status === 404 || (status === 200 && body === home.body)) continue;
  if (status === 200) leaks.push(`${f}（${status}，${body.length} 字）`);
  else if (errors.push(`${f} 回 ${status}，不能確定有沒有漏`) >= 5) break;   // 連續出錯就不再打
}
report(leaks, distLeaks, errors);
