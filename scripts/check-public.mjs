// 檢查線上網站有沒有漏出原始碼：git 追蹤、但不在 dist/ 的檔案，線上要抓不到（404，或內容跟首頁一樣＝Pages 找不到檔案時回首頁）。
// 敏感檔（腳本、測試、排程）全部查，其他資料夾每個抽 5 個；首頁與一個 dist 的檔要抓得到，網址錯了才不會誤判成沒漏。
// 另檢查 dist 裡沒有混進敏感檔。推薦引擎（src/*.mjs）在瀏覽器裡算，本來就公開，所以不算敏感、不檢查 JS 內容。
// 用法：node scripts/check-public.mjs [網址]（預設 https://creditcardpick.pages.dev），先跑 node scripts/build-public.mjs。
// 全過回 0，有漏回 1，網站抓不到或回應不對回 2。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "https://creditcardpick.pages.dev").replace(/\/+$/, "");
const dist = process.env.CHECK_PUBLIC_DIST || join(root, "dist");
const SENSITIVE = /^(scripts|test|\.github)\/|\.(py|toml|ya?ml|sh|ps1|env)$/;

if (!existsSync(dist)) { console.error("先跑 node scripts/build-public.mjs"); process.exit(1); }
const shipped = new Set();
(function walk(p) {
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    e.isDirectory() ? walk(f) : shipped.add(f.slice(dist.length + 1).replace(/\\/g, "/"));
  }
})(dist);

const hidden = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !shipped.has(f));
const perDir = {};
const sample = hidden.filter((f) => {
  if (SENSITIVE.test(f)) return true;
  const d = f.includes("/") ? f.split("/")[0] : ".";
  perDir[d] = (perDir[d] || 0) + 1;
  return perDir[d] <= 5;
});

const get = async (path) => {
  try { const r = await fetch(`${base}/${encodeURI(path)}`, { redirect: "follow" }); return { status: r.status, body: await r.text() }; }
  catch (e) { return { status: 0, body: String(e) }; }
};
const errors = [];
const home = await get("");
if (home.status !== 200) errors.push(`首頁回 ${home.status}`);
const probe = [...shipped].sort().find((f) => f !== "index.html");
if (probe) {
  const r = await get(probe);
  if (r.status !== 200 || r.body === home.body) errors.push(`dist 的 ${probe} 抓不到（${r.status}），網址可能不對`);
}
const leaks = [];
for (const f of sample) {
  const { status, body } = await get(f);
  if (status === 404 || (status === 200 && body === home.body)) continue;
  if (status === 200) leaks.push(`${f}（${status}，${body.length} 字）`);
  else errors.push(`${f} 回 ${status}，不能確定有沒有漏`);
}
const distLeaks = [...shipped].filter((f) => SENSITIVE.test(f));

console.log(`${base}：查不公開檔 ${sample.length} 個（共 ${hidden.length} 個），漏出 ${leaks.length} 個；dist 混進敏感檔 ${distLeaks.length} 個；回應不對 ${errors.length} 個`);
for (const l of leaks) console.log("  漏出：" + l);
for (const l of distLeaks) console.log("  dist 混進：" + l);
for (const l of errors.slice(0, 10)) console.log("  回應不對：" + l);
process.exit(leaks.length || distLeaks.length ? 1 : errors.length ? 2 : 0);
