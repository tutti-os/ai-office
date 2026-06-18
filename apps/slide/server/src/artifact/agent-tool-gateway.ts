import { AgentToolTokenStore } from "./agent-tool-tokens.js";
import { ProjectRepository } from "./project-repository.js";
import { EventHub } from "../ws/event-hub.js";

export class AgentToolGateway {
  constructor(
    private readonly repo: ProjectRepository,
    private readonly events: EventHub,
    private readonly tokens: AgentToolTokenStore,
  ) {}

  async getProject(projectId: string, credential: { token: string | null }) {
    this.tokens.verify(credential.token, { projectId });
    return this.projectDetail(projectId);
  }

  async getDeckManifest(projectId: string, credential: { token: string | null }) {
    this.tokens.verify(credential.token, { projectId });
    const { project, artifact } = this.requireDeck(projectId);
    return { manifest: await this.repo.readDeckManifest(project.id, artifact), artifact };
  }

  async getDeckSlide(projectId: string, slideId: string, credential: { token: string | null }) {
    this.tokens.verify(credential.token, { projectId });
    return this.repo.readDeckSlideHtml(projectId, slideId);
  }

  async saveDeckSlide(projectId: string, slideId: string, input: { html: string }, credential: { token: string | null }) {
    const access = this.tokens.verify(credential.token, { projectId });
    if (typeof input.html !== "string" || !input.html.trim()) throw new Error("Slide HTML is required");
    const result = await this.repo.writeDeckSlideHtml(projectId, slideId, input.html, "ai");
    this.events.emit({
      type: "project.updated",
      projectId,
      runId: access.runId,
      payload: await this.projectDetail(projectId),
    });
    return result;
  }

  async getPptxManifest(projectId: string, credential: { token: string | null }) {
    this.tokens.verify(credential.token, { projectId });
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "pptx") throw new Error("PPTX artifact not found");
    return { manifest: await this.repo.readPptxManifest(project.id, artifact), artifact };
  }

  private requireDeck(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    this.repo.ensureTemplateDeckMaterialized(project, artifact);
    return { project, artifact };
  }

  private async projectDetail(projectId: string) {
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
}
