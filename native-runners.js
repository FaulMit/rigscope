"use strict";

const { execFile, spawn } = require("child_process");
const path = require("path");
const { detectNativeBridges } = require("./native-bridges");

const ACK = "START_NATIVE_STRESS";
const MAX_DURATION_SEC = 900;

const PROFILE_DEFINITIONS = [
  {
    id: "prime95-small-fft",
    toolId: "prime95",
    label: "Prime95 / mprime Small FFT",
    target: "cpu",
    risk: "high",
    durationDefaultSec: 180,
    durationMaxSec: 600,
    args: () => ["-t"],
    safety: {
      maxDurationSec: 600,
      recommendedMonitor: "Watch CPU package temperature and VRM temperature. Stop above your platform limit.",
      stopBehavior: "RigScope terminates the process tree at the duration cap or when Stop Native is pressed."
    },
    notes: "Starts Prime95 torture mode. Prime95 chooses the exact torture preset from its local configuration, so treat it as a high-heat CPU test."
  },
  {
    id: "prime95-blend",
    toolId: "prime95",
    label: "Prime95 / mprime Blend",
    target: "cpu-memory",
    risk: "high",
    durationDefaultSec: 300,
    durationMaxSec: 900,
    args: () => ["-t"],
    safety: {
      maxDurationSec: 900,
      recommendedMonitor: "Watch CPU temperature, memory temperature where available, and system responsiveness.",
      stopBehavior: "RigScope terminates the process tree at the duration cap or when Stop Native is pressed."
    },
    notes: "Launches Prime95/mprime torture mode for a longer CPU/RAM stability pass. Configure blend mode inside Prime95 if prompted."
  },
  {
    id: "furmark-smoke",
    toolId: "furmark",
    label: "FurMark GPU Smoke 720p",
    target: "gpu",
    risk: "high",
    durationDefaultSec: 120,
    durationMaxSec: 300,
    args: (tool, durationSec) => {
      const exe = path.basename(tool.executable?.path || "").toLowerCase();
      if (process.platform === "win32") {
        return exe.includes("furmark2")
          ? ["--demo", "--fullscreen=0"]
          : ["/nogui", "/width=1280", "/height=720", `/max_time=${durationSec * 1000}`];
      }
      return [];
    },
    safety: {
      maxDurationSec: 300,
      recommendedMonitor: "Watch GPU hotspot, memory junction where available, fan speed, and power draw.",
      stopBehavior: "RigScope terminates the process tree at the duration cap or when Stop Native is pressed."
    },
    notes: "Launches FurMark with a conservative 720p windowed smoke profile when supported by the installed build."
  },
  {
    id: "furmark-burn-in-1080p",
    toolId: "furmark",
    label: "FurMark Burn-in 1080p",
    target: "gpu",
    risk: "extreme",
    durationDefaultSec: 180,
    durationMaxSec: 600,
    args: (tool, durationSec) => {
      const exe = path.basename(tool.executable?.path || "").toLowerCase();
      if (process.platform === "win32") {
        return exe.includes("furmark2")
          ? ["--demo", "--fullscreen=0"]
          : ["/nogui", "/width=1920", "/height=1080", `/max_time=${durationSec * 1000}`];
      }
      return [];
    },
    safety: {
      maxDurationSec: 600,
      recommendedMonitor: "Use only with active temperature monitoring. Stop immediately on artifacts, throttling, or unstable power.",
      stopBehavior: "RigScope terminates the process tree at the duration cap or when Stop Native is pressed."
    },
    notes: "High-load FurMark profile intended for short validation runs, not unattended overnight testing."
  },
  {
    id: "occt-manual",
    toolId: "occt",
    label: "OCCT Manual Stability Session",
    target: "stability-suite",
    risk: "high",
    durationDefaultSec: 300,
    durationMaxSec: 900,
    args: () => [],
    safety: {
      maxDurationSec: 900,
      recommendedMonitor: "Use OCCT's own telemetry and stop on errors, thermal throttling, or PSU instability.",
      stopBehavior: "RigScope tracks and terminates the launched OCCT process when requested."
    },
    notes: "OCCT CLI differs by release, so RigScope launches OCCT and tracks the process; choose CPU, memory, GPU, or PSU inside OCCT."
  },
  {
    id: "occt-psu-manual",
    toolId: "occt",
    label: "OCCT PSU Manual Session",
    target: "psu-system",
    risk: "extreme",
    durationDefaultSec: 120,
    durationMaxSec: 300,
    args: () => [],
    safety: {
      maxDurationSec: 300,
      recommendedMonitor: "PSU tests can load CPU and GPU together. Do not run unattended.",
      stopBehavior: "RigScope tracks and terminates the launched OCCT process when requested."
    },
    notes: "Opens OCCT for a short manual PSU validation session. The exact test must be started inside OCCT."
  },
  {
    id: "y-cruncher-manual",
    toolId: "y-cruncher",
    label: "y-cruncher Manual Session",
    target: "cpu-memory",
    risk: "high",
    durationDefaultSec: 300,
    durationMaxSec: 900,
    args: () => [],
    safety: {
      maxDurationSec: 900,
      recommendedMonitor: "Watch CPU temperature and memory stability. y-cruncher can expose marginal RAM/IMC instability quickly.",
      stopBehavior: "RigScope tracks and terminates the launched y-cruncher process when requested."
    },
    notes: "Launches y-cruncher for manual stress/benchmark selection and tracks the process."
  }
];

