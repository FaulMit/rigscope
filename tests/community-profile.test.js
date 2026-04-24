"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { dedupeProfiles, safeText, sanitizeProfile } = require("../lib/community-profile");

test("safeText normalizes public profile display values", () => {
  assert.equal(safeText(null), "-");
  assert.equal(safeText({ name: "Ryzen 9" }), "Ryzen 9");
  assert.equal(safeText(["CPU", null, "GPU"]), "CPU, GPU");
  assert.equal(safeText("x".repeat(250)).length, 180);
});

test("sanitizeProfile clamps score and strips unsafe id characters", () => {
  const profile = sanitizeProfile({
    id: "my rig<script>",
    score: 999999,
    owner: "",
    bench: { cpu: 12345 }
  });

  assert.equal(profile.id, "my-rig-script-");
  assert.equal(profile.score, 10000);
  assert.equal(profile.schemaVersion, 1);
  assert.equal(profile.owner, "anonymous");
  assert.equal(profile.bench.cpu, "12345");
});

test("dedupeProfiles keeps highest sorted bounded public profiles", () => {
  const profiles = dedupeProfiles([
    { id: "same", source: "local", score: 10 },
    { id: "same", source: "local", score: 100 },
    { id: "remote", source: "github", score: 50 }
  ]);

  assert.deepEqual(profiles.map((profile) => profile.id), ["remote", "same"]);
  assert.deepEqual(profiles.map((profile) => profile.score), [50, 10]);
});
