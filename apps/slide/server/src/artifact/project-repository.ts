import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBlankDeckManifest,
  createEmptyPptxManifest,
  deckArtifactFileRef,
  deckSlideDisplayName,
  deckMimeType,
  parsePptxManifest,
  pptxArtifactFileRef,
  pptxMimeType,
  serializePptxManifest,
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
import { getDb, rowOrNull, rows } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";
import { loadTemplateDeckSource, localTemplateSourceRoots, type TemplateDeckSource } from "../templates/template-service.js";
import { defaultDeckSkillFiles, defaultDeckSkillSlug } from "./default-deck-skill.js";

const htmlMimeType = "text/html";

export class ProjectRepository {
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
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      artifacts: rows<ArtifactRow>(db.prepare(`SELECT * FROM artifacts ORDER BY updated_at DESC`).all()).map(rowToArtifact),
      runtimeProfiles: this.runtimeProfiles.list(),
      activeRuns: this.runs.listActiveRuns(),
      runEvents: this.runs.listRecentRunEvents(),
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
  }

  listProjects() {
    return rows<ProjectRow>(getDb().prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject);
  }

  interruptActiveRuns(reason: string) {
    return this.runs.interruptActiveRuns(reason);
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRow>(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId));
    return row ? rowToProject(row) : null;
  }

  getArtifact(artifactId: string) {
    const row = rowOrNull<ArtifactRow>(getDb().prepare(`SELECT * FROM artifacts WHERE id = ?`).get(artifactId));
    return row ? rowToArtifact(row) : null;
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

  getRuntimeProfileForRun(run: Pick<SlideRun, "runtime" | "provider" | "model">) {
    this.ensureSeedData();
    return this.runtimeProfiles.getForRun(run);
  }

  async createProject(input: CreateProjectRequest) {
    const id = randomUUID();
    const artifactType = input.artifactType ?? "deck";
    const templateSource = artifactType === "deck" && input.templateId ? await requireTemplateDeckSource(input.templateId) : null;
    const now = new Date().toISOString();
    const title = input.title?.trim() || input.templateName?.trim() || "Untitled Presentation";
    const artifact = defaultArtifactInput({ projectId: id, type: artifactType, now });
    const db = getDb();

    ensureProjectDirs(id);
    db.prepare(
      `INSERT INTO projects (id, title, active_artifact_id, template_id, template_name, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'system', ?, ?)`,
    ).run(id, title, artifact.id, input.templateId ?? null, input.templateName ?? null, now, now);
    db.prepare(
      `INSERT INTO artifacts (id, project_id, type, file_ref, mime_type, revision, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, 'system', ?, ?)`,
    ).run(artifact.id, id, artifact.type, artifact.fileRef, artifact.mimeType, now, now);

    const project = this.getProject(id);
    const createdArtifact = this.getArtifact(artifact.id);
    if (!project || !createdArtifact) throw new Error("Unable to create project");
    this.materializeProject(project, createdArtifact, templateSource);
    return { project, artifact: createdArtifact };
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
    writeDeckManifest(projectId, artifact, nextManifest);
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
    const filesystemSlides = readdirSync(slidesDir, { withFileTypes: true })
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
    writeDeckManifest(projectId, artifact, nextManifest);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return {
      artifact: updatedArtifact,
      manifest: nextManifest,
      slides: nextSlides,
    };
  }

  clearProjectHistory() {
    getDb().exec(`
      DELETE FROM slide_run_events;
      DELETE FROM slide_runs;
      DELETE FROM agent_conversation_messages;
      DELETE FROM agent_conversation_sessions;
      DELETE FROM stream_events;
      DELETE FROM artifacts;
      DELETE FROM projects;
    `);
    rmSync(appPaths.projectsDir, { force: true, recursive: true });
    ensureBaseDirs();
    return { projects: [] as SlideProject[] };
  }

  deleteProject(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
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
    rmSync(projectWorkspaceRoot(projectId), { force: true, recursive: true });
    return { projects: this.listProjects() };
  }

  createRun(input: {
    projectId: string;
    runtime: string;
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

  getRun(runId: string) {
    return this.runs.getRun(runId);
  }

  listProjectRuns(projectId: string) {
    return this.runs.listProjectRuns(projectId);
  }

  updateRun(runId: string, input: Partial<Pick<SlideRun, "status" | "error" | "resultPreview">>) {
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

  async writeDeckSlideHtml(projectId: string, slideId: string, html: string, updatedBy: SlideProject["updatedBy"] = "human") {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
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
    const assetsDir = join(ensureProjectDirs(projectId), artifact.fileRef, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const fileName = uniqueAssetFileName(assetsDir, input.fileName, input.mimeType);
    writeFileSync(join(assetsDir, fileName), input.bytes);
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
    const root = ensureProjectDirs(projectId);
    const assetsDir = join(root, "assets");
    mkdirSync(assetsDir, { recursive: true });
    const fileName = uniqueAssetFileName(assetsDir, input.fileName, input.mimeType);
    writeFileSync(join(assetsDir, fileName), input.bytes);
    this.writeProjectAgentInstructions(project, artifact);
    return {
      path: `./assets/${fileName}`,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const exportsDir = join(ensureProjectDirs(projectId), "exports");
    mkdirSync(exportsDir, { recursive: true });
    const fileName = uniqueExportFileName(exportsDir, input.fileName, input.mimeType);
    const absolutePath = join(exportsDir, fileName);
    writeFileSync(absolutePath, input.bytes);
    return {
      path: absolutePath,
      absolutePath,
      exportsDir,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.bytes.byteLength,
    };
  }

  async writeDeckHtmlExport(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
    await this.ensureTemplateDeckMaterialized(project, artifact);
    const manifest = await this.readDeckManifest(projectId, artifact);
    if (!manifest) throw new Error("Deck manifest not found");

    const exportsRoot = join(ensureProjectDirs(projectId), "exports");
    mkdirSync(exportsRoot, { recursive: true });
    const exportDirName = uniqueExportDirectoryName(exportsRoot, project.title || manifest.title || "slides");
    const exportDir = join(exportsRoot, exportDirName);
    mkdirSync(exportDir, { recursive: true });

    const deckRoot = join(projectWorkspaceRoot(projectId), artifact.fileRef);
    const assetCollector = createDeckHtmlAssetCollector(deckRoot);

    const slideExports = manifest.slides.map((slide, index) => {
      const html = readFileSync(resolveDeckSlidePath(projectId, artifact, slide.file), "utf8");
      return parseSlideHtmlForExport(html, {
        assetCollector,
        deckRoot,
        fallbackTitle: deckSlideDisplayName(slide, index),
        id: slide.id,
      });
    });
    copyDeckHtmlExportAssets(assetCollector, exportDir);
    const html = renderDeckHtmlExport({
      canvas: manifest.canvas,
      slides: slideExports,
      title: project.title || manifest.title || "Untitled Presentation",
    });
    const absolutePath = join(exportDir, "index.html");
    writeFileSync(absolutePath, html, "utf8");
    return {
      path: absolutePath,
      absolutePath,
      exportsDir: exportsRoot,
      fileName: `${exportDirName}/index.html`,
      mimeType: htmlMimeType,
      sizeBytes: Buffer.byteLength(html, "utf8"),
    };
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
    if (!isBlankDeckManifest(manifestPath) && !isGeneratedImageTemplateDeck(deckRoot, manifestPath)) return;
    const source = await (project.templateId ? loadTemplateDeckSource(project.templateId) : null);
    if (!source || !materializeTemplateDeckSource(deckRoot, project, source)) {
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
    const currentManifest = readStoredPptxManifest(projectId, artifact);
    if (
      currentManifest.sha256 === nextManifest.sha256 &&
      currentManifest.sizeBytes === nextManifest.sizeBytes &&
      currentManifest.updatedAt === nextManifest.updatedAt
    ) {
      return { artifact, manifest: nextManifest, changed: false };
    }
    writeStoredPptxManifest(projectId, artifact, nextManifest);
    const updatedArtifact = this.bumpArtifactRevision(artifact.id, updatedBy) ?? artifact;
    return { artifact: updatedArtifact, manifest: nextManifest, changed: true };
  }

  private materializeProject(project: SlideProject, artifact: SlideArtifact, templateSource: TemplateDeckSource | null = null) {
    const root = ensureProjectDirs(project.id);
    if (artifact.type === "deck") materializeDeckProject(root, project, artifact, templateSource);
    else materializePptxProject(root, project, artifact);
    syncDefaultDeckSkill(root, project, artifact);
    syncProjectTemplateSkill(root, project, artifact);
    this.writeProjectAgentInstructions(project, artifact);
  }

  syncProjectAgentInstructions(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact) return null;
    const root = ensureProjectDirs(project.id);
    syncDefaultDeckSkill(root, project, artifact);
    syncProjectTemplateSkill(root, project, artifact);
    this.writeProjectAgentInstructions(project, artifact);
    return { project, artifact };
  }

  private writeProjectAgentInstructions(project: SlideProject, artifact: SlideArtifact) {
    const root = ensureProjectDirs(project.id);
    writeFileSync(join(root, "AGENTS.md"), projectAgentInstructions(artifact), "utf8");
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

function materializeDeckProject(root: string, project: SlideProject, artifact: SlideArtifact, templateSource: TemplateDeckSource | null = null) {
  const deckRoot = join(root, artifact.fileRef);
  const manifestPath = join(deckRoot, "manifest.json");
  const createdAt = project.createdAt;
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });
  if (project.templateId && templateSource && materializeTemplateDeckSource(deckRoot, project, templateSource)) return;
  if (!existsSync(manifestPath)) {
    const manifest = createBlankDeckManifest({ title: project.title, createdAt });
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }
  const stylesPath = join(deckRoot, "assets", "styles.css");
  if (!existsSync(stylesPath)) {
    writeFileSync(
      stylesPath,
      `html, body { margin: 0; width: 100%; height: 100%; }\nbody { font-family: Inter, ui-sans-serif, system-ui, sans-serif; }\n.slide { width: 1920px; height: 1080px; box-sizing: border-box; padding: 96px; }\n`,
      "utf8",
    );
  }
  const coverPath = join(deckRoot, "slides", "01-cover.html");
  if (!existsSync(coverPath)) {
    writeFileSync(
      coverPath,
      `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="../assets/styles.css">
  <title>${escapeHtml(project.title)}</title>
</head>
<body>
  <section class="slide"></section>
</body>
</html>
`,
      "utf8",
    );
  }
}

function materializeTemplateDeckSource(deckRoot: string, project: SlideProject, source: TemplateDeckSource) {
  rmSync(deckRoot, { force: true, recursive: true });
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });

  for (const asset of source.assets) {
    const assetPath = safeTemplateProjectAssetPath(asset.path);
    const targetPath = join(deckRoot, "assets", assetPath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, asset.bytes);
  }

  const slides = source.slides.map((slide, index) => {
    const destinationFile = slide.fileName.replace(/[\\/]/g, "-");
    const destinationPage = join(deckRoot, "slides", destinationFile);
    writeFileSync(destinationPage, slide.html || missingTemplateSlideHtml(project.title, slide.fileName), "utf8");
    return {
      id: `slide-${String(index + 1).padStart(3, "0")}`,
      file: `slides/${destinationFile}`,
    };
  });

  const now = new Date().toISOString();
  const manifest: DeckManifest = {
    schemaVersion: "ai-slide.deck.v1",
    title: source.title || project.title,
    canvas: source.canvas,
    slides,
    createdAt: project.createdAt,
    updatedAt: now,
  };
  writeFileSync(join(deckRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return true;
}

async function requireTemplateDeckSource(templateId: string) {
  const source = await loadTemplateDeckSource(templateId);
  if (!source) throw new Error(`Template HTML source is missing for "${templateId}". Check the slide template provider or set AI_SLIDE_TEMPLATE_PROVIDER=local with AI_SLIDE_TEMPLATE_ROOT.`);
  return source;
}

function syncProjectTemplateSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck" || !project.templateId) return;
  const sourceDir = readTemplateSkillSource(project.templateId);
  if (!sourceDir) return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", safeSkillSlug(project.templateId));
  rmSync(skillRoot, { force: true, recursive: true });
  mkdirSync(skillRoot, { recursive: true });
  cpSync(join(sourceDir, "SKILL.md"), join(skillRoot, "SKILL.md"));
}

function syncDefaultDeckSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck") return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", defaultDeckSkillSlug);
  if (project.templateId) {
    rmSync(skillRoot, { force: true, recursive: true });
    return;
  }
  rmSync(skillRoot, { force: true, recursive: true });
  for (const file of defaultDeckSkillFiles) {
    const targetPath = join(skillRoot, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, file.content, "utf8");
  }
}

function readTemplateSkillSource(templateId: string | null) {
  if (!templateId) return null;
  const templateDir = localTemplateSourceRoots().map((root) => join(root, templateId)).find((candidate) => existsSync(candidate));
  if (!templateDir) return null;
  return existsSync(join(templateDir, "SKILL.md")) ? templateDir : null;
}

function safeTemplateProjectAssetPath(value: string) {
  const normalized = normalize(value).replace(/^(\.\.[/\\])+/, "");
  if (!normalized || normalized.startsWith("..") || normalized.includes(`..${sep}`)) throw new Error(`Invalid template asset path: ${value}`);
  return normalized;
}

function safeSkillSlug(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "template";
}

function uniqueAssetFileName(assetsDir: string, requestedName: string, mimeType: string) {
  const parsed = safeAssetFileName(requestedName, mimeType);
  const ext = extname(parsed);
  const stem = basename(parsed, ext);
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(assetsDir, candidate))) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function uniqueExportFileName(exportsDir: string, requestedName: string, mimeType: string) {
  const parsed = safeExportFileName(requestedName, mimeType);
  const ext = extname(parsed);
  const stem = basename(parsed, ext);
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${stem}-${index}${ext}`;
    index += 1;
  }
  return candidate;
}

function uniqueExportDirectoryName(exportsDir: string, requestedName: string) {
  const parsed = safeExportDirectoryName(requestedName);
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${parsed}-${index}`;
    index += 1;
  }
  return candidate;
}

