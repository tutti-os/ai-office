import assert from "node:assert/strict";
import test from "node:test";
import {
  compareStableSemver,
  parseStableSemver,
  resolveStableVersionSeed,
  resolveTuttiAppPackageVersion,
} from "./version.mjs";

test("parseStableSemver keeps x.y.z and strips build metadata", () => {
  assert.deepEqual(parseStableSemver("0.1.45"), {
    version: "0.1.45",
    major: 0,
    minor: 1,
    patch: 45,
  });
  assert.deepEqual(parseStableSemver("0.1.27+0226ac29c72f")?.version, "0.1.27");
  assert.equal(parseStableSemver("latest"), null);
});

test("compareStableSemver orders patch releases", () => {
  assert.ok(
    compareStableSemver(parseStableSemver("0.1.45"), parseStableSemver("0.1.27")) > 0,
  );
});

test("resolveStableVersionSeed prefers newer release tags over stale manifests", () => {
  const version = resolveStableVersionSeed({
    appId: "ai-doc",
    manifestVersion: "0.1.27",
    rootDir: "/tmp",
    fetchTags: false,
    listTagSeeds: () => [
      parseStableSemver("0.1.44"),
      parseStableSemver("0.1.45"),
      parseStableSemver("0.1.27"),
    ],
  });
  assert.equal(version, "0.1.45");
});

test("resolveTuttiAppPackageVersion honors explicit env overrides", () => {
  const envVar = "AI_DOC_TUTTI_APP_VERSION_TEST";
  process.env[envVar] = "9.9.9+deadbeef";
  try {
    const version = resolveTuttiAppPackageVersion({
      appId: "ai-doc",
      manifestVersion: "0.1.27",
      versionEnvVar: envVar,
      rootDir: "/tmp",
      fetchTags: false,
      listTagSeeds: () => [parseStableSemver("0.1.45")],
    });
    assert.equal(version, "9.9.9+deadbeef");
  } finally {
    delete process.env[envVar];
  }
});
