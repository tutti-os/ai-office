import { createTuttiExternalRichTextMentionService } from "@tutti-os/workspace-external-core/rich-text";

export function createTuttiExternalMentionService() {
  return createTuttiExternalRichTextMentionService({
    getBridge: () => (typeof window === "undefined" ? undefined : (window as unknown as { tuttiExternal?: unknown }).tuttiExternal) as never,
    providerIds: ["workspace-app", "agent-target"],
  });
}
