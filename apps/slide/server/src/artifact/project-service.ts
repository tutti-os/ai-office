import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { AiEditRequest, CreateProjectRequest, RuntimeProfile, UpdateDeckSlideHtmlRequest, UpdateProjectRequest } from "@ai-slide/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { createRuntimeProviderRegistry } from "../runtimes/runtime-registry.js";
import { RuntimeProviderUnsupportedError, type RuntimeStreamEvent, type SlideRuntimeProject } from "../runtimes/runtime-provider.js";
import { requireOfficeCli } from "../toolchains/officecli.js";
import { EventHub } from "../ws/event-hub.js";
import { ProjectRepository } from "./project-repository.js";

export class ProjectService {
  private readonly runtimes = createRuntimeProviderRegistry();
  private readonly cancelledRunIds = new Set<string>();

  constructor(
    private readonly repo: ProjectRepository,
    private readonly events: EventHub,
  ) {}

  bootstrap() {
    return this.repo.snapshot();
  }

  interruptActiveRuns(reason = "Interrupted by server restart") {
    return this.repo.interruptActiveRuns(reason);
  }

  listProjects() {
    return { projects: this.repo.listProjects() };
  }

  clearProjectHistory() {
    return this.repo.clearProjectHistory();
  }

  async createProject(input: CreateProjectRequest) {
    if (input.artifactType === "pptx") await requireOfficeCli();
    const result = this.repo.createProject(input);
    this.events.emit({ type: "project.created", projectId: result.project.id, payload: result });
    return result;
  }

  async importPptxProject(input: { path?: string; title?: string }) {
    if (!input.path?.trim()) throw new Error("PPTX path is required");
    const imported = await this.repo.importPptxProjectFromFile({
      sourcePath: input.path,
      title: input.title,
    });
    return {
      project: imported.project,
      artifact: imported.artifact,
      deckManifest: null,
      pptxManifest: imported.pptxManifest,
    };
  }

