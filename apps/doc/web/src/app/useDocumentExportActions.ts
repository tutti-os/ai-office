import { openExportLocation } from "@ai-app/shared/host-files";
import type { DocumentProject } from "@ai-doc/shared";
import type { MarkdownRuntimeState } from "../artifact/markdownArtifactAdapter";
import type { DocxRuntimeState } from "../artifact/docxArtifactAdapter";
import { renderHtmlProjectAssetReferences } from "../artifact/runtime/projectAssets";
import type { RuntimeState } from "../artifact/runtime/types";
import { openProjectExportsDir } from "../api/projects";
import { saveDocxArtifactPdfExport } from "./docxExport";
import { saveHtmlArtifactExport, saveHtmlArtifactPdfExport } from "./htmlExport";
import { saveMarkdownArtifactExport, saveMarkdownArtifactPdfExport } from "./markdownExport";
import type { useI18n } from "../i18n";

type DocumentExportActionsInput = {
  currentProject: DocumentProject | null;
  currentProjectId: string | null;
  docxRuntime: DocxRuntimeState | null;
  exportInProgress: boolean;
  exportRevealPath: string;
  markdownRuntime: MarkdownRuntimeState | null;
  runtime: RuntimeState | null;
  serializeHtmlRuntime: (runtime: RuntimeState) => string;
  setError: (value: string) => void;
  setExportNotice: (value: string) => void;
  setExportRevealPath: (value: string) => void;
  setPdfExporting: (value: boolean) => void;
  setSourceExporting: (value: boolean) => void;
  t: ReturnType<typeof useI18n>["t"];
};

function rememberExportRevealPath(input: DocumentExportActionsInput, path: string) {
  input.setExportRevealPath(path);
}

export function createDocumentExportActions(input: DocumentExportActionsInput) {
  const htmlTitle = input.runtime?.title || input.currentProject?.title || "doc";
  const markdownTitle = input.markdownRuntime?.title || input.currentProject?.title || "doc";
  const docxTitle = input.docxRuntime?.title || input.currentProject?.title || "doc";

  const exportCurrentHtml = async () => {
    if (!input.runtime || !input.currentProjectId || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setExportRevealPath("");
    input.setSourceExporting(true);
    try {
      const exported = await saveHtmlArtifactExport({
        projectId: input.currentProjectId,
        title: htmlTitle,
        html: input.serializeHtmlRuntime(input.runtime),
      });
      console.info(`[ai-doc] Exported HTML to ${exported.path}`);
      rememberExportRevealPath(input, exported.path);
      input.setExportNotice(input.t("editor.exportedHtml", { path: exported.path }));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setSourceExporting(false);
    }
  };

  const exportCurrentHtmlPdf = async () => {
    if (!input.runtime || !input.currentProjectId || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setExportRevealPath("");
    input.setPdfExporting(true);
    try {
      const exported = await saveHtmlArtifactPdfExport({
        projectId: input.currentProjectId,
        title: htmlTitle,
        html: renderHtmlProjectAssetReferences(input.serializeHtmlRuntime(input.runtime), input.currentProjectId),
      });
      console.info(`[ai-doc] Exported PDF to ${exported.path}`);
      rememberExportRevealPath(input, exported.path);
      input.setExportNotice(input.t("editor.exportedPdf", { path: exported.path }));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setPdfExporting(false);
    }
  };

  const exportCurrentMarkdown = async (markdown: string) => {
    if (!input.markdownRuntime || !input.currentProjectId || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setExportRevealPath("");
    input.setSourceExporting(true);
    try {
      const exported = await saveMarkdownArtifactExport({
        projectId: input.currentProjectId,
        title: markdownTitle,
        markdown,
      });
      console.info(`[ai-doc] Exported Markdown to ${exported.path}`);
      rememberExportRevealPath(input, exported.path);
      input.setExportNotice(input.t("editor.exportedMarkdown", { path: exported.path }));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setSourceExporting(false);
    }
  };

  const exportCurrentMarkdownPdf = async (markdown: string) => {
    if (!input.markdownRuntime || !input.currentProjectId || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setExportRevealPath("");
    input.setPdfExporting(true);
    try {
      const exported = await saveMarkdownArtifactPdfExport({
        projectId: input.currentProjectId,
        title: markdownTitle,
        markdown,
      });
      console.info(`[ai-doc] Exported Markdown PDF to ${exported.path}`);
      rememberExportRevealPath(input, exported.path);
      input.setExportNotice(input.t("editor.exportedPdf", { path: exported.path }));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setPdfExporting(false);
    }
  };

  const exportCurrentDocxPdf = async (previewElement: HTMLElement | null) => {
    if (!input.docxRuntime || !input.currentProjectId || !previewElement || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setExportRevealPath("");
    input.setPdfExporting(true);
    try {
      const exported = await saveDocxArtifactPdfExport({
        previewElement,
        projectId: input.currentProjectId,
        title: docxTitle,
      });
      console.info(`[ai-doc] Exported DOCX PDF to ${exported.path}`);
      rememberExportRevealPath(input, exported.path);
      input.setExportNotice(input.t("editor.exportedPdf", { path: exported.path }));
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setPdfExporting(false);
    }
  };

  const openCurrentProjectExportsDir = async () => {
    const projectId = input.currentProjectId;
    if (!projectId) return;
    input.setError("");
    try {
      await openExportLocation({
        path: input.exportRevealPath,
        openExportsDir: () => openProjectExportsDir(projectId),
      });
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    }
  };

  return {
    exportCurrentDocxPdf,
    exportCurrentHtml,
    exportCurrentHtmlPdf,
    exportCurrentMarkdown,
    exportCurrentMarkdownPdf,
    openCurrentProjectExportsDir,
  };
}
