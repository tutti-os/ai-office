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

export function resolvePreferredLocalAgentRuntimeProfileId(input: {
  profiles: LocalAgentRuntimeProfileLike[];
  providers?: LocalAgentProviderStatusLike[];
  defaultProvider?: string | null;
}) {
  const profiles = input.profiles.filter((profile) => profile.kind === "local-agent");
  const defaultProfile = findRuntimeProfileForProvider(profiles, input.defaultProvider);
  if (defaultProfile) return defaultProfile.id;
  return (
    findAvailableRuntimeProfileForProvider(profiles, input.providers, "codex")?.id ??
    findAvailableRuntimeProfileForProvider(profiles, input.providers, "claude-code")?.id ??
    profiles[0]?.id ??
    ""
  );
}

function findRuntimeProfileForProvider(profiles: LocalAgentRuntimeProfileLike[], provider: string | null | undefined) {
  if (!provider) return null;
  return profiles.find((profile) => localAgentProviderIdsMatch(profile.provider, provider)) ?? null;
}

function findAvailableRuntimeProfileForProvider(
  profiles: LocalAgentRuntimeProfileLike[],
  providers: LocalAgentProviderStatusLike[] | undefined,
  provider: string,
) {
  const runtimeProfile = findRuntimeProfileForProvider(profiles, provider);
  if (!runtimeProfile) return null;
  if (providers?.some((item) => localAgentProviderIdsMatch(item.provider, provider) && item.available)) return runtimeProfile;
  return null;
}
