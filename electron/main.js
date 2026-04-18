const { app, BrowserWindow, shell } = require("electron");
const { startServer, setUpdateController } = require("../server");
const { createUpdateController } = require("./updates");

const APP_URL = "http://127.0.0.1:8787";
let mainWindow = null;

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return mainWindow;
  }
  const win = new BrowserWindow({
    width: 1440,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    title: "RigScope",
    backgroundColor: "#0b0f12",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow = win;

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.loadURL(APP_URL);
  return win;
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    createWindow();
  });

  app.whenReady().then(async () => {
    setUpdateController(createUpdateController());
    await startServer();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  }).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
