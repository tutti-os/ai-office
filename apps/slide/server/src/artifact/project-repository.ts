import { existsSync, rmSync } from "node:fs";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { basename, extname, join, resolve } from "node:path";
import {
  deckArtifactFileRef,
  deckMimeType,
  pptxArtifactFileRef,
  pptxMimeType,
  type CreateProjectRequest,
  type DeckManifest,
  type PptxManifest,
  type SlideRun,
  type SlideRunEvent,
  type SlideArtifact,
  type SlideArtifactType,
  type SlideProject,
  type UpdateProjectRequest,
} from "@ai-slide/shared";
import { defaultRuntimeProfiles, RuntimeProfileStore, SqliteAgentConversationStore, SqliteRunStore } from "@ai-app/shared/project-store";
import { asProjectPreparationError } from "@ai-app/shared/project-preparation";
import { writeContextAttachmentFile } from "@ai-app/shared/server-files";
import {
  allocateRenamedTshArtifactRoot,
  allocateTshArtifactRoot,
  assertAllowedTshParentPath,
  ensureTshArtifactRoot,
  resolveTshParentPath,
} from "@ai-app/shared/tsh-host";
import { getDb, rowOrNull, rows } from "../db/database.js";
import {
  appPaths,
  bindProjectWorkspaceRoot,
  boundWorkspaceRoot,
  clearProjectWorkspaceRootBindings,
  ensureBaseDirs,
  ensureProjectDirs,
  projectWorkspaceRoot,
  unbindProjectWorkspaceRoot,
} from "../local/paths.js";
import { loadTemplateDeckSource } from "../templates/template-service.js";
import { writeDeckHtmlExportBundle } from "./deck-html-export.js";
import {
  assertIndexedSlideNames,
  assertSameSlideSet,
  compareIndexedSlideNames,
  nextSlideId,
  normalizeSlideListItem,
  pptxFilePath,
  readPptxManifestFromFile,
  resolveDeckSlidePath,
  writeDeckManifest,
} from "./deck-project-files.js";
import {
  isBlankDeckManifest,
  isGeneratedImageTemplateDeck,
  materializeTemplateDeckSource,
  requireTemplateDeckSource,
} from "./project-materialization.js";
import { importedProjectTitle, normalizedAssetFileName, normalizedExportFileName, projectAssetRelativePath, writeUniqueNamedFile } from "./project-file-names.js";
import { insertProjectWithArtifact } from "./project-persistence.js";
import { materializeSlideProjectCore, SlideProjectPreparation } from "./project-preparation.js";
import { projectsWithArtifactTypeSql, rowToArtifact, rowToProject, type ArtifactRow, type ProjectRowWithArtifactType } from "./project-rows.js";
export class ProjectRepository {
  private readonly preparation = new SlideProjectPreparation();
  private readonly conversations = new SqliteAgentConversationStore(getDb, {
    createSessionId: randomUUID,
    createMessageId: randomUUID,
  });
  private readonly runs = new SqliteRunStore<SlideRun, SlideRunEvent>(getDb, {
    runsTable: "slide_runs",
    eventsTable: "slide_run_events",
    createRunId: randomUUID,
    createEventId: randomUUID,
  });
  private readonly runtimeProfiles = new RuntimeProfileStore(getDb, {
    defaultProfiles: defaultRuntimeProfiles({
      demoModel: "slide-demo",
      demoDisplayName: "Demo slide editor",
    }),
  });

  ensureSeedData() {
    this.runtimeProfiles.ensureSeedData();
  }

