import type { DocumentProject, DocumentType, OfficeCliStatus } from "@ai-doc/shared";
import { createInitialPromptAiEditRequest, initialContentForType } from "./documentWorkbenchContent";
import { pushDocumentRoute, type AppRoute } from "./documentWorkbenchRoutes";
import { reportUserActive } from "./tuttiActivity";
import { fetchTuttiStudyPlanFixture } from "../api/fixtures";
import { installOfficeCli, fetchOfficeCliStatus } from "../api/runtime";
import { clearProjectHistory, createProject, deleteProject, importProjectFile, listProjects, startAiEdit, uploadContextAttachment } from "../api/projects";
import type { HomeAttachment } from "./useHomeAttachments";
import type { RuntimeState } from "../artifact/runtime/types";
import type { HomePanel } from "./runtimeWorkbenchTypes";
import type { TuttiTemplate } from "../templates/tuttiTemplates";
import type { useI18n } from "../i18n";

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type HomeAttachmentsState = {
  attachments: HomeAttachment[];
  clearAttachments: () => void;
};

type HomeDocumentActionsInput = {
  homeAttachments: HomeAttachmentsState;
  loadHtmlDocument: (html: string, input: { projectId?: string | null; title: string; source?: RuntimeState["source"] }) => void;
  outputType: DocumentType;
  parentPath: string;
  prompt: string;
  selectedRuntimeProfileId: string;
  tshWorkspaceApp: boolean;
  setError: (value: string) => void;
  setHistoryProjects: StateSetter<DocumentProject[]>;
  setHomePanel: (value: HomePanel) => void;
  setLoading: (value: boolean) => void;
  setOfficeCliInstalling: (value: boolean) => void;
  setOfficeCliStatus: (value: OfficeCliStatus) => void;
  setPrompt: (value: string) => void;
  setRoute: (route: AppRoute) => void;
  t: ReturnType<typeof useI18n>["t"];
};

function createRequestExtras(input: HomeDocumentActionsInput) {
  return input.tshWorkspaceApp ? { parentPath: input.parentPath.trim() || "/workspace" } : {};
}

export function createHomeDocumentActions(input: HomeDocumentActionsInput) {
  const openProject = (project: { id: string }) => {
    input.setRoute(pushDocumentRoute(project.id));
  };

  const refreshProjectHistory = async () => {
    const projects = await listProjects();
    input.setHistoryProjects(projects);
    return projects;
  };

  const downloadOfficeCli = async () => {
    input.setError("");
    input.setOfficeCliInstalling(true);
    try {
      const response = await installOfficeCli();
      input.setOfficeCliStatus(response.officecli);
      if (!response.officecli.available) input.setError(response.officecli.reason ?? input.t("error.officeCliInstall"));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
      try {
        const response = await fetchOfficeCliStatus();
        input.setOfficeCliStatus(response.officecli);
      } catch {
        // Keep the original install error visible.
      }
    } finally {
      input.setOfficeCliInstalling(false);
    }
  };

  const loadBlankDocument = async (typeOverride?: DocumentType) => {
    const type = typeOverride ?? input.outputType;
    input.setError("");
    input.setLoading(true);
    try {
      const project = await createProject({
        title: input.t("project.untitledDoc"),
        content: type === "markdown" ? undefined : initialContentForType(type),
        type,
        ...createRequestExtras(input),
      });
      input.setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const loadPromptDocument = async () => {
    input.setError("");
    input.setLoading(true);
    try {
      const userPrompt = input.prompt.trim();
      const attachments = input.homeAttachments.attachments;
      const attachmentTitle = attachments[0]?.name ? input.t("project.docFromAttachment", { name: attachments[0].name }) : input.t("project.untitledDoc");
      const project = await createProject({
        title: attachmentTitle.length > 80 ? `${attachmentTitle.slice(0, 80).trim()}...` : attachmentTitle,
        content: initialContentForType(input.outputType),
        type: input.outputType,
        ...createRequestExtras(input),
      });
      const uploadedAttachments = await uploadHomeContextAttachments(project.id, attachments);
      input.setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
      const initialUserPrompt = initialPromptWithAttachmentContext(userPrompt, uploadedAttachments, input.t);
      if (initialUserPrompt) {
        await startAiEdit(project.id, createInitialPromptAiEditRequest({
          content: project.content,
          runtimeProfileId: input.selectedRuntimeProfileId || null,
          type: project.type,
          userPrompt: initialUserPrompt,
        }));
        reportUserActive();
      }
      input.homeAttachments.clearAttachments();
      input.setPrompt("");
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const loadTemplate = async (template: TuttiTemplate) => {
    input.setError("");
    input.setLoading(true);
    try {
      const project = await createProject({
        title: template.name,
        type: "html",
        templateId: template.id,
        templateName: template.name,
        ...createRequestExtras(input),
      });
      input.setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const importDocumentFile = async (file: File) => {
    input.setError("");
    input.setLoading(true);
    try {
      const project = await importProjectFile(file);
      input.setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
      openProject(project);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const openHistoryProject = (project: DocumentProject) => {
    input.setRoute(pushDocumentRoute(project.id));
  };

  const clearHistory = async () => {
    input.setError("");
    input.setLoading(true);
    try {
      const projects = await clearProjectHistory();
      input.setHistoryProjects(projects);
      input.setHomePanel("history");
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const deleteHistoryProject = async (projectId: string) => {
    input.setError("");
    input.setLoading(true);
    try {
      const projects = await deleteProject(projectId);
      input.setHistoryProjects(projects);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  const loadFixture = async () => {
    input.setLoading(true);
    input.setError("");
    try {
      const fixture = await fetchTuttiStudyPlanFixture();
      input.loadHtmlDocument(fixture.html, { source: "fixture", title: fixture.title });
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setLoading(false);
    }
  };

  return {
    clearHistory,
    deleteHistoryProject,
    downloadOfficeCli,
    importDocumentFile,
    loadBlankDocument,
    loadFixture,
    loadPromptDocument,
    loadTemplate,
    openHistoryProject,
    refreshProjectHistory,
  };
}

type UploadedHomeContextAttachment = {
  originalName: string;
  fileName: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
};

async function uploadHomeContextAttachments(projectId: string, attachments: HomeAttachment[]): Promise<UploadedHomeContextAttachment[]> {
  const uploaded: UploadedHomeContextAttachment[] = [];
  for (const attachment of attachments) {
    const asset = await uploadContextAttachment(projectId, attachment.file);
    uploaded.push({
      originalName: attachment.name,
      fileName: asset.fileName,
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    });
  }
  return uploaded;
}

function initialPromptWithAttachmentContext(userPrompt: string, attachments: UploadedHomeContextAttachment[], t: ReturnType<typeof useI18n>["t"]) {
  if (attachments.length === 0) return userPrompt;
  const instruction = userPrompt.trim() || t("project.attachmentPrompt");
  return [
    instruction,
    "",
    "Context attachments uploaded with this project:",
    ...attachments.map((attachment, index) => {
      const displayName = attachment.originalName === attachment.fileName ? attachment.fileName : `${attachment.originalName} saved as ${attachment.fileName}`;
      return `${index + 1}. ${displayName} (${attachment.mimeType}, ${formatBytes(attachment.sizeBytes)}): ${attachment.path}`;
    }),
    "",
    "Use these files as source context. Read them from the project workspace before drafting or editing the document.",
  ].join("\n");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}