function safeExportDirectoryName(value: string) {
  return basename(decodeURIComponent(value || "slides"))
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "slides";
}

function importedProjectTitle(fileName: string) {
  const baseName = basename(fileName || "slides", extname(fileName || "slides"));
  return baseName.trim() || "Imported Presentation";
}

function safeAssetFileName(fileName: string, mimeType: string) {
  const fallbackExt = extensionForMimeType(mimeType);
  const clean = basename(decodeURIComponent(fileName || "image"))
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const ext = extname(clean) || fallbackExt;
  const stem = basename(clean || "image", ext).replace(/\.+$/g, "") || "image";
  return `${stem}${ext}`;
}

function safeExportFileName(fileName: string, mimeType: string) {
  const clean = basename(decodeURIComponent(fileName || "slides"))
    .trim()
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const cleanExt = extname(clean).toLowerCase();
  const ext = cleanExt === ".pptx" || cleanExt === ".pdf" ? cleanExt : extensionForExportMimeType(mimeType);
  const stem = basename(clean || "slides", extname(clean)).replace(/\.+$/g, "") || "slides";
  return `${stem}${ext}`;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "application/json") return ".json";
  if (mimeType === "application/msword") return ".doc";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "application/rtf") return ".rtf";
  if (mimeType === "application/vnd.ms-excel") return ".xls";
  if (mimeType === "application/vnd.ms-powerpoint") return ".ppt";
  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") return ".pptx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") return ".xlsx";
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ".docx";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  if (mimeType === "text/csv") return ".csv";
  if (mimeType === "text/html") return ".html";
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "text/plain") return ".txt";
  return ".bin";
}