  snapshot() {
    this.ensureSeedData();
    const db = getDb();
    return {
      projects: rows<ProjectRowWithArtifactType>(db.prepare(projectsWithArtifactTypeSql({ orderByUpdatedAt: true })).all()).map(rowToProject),
      artifacts: rows<ArtifactRow>(db.prepare(`SELECT * FROM artifacts ORDER BY updated_at DESC`).all()).map(rowToArtifact),
      runtimeProfiles: this.runtimeProfiles.list(),
      activeRuns: this.runs.listActiveRuns(),
      runEvents: this.runs.listRecentRunEvents(),
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
  }

  listProjects() {
    return rows<ProjectRowWithArtifactType>(getDb().prepare(projectsWithArtifactTypeSql({ orderByUpdatedAt: true })).all()).map(rowToProject);
  }

  interruptActiveRuns(reason: string) {
    return this.runs.interruptActiveRuns(reason);
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRowWithArtifactType>(getDb().prepare(projectsWithArtifactTypeSql({ whereProjectId: true })).get(projectId));
    return row ? rowToProject(row) : null;
  }

  getArtifact(artifactId: string) {
    const row = rowOrNull<ArtifactRow>(getDb().prepare(`SELECT * FROM artifacts WHERE id = ?`).get(artifactId));
    return row ? rowToArtifact(row) : null;
  }

  getProjectPreparation(projectId: string) {
    return this.preparation.getStatus(projectId);
  }

  getActiveArtifact(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    return this.getArtifact(project.activeArtifactId);
  }

  getRuntimeProfile(profileId: string | null | undefined) {
    this.ensureSeedData();
    return this.runtimeProfiles.get(profileId);
  }

  getLocalAgentRuntimeProfileByTarget(agentTargetId: string) {
    this.ensureSeedData();
    return this.runtimeProfiles.getLocalAgentByTarget(agentTargetId);
  }

  getRuntimeProfileForRun(run: Pick<SlideRun, "runtime" | "agentTargetId" | "provider" | "model">) {
    this.ensureSeedData();
    return this.runtimeProfiles.getForRun(run);
  }

  syncLocalAgentRuntimeProfiles(agents: Array<{ agentTargetId: string; providerId: string; displayName: string; supported: boolean }>) {
    this.ensureSeedData();
    this.runtimeProfiles.syncLocalAgentRuntimeProfiles(agents);
  }

  async createProject(input: CreateProjectRequest) {
    const id = randomUUID();
    const artifactType = input.artifactType ?? "deck";
    const templateSource = artifactType === "deck" && input.templateId ? await requireTemplateDeckSource(input.templateId) : null;
    const now = new Date().toISOString();
    const title = input.title?.trim() || input.templateName?.trim() || "Untitled Presentation";
    const parentPath = resolveTshParentPath(input.parentPath);
    const workspaceRoot = parentPath ? ensureTshArtifactRoot(allocateTshArtifactRoot(parentPath, title, id)) : null;
    if (workspaceRoot) bindProjectWorkspaceRoot(id, workspaceRoot);
    const artifact = defaultArtifactInput({ projectId: id, type: artifactType, now });
    const db = getDb();

    insertProjectWithArtifact(db, {
      project: {
        id,
        title,
        activeArtifactId: artifact.id,
        templateId: input.templateId ?? null,
        templateName: input.templateName ?? null,
        workspaceRoot,
      },
      artifact,
      now,
    });

    const project = this.getProject(id);
    const createdArtifact = this.getArtifact(artifact.id);
    if (!project || !createdArtifact) throw new Error("Unable to create project");
    try {
      await materializeSlideProjectCore(project, createdArtifact, templateSource);
      this.preparation.markCore(project.id, "ready");
    } catch (error) {
      const failure = asProjectPreparationError(error, "core_materialization", createdArtifact.fileRef);
      this.preparation.markCore(project.id, "failed", failure);
      throw failure;
    }
    this.preparation.startAgentContext(project, createdArtifact);
    return { project, artifact: createdArtifact, preparation: this.getProjectPreparation(project.id) };
  }

  async importPptxProjectFromFile(input: { sourcePath: string; title?: string }) {
    const sourcePath = resolve(input.sourcePath);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error("PPTX source is not a file");
    if (extname(sourcePath).toLowerCase() !== ".pptx") throw new Error("PPTX source must end with .pptx");

    const title = input.title?.trim() || basename(sourcePath, extname(sourcePath));
    const created = await this.createProject({ title, artifactType: "pptx" });
    await copyFile(sourcePath, pptxFilePath(created.project.id, created.artifact));
    const refresh = await this.refreshPptxArtifactFromFile(created.project.id, "human");
    const project = this.getProject(created.project.id);
    const artifact = this.getArtifact(created.artifact.id);
    if (!project || !artifact) throw new Error("Unable to import PPTX project");
    return {
      project,
      artifact,
      pptxManifest: refresh?.manifest ?? (await readPptxManifestFromFile(project.id, artifact)),
    };
  }

  async importPptxProjectFromBytes(input: { fileName: string; bytes: Buffer; title?: string }) {
    const created = await this.createProject({
      title: input.title?.trim() || importedProjectTitle(input.fileName),
      artifactType: "pptx",
    });
    await writeFile(pptxFilePath(created.project.id, created.artifact), input.bytes);
    const refresh = await this.refreshPptxArtifactFromFile(created.project.id, "human");
    const project = this.getProject(created.project.id);
    const artifact = this.getArtifact(created.artifact.id);
    if (!project || !artifact) throw new Error("Unable to import PPTX project");
    return {
      project,
      artifact,
      pptxManifest: refresh?.manifest ?? (await readPptxManifestFromFile(project.id, artifact)),
    };
  }

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const current = this.getProject(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const activeArtifactId = input.activeArtifactId ?? current.activeArtifactId;
    if (activeArtifactId !== current.activeArtifactId && !this.getArtifact(activeArtifactId)) {
      throw new Error("Artifact not found");
    }
    getDb()
      .prepare(
        `UPDATE projects
         SET title = ?, active_artifact_id = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(input.title?.trim() || current.title, activeArtifactId, input.updatedBy ?? "human", now, projectId);
    return this.getProject(projectId);
  }

  updateProjectSessionTitle(projectId: string, title: string) {
    return this.conversations.updateProjectSessionTitle(projectId, title);
  }

  /**
   * TSH directory artifacts keep a stable short id suffix. When the AI/human
   * sets a real title, rename `/workspace/Untitled_…-<id>` to match.
   */
  async renameTshArtifactRootForTitle(projectId: string, title: string) {
    const currentPath = boundWorkspaceRoot(projectId);
    if (!currentPath) return;
    if (!existsSync(currentPath)) {
      throw new Error(`Deck directory is missing at ${currentPath}: no such file or directory`);
    }
    const nextPath = allocateRenamedTshArtifactRoot(currentPath, title);
    if (nextPath === currentPath) return;
    if (existsSync(nextPath)) {
      throw new Error(`A directory already exists at ${nextPath}`);
    }
    await rename(currentPath, nextPath);
    bindProjectWorkspaceRoot(projectId, nextPath);
    getDb().prepare(`UPDATE projects SET workspace_root = ? WHERE id = ?`).run(nextPath, projectId);
  }

  async updateDeckManifestTitle(projectId: string, title: string, updatedBy: SlideProject["updatedBy"] = "ai") {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") return null;
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    if (!manifest) return null;
    const nextManifest = {
      ...manifest,
      title: title.trim() || manifest.title,
      updatedAt: new Date().toISOString(),
    };
    await writeDeckManifest(projectId, artifact, nextManifest);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return { artifact: updatedArtifact, manifest: nextManifest };
  }

  async reorderDeckSlides(projectId: string, input: { slides?: string[] }, updatedBy: SlideProject["updatedBy"] = "ai") {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    if (!manifest) throw new Error("Deck manifest not found");

    const slidesDir = join(projectWorkspaceRoot(projectId), artifact.fileRef, "slides");
    const filesystemSlides = (await readdir(slidesDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
      .map((entry) => entry.name);
    if (!filesystemSlides.length) throw new Error("No slide HTML files found in deck.slides/slides");

    const sortedFilesystemSlides = filesystemSlides.slice().sort(compareIndexedSlideNames);
    const requestedSlides = input.slides?.length ? input.slides.map(normalizeSlideListItem) : sortedFilesystemSlides;
    assertIndexedSlideNames(requestedSlides);
    assertSameSlideSet(sortedFilesystemSlides, requestedSlides);

    const existingIds = new Map(manifest.slides.map((slide) => [slide.file, slide.id] as const));
    const usedIds = new Set(manifest.slides.map((slide) => slide.id));
    const nextSlides = requestedSlides.map((fileName, index) => {
      const file = `slides/${fileName}`;
      return {
        id: existingIds.get(file) ?? nextSlideId(usedIds, index),
        file,
      };
    });
    const nextManifest: DeckManifest = {
      ...manifest,
      slides: nextSlides,
      updatedAt: new Date().toISOString(),
    };
    await writeDeckManifest(projectId, artifact, nextManifest);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return {
      artifact: updatedArtifact,
      manifest: nextManifest,
      slides: nextSlides,
    };
  }

  clearProjectHistory() {
    const db = getDb();
    const workspaceRoots = rows<{ id: string; workspace_root: string | null }>(
      db.prepare(`SELECT id, workspace_root FROM projects`).all(),
    );
    db.exec(`
      DELETE FROM slide_run_events;
      DELETE FROM slide_runs;
      DELETE FROM agent_conversation_messages;
      DELETE FROM agent_conversation_sessions;
      DELETE FROM stream_events;
      DELETE FROM artifacts;
      DELETE FROM projects;
    `);
    for (const row of workspaceRoots) {
      if (row.workspace_root) rmSync(row.workspace_root, { force: true, recursive: true });
      unbindProjectWorkspaceRoot(row.id);
    }
    clearProjectWorkspaceRootBindings();
    rmSync(appPaths.projectsDir, { force: true, recursive: true });
    ensureBaseDirs();
    return { projects: [] as SlideProject[] };
  }

  deleteProject(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const root = projectWorkspaceRoot(projectId);
    const db = getDb();
    db.exec("BEGIN");
    try {
      db.prepare(`DELETE FROM agent_conversation_messages WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM agent_conversation_sessions WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM slide_run_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM slide_runs WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM stream_events WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM artifacts WHERE project_id = ?`).run(projectId);
      db.prepare(`DELETE FROM projects WHERE id = ?`).run(projectId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    rmSync(root, { force: true, recursive: true });
    unbindProjectWorkspaceRoot(projectId);
    return { projects: this.listProjects() };
  }

  createRun(input: {
    projectId: string;
    runtime: string;
    agentTargetId: string | null;
    provider: string;
    model: string;
    mode: string;
    instruction: string;
    selectionType: string;
    selectionPath: string;
    selectedText: string;
    selectedHtml: string;
  }) {
    return this.runs.createRun(input);
  }

  ensureConversationSession(projectId: string, title?: string) {
    return this.conversations.ensureProjectSession(projectId, title);
  }

  createConversationSession(projectId: string, title?: string) {
    return this.conversations.createProjectSession(projectId, title);
  }

  listConversationSessions(projectId: string) {
    return this.conversations.listProjectSessions(projectId);
  }

  createConversationMessage(input: {
    projectId: string;
    sessionId: string;
    role: "user" | "assistant";
    content: string;
    metadata?: Record<string, unknown> | null;
  }) {
    return this.conversations.createMessage(input);
  }

  updateConversationMessage(messageId: string, input: { content?: string; metadata?: Record<string, unknown> | null }) {
    return this.conversations.updateMessage(messageId, input);
  }

  conversationHistory(sessionId: string, currentPrompt: string) {
    return this.conversations.normalizedHistory({ sessionId, currentPrompt });
  }

  listConversationMessages(sessionId: string) {
    return this.conversations.listSessionMessages(sessionId);
  }

  getRun(runId: string) {
    return this.runs.getRun(runId);
  }

  listProjectRuns(projectId: string) {
    return this.runs.listProjectRuns(projectId);
  }

  updateRun(runId: string, input: Partial<Pick<SlideRun, "status" | "error" | "resultPreview" | "agentTargetId" | "provider" | "model">>) {
    return this.runs.updateRun(runId, input);
  }

  createRunEvent(input: {
    runId: string;
    projectId: string;
    type: SlideRunEvent["type"];
    content?: string;
    status?: SlideRunEvent["status"];
    metadata?: Record<string, unknown> | null;
    sortOrder: number;
  }) {
    return this.runs.createRunEvent(input);
  }

  listRunEvents(runId: string) {
    return this.runs.listRunEvents(runId);
  }

  async readDeckManifest(projectId: string, artifact: SlideArtifact): Promise<DeckManifest | null> {
    if (artifact.type !== "deck") return null;
    const manifestPath = join(projectWorkspaceRoot(projectId), artifact.fileRef, "manifest.json");
    try {
      return JSON.parse(await readFile(manifestPath, "utf8")) as DeckManifest;
    } catch {
      return null;
    }
  }

  async readDeckSlideHtml(projectId: string, slideId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    const slide = manifest?.slides.find((item) => item.id === slideId);
    if (!slide) throw new Error("Slide not found");
    const html = await readFile(resolveDeckSlidePath(projectId, artifact, slide.file), "utf8");
    return { slide, html, artifact };
  }

  async writeDeckSlideHtml(
    projectId: string,
    slideId: string,
    html: string,
    updatedBy: SlideProject["updatedBy"] = "human",
    expectedArtifactRevision?: number,
  ) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    this.assertFocusedArtifactPresent(project, artifact);
    if (expectedArtifactRevision != null && artifact.revision !== expectedArtifactRevision) {
      throw new Error("Deck changed before this save completed. Reload the presentation before saving again.");
    }
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    const slide = manifest?.slides.find((item) => item.id === slideId);
    if (!slide) throw new Error("Slide not found");
    await writeFile(resolveDeckSlidePath(projectId, artifact, slide.file), html, "utf8");
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return { slide, html, artifact: updatedArtifact };
  }

  async writeDeckAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const assetsDir = join(projectWorkspaceRoot(projectId), artifact.fileRef, "assets");
    await mkdir(assetsDir, { recursive: true });
    const fileName = await writeUniqueNamedFile(assetsDir, normalizedAssetFileName(input.fileName, input.mimeType), input.bytes);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, "human") ?? artifact;
    return {
      artifact: updatedArtifact,
      path: `../assets/${fileName}`,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeProjectAsset(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Project artifact not found");
    const root = projectWorkspaceRoot(projectId);
    const assetsDir = join(root, "assets");
    await mkdir(assetsDir, { recursive: true });
    const fileName = await writeUniqueNamedFile(assetsDir, normalizedAssetFileName(input.fileName, input.mimeType), input.bytes);
    this.preparation.invalidateAgentContext(projectId);
    this.preparation.startAgentContext(project, artifact);
    return {
      path: projectAssetRelativePath(fileName),
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeContextAttachment(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Project artifact not found");
    return writeContextAttachmentFile(projectWorkspaceRoot(projectId), input);
  }

  async writeProjectExport(
    projectId: string,
    input: { fileName: string; mimeType: string; bytes: Buffer; targetDirectory?: string | null },
  ) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const exportsDir = input.targetDirectory?.trim()
      ? assertAllowedTshParentPath(input.targetDirectory)
      : join(projectWorkspaceRoot(projectId), "exports");
    await mkdir(exportsDir, { recursive: true });
    const fileName = await writeUniqueNamedFile(exportsDir, normalizedExportFileName(input.fileName, input.mimeType), input.bytes);
    const absolutePath = join(exportsDir, fileName);
    return {
      path: absolutePath,
      absolutePath,
      exportsDir,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeDeckHtmlExport(projectId: string, input: { targetDirectory?: string | null } = {}) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    this.assertFocusedArtifactPresent(project, artifact);
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    if (!manifest) throw new Error("Deck manifest not found");

    return writeDeckHtmlExportBundle({
      projectId,
      projectTitle: project.title,
      artifact,
      manifest,
      targetDirectory: input.targetDirectory,
    });
  }

  /**
   * TSH projects bind a workspace root under /workspace. If that root (or the
   * focused deck directory) was renamed or deleted, fail open instead of
   * silently rematerializing a ghost tree.
   *
   * PPTX deliberately starts without `slides.pptx` — the agent creates it.
   * Only the project directory must exist; missing pptx is the waiting state.
   */
  assertFocusedArtifactPresent(project: SlideProject, artifact: SlideArtifact) {
    if (!project.workspaceRoot) return;
    const root = projectWorkspaceRoot(project.id);
    if (!existsSync(root)) {
      throw new Error(`Presentation directory is missing at ${root}: no such file or directory`);
    }
    if (artifact.type !== "deck") return;
    const focusedPath = join(root, artifact.fileRef);
    if (existsSync(focusedPath)) return;
    throw new Error(`Deck directory is missing at ${focusedPath}: no such file or directory`);
  }
  projectExportsDir(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    return join(ensureProjectDirs(projectId), "exports");
  }
  bumpArtifactRevision(artifactId: string, updatedBy: SlideProject["updatedBy"]) {
    const current = this.getArtifact(artifactId);
    if (!current) return null;
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `UPDATE artifacts
         SET revision = revision + 1, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(updatedBy, now, artifactId);
    getDb().prepare(`UPDATE projects SET updated_by = ?, updated_at = ? WHERE id = ?`).run(updatedBy, now, current.projectId);
    return this.getArtifact(artifactId);
  }
  async ensureTemplateDeckMaterialized(project: SlideProject, artifact: SlideArtifact) {
    if (artifact.type !== "deck" || !project.templateId) return;
    const deckRoot = join(projectWorkspaceRoot(project.id), artifact.fileRef);
    const manifestPath = join(deckRoot, "manifest.json");
    const [blankDeck, generatedImageTemplateDeck] = await Promise.all([
      isBlankDeckManifest(manifestPath),
      isGeneratedImageTemplateDeck(deckRoot, manifestPath),
    ]);
    if (!blankDeck && !generatedImageTemplateDeck) return;
    const source = await (project.templateId ? loadTemplateDeckSource(project.templateId) : null);
    if (!source || !(await materializeTemplateDeckSource(deckRoot, project, source))) {
      throw new Error(`Template HTML source is missing for "${project.templateId}". Check the slide template provider or set AI_SLIDE_TEMPLATE_PROVIDER=local with AI_SLIDE_TEMPLATE_ROOT.`);
    }
  }

  async readPptxManifest(projectId: string, artifact: SlideArtifact): Promise<PptxManifest | null> {
    if (artifact.type !== "pptx") return null;
    return readPptxManifestFromFile(projectId, artifact);
  }

  async readPptxFile(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "pptx") throw new Error("PPTX artifact not found");
    const bytes = await readFile(pptxFilePath(projectId, artifact));
    return {
      bytes,
      fileName: "slides.pptx",
      mimeType: pptxMimeType,
    };
  }

  async refreshPptxArtifactFromFile(projectId: string, updatedBy: SlideProject["updatedBy"]) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "pptx") return null;
    const nextManifest = await readPptxManifestFromFile(projectId, artifact);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return { artifact: updatedArtifact, manifest: nextManifest, changed: true };
  }

  async ensureAgentContextReady(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) throw new Error("Project artifact not found");
    await this.preparation.ensureAgentContext(project, artifact);
    return { project, artifact };
  }

  async syncProjectAgentInstructions(projectId: string) {
    return this.ensureAgentContextReady(projectId);
  }
}
function defaultArtifactInput(input: { projectId: string; type: SlideArtifactType; now: string }) {
  const id = randomUUID();
  if (input.type === "pptx") {
    return {
      id,
      type: "pptx" as const,
      fileRef: pptxArtifactFileRef,
      mimeType: pptxMimeType,
    };
  }
  return {
    id,
    type: "deck" as const,
    fileRef: deckArtifactFileRef,
    mimeType: deckMimeType,
  };
}
