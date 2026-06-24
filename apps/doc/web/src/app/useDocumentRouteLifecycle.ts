import { useEffect } from "react";
import type { DocumentProject } from "@ai-doc/shared";
import { getProject, updateProject } from "../api/projects";
import type { MarkdownRuntimeState } from "../artifact/markdownArtifactAdapter";
import type { RuntimeState } from "../artifact/runtime/types";
import { pushHomeRoute, readCurrentRoute, routePath, type AppRoute } from "./documentWorkbenchRoutes";
import { defaultToolbarState, type ToolbarState } from "./runtimeWorkbenchTypes";

type Ref<T> = { current: T };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

type DocumentRouteLifecycleInput = {
  activeHasUnsavedChanges: boolean;
  clearArtifact: () => void;
  clearDocxArtifact: () => void;
  clearMarkdownArtifact: () => void;
  currentDocumentType: DocumentProject["type"] | null;
  currentProjectId: string | null;
  hasUnsavedChangesRef: Ref<boolean>;
  htmlSaveGenerationRef: Ref<number>;
  loadDocxDocument: (project: DocumentProject) => Promise<void>;
  loadHtmlDocument: (html: string, input: { projectId?: string | null; title: string; source?: RuntimeState["source"] }) => void;
  loadMarkdownDocument: (content: string, input: { title: string; source?: RuntimeState["source"] }) => void;
  loading: boolean;
  markdownHasUnsavedChanges: boolean;
  markdownRuntime: MarkdownRuntimeState | null;
  markdownSaveGenerationRef: Ref<number>;
  markdownSaveState: "saved" | "saving" | "error";
  markdownTableCellCommitterRef: Ref<(() => boolean) | null>;
  markdownTableCellEditPending: boolean;
  queuedHomeNavigation: boolean;
  refreshProjectHistory: () => Promise<DocumentProject[]>;
  route: AppRoute;
  routeRef: Ref<AppRoute>;
  runtime: RuntimeState | null;
  saveTimerRef: Ref<ReturnType<typeof setTimeout> | null>;
  serializeHtmlRuntime: (runtime: RuntimeState) => string;
  serializeMarkdownRuntime: (runtime: MarkdownRuntimeState) => string;
  setCurrentProject: StateSetter<DocumentProject | null>;
  setError: (value: string) => void;
  setHtmlToolbarActive: (value: boolean) => void;
  setLoading: (value: boolean) => void;
  setMarkdownRuntime: StateSetter<MarkdownRuntimeState | null>;
  setMarkdownSaveState: (value: "saved" | "saving" | "error") => void;
  setQueuedHomeNavigation: (value: boolean) => void;
  setRoute: (route: AppRoute) => void;
  setRuntime: StateSetter<RuntimeState | null>;
  setSaveState: (value: "saved" | "saving" | "error") => void;
  setToolbarState: (value: ToolbarState) => void;
};

