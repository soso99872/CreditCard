// node --test scripts/check-public.test.mjs：用本機假伺服器模擬 Cloudflare Pages，確認 check-public 抓得到漏洞、網址錯了不會誤判成沒漏。
import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECRET = "scripts/server.mjs"; // 字母序排很後面，以前的抽樣抽不到

function fakeDist(extra = []) {
  const d = mkdtempSync(join(tmpdir(), "check-public-"));
  mkdirSync(join(d, "assets"));
  writeFileSync(join(d, "index.html"), "<html>home</html>");
  writeFileSync(join(d, "assets", "app.css"), "body{}");
  for (const f of extra) { mkdirSync(dirname(join(d, f)), { recursive: true }); writeFileSync(join(d, f), "x"); }
  return d;
}

// miss：不在 dist 的檔怎麼回（"404"、"home"＝回首頁、"500"）；leak：照樣回 200 的檔；down：整站 404
// spa：連 dist 的檔也回首頁；wrong：dist 的檔回 200 但內容不同；hang：首頁以外都不回；flaky：每個網址第一次回 503
async function run({ miss = "404", leak = [], down = false, spa = false, wrong = false, hang = false, flaky = false, dist = fakeDist() } = {}) {
  const seen = new Set();
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.slice(1)) || "index.html";
    if (down) { res.writeHead(404); return res.end("not found"); }
    if (hang && p !== "index.html") return;
    if (flaky && !seen.has(p)) { seen.add(p); res.writeHead(503); return res.end("busy"); }
    if (spa) { res.writeHead(200); return res.end(readFileSync(join(dist, "index.html"))); }
    if (wrong && p !== "index.html") { res.writeHead(200); return res.end("other site"); }
    if (existsSync(join(dist, p))) { res.writeHead(200); return res.end(readFileSync(join(dist, p))); }
    if (leak.includes(p)) { res.writeHead(200); return res.end("secret source"); }
    if (miss === "home") { res.writeHead(200); return res.end(readFileSync(join(dist, "index.html"))); }
    res.writeHead(Number(miss)); res.end("no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    return await new Promise((r) => execFile(process.execPath, [join(root, "scripts", "check-public.mjs"), url],
      { env: { ...process.env, CHECK_PUBLIC_DIST: dist + "/", CHECK_PUBLIC_TIMEOUT: "2000" } }, (err, stdout, stderr) => r({ code: err ? err.code : 0, out: stdout + stderr })));
  } finally { server.closeAllConnections(); server.close(); }
}

test("沒漏（不在 dist 的回 404）→ 0", async () => assert.equal((await run()).code, 0));
test("沒漏（找不到檔時回首頁）→ 0", async () => assert.equal((await run({ miss: "home" })).code, 0));
test("敏感檔漏出一定查得到 → 1", async () => {
  const r = await run({ leak: [SECRET] });
  assert.equal(r.code, 1);
  assert.match(r.out, /server\.mjs/);
});
test("網址錯（連首頁和 dist 的檔都 404）→ 2", async () => assert.equal((await run({ down: true })).code, 2));
test("不在 dist 的檔回 500 → 2", async () => assert.equal((await run({ miss: "500" })).code, 2));
test("錯的站（每個網址都回首頁，dist 的檔也是）→ 2", async () => assert.equal((await run({ miss: "home", spa: true })).code, 2));
test("錯的站（dist 的檔回 200 但內容不一樣）→ 2", async () => assert.equal((await run({ wrong: true })).code, 2));
test("網站卡住不回 → 2，不會一直等", async () => {
  const t0 = Date.now();
  assert.equal((await run({ hang: true })).code, 2);
  assert.ok(Date.now() - t0 < 30000);
});
test("只有一次 503 會重試，不算回應不對 → 0", async () => assert.equal((await run({ flaky: true })).code, 0));
test("dist 裡混進敏感檔 → 1", async () => {
  const r = await run({ dist: fakeDist(["scripts/server.mjs"]) });
  assert.equal(r.code, 1);
  assert.match(r.out, /dist/);
});
