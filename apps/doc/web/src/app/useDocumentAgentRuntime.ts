import { useEffect, useMemo, useState } from "react";
import { hasActiveAgentRun } from "@ai-app/agent/conversation";
import { artifactInteractionForAgentBusy, isArtifactReadOnly, type ArtifactInteractionPolicy } from "@ai-app/shared/artifact-runtime";
import type { AiEditRequest, DocumentProject } from "@ai-doc/shared";
import { cancelRun, startAiEdit } from "../api/projects";
import type { DocxRuntimeState } from "../artifact/docxArtifactAdapter";
import type { MarkdownRuntimeState } from "../artifact/markdownArtifactAdapter";
import type { RuntimeState } from "../artifact/runtime/types";
import { shouldApplyAgentProjectUpdate } from "./shouldApplyAgentProjectUpdate";
import { reportUserActive } from "./tuttiActivity";
import { useAgentConversation } from "./useAgentConversation";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentAgentRuntimeInput = {
  artifactReadOnlyRef: Ref<boolean>;
  createAiEditRequest: (input: {
    projectId: string;
    runtime: RuntimeState;
    runtimeProfileId: string | null;
    userPrompt: string;
  }) => AiEditRequest;
  createDocxAiEditRequest: (input: {
    projectId: string;
    runtime: DocxRuntimeState;
    runtimeProfileId: string | null;
    userPrompt: string;
  }) => AiEditRequest;
  createMarkdownAiEditRequest: (input: {
    projectId: string;
    runtime: MarkdownRuntimeState;
    runtimeProfileId: string | null;
    userPrompt: string;
  }) => AiEditRequest;
  currentDocumentType: DocumentProject["type"] | null;
  currentProject: DocumentProject | null;
  currentProjectId: string | null;
  docxRuntime: DocxRuntimeState | null;
  loadDocxDocument: (project: DocumentProject) => Promise<void>;
  loadHtmlDocument: (html: string, input: { projectId?: string | null; title: string; source?: RuntimeState["source"] }) => void;
  loadMarkdownDocument: (content: string, input: { title: string; source?: RuntimeState["source"] }) => void;
  markdownRuntime: MarkdownRuntimeState | null;
  runtime: RuntimeState | null;
  selectedRuntimeProfileId: string;
  setCurrentProject: StateSetter<DocumentProject | null>;
  setError: (value: string) => void;
  setHistoryProjects: StateSetter<DocumentProject[]>;
  setLinkEditorOpen: StateSetter<boolean>;
};

export function useDocumentAgentRuntime(input: DocumentAgentRuntimeInput) {
  const [agentSending, setAgentSending] = useState(false);
  const agentConversation = useAgentConversation({
    projectId: input.currentProjectId,
    onProjectUpdated: (project) => {
      if (project.id !== input.currentProjectId) return;
      if (!shouldApplyAgentProjectUpdate(project, input.currentProject)) return;
      const contentChanged = !input.currentProject || project.content !== input.currentProject.content;
      input.setCurrentProject(project);
      if (contentChanged) {
        if (project.type === "markdown") {
          input.loadMarkdownDocument(project.content, { title: project.title, source: "imported-html" });
        } else if (project.type === "docx") {
          void input.loadDocxDocument(project).catch((err) => input.setError(err instanceof Error ? err.message : String(err)));
        } else {
          input.loadHtmlDocument(project.content, { projectId: project.id, title: project.title, source: "imported-html" });
        }
      }
      input.setHistoryProjects((projects) => [project, ...projects.filter((item) => item.id !== project.id)]);
    },
  });
  const agentBusy = agentSending || hasActiveAgentRun(agentConversation.items);
  const artifactInteraction: ArtifactInteractionPolicy = useMemo(
    () => artifactInteractionForAgentBusy(agentBusy),
    [agentBusy],
  );
  const artifactReadOnly = isArtifactReadOnly(artifactInteraction);
  input.artifactReadOnlyRef.current = artifactReadOnly;

  useEffect(() => {
    if (artifactReadOnly) input.setLinkEditorOpen(false);
  }, [artifactReadOnly]);

  const sendAgentPrompt = async (userPrompt: string) => {
    if (!input.currentProjectId) throw new Error("Project is not open");
    setAgentSending(true);
    input.setError("");
    try {
      if (input.currentDocumentType === "markdown") {
        if (!input.markdownRuntime) throw new Error("Markdown runtime is not ready");
        await startAiEdit(input.currentProjectId, input.createMarkdownAiEditRequest({
          projectId: input.currentProjectId,
          runtime: input.markdownRuntime,
          userPrompt,
          runtimeProfileId: input.selectedRuntimeProfileId || null,
        }));
      } else if (input.currentDocumentType === "docx") {
        if (!input.docxRuntime) throw new Error("DOCX runtime is not ready");
        await startAiEdit(input.currentProjectId, input.createDocxAiEditRequest({
          projectId: input.currentProjectId,
          runtime: input.docxRuntime,
          userPrompt,
          runtimeProfileId: input.selectedRuntimeProfileId || null,
        }));
      } else {
        if (!input.runtime) throw new Error("Doc runtime is not ready");
        await startAiEdit(input.currentProjectId, input.createAiEditRequest({
          projectId: input.currentProjectId,
          runtime: input.runtime,
          userPrompt,
          runtimeProfileId: input.selectedRuntimeProfileId || null,
        }));
      }
      reportUserActive();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      input.setError(message);
      throw err;
    } finally {
      setAgentSending(false);
    }
  };

  const cancelAgentRun = async (runId: string) => {
    input.setError("");
    try {
      await cancelRun(runId);
      await agentConversation.reload();
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  return {
    agentBusy,
    agentConversation,
    artifactInteraction,
    artifactReadOnly,
    cancelAgentRun,
    sendAgentPrompt,
  };
}

