import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { OfficeCliStatus, ProjectDetailResponse, SheetCommand, SheetProject } from "@ai-sheet/shared";
import {
  applyProjectCommands,
  clearProjectHistory,
  deleteProject,
  exportProjectXlsxFile,
  fetchOfficeCliStatus,
  fetchBootstrapSnapshot,
  getProject,
  installOfficeCli,
  importProjectFile,
  listProjects,
  openProjectExportsDir,
} from "./api/projects";
import { SheetHome } from "./app/SheetHome";
import { SheetViewerScreen } from "./app/SheetViewerScreen";
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [officeCliStatus, setOfficeCliStatus] = useState<OfficeCliStatus | null>(null);
  const [officeCliInstalling, setOfficeCliInstalling] = useState(false);
  const routeRef = useRef(route);
  const xlsxArtifactAdapter = useMemo(() => new XlsxArtifactRuntimeAdapter(), []);
  const {
    runtime: xlsxRuntime,
    loading: xlsxLoading,
    error: xlsxError,
    saveState: xlsxSaveState,
    setSaveState: setXlsxSaveState,
    loadArtifact: loadXlsxArtifact,
    clearArtifact: clearXlsxArtifact,
    applyCommand: applyXlsxCommand,
  } = useXlsxArtifactRuntime(xlsxArtifactAdapter);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const onPopState = () => setRoute(readCurrentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    void fetchBootstrapSnapshot()
      .then((snapshot) => setHistoryProjects(snapshot.projects))
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    void fetchOfficeCliStatus()
      .then((response) => setOfficeCliStatus(response.officecli))
      .catch((err) =>
        setOfficeCliStatus({
          available: false,
          source: "missing",
          canInstall: false,
          installing: false,
          reason: err instanceof Error ? err.message : "Unable to check OfficeCLI status.",
        }),
      );
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
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only XLSX files are supported.");
      const detail = await importProjectFile(file);
      setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
      setRoute(pushSheetRoute(detail.project.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
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
        // Keep the existing status if the follow-up check also fails.
      }
    } finally {
      setOfficeCliInstalling(false);
    }
  }, []);

  const reloadCurrentSheet = useCallback(async () => {
    if (!projectDetail) return;
    const detail = await getProject(projectDetail.project.id);
    setProjectDetail(detail);
    setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
    if (detail.xlsxManifest) {
      await loadXlsxArtifact(detail.project.id, {
        title: detail.project.title,
        manifest: detail.xlsxManifest,
      });
    }
  }, [loadXlsxArtifact, projectDetail]);

  const applySheetCommand = useCallback(
    async (command: SheetCommand) => {
      if (!projectDetail) return;
      const baseRevision = projectDetail.artifact.revision;
      const baseSha256 = projectDetail.xlsxManifest?.sha256 ?? null;
      setError("");
      try {
        applyXlsxCommand(command);
        setXlsxSaveState("saving");
        const detail = await applyProjectCommands(projectDetail.project.id, {
          baseRevision,
          baseSha256,
          commands: [command],
        });
        setProjectDetail(detail);
        setHistoryProjects((projects) => [detail.project, ...projects.filter((project) => project.id !== detail.project.id)]);
        setXlsxSaveState("saved");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setXlsxSaveState("error");
        setError(`${message} Reloading workbook.`);
        await reloadCurrentSheet().catch(() => undefined);
      }
    },
    [applyXlsxCommand, projectDetail, reloadCurrentSheet, setXlsxSaveState],
  );

  if (route.name === "sheet" && projectDetail) {
    return (
      <SheetViewerScreen
        detail={projectDetail}
        runtime={xlsxRuntime}
        loading={loading || xlsxLoading}
        error={xlsxError || error}
        saveState={xlsxSaveState}
        exportMessage={exportMessage}
        officeCliInstalling={officeCliInstalling}
        officeCliStatus={officeCliStatus}
        onApplyCommand={(command) => void applySheetCommand(command)}
        onBackHome={() => setRoute(pushHomeRoute())}
        onDismissExport={() => setExportMessage("")}
        onExportXlsx={exportXlsx}
        onInstallOfficeCli={downloadOfficeCli}
        onOpenExportLocation={openExports}
      />
    );
  }

  return (
    <SheetHome
      projects={historyProjects}
      loading={loading}
      error={error}
      onClearHistory={clearHistory}
      onDeleteProject={deleteHistoryProject}
      onImportFile={importFile}
      onOpenProject={openProject}
    />
  );
}
