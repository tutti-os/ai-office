import { useCallback, useMemo } from "react";
import { useOfficePreviewArtifactRuntime } from "@ai-app/ui/office-preview-runtime";
import { createXlsxPreviewService } from "@tutti-os/office-preview/xlsx";
import type { SheetCommand } from "@ai-sheet/shared";
import { getProjectXlsxFile } from "../api/projects";
import { XlsxArtifactRuntimeAdapter, type XlsxRuntimeParseInput, type XlsxRuntimeState, type XlsxSelection } from "./xlsxArtifactAdapter";

export function useXlsxArtifactRuntime(adapter: XlsxArtifactRuntimeAdapter) {
  const options = useMemo(
    () => ({
      adapter,
      createPreviewService: () =>
        createXlsxPreviewService({
          assetBaseUrl: import.meta.env.DEV ? "/office-preview-dev/ooxml-convert/" : "/office-preview/ooxml-convert/",
        }),
      fetchBytes: getProjectXlsxFile,
      extension: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      fileName: (runtime: XlsxRuntimeState) => runtime.manifest.fileName,
      hasPreviewSource: (runtime: XlsxRuntimeState) => runtime.manifest.exists,
      updateSelection: (runtime: XlsxRuntimeState, selection: XlsxSelection) => ({ ...runtime, selection }),
      initialSaveState: "saved" as const,
    }),
    [adapter],
  );

  const runtime = useOfficePreviewArtifactRuntime<
    XlsxRuntimeState,
    XlsxRuntimeParseInput,
    NonNullable<XlsxRuntimeState["preview"]>,
    XlsxSelection,
    Parameters<XlsxArtifactRuntimeAdapter["createAiEditRequest"]>[0],
    ReturnType<XlsxArtifactRuntimeAdapter["createAiEditRequest"]>
  >(options);

  const applyCommand = useCallback(
    (command: SheetCommand) => {
      let applied = false;
      runtime.setRuntime((current) => {
        if (!current?.editor) return current;
        switch (command.type) {
          case "set-cell-value": {
            const point = pointFromCellAddress(command.address);
            if (!point) throw new Error(`Invalid cell address: ${command.address}`);
            const formula = formulaInput(command.input);
            const patch = formula
              ? current.editor.setCellFormula(point.row, point.col, formula, command.sheetId)
              : current.editor.setCellValue(point.row, point.col, command.input, command.sheetId);
            applied = true;
            return {
              ...current,
              dirty: true,
              renderWorkbook: current.editor.renderWorkbook(patch.change),
              revision: current.revision + 1,
              selection: {
                sheetId: command.sheetId,
                sheetName: command.sheetName ?? current.selection.sheetName,
                address: command.address.toUpperCase(),
                selectedText: command.input,
              },
            };
          }
        }
      });
    },
    [runtime],
  );

  return { ...runtime, applyCommand };
}

function formulaInput(input: string) {
  const value = input.trimStart();
  return value.startsWith("=") ? value.slice(1) : "";
}

function pointFromCellAddress(address: string) {
  const match = address.trim().match(/^\$?([A-Za-z]+)\$?([1-9]\d*)$/);
  if (!match) return null;
  return { col: columnNameToIndex(match[1]), row: Number(match[2]) - 1 };
}

function columnNameToIndex(name: string) {
  let index = 0;
  for (const char of name.trim().toUpperCase()) {
    index = index * 26 + char.charCodeAt(0) - 64;
  }
  return index - 1;
}
