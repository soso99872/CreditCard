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
async function run({ miss = "404", leak = [], down = false, dist = fakeDist() } = {}) {
  const server = createServer((req, res) => {
    const p = decodeURIComponent(req.url.slice(1)) || "index.html";
    if (down) { res.writeHead(404); return res.end("not found"); }
    if (existsSync(join(dist, p))) { res.writeHead(200); return res.end(readFileSync(join(dist, p))); }
    if (leak.includes(p)) { res.writeHead(200); return res.end("secret source"); }
    if (miss === "home") { res.writeHead(200); return res.end(readFileSync(join(dist, "index.html"))); }
    res.writeHead(Number(miss)); res.end("no");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  try {
    return await new Promise((r) => execFile(process.execPath, [join(root, "scripts", "check-public.mjs"), url],
      { env: { ...process.env, CHECK_PUBLIC_DIST: dist } }, (err, stdout, stderr) => r({ code: err ? err.code : 0, out: stdout + stderr })));
  } finally { server.close(); }
}

test("沒漏（不在 dist 的回 404）→ 0", async () => assert.equal((await run()).code, 0));
test("沒漏（找不到檔時回首頁）→ 0", async () => assert.equal((await run({ miss: "home" })).code, 0));
test("敏感檔漏出一定查得到 → 1", async () => {
  const r = await run({ leak: [SECRET] });
  assert.equal(r.code, 1);
  assert.match(r.out, /server\.mjs/);
});
test("網址錯（連首頁和 dist 的檔都 404）→ 不能算沒漏", async () => assert.notEqual((await run({ down: true })).code, 0));
test("不在 dist 的檔回 500 → 不能算沒漏", async () => assert.notEqual((await run({ miss: "500" })).code, 0));
test("dist 裡混進敏感檔 → 1", async () => {
  const r = await run({ dist: fakeDist(["scripts/server.mjs"]) });
  assert.equal(r.code, 1);
  assert.match(r.out, /dist/);
});
