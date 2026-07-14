import type { LocalAgentTargetStatus } from "../types/index.js";
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
  agentTargetId?: string | null;
  provider?: string | null;
};

export type LocalAgentTargetStatusLike = {
  agentTargetId: string;
  providerId: string;
  provider: string;
  supported: boolean;
  isDefault?: true;
};

export function resolvePreferredLocalAgentRuntimeProfileId(input: {
  profiles: LocalAgentRuntimeProfileLike[];
  agents?: LocalAgentTargetStatusLike[];
}) {
  const profiles = input.profiles.filter((profile) => profile.kind === "local-agent");
  const availableAgents = (input.agents ?? []).filter((agent) => agent.supported);
  const preferredAgents = [
    availableAgents.find((agent) => agent.isDefault),
    ...availableAgents.filter((agent) => !agent.isDefault),
  ];

  for (const agent of preferredAgents) {
    const matched = profiles.find((profile) => profile.agentTargetId === agent?.agentTargetId);
    if (matched) return matched.id;
  }

  return input.agents === undefined ? profiles[0]?.id ?? "" : "";
}

export function isAvailableLocalAgentRuntimeProfileId(
  profileId: string | null | undefined,
  profiles: LocalAgentRuntimeProfileLike[],
  agents: LocalAgentTargetStatusLike[],
) {
  const profile = profiles.find((candidate) => candidate.id === profileId && candidate.kind === "local-agent");
  return Boolean(profile?.agentTargetId && agents.some((agent) => agent.agentTargetId === profile.agentTargetId && agent.supported));
}

export function normalizeRuntimeProfileProviderId(provider: string | null | undefined) {
  const trimmed = provider?.trim();
  if (!trimmed) return "";
  const legacyAlias = trimmed.toLowerCase();
  return legacyAlias === "claude" || legacyAlias === "claude-code" ? "claude-code" : trimmed;
}

export function runtimeProfileIdFromAgentTarget(agentTargetId: string): { value?: string; error?: string } {
  const target = agentTargetId.trim();
  if (!target) return { error: "agent-id is required" };
  return { value: `local-agent:${target}` };
}

export function resolveAgentTargetFromCatalog(input: {
  agents: readonly LocalAgentTargetStatusLike[];
  agentTargetId?: string | null;
  legacyProvider?: string | null;
  useDefault?: boolean;
}): { value?: LocalAgentTargetStatusLike; error?: string } {
  const exact = input.agentTargetId?.trim();
  const legacyProvider = normalizeLocalAgentProviderId(input.legacyProvider);
  if (exact && legacyProvider) return { error: "provide agent-id or deprecated provider, not both" };
  if (exact) {
    const matched = input.agents.find((agent) => agent.agentTargetId === exact);
    if (!matched) return { error: `Agent Target not found: ${exact}` };
    if (!matched.supported) return { error: `Agent Target is unavailable: ${exact}` };
    return { value: matched };
  }
  if (legacyProvider) {
    const matches = input.agents.filter((agent) => localAgentProviderIdsMatch(agent.providerId, legacyProvider));
    if (matches.length !== 1) {
      return {
        error: matches.length === 0
          ? `Provider does not map to a current Agent Target: ${legacyProvider}`
          : `Provider maps to multiple Agent Targets; use agent-id: ${legacyProvider}`,
      };
    }
    if (!matches[0].supported) return { error: `Agent Target is unavailable: ${matches[0].agentTargetId}` };
    return { value: matches[0] };
  }
  if (input.useDefault !== false) {
    const fallback = input.agents.find((agent) => agent.isDefault && agent.supported)
      ?? input.agents.find((agent) => agent.supported);
    return fallback ? { value: fallback } : { error: "No available Agent Target" };
  }
  return { error: "agent-id is required" };
}

export function displayNameForLocalAgentProvider(provider: string, fallback?: string | null) {
  const trimmed = fallback?.trim();
  if (trimmed) return trimmed;
  const normalized = normalizeRuntimeProfileProviderId(provider);
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
  catalog?: Partial<Pick<LocalAgentTargetStatus, "defaultModelId" | "models">>,
) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  const modelId = catalog?.defaultModelId?.trim() || catalog?.models?.[0]?.id?.trim();
  return modelId ? `${profileProvider}:${modelId}` : `${profileProvider}:default`;
}

export function stripRuntimeProfileModelPrefix(model: string, provider: string) {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  const prefix = `${profileProvider}:`;
  if (profileProvider === "claude-code" && model.startsWith("claude:")) return model.slice("claude:".length);
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
  agentTargetId: string,
  provider: string,
  displayName?: string | null,
  catalog?: Partial<Pick<LocalAgentTargetStatus, "defaultModelId" | "models">>,
): RuntimeProfileSeed {
  const profileProvider = normalizeRuntimeProfileProviderId(provider);
  return {
    id: `local-agent:${agentTargetId}`,
    kind: "local-agent",
    agentTargetId,
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
  agentTargetId?: string | null;
  provider?: string | null;
};

export type AgentMenuTargetLike = {
  agentTargetId: string;
  providerId: string;
  displayName?: string | null;
  provider: string;
};

export function resolveAgentMenuProfiles(
  agentProfiles: AgentMenuProfileLike[],
  agentTargets: AgentMenuTargetLike[],
): AgentMenuProfileLike[] {
  if (agentTargets.length === 0) return agentProfiles.filter((profile) => profile.kind !== "local-agent");

  const profilesByTarget = new Map<string, AgentMenuProfileLike>();
  for (const profile of agentProfiles) {
    if (profile.kind !== "local-agent" || !profile.agentTargetId) continue;
    profilesByTarget.set(profile.agentTargetId, profile);
  }

  return agentTargets.map((agent) => {
    const existing = profilesByTarget.get(agent.agentTargetId);
    if (existing) return existing;
    const seed = localAgentRuntimeProfileSeed(agent.agentTargetId, agent.providerId, agent.displayName);
    return {
      id: seed.id,
      kind: seed.kind,
      agentTargetId: seed.agentTargetId,
      provider: seed.provider,
      displayName: seed.displayName,
    };
  });
}

export function mergeLocalAgentRuntimeProfiles<TProfile extends RuntimeProfileSeed & { createdAt?: string; updatedAt?: string }>(
  existing: TProfile[],
  agents: readonly AgentMenuTargetLike[],
): TProfile[] {
  const now = new Date().toISOString();
  const merged = new Map(existing
    .filter((profile) => profile.kind === "local-agent" && profile.agentTargetId)
    .map((profile) => [profile.id, profile]));
  for (const agent of agents) {
    const seed = localAgentRuntimeProfileSeed(agent.agentTargetId, agent.providerId, agent.displayName);
    if (merged.has(seed.id)) continue;
    merged.set(seed.id, {
      ...seed,
      createdAt: now,
      updatedAt: now,
    } as TProfile);
  }
  return [...merged.values(), ...existing.filter((profile) => profile.kind !== "local-agent")];
}
