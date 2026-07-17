import type { AiEditRequest, RuntimeProfile } from "@ai-doc/shared";

export function assistantConversationContent(runtimeProfile: RuntimeProfile, generatedText: string, resultPreview: string) {
  if (runtimeProfile.kind === "local-agent") return generatedText.trim() || resultPreview.trim() || "Run completed.";
  return resultPreview.trim() || previewText(generatedText) || "Run completed.";
}

export function previewText(value: string) {
  const text = value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 280 ? `${text.slice(0, 280)}...` : text;
}

export function conversationMessageMetadata(request: AiEditRequest) {
  return {
    mode: request.mode,
    selectionPath: request.selectionPath ?? "",
    selectionType: request.selectionType ?? "write",
    selectedText: request.selectedText ?? "",
  };
}
