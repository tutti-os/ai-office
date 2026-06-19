import type { AiEditRequest, DocumentType } from "@ai-doc/shared";
import { createEmptyDocxDocumentManifest, serializeDocxDocumentManifest } from "@ai-doc/shared";
import { defaultMarkdownDocument } from "../artifact/markdownArtifactAdapter";
import { blankHtmlDocument } from "../artifact/runtime/documentSeeds";

export function initialContentForType(type: DocumentType) {
  if (type === "markdown") return defaultMarkdownDocument;
  if (type === "docx") return serializeDocxDocumentManifest(createEmptyDocxDocumentManifest());
  return blankHtmlDocument;
}

export function markdownTemplateSeed(name: string, description: string, prompt: string) {
  return `# ${name}

${description}

## Brief

${plainTextPreview(prompt)}

## Draft

- Replace this outline with your content.
`;
}

export function createInitialPromptAiEditRequest(input: {
  content: string;
  runtimeProfileId: string | null;
  type: DocumentType;
  userPrompt: string;
}): AiEditRequest {
  return {
    htmlContent: input.content,
    selectedText: "",
    selectedHtml: "",
    selectionType: "write",
    selectionPath: input.type === "markdown" ? "markdown:0-0" : "",
    userPrompt: input.userPrompt,
    mode: "write",
    runtimeProfileId: input.runtimeProfileId,
  };
}

export function markdownWordCount(content: string) {
  return content.trim().match(/\S+/g)?.length ?? 0;
}

export function markdownParagraphCount(content: string) {
  return content.split(/\n{2,}/).filter((block) => block.trim()).length;
}

function plainTextPreview(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}
