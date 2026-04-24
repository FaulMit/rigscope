"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { isAllowedLocalOrigin, isAllowedLocalWrite } = require("../lib/request-guard");

test("local write guard allows same local app origin", () => {
  assert.equal(isAllowedLocalOrigin("http://127.0.0.1:8787", { port: 8787 }), true);
  assert.equal(isAllowedLocalOrigin("http://localhost:8787", { port: 8787 }), true);
});

test("local write guard rejects cross-site origins and mismatched ports", () => {
  assert.equal(isAllowedLocalOrigin("https://example.com", { port: 8787 }), false);
  assert.equal(isAllowedLocalOrigin("http://127.0.0.1:9999", { port: 8787 }), false);
  assert.equal(isAllowedLocalOrigin("not a url", { port: 8787 }), false);
});

test("local write guard blocks browser cross-site writes", () => {
  assert.equal(isAllowedLocalWrite({
    method: "POST",
    headers: {
      origin: "https://example.com",
      "sec-fetch-site": "cross-site"
    }
  }, { port: 8787 }), false);

  assert.equal(isAllowedLocalWrite({
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:8787",
      "sec-fetch-site": "same-origin"
    }
  }, { port: 8787 }), true);
});

test("local write guard leaves reads and non-browser local clients usable", () => {
  assert.equal(isAllowedLocalWrite({ method: "GET", headers: { origin: "https://example.com" } }, { port: 8787 }), true);
  assert.equal(isAllowedLocalWrite({ method: "POST", headers: {} }, { port: 8787 }), true);
});
