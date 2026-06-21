import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function openPathInFileManager(path: string) {
  if (process.platform === "darwin") {
    await execFileAsync("open", [path], { timeout: 5000 });
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("explorer", [path], { timeout: 5000 });
    return;
  }
  await execFileAsync("xdg-open", [path], { timeout: 5000 });
}
