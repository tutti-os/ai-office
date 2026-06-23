import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LocalAgentProviderStatus, OfficeCliStatus, ProjectDetailResponse, RuntimeProfile, SheetProject } from "@ai-sheet/shared";
import {
  clearProjectHistory,
  createProject,
  deleteProject,
  exportProjectXlsxFile,
  fetchBootstrapSnapshot,
  fetchLocalAgentProviders,
  fetchOfficeCliStatus,
  getProject,
  importProjectFile,
  installOfficeCli,
  listProjects,
  openProjectExportsDir,
  startAiEdit,
} from "./api/projects";
import { SheetHome } from "./app/SheetHome";
import { SheetViewerScreen } from "./app/SheetViewerScreen";
import { useAgentConversation } from "./app/useAgentConversation";
import { XlsxArtifactRuntimeAdapter } from "./artifact/xlsxArtifactAdapter";
import { useXlsxArtifactRuntime } from "./artifact/useXlsxArtifactRuntime";

type AppRoute = { name: "home" } | { name: "sheet"; projectId: string };

function readCurrentRoute(): AppRoute {
  const match = window.location.pathname.match(/^\/sheet\/([^/]+)\/?$/);
  if (match?.[1]) return { name: "sheet", projectId: decodeURIComponent(match[1]) };
  return { name: "home" };
}

function sheetPath(projectId: string) {
  return `/sheet/${encodeURIComponent(projectId)}`;
}

function pushSheetRoute(projectId: string) {
  window.history.pushState({}, "", sheetPath(projectId));
  return readCurrentRoute();
}

function pushHomeRoute() {
  window.history.pushState({}, "", "/");
  return readCurrentRoute();
}