  async getProject(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    this.repo.ensureTemplateDeckMaterialized(project, artifact);
    return {
      project,
      artifact,
      deckManifest: await this.repo.readDeckManifest(project.id, artifact),
      pptxManifest: await this.repo.readPptxManifest(project.id, artifact),
    };
  }

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const project = this.repo.updateProject(projectId, input);
    if (!project) return null;
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    const result = { project, artifact };
    this.events.emit({ type: "project.updated", projectId, payload: result });
    return result;
  }

  readDeckSlideHtml(projectId: string, slideId: string) {
    return this.repo.readDeckSlideHtml(projectId, slideId);
  }

  writeDeckSlideHtml(projectId: string, slideId: string, input: UpdateDeckSlideHtmlRequest) {
    if (typeof input.html !== "string" || !input.html.trim()) throw new Error("Slide HTML is required");
    return this.repo.writeDeckSlideHtml(projectId, slideId, input.html);
  }

  readPptxFile(projectId: string) {
    return this.repo.readPptxFile(projectId);
  }

  listProjectRuns(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return {
      runs: this.repo.listProjectRuns(projectId).map((run) => ({
        run,
        events: this.repo.listRunEvents(run.id),
      })),
    };
  }

  async startAiEdit(projectId: string, request: AiEditRequest) {
    const runtimeProject = await this.createRuntimeProject(projectId);
    if (runtimeProject.artifact.type === "pptx") await requireOfficeCli();
    this.repo.syncProjectAgentInstructions(projectId);
    const runtimeProfile = runtimeProfileFromId(request.runtimeProfileId);
    const provider = this.runtimes.getProvider(runtimeProfile);
    const descriptor = provider.describeRun(runtimeProfile);
    const run = this.repo.createRun({
      projectId,
      runtime: descriptor.runtime,
      provider: descriptor.provider,
      model: descriptor.model,
      mode: request.mode,
      instruction: request.userPrompt,
      selectionType: request.selectionType ?? "write",
      selectionPath: request.selectionPath ?? "",
      selectedText: request.selectedText ?? "",
      selectedHtml: request.selectedHtml ?? "",
    });
    this.events.emit({ type: "run.accepted", projectId, runId: run.id, payload: { run } });
    void this.executeRun(runtimeProject, runtimeProfile, request, run.id);
    return { run };
  }

  async listLocalAgentProviders() {
    return { providers: await this.runtimes.listLocalAgentProviders() };
  }

  async cancelRun(runId: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    if (!["accepted", "running"].includes(run.status)) return { run };
    this.cancelledRunIds.add(runId);
    await this.runtimes.getProvider(runtimeProfileFromRun(run)).cancel(runId).catch(() => undefined);
    return this.finalizeCancellation(runId, "Cancelled by user");
  }

  private async executeRun(
    runtimeProject: SlideRuntimeProject,
    runtimeProfile: RuntimeProfile,
    request: AiEditRequest,
    runId: string,
  ) {
    const run = this.repo.getRun(runId);
    if (!run) return;
    const provider = this.runtimes.getProvider(runtimeProfile);
    let sortOrder = 0;
    let generatedText = "";
    let refreshedArtifact = false;
    let workspaceFingerprint = "";

    const createRunEvent = (
      type: RuntimeStreamEvent["type"] extends infer T ? Extract<T, string> : never,
      input: { content?: string; status?: "pending" | "streaming" | "success" | "error"; metadata?: Record<string, unknown> | null } = {},
    ) => {
      const eventType =
        type === "text_delta"
          ? "text_delta"
          : type === "thinking_delta"
          ? "thinking_delta"
          : type === "tool_call"
            ? "tool_call"
            : type === "tool_result"
              ? "tool_result"
              : type;
      const event = this.repo.createRunEvent({
        runId,
        projectId: runtimeProject.id,
        type: eventType as any,
        content: input.content,
        status: input.status,
        metadata: input.metadata,
        sortOrder: sortOrder++,
      });
      this.events.emit({ type: "run.event.created", projectId: runtimeProject.id, runId, payload: { event } });
      return event;
    };

    try {
      workspaceFingerprint = await this.workspaceFingerprint(runtimeProject.id);
      this.repo.updateRun(runId, { status: "running" });
      this.events.emit({ type: "run.started", projectId: runtimeProject.id, runId, payload: { run: this.repo.getRun(runId) } });

      const readiness = await provider.detect(runtimeProfile);
      if (!readiness.available) throw new RuntimeProviderUnsupportedError(readiness.reason ?? "Runtime provider is unavailable");

      for await (const rawEvent of provider.streamEdit({
        run,
        project: runtimeProject,
        runtimeProfile,
        request,
      })) {
        if (this.cancelledRunIds.has(runId)) {
          await this.finalizeCancellation(runId, "Cancelled by user");
          return;
        }
        const event = typeof rawEvent === "string" ? ({ type: "text_delta", text: rawEvent } as const) : rawEvent;
        if (event.type === "text_delta") {
          generatedText += event.text;
          createRunEvent(event.type, { content: event.text, status: "streaming" });
          continue;
        }
        if (event.type === "thinking_delta") {
          createRunEvent(event.type, { content: event.text, status: "streaming" });
        } else if (event.type === "tool_call") {
          createRunEvent(event.type, {
            content: `Calling ${event.name}`,
            status: "streaming",
            metadata: { toolCallId: event.id, toolName: event.name, input: event.input ?? null },
          });
        } else if (event.type === "tool_result") {
          createRunEvent(event.type, {
            content: event.error ?? event.summary ?? previewJson(event.output) ?? "Tool completed",
            status: event.isError || event.status === "failed" ? "error" : "success",
            metadata: { toolCallId: event.id, toolName: event.name ?? null, output: event.output ?? null },
          });
          const refresh = await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
          workspaceFingerprint = refresh.fingerprint;
          refreshedArtifact = refresh.changed || refreshedArtifact;
        } else if (event.type === "file_write") {
          createRunEvent(event.type, { content: `Wrote file: ${event.path}`, metadata: { path: event.path } });
          const refresh = await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
          workspaceFingerprint = refresh.fingerprint;
          refreshedArtifact = refresh.changed || refreshedArtifact;
        } else if (event.type === "status") {
          createRunEvent(event.type, { content: event.message ?? event.status ?? "", metadata: { status: event.status ?? null } });
        } else if (event.type === "stderr" && event.text.trim()) {
          createRunEvent(event.type, { content: event.text.trim(), status: "error" });
        }
      }

      if (this.cancelledRunIds.has(runId)) {
        await this.finalizeCancellation(runId, "Cancelled by user");
        return;
      }

      if (!refreshedArtifact) await this.refreshArtifactFromWorkspace(runtimeProject.id, runId, workspaceFingerprint);
      const detail = await this.getProject(runtimeProject.id);
      const finalRun = this.repo.updateRun(runId, {
        status: "completed",
        resultPreview: previewText(generatedText || runPreview(detail.artifact.type, detail.pptxManifest)),
      });
      this.events.emit({ type: "run.completed", projectId: runtimeProject.id, runId, payload: { run: finalRun } });
    } catch (error) {
      if (this.cancelledRunIds.has(runId)) {
        await this.finalizeCancellation(runId, "Cancelled by user");
        return;
      }
      const message = error instanceof Error ? error.message : "AI edit failed";
      const event = this.repo.createRunEvent({
        runId,
        projectId: runtimeProject.id,
        type: "error",
        content: message,
        status: "error",
        sortOrder: sortOrder++,
      });
      this.events.emit({ type: "run.event.created", projectId: runtimeProject.id, runId, payload: { event } });
      const finalRun = this.repo.updateRun(runId, { status: "failed", error: message });
      this.events.emit({ type: "run.failed", projectId: runtimeProject.id, runId, payload: { run: finalRun } });
    } finally {
      this.cancelledRunIds.delete(runId);
    }
  }

  private async createRuntimeProject(projectId: string): Promise<SlideRuntimeProject> {
    const detail = await this.getProject(projectId);
    return {
      ...detail.project,
      artifact: detail.artifact,
      deckManifest: detail.deckManifest,
      deckSlides: await this.readDeckSlideContext(projectId, detail.deckManifest),
      pptxManifest: detail.pptxManifest,
    };
  }

  private async readDeckSlideContext(projectId: string, manifest: SlideRuntimeProject["deckManifest"]) {
    if (!manifest?.slides.length) return [];
    const slides = manifest.slides.slice(0, 30);
    return Promise.all(
      slides.map(async (slide) => {
        try {
          const result = await this.repo.readDeckSlideHtml(projectId, slide.id);
          return {
            id: slide.id,
            title: slide.title,
            file: slide.file,
            htmlPreview: previewHtmlForPrompt(result.html),
          };
        } catch {
          return {
            id: slide.id,
            title: slide.title,
            file: slide.file,
            htmlPreview: "",
          };
        }
      }),
    );
  }

  private async refreshArtifactFromWorkspace(projectId: string, runId: string | undefined, previousFingerprint: string) {
    const detail = await this.getProject(projectId);
    if (detail.artifact.type === "pptx") {
      const refresh = await this.repo.refreshPptxArtifactFromFile(projectId, "ai");
      const fingerprint = await this.workspaceFingerprint(projectId);
      if (!refresh?.changed) return { changed: false, fingerprint };
    } else {
      const fingerprint = await this.workspaceFingerprintFromDetail(detail);
      if (fingerprint === previousFingerprint) return { changed: false, fingerprint };
      this.repo.bumpArtifactRevision(detail.artifact.id, "ai");
      const updated = await this.getProject(projectId);
      this.events.emit({ type: "project.updated", projectId, runId, payload: updated });
      return { changed: true, fingerprint };
    }
    const updated = await this.getProject(projectId);
    this.events.emit({ type: "project.updated", projectId, runId, payload: updated });
    return { changed: true, fingerprint: await this.workspaceFingerprint(projectId) };
  }

  private async workspaceFingerprint(projectId: string) {
    const detail = await this.getProject(projectId);
    return this.workspaceFingerprintFromDetail(detail);
  }

  private async workspaceFingerprintFromDetail(detail: Awaited<ReturnType<ProjectService["getProject"]>>) {
    if (detail.artifact.type === "pptx") {
      const manifest = detail.pptxManifest;
      return JSON.stringify({
        type: "pptx",
        exists: Boolean(manifest?.exists),
        sha256: manifest?.sha256 ?? "",
        sizeBytes: manifest?.sizeBytes ?? 0,
      });
    }
    const deckRoot = join(projectWorkspaceRoot(detail.project.id), detail.artifact.fileRef);
    return `deck:${await hashDirectory(deckRoot)}`;
  }

  private async finalizeCancellation(runId: string, reason: string) {
    const run = this.repo.getRun(runId);
    if (!run) return null;
    const finalRun = this.repo.updateRun(runId, { status: "cancelled", error: reason }) ?? run;
    this.events.emit({ type: "run.cancelled", projectId: run.projectId, runId, payload: { run: finalRun } });
    this.cancelledRunIds.delete(runId);
    return { run: finalRun };
  }
}

