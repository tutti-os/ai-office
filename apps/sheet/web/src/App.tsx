import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hasActiveAgentRun } from "@ai-app/agent/conversation";
import type { LocalAgentProviderStatus, OfficeCliStatus, ProjectDetailResponse, RuntimeProfile, SheetProject } from "@ai-sheet/shared";
import {
  applyProjectCommands,
  cancelRun,
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
import { initialPromptWithAttachmentContext, uploadHomeContextAttachments } from "./app/homeAttachmentPrompt";
import { SheetViewerScreen } from "./app/SheetViewerScreen";
import { useAgentConversation } from "./app/useAgentConversation";
import { useHomeAttachments } from "./app/useHomeAttachments";
import { XlsxArtifactRuntimeAdapter } from "./artifact/xlsxArtifactAdapter";
import type { XlsxSelection } from "./artifact/xlsxArtifactAdapter";
import { useXlsxArtifactRuntime } from "./artifact/useXlsxArtifactRuntime";
import { useI18n } from "./i18n";

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
  const { t } = useI18n();
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
  const [xlsxExporting, setXlsxExporting] = useState(false);
  const routeRef = useRef(route);
  const homeAttachments = useHomeAttachments();
  const xlsxArtifactAdapter = useMemo(() => new XlsxArtifactRuntimeAdapter(), []);
  const {
    runtime: xlsxRuntime,
    loading: xlsxLoading,
    error: xlsxError,
    saveState: xlsxSaveState,
    setSaveState: setXlsxSaveState,
    loadArtifact: loadXlsxArtifact,
    clearArtifact: clearXlsxArtifact,
    updateSelection: updateXlsxSelection,
    applyCommand: applyXlsxCommand,
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
        reason: err instanceof Error ? err.message : t("error.officeCliStatus"),
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
  }, [t]);

  useEffect(() => {
    void fetchLocalAgentProviders()
      .then((response) => {
        setLocalAgentProviders(response.providers);
        setSelectedAgent((current) => {
          const currentProfile = runtimeProfiles.find((profile) => profile.id === current);
          const currentStatus = currentProfile ? response.providers.find((provider) => provider.provider === currentProfile.provider) : null;
          if (currentStatus?.available) return current;
          const firstAvailable = runtimeProfiles.find((profile) => response.providers.find((provider) => provider.provider === profile.provider)?.available);
          return firstAvailable?.id ?? current;
        });
      })
      .catch(() => setLocalAgentProviders([]));
  }, [runtimeProfiles]);

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
      if (officeCliStatus?.available !== true) throw new Error(officeCliStatus?.reason ?? t("error.officeCliRequired"));
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(t("error.onlyXlsx"));
      const detail = await importProjectFile(file);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      setRoute(pushSheetRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [officeCliStatus, t]);

  const createWorkbook = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (officeCliStatus?.available !== true) throw new Error(officeCliStatus?.reason ?? t("error.officeCliRequired"));
      const initialPrompt = prompt.trim();
      const title = initialPrompt ? initialPrompt.slice(0, 80) : t("project.untitledWorkbook");
      const detail = await createProject({ title });
      const attachments = homeAttachments.attachments;
      const uploadedAttachments = attachments.length ? await uploadHomeContextAttachments(detail.project.id, attachments) : [];
      const initialUserPrompt = initialPromptWithAttachmentContext(initialPrompt, uploadedAttachments, t("project.attachmentPrompt")).trim();
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      if (initialUserPrompt) {
        await startAiEdit(detail.project.id, {
          userPrompt: initialUserPrompt,
          mode: "write",
          runtimeProfileId: selectedAgent || null,
          selectionType: "write",
          selectionPath: "",
          selectedText: "",
          selectedHtml: "",
        });
      }
      setPrompt("");
      if (attachments.length) homeAttachments.clearAttachments();
      setRoute(pushSheetRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [homeAttachments, officeCliStatus, prompt, selectedAgent, t]);

  const sendAgentPrompt = useCallback(async (userPrompt: string) => {
    if (!currentProjectId) throw new Error(t("error.projectNotOpen"));
    if (!xlsxRuntime) throw new Error(t("error.runtimeNotReady"));
    setAgentSending(true);
    setError("");
    try {
      await startAiEdit(
        currentProjectId,
        xlsxArtifactAdapter.createAiEditRequest({
          projectId: currentProjectId,
          runtime: xlsxRuntime,
          userPrompt,
          runtimeProfileId: selectedAgent || null,
        }),
      );
      await agentConversation.reload();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setAgentSending(false);
    }
  }, [agentConversation, currentProjectId, selectedAgent, t, xlsxArtifactAdapter, xlsxRuntime]);

  const commitCellValue = useCallback(async (input: { address: string; input: string; sheetId: string; sheetName: string }) => {
    if (!currentProjectId || !projectDetail) throw new Error(t("error.projectNotOpen"));
    if (!xlsxRuntime?.editor) throw new Error(t("error.runtimeNotReady"));
    const command = {
      type: "set-cell-value" as const,
      address: input.address,
      input: input.input,
      sheetId: input.sheetId,
      sheetName: input.sheetName,
    };
    setError("");
    setXlsxSaveState("saving");
    try {
      applyXlsxCommand(command);
      const detail = await applyProjectCommands(currentProjectId, {
        baseRevision: projectDetail.artifact.revision,
        baseSha256: projectDetail.xlsxManifest?.sha256 ?? null,
        commands: [command],
      });
      setProjectDetail(detail);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      if (detail.xlsxManifest) {
        await loadXlsxArtifact(detail.project.id, {
          title: detail.project.title,
          manifest: detail.xlsxManifest,
        });
      }
      setXlsxSaveState("saved");
    } catch (err) {
      setXlsxSaveState("error");
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [applyXlsxCommand, currentProjectId, loadXlsxArtifact, projectDetail, setXlsxSaveState, t, xlsxRuntime?.editor]);

  const selectXlsxCell = useCallback((selection: XlsxSelection) => {
    updateXlsxSelection(selection);
  }, [updateXlsxSelection]);

  const cancelAgentRun = useCallback(async (runId: string) => {
    setError("");
    try {
      await cancelRun(runId);
      await agentConversation.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  }, [agentConversation]);

  const downloadOfficeCli = useCallback(async () => {
    setError("");
    setOfficeCliInstalling(true);
    try {
      const response = await installOfficeCli();
      setOfficeCliStatus(response.officecli);
      if (!response.officecli.available) setError(response.officecli.reason ?? t("error.officeCliInstall"));
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
  }, [t]);

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
    if (!projectDetail || xlsxExporting) return;
    setError("");
    setXlsxExporting(true);
    try {
      const exported = await exportProjectXlsxFile(projectDetail.project.id);
      setExportMessage(t("editor.exported", { fileName: exported.fileName }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setXlsxExporting(false);
    }
  }, [projectDetail, t, xlsxExporting]);

  const openExports = useCallback(async () => {
    if (!projectDetail) return;
    try {
      await openProjectExportsDir(projectDetail.project.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [projectDetail]);

  if (route.name === "sheet" && projectDetail) {
    const agentBusy = agentSending || hasActiveAgentRun(agentConversation.items);
    return (
      <SheetViewerScreen
        detail={projectDetail}
        runtime={xlsxRuntime}
        loading={loading || xlsxLoading}
        error={xlsxError || error}
        saveState={xlsxSaveState}
        exportMessage={exportMessage}
        exporting={xlsxExporting}
        conversationError={agentConversation.error}
        conversationItems={agentConversation.items}
        conversationLoading={agentConversation.loading}
        localAgentProviders={localAgentProviders}
        runtimeProfiles={runtimeProfiles}
        selectedRuntimeProfileId={selectedAgent}
        sending={agentBusy}
        onCommitCellValue={commitCellValue}
        onBackHome={() => setRoute(pushHomeRoute())}
        onCancelAgentRun={cancelAgentRun}
        onDismissExport={() => setExportMessage("")}
        onExportXlsx={exportXlsx}
        onOpenExportLocation={openExports}
        onRuntimeProfileChange={setSelectedAgent}
        onSelectionChange={selectXlsxCell}
        onSendPrompt={sendAgentPrompt}
      />
    );
  }

  return (
    <SheetHome
      attachments={homeAttachments.attachments}
      projects={historyProjects}
      loading={loading}
      error={error}
      localAgentProviders={localAgentProviders}
      officeCliInstalling={officeCliInstalling}
      officeCliStatus={officeCliStatus}
      prompt={prompt}
      runtimeProfiles={runtimeProfiles}
      selectedRuntimeProfileId={selectedAgent}
      onAddFiles={homeAttachments.addFiles}
      onClearHistory={clearHistory}
      onCreateWorkbook={createWorkbook}
      onDeleteProject={deleteHistoryProject}
      onImportFile={importFile}
      onInstallOfficeCli={downloadOfficeCli}
      onOpenProject={openProject}
      onPromptChange={setPrompt}
      onRemoveAttachment={homeAttachments.removeAttachment}
      onRuntimeProfileChange={setSelectedAgent}
    />
  );
}
