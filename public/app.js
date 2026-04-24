const state = {
  snapshot: null,
  toolkit: null,
  nativeRunners: null,
  nativeRunnerStatus: null,
  nativeRunnerTimer: null,
  bench: { cpu: null, memory: null, gpu: null, sensors: null },
  stress: {
    active: false,
    startedAt: 0,
    durationMs: 0,
    timer: null,
    sensorTimer: null,
    raf: null,
    workers: [],
    memoryBlocks: [],
    serverCpu: false,
    serverMemory: false,
    memoryHeldMb: 0,
    memoryCycles: 0,
    cpuOps: 0,
    gpuFrames: 0,
    gpuWorkUnits: 0,
    gpuEngine: null,
    gpuPasses: 0,
    lastSensors: null,
    result: null
  },
  selectedSetup: "local",
  savedProfile: null,
  community: { profiles: [], status: "offline", mode: "local", publishing: "local-only" },
  updates: { supported: false, status: "unknown", currentVersion: "-", availableVersion: null },
  settings: { theme: "dark", livePollMs: 1000 },
  polling: { full: false, live: false, fullTimer: null, liveTimer: null }
};

const DEMO_MODE = Boolean(window.RIGSCOPE_DEMO);
const SETTINGS_KEY = DEMO_MODE ? "rigscope.demo.settings" : "rigscope.settings";
const BENCH_KEY = DEMO_MODE ? "rigscope.demo.bench" : "rigscope.bench";
const POLL_INTERVALS = [500, 750, 1000, 1500, 2000, 5000];

const demoSetups = [
  {
    id: "creator-4090",
    source: "sample",
    name: "Creator Beast",
    owner: "renderlab",
    score: 9280,
    cpu: "Ryzen 9 7950X",
    gpu: "GeForce RTX 4090",
    memory: "64 GB DDR5",
    storage: "2 TB NVMe",
    bench: { cpu: 912000, memory: "72.5 GB/s", gpu: "216 fps" }
  },
  {
    id: "compact-4070",
    source: "sample",
    name: "Small Form Factor",
    owner: "miniworks",
    score: 7420,
    cpu: "Core i7-13700",
    gpu: "GeForce RTX 4070",
    memory: "32 GB DDR5",
    storage: "1 TB NVMe",
    bench: { cpu: 705000, memory: "58.0 GB/s", gpu: "151 fps" }
  },
  {
    id: "budget-6600",
    source: "sample",
    name: "Budget Punch",
    owner: "valuehunter",
    score: 4380,
    cpu: "Ryzen 5 5600",
    gpu: "Radeon RX 6600",
    memory: "16 GB DDR4",
    storage: "1 TB SSD",
    bench: { cpu: 388000, memory: "31.2 GB/s", gpu: "88 fps" }
  }
];

const $ = (id) => document.getElementById(id);
const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, Number(n) || 0));
const pct = (n) => `${Math.round(clamp(n))}%`;
const mb = (n) => `${Math.round(Number(n) || 0)} MB`;
const gb = (n) => `${Number(n || 0).toFixed(1)} GB`;
const isMissing = (value) => value === null || value === undefined || value === "" || value === "null" || value === "undefined";
const prettyValue = (value, fallback = "-") => {
  if (isMissing(value)) return fallback;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (Array.isArray(value)) {
    const text = value.map((item) => prettyValue(item, "")).filter(Boolean).join(", ");
    return text || fallback;
  }
  if (typeof value === "object") {
    const preferred = value.name ?? value.label ?? value.caption ?? value.value ?? value.status ?? value.id;
    if (!isMissing(preferred)) return prettyValue(preferred, fallback);
    try {
      return JSON.stringify(value).replace(/[{}"]/g, "").slice(0, 180) || fallback;
    } catch {
      return fallback;
    }
  }
  const text = String(value).trim();
  if (!text || text === "[object Object]") return fallback;
  return text;
};
const esc = (value) => prettyValue(value).replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;"
}[ch]));
const safeEsc = (value, fallback = "-") => esc(prettyValue(value, fallback));

const ICONS = {
  activity: '<path d="M22 12h-4l-3 8-6-16-3 8H2"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9 4v4"/><path d="M15 4v4"/><path d="M9 16v4"/><path d="M15 16v4"/><path d="M4 9h4"/><path d="M16 9h4"/><path d="M4 15h4"/><path d="M16 15h4"/>',
  box: '<path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  chip: '<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M9 1v4"/><path d="M15 1v4"/><path d="M9 19v4"/><path d="M15 19v4"/><path d="M1 9h4"/><path d="M1 15h4"/><path d="M19 9h4"/><path d="M19 15h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
  download: '<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/>',
  flame: '<path d="M8.5 14.5A4 4 0 0 0 12 21a5 5 0 0 0 5-5c0-3-2-5-3.5-7.5-.3 2-1.5 3.2-3 4-1-2-1-4 1-7-4 2.2-6 5.2-6 8.5 0 .9.2 1.7.6 2.5"/>',
  gauge: '<path d="M4 14a8 8 0 1 1 16 0"/><path d="M4 14v4h16v-4"/><path d="m12 14 4-4"/>',
  gpu: '<rect x="3" y="7" width="14" height="10" rx="2"/><path d="M7 7V4"/><path d="M13 7V4"/><path d="M7 20v-3"/><path d="M13 20v-3"/><path d="M17 11h4v2h-4"/><circle cx="10" cy="12" r="2"/>',
  hardDrive: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h.01"/><path d="M11 15h6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><path d="M12 7h.01"/>',
  keyboard: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9h.01"/><path d="M11 9h.01"/><path d="M15 9h.01"/><path d="M7 13h10"/><path d="M8 17h8"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
  monitor: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  network: '<rect x="9" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><rect x="15" y="15" width="6" height="6" rx="1"/><path d="M12 9v3"/><path d="M6 15v-3h12v3"/>',
  package: '<path d="m7.5 4.3 9 5.2"/><path d="m21 8-9-5-9 5 9 5 9-5Z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.8-4"/><path d="M5 3v4h4"/><path d="M4 13a8 8 0 0 0 14.8 4"/><path d="M19 21v-4h-4"/>',
  settings: '<path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V22a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 18l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H2a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 6.2 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H8.5a1.7 1.7 0 0 0 1-1.6V2a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.6h.3a1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.6 6l-.1.1a1.7 1.7 0 0 0-.3 1.9v.3a1.7 1.7 0 0 0 1.6 1H22a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.6 1Z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
  spark: '<path d="M13 2 3 14h8l-1 8 11-13h-8l1-7Z"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1-4.4-4.3 6.1-.9L12 3Z"/>',
  upload: '<path d="M12 21V9"/><path d="m7 14 5-5 5 5"/><path d="M5 3h14"/>',
  usb: '<path d="M12 3v10"/><path d="M8 7h8"/><path d="M16 7l2 2-2 2"/><path d="M8 7l-2 2 2 2"/><path d="M12 13a4 4 0 1 0 4 4"/><circle cx="12" cy="17" r="1"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16 3.1a4 4 0 0 1 0 7.8"/>',
  volume: '<path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.5 5.5L3 18v3h3l6.2-6.2a4 4 0 0 0 5.5-5.5l-2.4 2.4-3-3 2.4-2.4Z"/>',
  zap: '<path d="M13 2 4 14h7l-1 8 10-13h-7l1-7Z"/>'
};

const sectionIcons = {
  overview: "gauge",
  suite: "activity",
  cpu: "chip",
  board: "board",
  memory: "database",
  gpu: "gpu",
  storage: "hardDrive",
  network: "network",
  devices: "monitor",
  lab: "zap",
  community: "users",
  windows: "monitor",
  settings: "settings"
};

