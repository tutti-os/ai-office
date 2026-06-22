import type { RuntimeEditContext as SharedRuntimeEditContext, RuntimeProvider as SharedRuntimeProvider, RuntimeStreamEvent } from "@ai-app/agent/runtime";
import { RuntimeProviderUnsupportedError } from "@ai-app/agent/runtime";
import type { AiEditRequest, DeckManifest, PptxManifest, SlideArtifact, SlideProject, SlideRun } from "@ai-slide/shared";

export type SlideRuntimeProject = SlideProject & {
  artifact: SlideArtifact;
  deckManifest?: DeckManifest | null;
  deckSlides?: Array<{ id: string; displayName: string; file: string; htmlPreview: string }>;
  pptxManifest?: PptxManifest | null;
};

export type RuntimeEditContext = SharedRuntimeEditContext<SlideRun, SlideRuntimeProject, AiEditRequest>;
export type RuntimeProvider = SharedRuntimeProvider<SlideRun, SlideRuntimeProject, AiEditRequest>;
export type { RuntimeStreamEvent };
export { RuntimeProviderUnsupportedError };