function extensionForExportMimeType(mimeType: string) {
  if (mimeType === pptxMimeType) return ".pptx";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === htmlMimeType) return ".html";
  return ".pptx";
}

type DeckHtmlExportSlide = {
  bodyAttrs: string;
  bodyHtml: string;
  headHtml: string;
  id: string;
  label: string;
};

type DeckHtmlAssetCollector = {
  assets: Map<string, string>;
  deckRoot: string;
};

function createDeckHtmlAssetCollector(deckRoot: string): DeckHtmlAssetCollector {
  return {
    assets: new Map(),
    deckRoot,
  };
}

function copyDeckHtmlExportAssets(collector: DeckHtmlAssetCollector, exportDir: string) {
  for (const [assetPath, sourcePath] of collector.assets) {
    const targetPath = join(exportDir, assetPath);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
}

function parseSlideHtmlForExport(html: string, input: { assetCollector: DeckHtmlAssetCollector; deckRoot: string; fallbackTitle: string; id: string }): DeckHtmlExportSlide {
  const bodyMatch = html.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return {
    bodyAttrs: bodyMatch?.[1] ? normalizeSlideBodyAttrs(bodyMatch[1], input.assetCollector) : "",
    bodyHtml: rewriteSlideAssetReferences(bodyMatch?.[2] ?? html, input.assetCollector),
    headHtml: slideHeadStylesForExport(headMatch?.[1] ?? "", input.deckRoot, input.assetCollector),
    id: input.id,
    label: input.fallbackTitle,
  };
}

function slideHeadStylesForExport(headHtml: string, deckRoot: string, assetCollector: DeckHtmlAssetCollector) {
  const fragments = [
    ...Array.from(headHtml.matchAll(/<link\b[^>]*>/gi)).map((match) => slideExportLinkOrInlineStyle(match[0], deckRoot, assetCollector)).filter(Boolean),
    ...Array.from(headHtml.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)).map((match) => rewriteSlideStyleTag(match[0], assetCollector)),
  ];
  return rewriteSlideAssetReferences(fragments.join("\n"), assetCollector);
}

