"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const PLATFORM = process.platform;
const IS_WINDOWS = PLATFORM === "win32";
const IS_MAC = PLATFORM === "darwin";

const WINDOWS_EXTENSIONS = [".exe", ".cmd", ".bat", ".com"];

const TOOL_DEFINITIONS = [
  {
    id: "aida64",
    name: "AIDA64",
    vendor: "FinalWire",
    platforms: ["win32"],
    category: "inventory",
    capabilities: ["hardware-inventory", "sensor-monitoring", "reporting", "stress-test-manual"],
    executableNames: ["aida64.exe"],
    windowsPaths: [
      ["ProgramFiles", "FinalWire", "AIDA64 Extreme", "aida64.exe"],
      ["ProgramFiles", "FinalWire", "AIDA64 Engineer", "aida64.exe"],
      ["ProgramFiles", "FinalWire", "AIDA64 Business", "aida64.exe"],
      ["ProgramFiles(x86)", "FinalWire", "AIDA64 Extreme", "aida64.exe"],
      ["ProgramFiles(x86)", "FinalWire", "AIDA64 Engineer", "aida64.exe"],
      ["ProgramFiles(x86)", "FinalWire", "AIDA64 Business", "aida64.exe"]
    ],
    safeCommands: [],
    notes: "AIDA64 can run stress tests, but this bridge only reports installation and metadata."
  },
  {
    id: "occt",
    name: "OCCT",
    vendor: "OCBASE",
    platforms: ["win32"],
    category: "stress-test",
    capabilities: ["cpu-test-manual", "gpu-test-manual", "memory-test-manual", "psu-test-manual", "monitoring"],
    executableNames: ["OCCT.exe", "occt.exe"],
    windowsPaths: [
      ["ProgramFiles", "OCCT", "OCCT.exe"],
      ["ProgramFiles(x86)", "OCCT", "OCCT.exe"],
      ["LOCALAPPDATA", "Programs", "OCCT", "OCCT.exe"]
    ],
    safeCommands: [],
    notes: "OCCT workloads are intentionally not exposed as launchable commands."
  },
  {
    id: "furmark",
    name: "FurMark / FurMark 2",
    vendor: "Geeks3D",
    platforms: ["win32", "linux"],
    category: "gpu-stress-test",
    capabilities: ["gpu-benchmark-manual", "gpu-stress-test-manual", "opengl-vulkan-rendering"],
    executableNames: ["FurMark2.exe", "FurMark.exe", "furmark", "furmark2"],
    windowsPaths: [
      ["ProgramFiles", "Geeks3D", "FurMark2", "FurMark2.exe"],
      ["ProgramFiles", "Geeks3D", "FurMark", "FurMark.exe"],
      ["ProgramFiles(x86)", "Geeks3D", "FurMark2", "FurMark2.exe"],
      ["ProgramFiles(x86)", "Geeks3D", "FurMark", "FurMark.exe"]
    ],
    linuxPaths: ["/usr/bin/furmark", "/usr/local/bin/furmark", "/opt/furmark/FurMark"],
    safeCommands: [],
    notes: "FurMark is treated as a manual-only GPU load tool."
  },
  {
    id: "memtest86",
    name: "MemTest86",
    vendor: "PassMark",
    platforms: ["win32", "linux", "darwin"],
    category: "memory-diagnostics",
    capabilities: ["bootable-memory-test", "offline-diagnostics"],
    executableNames: ["imageUSB.exe", "memtest86-usb.exe"],
    windowsPaths: [
      ["ProgramFiles", "MemTest86", "imageUSB.exe"],
      ["ProgramFiles(x86)", "MemTest86", "imageUSB.exe"]
    ],
    linuxPaths: ["/boot/memtest86/memtest86", "/usr/share/memtest86/memtest86"],
    macPaths: ["/Applications/MemTest86.app"],
    safeCommands: [],
    notes: "MemTest86 normally runs outside the OS; this bridge only detects local install artifacts."
  },
  {
    id: "hwinfo",
    name: "HWiNFO",
    vendor: "REALiX",
    platforms: ["win32"],
    category: "monitoring",
    capabilities: ["sensor-monitoring", "hardware-inventory", "shared-memory-feed", "logging-manual"],
    executableNames: ["HWiNFO64.exe", "HWiNFO32.exe"],
    windowsPaths: [
      ["ProgramFiles", "HWiNFO64", "HWiNFO64.exe"],
      ["ProgramFiles(x86)", "HWiNFO64", "HWiNFO64.exe"],
      ["ProgramFiles(x86)", "HWiNFO32", "HWiNFO32.exe"],
      ["LOCALAPPDATA", "Programs", "HWiNFO64", "HWiNFO64.exe"]
    ],
    safeCommands: [],
    notes: "Sensor polling through HWiNFO shared memory requires a separate reader and explicit user setup."
  },
  {
    id: "librehardwaremonitor",
    name: "LibreHardwareMonitor",
    vendor: "LibreHardwareMonitor",
    platforms: ["win32"],
    category: "monitoring",
    capabilities: ["sensor-monitoring", "hardware-inventory", "wmi-provider-when-enabled"],
    executableNames: ["LibreHardwareMonitor.exe"],
    windowsPaths: [
      ["ProgramFiles", "LibreHardwareMonitor", "LibreHardwareMonitor.exe"],
      ["ProgramFiles(x86)", "LibreHardwareMonitor", "LibreHardwareMonitor.exe"],
      ["LOCALAPPDATA", "Programs", "LibreHardwareMonitor", "LibreHardwareMonitor.exe"]
    ],
    safeCommands: [],
    notes: "This bridge does not start the monitor; it only reports whether the executable is discoverable."
  },
  {
    id: "lm-sensors",
    name: "lm-sensors / sensors",
    vendor: "lm-sensors",
    platforms: ["linux"],
    category: "monitoring",
    capabilities: ["sensor-monitoring", "temperature", "fan-speed", "voltage"],
    executableNames: ["sensors"],
    linuxPaths: ["/usr/bin/sensors", "/usr/sbin/sensors", "/usr/local/bin/sensors"],
    safeCommands: [
      command("json-snapshot", ["-j"], "Read sensors in JSON format.", { output: "json" }),
      command("text-snapshot", [], "Read sensors in text format.", { output: "text" })
    ],
    notes: "Detection does not run sensors-detect because probing hardware buses can be intrusive."
  },
  {
    id: "smartctl",
    name: "smartmontools / smartctl",
    vendor: "smartmontools",
    platforms: ["win32", "linux", "darwin"],
    category: "storage-health",
    capabilities: ["drive-health", "smart-attributes", "nvme-log", "self-test-status"],
    executableNames: ["smartctl", "smartctl.exe"],
    windowsPaths: [
      ["ProgramFiles", "smartmontools", "bin", "smartctl.exe"],
      ["ProgramFiles(x86)", "smartmontools", "bin", "smartctl.exe"]
    ],
    linuxPaths: ["/usr/sbin/smartctl", "/usr/bin/smartctl", "/usr/local/sbin/smartctl", "/usr/local/bin/smartctl"],
    macPaths: ["/usr/local/sbin/smartctl", "/usr/local/bin/smartctl", "/opt/homebrew/sbin/smartctl", "/opt/homebrew/bin/smartctl"],
    safeCommands: [
      command("scan-open", ["--scan-open"], "List drives smartctl can open.", { mayRequireAdmin: true }),
      command("info", ["-i", "{{device}}"], "Read drive identity only.", { placeholders: ["device"], mayRequireAdmin: true }),
      command("health", ["-H", "{{device}}"], "Read SMART health status.", { placeholders: ["device"], mayRequireAdmin: true })
    ],
    notes: "Short or long SMART self-tests are not listed as safe commands because they start device-side tests."
  },
  {
    id: "powermetrics",
    name: "powermetrics",
    vendor: "Apple",
    platforms: ["darwin"],
    category: "power-telemetry",
    capabilities: ["cpu-power", "thermal-pressure", "frequency", "package-c-states"],
    executableNames: ["powermetrics"],
    macPaths: ["/usr/bin/powermetrics"],
    safeCommands: [
      command("single-sample", ["--samplers", "cpu_power,gpu_power,thermal", "--sample-count", "1"], "Capture one telemetry sample.", { mayRequireAdmin: true })
    ],
    notes: "powermetrics often requires elevated privileges; this bridge does not request them."
  },
  {
    id: "y-cruncher",
    name: "y-cruncher",
    vendor: "y-cruncher",
    platforms: ["win32", "linux"],
    category: "cpu-memory-benchmark",
    capabilities: ["cpu-benchmark-manual", "memory-benchmark-manual", "stress-test-manual"],
    executableNames: ["y-cruncher.exe", "y-cruncher", "y-cruncher-static"],
    windowsPaths: [
      ["ProgramFiles", "y-cruncher", "y-cruncher.exe"],
      ["ProgramFiles(x86)", "y-cruncher", "y-cruncher.exe"]
    ],
    linuxPaths: ["/usr/bin/y-cruncher", "/usr/local/bin/y-cruncher", "/opt/y-cruncher/y-cruncher"],
    safeCommands: [],
    notes: "y-cruncher workloads are compute intensive and remain manual-only."
  },
  {
    id: "prime95",
    name: "Prime95 / mprime",
    vendor: "Mersenne Research",
    platforms: ["win32", "linux", "darwin"],
    category: "cpu-stress-test",
    capabilities: ["cpu-stress-test-manual", "memory-stress-test-manual", "torture-test-manual"],
    executableNames: ["prime95.exe", "mprime"],
    windowsPaths: [
      ["ProgramFiles", "Prime95", "prime95.exe"],
      ["ProgramFiles(x86)", "Prime95", "prime95.exe"]
    ],
    linuxPaths: ["/usr/bin/mprime", "/usr/local/bin/mprime", "/opt/prime95/mprime", "/opt/mprime/mprime"],
    macPaths: ["/Applications/Prime95.app", "/usr/local/bin/mprime", "/opt/homebrew/bin/mprime"],
    safeCommands: [],
    notes: "Prime95 and mprime can start torture tests; no launch command is exposed here."
  },
  {
    id: "nvidia-smi",
    name: "NVIDIA SMI",
    vendor: "NVIDIA",
    platforms: ["win32", "linux", "darwin"],
    category: "gpu-telemetry",
    capabilities: ["gpu-inventory", "gpu-telemetry", "driver-info", "power-limit-read"],
    executableNames: ["nvidia-smi", "nvidia-smi.exe"],
    windowsPaths: [
      ["ProgramFiles", "NVIDIA Corporation", "NVSMI", "nvidia-smi.exe"],
      ["SystemRoot", "System32", "nvidia-smi.exe"]
    ],
    linuxPaths: ["/usr/bin/nvidia-smi", "/usr/local/bin/nvidia-smi"],
    macPaths: ["/usr/bin/nvidia-smi", "/usr/local/bin/nvidia-smi"],
    safeCommands: [
      command("list-gpus", ["--list-gpus"], "List detected NVIDIA GPUs."),
      command("query-gpu", [
        "--query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.total,power.draw,power.limit",
        "--format=csv,noheader,nounits"
      ], "Read GPU telemetry without changing device state.", { output: "csv" })
    ],
    notes: "Only read-only nvidia-smi query commands are exposed."
  },
  {
    id: "cpu-z",
    name: "CPU-Z",
    vendor: "CPUID",
    platforms: ["win32"],
    category: "hardware-inventory",
    capabilities: ["cpu-inventory", "memory-spd", "motherboard-inventory", "reporting-manual"],
    executableNames: ["cpuz.exe", "cpuz_x64.exe"],
    windowsPaths: [
      ["ProgramFiles", "CPUID", "CPU-Z", "cpuz.exe"],
      ["ProgramFiles", "CPUID", "CPU-Z", "cpuz_x64.exe"],
      ["ProgramFiles(x86)", "CPUID", "CPU-Z", "cpuz.exe"]
    ],
    safeCommands: [],
    notes: "CPU-Z automation varies by edition; this bridge only detects installed binaries."
  },
  {
    id: "gpu-z",
    name: "GPU-Z",
    vendor: "TechPowerUp",
    platforms: ["win32"],
    category: "gpu-inventory",
    capabilities: ["gpu-inventory", "sensor-monitoring-manual", "logging-manual"],
    executableNames: ["GPU-Z.exe", "GPU-Z.2.0.exe"],
    windowsPaths: [
      ["ProgramFiles", "TechPowerUp", "GPU-Z", "GPU-Z.exe"],
      ["ProgramFiles(x86)", "TechPowerUp", "GPU-Z", "GPU-Z.exe"]
    ],
    safeCommands: [],
    notes: "GPU-Z is commonly portable, so PATH or explicit install-path detection may miss manually downloaded copies."
  }
];