const nativeRunner = {
  active: false,
  id: null,
  profileId: null,
  toolId: null,
  label: null,
  pid: null,
  startedAt: 0,
  durationMs: 0,
  timer: null,
  child: null,
  exitCode: null,
  signal: null,
  output: [],
  report: null
};

function getProfiles() {
  const bridges = detectNativeBridges();
  const tools = Object.fromEntries(bridges.tools.map((tool) => [tool.id, tool]));
  return PROFILE_DEFINITIONS.map((profile) => {
    const tool = tools[profile.toolId];
    return {
      id: profile.id,
      toolId: profile.toolId,
      label: profile.label,
      target: profile.target,
      risk: profile.risk,
      available: Boolean(tool?.available),
      supported: Boolean(tool?.supported),
      executable: tool?.executable?.path || null,
      durationDefaultSec: profile.durationDefaultSec,
      durationMaxSec: profile.durationMaxSec,
      acknowledgement: ACK,
      safety: profile.safety,
      notes: profile.notes
    };
  });
}

function getStatus(reason = "status") {
  const elapsedMs = nativeRunner.startedAt ? Date.now() - nativeRunner.startedAt : 0;
  return {
    active: nativeRunner.active,
    reason,
    id: nativeRunner.id,
    profileId: nativeRunner.profileId,
    toolId: nativeRunner.toolId,
    label: nativeRunner.label,
    pid: nativeRunner.pid,
    startedAt: nativeRunner.startedAt ? new Date(nativeRunner.startedAt).toISOString() : null,
    elapsedMs,
    durationMs: nativeRunner.durationMs,
    exitCode: nativeRunner.exitCode,
    signal: nativeRunner.signal,
    output: nativeRunner.output.slice(-12),
    report: nativeRunner.report
  };
}

function buildReport(reason = "status") {
  const elapsedMs = nativeRunner.startedAt ? Date.now() - nativeRunner.startedAt : 0;
  const completedRatio = nativeRunner.durationMs ? Math.min(1, elapsedMs / nativeRunner.durationMs) : 0;
  return {
    generatedAt: new Date().toISOString(),
    reason,
    id: nativeRunner.id,
    profileId: nativeRunner.profileId,
    label: nativeRunner.label,
    target: nativeRunner.target,
    risk: nativeRunner.risk,
    pid: nativeRunner.pid,
    elapsedMs,
    durationMs: nativeRunner.durationMs,
    completedRatio: Math.round(completedRatio * 100) / 100,
    exitCode: nativeRunner.exitCode,
    signal: nativeRunner.signal,
    verdict: nativeRunner.exitCode === 0 ? "completed" : nativeRunner.signal ? "stopped" : reason,
    outputTail: nativeRunner.output.slice(-20),
    safety: nativeRunner.safety
  };
}

