"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const changelogPath = path.join(root, "CHANGELOG.md");
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : path.join(root, "release-notes.md");
const changelog = fs.readFileSync(changelogPath, "utf8");
const latestSection = changelog
  .split(/\r?\n(?=##\s+)/)
  .find((section) => section.startsWith("## ") && !section.match(/^##\s+Unreleased\b/i));
const match = latestSection && latestSection.match(/^##\s+(.+?)\r?\n([\s\S]*)$/);

if (!match) {
  console.error("Could not find the latest CHANGELOG.md section.");
  process.exit(1);
}

const heading = match[1].trim();
const body = match[2].trim();
const notes = [`## ${heading}`, "", body].join("\n").trim() + "\n";

fs.writeFileSync(outputPath, notes, "utf8");
console.log(`Wrote release notes for ${heading} to ${path.relative(root, outputPath) || outputPath}.`);
