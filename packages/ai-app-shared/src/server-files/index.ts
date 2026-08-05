import { mkdir, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { contextAttachmentRelativePath, type ContextAttachmentUploadResponse } from "../context-attachments/index.js";

export type ArtifactBinaryFile = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export type ArtifactUploadRequest = {
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
};

export type ArtifactUpload = {
  fileName: string;
  mimeType: string;
  bytes: Buffer;
};

export function addArtifactBufferContentTypeParsers(server: {
  addContentTypeParser: (contentType: string | RegExp, options: { parseAs: "buffer"; bodyLimit?: number }, parser: (request: unknown, body: Buffer, done: (error: Error | null, body?: Buffer) => void) => void) => void;
}, input: {
  imageBodyLimit?: number;
  octetStreamBodyLimit: number;
}) {
  if (input.imageBodyLimit) {
    server.addContentTypeParser(/^image\/.*/i, { parseAs: "buffer", bodyLimit: input.imageBodyLimit }, (_request, body, done) => {
      done(null, body);
    });
  }
  server.addContentTypeParser("application/octet-stream", { parseAs: "buffer", bodyLimit: input.octetStreamBodyLimit }, (_request, body, done) => {
    done(null, body);
  });
}

export function readArtifactUploadRequest(request: ArtifactUploadRequest, input: {
  defaultFileName: string;
  defaultMimeType?: string;
  mimeHeader?: "x-file-mime-type" | "x-mime-type";
}) {
  const defaultMimeType = input.defaultMimeType ?? "application/octet-stream";
  return {
    fileName: decodedHeader(request.headers["x-file-name"]) ?? input.defaultFileName,
    mimeType: decodedHeader(request.headers[input.mimeHeader ?? "x-file-mime-type"])?.split(";")[0]?.trim().toLowerCase()
      || contentType(request)
      || defaultMimeType,
    bytes: requestBytes(request.body),
  } satisfies ArtifactUpload;
}

export function readArtifactExportRequest(request: ArtifactUploadRequest, input: {
  defaultFileName: string;
  defaultMimeType: string;
}) {
  return {
    ...readArtifactUploadRequest(request, {
      defaultFileName: input.defaultFileName,
      defaultMimeType: input.defaultMimeType,
      mimeHeader: "x-mime-type",
    }),
    targetDirectory: decodedHeader(request.headers["x-export-directory"]),
  };
}

export function sendArtifactBinaryFile(reply: {
  type: (mimeType: string) => { header: (name: string, value: string) => { send: (payload: Buffer) => unknown } };
}, file: ArtifactBinaryFile) {
  return reply
    .type(file.mimeType)
    .header("content-disposition", contentDispositionInline(file.fileName))
    .send(file.bytes);
}

export function requestBytes(body: unknown) {
  if (Buffer.isBuffer(body)) return body;
  if (typeof body === "string") return Buffer.from(body);
  return Buffer.from([]);
}

export async function writeContextAttachmentFile(projectRoot: string, input: ArtifactUpload): Promise<ContextAttachmentUploadResponse> {
  const attachmentsDir = join(projectRoot, "context", "attachments");
  await mkdir(attachmentsDir, { recursive: true });
  const fileName = await writeUniqueContextAttachment(attachmentsDir, input.fileName, input.bytes);
  return {
    path: contextAttachmentRelativePath(fileName),
    fileName,
    mimeType: input.mimeType,
    sizeBytes: input.bytes.byteLength,
  };
}

function contentType(request: ArtifactUploadRequest) {
  const header = decodedHeader(request.headers["content-type"]);
  return header?.split(";")[0]?.trim().toLowerCase() || null;
}

function decodedHeader(value: string | string[] | undefined) {
  if (typeof value !== "string") return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function writeUniqueContextAttachment(attachmentsDir: string, requestedName: string, bytes: Buffer) {
  const safeName = safeContextAttachmentFileName(requestedName);
  const extension = extname(safeName);
  const stem = basename(safeName, extension) || "attachment";
  let candidate = safeName;
  let index = 2;
  while (true) {
    try {
      await writeFile(join(attachmentsDir, candidate), bytes, { flag: "wx" });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      candidate = `${stem}-${index}${extension}`;
      index += 1;
    }
  }
}

function safeContextAttachmentFileName(fileName: string) {
  const rawBase = userFileBaseName(fileName || "attachment");
  const rawExtension = extname(rawBase);
  const extension = safeContextAttachmentExtension(rawExtension);
  const stem = rawBase
    .slice(0, rawBase.length - rawExtension.length)
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || "attachment";
  return `${stem}${extension}`;
}

function userFileBaseName(fileName: string) {
  return basename(fileName).split(/[\\/]/).filter(Boolean).pop() || fileName;
}

function contentDispositionInline(fileName: string) {
  const fallback = fileName.replace(/[^\x20-\x7E]+/g, "_").replace(/["\\]/g, "_") || "file";
  return `inline; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function safeContextAttachmentExtension(extension: string) {
  if (!extension) return "";
  const bare = extension.slice(1);
  if (!bare || bare.length > 24 || !/^[A-Za-z0-9._-]+$/.test(bare)) return "";
  return `.${bare.toLowerCase()}`;
}
