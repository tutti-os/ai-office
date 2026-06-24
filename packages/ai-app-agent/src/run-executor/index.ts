import type { BaseAiEditRequest, BaseRun, BaseRunEvent, RuntimeProfile } from "@ai-app/shared/types";
import type { RuntimeConversationMessage, RuntimeProviderRegistry, RuntimeStreamEvent } from "@ai-app/agent/runtime";

export type RunEventInput<TEvent extends BaseRunEvent> = {
  runId: string;
  projectId: string;
  type: TEvent["type"];
  content?: string;
  status?: TEvent["status"];
  metadata?: Record<string, unknown> | null;
  sortOrder: number;
};

export type RunRepository<TRun extends BaseRun, TEvent extends BaseRunEvent> = {
  getRun(runId: string): TRun | null;
  updateRun(runId: string, input: Partial<Pick<TRun, "status" | "error" | "resultPreview">>): TRun | null;
  createRunEvent(input: RunEventInput<TEvent>): TEvent;
};

export type RunEventHub<TRun extends BaseRun, TEvent extends BaseRunEvent> = {
  emit(event: {
    type: "run.started" | "run.event.created" | "run.failed";
    projectId: string;
    runId: string;
    payload: { run?: TRun | null; event?: TEvent };
  }): void;
};

export type RuntimeRunExecutorInput<
  TRun extends BaseRun,
  TEvent extends BaseRunEvent,
  TProject extends { id: string },
  TRequest extends BaseAiEditRequest,
> = {
  project: TProject;
  request: TRequest;
  runtimeProfile: RuntimeProfile;
  runId: string;
  conversation?: {
    conversationId: string;
    sessionId: string;
  };
  isCancelled: () => boolean;
  finalizeCancellation: (runId: string, reason: string) => Promise<unknown>;
  beforeRun?: () => Promise<void> | void;
  history?: RuntimeConversationMessage[];
  onWorkspaceEvent?: (event: RuntimeStreamEvent, runId: string) => Promise<void> | void;
  complete: (input: { generatedText: string; run: TRun }) => Promise<void> | void;
  onFailure?: (input: { error: string; run: TRun }) => Promise<void> | void;
  onFinally?: () => void;
};

export class RuntimeRunExecutor<
  TRun extends BaseRun,
  TEvent extends BaseRunEvent,
  TProject extends { id: string },
  TRequest extends BaseAiEditRequest,
> {
  constructor(
    private readonly input: {
      repo: RunRepository<TRun, TEvent>;
      events: RunEventHub<TRun, TEvent>;
      runtimes: RuntimeProviderRegistry<TRun, TProject, TRequest>;
    },
  ) {}

  async execute(input: RuntimeRunExecutorInput<TRun, TEvent, TProject, TRequest>) {
    const run = this.safeGetRun(input.runId);
    if (!run) return;
    const recorder = new RuntimeRunRecorder(this.input.repo, this.input.events, input.project.id, input.runId);
    let generatedText = "";

    try {
      const provider = this.input.runtimes.getProvider(input.runtimeProfile);
      await input.beforeRun?.();
      this.input.repo.updateRun(input.runId, { status: "running" } as Partial<Pick<TRun, "status" | "error" | "resultPreview">>);
      this.input.events.emit({
        type: "run.started",
        projectId: input.project.id,
        runId: input.runId,
        payload: { run: this.input.repo.getRun(input.runId) },
      });

      const readiness = await provider.detect(input.runtimeProfile);
      if (!readiness.available) throw new Error(readiness.reason ?? "Runtime provider is unavailable");

      for await (const rawEvent of provider.streamEdit({
        run,
        project: input.project,
        runtimeProfile: input.runtimeProfile,
        request: input.request,
        conversation: input.conversation,
        history: input.history,
      })) {
        if (input.isCancelled()) {
          await this.finalizeCancellation(input, "Cancelled by user");
          return;
        }
        const event = typeof rawEvent === "string" ? ({ type: "text_delta", text: rawEvent } as const) : rawEvent;
        if (event.type === "text_delta") generatedText += event.text;
        recorder.record(event);
        if (event.type === "tool_result" || event.type === "file_write") await input.onWorkspaceEvent?.(event, input.runId);
      }

      if (input.isCancelled()) {
        await this.finalizeCancellation(input, "Cancelled by user");
        return;
      }

      await input.complete({ generatedText, run });
    } catch (error) {
      if (input.isCancelled()) {
        await this.finalizeCancellation(input, "Cancelled by user");
        return;
      }
      const message = error instanceof Error ? error.message : "AI edit failed";
      const currentRun = this.safeGetRun(input.runId);
      if (!currentRun) return;
      await this.recordFailure(input, recorder, currentRun, message);
    } finally {
      try {
        input.onFinally?.();
      } catch {
        // Cleanup hooks are best-effort for background runs.
      }
    }
  }

  private safeGetRun(runId: string) {
    try {
      return this.input.repo.getRun(runId);
    } catch {
      return null;
    }
  }

  private safeUpdateRun(runId: string, input: Partial<Pick<TRun, "status" | "error" | "resultPreview">>) {
    try {
      return this.input.repo.updateRun(runId, input);
    } catch {
      return null;
    }
  }

  private safeEmit(event: Parameters<RunEventHub<TRun, TEvent>["emit"]>[0]) {
    try {
      this.input.events.emit(event);
    } catch {
      // Stream notifications are secondary to keeping the runtime process alive.
    }
  }

  private async finalizeCancellation(input: RuntimeRunExecutorInput<TRun, TEvent, TProject, TRequest>, reason: string) {
    try {
      await input.finalizeCancellation(input.runId, reason);
    } catch {
      // Cancellation can race with project deletion; either way the background run should stop quietly.
    }
  }

  private async recordFailure(
    input: RuntimeRunExecutorInput<TRun, TEvent, TProject, TRequest>,
    recorder: RuntimeRunRecorder<TRun, TEvent>,
    run: TRun,
    message: string,
  ) {
    recorder.recordError(message);
    const finalRun = this.safeUpdateRun(input.runId, { status: "failed", error: message } as Partial<
      Pick<TRun, "status" | "error" | "resultPreview">
    >);
    this.safeEmit({ type: "run.failed", projectId: input.project.id, runId: input.runId, payload: { run: finalRun } });
    try {
      await input.onFailure?.({ error: message, run });
    } catch {
      // Failure callbacks should not turn an already-failed run into an unhandled background rejection.
    }
  }
}

