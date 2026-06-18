import { rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { nanoid } from "nanoid";
import {
  createEmptyDocxDocumentManifest,
  defaultHtmlDocument,
  type DocumentProject,
  type DocumentRun,
  type DocumentRunEvent,
  type RuntimeProfile,
  type UpdateProjectRequest,
} from "@ai-doc/shared";
import { getDb, json, parseJson } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";

export class DocumentRepository {
  ensureSeedData() {
    this.ensureRuntimeProfiles();
    this.normalizeRuntimeProfiles();
    const row = getDb().prepare(`SELECT COUNT(*) AS count FROM projects`).get() as { count: number };
    if (row.count > 0) return;
    this.createProject({ title: "Untitled Doc", content: defaultHtmlDocument, type: "html", templateId: null, templateName: null });
  }

  interruptActiveRuns(reason: string) {
    const activeRuns = rows<DocumentRunRow>(
      getDb().prepare(`SELECT * FROM document_runs WHERE status IN ('accepted', 'running') ORDER BY created_at ASC`).all(),
    ).map(rowToRun);
    for (const run of activeRuns) {
      this.updateRun(run.id, { status: "failed", error: reason });
    }
    return activeRuns;
  }

  snapshot() {
    const db = getDb();
    return {
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      runtimeProfiles: rows<RuntimeProfileRow>(db.prepare(`SELECT * FROM runtime_profiles ORDER BY created_at ASC`).all()).map(rowToRuntimeProfile),
      activeRuns: (
        rows<DocumentRunRow>(db.prepare(`SELECT * FROM document_runs WHERE status IN ('accepted', 'running') ORDER BY created_at ASC`).all())
      ).map(rowToRun),
      runEvents: (
        rows<DocumentRunEventRow>(db.prepare(`SELECT * FROM document_run_events ORDER BY created_at ASC LIMIT 300`).all())
      ).map(rowToRunEvent),
      lastSeq: (db.prepare(`SELECT COALESCE(MAX(seq), 0) AS seq FROM stream_events`).get() as { seq: number }).seq,
    };
  }

  createProject(input: { title: string; content: string; type: DocumentProject["type"]; templateId: string | null; templateName: string | null }) {
    const id = randomUUID();
    const now = new Date().toISOString();
    ensureProjectDirs(id);
    getDb()
      .prepare(
        `INSERT INTO projects (id, title, type, content, template_id, template_name, updated_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'system', ?, ?)`,
      )
      .run(id, input.title, input.type, input.content, input.templateId, input.templateName, now, now);
    const project = this.getProject(id);
    if (!project) throw new Error("Unable to create project");
    this.materializeProject(project);
    return project;
  }

  listProjects() {
    return rows<ProjectRow>(getDb().prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject);
  }

  clearProjectHistory() {
    const db = getDb();
    db.exec(`
      DELETE FROM document_run_events;
      DELETE FROM document_runs;
      DELETE FROM stream_events;
      DELETE FROM projects;
    `);
    rmSync(appPaths.projectsDir, { force: true, recursive: true });
    ensureBaseDirs();
    return { projects: [] as DocumentProject[] };
  }

  getProject(projectId: string) {
    const row = rowOrNull<ProjectRow>(getDb().prepare(`SELECT * FROM projects WHERE id = ?`).get(projectId));
    return row ? rowToProject(row) : null;
  }

  updateProject(projectId: string, input: UpdateProjectRequest) {
    const current = this.getProject(projectId);
    if (!current) return null;
    const now = new Date().toISOString();
    const next = {
      title: input.title === undefined ? current.title : input.title.trim() || current.title,
      type: input.type ?? current.type,
      content: input.content ?? current.content,
      updatedBy: input.updatedBy ?? "human",
    };
    getDb()
      .prepare(
        `UPDATE projects
         SET title = ?, type = ?, content = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(next.title, next.type, next.content, next.updatedBy, now, projectId);
    const updated = this.getProject(projectId);
    if (updated) this.materializeProject(updated);
    return updated;
  }

  syncProjectAgentInstructions(projectId: string) {
    const project = this.getProject(projectId);
    if (!project) return null;
    this.writeProjectAgentInstructions(project);
    return project;
  }

  setProjectTemplate(projectId: string, template: { id: string; name: string }) {
    getDb().prepare(`UPDATE projects SET template_id = ?, template_name = ? WHERE id = ?`).run(template.id, template.name, projectId);
    return this.getProject(projectId);
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
    const id = nanoid();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO document_runs
         (id, project_id, runtime, provider, model, status, mode, instruction, selection_type, selection_path, selected_text, selected_html, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'accepted', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.projectId,
        input.runtime,
        input.provider,
        input.model,
        input.mode,
        input.instruction,
        input.selectionType,
        input.selectionPath,
        input.selectedText,
        input.selectedHtml,
        now,
        now,
      );
    const run = this.getRun(id);
    if (!run) throw new Error("Unable to create run");
    return run;
  }

  getRun(runId: string) {
    const row = rowOrNull<DocumentRunRow>(getDb().prepare(`SELECT * FROM document_runs WHERE id = ?`).get(runId));
    return row ? rowToRun(row) : null;
  }

  listProjectRuns(projectId: string) {
    return (
      rows<DocumentRunRow>(
        getDb()
        .prepare(`SELECT * FROM document_runs WHERE project_id = ? ORDER BY created_at ASC, id ASC`)
        .all(projectId),
      )
    ).map(rowToRun);
  }

  updateRun(runId: string, input: Partial<Pick<DocumentRun, "status" | "error" | "resultPreview">>) {
    const current = this.getRun(runId);
    if (!current) return null;
    const now = new Date().toISOString();
    const completedAt = input.status && ["completed", "failed", "cancelled"].includes(input.status) ? now : current.completedAt;
    getDb()
      .prepare(
        `UPDATE document_runs
         SET status = ?, error = ?, result_preview = ?, updated_at = ?, completed_at = ?
         WHERE id = ?`,
      )
      .run(input.status ?? current.status, input.error ?? current.error, input.resultPreview ?? current.resultPreview, now, completedAt, runId);
    return this.getRun(runId);
  }

  createRunEvent(input: {
    runId: string;
    projectId: string;
    type: DocumentRunEvent["type"];
    content?: string;
    status?: DocumentRunEvent["status"];
    metadata?: Record<string, unknown> | null;
    sortOrder: number;
  }) {
    const id = nanoid();
    const now = new Date().toISOString();
    getDb()
      .prepare(
        `INSERT INTO document_run_events (id, run_id, project_id, type, content, status, metadata, sort_order, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.runId,
        input.projectId,
        input.type,
        input.content ?? "",
        input.status ?? "success",
        input.metadata ? json(input.metadata) : null,
        input.sortOrder,
        now,
      );
    const row = rowOrNull<DocumentRunEventRow>(getDb().prepare(`SELECT * FROM document_run_events WHERE id = ?`).get(id));
    if (!row) throw new Error("Unable to create run event");
    return rowToRunEvent(row);
  }

  listRunEvents(runId: string) {
    return (
      rows<DocumentRunEventRow>(
        getDb()
        .prepare(`SELECT * FROM document_run_events WHERE run_id = ? ORDER BY sort_order ASC, created_at ASC`)
        .all(runId),
      )
    ).map(rowToRunEvent);
  }

  getRuntimeProfile(profileId: string | null | undefined) {
    if (!profileId) return this.getDefaultRuntimeProfile();
    const row = rowOrNull<RuntimeProfileRow>(getDb().prepare(`SELECT * FROM runtime_profiles WHERE id = ? AND enabled = 1`).get(profileId));
    return row ? rowToRuntimeProfile(row) : this.getDefaultRuntimeProfile();
  }

  getRuntimeProfileForRun(run: Pick<DocumentRun, "runtime" | "provider" | "model">) {
    const row = rowOrNull<RuntimeProfileRow>(
      getDb()
        .prepare(`SELECT * FROM runtime_profiles WHERE kind = ? AND provider = ? AND model = ? AND enabled = 1 LIMIT 1`)
        .get(run.runtime, run.provider, run.model),
    );
    if (row) return rowToRuntimeProfile(row);
    const fallback = rowOrNull<RuntimeProfileRow>(
      getDb()
        .prepare(`SELECT * FROM runtime_profiles WHERE kind = ? AND provider = ? AND enabled = 1 ORDER BY created_at ASC LIMIT 1`)
        .get(run.runtime, run.provider),
    );
    return fallback ? rowToRuntimeProfile(fallback) : this.getDefaultRuntimeProfile();
  }

  getDefaultRuntimeProfile() {
    const row = rowOrNull<RuntimeProfileRow>(
      getDb()
        .prepare(`SELECT * FROM runtime_profiles WHERE enabled = 1 ORDER BY kind = 'local-agent' DESC, created_at ASC LIMIT 1`)
        .get(),
    );
    if (!row) throw new Error("No runtime profile configured");
    return rowToRuntimeProfile(row);
  }

  private ensureRuntimeProfiles() {
    const count = (getDb().prepare(`SELECT COUNT(*) AS count FROM runtime_profiles`).get() as { count: number }).count;
    if (count > 0) return;
    const now = new Date().toISOString();
    const profiles: Array<Omit<RuntimeProfile, "createdAt" | "updatedAt">> = [
      {
        id: "local-agent:codex",
        kind: "local-agent",
        provider: "codex",
        model: "codex:default",
        displayName: "Codex",
        enabled: true,
        capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
      },
      {
        id: "local-agent:claude",
        kind: "local-agent",
        provider: "claude",
        model: "claude:default",
        displayName: "Claude Code",
        enabled: true,
        capabilities: { streaming: true, toolUse: true, reasoning: true, resume: true },
      },
      {
        id: "server-demo",
        kind: "server-demo",
        provider: "demo",
        model: "html-demo",
        displayName: "Demo HTML editor",
        enabled: true,
        capabilities: { streaming: false, toolUse: false, reasoning: false, resume: false },
      },
    ];
    for (const profile of profiles) {
      getDb()
        .prepare(
          `INSERT INTO runtime_profiles (id, kind, provider, model, display_name, enabled, capabilities, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(profile.id, profile.kind, profile.provider, profile.model, profile.displayName, profile.enabled ? 1 : 0, json(profile.capabilities), now, now);
    }
  }

  private normalizeRuntimeProfiles() {
    getDb()
      .prepare(`UPDATE runtime_profiles SET model = 'codex:default', updated_at = ? WHERE id = 'local-agent:codex' AND model = 'codex:gpt-5'`)
      .run(new Date().toISOString());
  }

  private materializeProject(project: DocumentProject) {
    const root = ensureProjectDirs(project.id);
    if (project.type === "docx") {
      writeFileSync(join(root, "document.json"), project.content || JSON.stringify(createEmptyDocxDocumentManifest()), "utf8");
    } else if (project.type === "markdown") {
      writeFileSync(join(root, "document.md"), project.content, "utf8");
    } else {
      writeFileSync(join(root, "document.html"), project.content, "utf8");
    }
    this.writeProjectAgentInstructions(project);
  }

  private writeProjectAgentInstructions(project: DocumentProject) {
    const root = ensureProjectDirs(project.id);
    writeFileSync(join(root, "AGENTS.md"), projectAgentInstructions(project), "utf8");
  }
}

function projectAgentInstructions(project: DocumentProject) {
  if (project.type === "docx") return docxProjectAgentInstructions(project);
  if (project.type === "markdown") return markdownProjectAgentInstructions(project);
  return htmlProjectAgentInstructions(project);
}

function htmlProjectAgentInstructions(project: DocumentProject) {
  const targetHtmlPath = join(projectWorkspaceRoot(project.id), "document.html");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a rich HTML doc with the local AI Doc app.",
    `Current focused file: ${targetHtmlPath}`,
    "Read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
  ].join("\n");
}

function markdownProjectAgentInstructions(project: DocumentProject) {
  const targetMarkdownPath = join(projectWorkspaceRoot(project.id), "document.md");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Markdown doc with the local AI Doc app.",
    `Current focused file: ${targetMarkdownPath}`,
    "Read and edit the focused file directly with filesystem tools. The app watches workspace files and refreshes the preview when content changes.",
  ].join("\n");
}

function docxProjectAgentInstructions(project: DocumentProject) {
  const targetDocxPath = join(projectWorkspaceRoot(project.id), "document.docx");
  return [
    "# AI Doc Workspace",
    "",
    "You are editing a Word doc project with the local AI Doc app.",
    `Current focused file: ${targetDocxPath}`,
    "When you create or edit the Word doc, write the final result to the focused file with filesystem tools.",
    "The app watches that file and refreshes the preview when its content changes.",
  ].join("\n");
}

interface ProjectRow {
  id: string;
  title: string;
  type: "html" | "markdown" | "docx";
  content: string;
  template_id: string | null;
  template_name: string | null;
  updated_by: "human" | "ai" | "system";
  created_at: string;
  updated_at: string;
}

interface RuntimeProfileRow {
  id: string;
  kind: "server-demo" | "local-agent";
  provider: string;
  model: string;
  display_name: string;
  enabled: number;
  capabilities: string;
  created_at: string;
  updated_at: string;
}

interface DocumentRunRow {
  id: string;
  project_id: string;
  runtime: string;
  provider: string;
  model: string;
  status: DocumentRun["status"];
  mode: "rewrite" | "write";
  instruction: string;
  selection_type: "text" | "element" | "write";
  selection_path: string;
  selected_text: string;
  selected_html: string;
  result_preview: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

interface DocumentRunEventRow {
  id: string;
  run_id: string;
  project_id: string;
  type: DocumentRunEvent["type"];
  content: string;
  status: DocumentRunEvent["status"];
  metadata: string | null;
  sort_order: number;
  created_at: string;
}

function rowToProject(row: ProjectRow): DocumentProject {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    content: row.content,
    templateId: row.template_id,
    templateName: row.template_name,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rows<TRow>(value: unknown): TRow[] {
  return value as TRow[];
}

function rowOrNull<TRow>(value: unknown): TRow | null {
  return (value ?? null) as TRow | null;
}

function rowToRuntimeProfile(row: RuntimeProfileRow): RuntimeProfile {
  return {
    id: row.id,
    kind: row.kind,
    provider: row.provider,
    model: row.model,
    displayName: row.display_name,
    enabled: row.enabled === 1,
    capabilities: parseJson(row.capabilities, { streaming: false, toolUse: false, reasoning: false, resume: false }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRun(row: DocumentRunRow): DocumentRun {
  return {
    id: row.id,
    projectId: row.project_id,
    runtime: row.runtime,
    provider: row.provider,
    model: row.model,
    status: row.status,
    mode: row.mode,
    instruction: row.instruction,
    selectionType: row.selection_type,
    selectionPath: row.selection_path,
    selectedText: row.selected_text,
    selectedHtml: row.selected_html,
    resultPreview: row.result_preview,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    error: row.error,
  };
}

function rowToRunEvent(row: DocumentRunEventRow): DocumentRunEvent {
  return {
    id: row.id,
    runId: row.run_id,
    projectId: row.project_id,
    type: row.type,
    content: row.content,
    status: row.status,
    metadata: row.metadata ? parseJson(row.metadata, null) : null,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };
}
