import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { copyFile, readFile, stat, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { basename, dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBlankDeckManifest,
  createEmptyPptxManifest,
  deckArtifactFileRef,
  deckMimeType,
  isSupportedDeckCanvas,
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
import { defaultDeckSkillFiles, defaultDeckSkillSlug } from "./default-deck-skill.js";

const templateRoots = templateSourceRoots();

type TemplateDeckSource = {
  title: string;
  canvas: { width: number; height: number };
  pagesDir: string;
  assetsDir: string;
  playlist: string[];
};

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

  createProject(input: CreateProjectRequest) {
    const id = randomUUID();
    const artifactType = input.artifactType ?? "deck";
    if (artifactType === "deck" && input.templateId) assertTemplateDeckSourceAvailable(input.templateId);
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
    this.materializeProject(project, createdArtifact);
    return { project, artifact: createdArtifact };
  }

  async importPptxProjectFromFile(input: { sourcePath: string; title?: string }) {
    const sourcePath = resolve(input.sourcePath);
    const sourceStat = await stat(sourcePath);
    if (!sourceStat.isFile()) throw new Error("PPTX source is not a file");
    if (extname(sourcePath).toLowerCase() !== ".pptx") throw new Error("PPTX source must end with .pptx");

    const title = input.title?.trim() || basename(sourcePath, extname(sourcePath));
    const created = this.createProject({ title, artifactType: "pptx" });
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
    this.ensureTemplateDeckMaterialized(project, artifact);
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
    this.ensureTemplateDeckMaterialized(project, artifact);
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
    this.ensureTemplateDeckMaterialized(project, artifact);
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
    this.ensureTemplateDeckMaterialized(project, artifact);
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
    this.ensureTemplateDeckMaterialized(project, artifact);
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

  async writeProjectExport(projectId: string, input: { fileName: string; mimeType: string; bytes: Buffer }) {
    const project = this.getProject(projectId);
    if (!project) throw new Error("Project not found");
    const artifact = this.getArtifact(project.activeArtifactId);
    if (!artifact || artifact.type !== "deck") throw new Error("Deck artifact not found");
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

  ensureTemplateDeckMaterialized(project: SlideProject, artifact: SlideArtifact) {
    if (artifact.type !== "deck" || !project.templateId) return;
    const deckRoot = join(projectWorkspaceRoot(project.id), artifact.fileRef);
    const manifestPath = join(deckRoot, "manifest.json");
    if (!isBlankDeckManifest(manifestPath) && !isGeneratedImageTemplateDeck(deckRoot, manifestPath)) return;
    if (!materializeTemplateDeckProject(deckRoot, project)) {
      throw new Error(`Template HTML source is missing for "${project.templateId}". Run sync:templates with AI_SLIDE_TEMPLATE_ROOT pointing at the template source directory.`);
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

  private materializeProject(project: SlideProject, artifact: SlideArtifact) {
    const root = ensureProjectDirs(project.id);
    if (artifact.type === "deck") materializeDeckProject(root, project, artifact);
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

function materializeDeckProject(root: string, project: SlideProject, artifact: SlideArtifact) {
  const deckRoot = join(root, artifact.fileRef);
  const manifestPath = join(deckRoot, "manifest.json");
  const createdAt = project.createdAt;
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });
  if (project.templateId && materializeTemplateDeckProject(deckRoot, project)) return;
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

function materializeTemplateDeckProject(deckRoot: string, project: SlideProject) {
  const source = readTemplateDeckSource(project.templateId);
  return source ? materializeTemplateDeckSource(deckRoot, project, source) : false;
}

function assertTemplateDeckSourceAvailable(templateId: string) {
  if (readTemplateDeckSource(templateId)) return;
  throw new Error(`Template HTML source is missing for "${templateId}". Run sync:templates with AI_SLIDE_TEMPLATE_ROOT pointing at the template source directory.`);
}

function materializeTemplateDeckSource(deckRoot: string, project: SlideProject, source: TemplateDeckSource) {
  rmSync(deckRoot, { force: true, recursive: true });
  mkdirSync(join(deckRoot, "slides"), { recursive: true });
  mkdirSync(join(deckRoot, "assets"), { recursive: true });
  mkdirSync(join(deckRoot, "previews"), { recursive: true });
  mkdirSync(join(deckRoot, "thumbnails"), { recursive: true });

  if (existsSync(source.assetsDir)) {
    cpSync(source.assetsDir, join(deckRoot, "assets"), { recursive: true });
  }

  const slides = source.playlist.map((fileName, index) => {
    const sourcePage = join(source.pagesDir, fileName);
    const destinationFile = fileName.replace(/[\\/]/g, "-");
    const destinationPage = join(deckRoot, "slides", destinationFile);
    if (existsSync(sourcePage)) cpSync(sourcePage, destinationPage);
    else writeFileSync(destinationPage, missingTemplateSlideHtml(project.title, fileName), "utf8");
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

function readTemplateDeckSource(templateId: string | null) {
  if (!templateId) return null;
  const templateDir = templateRoots.map((root) => join(root, templateId)).find((candidate) => existsSync(candidate));
  if (!templateDir) return null;
  const deckDir = join(templateDir, "deck");
  const pagesDir = join(templateDir, "pages");
  if (!existsSync(deckDir) || !existsSync(pagesDir)) return null;
  const slidesDirName = readdirSync(deckDir, { withFileTypes: true }).find((entry) => entry.isDirectory() && entry.name.endsWith(".slides"))?.name;
  if (!slidesDirName) return null;
  const manifestPath = join(deckDir, slidesDirName, "manifest.json");
  if (!existsSync(manifestPath)) return null;
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    metadata?: { title?: string };
    canvas?: { width?: number; height?: number };
    playlist?: string[];
  };
  const playlist = (manifest.playlist ?? []).filter((item) => typeof item === "string" && item.endsWith(".html"));
  if (!playlist.length) return null;
  const canvas = {
    width: Number.isFinite(manifest.canvas?.width) ? Number(manifest.canvas?.width) : 1920,
    height: Number.isFinite(manifest.canvas?.height) ? Number(manifest.canvas?.height) : 1080,
  };
  if (!isSupportedDeckCanvas(canvas)) return null;
  return {
    title: manifest.metadata?.title ?? "",
    canvas,
    pagesDir,
    assetsDir: join(templateDir, "assets"),
    playlist,
  };
}

function syncProjectTemplateSkill(projectRoot: string, project: SlideProject, artifact: SlideArtifact) {
  if (artifact.type !== "deck" || !project.templateId) return;
  const sourceDir = readTemplateSkillSource(project.templateId);
  if (!sourceDir) return;
  const skillRoot = join(projectRoot, ".ai-slide", "skills", safeSkillSlug(project.templateId));
  rmSync(skillRoot, { force: true, recursive: true });
  mkdirSync(skillRoot, { recursive: true });
  cpSync(join(sourceDir, "SKILL.md"), join(skillRoot, "SKILL.md"));
  for (const entry of readdirSync(sourceDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !/^references?$/i.test(entry.name)) continue;
    cpSync(join(sourceDir, entry.name), join(skillRoot, entry.name), { recursive: true });
  }
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
  const templateDir = templateRoots.map((root) => join(root, templateId)).find((candidate) => existsSync(candidate));
  if (!templateDir) return null;
  return existsSync(join(templateDir, "SKILL.md")) ? templateDir : null;
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
  const ext = extname(clean).toLowerCase() === ".pptx" ? ".pptx" : extensionForExportMimeType(mimeType);
  const stem = basename(clean || "slides", extname(clean)).replace(/\.+$/g, "") || "slides";
  return `${stem}${ext}`;
}

function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "image/svg+xml") return ".svg";
  return ".bin";
}

function extensionForExportMimeType(mimeType: string) {
  if (mimeType === pptxMimeType) return ".pptx";
  return ".pptx";
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
  if (artifact.type === "pptx") {
    const targetPptxPath = join(projectWorkspaceRoot(artifact.projectId), artifact.fileRef);
    return [
      "# AI Slide Workspace",
      "",
      "You are editing a slide presentation with the local AI Slide app.",
      `Current focused file: ${targetPptxPath}`,
      "When asked to create or edit the presentation as PPTX, write the final file to the focused file with filesystem tools.",
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
  ].join("\n");
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

function templateSourceRoots() {
  const root = appRoot();
  return [
    process.env.AI_SLIDE_TEMPLATE_ROOT ? resolve(process.env.AI_SLIDE_TEMPLATE_ROOT) : "",
    resolve(root, "templates", "source"),
    resolve(root, "../../../tutti/slide/template"),
    resolve(root, "../../../genspark/slide/template"),
  ].filter(Boolean);
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
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