class RuntimeRunRecorder<TRun extends BaseRun, TEvent extends BaseRunEvent> {
  private sortOrder = 0;

  constructor(
    private readonly repo: RunRepository<TRun, TEvent>,
    private readonly events: RunEventHub<TRun, TEvent>,
    private readonly projectId: string,
    private readonly runId: string,
  ) {}

  record(event: RuntimeStreamEvent) {
    if (event.type === "text_delta") {
      this.create(event.type, { content: event.text, status: "streaming" });
    } else if (event.type === "thinking_delta") {
      this.create(event.type, { content: event.text, status: "streaming" });
    } else if (event.type === "tool_call") {
      this.create(event.type, {
        content: `Calling ${event.name}`,
        status: "streaming",
        metadata: { toolCallId: event.id, toolName: event.name, input: event.input ?? null },
      });
    } else if (event.type === "tool_result") {
      this.create(event.type, {
        content: event.error ?? event.summary ?? previewJson(event.output) ?? "Tool completed",
        status: event.isError || event.status === "failed" ? "error" : "success",
        metadata: { toolCallId: event.id, toolName: event.name ?? null, output: event.output ?? null },
      });
    } else if (event.type === "file_write") {
      this.create(event.type, { content: `Wrote file: ${event.path}`, metadata: { path: event.path } });
    } else if (event.type === "status") {
      this.create(event.type, { content: event.message ?? event.status ?? "", metadata: { status: event.status ?? null } });
    } else if (event.type === "stderr" && event.text.trim()) {
      this.create(event.type, { content: event.text.trim(), status: "error" });
    }
  }

  recordError(message: string) {
    this.create("error", { content: message, status: "error" });
  }

  private create(
    type: RuntimeStreamEvent["type"] | "error",
    input: { content?: string; status?: BaseRunEvent["status"]; metadata?: Record<string, unknown> | null } = {},
  ) {
    let event: TEvent;
    try {
      if (!this.repo.getRun(this.runId)) return null;
      event = this.repo.createRunEvent({
        runId: this.runId,
        projectId: this.projectId,
        type: type as TEvent["type"],
        content: input.content,
        status: input.status,
        metadata: input.metadata,
        sortOrder: this.sortOrder++,
      });
    } catch {
      return null;
    }
    try {
      this.events.emit({ type: "run.event.created", projectId: this.projectId, runId: this.runId, payload: { event } });
    } catch {
      // Persisting the run event succeeded; websocket stream replay can recover even if live emit fails.
    }
    return event;
  }
}

function previewJson(value: unknown) {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return previewText(value);
  try {
    return previewText(JSON.stringify(value, null, 2));
  } catch {
    return previewText(String(value));
  }
}

function previewText(value: string) {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}