export function App() {
  const [route, setRoute] = useState<AppRoute>(() => readCurrentRoute());
  const [historyProjects, setHistoryProjects] = useState<SheetProject[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectDetailResponse | null>(null);
  const [prompt, setPrompt] = useState("");
  const [runtimeProfiles, setRuntimeProfiles] = useState<RuntimeProfile[]>([]);
  const [localAgentProviders, setLocalAgentProviders] = useState<LocalAgentProviderStatus[]>([]);
  const [selectedAgent, setSelectedAgent] = useState("");
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agentSending, setAgentSending] = useState(false);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const routeRef = useRef(route);
  const xlsxArtifactAdapter = useMemo(() => new XlsxArtifactRuntimeAdapter(), []);
  const {
    runtime: xlsxRuntime,
    loading: xlsxLoading,
    error: xlsxError,
    saveState: xlsxSaveState,
    loadArtifact: loadXlsxArtifact,
    clearArtifact: clearXlsxArtifact,
  } = useXlsxArtifactRuntime(xlsxArtifactAdapter);
  const currentProjectId = route.name === "sheet" ? route.projectId : null;
  const agentConversation = useAgentConversation({
    projectId: currentProjectId,
    onProjectUpdated: (detail) => {
      if (detail.project.id !== currentProjectId) return;
      setProjectDetail(detail);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      if (detail.xlsxManifest) {
        void loadXlsxArtifact(detail.project.id, {
          title: detail.project.title,
          manifest: detail.xlsxManifest,
        }).catch(() => undefined);
      }
    },
  });

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const onPopState = () => setRoute(readCurrentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const officeCliFallback = (err: unknown) => ({
      officecli: {
        available: false,
        source: "missing" as const,
        canInstall: false,
        installing: false,
        reason: err instanceof Error ? err.message : "Unable to check OfficeCLI status.",
      },
    });
    void Promise.all([
      fetchBootstrapSnapshot(),
      fetchOfficeCliStatus().catch(officeCliFallback),
    ])
      .then(([snapshot, officeCli]) => {
        setHistoryProjects(snapshot.projects);
        const enabledProfiles = snapshot.runtimeProfiles.filter((profile) => profile.enabled && profile.kind === "local-agent");
        setRuntimeProfiles(enabledProfiles);
        setSelectedAgent((current) => current || enabledProfiles[0]?.id || "");
        setOfficeCliStatus(officeCli.officecli);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    void fetchLocalAgentProviders()
      .then((response) => setLocalAgentProviders(response.providers))
      .catch(() => setLocalAgentProviders([]));
  }, []);

  useEffect(() => {
    if (route.name !== "home") return;
    void listProjects()
      .then(setHistoryProjects)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [route.name]);

  useEffect(() => {
    if (route.name !== "sheet") {
      setProjectDetail(null);
      clearXlsxArtifact();
      return;
    }
    setLoading(true);
    setError("");
    void getProject(route.projectId)
      .then((detail) => {
        setProjectDetail(detail);
        setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
        if (detail.xlsxManifest) {
          void loadXlsxArtifact(detail.project.id, {
            title: detail.project.title,
            manifest: detail.xlsxManifest,
          }).catch(() => undefined);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [clearXlsxArtifact, loadXlsxArtifact, route]);

  const importFile = useCallback(async (file: File) => {
    setLoading(true);
    setError("");
    try {
      if (officeCliStatus?.available !== true) throw new Error(officeCliStatus?.reason ?? "OfficeCLI is required for XLSX workbooks.");
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only XLSX files are supported.");
      const detail = await importProjectFile(file);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      setRoute(pushSheetRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [officeCliStatus]);

  const createWorkbook = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (officeCliStatus?.available !== true) throw new Error(officeCliStatus?.reason ?? "OfficeCLI is required for XLSX workbooks.");
      const initialPrompt = prompt.trim();
      const title = initialPrompt ? initialPrompt.slice(0, 80) : "Untitled Workbook";
      const detail = await createProject({ title });
      setPrompt("");
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      if (initialPrompt) {
        await startAiEdit(detail.project.id, {
          userPrompt: initialPrompt,
          mode: "write",
          runtimeProfileId: selectedAgent || null,
          selectionType: "write",
          selectionPath: "",
          selectedText: "",
          selectedHtml: "",
        });
      }
      setRoute(pushSheetRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [officeCliStatus, prompt, selectedAgent]);

  const sendAgentPrompt = useCallback(async (userPrompt: string) => {
    if (!currentProjectId) throw new Error("Project is not open");
    setAgentSending(true);
    setError("");
    try {
      await startAiEdit(currentProjectId, {
        userPrompt,
        mode: "write",
        runtimeProfileId: selectedAgent || null,
        selectionType: xlsxRuntime?.selection.address ? "cell" : "write",
        selectionPath: xlsxRuntime?.selection.address ? `${xlsxRuntime.selection.sheetName || xlsxRuntime.selection.sheetId}!${xlsxRuntime.selection.address}` : "",
        selectedText: xlsxRuntime?.selection.address ? `${xlsxRuntime.selection.sheetName || "Sheet"}!${xlsxRuntime.selection.address}` : "",
        selectedHtml: "",
      });
      await agentConversation.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setAgentSending(false);
    }
  }, [agentConversation, currentProjectId, selectedAgent, xlsxRuntime?.selection]);

  const downloadOfficeCli = useCallback(async () => {
    setError("");
    setOfficeCliInstalling(true);
    try {
      const response = await installOfficeCli();
      setOfficeCliStatus(response.officecli);
      if (!response.officecli.available) setError(response.officecli.reason ?? "Unable to install OfficeCLI");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      try {
        const response = await fetchOfficeCliStatus();
        setOfficeCliStatus(response.officecli);
      } catch {
        // Keep the original install error visible.
      }
    } finally {
      setOfficeCliInstalling(false);
    }
  }, []);

  const openProject = useCallback((project: SheetProject) => {
    setRoute(pushSheetRoute(project.id));
  }, []);

  const clearHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHistoryProjects(await clearProjectHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const deleteHistoryProject = useCallback(async (projectId: string) => {
    setLoading(true);
    setError("");
    try {
      setHistoryProjects(await deleteProject(projectId));
      if (routeRef.current.name === "sheet" && routeRef.current.projectId === projectId) setRoute(pushHomeRoute());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const exportXlsx = useCallback(async () => {
    if (!projectDetail) return;
    setError("");
    try {
      const exported = await exportProjectXlsxFile(projectDetail.project.id);
      setExportMessage(`Exported ${exported.fileName}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectDetail]);

  const openExports = useCallback(async () => {
    if (!projectDetail) return;
    try {
      await openProjectExportsDir(projectDetail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectDetail]);

  if (route.name === "sheet" && projectDetail) {
    return (
      <SheetViewerScreen
        detail={projectDetail}
        runtime={xlsxRuntime}
        loading={loading || xlsxLoading}
        error={xlsxError || error}
        saveState={xlsxSaveState}
        exportMessage={exportMessage}
        conversationError={agentConversation.error}
        conversationItems={agentConversation.items}
        conversationLoading={agentConversation.loading}
        sending={agentSending}
        onBackHome={() => setRoute(pushHomeRoute())}
        onDismissExport={() => setExportMessage("")}
        onExportXlsx={exportXlsx}
        onOpenExportLocation={openExports}
        onSendPrompt={sendAgentPrompt}
      />
    );
  }

  return (
    <SheetHome
      projects={historyProjects}
      loading={loading}
      error={error}
      officeCliInstalling={officeCliInstalling}
      officeCliStatus={officeCliStatus}
      prompt={prompt}
      onClearHistory={clearHistory}
      onCreateWorkbook={createWorkbook}
      onDeleteProject={deleteHistoryProject}
      onImportFile={importFile}
      onInstallOfficeCli={downloadOfficeCli}
      onOpenProject={openProject}
      onPromptChange={setPrompt}
    />
  );
}