function slideExportLinkOrInlineStyle(value: string, deckRoot: string, assetCollector: DeckHtmlAssetCollector) {
  const rel = value.match(/\brel\s*=\s*(["']?)([^"'\s>]+)\1/i)?.[2]?.toLowerCase() ?? "";
  if (!["preconnect", "preload", "stylesheet"].includes(rel)) return "";
  if (rel !== "stylesheet") return value;
  const href = value.match(/\bhref\s*=\s*(["'])([^"']+)\1/i)?.[2] ?? "";
  const exportHref = exportAssetUrl(href);
  if (!exportHref.startsWith("assets/") || extname(exportHref).toLowerCase() !== ".css") return value;
  const cssPath = join(deckRoot, exportHref);
  if (!existsSync(cssPath)) return value;
  const css = readFileSync(cssPath, "utf8");
  return `<style data-ai-slide-export-source="${escapeHtmlAttr(exportHref)}">${rewriteSlideCssForExport(css, assetCollector, assetBaseDirForExportPath(exportHref))}</style>`;
}

function rewriteSlideStyleTag(value: string, assetCollector: DeckHtmlAssetCollector) {
  return value.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, open: string, css: string, close: string) => {
    return `${open}${rewriteSlideCssForExport(css, assetCollector)}${close}`;
  });
}

function rewriteSlideCssForExport(css: string, assetCollector: DeckHtmlAssetCollector, assetBaseDir = "") {
  return rewriteSlideAssetReferences(css, assetCollector, assetBaseDir)
    .replace(/:root\b/g, ":host")
    .replace(/\bhtml\b/g, ":host")
    .replace(/\bbody\b/g, ".ai-slide-body");
}

function normalizeSlideBodyAttrs(attrs: string, assetCollector?: DeckHtmlAssetCollector) {
  const style = attrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (!style) return "";
  return ` style="${escapeHtmlAttr(rewriteSlideAssetReferences(style, assetCollector))}"`;
}

function rewriteSlideAssetReferences(value: string, assetCollector?: DeckHtmlAssetCollector, assetBaseDir = "") {
  return value
    .replace(/((?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/gi, (_match, prefix: string, quote: string, url: string) => {
      return `${prefix}${quote}${escapeHtmlAttr(exportAssetUrl(url, assetCollector, assetBaseDir))}${quote}`;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote: string, url: string) => {
      return `url(${quote}${exportAssetUrl(url, assetCollector, assetBaseDir)}${quote})`;
    });
}

function exportAssetUrl(value: string, assetCollector?: DeckHtmlAssetCollector, assetBaseDir = "") {
  const trimmed = value.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/\\/g, "/");
  for (const prefix of ["../assets/", "./assets/", "assets/"]) {
    if (normalized.startsWith(prefix)) {
      const exportPath = `assets/${normalized.slice(prefix.length)}`;
      collectDeckHtmlAsset(assetCollector, exportPath);
      return exportPath;
    }
  }
  const resolvedFromAsset = resolveAssetRelativeToBase(normalized, assetBaseDir);
  if (resolvedFromAsset) {
    const exportPath = `assets/${resolvedFromAsset}`;
    collectDeckHtmlAsset(assetCollector, exportPath);
    return exportPath;
  }
  return trimmed;
}

function assetBaseDirForExportPath(exportPath: string) {
  if (!exportPath.startsWith("assets/")) return "";
  const base = dirname(exportPath.slice("assets/".length)).split(sep).join("/");
  return base === "." ? "." : base;
}

function resolveAssetRelativeToBase(value: string, assetBaseDir: string) {
  if (!assetBaseDir && !value.startsWith("./") && !value.startsWith("../")) return "";
  const resolved = normalize(join(assetBaseDir || ".", value));
  if (!resolved || resolved === "." || resolved.startsWith("..") || resolved.includes(`..${sep}`)) return "";
  return resolved.split(sep).join("/");
}

function collectDeckHtmlAsset(collector: DeckHtmlAssetCollector | undefined, exportPath: string) {
  if (!collector || extname(exportPath).toLowerCase() === ".css") return;
  if (!exportPath.startsWith("assets/")) return;
  const relativePath = normalize(exportPath.slice("assets/".length));
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) return;
  const sourcePath = join(collector.deckRoot, "assets", relativePath);
  if (!existsSync(sourcePath)) return;
  const info = statSync(sourcePath);
  if (!info.isFile()) return;
  collector.assets.set(`assets/${relativePath.split(sep).join("/")}`, sourcePath);
}

function renderDeckHtmlExport(input: {
  canvas: { height: number; width: number };
  slides: DeckHtmlExportSlide[];
  title: string;
}) {
  const slides = input.slides.map((slide) => renderDeckHtmlExportSlide(slide)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      --deck-width: ${input.canvas.width}px;
      --deck-height: ${input.canvas.height}px;
      --stage-bg: #000;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--stage-bg);
      color: #fff;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .deck-viewport {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: var(--stage-bg);
    }

    .deck-stage {
      position: absolute;
      left: 0;
      top: 0;
      width: var(--deck-width);
      height: var(--deck-height);
      overflow: hidden;
      transform-origin: 0 0;
      background: #fff;
    }

    .slide {
      position: absolute;
      inset: 0;
      width: var(--deck-width);
      height: var(--deck-height);
      overflow: hidden;
      display: block;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      background: #fff;
    }

    .slide.active,
    .slide.visible {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      z-index: 1;
    }

    .deck-controls {
      position: fixed;
      left: 50%;
      bottom: 22px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      transform: translateX(-50%);
      opacity: 0.88;
      transition: opacity 180ms ease;
      user-select: none;
    }

    .deck-controls:hover {
      opacity: 1;
    }

    .deck-button {
      appearance: none;
      display: inline-grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      font: inherit;
    }

    .deck-button:hover {
      background: rgba(255, 255, 255, 0.13);
      color: #fff;
    }

    .deck-count {
      min-width: 54px;
      padding: 0 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    @page {
      size: ${input.canvas.width}px ${input.canvas.height}px;
      margin: 0;
    }

    @media print {
      html,
      body {
        width: ${input.canvas.width}px;
        height: auto;
        overflow: visible;
        background: #fff;
      }

      .deck-viewport,
      .deck-stage {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        transform: none !important;
        background: none;
      }

      .slide {
        position: relative;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        width: ${input.canvas.width}px;
        height: ${input.canvas.height}px;
        break-after: page;
        page-break-after: always;
      }

      .slide:last-child {
        break-after: auto;
        page-break-after: auto;
      }

      .deck-controls {
        display: none !important;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.2s !important;
      }
    }
  </style>
</head>
<body>
  <div class="deck-viewport">
    <main class="deck-stage" id="deckStage" aria-live="polite">
${slides}
    </main>
  </div>
  <nav class="deck-controls" aria-label="Slide navigation">
    <button class="deck-button" type="button" data-prev aria-label="Previous slide">&lsaquo;</button>
    <div class="deck-count"><span data-current>1</span> / <span data-total>${input.slides.length}</span></div>
    <button class="deck-button" type="button" data-next aria-label="Next slide">&rsaquo;</button>
  </nav>
  <script>
    (() => {
      const stage = document.getElementById("deckStage");
      const slides = Array.from(document.querySelectorAll(".slide"));
      const current = document.querySelector("[data-current]");
      const total = document.querySelector("[data-total]");
      let index = 0;

      for (const slide of slides) {
        const template = slide.querySelector("template[data-slide-template]");
        if (!template) continue;
        const shadow = slide.attachShadow({ mode: "open" });
        shadow.append(template.content.cloneNode(true));
        template.remove();
      }

      function scaleStage() {
        const factor = Math.min(window.innerWidth / ${input.canvas.width}, window.innerHeight / ${input.canvas.height});
        const x = (window.innerWidth - ${input.canvas.width} * factor) / 2;
        const y = (window.innerHeight - ${input.canvas.height} * factor) / 2;
        stage.style.transform = \`translate(\${x}px, \${y}px) scale(\${factor})\`;
      }

      function setInnerState(slide, active) {
        const innerSlide = slide.shadowRoot?.querySelector(".slide");
        if (!innerSlide) return;
        innerSlide.classList.toggle("active", active);
        innerSlide.classList.toggle("visible", active);
      }

      function showSlide(nextIndex) {
        index = Math.max(0, Math.min(nextIndex, slides.length - 1));
        slides.forEach((slide, slideIndex) => {
          const active = slideIndex === index;
          slide.classList.toggle("active", active);
          slide.classList.toggle("visible", active);
          setInnerState(slide, active);
        });
        if (current) current.textContent = String(index + 1);
        if (total) total.textContent = String(slides.length);
        history.replaceState(null, "", \`#slide-\${index + 1}\`);
      }

      function go(delta) {
        showSlide(index + delta);
      }

      document.querySelector("[data-prev]")?.addEventListener("click", () => go(-1));
      document.querySelector("[data-next]")?.addEventListener("click", () => go(1));
      window.addEventListener("resize", scaleStage);
      window.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
          event.preventDefault();
          go(1);
        } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
          event.preventDefault();
          go(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          showSlide(0);
        } else if (event.key === "End") {
          event.preventDefault();
          showSlide(slides.length - 1);
        }
      });

      let touchStartX = 0;
      window.addEventListener("touchstart", (event) => {
        touchStartX = event.changedTouches[0]?.clientX ?? 0;
      }, { passive: true });
      window.addEventListener("touchend", (event) => {
        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const delta = endX - touchStartX;
        if (Math.abs(delta) > 48) go(delta < 0 ? 1 : -1);
      }, { passive: true });

      let wheelLocked = false;
      window.addEventListener("wheel", (event) => {
        if (wheelLocked || Math.abs(event.deltaY) < 40) return;
        wheelLocked = true;
        go(event.deltaY > 0 ? 1 : -1);
        window.setTimeout(() => {
          wheelLocked = false;
        }, 450);
      }, { passive: true });
      window.addEventListener("beforeprint", () => {
        slides.forEach((slide) => setInnerState(slide, true));
      });
      window.addEventListener("afterprint", () => {
        showSlide(index);
      });

      scaleStage();
      const hashMatch = window.location.hash.match(/slide-(\\d+)/);
      showSlide(hashMatch ? Number(hashMatch[1]) - 1 : 0);
    })();
  </script>
</body>
</html>`;
}

function renderDeckHtmlExportSlide(slide: DeckHtmlExportSlide) {
  return `      <section class="slide" data-slide-id="${escapeHtmlAttr(slide.id)}" aria-label="${escapeHtmlAttr(slide.label)}">
        <template data-slide-template>
          <style>
            :host {
              display: block;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #fff;
            }

            :host *,
            :host *::before,
            :host *::after {
              box-sizing: border-box;
            }

            .ai-slide-body {
              width: 100%;
              height: 100%;
              margin: 0;
              overflow: hidden;
              background: #fff;
            }
          </style>
          ${slide.headHtml}
          <div class="ai-slide-body"${slide.bodyAttrs}>${slide.bodyHtml}</div>
        </template>
      </section>`;
}

function isBlankDeckManifest(manifestPath: string) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<DeckManifest>;
    return manifest.schemaVersion === "ai-slide.deck.v1" && manifest.slides?.length === 1 && manifest.slides[0]?.file === "slides/01-cover.html";
  } catch {
    return true;
  }
}

function isGeneratedImageTemplateDeck(deckRoot: string, manifestPath: string) {
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Partial<DeckManifest>;
    const firstSlideFile = manifest.slides?.[0]?.file;
    if (!firstSlideFile) return false;
    const normalizedFile = normalize(firstSlideFile);
    if (normalizedFile.startsWith("..") || normalizedFile.includes(`..${sep}`)) return false;
    const html = readFileSync(join(deckRoot, normalizedFile), "utf8");
    return html.includes('data-ai-slide-object-id="template-image-') || html.includes("assets/template-images/");
  } catch {
    return false;
  }
}

function missingTemplateSlideHtml(title: string, fileName: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(fileName)}</title>
</head>
<body>
  <section style="width:1920px;height:1080px;box-sizing:border-box;padding:96px;font-family:Inter,system-ui,sans-serif;">
    <p style="margin:0 0 24px;color:#667085;font-size:28px;font-weight:700;">${escapeHtml(title)}</p>
    <h1 style="margin:0;color:#111827;font-size:72px;line-height:1.1;">Missing template slide: ${escapeHtml(fileName)}</h1>
  </section>
</body>
</html>
`;
}

function materializePptxProject(root: string, project: SlideProject, artifact: SlideArtifact) {
  const manifestPath = join(root, `${artifact.fileRef}.manifest.json`);
  if (!existsSync(manifestPath)) {
    const manifest = createEmptyPptxManifest();
    writeFileSync(manifestPath, `${JSON.stringify({ ...manifest, title: project.title }, null, 2)}\n`, "utf8");
  }
}

function pptxFilePath(projectId: string, artifact: SlideArtifact) {
  return join(projectWorkspaceRoot(projectId), artifact.fileRef);
}

function pptxManifestPath(projectId: string, artifact: SlideArtifact) {
  return join(projectWorkspaceRoot(projectId), `${artifact.fileRef}.manifest.json`);
}

async function readPptxManifestFromFile(projectId: string, artifact: SlideArtifact): Promise<PptxManifest> {
  try {
    const filePath = pptxFilePath(projectId, artifact);
    const [fileStat, bytes] = await Promise.all([stat(filePath), readFile(filePath)]);
    if (!fileStat.isFile()) return createEmptyPptxManifest();
    return {
      kind: "pptx",
      fileName: "slides.pptx",
      exists: true,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      sizeBytes: bytes.byteLength,
      updatedAt: fileStat.mtime.toISOString(),
    };
  } catch {
    return createEmptyPptxManifest();
  }
}

function readStoredPptxManifest(projectId: string, artifact: SlideArtifact) {
  try {
    return parsePptxManifest(readFileSync(pptxManifestPath(projectId, artifact), "utf8"));
  } catch {
    return createEmptyPptxManifest();
  }
}

function writeDeckManifest(projectId: string, artifact: SlideArtifact, manifest: DeckManifest) {
  writeFileSync(join(projectWorkspaceRoot(projectId), artifact.fileRef, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function normalizeSlideListItem(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Slide file names cannot be empty");
  if (trimmed.split(/[\\/]+/).includes("..")) throw new Error(`Invalid slide file path "${value}". Parent directories are not allowed.`);
  const normalized = normalize(trimmed).replace(/\\/g, "/");
  const withoutPrefix = normalized.startsWith("slides/") ? normalized.slice("slides/".length) : normalized;
  if (withoutPrefix.startsWith("/") || withoutPrefix.startsWith("../") || withoutPrefix.includes("/../") || withoutPrefix.includes("/")) {
    throw new Error(`Invalid slide file path "${value}". Use file names like "01-cover.html" or "slides/01-cover.html".`);
  }
  if (!withoutPrefix.toLowerCase().endsWith(".html")) throw new Error(`Slide file must be an HTML file: "${value}"`);
  return withoutPrefix;
}

function assertIndexedSlideNames(slides: string[]) {
  const invalid = slides.find((fileName) => !/^\d{2,}[-_][^/]+\.html$/i.test(fileName));
  if (invalid) {
    throw new Error(`Slide files must use an indexed name like "01-cover.html"; invalid file: "${invalid}"`);
  }
}

function assertSameSlideSet(filesystemSlides: string[], requestedSlides: string[]) {
  const filesystemSet = new Set(filesystemSlides);
  const requestedSet = new Set(requestedSlides);
  if (requestedSet.size !== requestedSlides.length) throw new Error("Slide order contains duplicate file names");
  const missing = filesystemSlides.filter((fileName) => !requestedSet.has(fileName));
  const unknown = requestedSlides.filter((fileName) => !filesystemSet.has(fileName));
  if (missing.length || unknown.length) {
    const parts = [];
    if (missing.length) parts.push(`missing from requested order: ${missing.join(", ")}`);
    if (unknown.length) parts.push(`not found on disk: ${unknown.join(", ")}`);
    throw new Error(`Slide order must match files in deck.slides/slides (${parts.join("; ")}).`);
  }
}

function compareIndexedSlideNames(left: string, right: string) {
  const leftIndex = slideNameIndex(left);
  const rightIndex = slideNameIndex(right);
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.localeCompare(right);
}

function slideNameIndex(fileName: string) {
  const match = /^(\d+)/.exec(fileName);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function nextSlideId(usedIds: Set<string>, preferredIndex: number) {
  let index = preferredIndex + 1;
  while (true) {
    const id = `slide-${String(index).padStart(3, "0")}`;
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
    index += 1;
  }
}

function writeStoredPptxManifest(projectId: string, artifact: SlideArtifact, manifest: PptxManifest) {
  writeFileSync(pptxManifestPath(projectId, artifact), `${serializePptxManifest(manifest)}\n`, "utf8");
}

function projectAgentInstructions(artifact: SlideArtifact) {
  const projectAssets = projectAssetInstructions(artifact.projectId);
  if (artifact.type === "pptx") {
    const targetPptxPath = join(projectWorkspaceRoot(artifact.projectId), artifact.fileRef);
    return [
      "# AI Slide Workspace",
      "",
      "You are editing a slide presentation with the local AI Slide app.",
      `Current focused file: ${targetPptxPath}`,
      "When asked to create or edit the presentation as PPTX, write the final file to the focused file with filesystem tools.",
      projectAssets,
    ].join("\n");
  }
  const targetDeckPath = join(projectWorkspaceRoot(artifact.projectId), artifact.fileRef);
  return [
    "# AI Slide Workspace",
    "",
    "You are editing a slide deck with the local AI Slide app.",
    `Current focused directory: ${targetDeckPath}`,
    "Use `slides/*.html` as the editable source for individual slides. Slide files must use indexed names such as `01-cover.html`.",
    "Mark editable slide elements with `data-object=\"true\"`. Text or mixed content blocks should use `data-object-type=\"textbox\"`; standalone images should use `data-object-type=\"image\"`.",
    "Use `manifest.json` for app-maintained title, canvas, and the current playlist; do not manually edit `manifest.slides` for ordering.",
    "After adding, deleting, renaming, or reordering slide files, call the `reorder_slides` app tool.",
    "Before finishing, review every slide you changed against the fixed canvas contract: no browser scrolling, no meaningful content outside the canvas, no clipped text, and no overlapping body content.",
    "If the content does not fit comfortably, split it into additional indexed slides instead of shrinking text below readable size or hiding overflow.",
    "To rename the project, call the `set_project_title` app tool.",
    "If MCP app tools are not visible, call the run-scoped HTTP fallback with `$AI_APP_TOOL_GATEWAY_URL` and `$AI_APP_TOOL_TOKEN` instead of editing app databases or importing server repositories directly.",
    "Do not collapse the deck into a single HTML file.",
    projectAssets,
  ].join("\n");
}

function projectAssetInstructions(projectId: string) {
  const assets = listProjectAssets(projectId);
  if (assets.length === 0) return "";
  return [
    "",
    "Project context attachments:",
    ...assets.map((asset) => `- ${asset.fileName} (${asset.mimeType}, ${asset.sizeBytes} bytes): ${asset.path}`),
    "Use these files as source context when they are relevant to the user's request.",
  ].join("\n");
}

function listProjectAssets(projectId: string) {
  const assetsDir = join(projectWorkspaceRoot(projectId), "assets");
  if (!existsSync(assetsDir)) return [];
  return readdirSync(assetsDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const absolutePath = join(assetsDir, entry.name);
      return {
        fileName: entry.name,
        path: `./assets/${entry.name}`,
        mimeType: mimeTypeForAssetFileName(entry.name),
        sizeBytes: statSync(absolutePath).size,
      };
    });
}

function mimeTypeForAssetFileName(fileName: string) {
  const ext = extname(fileName).toLowerCase();
  if (ext === ".csv") return "text/csv";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".gif") return "image/gif";
  if (ext === ".htm" || ext === ".html") return "text/html";
  if (ext === ".jpeg" || ext === ".jpg") return "image/jpeg";
  if (ext === ".json") return "application/json";
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".png") return "image/png";
  if (ext === ".ppt") return "application/vnd.ms-powerpoint";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (ext === ".rtf") return "application/rtf";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".txt") return "text/plain";
  if (ext === ".webp") return "image/webp";
  if (ext === ".xls") return "application/vnd.ms-excel";
  if (ext === ".xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  return "application/octet-stream";
}

function appRoot() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(currentDir, "../../../.."),
    resolve(process.cwd(), ".."),
    resolve(process.cwd(), "apps", "slide"),
  ];
  return candidates.find((candidate) => existsSync(join(candidate, "package.json"))) ?? resolve(process.cwd(), "..");
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function rowToProject(row: ProjectRow): SlideProject {
  return {
    id: row.id,
    title: row.title,
    activeArtifactId: row.active_artifact_id,
    templateId: row.template_id,
    templateName: row.template_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToArtifact(row: ArtifactRow): SlideArtifact {
  return {
    id: row.id,
    projectId: row.project_id,
    type: row.type,
    fileRef: row.file_ref,
    mimeType: row.mime_type,
    revision: row.revision,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function resolveDeckSlidePath(projectId: string, artifact: SlideArtifact, file: string) {
  const deckRoot = join(projectWorkspaceRoot(projectId), artifact.fileRef);
  const normalizedFile = normalize(file);
  if (normalizedFile.startsWith("..") || normalizedFile.includes(`${sep}..${sep}`) || normalizedFile.startsWith(sep)) {
    throw new Error("Invalid slide path");
  }
  return join(deckRoot, normalizedFile);
}

interface ProjectRow {
  id: string;
  title: string;
  active_artifact_id: string;
  template_id: string | null;
  template_name: string | null;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}

interface ArtifactRow {
  id: string;
  project_id: string;
  type: "deck" | "pptx";
  file_ref: string;
  mime_type: string;
  revision: number;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}
