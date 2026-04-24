"use strict";

const fs = require("fs");
const path = require("path");

const DEFAULT_MAX_JSON_BYTES = 1024 * 128;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Frame-Options": "DENY",
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};

function readJsonBody(req, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function sendDownload(res, filename, body) {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
  res.end(payload);
}

function createStaticHandler({ publicDir, port, mime = MIME } = {}) {
  const root = path.resolve(publicDir);
  return function serveStatic(req, res) {
    let pathname;
    try {
      const url = new URL(req.url, `http://localhost:${port}`);
      pathname = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS);
      res.end("Bad request");
      return;
    }

    const file = path.resolve(root, `.${pathname}`);
    if (!file.startsWith(`${root}${path.sep}`) && file !== root) {
      res.writeHead(403, SECURITY_HEADERS);
      res.end("Forbidden");
      return;
    }

    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404, SECURITY_HEADERS);
        res.end("Not found");
        return;
      }
      const type = mime[path.extname(file)] || "application/octet-stream";
      res.writeHead(200, { ...SECURITY_HEADERS, "Content-Type": type, "Cache-Control": "no-store" });
      res.end(data);
    });
  };
}

module.exports = {
  DEFAULT_MAX_JSON_BYTES,
  MIME,
  SECURITY_HEADERS,
  createStaticHandler,
  readJsonBody,
  sendDownload,
  sendJson
};