function iconSvg(name) {
  const body = ICONS[name] || ICONS.info;
  return `<svg class="svg-icon" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
}

function setIconOnly(el, name) {
  if (el) el.innerHTML = iconSvg(name);
}

function prependIcon(el, name) {
  if (!el || el.querySelector(".svg-icon")) return;
  el.insertAdjacentHTML("afterbegin", iconSvg(name));
}

function setCommandButtonLabel(buttonOrId, text, icon = "spark") {
  const button = typeof buttonOrId === "string" ? $(buttonOrId) : buttonOrId;
  if (!button) return;
  button.innerHTML = `${iconSvg(icon)}<span>${esc(text)}</span>`;
}

function panelIconName(panelHead) {
  const label = panelHead?.querySelector(".label")?.textContent?.toLowerCase() || "";
  const title = panelHead?.querySelector("h2")?.textContent?.toLowerCase() || "";
  const text = `${label} ${title}`;
  if (text.includes("cpu") || text.includes("processor") || text.includes("thread")) return "chip";
  if (text.includes("gpu") || text.includes("graphics") || text.includes("display")) return "gpu";
  if (text.includes("memory") || text.includes("dimm")) return "database";
  if (text.includes("network") || text.includes("interface")) return "network";
  if (text.includes("drive") || text.includes("volume") || text.includes("filesystem") || text.includes("storage")) return "hardDrive";
  if (text.includes("board") || text.includes("bios") || text.includes("firmware")) return "board";
  if (text.includes("stress")) return "flame";
  if (text.includes("benchmark") || text.includes("lab")) return "zap";
  if (text.includes("settings") || text.includes("application")) return "settings";
  if (text.includes("community") || text.includes("leaderboard") || text.includes("compare")) return "users";
  if (text.includes("diagnostic") || text.includes("verdict")) return "shield";
  if (text.includes("integration") || text.includes("tool")) return "wrench";
  if (text.includes("signal") || text.includes("reliability")) return "alert";
  if (text.includes("audio") || text.includes("sound")) return "volume";
  if (text.includes("usb") || text.includes("external bus")) return "usb";
  if (text.includes("input")) return "keyboard";
  if (text.includes("report") || text.includes("export")) return "download";
  if (text.includes("score")) return "star";
  if (text.includes("system") || text.includes("platform") || text.includes("summary")) return "monitor";
  return "info";
}

function hydrateUiIcons() {
  setIconOnly($("refreshButton"), "refresh");
  setIconOnly($("updateButton"), "upload");
  setIconOnly(document.querySelector('a[href="/api/export"], a[href="api/export"]'), "download");
  setIconOnly(document.querySelector(".menu-glyph"), "menu");
  document.querySelectorAll(".tab").forEach((tab) => prependIcon(tab, sectionIcons[tab.dataset.view] || "info"));
  document.querySelectorAll(".panel-head .icon").forEach((icon) => setIconOnly(icon, panelIconName(icon.closest(".panel-head"))));
  [
    ["cpuUtil", "chip"],
    ["gpuUtil", "gpu"],
    ["ramValue", "database"],
    ["netValue", "network"]
  ].forEach(([id, icon]) => prependIcon($(id)?.closest(".metric-top")?.querySelector("span"), icon));
  [
    ["cpuBenchButton", "Run CPU Load", "chip"],
    ["memoryBenchButton", "Run RAM Load", "database"],
    ["gpuBenchButton", "Run GPU Render", "gpu"],
    ["sensorBenchButton", "Check Sensors", "activity"],
    ["stressStartButton", "Start Stress", "flame"],
    ["stressStopButton", "Stop", "shield"],
    ["nativeRunnerStartButton", "Start External Tool", "wrench"],
    ["nativeRunnerStopButton", "Stop External Tool", "shield"],
    ["saveSetupButton", "Save / Sync Profile", "upload"],
    ["exportSetupButton", "Export Profile", "download"]
  ].forEach(([id, text, icon]) => setCommandButtonLabel(id, text, icon));
}

document.body.classList.add("is-loading");

async function parseApiError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return prettyValue(payload.error || payload.message || text, "Request failed");
  } catch {
    return prettyValue(text, "Request failed");
  }
}

function setBar(id, value) {
  const el = $(id);
  if (el) el.style.width = pct(value);
}

function resizeCanvasToDisplaySize(canvas, minWidth = 1, minHeight = 1) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(minWidth, Math.round(rect.width * dpr));
  const height = Math.max(minHeight, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function resetCanvasElement(id) {
  const canvas = $(id);
  if (!canvas?.parentNode) return canvas;
  const clone = canvas.cloneNode(false);
  canvas.parentNode.replaceChild(clone, canvas);
  return clone;
}

function resizeCanvasForGpuStress(canvas, intensity = 2) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const displayWidth = Math.max(1, Math.round(rect.width * dpr));
  const targetWidth = intensity >= 3 ? 1920 : intensity >= 2 ? 1440 : 960;
  const viewportCap = Math.max(640, Math.round(window.innerWidth * dpr * 1.08));
  const width = Math.max(displayWidth, Math.min(targetWidth, viewportCap));
  const height = Math.max(Math.round(width * 0.375), Math.round(rect.height * dpr), 240);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  return { width, height, dpr };
}

function kv(containerId, rows) {
  $(containerId).innerHTML = rows.map(([key, value, tone]) => `
    <div class="kv-row">
      <span>${esc(key)}</span>
      <strong class="${tone || ""}">${esc(value)}</strong>
    </div>
  `).join("");
}

function rows(containerId, items, empty = "No data") {
  $(containerId).innerHTML = items.join("") || `<div class="empty-row">${esc(empty)}</div>`;
}

function renderLoadingState() {
  $("updatedAt").textContent = "Scanning hardware...";
  $("updateStatus").textContent = "Checking updates";
  ["cpuUtil", "gpuUtil", "ramValue", "netValue", "healthText"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = "Loading";
  });
  ["cpuDetails", "gpuDetails", "ramDetails", "netDetails"].forEach((id) => {
    const el = $(id);
    if (el) el.textContent = "Collecting telemetry";
  });
  ["cpuUtilBar", "gpuUtilBar", "ramBar"].forEach((id) => setBar(id, 18));
  $("summaryGrid").innerHTML = Array.from({ length: 8 }, () => `
    <div class="summary-card loading-card">
      <span></span>
      <strong></strong>
      <small></small>
    </div>
  `).join("");
  rows("diskList", ["<div class=\"empty-row loading-line\">Reading volumes</div>"]);
  rows("eventList", ["<div class=\"empty-row loading-line\">Reading system signals</div>"]);
  drawStressCanvasIdle();
}

function normalizeSettings(value = {}) {
  const theme = value.theme === "light" ? "light" : "dark";
  const requestedPoll = Number(value.livePollMs || value.pollIntervalMs || 1000);
  const livePollMs = POLL_INTERVALS.includes(requestedPoll) ? requestedPoll : 1000;
  return { theme, livePollMs };
}

function loadSettings() {
  try {
    state.settings = normalizeSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"));
  } catch {
    state.settings = normalizeSettings();
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

function loadBenchResults() {
  try {
    const saved = JSON.parse(localStorage.getItem(BENCH_KEY) || "{}");
    if (saved && typeof saved === "object") {
      state.bench = {
        cpu: saved.bench?.cpu || null,
        memory: saved.bench?.memory || null,
        gpu: saved.bench?.gpu || null,
        sensors: saved.bench?.sensors || null
      };
      state.stress.result = saved.stressResult || null;
    }
  } catch {}
}

function saveBenchResults() {
  localStorage.setItem(BENCH_KEY, JSON.stringify({
    savedAt: new Date().toISOString(),
    bench: state.bench,
    stressResult: state.stress.result
  }));
}

function formatPollInterval(ms) {
  return ms < 1000 ? `${ms} ms` : `${ms / 1000}s`;
}

function formatAge(ms) {
  if (!Number.isFinite(Number(ms))) return "fresh";
  const value = Number(ms);
  return value < 1000 ? `${Math.max(0, Math.round(value))} ms old` : `${(value / 1000).toFixed(1)}s old`;
}

function formatUpdatedAt(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "updated now";
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date);
  if (sameDay) return `updated ${time}`;
  const day = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit"
  }).format(date);
  return `updated ${day}, ${time}`;
}

function parseDateValue(value) {
  const text = prettyValue(value, "").trim();
  if (!text) return null;
  const wmi = text.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (wmi) {
    const [, year, month, day, hour, minute, second] = wmi;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const ymd = text.match(/^(\d{4})[-/](\d{2})[-/](\d{2})$/);
  if (ymd) {
    const [, year, month, day] = ymd;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(value, fallback = "Unknown") {
  const date = parseDateValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(value, fallback = "Unknown") {
  const date = parseDateValue(value);
  if (!date) return fallback;
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function titleCaseStatus(value, fallback = "-") {
  const text = prettyValue(value, fallback);
  return text === fallback ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

function renderSettings() {
  const themeSelect = $("settingsThemeSelect");
  const pollSelect = $("settingsPollInterval");
  if (themeSelect) themeSelect.value = state.settings.theme;
  if (pollSelect) pollSelect.value = String(state.settings.livePollMs);
  const status = $("settingsStatus");
  if (status) status.textContent = `${titleCaseStatus(state.settings.theme)} · live ${formatPollInterval(state.settings.livePollMs)}`;
}

function applySettings({ persist = false, restart = false } = {}) {
  document.body.dataset.theme = state.settings.theme;
  renderSettings();
  if (persist) saveSettings();
  if (restart) startPolling();
}

function updateSettingFromControls() {
  state.settings = normalizeSettings({
    theme: $("settingsThemeSelect")?.value,
    livePollMs: Number($("settingsPollInterval")?.value || 1000)
  });
  applySettings({ persist: true, restart: true });
}

function classFor(value, warn, bad) {
  const n = Number(value) || 0;
  if (n >= bad) return "bad";
  if (n >= warn) return "warn";
  return "ok";
}

function renderRadar(snapshot) {
  const canvas = $("radarCanvas");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(1, rect.width);
  const h = Math.max(1, rect.height);
  const pixelW = Math.round(w * dpr);
  const pixelH = Math.round(h * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) {
    canvas.width = pixelW;
    canvas.height = pixelH;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gpu = snapshot.gpu || {};
  const values = [
    clamp(snapshot.cpu?.loadPct),
    clamp(gpu.util),
    clamp(gpu.temp, 0, 90) / 90 * 100,
    clamp(snapshot.memory?.usedPct),
    clamp(gpu.power / Math.max(gpu.powerLimit || 1, 1) * 100),
    clamp(snapshot.network?.chatgpt?.ms || 0, 0, 120) / 120 * 100
  ];
  const labels = ["CPU", "GPU", "TEMP", "RAM", "PWR", "NET"];
  const cx = w / 2;
  const cy = h / 2 + 6;
  const maxR = Math.min(w, h) * 0.36;
  const lightTheme = document.body.dataset.theme === "light";
  const gridColor = lightTheme ? [23, 33, 39] : [244, 241, 234];
  const grid = (alpha) => `rgba(${gridColor[0]}, ${gridColor[1]}, ${gridColor[2]}, ${alpha})`;

  ctx.clearRect(0, 0, w, h);
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    ctx.strokeStyle = grid(lightTheme ? 0.1 + ring * 0.045 : 0.06 + ring * 0.025);
    for (let i = 0; i < values.length; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 2 / values.length);
      const r = maxR * ring / 4;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  values.forEach((_, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / values.length);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * maxR, cy + Math.sin(a) * maxR);
    ctx.strokeStyle = grid(lightTheme ? 0.18 : 0.08);
    ctx.stroke();
    ctx.fillStyle = grid(lightTheme ? 0.72 : 0.62);
    ctx.font = "12px Segoe UI";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], cx + Math.cos(a) * (maxR + 24), cy + Math.sin(a) * (maxR + 24));
  });

  ctx.beginPath();
  values.forEach((v, i) => {
    const a = -Math.PI / 2 + i * (Math.PI * 2 / values.length);
    const r = maxR * v / 100;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  const grad = ctx.createLinearGradient(cx - maxR, cy - maxR, cx + maxR, cy + maxR);
  grad.addColorStop(0, "rgba(84, 214, 255, 0.62)");
  grad.addColorStop(0.55, "rgba(141, 255, 159, 0.38)");
  grad.addColorStop(1, "rgba(255, 190, 92, 0.42)");
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = "rgba(141, 255, 159, 0.9)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function deviceCard(title, badge, specs) {
  return `
    <div class="module-card">
      <div class="module-title"><strong>${esc(title)}</strong><span>${esc(badge)}</span></div>
      <div class="module-specs">
        ${specs.map(([key, value, tone]) => `
          <span>${esc(key)}</span><strong class="${tone || ""}">${esc(value)}</strong>
        `).join("")}
      </div>
    </div>
  `;
}

function miniCard(title, badge, lines = []) {
  return `
    <div class="mini-card">
      <div class="mini-title"><strong>${esc(title)}</strong><span>${esc(badge)}</span></div>
      <p>${esc(lines.filter(Boolean).join(" · ") || "-")}</p>
    </div>
  `;
}

function verdictCard(title, status, detail) {
  return `
    <div class="diagnostic-row ${esc(status)}">
      <strong>${esc(title)}</strong>
      <span>${esc(detail)}</span>
    </div>
  `;
}

function renderSuite(snapshot) {
  const inv = snapshot.inventory || {};
  const modules = [
    ["Inventory", "AIDA64 class", `${inv.pnpDevices?.length || 0} devices · ${inv.systemDrivers?.length || 0} drivers`, "list"],
    ["CPU", "CPU-Z class", `${inv.cpu?.cores || "-"}C / ${inv.cpu?.threads || "-"}T · ${inv.cpu?.socket || "-"}`, "chip"],
    ["GPU", "GPU-Z class", `${inv.gpu?.name || "-"} · ${snapshot.gpu?.temp ?? "-"}°C`, "gpu"],
    ["Storage", "SMART view", `${inv.physicalDisks?.length || 0} drives · ${inv.volumes?.length || 0} volumes`, "hardDrive"],
    ["Stability", "Lab mode", calculateRigScore().score ? `RigScore ${calculateRigScore().score}` : "ready", "flame"],
    ["Report", "portable JSON", `${state.toolkit?.available || 0}/${state.toolkit?.total || 0} bridges found`, "download"]
  ];
  $("suiteGrid").innerHTML = modules.map(([title, badge, detail, icon]) => `
    <div class="suite-card">
      <div class="suite-title"><strong><span class="suite-icon">${iconSvg(icon)}</span>${esc(title)}</strong><span>${esc(badge)}</span></div>
      <p>${esc(detail)}</p>
    </div>
  `).join("");
}

function diagnosticFindings(snapshot) {
  const inv = snapshot.inventory || {};
  const findings = [];
  const volumes = inv.volumes || snapshot.disks || [];
  const hotVolumes = volumes.filter((v) => Number(v.usedPct) >= 90);
  const warmVolumes = volumes.filter((v) => Number(v.usedPct) >= 80 && Number(v.usedPct) < 90);
  const diskIssues = (inv.physicalDisks || []).filter((d) => !["Healthy", "OK"].includes(d.health || d.status));
  const events = snapshot.events || [];
  const gpuTemp = Number(snapshot.gpu?.temp);
  const memoryParts = new Set((inv.memory?.modules || []).map((m) => m.part).filter(Boolean));

  findings.push(verdictCard("Hardware inventory", "ok", `${inv.pnpDevices?.length || 0} PNP devices, ${inv.systemDrivers?.length || 0} running drivers`));
  findings.push(verdictCard("MPO state", snapshot.graphics?.mpoDisabled ? "ok" : "warn", snapshot.graphics?.mpoDisabled ? "Disabled in registry" : "Windows default"));
  findings.push(verdictCard("Storage health", diskIssues.length ? "bad" : "ok", diskIssues.length ? `${diskIssues.length} drive issue(s)` : `${inv.physicalDisks?.length || 0} drives healthy`));
  findings.push(verdictCard("Volume pressure", hotVolumes.length ? "bad" : warmVolumes.length ? "warn" : "ok", hotVolumes.length ? `${hotVolumes.map((v) => v.drive || v.name).join(", ")} above 90%` : warmVolumes.length ? `${warmVolumes.map((v) => v.drive || v.name).join(", ")} above 80%` : "No critical volume pressure"));
  findings.push(verdictCard("GPU thermals", gpuTemp >= 85 ? "bad" : gpuTemp >= 75 ? "warn" : "ok", Number.isFinite(gpuTemp) ? `${gpuTemp} °C` : "No live GPU temperature"));
  findings.push(verdictCard("Memory kit", memoryParts.size > 1 ? "warn" : "ok", memoryParts.size > 1 ? `${memoryParts.size} different part numbers` : `${inv.memory?.modules?.length || 0} module(s), matched part number`));
  findings.push(verdictCard("System signals", events.length ? "warn" : "ok", events.length ? `${events.length} recent warning/error events` : "No recent warning signals"));
  findings.push(verdictCard("Network probe", snapshot.network?.chatgpt?.ok ? "ok" : "warn", snapshot.network?.chatgpt?.ok ? `chatgpt.com ${snapshot.network.chatgpt.ms} ms` : "chatgpt.com probe failed"));
  return findings;
}

function renderDiagnostics(snapshot) {
  rows("diagnosticList", diagnosticFindings(snapshot), "No diagnostics yet");
}

function renderToolkit() {
  const tools = state.toolkit?.tools || [];
  rows("toolkitList", tools.map((tool) => miniCard(
    tool.name,
    tool.available ? "found" : tool.supported === false ? "unsupported" : "missing",
    [
      tool.category,
      (tool.capabilities || []).slice(0, 2).join(", "),
      tool.version,
      tool.available ? tool.path : tool.supported === false ? "not supported on this OS" : "not installed"
    ]
  )), "No integration data");
}

function formatSeconds(ms) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return mins ? `${mins}m ${String(rest).padStart(2, "0")}s` : `${rest}s`;
}

function setBenchBusy(buttonId, busy) {
  const button = $(buttonId);
  if (!button) return;
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  const label = buttonId === "cpuBenchButton" ? "Run CPU Load" : buttonId === "memoryBenchButton" ? "Run RAM Load" : buttonId === "gpuBenchButton" ? "Run GPU Render" : "Check Sensors";
  const icon = buttonId === "cpuBenchButton" ? "chip" : buttonId === "memoryBenchButton" ? "database" : buttonId === "gpuBenchButton" ? "gpu" : "activity";
  setCommandButtonLabel(button, busy ? "Running..." : label, busy ? "activity" : icon);
}

function renderLab(snapshot) {
  const toolkit = state.toolkit?.tools || [];
  const has = (id) => toolkit.find((tool) => tool.id === id)?.available;
  const { cpu, memory, gpu, sensors } = state.bench;
  $("memoryLabState").textContent = memory ? `${memory.heldMb} MB held · ${memory.cycles} sweeps · ${memory.elapsedMs} ms` : has("y-cruncher") || has("memtest86") ? "Bridge available · RAM load check ready" : "RAM load check ready";
  $("gpuLabState").textContent = gpu ? `${gpu.workUnits.toLocaleString("en-US")} work · ${gpu.fps} fps · ${gpu.elapsedMs} ms` : has("furmark") || has("occt") ? "Bridge available · WebGL load check ready" : "WebGL load check ready";
  $("sensorLabState").textContent = sensors ? sensorLine(sensors) : has("librehardwaremonitor") || has("hwinfo") || has("lm-sensors") || has("powermetrics") ? "Sensor bridge available" : "Quick sensor check ready";
  $("cpuBenchResult").textContent = cpu ? `${cpu.opsPerSec.toLocaleString("en-US")} ops/sec · ${cpu.workers} workers · ${cpu.elapsedMs} ms` : `Current CPU load ${pct(snapshot.cpu?.loadPct)}`;
  setBar("cpuBenchBar", cpu ? clamp(cpu.avgLoadPct || cpu.workers * 4) : snapshot.cpu?.loadPct);
  setBar("memoryBenchBar", memory ? clamp(memory.heldMb / Math.max(memory.targetMb || 1, 1) * 100) : snapshot.memory?.usedPct);
  setBar("sensorBenchBar", sensors ? clamp(100 - Math.max(sensors.cpu?.loadPct || 0, sensors.memory?.usedPct || 0, sensors.gpu?.util || 0)) : 15);
  kv("benchResultList", [
    ["CPU load check", cpu ? `${cpu.opsPerSec.toLocaleString("en-US")} ops/sec · ${cpu.workers} workers` : "-"],
    ["Memory load check", memory ? `${memory.heldMb}/${memory.targetMb} MB · ${memory.cycles} sweeps` : "-"],
    ["GPU load check", gpu ? `${gpu.workUnits.toLocaleString("en-US")} work · ${gpu.fps} fps` : "-"],
    ["Sensor sweep", sensors ? sensorLine(sensors) : "-"],
    ["Stress result", state.stress.result ? `${state.stress.result.score}/100 · ${state.stress.result.duration}` : "-"],
    ["Overall RigScore", calculateRigScore().score || "-"]
  ]);
  renderRigScore();
  rows("reportList", [
    verdictCard("Full JSON export", "ok", "/api/export"),
    verdictCard("Snapshot API", "ok", "/api/snapshot"),
    verdictCard("Toolkit API", state.toolkit ? "ok" : "warn", state.toolkit ? `${state.toolkit.available}/${state.toolkit.total} integrations` : "not loaded"),
    verdictCard("External bridges", state.toolkit?.available ? "ok" : "warn", state.toolkit ? `${state.toolkit.available}/${state.toolkit.total} detected on ${state.toolkit.platform?.platform || "this OS"}` : "not loaded"),
    verdictCard("Stress launchers", (state.nativeRunners?.profiles || []).some((profile) => profile.available) ? "ok" : "warn", state.nativeRunners ? `${(state.nativeRunners.profiles || []).filter((profile) => profile.available).length}/${(state.nativeRunners.profiles || []).length} launch profiles available` : "not loaded"),
    verdictCard("Comparable score", calculateRigScore().score ? "ok" : "warn", calculateRigScore().score ? `${calculateRigScore().score} points` : "run CPU/RAM/GPU tests"),
    verdictCard("Stress test", state.stress.result ? "ok" : "warn", state.stress.result ? `${state.stress.result.duration}, ${state.stress.result.score}/100 stability` : "ready for explicit start")
  ]);
  renderStressPanel();
  renderNativeRunners();
}

function sensorLine(sensors) {
  const gpu = sensors.gpu ? `GPU ${sensors.gpu.temp}°C ${sensors.gpu.util}%` : "GPU n/a";
  return `CPU ${sensors.cpu?.loadPct ?? "-"}% · RAM ${sensors.memory?.usedPct ?? "-"}% · ${gpu}`;
}

function stressOptions() {
  return {
    cpu: $("stressCpuToggle")?.checked,
    memory: $("stressMemoryToggle")?.checked,
    gpu: $("stressGpuToggle")?.checked,
    durationSec: Number($("stressDuration")?.value || 60),
    targetMb: Number($("stressMemoryTarget")?.value || 4096),
    gpuIntensity: Number($("stressGpuIntensity")?.value || 2)
  };
}

function setStressLog(items) {
  $("stressLog").innerHTML = items.map((item) => `<span>${esc(item)}</span>`).join("");
}

function setNativeRunnerLog(items) {
  const el = $("nativeRunnerLog");
  if (el) el.innerHTML = items.map((item) => `<span>${esc(item)}</span>`).join("");
}

function setStressControls(active) {
  ["stressCpuToggle", "stressMemoryToggle", "stressGpuToggle", "stressDuration", "stressMemoryTarget", "stressGpuIntensity"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = active;
  });
  $("stressStartButton").disabled = active;
  $("stressStopButton").disabled = !active;
  ["cpuBenchButton", "memoryBenchButton", "gpuBenchButton", "sensorBenchButton"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = active;
  });
}

function selectedNativeProfile() {
  const id = $("nativeRunnerSelect")?.value;
  return (state.nativeRunners?.profiles || []).find((profile) => profile.id === id);
}

function renderNativeRunners() {
  const profiles = state.nativeRunners?.profiles || [];
  const status = state.nativeRunnerStatus || state.nativeRunners?.status || {};
  const select = $("nativeRunnerSelect");
  if (!select) return;
  const current = select.value;
  select.innerHTML = profiles.map((profile) => `
    <option value="${esc(profile.id)}">
      ${esc(profile.label)} ${profile.available ? "" : "(not found)"}
    </option>
  `).join("");
  if (profiles.some((profile) => profile.id === current)) select.value = current;
  const selected = selectedNativeProfile() || profiles.find((profile) => profile.available) || profiles[0];
  if (selected && select.value !== selected.id) select.value = selected.id;

  $("nativeRunnerState").textContent = status.active ? "Running" : status.exitCode !== null && status.exitCode !== undefined ? "Finished" : "Idle";
  $("nativeRunnerPid").textContent = status.pid ? `PID ${status.pid}` : "No process";
  $("nativeRunnerTool").textContent = selected?.label || "-";
  $("nativeRunnerRisk").textContent = titleCaseStatus(selected?.risk);
  $("nativeRunnerElapsed").textContent = status.elapsedMs ? formatSeconds(status.elapsedMs) : "0s";
  $("nativeRunnerAvailable").textContent = selected ? selected.available ? "Ready" : "Not found" : "-";
  $("nativeRunnerStartButton").disabled = Boolean(status.active) || !selected?.available;
  $("nativeRunnerStartButton").title = !selected
    ? "No external tool profile selected"
    : selected.available
      ? `Start ${selected.label}`
      : `${selected.label} is not detected. Install it or add the executable to PATH.`;
  $("nativeRunnerStopButton").disabled = !status.active;
  if (!status.active && selected) {
    setNativeRunnerLog([
      selected.notes,
      selected.safety?.recommendedMonitor || "Monitor temperatures and stop if the system becomes unstable.",
      `Duration cap: ${formatSeconds((selected.safety?.maxDurationSec || selected.durationMaxSec || 0) * 1000)}`,
      status.report ? `Last report: ${status.report.verdict} · ${formatSeconds(status.report.elapsedMs || 0)}` : null,
      selected.executable || `${selected.toolId} executable not detected. Install the tool or add it to PATH.`,
      "Confirmation required before launch."
    ].filter(Boolean));
  } else if (status.active) {
    setNativeRunnerLog([
      `${status.label} is running`,
      `Elapsed ${formatSeconds(status.elapsedMs || 0)} / ${formatSeconds(status.durationMs || 0)}`,
      selected?.safety?.recommendedMonitor || "Watch thermals and system stability.",
      ...(status.output || []).slice(-4)
    ]);
  }
}

function renderStressPanel() {
  const stress = state.stress;
  const elapsed = stress.active ? performance.now() - stress.startedAt : stress.result?.elapsedMs || 0;
  const progress = stress.active ? clamp(elapsed / Math.max(stress.durationMs, 1) * 100) : 0;
  const modes = stress.active
    ? [stress.serverCpu ? "CPU" : null, stress.serverMemory || stress.memoryBlocks.length ? "RAM" : null, stress.raf ? "GPU" : null].filter(Boolean).join("+")
    : "idle";
  $("stressProgressValue").textContent = stress.active ? pct(progress) : stress.result ? `${stress.result.score}/100` : "0%";
  $("stressModeLabel").textContent = stress.active ? modes || "running" : stress.result ? "last run" : "idle";
  $("stressElapsed").textContent = stress.active ? `${formatSeconds(elapsed)} / ${formatSeconds(stress.durationMs)}` : stress.result?.duration || "0s";
  $("stressCpuOps").textContent = stress.cpuOps ? stress.cpuOps.toLocaleString("en-US") : "-";
  const browserMemoryMb = Math.round(stress.memoryBlocks.reduce((sum, block) => sum + block.byteLength, 0) / 1024 / 1024);
  $("stressMemoryHeld").textContent = `${Math.max(stress.memoryHeldMb || 0, browserMemoryMb)} MB`;
  $("stressGpuFrames").textContent = stress.gpuWorkUnits ? stress.gpuWorkUnits.toLocaleString("en-US") : "-";
  setBar("stressProgressBar", stress.active ? progress : stress.result ? stress.result.score : 0);
  $("stressCpuState").textContent = stress.active && stress.serverCpu ? "Server load" : $("stressCpuToggle").checked ? "Ready" : "Off";
  $("stressMemoryState").textContent = stress.active && stress.serverMemory ? `${stress.memoryCycles || 0} cycles` : stress.active && stress.memoryBlocks.length ? "Holding" : $("stressMemoryToggle").checked ? "Ready" : "Off";
  $("stressGpuState").textContent = stress.active && stress.raf ? `${stress.gpuEngine || "render"} ${stress.gpuPasses || ""}`.trim() : $("stressGpuToggle").checked ? "Ready" : "Off";
}

async function startCpuStress(durationSec) {
  const threads = navigator.hardwareConcurrency || 4;
  const response = await fetch("/api/stress/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cpu: true, memory: false, durationSec, workers: threads })
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const result = await response.json();
  const status = result.started?.cpu || {};
  state.stress.serverCpu = true;
  state.stress.cpuOps = status.ops || 0;
  $("stressCpuState").textContent = `${status.workers} workers`;
}

async function startServerStress(options) {
  const threads = navigator.hardwareConcurrency || 4;
  const response = await fetch("/api/stress/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      cpu: options.cpu,
      memory: options.memory,
      durationSec: options.durationSec,
      targetMb: options.targetMb,
      workers: threads
    })
  });
  if (!response.ok) throw new Error(await parseApiError(response));
  const result = await response.json();
  if (result.started?.cpu) {
    state.stress.serverCpu = true;
    state.stress.cpuOps = result.started.cpu.ops || 0;
    $("stressCpuState").textContent = `${result.started.cpu.workers} workers`;
  }
  if (result.started?.memory) {
    state.stress.serverMemory = true;
    state.stress.memoryHeldMb = result.started.memory.heldMb || 0;
    state.stress.memoryCycles = result.started.memory.cycles || 0;
    $("stressMemoryState").textContent = `${result.started.memory.targetMb} MB target`;
  }
  return result;
}

async function pollCpuStress() {
  if (!state.stress.active || (!state.stress.serverCpu && !state.stress.serverMemory)) return;
  try {
    const response = await fetch("/api/stress/status", { cache: "no-store" });
    if (!response.ok) return;
    const status = await response.json();
    const cpu = status.engines?.cpu || {};
    const memory = status.engines?.memory || {};
    const memoryHeldMb = memory.active
      ? Number(memory.heldMb || 0)
      : Number(memory.peakHeldMb || memory.lastHeldMb || memory.heldMb || 0);
    state.stress.cpuOps = cpu.ops || state.stress.cpuOps;
    state.stress.memoryHeldMb = memoryHeldMb || state.stress.memoryHeldMb;
    state.stress.memoryCycles = memory.cycles || state.stress.memoryCycles;
  $("stressCpuState").textContent = cpu.active ? `${cpu.workers} workers` : state.stress.serverCpu ? "Finished" : "Off";
  $("stressMemoryState").textContent = memory.active ? `${memory.cycles || 0} cycles` : state.stress.serverMemory ? "Finished" : "Off";
  } catch (error) {
    console.error(error);
  }
}

function startMemoryStress() {
  const targetMb = Math.min(512, Math.max(128, Math.round((state.snapshot?.memory?.totalMb || 8192) * 0.04)));
  const chunkMb = 32;
  const fill = () => {
    if (!state.stress.active || state.stress.memoryBlocks.length * chunkMb >= targetMb) return;
    const block = new Uint8Array(chunkMb * 1024 * 1024);
    for (let i = 0; i < block.length; i += 4096) block[i] = (i + state.stress.memoryBlocks.length) & 255;
    state.stress.memoryBlocks.push(block);
    setTimeout(fill, 120);
  };
  fill();
}

function startDemoGpuStress(canvas, intensity = 2) {
  const ctx = canvas.getContext("2d");
  state.stress.gpuEngine = "demo-render";
  state.stress.gpuPasses = intensity >= 3 ? 24 : intensity >= 2 ? 16 : 8;
  const draw = () => {
    if (!state.stress.active) return;
    resizeCanvasToDisplaySize(canvas, 960, 360);
    const t = performance.now() * 0.001;
    const w = canvas.width;
    const h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#071418");
    gradient.addColorStop(0.48, `hsl(${(t * 58 + 190) % 360}, 74%, 24%)`);
    gradient.addColorStop(1, "#221419");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(84, 214, 255, 0.16)";
    ctx.lineWidth = Math.max(1, w / 900);
    for (let x = 0; x <= w; x += w / 18) {
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(t + x * 0.01) * 12, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(141, 255, 159, 0.62)";
    ctx.beginPath();
    for (let x = 0; x <= w; x += 8) {
      const p = x / w;
      const y = h * 0.5 + Math.sin(p * Math.PI * 8 + t * 2) * h * 0.12;
      if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "rgba(255, 190, 92, 0.16)";
    ctx.beginPath();
    ctx.arc(w * (0.5 + Math.sin(t) * 0.22), h * (0.5 + Math.cos(t * 0.8) * 0.18), h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    state.stress.gpuFrames++;
    state.stress.gpuWorkUnits += state.stress.gpuPasses;
    state.stress.raf = requestAnimationFrame(draw);
  };
  state.stress.raf = requestAnimationFrame(draw);
}

function startGpuStress(intensity = 2) {
  const canvas = resetCanvasElement("gpuStressCanvas");
  if (DEMO_MODE) {
    startDemoGpuStress(canvas, intensity);
    return;
  }
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" }) ||
    canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
  if (!gl) {
    startGpuStress2d(canvas);
    return;
  }
  const passes = intensity >= 3 ? 160 : intensity >= 2 ? 96 : 42;
  state.stress.gpuEngine = "webgl";
  state.stress.gpuPasses = passes;
  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;

    void main() {
      vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
      float v = 0.0;
      for (int i = 0; i < 96; i++) {
        float fi = float(i);
        p = abs(p) / max(dot(p, p), 0.18) - vec2(0.74 + 0.04 * sin(time + fi), 0.58);
        v += exp(-abs(length(p) - 0.66)) * 0.006;
      }
      vec3 color = vec3(v * 2.0 + 0.03, v * 1.1 + 0.12, v * 2.8 + 0.2);
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
    }
  `;
  const makeShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  try {
    gl.attachShader(program, makeShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, fragmentSource));
  } catch (error) {
    console.error(error);
    startGpuStress2d(canvas);
    return;
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    startGpuStress2d(canvas);
    return;
  }
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, "position");
  const resolution = gl.getUniformLocation(program, "resolution");
  const time = gl.getUniformLocation(program, "time");
  const draw = () => {
    if (!state.stress.active) return;
    resizeCanvasForGpuStress(canvas, intensity);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0.02, 0.03, 0.04, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, performance.now() * 0.001);
    for (let pass = 0; pass < passes; pass++) gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.flush();
    state.stress.gpuFrames++;
    state.stress.gpuWorkUnits += passes;
    state.stress.raf = requestAnimationFrame(draw);
  };
  state.stress.raf = requestAnimationFrame(draw);
}

