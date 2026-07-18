import type { DatabaseSync } from "node:sqlite";

export type AgentContextPreparationState = "pending" | "preparing" | "ready" | "failed";

export interface ProjectPreparationFailure {
  phase: string;
  path: string;
  code: string;
  message: string;
}

export interface ProjectPreparationRetryOptions<T> {
  phase: string;
  path: string;
  work: () => Promise<T>;
  retryDelaysMs?: readonly number[];
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}

export class ProjectPreparationError extends Error implements ProjectPreparationFailure {
  readonly phase: string;
  readonly path: string;
  readonly code: string;

  constructor(input: ProjectPreparationFailure & { cause?: unknown }) {
    super(input.message, { cause: input.cause });
    this.name = "ProjectPreparationError";
    this.phase = input.phase;
    this.path = input.path;
    this.code = input.code;
  }
}

export interface AgentContextPreparationStore {
  read(projectId: string): Promise<{ state: AgentContextPreparationState; version: string | null } | null> | { state: AgentContextPreparationState; version: string | null } | null;
  markPreparing(projectId: string, version: string): Promise<void> | void;
  markReady(projectId: string, version: string): Promise<void> | void;
  markFailed(projectId: string, version: string, failure: ProjectPreparationFailure): Promise<void> | void;
}

export interface AgentContextPreparationRequest {
  projectId: string;
  version: string;
  prepare: () => Promise<void>;
}

export class AgentContextPreparationCoordinator {
  private readonly jobs = new Map<string, { version: string; promise: Promise<void> }>();

  constructor(
    private readonly store: AgentContextPreparationStore,
    private readonly options: {
      retryDelaysMs?: readonly number[];
      sleep?: (delayMs: number) => Promise<void>;
    } = {},
  ) {}

  ensure(request: AgentContextPreparationRequest): Promise<void> {
    const existing = this.jobs.get(request.projectId);
    if (existing) {
      if (existing.version === request.version) return existing.promise;
      return existing.promise.catch(() => undefined).then(() => this.ensure(request));
    }
    const promise = this.run(request).finally(() => {
      if (this.jobs.get(request.projectId)?.promise === promise) this.jobs.delete(request.projectId);
    });
    this.jobs.set(request.projectId, { version: request.version, promise });
    return promise;
  }

  private async run(request: AgentContextPreparationRequest) {
    const current = await this.store.read(request.projectId);
    if (current?.state === "ready" && current.version === request.version) return;
    await this.store.markPreparing(request.projectId, request.version);
    const retryDelays = this.options.retryDelaysMs ?? [100, 250, 500];
    for (let attempt = 0; ; attempt += 1) {
      try {
        await request.prepare();
        await this.store.markReady(request.projectId, request.version);
        return;
      } catch (error) {
        const failure = asProjectPreparationError(error, "agent_context", "");
        if (!isTransientProjectPreparationError(failure) || attempt >= retryDelays.length) {
          await this.store.markFailed(request.projectId, request.version, failure);
          throw failure;
        }
        await (this.options.sleep ?? defaultSleep)(retryDelays[attempt] ?? 0);
      }
    }
  }
}

export class SqliteProjectPreparationCoordinator {
  private readonly agentContext: AgentContextPreparationCoordinator;

  constructor(
    private readonly getDb: () => DatabaseSync,
    private readonly appId: string,
  ) {
    this.agentContext = new AgentContextPreparationCoordinator({
      read: (projectId) => {
        const row = this.getDb().prepare(
          `SELECT agent_context_state, agent_context_version FROM project_preparation WHERE project_id = ?`,
        ).get(projectId) as { agent_context_state: AgentContextPreparationState; agent_context_version: string | null } | undefined;
        return row ? { state: row.agent_context_state, version: row.agent_context_version } : null;
      },
      markPreparing: (projectId, version) => this.updateAgentContext(projectId, "preparing", version),
      markReady: (projectId, version) => this.updateAgentContext(projectId, "ready", version),
      markFailed: (projectId, version, failure) => this.updateAgentContext(projectId, "failed", version, failure),
    });
  }

  getStatus(projectId: string) {
    const row = this.getDb().prepare(
      `SELECT core_state, agent_context_state, agent_context_version,
              last_error_phase, last_error_path, last_error_code, last_error_message
       FROM project_preparation WHERE project_id = ?`,
    ).get(projectId) as {
      core_state: "pending" | "preparing" | "ready" | "failed";
      agent_context_state: AgentContextPreparationState;
      agent_context_version: string | null;
      last_error_phase: string | null;
      last_error_path: string | null;
      last_error_code: string | null;
      last_error_message: string | null;
    } | undefined;
    return row ? {
      coreState: row.core_state,
      agentContextState: row.agent_context_state,
      agentContextVersion: row.agent_context_version,
      lastError: row.last_error_message
        ? { phase: row.last_error_phase, path: row.last_error_path, code: row.last_error_code, message: row.last_error_message }
        : null,
    } : null;
  }