function command(id, args, description, options) {
  return Object.assign({
    id,
    args,
    description,
    safe: true,
    startsWorkload: false
  }, options || {});
}

function getPlatformInfo() {
  return {
    platform: PLATFORM,
    arch: process.arch,
    release: os.release(),
    hostname: os.hostname()
  };
}

function listNativeBridgeTools(platform) {
  const target = platform || PLATFORM;
  return TOOL_DEFINITIONS
    .filter((tool) => tool.platforms.includes(target))
    .map((tool) => publicDefinition(tool));
}

function describeNativeBridge(id, platform) {
  const tool = TOOL_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!tool) return null;
  if (platform && !tool.platforms.includes(platform)) return null;
  return publicDefinition(tool);
}

function detectNativeBridges(options) {
  const opts = options || {};
  const targetPlatform = opts.platform || PLATFORM;
  const tools = TOOL_DEFINITIONS.filter((tool) => tool.platforms.includes(targetPlatform));

  return {
    platform: getPlatformInfo(),
    generatedAt: new Date().toISOString(),
    safeMode: true,
    tools: tools.map((tool) => detectTool(tool, targetPlatform, opts))
  };
}

function getNativeBridgeCatalog(platform) {
  const target = platform || PLATFORM;
  return {
    platform: target,
    safeMode: true,
    tools: listNativeBridgeTools(target)
  };
}

