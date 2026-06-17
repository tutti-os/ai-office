import { AgentToolTokenStore } from "./agent-tool-tokens.js";
import { DocumentRepository } from "./document-repository.js";
import { EventHub } from "../ws/event-hub.js";

export class AgentToolGateway {
  constructor(
    private readonly repo: DocumentRepository,
    private readonly events: EventHub,
    private readonly tokens: AgentToolTokenStore,
  ) {}

  getDocument(projectId: string, credential: { token: string | null }) {
    this.tokens.verify(credential.token, { projectId });
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return { project };
  }

  saveDocument(projectId: string, input: { htmlContent: string; title?: string }, credential: { token: string | null }) {
    const access = this.tokens.verify(credential.token, { projectId });
    const project = this.repo.updateProject(projectId, {
      title: input.title,
      content: input.htmlContent,
      updatedBy: "ai",
    });
    if (!project) throw new Error("Project not found");
    this.events.emit({
      type: "project.updated",
      projectId,
      runId: access.runId,
      payload: { project },
    });
    return { project };
  }
}
