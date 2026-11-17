// 檢查線上網站有沒有漏出原始碼：git 追蹤、但不在 dist/ 的檔案，線上要抓不到（404，或內容跟首頁一樣＝Pages 找不到檔案時回首頁）。
// 推薦引擎（src/engine）在瀏覽器裡算，本來就公開，所以不檢查 JS 內容。
// 用法：node scripts/check-public.mjs [網址]（預設 https://creditcardpick.pages.dev），先跑 node scripts/build-public.mjs。
// 全過回 0，有漏回 1。
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const base = (process.argv[2] || "https://creditcardpick.pages.dev").replace(/\/+$/, "");
const dist = join(root, "dist");

if (!existsSync(dist)) { console.error("先跑 node scripts/build-public.mjs"); process.exit(1); }
const shipped = new Set();
(function walk(p) {
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const f = join(p, e.name);
    e.isDirectory() ? walk(f) : shipped.add(f.slice(dist.length + 1).replace(/\\/g, "/"));
  }
})(dist);

// 不該公開的：每個資料夾最多抽 5 個，避免一次打太多次
const hidden = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter((f) => f && !shipped.has(f));
const perDir = {};
const sample = hidden.filter((f) => { const d = f.includes("/") ? f.split("/")[0] : "."; perDir[d] = (perDir[d] || 0) + 1; return perDir[d] <= 5; });

const get = async (path) => { const r = await fetch(`${base}/${encodeURI(path)}`, { redirect: "follow" }); return { status: r.status, body: await r.text() }; };
const home = (await get("")).body;
const leaks = [];
for (const f of sample) {
  const { status, body } = await get(f);
  if (status === 200 && body !== home) leaks.push(`${f}（${status}，${body.length} 字）`);
}

console.log(`${base}：抽查不公開檔 ${sample.length} 個（共 ${hidden.length} 個），漏出 ${leaks.length} 個`);
for (const l of leaks) console.log("  漏出：" + l);
process.exit(leaks.length ? 1 : 0);
