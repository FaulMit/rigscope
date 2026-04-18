"use strict";

const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

function createUpdateController() {
  const state = {
    supported: app.isPackaged,
    status: app.isPackaged ? "idle" : "unavailable",
    currentVersion: app.getVersion(),
    availableVersion: null,
    downloaded: false,
    progress: null,
    error: app.isPackaged ? null : "Updates are available only in the packaged desktop app.",
    lastCheckedAt: null
  };

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  const merge = (patch) => Object.assign(state, patch);
  const isBusy = () => ["checking", "downloading", "installing"].includes(state.status);

  autoUpdater.on("checking-for-update", () => merge({
    status: "checking",
    error: null,
    lastCheckedAt: new Date().toISOString()
  }));
  autoUpdater.on("update-available", (info) => merge({
    status: "available",
    availableVersion: info.version || null,
    downloaded: false,
    progress: null,
    error: null
  }));
  autoUpdater.on("update-not-available", () => merge({
    status: "current",
    availableVersion: null,
    downloaded: false,
    progress: null,
    error: null
  }));
  autoUpdater.on("download-progress", (progress) => merge({
    status: "downloading",
    progress: {
      percent: Math.round(progress.percent || 0),
      transferred: progress.transferred || 0,
      total: progress.total || 0,
      bytesPerSecond: progress.bytesPerSecond || 0
    }
  }));
  autoUpdater.on("update-downloaded", (info) => merge({
    status: "downloaded",
    availableVersion: info.version || state.availableVersion,
    downloaded: true,
    progress: { percent: 100 }
  }));
  autoUpdater.on("error", (error) => merge({
    status: "error",
    error: error.message || String(error)
  }));

  const ensureSupported = () => {
    if (!state.supported) {
      const error = new Error(state.error);
      error.code = "UPDATES_UNAVAILABLE";
      throw error;
    }
  };

  const controller = {
    status() {
      return { ...state };
    },
    async check() {
      ensureSupported();
      if (isBusy()) return { ...state };
      await autoUpdater.checkForUpdates();
      return { ...state };
    },
    async download() {
      ensureSupported();
      if (state.status !== "available") {
        return { ...state, error: state.status === "downloaded" ? null : "No update is ready to download." };
      }
      merge({ status: "downloading", error: null });
      await autoUpdater.downloadUpdate();
      return { ...state };
    },
    install() {
      ensureSupported();
      if (!state.downloaded) {
        const error = new Error("No downloaded update is ready to install.");
        error.code = "UPDATE_NOT_DOWNLOADED";
        throw error;
      }
      merge({ status: "installing" });
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
      return { ...state };
    }
  };

  if (state.supported) {
    setTimeout(() => {
      controller.check().catch((error) => merge({
        status: "error",
        error: error.message || String(error)
      }));
    }, 2500).unref();
  }

  return controller;
}

module.exports = { createUpdateController };
