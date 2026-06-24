import type { DocumentProject } from "@ai-doc/shared";
import type { MarkdownRuntimeState } from "../artifact/markdownArtifactAdapter";
import type { DocxRuntimeState } from "../artifact/docxArtifactAdapter";
import { renderHtmlProjectAssetReferences } from "../artifact/runtime/projectAssets";
import type { RuntimeState } from "../artifact/runtime/types";
import { openProjectExportsDir } from "../api/projects";
import { saveDocxArtifactPdfExport } from "./docxExport";
import { saveHtmlArtifactExport, saveHtmlArtifactPdfExport } from "./htmlExport";
import { saveMarkdownArtifactExport, saveMarkdownArtifactPdfExport } from "./markdownExport";

type DocumentExportActionsInput = {
  currentProject: DocumentProject | null;
  currentProjectId: string | null;
  docxRuntime: DocxRuntimeState | null;
  exportInProgress: boolean;
  markdownRuntime: MarkdownRuntimeState | null;
  runtime: RuntimeState | null;
  serializeHtmlRuntime: (runtime: RuntimeState) => string;
  setError: (value: string) => void;
  setExportNotice: (value: string) => void;
  setPdfExporting: (value: boolean) => void;
  setSourceExporting: (value: boolean) => void;
};

export function createDocumentExportActions(input: DocumentExportActionsInput) {
  const htmlTitle = input.runtime?.title || input.currentProject?.title || "doc";
  const markdownTitle = input.markdownRuntime?.title || input.currentProject?.title || "doc";
  const docxTitle = input.docxRuntime?.title || input.currentProject?.title || "doc";

  const exportCurrentHtml = async () => {
    if (!input.runtime || !input.currentProjectId || input.exportInProgress) return;
    input.setError("");
    input.setExportNotice("");
    input.setSourceExporting(true);
    try {
      const exported = await saveHtmlArtifactExport({
        projectId: input.currentProjectId,
        title: htmlTitle,
        html: input.serializeHtmlRuntime(input.runtime),
      });
      console.info(`[ai-doc] Exported HTML to ${exported.path}`);
      input.setExportNotice(`Exported HTML to ${exported.path}`);
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
    input.setPdfExporting(true);
    try {
      const exported = await saveHtmlArtifactPdfExport({
        projectId: input.currentProjectId,
        title: htmlTitle,
        html: renderHtmlProjectAssetReferences(input.serializeHtmlRuntime(input.runtime), input.currentProjectId),
      });
      console.info(`[ai-doc] Exported PDF to ${exported.path}`);
      input.setExportNotice(`Exported PDF to ${exported.path}`);
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
    input.setSourceExporting(true);
    try {
      const exported = await saveMarkdownArtifactExport({
        projectId: input.currentProjectId,
        title: markdownTitle,
        markdown,
      });
      console.info(`[ai-doc] Exported Markdown to ${exported.path}`);
      input.setExportNotice(`Exported Markdown to ${exported.path}`);
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
    input.setPdfExporting(true);
    try {
      const exported = await saveMarkdownArtifactPdfExport({
        projectId: input.currentProjectId,
        title: markdownTitle,
        markdown,
      });
      console.info(`[ai-doc] Exported Markdown PDF to ${exported.path}`);
      input.setExportNotice(`Exported PDF to ${exported.path}`);
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
    input.setPdfExporting(true);
    try {
      const exported = await saveDocxArtifactPdfExport({
        previewElement,
        projectId: input.currentProjectId,
        title: docxTitle,
      });
      console.info(`[ai-doc] Exported DOCX PDF to ${exported.path}`);
      input.setExportNotice(`Exported PDF to ${exported.path}`);
    } catch (err) {
      input.setError(err instanceof Error ? err.message : String(err));
    } finally {
      input.setPdfExporting(false);
    }
  };

  const openCurrentProjectExportsDir = async () => {
    if (!input.currentProjectId) return;
    input.setError("");
    try {
      await openProjectExportsDir(input.currentProjectId);
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
