/** True when the focused on-disk artifact is gone (external rename/delete, etc.). */
export function isMissingDocumentError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error ?? "")).toLowerCase();
  if (!message.trim()) return false;
  return (
    message.includes("enoent") ||
    message.includes("no such file") ||
    message.includes("document file is missing") ||
    message.includes("is missing at")
  );
}
