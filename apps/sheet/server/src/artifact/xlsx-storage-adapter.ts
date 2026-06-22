import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SheetCommand } from "@ai-sheet/shared";
import { officeCliEnv, requireOfficeCli } from "../toolchains/officecli.js";

const execFileAsync = promisify(execFile);

export class XlsxStorageAdapter {
  async applyCommands(input: { commands: SheetCommand[]; workbookPath: string }) {
    const status = await requireOfficeCli();
    if (!status.executablePath) throw new Error("OfficeCLI executable path is missing.");
    const env = { ...process.env, ...(await officeCliEnv()) };

    for (const command of input.commands) {
      switch (command.type) {
        case "set-cell-value":
          await execFileAsync(
            status.executablePath,
            ["set", input.workbookPath, cellPath(command), "--prop", `value=${command.input}`, "--json"],
            { env, timeout: 30_000 },
          );
          break;
      }
    }
  }
}

function cellPath(command: Extract<SheetCommand, { type: "set-cell-value" }>) {
  const sheetName = (command.sheetName || command.sheetId).trim();
  const address = command.address.trim().toUpperCase();
  if (!sheetName) throw new Error("Sheet name is required.");
  if (!/^[A-Z]+[1-9]\d*$/.test(address)) throw new Error(`Invalid cell address: ${command.address}`);
  return `/${sheetName}/${address}`;
}
