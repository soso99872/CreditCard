import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { resolveDataBaseUrl } from "../src/ui/query-params.mjs";

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
