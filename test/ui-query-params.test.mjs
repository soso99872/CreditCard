import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { resolveDataBaseUrl, isDraftMode } from "../src/ui/query-params.mjs";

describe("src/ui/query-params.mjs — resolveDataBaseUrl（?data=<目錄>）", () => {
  test("沒有查詢字串時預設 data/", () => {
    assert.equal(resolveDataBaseUrl(""), "data/");
    assert.equal(resolveDataBaseUrl(undefined), "data/");
  });

  test("?data=<目錄> 指定測試資料目錄，供 T02 的測試資料走完流程", () => {
    assert.equal(resolveDataBaseUrl("?data=test/fixtures/engine"), "test/fixtures/engine/");
  });

  test("指定的目錄已經以斜線結尾時，不會多出一個斜線", () => {
    assert.equal(resolveDataBaseUrl("?data=test/fixtures/engine/"), "test/fixtures/engine/");
  });

  test("data 參數是空字串時視為沒指定，用預設值", () => {
    assert.equal(resolveDataBaseUrl("?data="), "data/");
  });

  test("有其他不相關的查詢參數時不受影響", () => {
    assert.equal(resolveDataBaseUrl("?foo=bar&data=test/fixtures/engine"), "test/fixtures/engine/");
  });
});

describe("src/ui/query-params.mjs — resolveDataBaseUrl 只接受站內相對路徑（T12-1）", () => {
  test("含 // 的值（protocol-relative URL）視為不安全，退回預設 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=//evil.example/data"), "data/");
  });

  test("含 : 的值（帶 scheme 的網址）視為不安全，退回預設 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=http://evil.example/data"), "data/");
    assert.equal(resolveDataBaseUrl("?data=javascript:alert(1)"), "data/");
  });

  test("含 .. 路徑片段視為不安全，退回預設 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=../../etc"), "data/");
    assert.equal(resolveDataBaseUrl("?data=a/../b"), "data/");
  });

  test("一般的站內相對路徑（如 preview）仍可正常指定", () => {
    assert.equal(resolveDataBaseUrl("?data=preview"), "preview/");
  });
});

describe("src/ui/query-params.mjs — resolveDataBaseUrl 擋反斜線，避免跨網域 fetch（主管退回 T12-1 重做）", () => {
  // 瀏覽器解析 http(s) 網址時會把 `\` 當成 `/`，所以 `?data=` 裡只要出現反斜線，
  // 就可能讓 baseUrl 變成 protocol-relative URL（例如 `\\evil.com/` 等同 `//evil.com/`），
  // 導致 fetch 讀到站外網域的 JSON。以下案例全部要退回預設的 data/。

  test("值含兩個反斜線（等同 //evil.com 的 protocol-relative URL），退回 data/", () => {
    // 實際字元：?data=\\evil.com（兩個反斜線）
    assert.equal(resolveDataBaseUrl("?data=\\\\evil.com"), "data/");
  });

  test("值以 / 開頭、接一個反斜線，退回 data/", () => {
    // 實際字元：?data=/\evil.com
    assert.equal(resolveDataBaseUrl("?data=/\\evil.com"), "data/");
  });

  test("值以反斜線開頭、接 /，退回 data/", () => {
    // 實際字元：?data=\/evil.com
    assert.equal(resolveDataBaseUrl("?data=\\/evil.com"), "data/");
  });

  test("URL 編碼後的 ../ 路徑片段（.%2e/x，解碼後變成 ../x）退回 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=.%2e/x"), "data/");
  });

  test("值以 / 開頭（/data）即使字元合法仍退回 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=/data"), "data/");
  });

  test("URL 編碼後的反斜線（%5C%5Cevil.com，URLSearchParams 解碼後變成兩個反斜線）退回 data/", () => {
    assert.equal(resolveDataBaseUrl("?data=%5C%5Cevil.com"), "data/");
  });

  test("既有用法 preview、preview/、test/fixtures/engine 仍可正常指定", () => {
    assert.equal(resolveDataBaseUrl("?data=preview"), "preview/");
    assert.equal(resolveDataBaseUrl("?data=preview/"), "preview/");
    assert.equal(resolveDataBaseUrl("?data=test/fixtures/engine"), "test/fixtures/engine/");
  });
});

describe("src/ui/query-params.mjs — isDraftMode（?draft=1 開啟草稿資料預覽，T17）", () => {
  test("draft=1 時開啟", () => {
    assert.equal(isDraftMode("?draft=1"), true);
  });

  test("draft=0 時不開啟", () => {
    assert.equal(isDraftMode("?draft=0"), false);
  });

  test("draft=true 時不開啟（只接受字串 1）", () => {
    assert.equal(isDraftMode("?draft=true"), false);
  });

  test("沒有 draft 參數時不開啟", () => {
    assert.equal(isDraftMode(""), false);
    assert.equal(isDraftMode(undefined), false);
    assert.equal(isDraftMode("?data=preview"), false);
  });

  test("搭配其他參數時不受影響", () => {
    assert.equal(isDraftMode("?data=preview&draft=1"), true);
    assert.equal(isDraftMode("?data=preview&draft=0"), false);
  });
});
