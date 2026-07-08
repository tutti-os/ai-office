import type { LocalAgentProviderStatus } from "../types/index.js";
import type { RuntimeProfileSeed } from "../project-store/index.js";

export function normalizeLocalAgentProviderId(provider: string | null | undefined) {
  const normalized = provider?.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!normalized) return "";
  if (normalized === "claude" || normalized === "claude-code") return "claude-code";
  return normalized;
}

export function localAgentProviderIdsMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeLocalAgentProviderId(left);
  const normalizedRight = normalizeLocalAgentProviderId(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

export type LocalAgentRuntimeProfileLike = {
  id: string;
  kind: string;
  provider?: string | null;
};

export type LocalAgentProviderStatusLike = {
  provider: string;
  available?: boolean;
};

export type TuttiAgentProviderStatusLike = {
  provider?: string | null;
  status?: string | null;
  detail?: string | null;
};

export function mergeTuttiAgentProviderStatuses(
  providers: LocalAgentProviderStatus[],
  tuttiProviders: readonly TuttiAgentProviderStatusLike[] | null | undefined,
) {
  if (!tuttiProviders?.length) return providers;
  return providers.map((provider) => {
    const tuttiProvider = tuttiProviders.find((item) => localAgentProviderIdsMatch(item.provider, provider.provider));
    if (!tuttiProvider) return provider;
    const status = tuttiProvider.status?.trim().toLowerCase();
    if (status === "available") {
      const detail = tuttiProvider.detail?.trim();
      return {
        ...provider,
        available: true,
        authState: provider.authState === "missing" ? "ok" : provider.authState,
        executablePath: detail || provider.executablePath,
        version: provider.version === "not-installed" ? "available via Tutti" : provider.version,
        reason: undefined,
      };
    }
    if (provider.available) return provider;
    const detail = tuttiProvider.detail?.trim();
    return detail ? { ...provider, reason: detail } : provider;
  });
}

export function resolvePreferredLocalAgentRuntimeProfileId(input: {
  profiles: LocalAgentRuntimeProfileLike[];
  providers?: LocalAgentProviderStatusLike[];
  defaultProvider?: string | null;
}) {
  const profiles = input.profiles.filter((profile) => profile.kind === "local-agent");
  const defaultProfile = findRuntimeProfileForProvider(profiles, input.defaultProvider);
  if (defaultProfile) return defaultProfile.id;

  const availableProvider = input.providers?.find((provider) => provider.available);
  if (availableProvider) {
    const matched = findRuntimeProfileForProvider(profiles, availableProvider.provider);
    if (matched) return matched.id;
  }

  return profiles[0]?.id ?? "";
}

function findRuntimeProfileForProvider(profiles: LocalAgentRuntimeProfileLike[], provider: string | null | undefined) {
  if (!provider) return null;
  return profiles.find((profile) => localAgentProviderIdsMatch(profile.provider, provider)) ?? null;
}

export function normalizeRuntimeProfileProviderId(provider: string | null | undefined) {
  const normalized = normalizeLocalAgentProviderId(provider);
  if (!normalized) return "";
  if (normalized === "claude-code") return "claude";
  return normalized;
}

export function runtimeProfileIdFromProvider(provider: string): { value?: string; error?: string } {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  if (!profileProvider) return { error: "provider is required" };
  return { value: `local-agent:${profileProvider}` };
}

export function displayNameForLocalAgentProvider(provider: string, fallback?: string | null) {
  const trimmed = fallback?.trim();
  if (trimmed) return trimmed;
  const normalized = normalizeRuntimeProfileProviderId(provider);
  if (normalized === "codex") return "Codex";
  if (normalized === "claude") return "Claude Code";
  if (normalized === "cursor") return "Cursor";
  if (normalized === "opencode") return "OpenCode";
  if (!normalized) return "Agent";
  return normalized
    .split(/[-_.]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function localAgentRuntimeProfileSeed(
  provider: string,
  displayName?: string | null,
): RuntimeProfileSeed {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  return {
    id: `local-agent:${profileProvider}`,
    kind: "local-agent",
    provider: profileProvider,
    model: `${profileProvider}:default`,
    displayName: displayNameForLocalAgentProvider(provider, displayName),
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
  };
}
