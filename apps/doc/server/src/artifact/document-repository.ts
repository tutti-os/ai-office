import { rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import {
  createEmptyDocxDocumentManifest,
  defaultHtmlDocument,
  type DocumentProject,
  type DocumentRun,
  type DocumentRunEvent,
  type UpdateProjectRequest,
} from "@ai-doc/shared";
import { defaultRuntimeProfiles, RuntimeProfileStore, SqliteAgentConversationStore, SqliteRunStore } from "@ai-app/shared/project-store";
import { getDb } from "../db/database.js";
import { appPaths, ensureBaseDirs, ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";

export class DocumentRepository {
  private readonly conversations = new SqliteAgentConversationStore(getDb, {
    createSessionId: randomUUID,
    createMessageId: randomUUID,
  });
  private readonly runs = new SqliteRunStore<DocumentRun, DocumentRunEvent>(getDb, {
    runsTable: "document_runs",
    eventsTable: "document_run_events",
    createRunId: randomUUID,
    createEventId: randomUUID,
  });
  private readonly runtimeProfiles = new RuntimeProfileStore(getDb, {
    defaultProfiles: defaultRuntimeProfiles({
      demoModel: "html-demo",
      demoDisplayName: "Demo HTML editor",
    }),
    normalize: (database) => {
      database
        .prepare(`UPDATE runtime_profiles SET model = 'codex:default', updated_at = ? WHERE id = 'local-agent:codex' AND model = 'codex:gpt-5'`)
        .run(new Date().toISOString());
    },
  });

  ensureSeedData() {
    this.runtimeProfiles.ensureSeedData();
    const row = getDb().prepare(`SELECT COUNT(*) AS count FROM projects`).get() as { count: number };
    if (row.count > 0) return;
    this.createProject({ title: "Untitled Doc", content: defaultHtmlDocument, type: "html", templateId: null, templateName: null });
  }

  interruptActiveRuns(reason: string) {
    return this.runs.interruptActiveRuns(reason);
  }

  snapshot() {
    const db = getDb();
    return {
      projects: rows<ProjectRow>(db.prepare(`SELECT * FROM projects ORDER BY updated_at DESC`).all()).map(rowToProject),
      runtimeProfiles: this.runtimeProfiles.list(),
      activeRuns: this.runs.listActiveRuns(),
      runEvents: this.runs.listRecentRunEvents(),
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
      DELETE FROM agent_conversation_messages;
      DELETE FROM agent_conversation_sessions;
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

  updateRun(runId: string, input: Partial<Pick<DocumentRun, "status" | "error" | "resultPreview">>) {
    return this.runs.updateRun(runId, input);
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
    return this.runs.createRunEvent(input);
  }

  listRunEvents(runId: string) {
    return this.runs.listRunEvents(runId);
  }

  getRuntimeProfile(profileId: string | null | undefined) {
    return this.runtimeProfiles.get(profileId);
  }

  getRuntimeProfileForRun(run: Pick<DocumentRun, "runtime" | "provider" | "model">) {
    return this.runtimeProfiles.getForRun(run);
  }

  getDefaultRuntimeProfile() {
    return this.runtimeProfiles.getDefault();
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
