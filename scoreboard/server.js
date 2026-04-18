"use strict";

const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const os = require("os");
const path = require("path");

const HOST = process.env.RIGSCOPE_SCOREBOARD_HOST || "127.0.0.1";
const PORT = Number(process.env.RIGSCOPE_SCOREBOARD_PORT || 8797);
const DATA_DIR = process.env.RIGSCOPE_SCOREBOARD_DATA || path.join(os.homedir(), ".rigscope-scoreboard");
const DB_FILE = path.join(DATA_DIR, "scoreboard.json");
const MAX_BODY = 128 * 1024;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;

const challenges = new Map();
const rate = new Map();

function nowIso() {
  return new Date().toISOString();
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > MAX_BODY) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function loadDb() {
  try {
    return JSON.parse(await fs.promises.readFile(DB_FILE, "utf8"));
  } catch {
    return { profiles: [], submissions: [] };
  }
}

async function saveDb(db) {
  await fs.promises.mkdir(DATA_DIR, { recursive: true });
  await fs.promises.writeFile(DB_FILE, JSON.stringify(db, null, 2));
}

function clientIp(req) {
  return String(req.socket.remoteAddress || "unknown");
}

function checkRateLimit(req) {
  const ip = clientIp(req);
  const entry = rate.get(ip) || { startedAt: Date.now(), count: 0 };
  if (Date.now() - entry.startedAt > RATE_WINDOW_MS) {
    entry.startedAt = Date.now();
    entry.count = 0;
  }
  entry.count += 1;
  rate.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => safeText(item, "")).filter(Boolean).join(", ").slice(0, 160) || fallback;
  if (typeof value === "object") return safeText(value.name || value.label || value.value || JSON.stringify(value).slice(0, 160), fallback);
  return String(value).trim().slice(0, 160) || fallback;
}

function numberScore(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(100000, n));
}

function normalizeProfile(input = {}) {
  const bench = input.bench && typeof input.bench === "object" ? input.bench : {};
  const cpuBench = numberScore(bench.cpu);
  const memoryBench = safeText(bench.memory);
  const gpuBench = safeText(bench.gpu);
  const submittedScore = numberScore(input.score);
  const derivedScore = submittedScore || Math.round(Math.max(cpuBench / 100, 0));
  const idSeed = [
    safeText(input.owner, "anonymous"),
    safeText(input.cpu),
    safeText(input.gpu),
    safeText(input.memory),
    String(derivedScore)
  ].join("|");
  const id = crypto.createHash("sha256").update(idSeed).digest("hex").slice(0, 16);
  return {
    id,
    name: safeText(input.name || "Unnamed Rig", "Unnamed Rig"),
    owner: safeText(input.owner || "anonymous", "anonymous"),
    score: Math.max(0, Math.min(10000, derivedScore)),
    cpu: safeText(input.cpu),
    gpu: safeText(input.gpu),
    memory: safeText(input.memory),
    storage: safeText(input.storage),
    board: safeText(input.board),
    os: safeText(input.os),
    bench: {
      cpu: cpuBench || "-",
      memory: memoryBench,
      gpu: gpuBench,
      sensors: safeText(bench.sensors)
    },
    submittedAt: nowIso()
  };
}

function consumeChallenge(nonce, req) {
  const entry = challenges.get(nonce);
  challenges.delete(nonce);
  if (!entry) return false;
  if (entry.ip !== clientIp(req)) return false;
  return Date.now() - entry.createdAt <= CHALLENGE_TTL_MS;
}

async function handle(req, res) {
  if (!checkRateLimit(req)) {
    sendJson(res, 429, { error: "rate limited" });
    return;
  }
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === "/api/v1/health") {
    sendJson(res, 200, { ok: true, app: "RigScope Scoreboard", generatedAt: nowIso() });
    return;
  }
  if (url.pathname === "/api/v1/challenge" && req.method === "POST") {
    const nonce = crypto.randomBytes(24).toString("base64url");
    challenges.set(nonce, { ip: clientIp(req), createdAt: Date.now() });
    sendJson(res, 200, { nonce, expiresInSec: Math.round(CHALLENGE_TTL_MS / 1000) });
    return;
  }
  if (url.pathname === "/api/v1/leaderboard" && req.method === "GET") {
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
    const db = await loadDb();
    const profiles = (db.profiles || []).sort((a, b) => Number(b.score || 0) - Number(a.score || 0)).slice(0, limit);
    sendJson(res, 200, { generatedAt: nowIso(), profiles });
    return;
  }
  if (url.pathname.startsWith("/api/v1/setups/") && req.method === "GET") {
    const id = decodeURIComponent(url.pathname.split("/").pop());
    const db = await loadDb();
    const profile = (db.profiles || []).find((item) => item.id === id);
    sendJson(res, profile ? 200 : 404, profile || { error: "not found" });
    return;
  }
  if (url.pathname === "/api/v1/submissions" && req.method === "POST") {
    const body = await readBody(req);
    if (!consumeChallenge(String(body.nonce || ""), req)) {
      sendJson(res, 403, { error: "invalid or expired challenge" });
      return;
    }
    const profile = normalizeProfile(body.profile || {});
    const db = await loadDb();
    db.submissions = [...(db.submissions || []), { profile, ipHash: crypto.createHash("sha256").update(clientIp(req)).digest("hex"), receivedAt: nowIso() }].slice(-10000);
    db.profiles = [profile, ...(db.profiles || []).filter((item) => item.id !== profile.id)].slice(0, 1000);
    await saveDb(db);
    sendJson(res, 201, { profile });
    return;
  }
  sendJson(res, 404, { error: "not found" });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => sendJson(res, 500, { error: error.message }));
});

server.listen(PORT, HOST, () => {
  console.log(`RigScope Scoreboard running on http://${HOST}:${PORT}`);
});
