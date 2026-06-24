export type ContextAttachmentUploadResponse = {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export const contextAttachmentFileExtensions = [
  ".bash",
  ".c",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".doc",
  ".docx",
  ".env",
  ".fish",
  ".gif",
  ".go",
  ".h",
  ".hpp",
  ".htm",
  ".html",
  ".ini",
  ".ipynb",
  ".java",
  ".jpeg",
  ".jpg",
  ".js",
  ".json",
  ".jsonl",
  ".jsx",
  ".kt",
  ".log",
  ".md",
  ".markdown",
  ".pdf",
  ".php",
  ".png",
  ".ppt",
  ".pptx",
  ".py",
  ".r",
  ".rb",
  ".rs",
  ".scss",
  ".sh",
  ".sql",
  ".svg",
  ".swift",
  ".toml",
  ".ts",
  ".tsv",
  ".tsx",
  ".txt",
  ".webp",
  ".xls",
  ".xlsx",
  ".xml",
  ".yaml",
  ".yml",
  ".zsh",
] as const;

export const contextAttachmentMimeTypes = [
  "application/json",
  "application/msword",
  "application/pdf",
  "application/rtf",
  "application/vnd.ms-excel",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/*",
  "text/*",
] as const;

export const contextAttachmentFileAccept = [
  ...contextAttachmentFileExtensions,
  ...contextAttachmentMimeTypes,
].join(",");

export function contextAttachmentRelativePath(fileName: string) {
  return `./context/attachments/${fileName}`;
}
