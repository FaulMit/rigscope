"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const exists = (file) => fs.existsSync(path.join(root, file));
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const errors = [];
const warnings = [];
const pkg = readJson("package.json");
const lock = readJson("package-lock.json");

function requireCondition(condition, message) {
  if (!condition) errors.push(message);
}

function warnCondition(condition, message) {
  if (!condition) warnings.push(message);
}

requireCondition(pkg.version === lock.version, "package-lock.json version must match package.json.");
requireCondition(pkg.license === "MIT", "package.json must declare the MIT license.");
requireCondition(exists("LICENSE"), "LICENSE must be present for public distribution.");
requireCondition(exists("CHANGELOG.md"), "CHANGELOG.md must be present for release notes.");
requireCondition(pkg.dependencies?.["electron-updater"], "electron-updater must be a runtime dependency.");
requireCondition(Array.isArray(pkg.build?.publish) && pkg.build.publish.some((item) => item.provider === "github"), "GitHub publish provider must be configured for update metadata.");
requireCondition(pkg.build?.files?.includes("LICENSE"), "Packaged app must include LICENSE.");
requireCondition(pkg.build?.files?.includes("CHANGELOG.md"), "Packaged app must include CHANGELOG.md.");

const readme = read("README.md");
requireCondition(readme.includes(`release-v${pkg.version}`), "README release badge must match package version.");
requireCondition(readme.includes("MIT"), "README must mention the license.");
requireCondition(readme.includes("auto-update") || readme.includes("автообнов"), "README must document packaged auto updates.");

const releaseDocs = read("docs/RELEASE.md");
requireCondition(releaseDocs.includes("Auto updates"), "Release docs must document auto updates.");
warnCondition(releaseDocs.includes("signing secrets"), "Release docs should mention signing secrets.");

const docsCheck = spawnSync(process.execPath, [path.join(root, "scripts", "sync-docs-demo.js"), "--check"], { encoding: "utf8" });
requireCondition(docsCheck.status === 0, `README/demo fixtures must match docs/product-manifest.json. ${docsCheck.stderr || docsCheck.stdout}`.trim());

if (warnings.length) {
  console.warn("Preflight warnings:");
  warnings.forEach((warning) => console.warn(`- ${warning}`));
}

if (errors.length) {
  console.error("Preflight failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`RigScope ${pkg.version} preflight ok.`);
