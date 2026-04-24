"use strict";

function safeText(value, fallback = "-") {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "string") return value.slice(0, 180);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map((item) => safeText(item, "")).filter(Boolean).join(", ").slice(0, 180) || fallback;
  if (typeof value === "object") {
    return safeText(value.name || value.label || value.caption || value.value || JSON.stringify(value).slice(0, 180), fallback);
  }
  return fallback;
}

function sanitizeProfile(profile = {}) {
  const score = Math.max(0, Math.min(10000, Math.round(Number(profile.score) || 0)));
  const bench = profile.bench && typeof profile.bench === "object" ? profile.bench : {};
  return {
    id: safeText(profile.id || `setup-${Date.now()}`).replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 80),
    name: safeText(profile.name || "Unnamed Rig", "Unnamed Rig"),
    owner: safeText(profile.owner || "anonymous", "anonymous"),
    schemaVersion: Math.max(1, Math.min(2, Math.round(Number(profile.schemaVersion) || 1))),
    score,
    scoreLabel: safeText(profile.scoreLabel),
    scoreConfidence: Math.max(0, Math.min(100, Math.round(Number(profile.scoreConfidence) || 0))),
    cpu: safeText(profile.cpu),
    gpu: safeText(profile.gpu),
    memory: safeText(profile.memory),
    storage: safeText(profile.storage),
    board: safeText(profile.board),
    os: safeText(profile.os),
    bench: {
      cpu: safeText(bench.cpu),
      memory: safeText(bench.memory),
      gpu: safeText(bench.gpu),
      sensors: safeText(bench.sensors)
    },
    source: safeText(profile.source || "local"),
    generatedAt: safeText(profile.generatedAt || new Date().toISOString())
  };
}

function dedupeProfiles(profiles) {
  const seen = new Set();
  return profiles
    .map(sanitizeProfile)
    .filter((profile) => {
      const key = `${profile.source}:${profile.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 200);
}

module.exports = {
  safeText,
  sanitizeProfile,
  dedupeProfiles
};
