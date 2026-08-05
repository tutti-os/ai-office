import { execFileSync } from "node:child_process";

const STABLE_SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseStableSemver(version) {
  const stable = String(version || "")
    .trim()
    .split("+", 1)[0]
    .split("-", 1)[0];
  const match = stable.match(STABLE_SEMVER);
  if (!match) {
    return null;
  }
  return {
    version: `${match[1]}.${match[2]}.${match[3]}`,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function compareStableSemver(left, right) {
  for (const key of ["major", "minor", "patch"]) {
    if (left[key] !== right[key]) {
      return left[key] - right[key];
    }
  }
  return 0;
}

export function listReleaseTagSeeds(appId, rootDir, { fetchTags = true } = {}) {
  const prefix = `${appId}-v`;
  if (fetchTags) {
    try {
      execFileSync("git", ["fetch", "--tags", "--force"], {
        cwd: rootDir,
        stdio: "ignore",
      });
    } catch {
      // Shallow clones / offline environments still use whatever local tags exist.
    }
  }
  const tags = execFileSync("git", ["tag", "--list", `${prefix}*`], {
    cwd: rootDir,
    encoding: "utf8",
  })
    .split("\n")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return tags.map((tag) => parseStableSemver(tag.slice(prefix.length))).filter(Boolean);
}

/**
 * Resolve the stable package version seed for Tutti packaging.
 * Production releases bump via tags without rewriting source manifests, so staging
 * packaging must take max(manifest, <appId>-v* tags) or it freezes on a stale line.
 */
export function resolveStableVersionSeed({
  appId,
  manifestVersion,
  rootDir,
  fetchTags = true,
  listTagSeeds = listReleaseTagSeeds,
} = {}) {
  const manifestSeed = parseStableSemver(manifestVersion);
  let tagSeeds = [];
  try {
    tagSeeds = listTagSeeds(appId, rootDir, { fetchTags });
  } catch {
    tagSeeds = [];
  }
  const seeds = [...(manifestSeed ? [manifestSeed] : []), ...tagSeeds];
  const latest = seeds.sort(compareStableSemver).at(-1);
  if (!latest) {
    const fallback = String(manifestVersion || "0.0.0").trim();
    return fallback || "0.0.0";
  }
  if (manifestSeed && latest.version !== manifestSeed.version) {
    console.log(
      `Resolved package version seed ${latest.version} from release tags (manifest was ${manifestSeed.version}).`,
    );
  }
  return latest.version;
}

export function resolveTuttiAppPackageVersion({
  appId,
  manifestVersion,
  rootPackageVersion,
  versionEnvVar,
  rootDir,
  fetchTags = true,
  listTagSeeds = listReleaseTagSeeds,
} = {}) {
  if (versionEnvVar) {
    const fromEnv = process.env[versionEnvVar]?.trim();
    if (fromEnv) {
      return fromEnv;
    }
  }
  return resolveStableVersionSeed({
    appId,
    manifestVersion: manifestVersion || rootPackageVersion || "0.0.0",
    rootDir,
    fetchTags,
    listTagSeeds,
  });
}
