(function () {
  const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  const params = new URLSearchParams(window.location.search);
  const enabled = params.has("demo") || !localHosts.has(window.location.hostname);
  if (!enabled) return;

  window.RIGSCOPE_DEMO = true;

  const startedAt = Date.now() - 1000 * 60 * 60 * 9.4;
  const originalFetch = window.fetch.bind(window);
  const communityProfiles = [
    {
      id: "demo-7800x3d-4080",
      source: "scoreboard",
      name: "Aurora 4080 Desk Rig",
      owner: "demo_creator",
      score: 8840,
      scoreLabel: "High-end desktop",
      scoreConfidence: 92,
      cpu: "AMD Ryzen 7 7800X3D",
      gpu: "NVIDIA GeForce RTX 4080 SUPER",
      memory: "32 GB DDR5",
      storage: "2 TB NVMe",
      board: "ROG STRIX B650E-F",
      os: "Windows 11 Pro",
      bench: { cpu: "742,000 ops/sec", memory: "4096/4096 MB", gpu: "188 fps", sensors: "CPU 41% · RAM 49% · GPU 62°C 71%" }
    },
    {
      id: "demo-5900x-3060ti",
      source: "scoreboard",
      name: "Creator 3060 Ti Workstation",
      owner: "faulmit_demo",
      score: 6395,
      scoreLabel: "Strong gaming PC",
      scoreConfidence: 74,
      cpu: "AMD Ryzen 9 5900X",
      gpu: "NVIDIA GeForce RTX 3060 Ti",
      memory: "32 GB DDR4",
      storage: "2 NVMe + 2 SSD",
      board: "PRIME X470-PRO",
      os: "Windows 11 Pro",
      bench: { cpu: "614,000 ops/sec", memory: "4096/4096 MB", gpu: "112 fps", sensors: "CPU 28% · RAM 43% · GPU 54°C 39%" }
    }
  ];

  let stress = null;
  let nativeRunner = { active: false, pid: null, label: null, elapsedMs: 0, durationMs: 0, output: [], exitCode: null, report: null };

  function nowIso() {
    return new Date().toISOString();
  }

  function wave(min, max, speed = 1, offset = 0) {
    const t = performance.now() / 1000 * speed + offset;
    return Math.round(min + (Math.sin(t) * 0.5 + 0.5) * (max - min));
  }

  function json(payload, status = 200) {
    return new Response(JSON.stringify(payload), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function snapshot() {
    const cpuLoad = wave(6, 31, 0.8);
    const gpuLoad = wave(4, 42, 0.6, 1.4);
    const ramPct = wave(38, 54, 0.35, 0.9);
    const gpuTemp = wave(42, 62, 0.4, 0.2);
    const uptimeHours = (Date.now() - startedAt) / 1000 / 60 / 60;
    return {
      generatedAt: nowIso(),
      machine: {
        name: "DEMO-RIG",
        hostname: "demo-rig",
        platform: "win32",
        arch: "x64",
        uptimeHours,
        os: "Microsoft Windows 11 Pro",
        build: "26200",
        cpu: "AMD Ryzen 9 5900X 12-Core Processor",
        gpu: "NVIDIA GeForce RTX 3060 Ti"
      },
      cpu: {
        loadPct: cpuLoad,
        cores: 12,
        threads: 24,
        maxClockMhz: wave(3650, 4725, 0.5),
        perCore: Array.from({ length: 24 }, (_, i) => wave(3, i % 3 === 0 ? 72 : 45, 0.7 + i * 0.03, i)),
        processes: [
          { name: "Code.exe", pid: 4212, cpuPct: 9.4, memoryMb: 1180 },
          { name: "chrome.exe", pid: 5804, cpuPct: 6.8, memoryMb: 920 },
          { name: "RigScope.exe", pid: 8787, cpuPct: 2.2, memoryMb: 165 }
        ]
      },
      memory: {
        totalMb: 32768,
        usedMb: Math.round(32768 * ramPct / 100),
        freeMb: Math.round(32768 * (100 - ramPct) / 100),
        usedPct: ramPct,
        sticks: [8192, 8192, 8192, 8192]
      },
      gpu: {
        name: "NVIDIA GeForce RTX 3060 Ti",
        util: gpuLoad,
        utilPct: gpuLoad,
        temp: gpuTemp,
        memUsed: 2450,
        memTotal: 8192,
        power: wave(28, 142, 0.5),
        powerLimit: 200,
        fanPct: wave(30, 58, 0.4)
      },
      network: {
        cloudflare: { ok: true, ms: wave(9, 22, 0.5) },
        chatgpt: { ok: true, ms: wave(18, 46, 0.45, 1) },
        status: "demo latency probes"
      },
      inventory: inventory(),
      disks: [
        { name: "C:", label: "System", totalGb: 930, freeGb: 412, usedPct: 56 },
        { name: "D:", label: "Projects", totalGb: 1860, freeGb: 1280, usedPct: 31 },
        { name: "E:", label: "Archive", totalGb: 3720, freeGb: 2215, usedPct: 40 }
      ],
      processes: [
        { name: "Code.exe", pid: 4212, memoryMb: 1180, cpuPct: 9.4 },
        { name: "chrome.exe", pid: 5804, memoryMb: 920, cpuPct: 6.8 },
        { name: "Discord.exe", pid: 3224, memoryMb: 410, cpuPct: 1.6 },
        { name: "RigScope.exe", pid: 8787, memoryMb: 165, cpuPct: 2.2 }
      ],
      events: [
        { source: "RigScope Demo", id: 1001, level: "Information", time: nowIso(), message: "Static demo telemetry generated in the browser." },
        { source: "Windows Update", id: 19, level: "Information", time: new Date(Date.now() - 1000 * 60 * 42).toISOString(), message: "Demo cumulative update installed successfully." }
      ]
    };
  }

  function inventory() {
    return {
      system: { manufacturer: "Demo Systems", model: "RigScope Preview Tower", type: "x64-based PC", domain: "WORKGROUP", user: "demo\\visitor" },
      os: { caption: "Microsoft Windows 11 Pro", version: "10.0.26200", build: "26200", architecture: "64-bit", locale: "en-US", installDate: "2025-11-15T10:12:00.000Z", bootTime: new Date(startedAt).toISOString(), windowsDirectory: "C:\\Windows" },
      board: { manufacturer: "ASUSTeK COMPUTER INC.", product: "PRIME X470-PRO", serial: "DEMO-BOARD-0001" },
      bios: { vendor: "American Megatrends Inc.", version: "6202", releaseDate: "2025-09-18T00:00:00.000Z", mode: "UEFI" },
      cpu: { name: "AMD Ryzen 9 5900X 12-Core Processor", manufacturer: "AuthenticAMD", socket: "AM4", architecture: "x64", family: "25", cores: 12, threads: 24, currentClockMhz: wave(3650, 4725, 0.5), maxClockMhz: 4950, externalClockMhz: 100, virtualization: "Enabled", l2Kb: 6144, l3Kb: 65536, processorId: "DEMO-AMD-5900X" },
      memory: {
        totalGb: 32,
        modules: ["A1", "A2", "B1", "B2"].map((slot, index) => ({ slot: `DIMM_${slot}`, bank: `BANK ${index}`, manufacturer: "G.Skill", part: "F4-3600C16-8GTZNC", serial: `DEMO00${index + 1}`, sizeGb: 8, speedMhz: 3600, configuredMhz: 3600 }))
      },
      gpu: { name: "NVIDIA GeForce RTX 3060 Ti", vramMb: 8192, videoProcessor: "NVIDIA GeForce RTX 3060 Ti", adapterCompatibility: "NVIDIA", driverVersion: "32.0.15.7652", driverDate: "2026-03-18T00:00:00.000Z" },
      gpus: [{ name: "NVIDIA GeForce RTX 3060 Ti", vramMb: 8192, videoProcessor: "GA104", adapterCompatibility: "NVIDIA", driverVersion: "32.0.15.7652", driverDate: "2026-03-18T00:00:00.000Z", status: "OK", pnp: "PCI\\VEN_10DE&DEV_2489" }],
      displays: [{ name: "DELL S2721DGF", width: 2560, height: 1440, refreshRate: 165, primary: true }, { name: "LG 27GL850", width: 2560, height: 1440, refreshRate: 144, primary: false }],
      physicalDisks: [
        { model: "Samsung SSD 980 PRO 1TB", sizeGb: 1000, health: "Healthy", status: "OK", operational: "Online", busType: "NVMe", interface: "PCIe 4.0", mediaType: "SSD", firmware: "5B2QGXA7" },
        { model: "Crucial MX500 2TB", sizeGb: 2000, health: "Healthy", status: "OK", operational: "Online", busType: "SATA", interface: "SATA", mediaType: "SSD", firmware: "M3CR046" },
        { model: "Seagate BarraCuda 4TB", sizeGb: 4000, health: "Healthy", status: "OK", operational: "Online", busType: "SATA", interface: "SATA", mediaType: "HDD", firmware: "0001" }
      ],
      volumes: [
        { name: "Windows", drive: "C:", label: "System", fileSystem: "NTFS", totalGb: 930, sizeGb: 930, freeGb: 412, usedPct: 56, health: "Healthy" },
        { name: "Projects", drive: "D:", label: "Projects", fileSystem: "NTFS", totalGb: 1860, sizeGb: 1860, freeGb: 1280, usedPct: 31, health: "Healthy" },
        { name: "Archive", drive: "E:", label: "Archive", fileSystem: "NTFS", totalGb: 3720, sizeGb: 3720, freeGb: 2215, usedPct: 40, health: "Healthy" }
      ],
      networkAdapters: [
        { name: "Intel I211 Gigabit Network Connection", description: "Intel Ethernet Controller", status: "Up", linkSpeed: "1 Gbps", mac: "AA:BB:CC:xx:xx:10", ipv4: ["192.168.1.42"], dns: ["1.1.1.1", "8.8.8.8"], gateway: ["192.168.1.1"] },
        { name: "Intel Wi-Fi 6 AX200", description: "Wi-Fi 6 adapter", status: "Disconnected", linkSpeed: "-", mac: "AA:BB:CC:xx:xx:11", ipv4: [], dns: [], gateway: [] }
      ],
      monitors: [
        { name: "DELL S2721DGF", manufacturer: "Dell", serial: "DEMO-MON-01", instance: "DISPLAY\\DEL41F7", active: true, screenWidth: 2560, screenHeight: 1440 },
        { name: "LG 27GL850", manufacturer: "LG", serial: "DEMO-MON-02", instance: "DISPLAY\\GSM5B7F", active: true, screenWidth: 2560, screenHeight: 1440 }
      ],
      soundDevices: [{ name: "Realtek USB Audio", manufacturer: "Realtek", status: "OK" }, { name: "NVIDIA High Definition Audio", manufacturer: "NVIDIA", status: "OK" }],
      usbControllers: [{ name: "AMD USB 3.10 eXtensible Host Controller", status: "OK" }, { name: "Generic USB Hub", status: "OK" }, { name: "Logitech USB Receiver", status: "OK" }],
      inputDevices: [{ name: "Keychron K8 Pro", type: "Keyboard", status: "OK" }, { name: "Logitech G Pro Wireless", type: "Mouse", status: "OK" }],
      pnpDevices: [{ name: "NVIDIA GeForce RTX 3060 Ti", class: "Display", status: "OK" }, { name: "Samsung SSD 980 PRO", class: "DiskDrive", status: "OK" }, { name: "Intel I211 Gigabit Network", class: "Net", status: "OK" }, { name: "Realtek USB Audio", class: "Media", status: "OK" }, { name: "USB Composite Device", class: "USB", status: "OK" }],
      systemDrivers: [{ name: "nvlddmkm", displayName: "NVIDIA Kernel Mode Driver", state: "Running", startMode: "Manual" }, { name: "storahci", displayName: "Microsoft Standard SATA AHCI Driver", state: "Running", startMode: "Boot" }, { name: "Wdf01000", displayName: "Kernel Mode Driver Frameworks", state: "Running", startMode: "Boot" }],
      hotfixes: [{ id: "KB5060123", description: "Security Update", installedOn: "2026-04-10" }, { id: "KB5059980", description: "Cumulative Update", installedOn: "2026-03-28" }]
    };
  }

  function sensors() {
    return {
      generatedAt: nowIso(),
      cpu: { loadPct: stress?.active ? wave(78, 100, 2) : wave(8, 28, 0.7), temp: stress?.active ? wave(66, 82, 1.2) : wave(42, 57, 0.4) },
      memory: { usedPct: stress?.active ? wave(58, 76, 1) : wave(39, 54, 0.4), usedMb: stress?.active ? 21840 : 14080, totalMb: 32768 },
      gpu: { temp: stress?.active ? wave(61, 74, 1.1) : wave(43, 58, 0.45), util: stress?.active ? wave(72, 96, 1.7) : wave(5, 34, 0.6), utilPct: stress?.active ? wave(72, 96, 1.7) : wave(5, 34, 0.6) }
    };
  }

  function stressStatus() {
    if (!stress) return { active: false, engines: {} };
    const elapsedMs = Date.now() - stress.startedAt;
    const active = elapsedMs < stress.durationSec * 1000 && stress.active;
    if (!active) stress.active = false;
    const progress = Math.min(1, elapsedMs / Math.max(stress.durationSec * 1000, 1));
    const heldMb = stress.memory ? Math.round(stress.targetMb * Math.min(1, progress * 1.6)) : 0;
    const frames = stress.gpu ? Math.round(progress * stress.durationSec * 90) : 0;
    return {
      active,
      elapsedMs,
      durationMs: stress.durationSec * 1000,
      engines: {
        cpu: stress.cpu ? { active, workers: stress.workers, ops: Math.round(stress.cpuBase + elapsedMs * 11200) } : { active: false },
        memory: stress.memory ? { active, targetMb: stress.targetMb, heldMb, peakHeldMb: heldMb, lastHeldMb: heldMb, cycles: Math.round(progress * 180 + wave(0, 18, 3)), checksum: Math.round(progress * 200000) } : { active: false },
        gpu: stress.gpu ? { active, frames, workUnits: frames * 24, engine: "demo-render" } : { active: false }
      },
      sensors: sensors()
    };
  }

  function toolkit() {
    const tools = [
      ["nvidia-smi", "NVIDIA SMI", "Sensors", true, "555.85"],
      ["hwinfo", "HWiNFO", "Sensors", false, ""],
      ["prime95", "Prime95 / mprime", "CPU stress", true, "demo"],
      ["furmark", "FurMark", "GPU stress", true, "demo"],
      ["occt", "OCCT", "Stability suite", false, ""],
      ["y-cruncher", "y-cruncher", "CPU / memory stress", false, ""],
      ["smartctl", "smartctl", "Storage", true, "7.4"]
    ].map(([id, name, category, available, version]) => ({ id, name, category, available, supported: true, version, capabilities: available ? ["demo detection", "safe preview"] : ["install to enable"] }));
    return { generatedAt: nowIso(), available: tools.filter((tool) => tool.available).length, total: tools.length, tools };
  }

  function nativeRunners() {
    return {
      generatedAt: nowIso(),
      acknowledgement: "DEMO_NATIVE_STRESS",
      status: nativeRunner,
      profiles: [
        { id: "prime95-small-fft", toolId: "prime95", label: "Prime95 Small FFT (demo)", available: true, executable: "demo://prime95", risk: "high", durationDefaultSec: 300, durationMaxSec: 600, notes: "Demo mode simulates the launch only. No external process is started.", safety: { maxDurationSec: 600, recommendedMonitor: "In the real app, watch CPU package temperature and VRM temperature." } },
        { id: "furmark-1080p", toolId: "furmark", label: "FurMark Burn-in 1080p (demo)", available: true, executable: "demo://furmark", risk: "high", durationDefaultSec: 300, durationMaxSec: 600, notes: "Demo mode shows the workflow without launching FurMark.", safety: { maxDurationSec: 600, recommendedMonitor: "In the real app, watch GPU temperature, hotspot, fan speed, and power draw." } }
      ]
    };
  }

  async function handleApi(path, init) {
    if (path.endsWith("/api/snapshot") || path.endsWith("/api/live")) return json(snapshot());
    if (path.endsWith("/api/toolkit")) return json(toolkit());
    if (path.endsWith("/api/sensors/quick")) return json(sensors());
    if (path.endsWith("/api/community")) return json({ generatedAt: nowIso(), mode: "demo-scoreboard", publishing: "demo", status: "demo online", profiles: clone(communityProfiles) });
    if (path.endsWith("/api/community/profile")) {
      const body = init?.body ? JSON.parse(init.body) : {};
      const profile = { ...body, id: `demo-${Date.now()}`, source: "scoreboard", owner: body.owner || "demo_user", generatedAt: nowIso() };
      communityProfiles.unshift(profile);
      return json({ profile, status: "published to demo", github: "demo-scoreboard" });
    }
    if (path.endsWith("/api/updates/status")) return json({ supported: false, status: "unavailable", currentVersion: "1.1.0", error: "Demo site cannot install desktop updates." });
    if (path.includes("/api/updates/")) return json({ supported: false, status: "unavailable", currentVersion: "1.1.0" });
    if (path.endsWith("/api/native-runners")) return json(nativeRunners());
    if (path.endsWith("/api/native-runners/status")) {
      if (nativeRunner.active) {
        nativeRunner.elapsedMs = Date.now() - nativeRunner.startedAt;
        nativeRunner.output = [`demo process running ${Math.round(nativeRunner.elapsedMs / 1000)}s`, "no external executable was launched"];
        if (nativeRunner.elapsedMs >= nativeRunner.durationMs) {
          nativeRunner.active = false;
          nativeRunner.exitCode = 0;
          nativeRunner.report = { verdict: "demo completed", elapsedMs: nativeRunner.elapsedMs };
        }
      }
      return json(nativeRunner);
    }
    if (path.endsWith("/api/native-runners/start")) {
      const body = init?.body ? JSON.parse(init.body) : {};
      nativeRunner = { active: true, pid: 424242, label: body.profileId || "demo runner", startedAt: Date.now(), elapsedMs: 0, durationMs: Math.min(Number(body.durationSec || 60), 600) * 1000, output: ["demo launch accepted", "no native process was started"], exitCode: null, report: null };
      return json(nativeRunner);
    }
    if (path.endsWith("/api/native-runners/stop")) {
      nativeRunner = { ...nativeRunner, active: false, exitCode: 0, report: { verdict: "demo stopped", elapsedMs: nativeRunner.elapsedMs || 0 } };
      return json(nativeRunner);
    }
    if (path.endsWith("/api/stress/start")) {
      const body = init?.body ? JSON.parse(init.body) : {};
      stress = { active: true, startedAt: Date.now(), durationSec: Math.min(Number(body.durationSec || 8), 300), cpu: Boolean(body.cpu), memory: Boolean(body.memory), gpu: Boolean(body.gpu), workers: Number(body.workers || navigator.hardwareConcurrency || 8), targetMb: Number(body.targetMb || 4096), cpuBase: Math.round(Math.random() * 100000) };
      const status = stressStatus();
      return json({ started: status.engines, status });
    }
    if (path.endsWith("/api/stress/status")) return json(stressStatus());
    if (path.endsWith("/api/stress/stop")) {
      const status = stressStatus();
      stress = null;
      return json({ active: false, stopped: status.engines, sensors: status.sensors, elapsedMs: status.elapsedMs });
    }
    if (path.endsWith("/api/export")) return json(snapshot());
    return json({ error: "Demo endpoint not found" }, 404);
  }

  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    if (url.pathname.includes("/api/")) return handleApi(url.pathname, init);
    return originalFetch(input, init);
  };

  window.addEventListener("DOMContentLoaded", () => {
    document.body.classList.add("demo-mode");
    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.textContent = "Live demo: all hardware data and stress tests are simulated";
    document.body.prepend(banner);
    const exportLink = document.querySelector('a[href="api/export"], a[href="/api/export"]');
    if (exportLink) {
      exportLink.addEventListener("click", (event) => {
        event.preventDefault();
        const blob = new Blob([JSON.stringify(snapshot(), null, 2)], { type: "application/json" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = "rigscope-demo-report.json";
        a.click();
        URL.revokeObjectURL(href);
      });
    }
  });
})();
