import { useCallback, useEffect, useRef, useState } from "react";

export type HomeAttachment = {
  id: string;
  file: File;
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string | null;
};

export function useHomeAttachments() {
  const [attachments, setAttachments] = useState<HomeAttachment[]>([]);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  useEffect(() => {
    return () => {
      for (const attachment of attachmentsRef.current) {
        revokePreviewUrl(attachment);
      }
    };
  }, []);

  const addFiles = useCallback((files: File[]) => {
    const nextAttachments = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      name: file.name,
      size: file.size,
      mimeType: file.type || "application/octet-stream",
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    if (nextAttachments.length > 0) {
      setAttachments((current) => [...current, ...nextAttachments]);
    }
  }, []);

  const removeAttachment = useCallback((id: string) => {
    setAttachments((current) => {
      const target = current.find((attachment) => attachment.id === id);
      if (target) revokePreviewUrl(target);
      return current.filter((attachment) => attachment.id !== id);
    });
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      for (const attachment of current) {
        revokePreviewUrl(attachment);
      }
      return [];
    });
  }, []);

  return {
    attachments,
    addFiles,
    removeAttachment,
    clearAttachments,
  };
}

function revokePreviewUrl(attachment: HomeAttachment) {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
}