function isChildAlive(child) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

function startProfile(options = {}) {
  if (options.acknowledgement !== ACK) {
    throw new Error(`Native stress launch requires acknowledgement "${ACK}".`);
  }
  if (nativeRunner.active && !isChildAlive(nativeRunner.child)) {
    nativeRunner.active = false;
    nativeRunner.child = null;
  }
  if (nativeRunner.active) {
    throw new Error(`Native runner is already active: ${nativeRunner.profileId}.`);
  }
  const profile = PROFILE_DEFINITIONS.find((item) => item.id === options.profileId);
  if (!profile) throw new Error("Unknown native runner profile.");

  const bridges = detectNativeBridges();
  const tool = bridges.tools.find((item) => item.id === profile.toolId);
  if (!tool?.available || !tool.executable?.path) {
    throw new Error(`${profile.label} is not available on this machine.`);
  }

  const requested = Number(options.durationSec) || profile.durationDefaultSec;
  const durationSec = Math.max(10, Math.min(requested, profile.durationMaxSec, MAX_DURATION_SEC));
  const args = profile.args(tool, durationSec);
  const child = spawn(tool.executable.path, args, {
    cwd: path.dirname(tool.executable.path),
    windowsHide: false,
    stdio: ["ignore", "pipe", "pipe"]
  });

  Object.assign(nativeRunner, {
    active: true,
    id: `${profile.id}-${Date.now()}`,
    profileId: profile.id,
    toolId: profile.toolId,
    label: profile.label,
    target: profile.target,
    risk: profile.risk,
    safety: profile.safety,
    pid: child.pid,
    startedAt: Date.now(),
    durationMs: durationSec * 1000,
    child,
    exitCode: null,
    signal: null,
    output: [],
    report: null
  });

  const capture = (source, chunk) => {
    String(chunk).split(/\r?\n/).filter(Boolean).forEach((line) => {
      nativeRunner.output.push(`${source}: ${line.slice(0, 500)}`);
      nativeRunner.output = nativeRunner.output.slice(-40);
    });
  };
  child.stdout?.on("data", (chunk) => capture("stdout", chunk));
  child.stderr?.on("data", (chunk) => capture("stderr", chunk));
  child.on("exit", (code, signal) => {
    nativeRunner.active = false;
    nativeRunner.exitCode = code;
    nativeRunner.signal = signal;
    nativeRunner.report = buildReport(signal ? "stopped" : "exited");
    nativeRunner.child = null;
    clearTimeout(nativeRunner.timer);
  });
  nativeRunner.timer = setTimeout(() => stopProfile("duration limit"), nativeRunner.durationMs);
  nativeRunner.timer.unref();

  return getStatus("started");
}

function stopProfile(reason = "stopped") {
  const child = nativeRunner.child;
  clearTimeout(nativeRunner.timer);
  if (!nativeRunner.active || !child) {
    nativeRunner.active = false;
    nativeRunner.child = null;
    nativeRunner.report = buildReport(reason);
    return getStatus(reason);
  }
  nativeRunner.active = false;
  nativeRunner.report = buildReport(reason);
  if (process.platform === "win32" && child.pid) {
    execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
  } else {
    try { child.kill("SIGTERM"); } catch {}
    setTimeout(() => {
      if (!child.killed) {
        try { child.kill("SIGKILL"); } catch {}
      }
    }, 1200).unref();
  }
  return getStatus(reason);
}

module.exports = {
  ACK,
  getProfiles,
  getStatus,
  startProfile,
  stopProfile
};
