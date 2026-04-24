"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const checkFiles = [
  "server.js",
  "native-bridges.js",
  "native-runners.js",
  "lib/community-profile.js",
  "lib/http.js",
  "lib/request-guard.js",
  "electron/main.js",
  "electron/updates.js",
  "scoreboard/server.js",
  "scoreboard/cloudflare/worker.mjs",
  "scripts/notarize.js",
  "scripts/preflight.js",
  "public/app.js"
];

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: "inherit"
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

for (const file of checkFiles) {
  run(["--check", file]);
}

const testDir = path.join(process.cwd(), "tests");
const testFiles = fs.readdirSync(testDir)
  .filter((file) => file.endsWith(".test.js"))
  .sort()
  .map((file) => path.join("tests", file));

run(["--test", ...testFiles]);