function getNativeBridgeCommands(id, options) {
  const opts = options || {};
  const tool = TOOL_DEFINITIONS.find((candidate) => candidate.id === id);
  if (!tool) return null;
  const targetPlatform = opts.platform || PLATFORM;
  if (!tool.platforms.includes(targetPlatform)) return null;

  const detected = opts.detected === false ? null : detectTool(tool, targetPlatform, opts);
  return buildCommands(tool, detected && detected.executable ? detected.executable.path : null);
}

function detectTool(tool, platform, options) {
  const explicitPaths = Array.isArray(options.paths && options.paths[tool.id]) ? options.paths[tool.id] : [];
  const candidates = [
    ...explicitPaths,
    ...platformSpecificPaths(tool, platform),
    ...pathCandidates(tool.executableNames || [])
  ];
  const executable = firstExistingPath(candidates);
  const supported = tool.platforms.includes(platform);

  return {
    id: tool.id,
    name: tool.name,
    vendor: tool.vendor,
    category: tool.category,
    supported,
    available: Boolean(executable),
    status: !supported ? "unsupported" : executable ? "available" : "missing",
    executable: executable ? {
      path: executable,
      source: classifySource(executable)
    } : null,
    capabilities: tool.capabilities.slice(),
    commands: buildCommands(tool, executable),
    notes: tool.notes
  };
}

