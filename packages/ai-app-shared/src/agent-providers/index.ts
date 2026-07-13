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
  supported: boolean;
  isDefault?: true;
};

export function resolvePreferredLocalAgentRuntimeProfileId(input: {
  profiles: LocalAgentRuntimeProfileLike[];
  providers?: LocalAgentProviderStatusLike[];
}) {
  const profiles = input.profiles.filter((profile) => profile.kind === "local-agent");
  const supportedProviders = input.providers?.filter((provider) => provider.supported) ?? [];
  const preferredProviders = [
    supportedProviders.find((provider) => provider.isDefault)?.provider,
    supportedProviders.find((provider) => normalizeLocalAgentProviderId(provider.provider) === "codex")?.provider,
    supportedProviders.find((provider) => normalizeLocalAgentProviderId(provider.provider) === "claude-code")?.provider,
  ];

  for (const provider of preferredProviders) {
    const matched = findRuntimeProfileForProvider(profiles, provider);
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

export function isPlaceholderRuntimeProfileModel(model: string, provider: string) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  return model === `${profileProvider}:default`;
}

export function runtimeProfileModelForProvider(
  provider: string,
  catalog?: Partial<Pick<LocalAgentProviderStatus, "defaultModelId" | "models">>,
) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  const modelId = catalog?.defaultModelId?.trim() || catalog?.models?.[0]?.id?.trim();
  return modelId ? `${profileProvider}:${modelId}` : `${profileProvider}:default`;
}

export function stripRuntimeProfileModelPrefix(model: string, provider: string) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  const prefix = `${profileProvider}:`;
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

export function localAgentModelIdForAcp(model: string, provider: string) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  const stripped = stripRuntimeProfileModelPrefix(model, profileProvider);
  if (profileProvider === "cursor" && stripped === "default") {
    return "default[]";
  }
  return stripped;
}

export function localAgentRuntimeProfileSeed(
  provider: string,
  displayName?: string | null,
  catalog?: Partial<Pick<LocalAgentProviderStatus, "defaultModelId" | "models">>,
): RuntimeProfileSeed {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  return {
    id: `local-agent:${profileProvider}`,
    kind: "local-agent",
    provider: profileProvider,
    model: runtimeProfileModelForProvider(provider, catalog),
    displayName: displayNameForLocalAgentProvider(provider, displayName),
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
  };
}

export type AgentMenuProfileLike = {
  displayName: string;
  id: string;
  kind: string;
  provider?: string | null;
};

export type AgentMenuProviderLike = {
  displayName?: string | null;
  provider: string;
};

export function resolveAgentMenuProfiles(
  agentProfiles: AgentMenuProfileLike[],
  agentProviders: AgentMenuProviderLike[],
): AgentMenuProfileLike[] {
  if (agentProviders.length === 0) return agentProfiles;

  const profilesByProvider = new Map<string, AgentMenuProfileLike>();
  for (const profile of agentProfiles) {
    if (profile.kind !== "local-agent" || !profile.provider) continue;
    profilesByProvider.set(normalizeRuntimeProfileProviderId(profile.provider), profile);
  }

  return agentProviders.map((provider) => {
    const profileProvider = normalizeRuntimeProfileProviderId(provider.provider);
    const existing = profilesByProvider.get(profileProvider);
    if (existing) return existing;
    const seed = localAgentRuntimeProfileSeed(provider.provider, provider.displayName);
    return {
      id: seed.id,
      kind: seed.kind,
      provider: seed.provider,
      displayName: seed.displayName,
    };
  });
}

export function mergeLocalAgentRuntimeProfiles<TProfile extends RuntimeProfileSeed & { createdAt?: string; updatedAt?: string }>(
  existing: TProfile[],
  providers: readonly AgentMenuProviderLike[],
): TProfile[] {
  const now = new Date().toISOString();
  const merged = new Map(existing.filter((profile) => profile.kind === "local-agent").map((profile) => [profile.id, profile]));
  for (const provider of providers) {
    const seed = localAgentRuntimeProfileSeed(provider.provider, provider.displayName);
    if (merged.has(seed.id)) continue;
    merged.set(seed.id, {
      ...seed,
      createdAt: now,
      updatedAt: now,
    } as TProfile);
  }
  return [...merged.values(), ...existing.filter((profile) => profile.kind !== "local-agent")];
}
