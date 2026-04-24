"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const Module = require("node:module");
const test = require("node:test");

const updatesPath = require.resolve("../electron/updates");

function loadUpdatesWithMocks(options = {}) {
  const autoUpdater = new EventEmitter();
  const calls = {
    checkForUpdates: 0,
    downloadUpdate: 0,
    quitAndInstall: []
  };

  autoUpdater.checkForUpdates = async () => {
    calls.checkForUpdates += 1;
  };
  autoUpdater.downloadUpdate = async () => {
    calls.downloadUpdate += 1;
  };
  autoUpdater.quitAndInstall = (...args) => {
    calls.quitAndInstall.push(args);
  };

  const app = {
    isPackaged: options.isPackaged === true,
    getVersion: () => options.version || "1.2.3"
  };

  const originalLoad = Module._load;
  delete require.cache[updatesPath];
  Module._load = function loadMocked(request, parent, isMain) {
    if (request === "electron") return { app };
    if (request === "electron-updater") return { autoUpdater };
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    return {
      ...require(updatesPath),
      autoUpdater,
      calls
    };
  } finally {
    Module._load = originalLoad;
    delete require.cache[updatesPath];
  }
}

test("update controller reports unavailable status outside packaged app", async () => {
  const { createUpdateController, calls } = loadUpdatesWithMocks();
  const controller = createUpdateController();

  assert.deepEqual(controller.status(), {
    supported: false,
    status: "unavailable",
    currentVersion: "1.2.3",
    availableVersion: null,
    downloaded: false,
    progress: null,
    error: "Updates are available only in the packaged desktop app.",
    lastCheckedAt: null
  });

  await assert.rejects(() => controller.check(), {
    code: "UPDATES_UNAVAILABLE"
  });
  assert.equal(calls.checkForUpdates, 0);
});

test("update controller mirrors updater events into immutable snapshots", () => {
  const { createUpdateController, autoUpdater } = loadUpdatesWithMocks({
    isPackaged: true,
    version: "2.0.0"
  });
  const controller = createUpdateController();

  autoUpdater.emit("checking-for-update");
  const checking = controller.status();
  checking.status = "mutated";

  assert.equal(controller.status().status, "checking");
  assert.equal(controller.status().currentVersion, "2.0.0");
  assert.match(controller.status().lastCheckedAt, /^\d{4}-\d{2}-\d{2}T/);

  autoUpdater.emit("update-available", { version: "2.1.0" });
  assert.equal(controller.status().status, "available");
  assert.equal(controller.status().availableVersion, "2.1.0");

  autoUpdater.emit("download-progress", {
    percent: 49.6,
    transferred: 10,
    total: 20,
    bytesPerSecond: 5
  });
  assert.deepEqual(controller.status().progress, {
    percent: 50,
    transferred: 10,
    total: 20,
    bytesPerSecond: 5
  });

  autoUpdater.emit("update-downloaded", { version: "2.1.0" });
  assert.equal(controller.status().status, "downloaded");
  assert.equal(controller.status().downloaded, true);
  assert.deepEqual(controller.status().progress, { percent: 100 });
});

test("update controller gates download and install operations", async () => {
  const { createUpdateController, autoUpdater, calls } = loadUpdatesWithMocks({
    isPackaged: true
  });
  const controller = createUpdateController();

  const idleDownload = await controller.download();
  assert.equal(idleDownload.error, "No update is ready to download.");
  assert.equal(calls.downloadUpdate, 0);

  autoUpdater.emit("update-available", { version: "3.0.0" });
  await controller.download();
  assert.equal(calls.downloadUpdate, 1);
  assert.equal(controller.status().status, "downloading");

  assert.throws(() => controller.install(), {
    code: "UPDATE_NOT_DOWNLOADED"
  });
});
