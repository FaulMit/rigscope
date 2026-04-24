"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  describeNativeBridge,
  detectNativeBridges,
  getNativeBridgeCatalog,
  getNativeBridgeCommands
} = require("../native-bridges");

test("native bridge catalog is filtered by platform", () => {
  const windowsCatalog = getNativeBridgeCatalog("win32");
  const ids = windowsCatalog.tools.map((tool) => tool.id);

  assert.equal(windowsCatalog.platform, "win32");
  assert.equal(windowsCatalog.safeMode, true);
  assert.ok(ids.includes("aida64"));
  assert.ok(ids.includes("smartctl"));
  assert.ok(!ids.includes("powermetrics"));
});

test("native bridge descriptions handle unknown and unsupported platform requests", () => {
  assert.equal(describeNativeBridge("missing-tool", "win32"), null);
  assert.equal(describeNativeBridge("aida64", "linux"), null);

  const smartctl = describeNativeBridge("smartctl", "linux");
  assert.equal(smartctl.id, "smartctl");
  assert.equal(smartctl.commands.blocked[0].reason, "workload-launch-disabled");
  assert.equal(smartctl.commands.safe.some((command) => command.id === "health"), true);
});

test("native bridge commands stay inert when detection is disabled", () => {
  const commands = getNativeBridgeCommands("smartctl", {
    platform: "linux",
    detected: false
  });

  assert.equal(commands.executable, null);
  assert.deepEqual(commands.safe.find((command) => command.id === "health").command, null);
  assert.deepEqual(commands.safe.find((command) => command.id === "health").args, ["-H", "{{device}}"]);
});

test("workload tools expose blocked summaries instead of safe launch commands", () => {
  const commands = getNativeBridgeCommands("prime95", {
    platform: "win32",
    detected: false
  });

  assert.deepEqual(commands.safe, []);
  assert.equal(commands.blocked[0].reason, "workload-launch-disabled");
  assert.ok(commands.blocked[0].capabilities.includes("cpu-stress-test-manual"));
});

test("native bridge detection accepts explicit paths without running tools", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "rigscope-native-"));
  const executable = path.join(tempDir, process.platform === "win32" ? "smartctl.exe" : "smartctl");
  fs.writeFileSync(executable, "", "utf8");
  fs.chmodSync(executable, 0o755);

  try {
    const result = detectNativeBridges({
      platform: "linux",
      paths: {
        smartctl: [executable]
      }
    });
    const smartctl = result.tools.find((tool) => tool.id === "smartctl");

    assert.equal(smartctl.available, true);
    assert.equal(smartctl.executable.path, path.normalize(executable));
    assert.equal(smartctl.commands.safe.find((command) => command.id === "scan-open").command[0], path.normalize(executable));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
