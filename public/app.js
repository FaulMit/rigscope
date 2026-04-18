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
    lastSensors: null,
    result: null
  },
  selectedSetup: "local",
  savedProfile: null,
  community: { profiles: [], status: "offline", mode: "local", publishing: "local-only" },
  updates: { supported: false, status: "unknown", currentVersion: "-", availableVersion: null }
};

const demoSetups = [
  {
    id: "creator-4090",
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

async function parseApiError(response) {
  const text = await response.text();
  try {
    const payload = JSON.parse(text);
    return prettyValue(payload.error || payload.message || text, "не удалось");
  } catch {
    return prettyValue(text, "не удалось");
  }
}

function setBar(id, value) {
  const el = $(id);
  if (el) el.style.width = pct(value);
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

  ctx.clearRect(0, 0, w, h);
  for (let ring = 1; ring <= 4; ring++) {
    ctx.beginPath();
    ctx.strokeStyle = `rgba(244, 241, 234, ${0.06 + ring * 0.025})`;
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
    ctx.strokeStyle = "rgba(244, 241, 234, 0.08)";
    ctx.stroke();
    ctx.fillStyle = "rgba(244, 241, 234, 0.62)";
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
    ["Inventory", "AIDA64 class", `${inv.pnpDevices?.length || 0} devices · ${inv.systemDrivers?.length || 0} drivers`],
    ["CPU", "CPU-Z class", `${inv.cpu?.cores || "-"}C / ${inv.cpu?.threads || "-"}T · ${inv.cpu?.socket || "-"}`],
    ["GPU", "GPU-Z class", `${inv.gpu?.name || "-"} · ${snapshot.gpu?.temp ?? "-"}°C`],
    ["Storage", "SMART view", `${inv.physicalDisks?.length || 0} drives · ${inv.volumes?.length || 0} volumes`],
    ["Stability", "Lab mode", calculateRigScore().score ? `RigScore ${calculateRigScore().score}` : "ready"],
    ["Report", "portable JSON", `${state.toolkit?.available || 0}/${state.toolkit?.total || 0} bridges found`]
  ];
  $("suiteGrid").innerHTML = modules.map(([title, badge, detail]) => `
    <div class="suite-card">
      <div class="suite-title"><strong>${esc(title)}</strong><span>${esc(badge)}</span></div>
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

function renderLab(snapshot) {
  const toolkit = state.toolkit?.tools || [];
  const has = (id) => toolkit.find((tool) => tool.id === id)?.available;
  const { cpu, memory, gpu, sensors } = state.bench;
  $("memoryLabState").textContent = memory ? `${memory.gbps} GB/s · ${memory.elapsedMs} ms` : has("y-cruncher") || has("memtest86") ? "Bridge available · quick RAM bench ready" : "Quick RAM bench ready";
  $("gpuLabState").textContent = gpu ? `${gpu.fps} fps · ${gpu.frames} frames` : has("furmark") || has("occt") ? "Bridge available · browser render bench ready" : "Browser render bench ready";
  $("sensorLabState").textContent = sensors ? sensorLine(sensors) : has("librehardwaremonitor") || has("hwinfo") || has("lm-sensors") || has("powermetrics") ? "Native sensor bridge available" : "Quick sensor sweep ready";
  $("cpuBenchResult").textContent = cpu ? `${cpu.score} hashes/sec · ${cpu.elapsedMs} ms` : `Current CPU load ${pct(snapshot.cpu?.loadPct)}`;
  setBar("cpuBenchBar", cpu ? clamp(cpu.score / 700000 * 100) : snapshot.cpu?.loadPct);
  setBar("memoryBenchBar", memory ? clamp(memory.gbps / 30 * 100) : snapshot.memory?.usedPct);
  setBar("sensorBenchBar", sensors ? clamp(100 - Math.max(sensors.cpu?.loadPct || 0, sensors.memory?.usedPct || 0, sensors.gpu?.util || 0)) : 15);
  kv("benchResultList", [
    ["CPU score", cpu?.score || "-"],
    ["Memory score", memory ? `${memory.score} · ${memory.gbps} GB/s` : "-"],
    ["GPU score", gpu ? `${gpu.score} · ${gpu.fps} fps` : "-"],
    ["Sensor sweep", sensors ? sensorLine(sensors) : "-"],
    ["Stress result", state.stress.result ? `${state.stress.result.score}/100 · ${state.stress.result.duration}` : "-"],
    ["Overall RigScore", calculateRigScore().score || "-"]
  ]);
  renderRigScore();
  rows("reportList", [
    verdictCard("Full JSON export", "ok", "/api/export"),
    verdictCard("Snapshot API", "ok", "/api/snapshot"),
    verdictCard("Toolkit API", state.toolkit ? "ok" : "warn", state.toolkit ? `${state.toolkit.available}/${state.toolkit.total} integrations` : "not loaded"),
    verdictCard("Native bridges", state.toolkit?.available ? "ok" : "warn", state.toolkit ? `${state.toolkit.available}/${state.toolkit.total} detected on ${state.toolkit.platform?.platform || "this OS"}` : "not loaded"),
    verdictCard("Native runners", (state.nativeRunners?.profiles || []).some((profile) => profile.available) ? "ok" : "warn", state.nativeRunners ? `${(state.nativeRunners.profiles || []).filter((profile) => profile.available).length}/${(state.nativeRunners.profiles || []).length} launch profiles available` : "not loaded"),
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
    durationSec: Number($("stressDuration")?.value || 60)
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
  ["stressCpuToggle", "stressMemoryToggle", "stressGpuToggle", "stressDuration"].forEach((id) => {
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
    <option value="${esc(profile.id)}" ${profile.available ? "" : "disabled"}>
      ${esc(profile.label)} ${profile.available ? "" : "(missing)"}
    </option>
  `).join("");
  if (profiles.some((profile) => profile.id === current)) select.value = current;
  const selected = selectedNativeProfile() || profiles.find((profile) => profile.available) || profiles[0];
  if (selected && select.value !== selected.id) select.value = selected.id;

  $("nativeRunnerState").textContent = status.active ? "running" : status.exitCode !== null && status.exitCode !== undefined ? "finished" : "idle";
  $("nativeRunnerPid").textContent = status.pid ? `PID ${status.pid}` : "no process";
  $("nativeRunnerTool").textContent = selected?.label || "-";
  $("nativeRunnerRisk").textContent = selected?.risk || "-";
  $("nativeRunnerElapsed").textContent = status.elapsedMs ? formatSeconds(status.elapsedMs) : "0s";
  $("nativeRunnerAvailable").textContent = selected ? selected.available ? "yes" : "missing" : "-";
  $("nativeRunnerStartButton").disabled = Boolean(status.active) || !selected?.available;
  $("nativeRunnerStopButton").disabled = !status.active;
  if (!status.active && selected) {
    setNativeRunnerLog([
      selected.notes,
      selected.safety?.recommendedMonitor || "Monitor temperatures and stop if the system becomes unstable.",
      `Duration cap: ${formatSeconds((selected.safety?.maxDurationSec || selected.durationMaxSec || 0) * 1000)}`,
      status.report ? `Last report: ${status.report.verdict} · ${formatSeconds(status.report.elapsedMs || 0)}` : null,
      selected.executable || "Executable not detected",
      `Required confirmation: ${state.nativeRunners?.acknowledgement || "START_NATIVE_STRESS"}`
    ].filter(Boolean));
  } else if (status.active) {
    setNativeRunnerLog([
      `${status.label} is running`,
      `elapsed ${formatSeconds(status.elapsedMs || 0)} / ${formatSeconds(status.durationMs || 0)}`,
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
  $("stressGpuFrames").textContent = stress.gpuFrames ? stress.gpuFrames.toLocaleString("en-US") : "-";
  setBar("stressProgressBar", stress.active ? progress : stress.result ? stress.result.score : 0);
  $("stressCpuState").textContent = stress.active && stress.serverCpu ? "server load" : $("stressCpuToggle").checked ? "armed" : "off";
  $("stressMemoryState").textContent = stress.active && stress.serverMemory ? `${stress.memoryCycles || 0} cycles` : stress.active && stress.memoryBlocks.length ? "holding" : $("stressMemoryToggle").checked ? "armed" : "off";
  $("stressGpuState").textContent = stress.active && stress.raf ? "rendering" : $("stressGpuToggle").checked ? "armed" : "off";
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
    body: JSON.stringify({ ...options, workers: threads })
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
    state.stress.cpuOps = cpu.ops || state.stress.cpuOps;
    state.stress.memoryHeldMb = memory.heldMb || state.stress.memoryHeldMb;
    state.stress.memoryCycles = memory.cycles || state.stress.memoryCycles;
    $("stressCpuState").textContent = cpu.active ? `${cpu.workers} workers` : state.stress.serverCpu ? "finished" : "off";
    $("stressMemoryState").textContent = memory.active ? `${memory.cycles || 0} cycles` : state.stress.serverMemory ? "finished" : "off";
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

function startGpuStress() {
  const canvas = $("gpuStressCanvas");
  const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" }) ||
    canvas.getContext("webgl", { antialias: false, powerPreference: "high-performance" });
  if (!gl) {
    startGpuStress2d(canvas);
    return;
  }
  const vertexSource = `
    attribute vec2 position;
    void main() { gl_Position = vec4(position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform vec2 resolution;
    uniform float time;
    void main() {
      vec2 uv = (gl_FragCoord.xy * 2.0 - resolution.xy) / min(resolution.x, resolution.y);
      vec3 color = vec3(0.0);
      float acc = 0.0;
      for (int j = 0; j < 8; j++) {
        vec2 p = uv * (1.2 + float(j) * 0.11);
        for (int i = 0; i < 72; i++) {
          float fi = float(i);
          p = abs(p) / max(dot(p, p), 0.16) - vec2(0.78 + 0.02 * sin(time), 0.62);
          acc += exp(-abs(length(p) - 0.72)) * 0.0035;
          p += vec2(sin(time * 0.7 + fi), cos(time * 0.6 - fi)) * 0.003;
        }
      }
      color.r = acc * 3.3 + 0.12 * sin(time + uv.x * 9.0);
      color.g = acc * 1.8 + 0.20 * cos(time * 0.8 + uv.y * 7.0);
      color.b = acc * 4.2 + 0.22;
      gl_FragColor = vec4(color, 1.0);
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
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(960, Math.round(rect.width * dpr));
    const h = Math.max(360, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(program);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(resolution, canvas.width, canvas.height);
    gl.uniform1f(time, performance.now() * 0.001);
    for (let pass = 0; pass < 4; pass++) gl.drawArrays(gl.TRIANGLES, 0, 6);
    state.stress.gpuFrames++;
    state.stress.raf = requestAnimationFrame(draw);
  };
  state.stress.raf = requestAnimationFrame(draw);
}

function startGpuStress2d(canvas) {
  const ctx = canvas.getContext("2d");
  const draw = () => {
    if (!state.stress.active) return;
    const t = performance.now() * 0.004;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `hsl(${(t * 70) % 360}, 92%, 55%)`);
    gradient.addColorStop(0.5, `hsl(${(t * 110 + 80) % 360}, 80%, 46%)`);
    gradient.addColorStop(1, `hsl(${(t * 150 + 190) % 360}, 92%, 58%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 5000; i++) {
      const x = (Math.sin(i * 0.87 + t) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 1.21 + t * 1.4) * 0.5 + 0.5) * canvas.height;
      ctx.fillStyle = `rgba(${(i * 19) % 255}, 255, ${(i * 43) % 255}, 0.05)`;
      ctx.fillRect(x, y, 18, 18);
    }
    state.stress.gpuFrames++;
    state.stress.raf = requestAnimationFrame(draw);
  };
  state.stress.raf = requestAnimationFrame(draw);
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
        `GPU frames ${state.stress.gpuFrames}`
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
  setStressLog([`started ${options.durationSec}s`, options.cpu ? "CPU workers" : "CPU off", options.memory ? "RAM worker" : "RAM off", options.gpu ? "GPU render" : "GPU off"]);
  try {
    if (options.cpu || options.memory) await startServerStress(options);
    if (options.gpu) startGpuStress();
  } catch (error) {
    console.error(error);
    stopStressTest("start failed");
    setStressLog(["start failed", error.message]);
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
    memoryMb: Math.max(state.stress.memoryHeldMb || 0, Math.round(state.stress.memoryBlocks.reduce((sum, block) => sum + block.byteLength, 0) / 1024 / 1024)),
    memoryCycles: state.stress.memoryCycles,
    sensors
  };
  state.stress.memoryBlocks = [];
  state.stress.workers = [];
  state.stress.serverCpu = false;
  state.stress.serverMemory = false;
  state.stress.memoryHeldMb = 0;
  state.stress.memoryCycles = 0;
  state.stress.raf = null;
  setStressControls(false);
  setStressLog([
    reason,
    `stability ${score}/100`,
    `duration ${state.stress.result.duration}`,
    sensors ? sensorLine(sensors) : "sensor sweep not available"
  ]);
  if (state.snapshot) renderLab(state.snapshot);
}

function calculateRigScore() {
  const { cpu, memory, gpu, sensors } = state.bench;
  const parts = [
    cpu ? clamp(cpu.score / 700000 * 100) : null,
    memory ? clamp(memory.gbps / 30 * 100) : null,
    gpu ? clamp(gpu.fps / 180 * 100) : null,
    sensors ? clamp(100 - Math.max(sensors.gpu?.temp ? (sensors.gpu.temp - 35) * 1.4 : 0, sensors.memory?.usedPct || 0) * 0.35) : null,
    state.stress.result ? state.stress.result.score : null
  ].filter((n) => n !== null);
  if (!parts.length) return { score: 0, parts };
  const avg = parts.reduce((sum, n) => sum + n, 0) / parts.length;
  return { score: Math.round(avg * 100), parts };
}

function renderRigScore() {
  const result = calculateRigScore();
  $("rigScoreValue").textContent = result.score || "-";
  $("rigScoreLabel").textContent = result.score >= 8500 ? "Elite desktop" : result.score >= 6500 ? "Strong gaming PC" : result.score >= 4000 ? "Mainstream PC" : result.score ? "Baseline score" : "Run tests to score this PC";
  const rowsHtml = [
    ["CPU", state.bench.cpu ? `${state.bench.cpu.score} hash/s` : "-"],
    ["RAM", state.bench.memory ? `${state.bench.memory.gbps} GB/s` : "-"],
    ["GPU", state.bench.gpu ? `${state.bench.gpu.fps} fps` : "-"],
    ["Sensors", state.bench.sensors ? sensorLine(state.bench.sensors) : "-"]
  ].map(([k, v]) => `<div><span>${esc(k)}</span><strong>${esc(v)}</strong></div>`);
  $("scoreBreakdown").innerHTML = rowsHtml.join("");
}

function localProfile() {
  const snapshot = state.snapshot || {};
  const inv = snapshot.inventory || {};
  const score = calculateRigScore().score || state.savedProfile?.score || 0;
  return {
    id: "local",
    name: `${prettyValue(inv.gpu?.name, "Local")} Rig`,
    owner: prettyValue(inv.system?.user, "you"),
    score,
    cpu: prettyValue(inv.cpu?.name),
    gpu: prettyValue(inv.gpu?.name),
    memory: `${prettyValue(inv.memory?.totalGb)} GB`,
    storage: `${inv.physicalDisks?.length || 0} drives`,
    board: prettyValue(inv.board?.product),
    os: prettyValue(inv.os?.caption),
    bench: {
      cpu: prettyValue(state.bench.cpu?.score),
      memory: state.bench.memory ? `${state.bench.memory.gbps} GB/s` : "-",
      gpu: state.bench.gpu ? `${state.bench.gpu.fps} fps` : "-",
      sensors: state.bench.sensors ? sensorLine(state.bench.sensors) : "-"
    },
    generatedAt: new Date().toISOString()
  };
}

function setupProfiles() {
  const saved = state.savedProfile ? [state.savedProfile] : [];
  const remote = state.community?.profiles || [];
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
    ? `RigScore ${local.score} · ${local.cpu} · sync ${state.community?.status || "local"}`
    : `${local.cpu} · run Lab tests for a public score`;
  $("setupCards").innerHTML = profiles.map((profile) => `
    <button class="setup-card ${state.selectedSetup === profile.id ? "active" : ""}" data-setup-id="${esc(profile.id)}">
      <span>${esc(profile.owner)}</span>
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
      <span>${esc(profile.score || "-")} · ${esc(profile.owner)}</span>
    </div>
  `), "No setup profiles");
  const selected = profiles.find((p) => p.id === state.selectedSetup) || profiles[0];
  kv("compareList", [
    ["Selected", selected.name],
    ["Owner", selected.owner],
    ["RigScore", selected.score || "-"],
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
  state.savedProfile = { ...localProfile(), id: "local-saved", name: "Saved Local Snapshot" };
  localStorage.setItem("rigscope.profile", JSON.stringify(state.savedProfile));
  try {
    const response = await fetch("/api/community/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.savedProfile)
    });
    if (!response.ok) throw new Error(await parseApiError(response));
    const result = await response.json();
    state.community.status = result.github || result.status || "saved locally";
    await loadCommunity();
  } catch (error) {
    state.community.status = "не удалось синхронизировать";
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
    ["BIOS", inv.bios?.vendor, `${inv.bios?.version || "-"} · ${inv.bios?.releaseDate || "-"}`],
    ["Processor", inv.cpu?.name, `${inv.cpu?.cores || "-"}C / ${inv.cpu?.threads || "-"}T`],
    ["Memory", `${inv.memory?.totalGb || "-"} GB`, `${inv.memory?.modules?.length || 0} modules`],
    ["Graphics", inv.gpu?.name, `${inv.gpu?.vramMb || "-"} MB VRAM`],
    ["Windows", inv.os?.caption, `build ${inv.os?.build || "-"} · ${inv.os?.architecture || "-"}`],
    ["Boot", inv.os?.bootTime, `uptime ${snapshot.machine?.uptimeHours || 0} h`],
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

  $("updatedAt").textContent = `updated ${snapshot.generatedAt || "now"}`;
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

  const pressure = Math.round((clamp(cpu.loadPct) + clamp(gpu.util) + clamp(memory.usedPct) + clamp(powerPct)) / 4);
  $("healthText").textContent = pressure < 35 ? "quiet orbit" : pressure < 70 ? "active" : "high burn";
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
    ["Release date", inv.bios?.releaseDate],
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
        <span>Driver date</span><strong>${esc(g.driverDate)}</strong>
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
    ["Install date", inv.os?.installDate],
    ["Last boot", inv.os?.bootTime],
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
      <span>${esc(h.description)} · ${esc(h.installedOn)} · ${esc(h.installedBy)}</span>
    </div>
  `), "No hotfix data");
}

function renderEvents(events = []) {
  rows("eventList", events.map((event) => `
    <div class="event-row">
      <div class="event-main">
        <strong>${esc(event.source)}</strong>
        <span>${esc(event.time)} · ${esc(event.message)}</span>
      </div>
      <span class="event-id">${esc(event.id)}</span>
    </div>
  `), "No recent warning signals");
}

function update(snapshot) {
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
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    update(await response.json());
    $("livePulse").style.background = "var(--green)";
  } catch (error) {
    $("updatedAt").textContent = "не удалось загрузить телеметрию";
    $("livePulse").style.background = "var(--red)";
    console.error(error);
  }
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
    if (state.snapshot) renderCommunity();
  } catch (error) {
    state.community = { profiles: [], status: "не удалось загрузить", mode: "local", publishing: "local-only" };
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
    unavailable: "desktop only",
    idle: `v${update.currentVersion || "-"}`,
    checking: "checking...",
    current: `current v${update.currentVersion || "-"}`,
    available: `update${version}`,
    downloading: `downloading${progress}`,
    downloaded: `ready${version}`,
    installing: "restarting...",
    error: "update failed",
    unknown: "updates"
  };
  el.textContent = labels[update.status] || update.status || "updates";
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
    setNativeRunnerLog(["Selected native tool is not installed or not detected."]);
    return;
  }
  const acknowledgement = state.nativeRunners?.acknowledgement || "START_NATIVE_STRESS";
  setNativeRunnerLog([`starting ${profile.label}`, "external stress tools can create high heat and power draw"]);
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
    setNativeRunnerLog(["native runner failed", error.message]);
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
    setNativeRunnerLog(["stop failed", error.message]);
    console.error(error);
  }
}

async function runCpuBench() {
  await runServerBench("cpu", "/api/bench/cpu", "cpuBenchButton", "cpuBenchResult", "CPU benchmark running");
}

async function runMemoryBench() {
  await runServerBench("memory", "/api/bench/memory", "memoryBenchButton", "memoryLabState", "RAM benchmark running");
}

async function runSensorSweep() {
  await runServerBench("sensors", "/api/sensors/quick", "sensorBenchButton", "sensorLabState", "Sensor sweep running");
}

async function runServerBench(type, url, buttonId, statusId, runningText) {
  const button = $(buttonId);
  button.disabled = true;
  button.textContent = "Running...";
  $(statusId).textContent = runningText;
  try {
    const response = await fetch(url, { method: "POST", cache: "no-store" });
    if (!response.ok) throw new Error(await parseApiError(response));
    state.bench[type] = await response.json();
    if (state.snapshot) {
      renderSuite(state.snapshot);
      renderLab(state.snapshot);
    }
  } catch (error) {
    $(statusId).textContent = `Не удалось: ${prettyValue(error.message, "ошибка теста")}`;
    console.error(error);
  } finally {
    button.disabled = false;
    button.textContent = type === "cpu" ? "Run CPU Bench" : type === "memory" ? "Run RAM Bench" : "Run Sensors";
  }
}

async function runGpuBench() {
  const button = $("gpuBenchButton");
  const canvas = $("gpuBenchCanvas");
  const ctx = canvas.getContext("2d");
  button.disabled = true;
  button.textContent = "Running...";
  $("gpuLabState").textContent = "GPU render running";
  const start = performance.now();
  const duration = 2500;
  let frames = 0;
  while (performance.now() - start < duration) {
    const t = performance.now() * 0.002;
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, `hsl(${(t * 90) % 360}, 90%, 56%)`);
    gradient.addColorStop(1, `hsl(${(t * 140 + 160) % 360}, 85%, 48%)`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 900; i++) {
      const x = (Math.sin(i * 12.989 + t) * 0.5 + 0.5) * canvas.width;
      const y = (Math.cos(i * 78.233 + t * 1.3) * 0.5 + 0.5) * canvas.height;
      ctx.fillStyle = `rgba(${(i * 17) % 255}, ${(i * 31) % 255}, 255, 0.08)`;
      ctx.fillRect(x, y, 18, 18);
    }
    frames++;
    await new Promise(requestAnimationFrame);
  }
  const elapsedMs = Math.round(performance.now() - start);
  const fps = Math.round(frames / (elapsedMs / 1000));
  state.bench.gpu = {
    generatedAt: new Date().toISOString(),
    elapsedMs,
    frames,
    fps,
    score: fps * 100
  };
  if (state.snapshot) {
    renderSuite(state.snapshot);
    renderLab(state.snapshot);
  }
  button.disabled = false;
  button.textContent = "Run GPU Bench";
}

function setView(name) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === name));
  document.querySelectorAll(".view").forEach((view) => view.classList.toggle("active", view.dataset.viewPanel === name));
  if (location.hash.slice(1) !== name) history.replaceState(null, "", `#${name}`);
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
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
["stressCpuToggle", "stressMemoryToggle", "stressGpuToggle", "stressDuration"].forEach((id) => {
  $(id).addEventListener("change", renderStressPanel);
});
window.addEventListener("hashchange", () => setView(location.hash.slice(1) || "overview"));

try {
  state.savedProfile = JSON.parse(localStorage.getItem("rigscope.profile") || "null");
} catch {}
refresh();
loadToolkit();
loadNativeRunners();
loadCommunity();
loadUpdateStatus();
setView(location.hash.slice(1) || "overview");
setInterval(refresh, 7000);
setInterval(loadCommunity, 60000);
setInterval(loadUpdateStatus, 5000);
