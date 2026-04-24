"use strict";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const TRUSTED_FETCH_SITES = new Set(["same-origin", "same-site", "none"]);

function isWriteMethod(method) {
  return WRITE_METHODS.has(String(method || "").toUpperCase());
}

function isAllowedLocalOrigin(origin, { port } = {}) {
  if (!origin) return false;
  try {
    const url = new URL(origin);
    const actualPort = url.port || (url.protocol === "https:" ? "443" : "80");
    return url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname) && actualPort === String(port);
  } catch {
    return false;
  }
}

function isAllowedLocalWrite(req, { port } = {}) {
  if (!isWriteMethod(req.method)) return true;

  const origin = req.headers.origin;
  if (origin && !isAllowedLocalOrigin(origin, { port })) return false;

  const fetchSite = req.headers["sec-fetch-site"];
  if (fetchSite && !TRUSTED_FETCH_SITES.has(String(fetchSite).toLowerCase())) return false;

  return true;
}

function guardLocalWrite(req, res, { port, sendJson } = {}) {
  if (isAllowedLocalWrite(req, { port })) return true;
  sendJson(res, 403, { error: "Forbidden local write request origin." });
  return false;
}

module.exports = {
  isAllowedLocalOrigin,
  isAllowedLocalWrite,
  guardLocalWrite
};
