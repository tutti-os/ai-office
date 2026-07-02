import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SheetCommand } from "@ai-sheet/shared";
import { officeCliEnv, requireOfficeCli } from "../toolchains/officecli.js";
import { XlsxFormulaCalculator, type XlsxDirtyCell, type XlsxFormulaCalcResult } from "./xlsx-formula-calculator.js";

const execFileAsync = promisify(execFile);

export class XlsxStorageAdapter {
  constructor(private readonly calculator = new XlsxFormulaCalculator({ useWorker: true })) {}

  async createBlankWorkbook(input: { workbookPath: string }) {
    const status = await requireOfficeCli();
    if (!status.executablePath) throw new Error("OfficeCLI executable path is missing.");
    const env = { ...process.env, ...(await officeCliEnv()) };
    await execFileAsync(status.executablePath, ["create", input.workbookPath, "--type", "xlsx", "--force", "--json"], { env, timeout: 30_000 });
  }

  async applyCommands(input: { commands: SheetCommand[]; workbookPath: string }) {
    const status = await requireOfficeCli();
    if (!status.executablePath) throw new Error("OfficeCLI executable path is missing.");
    const env = { ...process.env, ...(await officeCliEnv()) };

    for (const command of input.commands) {
      switch (command.type) {
        case "set-cell-value":
          await execFileAsync(
            status.executablePath,
            ["set", input.workbookPath, cellPath(command), "--prop", cellInputProp(command.input), "--json"],
            { env, timeout: 30_000 },
          );
          break;
      }
    }
  }

  async recalculateWorkbook(input: {
    workbookPath: string;
    dirtyCells?: XlsxDirtyCell[];
    forceFullRecalc?: boolean;
  }): Promise<XlsxFormulaCalcResult> {
    return this.calculator.calculateFile(input);
  }
}

function cellInputProp(input: string) {
  const value = input.trimStart();
  if (value.startsWith("=")) return `formula=${value.slice(1)}`;
  return `value=${input}`;
}

function cellPath(command: Extract<SheetCommand, { type: "set-cell-value" }>) {
  const sheetName = (command.sheetName || command.sheetId).trim();
  const address = command.address.trim().toUpperCase();
  if (!sheetName) throw new Error("Sheet name is required.");
  if (!/^[A-Z]+[1-9]\d*$/.test(address)) throw new Error(`Invalid cell address: ${command.address}`);
  return `/${sheetName}/${address}`;
}