function startGpuStress2d(canvas) {
  const ctx = canvas.getContext("2d");
  state.stress.gpuEngine = "canvas-2d";
  state.stress.gpuPasses = 1;
  const draw = () => {
    if (!state.stress.active) return;
    resizeCanvasToDisplaySize(canvas, 960, 360);
    const t = performance.now() * 0.004;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, "#061317");
    gradient.addColorStop(0.48, `hsl(${(t * 50 + 178) % 360}, 74%, 27%)`);
    gradient.addColorStop(1, "#241015");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "lighter";
    for (let i = 0; i < 2200; i++) {
      const x = (Math.sin(i * 0.87 + t) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 1.21 + t * 1.4) * 0.5 + 0.5) * canvas.height;
      ctx.fillStyle = i % 3 === 0 ? "rgba(255, 118, 78, 0.035)" : "rgba(84, 214, 255, 0.035)";
      ctx.fillRect(x, y, 22, 22);
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(244, 241, 234, 0.08)";
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += canvas.width / 18) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += canvas.height / 8) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    state.stress.gpuFrames++;
    state.stress.gpuWorkUnits++;
    state.stress.raf = requestAnimationFrame(draw);
  };
  state.stress.raf = requestAnimationFrame(draw);
}

function drawStressCanvasIdle() {
  const canvas = resetCanvasElement("gpuStressCanvas");
  if (!canvas || state.stress.active) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  resizeCanvasToDisplaySize(canvas, 960, 360);
  const w = canvas.width;
  const h = canvas.height;
  const gradient = ctx.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#071418");
  gradient.addColorStop(0.55, "#11151a");
  gradient.addColorStop(1, "#221419");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(84, 214, 255, 0.11)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= w; x += w / 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y <= h; y += h / 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(141, 255, 159, 0.72)";
  ctx.lineWidth = Math.max(2, w / 720);
  ctx.beginPath();
  for (let x = 0; x <= w; x += 6) {
    const p = x / w;
    const y = h * 0.5 + Math.sin(p * Math.PI * 8) * h * 0.08 + Math.sin(p * Math.PI * 31) * h * 0.025;
    if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  const pulse = ctx.createRadialGradient(w * 0.72, h * 0.42, 0, w * 0.72, h * 0.42, h * 0.48);
  pulse.addColorStop(0, "rgba(255, 190, 92, 0.24)");
  pulse.addColorStop(1, "rgba(255, 190, 92, 0)");
  ctx.fillStyle = pulse;
  ctx.fillRect(0, 0, w, h);
}

async function pollStressSensors() {
  if (!state.stress.active) return;
  try {
    const response = await fetch("/api/sensors/quick", { method: "POST", cache: "no-store" });
    if (response.ok) {
      state.stress.lastSensors = await response.json();
      if (!state.stress.active) return;
      state.bench.sensors = state.stress.lastSensors;
      setStressLog([
        "running",
        sensorLine(state.stress.lastSensors),
        `CPU ops ${state.stress.cpuOps.toLocaleString("en-US")}`,
        `GPU work ${state.stress.gpuWorkUnits.toLocaleString("en-US")}`
      ]);
    }
  } catch (error) {
    console.error(error);
  }
}

async function startStressTest() {
  if (state.stress.active) return;
  const options = stressOptions();
  if (!options.cpu && !options.memory && !options.gpu) {
    setStressLog(["Select at least one stress target"]);
    return;
  }
  Object.assign(state.stress, {
    active: true,
    startedAt: performance.now(),
    durationMs: options.durationSec * 1000,
    cpuOps: 0,
    gpuFrames: 0,
    gpuWorkUnits: 0,
    gpuEngine: null,
    gpuPasses: 0,
    lastSensors: null,
    result: null,
    memoryBlocks: [],
    workers: [],
    serverCpu: false,
    serverMemory: false,
    memoryHeldMb: 0,
    memoryCycles: 0
  });
  setStressControls(true);
  setStressLog([`Started ${options.durationSec}s`, options.cpu ? "CPU workers" : "CPU off", options.memory ? `RAM target ${options.targetMb} MB` : "RAM off", options.gpu ? `GPU ${options.gpuIntensity >= 3 ? "extreme" : options.gpuIntensity >= 2 ? "heavy" : "light"}` : "GPU off"]);
  try {
    if (options.cpu || options.memory) await startServerStress(options);
    if (options.gpu) startGpuStress(options.gpuIntensity);
  } catch (error) {
    console.error(error);
    stopStressTest("Start failed");
    setStressLog(["Start failed", error.message]);
    return;
  }
  pollStressSensors();
  state.stress.sensorTimer = setInterval(pollStressSensors, 3000);
  state.stress.timer = setInterval(() => {
    pollCpuStress();
    renderStressPanel();
    if (performance.now() - state.stress.startedAt >= state.stress.durationMs) stopStressTest("completed");
  }, 250);
  renderStressPanel();
}

function stopStressTest(reason = "stopped") {
  if (!state.stress.active) return;
  const elapsedMs = performance.now() - state.stress.startedAt;
  if (state.stress.serverCpu || state.stress.serverMemory) {
    fetch("/api/stress/stop", { method: "POST", cache: "no-store" }).catch(console.error);
  }
  state.stress.active = false;
  clearInterval(state.stress.timer);
  clearInterval(state.stress.sensorTimer);
  if (state.stress.raf) cancelAnimationFrame(state.stress.raf);
  state.stress.workers.forEach((worker) => worker.postMessage("stop"));
  state.stress.workers.forEach((worker) => worker.terminate());
  const sensors = state.stress.lastSensors;
  const gpuTempPenalty = sensors?.gpu?.temp ? Math.max(0, sensors.gpu.temp - 80) * 2 : 0;
  const memoryPenalty = sensors?.memory?.usedPct ? Math.max(0, sensors.memory.usedPct - 92) * 2 : 0;
  const completedRatio = Math.min(1, elapsedMs / Math.max(state.stress.durationMs, 1));
  const score = Math.round(clamp(100 * completedRatio - gpuTempPenalty - memoryPenalty, 0, 100));
  state.stress.result = {
    reason,
    score,
    elapsedMs: Math.round(elapsedMs),
    duration: formatSeconds(elapsedMs),
    cpuOps: state.stress.cpuOps,
    gpuFrames: state.stress.gpuFrames,
    gpuWorkUnits: state.stress.gpuWorkUnits,
    gpuEngine: state.stress.gpuEngine,
    memoryMb: Math.max(state.stress.memoryHeldMb || 0, Math.round(state.stress.memoryBlocks.reduce((sum, block) => sum + block.byteLength, 0) / 1024 / 1024)),
    memoryCycles: state.stress.memoryCycles,
    sensors
  };
  saveBenchResults();
  state.stress.memoryBlocks = [];
  state.stress.workers = [];
  state.stress.serverCpu = false;
  state.stress.serverMemory = false;
  state.stress.memoryHeldMb = 0;
  state.stress.memoryCycles = 0;
  state.stress.raf = null;
  state.stress.gpuEngine = null;
  state.stress.gpuPasses = 0;
  setStressControls(false);
  setStressLog([
    reason,
    `stability ${score}/100`,
    `duration ${state.stress.result.duration}`,
    sensors ? sensorLine(sensors) : "sensor sweep not available"
  ]);
  drawStressCanvasIdle();
  if (state.snapshot) renderLab(state.snapshot);
}

function matchTier(text, tiers, fallback = 35) {
  const normalized = prettyValue(text, "").toLowerCase();
  const tier = tiers.find(([pattern]) => pattern.test(normalized));
  return tier ? tier[1] : fallback;
}

function gpuHardwareScore(name) {
  return matchTier(name, [
    [/rtx\s*4090|4090/, 100],
    [/rtx\s*4080|4080|rx\s*7900\s*xtx/, 91],
    [/rtx\s*3090|3090|rx\s*7900\s*xt/, 85],
    [/rtx\s*3080|3080|rtx\s*4070\s*ti|4070\s*ti|rx\s*7800\s*xt/, 76],
    [/rtx\s*4070|4070|rx\s*6800\s*xt/, 70],
    [/rtx\s*3070|3070|rx\s*7700\s*xt|rx\s*6800/, 62],
    [/rtx\s*3060\s*ti|3060\s*ti|rx\s*6700\s*xt/, 55],
    [/rtx\s*3060|3060|rx\s*7600|rx\s*6650/, 46],
    [/rx\s*6600|gtx\s*1660|1660/, 35],
    [/intel|uhd|iris|vega/, 18]
  ], name ? 40 : 0);
}

function cpuHardwareScore(cpu = {}) {
  const name = prettyValue(cpu.name, "");
  const named = matchTier(name, [
    [/7950x|14900|13900|threadripper/, 96],
    [/7900x|7900|13700|14700|12900|5950x/, 84],
    [/5900x|5800x3d|7800x3d|12700|13600|14600/, 80],
    [/7700|5800x|5700x|12600|13500/, 68],
    [/5600x|5600|12400|13400|11400/, 52],
    [/ryzen\s*5|core\s*i5/, 45],
    [/ryzen\s*7|core\s*i7/, 58],
    [/ryzen\s*9|core\s*i9/, 72]
  ], 0);
  const cores = Number(cpu.cores || 0);
  const threads = Number(cpu.threads || 0);
  const topology = cores ? clamp(cores * 5 + threads * 1.1, 20, 92) : 0;
  if (!named && !topology) return 0;
  return Math.round(named && topology ? named * 0.7 + topology * 0.3 : named || topology);
}

function memoryHardwareScore(memory = {}) {
  const totalGb = Number(memory.totalGb || 0);
  if (totalGb >= 96) return 95;
  if (totalGb >= 64) return 85;
  if (totalGb >= 48) return 76;
  if (totalGb >= 32) return 65;
  if (totalGb >= 16) return 45;
  if (totalGb >= 8) return 25;
  return totalGb ? 12 : 0;
}

function storageHardwareScore(disks = []) {
  const text = disks.map((disk) => `${prettyValue(disk.mediaType, "")} ${prettyValue(disk.busType, "")} ${prettyValue(disk.model, "")}`).join(" ").toLowerCase();
  if (!text) return 35;
  if (text.includes("nvme")) return 75;
  if (text.includes("ssd")) return 55;
  return 35;
}

function scoreLabel(score) {
  if (score >= 9000) return "Elite desktop";
  if (score >= 7500) return "High-end desktop";
  if (score >= 6000) return "Strong gaming PC";
  if (score >= 4000) return "Mainstream PC";
  return score ? "Entry setup" : "Waiting for inventory";
}

function profileOwnerLabel(profile) {
  const source = profile?.source === "sample" ? "sample" : profile?.source === "local" ? "local" : "";
  return [prettyValue(profile?.owner, "unknown"), source].filter(Boolean).join(" · ");
}

function calculateRigScore() {
  const inv = state.snapshot?.inventory || {};
  const parts = {
    cpu: cpuHardwareScore(inv.cpu),
    gpu: gpuHardwareScore(inv.gpu?.name),
    memory: memoryHardwareScore(inv.memory),
    storage: storageHardwareScore(inv.physicalDisks)
  };
  if (!parts.cpu && !parts.gpu && !parts.memory) return { score: 0, parts, confidence: 0, penalty: 0 };

  const base = parts.gpu * 0.45 + parts.cpu * 0.35 + parts.memory * 0.15 + parts.storage * 0.05;
  const sensors = state.bench.sensors || state.stress.result?.sensors;
  const hotGpuPenalty = sensors?.gpu?.temp ? Math.max(0, sensors.gpu.temp - 82) * 35 : 0;
  const hotCpuPenalty = sensors?.cpu?.load > 95 && sensors?.cpu?.temp ? Math.max(0, sensors.cpu.temp - 90) * 25 : 0;
  const memoryShortfall = state.bench.memory
    ? Math.max(0, 1 - (state.bench.memory.heldMb || 0) / Math.max(state.bench.memory.targetMb || 1, 1)) * 450
    : 0;
  const stressPenalty = state.stress.result ? Math.max(0, 85 - state.stress.result.score) * 18 : 0;
  const penalty = Math.round(hotGpuPenalty + hotCpuPenalty + memoryShortfall + stressPenalty);
  const score = Math.round(clamp(base, 0, 100) * 100 - penalty);
  const checks = [state.bench.cpu, state.bench.memory, state.bench.gpu, state.bench.sensors, state.stress.result].filter(Boolean).length;
  return {
    score: Math.max(0, Math.min(10000, score)),
    parts,
    confidence: Math.min(100, 45 + checks * 11),
    penalty
  };
}

function renderRigScore() {
  const result = calculateRigScore();
  $("rigScoreValue").textContent = result.score || "-";
  $("rigScoreLabel").textContent = scoreLabel(result.score);
  const rowsHtml = [
    ["CPU", `${result.parts.cpu || 0}/100${state.bench.cpu ? ` · ${state.bench.cpu.opsPerSec.toLocaleString("en-US")} ops/sec` : ""}`],
    ["RAM", `${result.parts.memory || 0}/100${state.bench.memory ? ` · ${state.bench.memory.heldMb}/${state.bench.memory.targetMb} MB held` : ""}`],
    ["GPU", `${result.parts.gpu || 0}/100${state.bench.gpu ? ` · ${state.bench.gpu.workUnits.toLocaleString("en-US")} work` : ""}`],
    ["Confidence", `${result.confidence || 0}%${result.penalty ? ` · penalty ${result.penalty}` : ""}`]
  ].map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`);
  $("scoreBreakdown").innerHTML = rowsHtml.join("");
}

function localProfile() {
  const snapshot = state.snapshot || {};
  const inv = snapshot.inventory || {};
  const scoreResult = calculateRigScore();
  return {
    id: "local",
    source: "local",
    schemaVersion: 2,
    name: `${prettyValue(inv.gpu?.name, "Local")} Rig`,
    owner: prettyValue(inv.system?.user, "you"),
    score: scoreResult.score,
    scoreLabel: scoreLabel(scoreResult.score),
    scoreConfidence: scoreResult.confidence,
    cpu: prettyValue(inv.cpu?.name),
    gpu: prettyValue(inv.gpu?.name),
    memory: `${prettyValue(inv.memory?.totalGb)} GB`,
    storage: inv.physicalDisks?.length ? `${inv.physicalDisks.length} drives` : "-",
    board: prettyValue(inv.board?.product),
    os: prettyValue(inv.os?.caption),
    bench: {
      cpu: state.bench.cpu ? `${state.bench.cpu.opsPerSec.toLocaleString("en-US")} ops/sec` : "-",
      memory: state.bench.memory ? `${state.bench.memory.heldMb}/${state.bench.memory.targetMb} MB` : "-",
      gpu: state.bench.gpu ? `${state.bench.gpu.workUnits.toLocaleString("en-US")} work` : "-",
      sensors: state.bench.sensors ? sensorLine(state.bench.sensors) : "-"
    },
    generatedAt: new Date().toISOString()
  };
}

function setupProfiles() {
  const saved = state.savedProfile?.schemaVersion === 2 ? [state.savedProfile] : [];
  const remote = (state.community?.profiles || [])
    .filter((profile) => profile.id !== "local-saved")
    .filter((profile) => profile.schemaVersion === 2 || profile.source !== "local");
  const seen = new Set();
  return [localProfile(), ...saved.filter((p) => p.id !== "local-saved"), ...remote, ...demoSetups]
    .filter((profile) => {
      const id = prettyValue(profile.id, profile.name || "setup");
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

function renderCommunity() {
  if (!state.snapshot) return;
  const profiles = setupProfiles().sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  const local = localProfile();
  $("localSetupName").textContent = local.name;
  $("localSetupMeta").textContent = local.score
    ? `RigScore ${local.score} · ${local.scoreLabel} · confidence ${local.scoreConfidence}% · sync ${state.community?.status || "local"}`
    : `${local.cpu} · inventory is still loading`;
  $("setupCards").innerHTML = profiles.map((profile) => `
    <button class="setup-card ${state.selectedSetup === profile.id ? "active" : ""}" data-setup-id="${esc(profile.id)}">
      <span>${esc(profileOwnerLabel(profile))}</span>
      <strong>${esc(profile.name)}</strong>
      <em>${esc(profile.score || "unscored")}</em>
      <small>${esc(profile.cpu)} · ${esc(profile.gpu)}</small>
    </button>
  `).join("");
  document.querySelectorAll(".setup-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.selectedSetup = card.dataset.setupId;
      renderCommunity();
    });
  });
  rows("leaderboardList", profiles.map((profile, index) => `
    <div class="table-row">
      <strong>#${index + 1} ${esc(profile.name)}</strong>
      <span>${esc(profile.score || "-")} · ${esc(profileOwnerLabel(profile))}</span>
    </div>
  `), "No setup profiles");
  const selected = profiles.find((p) => p.id === state.selectedSetup) || profiles[0];
  kv("compareList", [
    ["Selected", selected.name],
    ["Owner", profileOwnerLabel(selected)],
    ["RigScore", selected.score || "-"],
    ["Score type", selected.scoreLabel || (selected.source === "sample" ? "sample reference" : "-")],
    ["CPU", selected.cpu],
    ["GPU", selected.gpu],
    ["Memory", selected.memory],
    ["Storage", selected.storage],
    ["CPU Bench", selected.bench?.cpu],
    ["RAM Bench", selected.bench?.memory],
    ["GPU Bench", selected.bench?.gpu]
  ]);
}

async function saveLocalProfile() {
  const profile = localProfile();
  const offlineProfile = { ...profile, id: "local-saved", name: "Saved Local Snapshot" };
  try {
    const response = await fetch("/api/community/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profile)
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const result = await response.json();
    state.community.status = result.github || result.status || "saved locally";
    if (result.status === "saved offline") {
      state.savedProfile = offlineProfile;
      localStorage.setItem("rigscope.profile", JSON.stringify(state.savedProfile));
    } else {
      state.savedProfile = null;
      localStorage.removeItem("rigscope.profile");
    }
    await loadCommunity();
  } catch (error) {
    state.community.status = "sync failed";
    console.error(error);
  }
  renderCommunity();
}

function exportLocalProfile() {
  const payload = JSON.stringify(localProfile(), null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rigscope-setup-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function renderSummary(snapshot) {
  const inv = snapshot.inventory || {};
  const cards = [
    ["System", inv.system?.manufacturer, inv.system?.model],
    ["Motherboard", inv.board?.manufacturer, inv.board?.product],
    ["BIOS", inv.bios?.vendor, `${inv.bios?.version || "-"} · ${formatDate(inv.bios?.releaseDate, "-")}`],
    ["Processor", inv.cpu?.name, `${inv.cpu?.cores || "-"}C / ${inv.cpu?.threads || "-"}T`],
    ["Memory", `${inv.memory?.totalGb || "-"} GB`, `${inv.memory?.modules?.length || 0} modules`],
    ["Graphics", inv.gpu?.name, `${inv.gpu?.vramMb || "-"} MB VRAM`],
    ["Windows", inv.os?.caption, `build ${inv.os?.build || "-"} · ${inv.os?.architecture || "-"}`],
    ["Boot", formatDateTime(inv.os?.bootTime, "-"), `uptime ${snapshot.machine?.uptimeHours || 0} h`],
    ["Secure Boot", inv.system?.secureBoot === null ? "unknown" : inv.system?.secureBoot ? "enabled" : "disabled", "UEFI firmware state"],
    ["Hypervisor", inv.system?.hypervisorPresent ? "present" : "not reported", "Windows platform"],
    ["Physical Disks", inv.physicalDisks?.length || 0, "detected devices"],
    ["Network", inv.networkAdapters?.length || 0, "active / available adapters"],
    ["USB", (inv.usbControllers?.length || 0) + (inv.usbHubs?.length || 0), "controllers / hubs"],
    ["PNP Devices", inv.pnpDevices?.length || 0, "enumerated devices"],
    ["Audio", inv.soundDevices?.length || 0, "sound endpoints"],
    ["Monitors", inv.monitors?.length || 0, "display devices"],
    ["Drivers", inv.systemDrivers?.length || 0, "running kernel drivers"],
    ["Hotfixes", inv.hotfixes?.length || 0, "recent Windows patches"]
  ];
  $("summaryGrid").innerHTML = cards.map(([label, primary, secondary]) => `
    <div class="summary-card">
      <span>${esc(label)}</span>
      <strong>${esc(primary)}</strong>
      <small>${esc(secondary)}</small>
    </div>
  `).join("");
}

function renderLive(snapshot) {
  const gpu = snapshot.gpu || {};
  const memory = snapshot.memory || {};
  const cpu = snapshot.cpu || {};
  const machine = snapshot.machine || {};
  const chat = snapshot.network?.chatgpt || {};
  const cf = snapshot.network?.cloudflare || {};
  const vramPct = gpu.memTotal ? gpu.memUsed / gpu.memTotal * 100 : 0;
  const powerPct = gpu.powerLimit ? gpu.power / gpu.powerLimit * 100 : 0;
  const netMs = chat.ok ? chat.ms : null;

  $("updatedAt").textContent = formatUpdatedAt(snapshot.generatedAt);
  $("machineName").textContent = machine.gpu || "Windows machine";
  $("osValue").textContent = `${machine.os || "-"} · build ${machine.build || "-"}`;
  $("cpuValue").textContent = machine.cpu || "-";
  $("gpuName").textContent = machine.gpu || gpu.name || "-";
  $("uptimeValue").textContent = `${machine.uptimeHours || 0} h`;

  $("cpuUtil").textContent = pct(cpu.loadPct);
  $("cpuDetails").textContent = `${cpu.cores || "-"} cores · ${cpu.threads || "-"} threads · ${cpu.maxClockMhz || "-"} MHz`;
  setBar("cpuUtilBar", cpu.loadPct);

  $("gpuUtil").textContent = pct(gpu.util);
  $("gpuDetails").textContent = `${gpu.temp ?? "-"}°C · VRAM ${Math.round(vramPct)}% · ${Math.round(gpu.power || 0)}W`;
  setBar("gpuUtilBar", gpu.util);

  $("ramValue").textContent = pct(memory.usedPct);
  $("ramDetails").textContent = `${mb(memory.usedMb)} used · ${memory.sticks?.length || 0} sticks`;
  setBar("ramBar", memory.usedPct);

  $("netValue").textContent = netMs === null ? "down" : `${netMs} ms`;
  $("cfPill").textContent = cf.ok ? `1.1.1.1 ${cf.ms} ms` : "1.1.1.1 down";
  $("chatPill").textContent = chat.ok ? `chatgpt ${chat.ms} ms` : "chatgpt down";
  $("netDetails").textContent = snapshot.cache?.mode === "live"
    ? `live ${formatAge(snapshot.cache.liveAgeMs)} · full ${formatAge(snapshot.cache.fullAgeMs)}`
    : "full telemetry sample";

  const pressure = Math.round((clamp(cpu.loadPct) + clamp(gpu.util) + clamp(memory.usedPct) + clamp(powerPct)) / 4);
  $("healthText").textContent = pressure < 35 ? "Low load" : pressure < 70 ? "Active load" : "High load";
  renderRadar(snapshot);
}

function renderCpu(inv, snapshot) {
  kv("cpuList", [
    ["Name", inv.cpu?.name],
    ["Manufacturer", inv.cpu?.manufacturer],
    ["Socket", inv.cpu?.socket],
    ["Architecture / Family", `${inv.cpu?.architecture ?? "-"} / ${inv.cpu?.family ?? "-"}`],
    ["Cores / Threads", `${inv.cpu?.cores || "-"} / ${inv.cpu?.threads || "-"}`],
    ["Current / Max clock", `${inv.cpu?.currentClockMhz || "-"} / ${inv.cpu?.maxClockMhz || "-"} MHz`],
    ["External clock", `${inv.cpu?.externalClockMhz || "-"} MHz`],
    ["L2 / L3 cache", `${inv.cpu?.l2Kb || "-"} KB / ${inv.cpu?.l3Kb || "-"} KB`],
    ["Virtualization", inv.cpu?.virtualization ? "enabled" : "disabled / unknown", inv.cpu?.virtualization ? "ok" : "warn"],
    ["Processor ID", inv.cpu?.processorId]
  ]);

  rows("cpuProcessList", (snapshot.processes?.topCpu || []).map((p) => `
    <div class="table-row">
      <strong>${esc(p.name)}</strong>
      <span>${esc(p.cpu)} CPU seconds · ${mb(p.memoryMb)}</span>
    </div>
  `));

  rows("cpuThreadGrid", (snapshot.cpu?.logical || []).map((t) => `
    <div class="thread-card">
      <div class="thread-head"><strong>T${esc(t.thread)}</strong><span>${esc(t.frequencyMhz)} MHz</span></div>
      <div class="thread-bar"><i style="width:${pct(t.loadPct)}"></i></div>
      <div class="thread-meta">
        <span>Load ${pct(t.loadPct)}</span>
        <span>Perf ${pct(t.performancePct)}</span>
      </div>
    </div>
  `), "No logical CPU telemetry");
}

function renderBoard(inv) {
  kv("boardList", [
    ["System vendor", inv.system?.manufacturer],
    ["System model", inv.system?.model],
    ["System type", inv.system?.type],
    ["Domain", inv.system?.domain],
    ["User", inv.system?.user],
    ["Motherboard vendor", inv.board?.manufacturer],
    ["Motherboard model", inv.board?.product],
    ["Motherboard version", inv.board?.version],
    ["Board serial", inv.board?.serial]
  ]);
  kv("biosList", [
    ["Vendor", inv.bios?.vendor],
    ["Version", inv.bios?.version],
    ["Release date", formatDate(inv.bios?.releaseDate)],
    ["BIOS serial", inv.bios?.serial],
    ["Secure Boot", inv.system?.secureBoot === null ? "unknown" : inv.system?.secureBoot ? "enabled" : "disabled", inv.system?.secureBoot ? "ok" : "warn"],
    ["Hypervisor", inv.system?.hypervisorPresent ? "present" : "not reported"],
    ["BIOS characteristics", inv.bios?.mode]
  ]);
}

function renderMemory(inv) {
  rows("memoryModules", (inv.memory?.modules || []).map((m) => `
    <div class="module-card">
      <div class="module-title"><strong>${esc(m.slot)}</strong><span>${esc(m.sizeGb)} GB</span></div>
      <div class="module-specs">
        <span>Bank</span><strong>${esc(m.bank)}</strong>
        <span>Manufacturer</span><strong>${esc(m.manufacturer)}</strong>
        <span>Part number</span><strong>${esc(m.part)}</strong>
        <span>Serial</span><strong>${esc(m.serial)}</strong>
        <span>Configured</span><strong>${esc(m.configuredSpeed || m.speed)} MHz</strong>
        <span>Voltage</span><strong>${esc(m.voltage)} mV</strong>
      </div>
    </div>
  `), "No memory module data");
}

function renderGpu(inv, snapshot) {
  rows("gpuList", (inv.gpus || []).map((g) => `
    <div class="module-card">
      <div class="module-title"><strong>${esc(g.name)}</strong><span>${esc(g.vramMb)} MB</span></div>
      <div class="module-specs">
        <span>Processor</span><strong>${esc(g.videoProcessor)}</strong>
        <span>Vendor</span><strong>${esc(g.adapterCompatibility)}</strong>
        <span>Driver</span><strong>${esc(g.driverVersion)}</strong>
        <span>Driver date</span><strong>${esc(formatDate(g.driverDate))}</strong>
        <span>Resolution</span><strong>${esc(g.currentResolution)}</strong>
        <span>Refresh</span><strong>${esc(g.currentRefreshRate)} Hz</strong>
      </div>
    </div>
  `), "No GPU adapter data");

  const gpu = snapshot.gpu || {};
  kv("displayList", [
    ["MPO", snapshot.graphics?.mpoDisabled ? "disabled" : "default", snapshot.graphics?.mpoDisabled ? "ok" : "warn"],
    ["NVIDIA live driver", gpu.driver],
    ["GPU temp", gpu.temp === undefined ? "-" : `${gpu.temp} °C`, classFor(gpu.temp, 75, 85)],
    ["GPU load", pct(gpu.util)],
    ["VRAM", `${Math.round(gpu.memUsed || 0)} / ${Math.round(gpu.memTotal || 0)} MB`],
    ["Power", `${Math.round(gpu.power || 0)} / ${Math.round(gpu.powerLimit || 0)} W`],
    ["Graphics clock", `${gpu.graphicsClock || "-"} MHz`],
    ["Memory clock", `${gpu.memoryClock || "-"} MHz`]
  ]);
}

function renderStorage(inv, snapshot) {
  rows("physicalDiskList", (inv.physicalDisks || []).map((d) => `
    <div class="module-card">
      <div class="module-title"><strong>${esc(d.model)}</strong><span>${esc(d.sizeGb)} GB</span></div>
      <div class="module-specs">
        <span>Health</span><strong class="${d.health === "Healthy" || d.status === "OK" ? "ok" : "warn"}">${esc(d.health || d.status)}</strong>
        <span>Operational</span><strong>${esc(d.operational)}</strong>
        <span>Bus / Interface</span><strong>${esc(d.busType)} / ${esc(d.interface)}</strong>
        <span>Firmware</span><strong>${esc(d.firmware)}</strong>
        <span>Serial</span><strong>${esc(d.serial)}</strong>
        <span>Partitions</span><strong>${esc(d.partitions)}</strong>
      </div>
    </div>
  `), "No physical disk data");

  rows("volumeList", (inv.volumes || snapshot.disks || []).map((v) => `
    <div class="table-row tall">
      <strong>${esc(v.drive || v.name)} ${esc(v.label || "")}</strong>
      <span>${esc(v.fileSystem || "")} · ${gb(v.freeGb)} free / ${gb(v.totalGb)} · ${pct(v.usedPct)} used</span>
    </div>
  `), "No volume data");

  rows("diskList", (snapshot.disks || []).map((disk) => `
    <div class="disk">
      <div class="disk-meta">
        <strong>${esc(disk.name)} ${esc(disk.label || "")}</strong>
        <span>${gb(disk.freeGb)} free / ${gb(disk.totalGb)}</span>
      </div>
      <div class="bar"><i style="width:${pct(disk.usedPct)}"></i></div>
    </div>
  `), "No logical drive data");
}

function renderNetwork(inv) {
  rows("networkList", (inv.networkAdapters || []).map((n) => `
    <div class="module-card">
      <div class="module-title"><strong>${esc(n.name)}</strong><span>${esc(n.status)}</span></div>
      <div class="module-specs">
        <span>Description</span><strong>${esc(n.description)}</strong>
        <span>Link speed</span><strong>${esc(n.linkSpeed)}</strong>
        <span>MAC</span><strong>${esc(n.mac)}</strong>
        <span>IPv4</span><strong>${esc((n.ipv4 || []).join(", "))}</strong>
        <span>Gateway</span><strong>${esc((n.gateway || []).join(", "))}</strong>
        <span>DNS</span><strong>${esc((n.dns || []).join(", "))}</strong>
      </div>
    </div>
  `), "No network adapter data");
}

function renderDevices(inv) {
  rows("monitorList", (inv.monitors || []).map((m) => deviceCard(
    m.name || m.friendlyName || "Monitor",
    m.active === false ? "offline" : "active",
    [
      ["Manufacturer", m.manufacturer],
      ["Serial", m.serial],
      ["Instance", m.instance || m.pnp],
      ["Resolution", m.screenWidth && m.screenHeight ? `${m.screenWidth}x${m.screenHeight}` : "-"],
      ["Status", m.status || (m.active === false ? "Offline" : "Active")]
    ]
  )), "No monitor data");

  rows("soundList", (inv.soundDevices || []).map((d) => deviceCard(
    d.name || "Sound device",
    d.status || "-",
    [
      ["Manufacturer", d.manufacturer],
      ["PNP", d.pnp],
      ["Status", d.status]
    ]
  )), "No audio device data");

  const usbControllers = (inv.usbControllers || []).map((u) => miniCard(
    u.name || "USB controller",
    "controller",
    [u.manufacturer, u.status, u.pnp]
  ));
  const usbHubs = (inv.usbHubs || []).map((u) => miniCard(
    u.name || "USB hub",
    "hub",
    [u.status, u.pnp]
  ));
  rows("usbList", [...usbControllers, ...usbHubs], "No USB controller or hub data");

  const keyboards = (inv.keyboards || []).map((d) => miniCard(
    d.name || "Keyboard",
    "keyboard",
    [d.description, `${d.functionKeys || "-"} function keys`, d.status, d.pnp]
  ));
  const pointers = (inv.pointingDevices || []).map((d) => miniCard(
    d.name || "Pointing device",
    "pointer",
    [d.manufacturer, d.deviceInterface, `${d.buttons || "-"} buttons`, d.status, d.pnp]
  ));
  rows("inputList", [...keyboards, ...pointers], "No input device data");

  rows("pnpList", (inv.pnpDevices || []).map((d) => miniCard(
    d.name || "PNP device",
    d.class || "device",
    [d.manufacturer, d.status, d.service]
  )), "No PNP inventory data");
}

function renderWindows(inv, snapshot) {
  kv("windowsList", [
    ["Edition", inv.os?.caption],
    ["Version / Build", `${inv.os?.version || "-"} / ${inv.os?.build || "-"}`],
    ["Architecture", inv.os?.architecture],
    ["Locale", inv.os?.locale],
    ["Install date", formatDate(inv.os?.installDate)],
    ["Last boot", formatDateTime(inv.os?.bootTime)],
    ["Windows directory", inv.os?.windowsDirectory],
    ["Secure Boot", inv.system?.secureBoot === null ? "unknown" : inv.system?.secureBoot ? "enabled" : "disabled", inv.system?.secureBoot ? "ok" : "warn"],
    ["VBS status", inv.security?.virtualizationBasedSecurityStatus],
    ["VBS running services", (inv.security?.vbsRunning || []).join(", ") || "-"]
  ]);

  rows("processList", (snapshot.processes?.topMemory || []).map((p) => `
    <div class="table-row">
    <strong>${esc(p.name)}</strong>
      <span>${mb(p.memoryMb)} · PID ${esc(p.id)}</span>
    </div>
  `));

  rows("driverList", (inv.systemDrivers || []).map((d) => miniCard(
    d.name || "Driver",
    d.state || "-",
    [d.displayName, d.startMode, d.path]
  )), "No driver data");

  rows("hotfixList", (inv.hotfixes || []).map((h) => `
    <div class="table-row tall">
      <strong>${esc(h.id || h.caption)}</strong>
      <span>${esc(h.description)} · ${esc(formatDate(h.installedOn, "-"))} · ${esc(h.installedBy)}</span>
    </div>
  `), "No hotfix data");
}

function renderEvents(events = []) {
  rows("eventList", events.map((event) => `
    <div class="event-row">
      <div class="event-main">
        <strong>${esc(event.source)}</strong>
        <span>${esc(formatDateTime(event.time, "-"))} · ${esc(event.message)}</span>
      </div>
      <span class="event-id">${esc(event.id)}</span>
    </div>
  `), "No recent warning signals");
}

function update(snapshot) {
  document.body.classList.remove("is-loading", "load-failed");
  state.snapshot = snapshot;
  const inv = snapshot.inventory || {};
  renderLive(snapshot);
  renderSummary(snapshot);
  renderCpu(inv, snapshot);
  renderBoard(inv);
  renderMemory(inv);
  renderGpu(inv, snapshot);
  renderStorage(inv, snapshot);
  renderNetwork(inv);
  renderDevices(inv);
  renderWindows(inv, snapshot);
  renderSuite(snapshot);
  renderDiagnostics(snapshot);
  renderToolkit();
  renderLab(snapshot);
  renderCommunity();
  renderEvents(snapshot.events || []);
}

async function refresh() {
  if (state.polling.full) return;
  state.polling.full = true;
  const firstLoad = !state.snapshot;
  if (firstLoad) {
    document.body.classList.add("is-loading");
    $("updatedAt").textContent = "Scanning hardware...";
  }
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    update(await response.json());
    $("livePulse").style.background = "var(--green)";
  } catch (error) {
    document.body.classList.remove("is-loading");
    document.body.classList.add("load-failed");
    $("updatedAt").textContent = "Telemetry failed";
    $("livePulse").style.background = "var(--red)";
    console.error(error);
  } finally {
    state.polling.full = false;
  }
}

async function refreshLive() {
  if (!state.snapshot || state.polling.live) return;
  state.polling.live = true;
  try {
    const response = await fetch("/api/live", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    update(await response.json());
    $("livePulse").style.background = "var(--green)";
  } catch (error) {
    $("updatedAt").textContent = "Reconnecting telemetry...";
    $("livePulse").style.background = "var(--red)";
  } finally {
    state.polling.live = false;
  }
}

function startPolling() {
  clearInterval(state.polling.liveTimer);
  clearInterval(state.polling.fullTimer);
  state.polling.liveTimer = setInterval(refreshLive, state.settings.livePollMs);
  state.polling.fullTimer = setInterval(refresh, 30000);
}

async function loadToolkit() {
  try {
    const response = await fetch("/api/toolkit", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.toolkit = await response.json();
    if (state.snapshot) {
      renderToolkit();
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
  } catch (error) {
    console.error(error);
  }
}

async function loadNativeRunners() {
  try {
    const response = await fetch("/api/native-runners", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    const payload = await response.json();
    state.nativeRunners = payload;
    state.nativeRunnerStatus = payload.status;
    renderNativeRunners();
    if (state.snapshot) renderLab(state.snapshot);
  } catch (error) {
    console.error(error);
  }
}

async function loadCommunity() {
  try {
    const response = await fetch("/api/community", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.community = await response.json();
    if (state.community?.status === "scoreboard online" && state.savedProfile) {
      state.savedProfile = null;
      localStorage.removeItem("rigscope.profile");
    }
    if (state.snapshot) renderCommunity();
  } catch (error) {
    state.community = { profiles: [], status: "could not load", mode: "local", publishing: "local-only" };
    if (state.snapshot) renderCommunity();
    console.error(error);
  }
}

function renderUpdateStatus() {
  const el = $("updateStatus");
  const button = $("updateButton");
  if (!el || !button) return;
  const update = state.updates || {};
  const version = update.availableVersion ? ` ${update.availableVersion}` : "";
  const progress = update.progress?.percent !== undefined ? ` ${update.progress.percent}%` : "";
  const labels = {
    unavailable: "Desktop app only",
    idle: `v${update.currentVersion || "-"} · check`,
    checking: "checking...",
    current: `current v${update.currentVersion || "-"}`,
    available: `update${version}`,
    downloading: `downloading${progress}`,
    downloaded: `ready${version}`,
    installing: "restarting...",
    error: "update failed",
    unknown: "Update status unknown"
  };
  el.textContent = labels[update.status] || update.status || "Update status unknown";
  el.title = update.error || "Desktop auto-update status";
  button.disabled = !update.supported || ["checking", "downloading", "installing"].includes(update.status);
  button.title = !update.supported
    ? "Updates are available in the packaged desktop app"
    : update.status === "available"
    ? "Download update"
    : update.status === "downloaded"
      ? "Install update and restart"
      : "Check for updates";
}

async function loadUpdateStatus() {
  try {
    const response = await fetch("/api/updates/status", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.updates = await response.json();
  } catch (error) {
    state.updates = { supported: false, status: "error", error: error.message };
  }
  renderUpdateStatus();
}

async function updateAction() {
  const status = state.updates?.status;
  const endpoint = status === "available"
    ? "/api/updates/download"
    : status === "downloaded"
      ? "/api/updates/install"
      : "/api/updates/check";
  try {
    state.updates = { ...state.updates, status: status === "available" ? "downloading" : status === "downloaded" ? "installing" : "checking" };
    renderUpdateStatus();
    const response = await fetch(endpoint, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.updates = await response.json();
  } catch (error) {
    state.updates = { ...state.updates, status: "error", error: error.message };
  }
  renderUpdateStatus();
}

async function pollNativeRunner() {
  try {
    const response = await fetch("/api/native-runners/status", { cache: "no-store" });
    if (!response.ok) return;
    state.nativeRunnerStatus = await response.json();
    renderNativeRunners();
    if (!state.nativeRunnerStatus.active && state.nativeRunnerTimer) {
      clearInterval(state.nativeRunnerTimer);
      state.nativeRunnerTimer = null;
      loadNativeRunners();
    }
  } catch (error) {
    console.error(error);
  }
}

async function startNativeRunner() {
  const profile = selectedNativeProfile();
  if (!profile?.available) {
    setNativeRunnerLog(["Selected external tool is not installed or not detected."]);
    return;
  }
  const acknowledgement = state.nativeRunners?.acknowledgement || "START_NATIVE_STRESS";
  setNativeRunnerLog([`Starting ${profile.label}`, "External stress tools can create high heat and power draw"]);
  try {
    const response = await fetch("/api/native-runners/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId: profile.id,
        durationSec: Number($("nativeRunnerDuration")?.value || profile.durationDefaultSec || 300),
        acknowledgement
      })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.nativeRunnerStatus = await response.json();
    renderNativeRunners();
    if (!state.nativeRunnerTimer) state.nativeRunnerTimer = setInterval(pollNativeRunner, 1500);
  } catch (error) {
    setNativeRunnerLog(["External tool launch failed", error.message]);
    console.error(error);
  }
}

async function stopNativeRunner() {
  try {
    const response = await fetch("/api/native-runners/stop", { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.nativeRunnerStatus = await response.json();
    renderNativeRunners();
  } catch (error) {
    setNativeRunnerLog(["Stop failed", error.message]);
    console.error(error);
  }
}

async function runDemoCpuBench() {
  setBenchBusy("cpuBenchButton", true);
  $("cpuBenchResult").textContent = "Demo CPU load check running";
  const start = performance.now();
  const duration = 1600;
  while (performance.now() - start < duration) {
    const progress = clamp((performance.now() - start) / duration * 100);
    setBar("cpuBenchBar", progress);
    $("cpuBenchResult").textContent = `${navigator.hardwareConcurrency || 12} demo workers · ${Math.round(progress * 9200).toLocaleString("en-US")} ops`;
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  state.bench.cpu = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - start),
    workers: navigator.hardwareConcurrency || 12,
    ops: 724000,
    opsPerSec: 452500,
    avgLoadPct: 74
  };
  saveBenchResults();
  if (state.snapshot) {
    renderSuite(state.snapshot);
    renderLab(state.snapshot);
  }
  setBenchBusy("cpuBenchButton", false);
}

async function runCpuBench() {
  if (DEMO_MODE) {
    await runDemoCpuBench();
    return;
  }
  const durationSec = 8;
  setBenchBusy("cpuBenchButton", true);
  $("cpuBenchResult").textContent = `CPU load check ${durationSec}s`;
  try {
    const workers = navigator.hardwareConcurrency || 4;
    const response = await fetch("/api/stress/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ cpu: true, memory: false, durationSec, workers })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const started = await response.json();
    const startedAt = performance.now();
    let status = started.status;
    while (performance.now() - startedAt < durationSec * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const poll = await fetch("/api/stress/status", { cache: "no-store" });
      if (poll.ok) status = await poll.json();
      const cpu = status?.engines?.cpu || {};
      $("cpuBenchResult").textContent = `${cpu.workers || workers} workers · ${(cpu.ops || 0).toLocaleString("en-US")} ops`;
      setBar("cpuBenchBar", clamp((performance.now() - startedAt) / (durationSec * 1000) * 100));
    }
    const stop = await fetch("/api/stress/stop", { method: "POST", cache: "no-store" });
    if (stop.ok) status = await stop.json();
    const cpu = status?.stopped?.cpu || status?.engines?.cpu || {};
    const elapsedMs = Math.round(performance.now() - startedAt);
    const ops = Number(cpu.ops || 0);
    state.bench.cpu = {
      generatedAt: new Date().toISOString(),
      elapsedMs,
      workers: Number(cpu.workers || workers),
      ops,
      opsPerSec: Math.round(ops / Math.max(elapsedMs / 1000, 0.1)),
      avgLoadPct: state.stress.lastSensors?.cpu?.loadPct || null
    };
    saveBenchResults();
    if (state.snapshot) {
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
  } catch (error) {
    $("cpuBenchResult").textContent = `Failed: ${prettyValue(error.message, "CPU load check error")}`;
    console.error(error);
  } finally {
    setBenchBusy("cpuBenchButton", false);
  }
}

async function runDemoMemoryBench() {
  const targetMb = Number($("stressMemoryTarget")?.value || 4096);
  setBenchBusy("memoryBenchButton", true);
  $("memoryLabState").textContent = `Demo RAM load check ${targetMb} MB`;
  const start = performance.now();
  const duration = 1600;
  while (performance.now() - start < duration) {
    const progress = clamp((performance.now() - start) / duration * 100);
    const held = Math.round(targetMb * Math.min(1, progress / 100));
    setBar("memoryBenchBar", progress);
    $("memoryLabState").textContent = `${held}/${targetMb} MB · ${Math.round(progress * 1.8)} demo sweeps`;
    await new Promise((resolve) => setTimeout(resolve, 160));
  }
  state.bench.memory = {
    generatedAt: new Date().toISOString(),
    elapsedMs: Math.round(performance.now() - start),
    targetMb,
    heldMb: targetMb,
    cycles: 188,
    checksum: 770048,
    score: 100
  };
  saveBenchResults();
  if (state.snapshot) {
    renderSuite(state.snapshot);
    renderLab(state.snapshot);
  }
  setBenchBusy("memoryBenchButton", false);
}

async function runMemoryBench() {
  if (DEMO_MODE) {
    await runDemoMemoryBench();
    return;
  }
  const durationSec = 8;
  const targetMb = Number($("stressMemoryTarget")?.value || 4096);
  setBenchBusy("memoryBenchButton", true);
  $("memoryLabState").textContent = `RAM load check ${targetMb} MB`;
  try {
    const response = await fetch("/api/stress/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ cpu: false, memory: true, durationSec, targetMb })
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const started = await response.json();
    const startedAt = performance.now();
    let status = started.status;
    while (performance.now() - startedAt < durationSec * 1000) {
      await new Promise((resolve) => setTimeout(resolve, 650));
      const poll = await fetch("/api/stress/status", { cache: "no-store" });
      if (poll.ok) status = await poll.json();
      const memory = status?.engines?.memory || {};
      $("memoryLabState").textContent = `${memory.heldMb || 0}/${memory.targetMb || targetMb} MB · ${memory.cycles || 0} sweeps`;
      setBar("memoryBenchBar", clamp((memory.heldMb || 0) / Math.max(memory.targetMb || targetMb, 1) * 100));
    }
    const stop = await fetch("/api/stress/stop", { method: "POST", cache: "no-store" });
    if (stop.ok) status = await stop.json();
    const memory = status?.stopped?.memory || status?.engines?.memory || {};
    const heldMb = Number(memory.peakHeldMb || memory.lastHeldMb || memory.heldMb || 0);
    state.bench.memory = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Math.round(performance.now() - startedAt),
      targetMb: Number(memory.targetMb || targetMb),
      heldMb,
      cycles: Number(memory.cycles || 0),
      checksum: Number(memory.checksum || 0),
      score: Math.round((heldMb / Math.max(Number(memory.targetMb || targetMb), 1)) * 100)
    };
    saveBenchResults();
    if (state.snapshot) {
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
  } catch (error) {
    $("memoryLabState").textContent = `Failed: ${prettyValue(error.message, "RAM load check error")}`;
    console.error(error);
  } finally {
    setBenchBusy("memoryBenchButton", false);
  }
}

async function runSensorSweep() {
  await runServerBench("sensors", "/api/sensors/quick", "sensorBenchButton", "sensorLabState", "Sensor check running");
}

async function runServerBench(type, url, buttonId, statusId, runningText) {
  const button = $(buttonId);
  button.disabled = true;
  button.classList.add("is-busy");
  setCommandButtonLabel(button, "Running...", "activity");
  $(statusId).textContent = runningText;
  try {
    const response = await fetch(url, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.bench[type] = await response.json();
    saveBenchResults();
    if (state.snapshot) {
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
  } catch (error) {
    $(statusId).textContent = `Failed: ${prettyValue(error.message, "Test error")}`;
    console.error(error);
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    setCommandButtonLabel(button, type === "cpu" ? "Run CPU Load" : type === "memory" ? "Run RAM Load" : "Check Sensors", type === "cpu" ? "chip" : type === "memory" ? "database" : "activity");
  }
}

async function runDemoGpuBench() {
  const canvas = resetCanvasElement("gpuBenchCanvas");
  const ctx = canvas.getContext("2d");
  setBenchBusy("gpuBenchButton", true);
  $("gpuLabState").textContent = "Demo GPU render running";
  const start = performance.now();
  const duration = 1800;
  let frames = 0;
  const draw = () => {
    const elapsed = performance.now() - start;
    const progress = clamp(elapsed / duration * 100);
    const w = canvas.width;
    const h = canvas.height;
    const gradient = ctx.createLinearGradient(0, 0, w, h);
    gradient.addColorStop(0, "#14323a");
    gradient.addColorStop(0.5, `hsl(${180 + progress}, 80%, 42%)`);
    gradient.addColorStop(1, "#382338");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (let i = 0; i < 32; i++) ctx.fillRect((i * 31 + elapsed * 0.08) % w, (i * 17) % h, 36, 12);
    frames++;
    $("gpuLabState").textContent = `${Math.round(90 + progress)} fps · ${frames} demo frames`;
    if (elapsed < duration) {
      requestAnimationFrame(draw);
      return;
    }
    state.bench.gpu = {
      generatedAt: new Date().toISOString(),
      elapsedMs: Math.round(elapsed),
      frames,
      fps: 144,
      workUnits: 24576,
      engine: "demo-render"
    };
    saveBenchResults();
    if (state.snapshot) {
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
    setBenchBusy("gpuBenchButton", false);
  };
  requestAnimationFrame(draw);
}

async function runGpuBench() {
  if (DEMO_MODE) {
    await runDemoGpuBench();
    return;
  }
  const button = $("gpuBenchButton");
  const canvas = resetCanvasElement("gpuBenchCanvas");
  setBenchBusy("gpuBenchButton", true);
  $("gpuLabState").textContent = "WebGL load check running";
  const start = performance.now();
  const duration = 6500;
  let frames = 0;
  let workUnits = 0;
  const intensity = Number($("stressGpuIntensity")?.value || 2);
  const passes = intensity >= 3 ? 96 : intensity >= 2 ? 54 : 22;
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" }) ||
    canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });

  if (gl) {
    const vertexSource = "attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }";
    const fragmentSource = `
      precision highp float;
      uniform vec2 resolution;
      uniform float time;
      void main() {
        vec2 p = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
        float v = 0.0;
        for (int i = 0; i < 96; i++) {
          float fi = float(i);
          p = abs(p) / max(dot(p, p), 0.18) - vec2(0.74 + 0.04 * sin(time + fi), 0.58);
          v += exp(-abs(length(p) - 0.66)) * 0.006;
        }
        vec3 color = vec3(v * 2.0 + 0.03, v * 1.1 + 0.12, v * 2.8 + 0.2);
        gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      }
    `;
    const makeShader = (type, source) => {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
      return shader;
    };
    const program = gl.createProgram();
    gl.attachShader(program, makeShader(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, makeShader(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    const resolution = gl.getUniformLocation(program, "resolution");
    const time = gl.getUniformLocation(program, "time");
    while (performance.now() - start < duration) {
      resizeCanvasToDisplaySize(canvas, intensity >= 3 ? 1920 : 1440, intensity >= 3 ? 720 : 540);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(program);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(time, performance.now() * 0.001);
      for (let pass = 0; pass < passes; pass++) gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.flush();
      frames++;
      workUnits += passes;
      $("gpuLabState").textContent = `${workUnits.toLocaleString("en-US")} work · ${frames} frames`;
      await new Promise(requestAnimationFrame);
    }
  } else {
    const ctx = canvas.getContext("2d");
    while (performance.now() - start < duration) {
      resizeCanvasToDisplaySize(canvas, 960, 360);
      const t = performance.now() * 0.004;
      const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      gradient.addColorStop(0, "#061317");
      gradient.addColorStop(0.5, `hsl(${(t * 50 + 178) % 360}, 74%, 27%)`);
      gradient.addColorStop(1, "#241015");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < 3500; i++) {
        const x = (Math.sin(i * 12.989 + t) * 0.5 + 0.5) * canvas.width;
        const y = (Math.cos(i * 78.233 + t * 1.3) * 0.5 + 0.5) * canvas.height;
        ctx.fillStyle = i % 3 === 0 ? "rgba(255, 118, 78, 0.035)" : "rgba(84, 214, 255, 0.035)";
        ctx.fillRect(x, y, 18, 18);
      }
      frames++;
      workUnits++;
      await new Promise(requestAnimationFrame);
    }
  }
  const elapsedMs = Math.round(performance.now() - start);
  const fps = Math.round(frames / (elapsedMs / 1000));
  state.bench.gpu = {
    generatedAt: new Date().toISOString(),
    elapsedMs,
    frames,
    workUnits,
    passes,
    engine: gl ? "webgl" : "canvas-2d",
    fps,
    score: workUnits
  };
  saveBenchResults();
  if (state.snapshot) {
    renderSuite(state.snapshot);
    renderLab(state.snapshot);
  }
  setBenchBusy("gpuBenchButton", false);
}

function setView(name) {
  document.body.dataset.view = name;
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.view === name;
    tab.classList.toggle("active", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
  });
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.viewPanel === name));
  const activeTab = document.querySelector(`.tab[data-view="${name}"]`);
  const label = $("currentSectionLabel");
  if (label && activeTab) label.textContent = activeTab.textContent.trim();
  const sectionButton = $("sectionMenuButton");
  const sectionNav = document.querySelector(".section-nav");
  if (sectionButton && sectionNav) {
    sectionButton.setAttribute("aria-expanded", "false");
    sectionNav.classList.remove("open");
  }
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    setView(tab.dataset.view);
    $("sectionMenuButton")?.focus({ preventScroll: true });
  });
});
$("sectionMenuButton").addEventListener("click", () => {
  const nav = document.querySelector(".section-nav");
  const expanded = !nav.classList.contains("open");
  nav.classList.toggle("open", expanded);
  $("sectionMenuButton").setAttribute("aria-expanded", String(expanded));
});
document.addEventListener("click", (event) => {
  const nav = document.querySelector(".section-nav");
  if (!nav || nav.contains(event.target)) return;
  nav.classList.remove("open");
  $("sectionMenuButton")?.setAttribute("aria-expanded", "false");
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  document.querySelector(".section-nav")?.classList.remove("open");
  $("sectionMenuButton")?.setAttribute("aria-expanded", "false");
});
$("refreshButton").addEventListener("click", refresh);
$("updateButton").addEventListener("click", updateAction);
$("cpuBenchButton").addEventListener("click", runCpuBench);
$("memoryBenchButton").addEventListener("click", runMemoryBench);
$("gpuBenchButton").addEventListener("click", runGpuBench);
$("sensorBenchButton").addEventListener("click", runSensorSweep);
$("saveSetupButton").addEventListener("click", saveLocalProfile);
$("exportSetupButton").addEventListener("click", exportLocalProfile);
$("stressStartButton").addEventListener("click", startStressTest);
$("stressStopButton").addEventListener("click", () => stopStressTest("stopped"));
$("nativeRunnerStartButton").addEventListener("click", startNativeRunner);
$("nativeRunnerStopButton").addEventListener("click", stopNativeRunner);
$("nativeRunnerSelect").addEventListener("change", renderNativeRunners);
$("settingsThemeSelect").addEventListener("change", updateSettingFromControls);
$("settingsPollInterval").addEventListener("change", updateSettingFromControls);
["stressCpuToggle", "stressMemoryToggle", "stressGpuToggle", "stressDuration", "stressMemoryTarget", "stressGpuIntensity"].forEach((id) => {
  $(id).addEventListener("change", renderStressPanel);
});
window.addEventListener("hashchange", () => setView(location.hash.slice(1) || "overview"));

hydrateUiIcons();
loadSettings();
applySettings();
loadBenchResults();
try {
  const savedProfile = JSON.parse(localStorage.getItem("rigscope.profile") || "null");
  state.savedProfile = savedProfile?.schemaVersion === 2 ? savedProfile : null;
} catch {}
renderLoadingState();
refresh();
loadToolkit();
loadNativeRunners();
loadCommunity();
loadUpdateStatus();
setView(location.hash.slice(1) || "overview");
startPolling();
setInterval(loadCommunity, 60000);
setInterval(loadUpdateStatus, 5000);
