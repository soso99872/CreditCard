import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { thirdPartyInfo } from "../src/ui/source-label.mjs";

describe("src/ui/source-label.mjs — thirdPartyInfo（AC-05、AC-06）", () => {
  test("官方規則（或沒有 sourceType）回傳 null", () => {
    assert.equal(thirdPartyInfo({ sourceType: "official", sourceUrl: "https://a.example.com" }), null);
    assert.equal(thirdPartyInfo({ sourceUrl: "https://a.example.com" }), null);
    assert.equal(thirdPartyInfo(undefined), null);
  });

  test("第三方規則：標籤、文章日期、單一連結", () => {
    const info = thirdPartyInfo({
      sourceType: "third-party",
      sourceUrl: "https://blog.example.net/a",
      sourcePublishedAt: "2026-10-12",
      secondSourceUrl: null,
    });
    assert.equal(info.label, "非官方來源，尚未核對官方");
    assert.equal(info.dateText, "文章日期 2026-10-12");
    assert.deepEqual(info.links, [{ url: "https://blog.example.net/a", text: "看第三方文章" }]);
  });

  test("有第二來源時兩個連結都列", () => {
    const info = thirdPartyInfo({
      sourceType: "third-party",
      sourceUrl: "https://blog.example.net/a",
      sourcePublishedAt: "2026-10-12",
      secondSourceUrl: "https://news.example.org/b",
    });
    assert.deepEqual(
      info.links.map((l) => l.url),
      ["https://blog.example.net/a", "https://news.example.org/b"],
    );
  });
});
