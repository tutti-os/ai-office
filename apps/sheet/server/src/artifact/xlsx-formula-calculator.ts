import { createHash } from "node:crypto";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  XlsxFormulaCalculator as WorkerBackedXlsxFormulaCalculator,
  applyCalcResult,
  calculateXlsxFileInProcess,
  type XlsxFormulaCalcInput,
  type XlsxFormulaCalcResult,
  type XlsxFormulaCalculatorOptions,
} from "@tutti-os/office-formula-calc";

export { applyCalcResult, calculateXlsxFileInProcess };
export type {
  XlsxDirtyCell,
  XlsxFormulaCalculatorOptions,
} from "@tutti-os/office-formula-calc";
export type { XlsxFormulaCalcInput, XlsxFormulaCalcResult };

export type GuardedXlsxFormulaCalcResult = XlsxFormulaCalcResult & {
  stale?: boolean;
};

export class XlsxFormulaCalculator {
  private readonly calculator: WorkerBackedXlsxFormulaCalculator;

  constructor(private readonly options: XlsxFormulaCalculatorOptions = {}) {
    this.calculator = new WorkerBackedXlsxFormulaCalculator({
      ...options,
      useWorker: options.useWorker ?? true,
    });
  }

  async calculateFile(input: XlsxFormulaCalcInput): Promise<GuardedXlsxFormulaCalcResult> {
    const before = await fileFingerprint(input.workbookPath);
    const tempDir = await mkdtemp(join(tmpdir(), "ai-sheet-calc-"));
    const tempWorkbookPath = join(tempDir, "workbook.xlsx");

    try {
      await copyFile(input.workbookPath, tempWorkbookPath);
      const result = await this.calculator.calculateFile({
        ...input,
        workbookPath: tempWorkbookPath,
      });
      const after = await fileFingerprint(input.workbookPath);
      if (after.sha256 !== before.sha256 || after.sizeBytes !== before.sizeBytes) {
        return {
          ...result,
          changed: false,
          stale: true,
          status: "stale",
          diagnostics: [
            ...(Array.isArray(result.diagnostics) ? result.diagnostics : []),
            "Workbook changed while formula calculation was running; discarded stale calculation output.",
          ],
        };
      }
      const calculated = await fileFingerprint(tempWorkbookPath);
      if (calculated.sha256 === before.sha256 && calculated.sizeBytes === before.sizeBytes) {
        return {
          ...result,
          changed: false,
        };
      }
      if (result.changed) {
        await copyFile(tempWorkbookPath, input.workbookPath);
      }
      return result;
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }
  }
}

async function fileFingerprint(path: string) {
  const bytes = await readFile(path);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
  };
}