  markCore(projectId: string, state: "preparing" | "ready" | "failed", failure?: ProjectPreparationFailure) {
    this.getDb().prepare(
      `UPDATE project_preparation
       SET core_state = ?, last_error_phase = ?, last_error_path = ?,
           last_error_code = ?, last_error_message = ?, updated_at = ?
       WHERE project_id = ?`,
    ).run(state, failure?.phase ?? null, failure?.path ?? null, failure?.code ?? null, failure?.message ?? null, new Date().toISOString(), projectId);
  }

  ensureCoreReady(projectId: string) {
    const status = this.getStatus(projectId);
    if (status?.coreState === "ready") return;
    throw new ProjectPreparationError({
      phase: "core_readiness",
      path: "",
      code: status?.coreState === "failed" ? "CORE_PREPARATION_FAILED" : "CORE_NOT_READY",
      message: "Project core is not ready for an agent run.",
    });
  }

  invalidateAgentContext(projectId: string) {
    this.getDb().prepare(
      `UPDATE project_preparation
       SET agent_context_generation = agent_context_generation + 1,
           agent_context_state = 'pending', agent_context_version = NULL,
           last_error_phase = NULL, last_error_path = NULL, last_error_code = NULL,
           last_error_message = NULL, updated_at = ?
       WHERE project_id = ?`,
    ).run(new Date().toISOString(), projectId);
  }

  ensureAgentContext(input: { projectId: string; baseVersion: string; prepare: () => Promise<void> }) {
    this.ensureCoreReady(input.projectId);
    return this.agentContext.ensure({
      projectId: input.projectId,
      version: `${input.baseVersion}:${this.agentContextGeneration(input.projectId)}`,
      prepare: input.prepare,
    });
  }

  startAgentContext(input: { projectId: string; baseVersion: string; fallbackPath: string; prepare: () => Promise<void> }) {
    void Promise.resolve().then(() => this.ensureAgentContext(input)).catch((error) => {
      const failure = asProjectPreparationError(error, "agent_context", input.fallbackPath);
      console.warn(`[${this.appId}] ${JSON.stringify({
        event: "project_agent_context_failed",
        projectId: input.projectId,
        phase: failure.phase,
        code: failure.code,
      })}`);
    });
  }

  private agentContextGeneration(projectId: string) {
    const row = this.getDb().prepare(
      `SELECT agent_context_generation FROM project_preparation WHERE project_id = ?`,
    ).get(projectId) as { agent_context_generation: number } | undefined;
    return row?.agent_context_generation ?? 0;
  }

  private updateAgentContext(projectId: string, state: "preparing" | "ready" | "failed", version: string, failure?: ProjectPreparationFailure) {
    this.getDb().prepare(
      `UPDATE project_preparation
       SET agent_context_state = ?, agent_context_version = ?,
           last_error_phase = ?, last_error_path = ?, last_error_code = ?,
           last_error_message = ?, updated_at = ?
       WHERE project_id = ?`,
    ).run(state, version, failure?.phase ?? null, failure?.path ?? null, failure?.code ?? null, failure?.message ?? null, new Date().toISOString(), projectId);
  }
}

export async function withProjectPreparationPhase<T>(phase: string, path: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw asProjectPreparationError(error, phase, path);
  }
}

export function asProjectPreparationError(error: unknown, phase: string, path: string) {
  if (error instanceof ProjectPreparationError) return error;
  const nodeError = error as NodeJS.ErrnoException;
  return new ProjectPreparationError({
    phase,
    path,
    code: typeof nodeError?.code === "string" ? nodeError.code : "PREPARATION_FAILED",
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}

export function isTransientProjectPreparationError(error: ProjectPreparationFailure) {
  return new Set(["ESTALE", "EIO", "EBUSY", "ETIMEDOUT"]).has(error.code);
}

/**
 * Retries only operations which are safe to repeat. Callers must make `work`
 * idempotent (for example by writing missing files and validating the final
 * state) so a retry repairs a partial FabricFS operation instead of replacing
 * a completed artifact.
 */
export async function retryProjectPreparationOperation<T>(
  options: ProjectPreparationRetryOptions<T>,
): Promise<T> {
  const retryDelays = options.retryDelaysMs ?? [100, 250, 500];
  const sleep = options.sleep ?? defaultSleep;
  const random = options.random ?? Math.random;
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await options.work();
    } catch (error) {
      const failure = asProjectPreparationError(error, options.phase, options.path);
      if (!isTransientProjectPreparationError(failure) || attempt >= retryDelays.length) {
        throw failure;
      }
      const baseDelay = retryDelays[attempt] ?? 0;
      const jitterMs = Math.floor(Math.max(0, random()) * Math.min(50, Math.max(1, baseDelay / 4)));
      await sleep(baseDelay + jitterMs);
    }
  }
}

function defaultSleep(delayMs: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, delayMs));
}
