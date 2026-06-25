import type { HomeAttachment } from "./useHomeAttachments";
import { uploadContextAttachment } from "../api/projects";

export type UploadedHomeContextAttachment = {
  originalName: string;
  fileName: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
};

export async function uploadHomeContextAttachments(projectId: string, attachments: HomeAttachment[]): Promise<UploadedHomeContextAttachment[]> {
  const uploaded: UploadedHomeContextAttachment[] = [];
  for (const attachment of attachments) {
    const asset = await uploadContextAttachment(projectId, attachment.file);
    uploaded.push({
      originalName: attachment.name,
      fileName: asset.fileName,
      path: asset.path,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
    });
  }
  return uploaded;
}

export function initialPromptWithAttachmentContext(userPrompt: string, attachments: UploadedHomeContextAttachment[], defaultInstruction: string) {
  if (attachments.length === 0) return userPrompt;
  const instruction = userPrompt.trim() || defaultInstruction;
  return [
    instruction,
    "",
    "Context attachments uploaded with this project:",
    ...attachments.map((attachment, index) => {
      const displayName = attachment.originalName === attachment.fileName ? attachment.fileName : `${attachment.originalName} saved as ${attachment.fileName}`;
      return `${index + 1}. ${displayName} (${attachment.mimeType}, ${formatBytes(attachment.sizeBytes)}): ${attachment.path}`;
    }),
    "",
    "Use these files as source context. Read them from the project workspace before drafting or editing the workbook.",
  ].join("\n");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const kib = bytes / 1024;
  if (kib < 1024) return `${kib.toFixed(kib >= 10 ? 0 : 1)} KB`;
  const mib = kib / 1024;
  return `${mib.toFixed(mib >= 10 ? 0 : 1)} MB`;
}
