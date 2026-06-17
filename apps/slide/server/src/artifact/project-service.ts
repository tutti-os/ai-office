import type { AiEditRequest, CreateProjectRequest, RuntimeKind, UpdateDeckSlideHtmlRequest, UpdateProjectRequest } from "@ai-slide/shared";
import { ProjectRepository } from "./project-repository.js";

export class ProjectService {
  constructor(private readonly repo: ProjectRepository) {}

  bootstrap() {
    return this.repo.snapshot();
  }

  listProjects() {
    return { projects: this.repo.listProjects() };
  }

  clearProjectHistory() {
    return this.repo.clearProjectHistory();
  }

  createProject(input: CreateProjectRequest) {
    return this.repo.createProject(input);
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
    return { project, artifact };
  }

  readDeckSlideHtml(projectId: string, slideId: string) {
    return this.repo.readDeckSlideHtml(projectId, slideId);
  }

  writeDeckSlideHtml(projectId: string, slideId: string, input: UpdateDeckSlideHtmlRequest) {
    if (typeof input.html !== "string" || !input.html.trim()) throw new Error("Slide HTML is required");
    return this.repo.writeDeckSlideHtml(projectId, slideId, input.html);
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

  startAiEdit(projectId: string, request: AiEditRequest) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    const runtimeProfile = runtimeProfileFromId(request.runtimeProfileId);
    const run = this.repo.createRun({
      projectId,
      runtime: runtimeProfile.kind,
      provider: runtimeProfile.provider,
      model: runtimeProfile.model,
      mode: request.mode,
      instruction: request.userPrompt,
      selectionType: request.selectionType ?? "write",
      selectionPath: request.selectionPath ?? "",
      selectedText: request.selectedText ?? "",
      selectedHtml: request.selectedHtml ?? "",
    });

    this.repo.createRunEvent({
      runId: run.id,
      projectId,
      type: "status",
      content: "Queued",
      status: "success",
      sortOrder: 0,
    });
    this.repo.updateRun(run.id, { status: "running" });
    this.repo.createRunEvent({
      runId: run.id,
      projectId,
      type: "status",
      content: `${runtimeProfile.displayName} received the request.`,
      status: "success",
      sortOrder: 1,
    });
    this.repo.createRunEvent({
      runId: run.id,
      projectId,
      type: "tool_call",
      content: `Preparing ${artifact.type} editing context from ${artifact.fileRef}`,
      status: "success",
      metadata: { toolName: "slide_context", artifactId: artifact.id, fileRef: artifact.fileRef },
      sortOrder: 2,
    });
    const completed = this.repo.updateRun(run.id, {
      status: "completed",
      resultPreview: "Conversation captured. Slide editing execution will plug into this run timeline next.",
    });
    return { run: completed ?? run };
  }
}

function runtimeProfileFromId(profileId: string | null | undefined): {
  kind: RuntimeKind;
  provider: string;
  model: string;
  displayName: string;
} {
  if (profileId === "local-agent:claude") {
    return { kind: "local-agent", provider: "claude", model: "claude:default", displayName: "Claude Code" };
  }
  if (profileId === "server-demo") {
    return { kind: "server-demo", provider: "demo", model: "slide-demo", displayName: "Demo slide editor" };
  }
  return { kind: "local-agent", provider: "codex", model: "codex:gpt-5", displayName: "Codex" };
}