export function useDocumentRouteLifecycle(input: DocumentRouteLifecycleInput) {
  useEffect(() => {
    input.routeRef.current = input.route;
  }, [input.route, input.routeRef]);

  useEffect(() => {
    input.hasUnsavedChangesRef.current = input.activeHasUnsavedChanges;
  }, [input.activeHasUnsavedChanges, input.hasUnsavedChangesRef]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!input.hasUnsavedChangesRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [input.hasUnsavedChangesRef]);

  const requestHomeRoute = () => {
    if (input.currentDocumentType === "markdown") {
      if (input.markdownTableCellEditPending) {
        const committed = input.markdownTableCellCommitterRef.current?.() ?? false;
        if (committed) {
          input.setQueuedHomeNavigation(true);
          input.setMarkdownSaveState("saving");
          return;
        }
      }
      if (input.markdownSaveState === "error") {
        if (!window.confirm("You have unsaved changes. Leave without saving?")) return;
      } else if (input.markdownHasUnsavedChanges) {
        input.setQueuedHomeNavigation(true);
        return;
      }
      input.setQueuedHomeNavigation(false);
      input.setRoute(pushHomeRoute());
      return;
    }
    if (input.activeHasUnsavedChanges && !window.confirm("You have unsaved changes. Leave without saving?")) return;
    input.setQueuedHomeNavigation(false);
    input.setRoute(pushHomeRoute());
  };

  useEffect(() => {
    if (!input.queuedHomeNavigation || input.activeHasUnsavedChanges || input.loading) return;
    input.setQueuedHomeNavigation(false);
    input.setRoute(pushHomeRoute());
  }, [input.activeHasUnsavedChanges, input.loading, input.queuedHomeNavigation, input.setQueuedHomeNavigation, input.setRoute]);

  useEffect(() => {
    const handlePopState = () => {
      if (input.hasUnsavedChangesRef.current && !window.confirm("You have unsaved changes. Leave without saving?")) {
        window.history.pushState({}, "", routePath(input.routeRef.current));
        return;
      }
      input.setRoute(readCurrentRoute());
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [input.hasUnsavedChangesRef, input.routeRef, input.setRoute]);

  useEffect(() => {
    if (input.route.name === "home") {
      input.setCurrentProject(null);
      input.clearArtifact();
      input.clearMarkdownArtifact();
      input.clearDocxArtifact();
      input.setToolbarState(defaultToolbarState);
      input.setHtmlToolbarActive(false);
      void input.refreshProjectHistory().catch((err) => input.setError(err instanceof Error ? err.message : String(err)));
      return;
    }

    let cancelled = false;
    input.setLoading(true);
    input.setError("");
    void getProject(input.route.projectId)
      .then(async (project) => {
        if (cancelled) return;
        input.setCurrentProject(project);
        if (project.type === "markdown") {
          input.loadMarkdownDocument(project.content, { title: project.title, source: "imported-html" });
        } else if (project.type === "docx") {
          await input.loadDocxDocument(project);
        } else {
          input.loadHtmlDocument(project.content, { projectId: project.id, title: project.title, source: "imported-html" });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        input.setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) input.setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [input.route]);

  useEffect(() => {
    if (input.currentDocumentType !== "html" || !input.currentProjectId || !input.runtime?.dirty) return;
    if (input.saveTimerRef.current) clearTimeout(input.saveTimerRef.current);
    const saveGeneration = input.htmlSaveGenerationRef.current + 1;
    input.htmlSaveGenerationRef.current = saveGeneration;
    const saveRevision = input.runtime.revision;
    input.setSaveState("saving");
    input.saveTimerRef.current = setTimeout(() => {
      void updateProject(input.currentProjectId!, {
        title: input.runtime!.title,
        content: input.serializeHtmlRuntime(input.runtime!),
        type: "html",
        updatedBy: "human",
      })
        .then(() => {
          if (input.htmlSaveGenerationRef.current !== saveGeneration) return;
          input.setRuntime((current) => (current && current.revision === saveRevision ? { ...current, dirty: false } : current));
          input.setSaveState("saved");
        })
        .catch((err) => {
          if (input.htmlSaveGenerationRef.current !== saveGeneration) return;
          input.setSaveState("error");
          input.setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (input.saveTimerRef.current) clearTimeout(input.saveTimerRef.current);
    };
  }, [input.currentDocumentType, input.currentProjectId, input.runtime?.dirty, input.runtime?.revision, input.runtime?.title, input.serializeHtmlRuntime, input.setRuntime]);

  useEffect(() => {
    if (input.currentDocumentType !== "markdown" || !input.currentProjectId || !input.markdownRuntime?.dirty) return;
    if (input.saveTimerRef.current) clearTimeout(input.saveTimerRef.current);
    const saveGeneration = input.markdownSaveGenerationRef.current + 1;
    input.markdownSaveGenerationRef.current = saveGeneration;
    const saveRevision = input.markdownRuntime.revision;
    input.setMarkdownSaveState("saving");
    input.saveTimerRef.current = setTimeout(() => {
      void updateProject(input.currentProjectId!, {
        title: input.markdownRuntime!.title,
        content: input.serializeMarkdownRuntime(input.markdownRuntime!),
        type: "markdown",
        updatedBy: "human",
      })
        .then((project) => {
          if (input.markdownSaveGenerationRef.current !== saveGeneration) return;
          input.setCurrentProject(project);
          input.setMarkdownRuntime((current) => (current && current.revision === saveRevision ? { ...current, dirty: false } : current));
          input.setMarkdownSaveState("saved");
        })
        .catch((err) => {
          if (input.markdownSaveGenerationRef.current !== saveGeneration) return;
          input.setMarkdownSaveState("error");
          input.setError(err instanceof Error ? err.message : String(err));
        });
    }, 700);
    return () => {
      if (input.saveTimerRef.current) clearTimeout(input.saveTimerRef.current);
    };
  }, [input.currentDocumentType, input.currentProjectId, input.markdownRuntime?.dirty, input.markdownRuntime?.revision, input.markdownRuntime?.title, input.serializeMarkdownRuntime, input.setMarkdownRuntime]);

  return { requestHomeRoute };
}
