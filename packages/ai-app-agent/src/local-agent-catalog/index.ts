import {
  isAvailableLocalAgentRuntimeProfileId,
  resolvePreferredLocalAgentRuntimeProfileId,
} from "@ai-app/shared/agent-providers";
import type {
  LocalAgentCatalogResponse,
  LocalAgentCatalogSnapshot,
  LocalAgentTargetStatus,
  RuntimeProfile,
} from "@ai-app/shared/types";

export type LocalAgentCatalogServiceOptions = {
  load: (refresh: boolean) => Promise<LocalAgentTargetStatus[]>;
  commit: (input: {
    agents: LocalAgentTargetStatus[];
    selectedRuntimeProfileId: string;
    observedAt: string;
  }) => LocalAgentCatalogSnapshot | Promise<LocalAgentCatalogSnapshot>;
  persistSelection?: (profileId: string) => LocalAgentCatalogSnapshot | Promise<LocalAgentCatalogSnapshot>;
  now?: () => Date;
};

export type LocalAgentCatalogStore = {
  readLocalAgentCatalogSnapshot(): LocalAgentCatalogSnapshot;
  persistLocalAgentCatalog(input: {
    agents: LocalAgentTargetStatus[];
    selectedRuntimeProfileId?: string;
    observedAt: string;
  }): LocalAgentCatalogSnapshot;
  persistSelectedLocalAgentRuntimeProfile(profileId: string): LocalAgentCatalogSnapshot;
  get(profileId: string | null | undefined): RuntimeProfile;
  list(): RuntimeProfile[];
};

export class LocalAgentCatalogService {
  private snapshot: LocalAgentCatalogSnapshot = emptyCatalogSnapshot();
  private loaded = false;
  private inFlight: Promise<LocalAgentCatalogSnapshot> | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: LocalAgentCatalogServiceOptions) {}

  bootstrap(snapshot: LocalAgentCatalogSnapshot) {
    this.snapshot = cloneSnapshot(snapshot);
    this.loaded = false;
    this.notify();
    return this.getSnapshot();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getSnapshot() {
    return cloneSnapshot(this.snapshot);
  }

  ensureLoaded() {
    return this.load(false);
  }

  refresh() {
    return this.load(true);
  }

  async select(profileId: string) {
    if (!this.options.persistSelection) return this.getSnapshot();
    const persisted = await this.options.persistSelection(profileId);
    this.snapshot = { ...this.snapshot, selectedRuntimeProfileId: persisted.selectedRuntimeProfileId };
    this.notify();
    return this.getSnapshot();
  }

  private load(force: boolean): Promise<LocalAgentCatalogSnapshot> {
    if (!force && this.loaded) return Promise.resolve(this.getSnapshot());
    if (this.inFlight) return this.inFlight;

    const request = this.performLoad(force).finally(() => {
      if (this.inFlight === request) this.inFlight = null;
    });
    this.inFlight = request;
    return request;
  }

  private async performLoad(force: boolean) {
    try {
      const loadedAgents = cloneAgents(await this.options.load(force));
      if (loadedAgents.length === 0) throw new Error("Local Agent catalog is empty");
      const agents = preserveKnownModels(loadedAgents, this.snapshot.agents);
      const hasSupportedTarget = agents.some((agent) => agent.supported);
      if (!hasSupportedTarget && this.snapshot.agents.some((agent) => agent.supported)) {
        throw new Error("Local Agent catalog refresh returned no supported target");
      }
      this.loaded = true;
      if (!hasSupportedTarget) {
        this.snapshot = {
          agents,
          selectedRuntimeProfileId: "",
          observedAt: this.nowISO(),
          source: "live",
          stale: false,
          error: null,
        };
      } else {
        this.snapshot = cloneSnapshot(await this.options.commit({
          agents,
          selectedRuntimeProfileId: this.snapshot.selectedRuntimeProfileId,
          observedAt: this.nowISO(),
        }));
      }
      this.notify();
      return this.getSnapshot();
    } catch (error) {
      this.loaded = this.snapshot.agents.length > 0;
      const message = error instanceof Error ? error.message : "Local Agent catalog request failed";
      if (this.snapshot.agents.length > 0) {
        this.snapshot = { ...this.snapshot, source: "stale", stale: true, error: message };
        this.notify();
        return this.getSnapshot();
      }
      this.snapshot = { ...this.snapshot, stale: true, error: message };
      this.notify();
      throw error;
    }
  }

  private nowISO() {
    return (this.options.now?.() ?? new Date()).toISOString();
  }

  private notify() {
    for (const listener of this.listeners) listener();
  }
}

export class ArtifactLocalAgentCatalog {
  private readonly service: LocalAgentCatalogService;

  constructor(private readonly options: {
    store: LocalAgentCatalogStore;
    load: (refresh: boolean) => Promise<LocalAgentTargetStatus[]>;
  }) {
    this.service = new LocalAgentCatalogService({
      load: options.load,
      commit: (input) => options.store.persistLocalAgentCatalog(input),
      persistSelection: (profileId) => options.store.persistSelectedLocalAgentRuntimeProfile(profileId),
    });
    this.service.bootstrap(options.store.readLocalAgentCatalogSnapshot());
  }

