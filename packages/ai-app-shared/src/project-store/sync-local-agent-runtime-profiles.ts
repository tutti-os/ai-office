import type { DatabaseSync } from "node:sqlite";
import {
  isPlaceholderRuntimeProfileModel,
  localAgentProviderIdsMatch,
  localAgentRuntimeProfileSeed,
  normalizeRuntimeProfileProviderId,
  runtimeProfileModelForProvider,
  stripRuntimeProfileModelPrefix,
} from "../agent-providers/index.js";
import type { LocalAgentTargetStatus, RuntimeProfile } from "../types/index.js";

type SyncAgent = Pick<
  LocalAgentTargetStatus,
  "agentTargetId" | "providerId" | "displayName" | "supported"
> & Partial<Pick<LocalAgentTargetStatus, "defaultModelId" | "models">>;

export function syncLocalAgentRuntimeProfiles(input: {
  database: DatabaseSync;
  tableName: string;
  existingProfiles: RuntimeProfile[];
  agents: readonly SyncAgent[];
}) {
  const now = new Date().toISOString();
  const allowedLocalAgentIds = new Set<string>();
  const supportedAgentTargetIds = new Set(
    input.agents.filter((candidate) => candidate.supported).map((candidate) => candidate.agentTargetId),
  );
  for (const agent of input.agents.filter((candidate) => candidate.supported)) {
    const seed = localAgentRuntimeProfileSeed(agent.agentTargetId, agent.providerId, agent.displayName, agent);
    allowedLocalAgentIds.add(seed.id);
    const exactTargetMatches = input.existingProfiles.filter(
      (profile) => profile.kind === "local-agent" && profile.agentTargetId === agent.agentTargetId,
    );
    const existing = exactTargetMatches.find((profile) => profile.id === seed.id);
    const sameProviderTargets = input.agents.filter(
      (candidate) => localAgentProviderIdsMatch(candidate.providerId, agent.providerId),
    );
    const legacyMatches = input.existingProfiles.filter(
      (profile) =>
        profile.kind === "local-agent" &&
        !profile.agentTargetId &&
        localAgentProviderIdsMatch(profile.provider, agent.providerId),
    );
    const migrationSource = exactTargetMatches.length === 1
      ? exactTargetMatches[0]
      : sameProviderTargets.length === 1 && legacyMatches.length === 1
        ? legacyMatches[0]
        : null;
    if (!existing) {
      const migratedModel = migrationSource
        ? normalizeRuntimeProfileProviderId(migrationSource.provider) === seed.provider
          ? migrationSource.model
          : `${seed.provider}:${stripRuntimeProfileModelPrefix(migrationSource.model, migrationSource.provider)}`
        : seed.model;
      input.database
        .prepare(
          `INSERT INTO ${input.tableName} (id, kind, agent_target_id, provider, model, display_name, enabled, capabilities, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(seed.id, seed.kind, seed.agentTargetId, seed.provider, migratedModel, seed.displayName, seed.enabled ? 1 : 0, JSON.stringify(seed.capabilities), now, now);
      continue;
    }
    const providerChanged = normalizeRuntimeProfileProviderId(existing.provider) !== seed.provider;
    const availableModelIds = new Set((agent.models ?? []).map((candidate) => candidate.id));
    const selectedModelId = stripRuntimeProfileModelPrefix(existing.model, existing.provider);
    const selectedModelRemoved = availableModelIds.size > 0 && !availableModelIds.has(selectedModelId);
    const model = providerChanged
      ? seed.model
      : isPlaceholderRuntimeProfileModel(existing.model, agent.providerId) || selectedModelRemoved
        ? runtimeProfileModelForProvider(agent.providerId, agent)
        : existing.model;
    input.database
      .prepare(
        `UPDATE ${input.tableName}
         SET agent_target_id = ?, provider = ?, model = ?, display_name = ?, enabled = ?, capabilities = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(seed.agentTargetId, seed.provider, model, seed.displayName, seed.enabled ? 1 : 0, JSON.stringify(seed.capabilities), now, seed.id);
  }
  for (const profile of input.existingProfiles) {
    if (profile.kind !== "local-agent" || allowedLocalAgentIds.has(profile.id)) continue;
    if (profile.agentTargetId && !supportedAgentTargetIds.has(profile.agentTargetId)) continue;
    input.database.prepare(`DELETE FROM ${input.tableName} WHERE id = ?`).run(profile.id);
  }
}
