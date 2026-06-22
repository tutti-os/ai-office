import { openPathInFileManager } from "@ai-app/shared/local-open";
import type { CreateProjectRequest, UpdateProjectRequest } from "@ai-sheet/shared";
import { EventHub } from "../ws/event-hub.js";
import { SheetRepository } from "./sheet-repository.js";

export class SheetService {
  constructor(
    private readonly repo: SheetRepository,
    private readonly events: EventHub,
  ) {}

  bootstrap() {
    return this.repo.snapshot();
  }

  listLocalAgentProviders() {
    return { providers: [] };
  }

  listProjects() {
    return { projects: this.repo.listProjects() };
  }

  clearProjectHistory() {
    return this.repo.clearProjectHistory();
  }

  deleteProject(projectId: string) {
    return this.repo.deleteProject(projectId);
  }

  async createProject(input: CreateProjectRequest) {
    const result = this.repo.createProject(input);
    this.events.emit({ type: "project.created", projectId: result.project.id, payload: result });
    return {
      ...result,
      xlsxManifest: await this.repo.readXlsxManifest(result.project.id),
    };
  }

  async importXlsxProject(input: { path?: string; title?: string }) {
    if (!input.path?.trim()) throw new Error("XLSX path is required");
    const result = await this.repo.importXlsxProjectFromFile({
      sourcePath: input.path,
      title: input.title,
    });
    this.events.emit({ type: "project.created", projectId: result.project.id, payload: result });
    return result;
  }

  async importXlsxProjectFile(input: { fileName: string; bytes: Buffer; title?: string }) {
    const result = await this.repo.importXlsxProjectFromBytes(input);
    this.events.emit({ type: "project.created", projectId: result.project.id, payload: result });
    return result;
  }

  async getProject(projectId: string) {
    const project = this.repo.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.repo.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Active artifact not found");
    return {
      project,
      artifact,
      xlsxManifest: await this.repo.readXlsxManifest(projectId),
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

  readXlsxFile(projectId: string) {
    return this.repo.readXlsxFile(projectId);
  }

  listProjectRuns(projectId: string) {
    return {
      runs: this.repo.listProjectRuns(projectId).map((run) => ({ run, events: [] })),
    };
  }

  startAiEdit(): never {
    throw new Error("AI editing is not available for AI Sheet yet.");
  }

  cancelRun() {
    return null;
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    return this.repo.writeProjectExport(projectId, input);
  }

  async exportXlsxFile(projectId: string) {
    const detail = await this.getProject(projectId);
    const file = await this.repo.readXlsxFile(projectId);
    return this.writeProjectExport(projectId, {
      fileName: `${detail.project.title || "workbook"}.xlsx`,
      mimeType: file.mimeType,
      bytes: file.bytes,
    });
  }

  async openProjectExportsDir(projectId: string) {
    const path = this.repo.projectExportsDir(projectId);
    await openPathInFileManager(path);
    return { path };
  }
}