  getResponse() {
    return this.response(this.service.getSnapshot());
  }

  async list(refresh = false) {
    const snapshot = refresh ? await this.service.refresh() : await this.service.ensureLoaded();
    return this.response(snapshot);
  }

  async select(profileId: string) {
    return this.response(await this.service.select(profileId));
  }

  async resolveRuntimeProfile(profileId: string | null | undefined) {
    if (profileId) {
      const existing = this.options.store.get(profileId);
      if (existing.id === profileId && existing.kind !== "local-agent") return existing;
      const { agents } = await this.list();
      const synced = this.options.store.get(profileId);
      if (synced.id !== profileId) throw new Error(`Runtime profile not found: ${profileId}`);
      if (!synced.agentTargetId || !agents.some((agent) => agent.agentTargetId === synced.agentTargetId && agent.supported)) {
        throw new Error(`Agent Target is unavailable: ${synced.agentTargetId ?? profileId}`);
      }
      return synced;
    }
    const { agents } = await this.list();
    const profiles = this.options.store.list();
    const preferredProfileId = resolvePreferredLocalAgentRuntimeProfileId({ profiles, agents });
    if (!preferredProfileId) throw new Error("No available Agent Target");
    return this.options.store.get(preferredProfileId);
  }

  private response(snapshot: LocalAgentCatalogSnapshot): LocalAgentCatalogResponse {
    return { ...snapshot, runtimeProfiles: this.options.store.list() };
  }
}

export function applyLocalAgentCatalogResponse(input: {
  currentProfiles: RuntimeProfile[];
  currentSelectedRuntimeProfileId: string;
  response: LocalAgentCatalogResponse;
}) {
  const runtimeProfiles = input.response.runtimeProfiles;
  const agents = input.response.agents;
  const currentSelection = input.currentSelectedRuntimeProfileId;
  const persistedSelection = input.response.selectedRuntimeProfileId;
  const selectedRuntimeProfileId = isAvailableLocalAgentRuntimeProfileId(
    currentSelection,
    runtimeProfiles,
    agents,
  )
    ? currentSelection
    : isAvailableLocalAgentRuntimeProfileId(persistedSelection, runtimeProfiles, agents)
      ? persistedSelection
      : resolvePreferredLocalAgentRuntimeProfileId({ profiles: runtimeProfiles, agents });
  const previous = input.currentProfiles.find((profile) => profile.id === currentSelection);
  const selected = runtimeProfiles.find((profile) => profile.id === selectedRuntimeProfileId);
  const selectionChanged = Boolean(currentSelection && selectedRuntimeProfileId !== currentSelection);
  const modelChanged = Boolean(
    previous && selected && previous.id === selected.id && previous.model !== selected.model,
  );
  return {
    agents: cloneAgents(agents),
    runtimeProfiles: runtimeProfiles.map((profile) => ({ ...profile, capabilities: { ...profile.capabilities } })),
    selectedRuntimeProfileId,
    notice: selectionChanged
      ? `The selected Agent is unavailable. Switched to ${selected?.displayName ?? "the next available Agent"}.`
      : modelChanged
        ? `The selected model is unavailable. Switched to ${selected?.model ?? "the provider default"}.`
        : null,
  };
}

function emptyCatalogSnapshot(): LocalAgentCatalogSnapshot {
  return {
    agents: [],
    selectedRuntimeProfileId: "",
    observedAt: null,
    source: "seed",
    stale: true,
    error: null,
  };
}

function preserveKnownModels(
  agents: LocalAgentTargetStatus[],
  previous: LocalAgentTargetStatus[],
) {
  const previousByTarget = new Map(previous.map((agent) => [agent.agentTargetId, agent]));
  return agents.map((agent) => {
    const cached = previousByTarget.get(agent.agentTargetId);
    if (agent.models.length > 0 || !cached?.models.length) return agent;
    return {
      ...agent,
      models: cached.models.map((model) => ({ ...model })),
      ...(cached.defaultModelId ? { defaultModelId: cached.defaultModelId } : {}),
    };
  });
}

function cloneSnapshot(snapshot: LocalAgentCatalogSnapshot): LocalAgentCatalogSnapshot {
  return { ...snapshot, agents: cloneAgents(snapshot.agents) };
}

function cloneAgents(agents: LocalAgentTargetStatus[]) {
  return agents.map((agent) => ({
    agentTargetId: agent.agentTargetId,
    providerId: agent.providerId,
    provider: agent.provider,
    displayName: agent.displayName,
    supported: agent.supported,
    authState: agent.authState,
    models: agent.models.map((model) => ({ id: model.id, label: model.label })),
    ...(agent.defaultModelId ? { defaultModelId: agent.defaultModelId } : {}),
    ...(agent.isDefault ? { isDefault: true as const } : {}),
    ...(agent.reason ? { reason: agent.reason } : {}),
  }));
}