function publicDefinition(tool) {
  return {
    id: tool.id,
    name: tool.name,
    vendor: tool.vendor,
    platforms: tool.platforms.slice(),
    category: tool.category,
    capabilities: tool.capabilities.slice(),
    commands: buildCommands(tool, null),
    notes: tool.notes
  };
}

function buildCommands(tool, executablePath) {
  return {
    executable: executablePath || null,
    safe: (tool.safeCommands || []).map((entry) => ({
      id: entry.id,
      command: executablePath ? [executablePath].concat(entry.args) : null,
      args: entry.args.slice(),
      description: entry.description,
      safe: entry.safe === true,
      startsWorkload: entry.startsWorkload === true,
      output: entry.output || null,
      placeholders: entry.placeholders || [],
      mayRequireAdmin: entry.mayRequireAdmin === true,
      requiresManualReview: entry.requiresManualReview === true
    })),
    blocked: blockedCommandSummary(tool)
  };
}

function blockedCommandSummary(tool) {
  const workloadCapabilities = tool.capabilities.filter((capability) => capability.includes("stress") || capability.includes("benchmark") || capability.includes("test"));
  if (workloadCapabilities.length === 0) return [];
  return [{
    reason: "workload-launch-disabled",
    description: "Potentially stressful diagnostics and benchmarks are not exposed by this safety-only bridge.",
    capabilities: workloadCapabilities
  }];
}