async function hashDirectory(root: string) {
  const hash = createHash("sha256");
  await hashDirectoryInto(hash, root, "");
  return hash.digest("hex");
}

async function hashDirectoryInto(hash: ReturnType<typeof createHash>, root: string, relativeDir: string) {
  let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
  try {
    entries = await readdir(join(root, relativeDir), { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const relativePath = relativeDir ? join(relativeDir, entry.name) : entry.name;
    if (entry.isDirectory()) {
      await hashDirectoryInto(hash, root, relativePath);
    } else if (entry.isFile()) {
      hash.update(relativePath);
      hash.update("\0");
      hash.update(await readFile(join(root, relativePath)));
      hash.update("\0");
    }
  }
}

function runPreview(artifactType: "deck" | "pptx", manifest: { exists: boolean; sizeBytes: number } | null | undefined) {
  if (artifactType === "deck") return "Deck files updated.";
  if (!manifest?.exists) return "PPTX run completed. No slides.pptx change was detected.";
  return `PPTX preview refreshed: ${manifest.sizeBytes} bytes`;
}

function runtimeProfileFromId(profileId: string | null | undefined): RuntimeProfile {
  const now = new Date(0).toISOString();
  if (profileId === "local-agent:claude") {
    return {
      id: "local-agent:claude",
      kind: "local-agent",
      provider: "claude",
      model: "claude:default",
      displayName: "Claude Code",
      enabled: true,
      capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
      createdAt: now,
      updatedAt: now,
    };
  }
  if (profileId === "server-demo") {
    return {
      id: "server-demo",
      kind: "server-demo",
      provider: "demo",
      model: "slide-demo",
      displayName: "Demo slide editor",
      enabled: true,
      capabilities: { streaming: false, toolUse: false, reasoning: false, resume: false },
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    id: "local-agent:codex",
    kind: "local-agent",
    provider: "codex",
    model: "codex:default",
    displayName: "Codex",
    enabled: true,
    capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
    createdAt: now,
    updatedAt: now,
  };
}

function runtimeProfileFromRun(run: { runtime: string; provider: string; model: string }) {
  if (run.runtime === "server-demo") return runtimeProfileFromId("server-demo");
  if (run.provider === "claude") return runtimeProfileFromId("local-agent:claude");
  return runtimeProfileFromId("local-agent:codex");
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

function previewHtmlForPrompt(value: string) {
  const text = value.trim();
  return text.length > 5000 ? `${text.slice(0, 5000)}\n<!-- truncated -->` : text;
}
