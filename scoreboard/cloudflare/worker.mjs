const MAX_BODY = 128 * 1024;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RATE_WINDOW_MS = 60 * 1000;
const RATE_LIMIT = 20;

const encoder = new TextEncoder();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Max-Age": "86400"
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}

function requireDb(env) {
  if (!env.DB) {
    throw new HttpError(500, "D1 binding DB is not configured");
  }
  return env.DB;
}

function safeText(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item, "")).filter(Boolean).join(", ").slice(0, 160) || fallback;
  }
  if (typeof value === "object") {
    return safeText(value.name || value.label || value.value || JSON.stringify(value).slice(0, 160), fallback);
  }
  return String(value).trim().slice(0, 160) || fallback;
}

function numberScore(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(0, Math.min(100000, n));
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(text)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomNonce() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function clientIp(request) {
  const forwarded = request.headers.get("X-Forwarded-For");
  return request.headers.get("CF-Connecting-IP") || (forwarded ? forwarded.split(",")[0].trim() : "") || "unknown";
}

async function ipHash(request) {
  return sha256Hex(clientIp(request));
}

async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_BODY) {
    throw new HttpError(413, "request body too large");
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, "invalid JSON");
  }
}

async function normalizeProfile(input = {}) {
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
  const id = (await sha256Hex(idSeed)).slice(0, 16);

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

async function enforceRateLimit(db, ipHashValue) {
  const now = Date.now();
  const minStartedAt = now - RATE_WINDOW_MS;
  await db.prepare("DELETE FROM rate_limits WHERE started_at < ?").bind(minStartedAt).run();

  const entry = await db.prepare("SELECT started_at, count FROM rate_limits WHERE ip_hash = ?").bind(ipHashValue).first();
  if (!entry || Number(entry.started_at || 0) < minStartedAt) {
    await db.prepare(`
      INSERT INTO rate_limits (ip_hash, started_at, count) VALUES (?, ?, 1)
      ON CONFLICT(ip_hash) DO UPDATE SET
        started_at = excluded.started_at,
        count = excluded.count
    `).bind(ipHashValue, now).run();
    return;
  }

  await db.prepare("UPDATE rate_limits SET count = count + 1 WHERE ip_hash = ?").bind(ipHashValue).run();
  const updated = await db.prepare("SELECT count FROM rate_limits WHERE ip_hash = ?").bind(ipHashValue).first();
  const count = Number((updated && updated.count) || 0);
  if (count > RATE_LIMIT) {
    throw new HttpError(429, "rate limited");
  }
}

async function createChallenge(db, ipHashValue) {
  const now = Date.now();
  await db.prepare("DELETE FROM challenges WHERE created_at < ?").bind(now - CHALLENGE_TTL_MS).run();

  const nonce = randomNonce();
  await db.prepare("INSERT INTO challenges (nonce, ip_hash, created_at) VALUES (?, ?, ?)")
    .bind(nonce, ipHashValue, now)
    .run();

  return { nonce, expiresInSec: Math.round(CHALLENGE_TTL_MS / 1000) };
}

async function consumeChallenge(db, nonce, ipHashValue) {
  const challenge = await db.prepare("SELECT ip_hash, created_at FROM challenges WHERE nonce = ?").bind(nonce).first();
  await db.prepare("DELETE FROM challenges WHERE nonce = ?").bind(nonce).run();

  if (!challenge) return false;
  if (challenge.ip_hash !== ipHashValue) return false;
  return Date.now() - Number(challenge.created_at || 0) <= CHALLENGE_TTL_MS;
}

function parseStoredProfile(row) {
  try {
    return JSON.parse(row.profile_json);
  } catch {
    return null;
  }
}

async function leaderboard(db, url) {
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get("limit")) || 50));
  const rows = await db.prepare("SELECT profile_json FROM profiles ORDER BY score DESC, submitted_at DESC LIMIT ?")
    .bind(limit)
    .all();
  const profiles = (rows.results || []).map(parseStoredProfile).filter(Boolean);
  return json({ generatedAt: nowIso(), profiles });
}

async function setupById(db, requestUrl) {
  const id = decodeURIComponent(requestUrl.pathname.split("/").pop() || "");
  const row = await db.prepare("SELECT profile_json FROM profiles WHERE id = ?").bind(id).first();
  const profile = row ? parseStoredProfile(row) : null;
  return json(profile || { error: "not found" }, profile ? 200 : 404);
}

async function submitProfile(db, request, ipHashValue) {
  const body = await readJson(request);
  const nonce = String(body.nonce || "");
  if (!(await consumeChallenge(db, nonce, ipHashValue))) {
    throw new HttpError(403, "invalid or expired challenge");
  }

  const profile = await normalizeProfile(body.profile || {});
  const profileJson = JSON.stringify(profile);
  const receivedAt = nowIso();
  const submissionId = crypto.randomUUID();

  await db.batch([
    db.prepare("INSERT INTO submissions (id, profile_id, profile_json, ip_hash, received_at) VALUES (?, ?, ?, ?, ?)")
      .bind(submissionId, profile.id, profileJson, ipHashValue, receivedAt),
    db.prepare(`
      INSERT INTO profiles (id, name, owner, score, profile_json, submitted_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        owner = excluded.owner,
        score = excluded.score,
        profile_json = excluded.profile_json,
        submitted_at = excluded.submitted_at,
        updated_at = excluded.updated_at
    `).bind(profile.id, profile.name, profile.owner, profile.score, profileJson, profile.submittedAt, receivedAt)
  ]);

  return json({ profile }, 201);
}

async function handle(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const db = requireDb(env);
  const hash = await ipHash(request);
  await enforceRateLimit(db, hash);

  const url = new URL(request.url);
  if (url.pathname === "/api/v1/health" && request.method === "GET") {
    return json({ ok: true, app: "RigScope Scoreboard", backend: "cloudflare-d1", generatedAt: nowIso() });
  }
  if (url.pathname === "/api/v1/challenge" && request.method === "POST") {
    return json(await createChallenge(db, hash));
  }
  if (url.pathname === "/api/v1/leaderboard" && request.method === "GET") {
    return leaderboard(db, url);
  }
  if (url.pathname.startsWith("/api/v1/setups/") && request.method === "GET") {
    return setupById(db, url);
  }
  if (url.pathname === "/api/v1/submissions" && request.method === "POST") {
    return submitProfile(db, request, hash);
  }
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      return json({ error: error.message || "internal error" }, status);
    }
  }
};