function platformSpecificPaths(tool, platform) {
  if (platform === "win32") return windowsCandidatePaths(tool.windowsPaths || []);
  if (platform === "linux") return tool.linuxPaths || [];
  if (platform === "darwin") return tool.macPaths || [];
  return [];
}

function windowsCandidatePaths(partsList) {
  return partsList
    .map((parts) => {
      const root = process.env[parts[0]];
      if (!root) return null;
      return path.join(root, ...parts.slice(1));
    })
    .filter(Boolean);
}

function pathCandidates(executableNames) {
  const pathValue = process.env.PATH || "";
  const dirs = pathValue.split(path.delimiter).filter(Boolean);
  const names = executableNames.flatMap((name) => executableNameVariants(name));
  const seen = new Set();
  const candidates = [];

  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      const key = IS_WINDOWS ? candidate.toLowerCase() : candidate;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(candidate);
      }
    }
  }

  return candidates;
}

function executableNameVariants(name) {
  if (!IS_WINDOWS) return [name];
  if (path.extname(name)) return [name];
  return [name].concat(WINDOWS_EXTENSIONS.map((ext) => `${name}${ext}`));
}

function firstExistingPath(candidates) {
  const seen = new Set();
  for (const candidate of candidates) {
    if (!candidate) continue;
    const normalized = path.normalize(candidate);
    const key = IS_WINDOWS ? normalized.toLowerCase() : normalized;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isExecutablePath(normalized)) return normalized;
  }
  return null;
}

function isExecutablePath(candidate) {
  try {
    const stat = fs.statSync(candidate);
    if (stat.isDirectory()) return IS_MAC && candidate.endsWith(".app");
    if (!stat.isFile()) return false;
    if (IS_WINDOWS) return true;
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function classifySource(executablePath) {
  const pathEntries = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  const resolved = path.resolve(executablePath);
  const inPath = pathEntries.some((entry) => {
    try {
      return samePath(path.resolve(entry), path.dirname(resolved));
    } catch {
      return false;
    }
  });

  return inPath ? "path" : "known-location";
}

function samePath(left, right) {
  if (IS_WINDOWS) return left.toLowerCase() === right.toLowerCase();
  return left === right;
}

module.exports = {
  TOOL_DEFINITIONS: TOOL_DEFINITIONS.map((tool) => Object.freeze(publicDefinition(tool))),
  detectNativeBridges,
  describeNativeBridge,
  getNativeBridgeCatalog,
  getNativeBridgeCommands,
  getPlatformInfo,
  listNativeBridgeTools
};
