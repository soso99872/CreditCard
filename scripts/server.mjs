#!/usr/bin/env node
// 極簡靜態伺服器，只用 Node 內建模組，提供專案根目錄（product/）下的檔案。
// 用法：node scripts/server.mjs（可用 PORT 環境變數指定埠號，預設 8080）

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, ".."); // product/
const PORT = Number(process.env.PORT) || 8080;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".md": "text/markdown; charset=utf-8",
};

function contentTypeFor(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream";
}

/**
 * 把 request URL 轉成 ROOT 底下的安全絕對路徑；跳脫 ROOT 時回傳 null。
 */
function resolveSafePath(requestUrl) {
  const decoded = decodeURIComponent(requestUrl.split("?")[0]);
  const relative = decoded.replace(/^\/+/, "");
  const target = path.resolve(ROOT, relative);
  if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
    return null; // 嘗試跳出根目錄（例如 ../../etc/passwd）
  }
  return target;
}

export function createServer() {
  return http.createServer(async (req, res) => {
    try {
      const safePath = resolveSafePath(req.url || "/");
      if (!safePath) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Bad request");
        return;
      }

      let targetPath = safePath;
      const info = await stat(targetPath).catch(() => null);
      if (info && info.isDirectory()) {
        targetPath = path.join(targetPath, "index.html");
      }

      const body = await readFile(targetPath);
      res.writeHead(200, { "Content-Type": contentTypeFor(targetPath) });
      res.end(body);
    } catch (err) {
      if (err.code === "ENOENT") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
      } else {
        res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Internal server error");
      }
    }
  });
}

function main() {
  const server = createServer();
  server.listen(PORT, () => {
    console.log(`cardpick 靜態伺服器啟動：http://localhost:${PORT}/`);
    console.log(`提供目錄：${ROOT}`);
  });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
