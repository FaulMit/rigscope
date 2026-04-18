"use strict";

const { execFile, spawn } = require("child_process");
const path = require("path");
const { detectNativeBridges } = require("./native-bridges");

const ACK = "START_NATIVE_STRESS";
const MAX_DURATION_SEC = 900;

const PROFILE_DEFINITIONS = [
  {
    id: "prime95-torture",
    toolId: "prime95",
    label: "Prime95 / mprime Torture",
    target: "cpu-memory",
    risk: "high",
    durationDefaultSec: 300,
    durationMaxSec: 900,
    args: () => ["-t"],
    notes: "Starts the built-in torture mode. Stop from RigScope or close Prime95/mprime."
  },
  {
    id: "furmark-smoke",
    toolId: "furmark",
    label: "FurMark GPU Smoke",
    target: "gpu",
    risk: "high",
    durationDefaultSec: 120,
    durationMaxSec: 600,
    args: (tool) => {
      const exe = path.basename(tool.executable?.path || "").toLowerCase();
      if (process.platform === "win32") {
        return exe.includes("furmark2")
          ? ["--demo", "--fullscreen=0"]
          : ["/nogui", "/width=1280", "/height=720", "/max_time=120000"];
      }
      return [];
    },
    notes: "Launches FurMark with a conservative windowed/smoke profile when supported by the installed build."
  },
  {
    id: "occt-manual",
    toolId: "occt",
    label: "OCCT Manual Session",
    target: "stability-suite",
    risk: "high",
    durationDefaultSec: 300,
    durationMaxSec: 900,
    args: () => [],
    notes: "OCCT CLI differs by release, so RigScope launches OCCT and tracks the process; choose the exact test in OCCT."
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
    notes: "y-cruncher automation is intentionally not scripted yet; this launches the native tool and tracks it."
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
  output: []
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
    output: nativeRunner.output.slice(-12)
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
  const args = profile.args(tool);
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
    pid: child.pid,
    startedAt: Date.now(),
    durationMs: durationSec * 1000,
    child,
    exitCode: null,
    signal: null,
    output: []
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
    return getStatus(reason);
  }
  nativeRunner.active = false;
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
