import { resolve } from "node:path";
import { LocalAgentRuntimeProvider as SharedLocalAgentRuntimeProvider } from "@ai-app/agent/local-agent-runtime";
import type { AiEditRequest, SlideRun } from "@ai-slide/shared";
import { projectWorkspaceRoot } from "../local/paths.js";
import { extractOoxmlTextPreview } from "../artifact/ooxml-text.js";
import type { RuntimeEditContext, SlideRuntimeProject } from "./runtime-provider.js";

const noBrowserRenderVerification =
  "Do not proactively use browser, Playwright, Chrome, or JavaScript rendering tools for visual verification unless the user explicitly asks for browser-based validation.";

export class LocalAgentRuntimeProvider extends SharedLocalAgentRuntimeProvider<SlideRun, SlideRuntimeProject, AiEditRequest> {
  constructor() {
    super({
      workspaceRoot: (context) => projectWorkspaceRoot(context.project.id),
      buildPrompt: buildEditPrompt,
      buildSystemPrompt,
      buildEnv: (context, workspaceRoot) => ({
        AI_SLIDE_WORKSPACE: workspaceRoot,
        AI_SLIDE_PROJECT_ID: context.project.id,
        AI_SLIDE_RUN_ID: context.run.id,
      }),
      timeoutMs: () => Number(process.env.AI_SLIDE_LOCAL_AGENT_TIMEOUT_MS ?? 240_000),
      sessionDirName: ".ai-slide",
    });
  }
}

function buildSystemPrompt(context: RuntimeEditContext) {
  if (context.project.artifact.type === "pptx") {
    return [
      "You are an AI slide editing agent inside a local presentation app.",
      "This project is a PowerPoint PPTX presentation.",
      "The canonical file is `slides.pptx` in the current working directory.",
      "When asked to create or edit the presentation, write the final PPTX result to `slides.pptx`.",
      "Do not convert the presentation to Markdown or a single HTML document unless explicitly asked for a separate export.",
      noBrowserRenderVerification,
    ].join("\n\n");
  }

  return [
    "You are an AI slide editing agent inside a local presentation app.",
    "The canonical editable deck is the `deck.slides/` directory in the current working directory.",
    "Read `deck.slides/manifest.json` for deck structure and edit individual slide HTML files under `deck.slides/slides/`.",
    "Preserve the 1920x1080 canvas, existing asset paths, and slide-level HTML structure unless the user explicitly asks for a redesign.",
    "Do not collapse the deck into one HTML file. Make direct file edits in the deck directory.",
    noBrowserRenderVerification,
  ].join("\n\n");
}

function buildEditPrompt(context: RuntimeEditContext) {
  const selection = [
    `selection_type: ${context.request.selectionType ?? "write"}`,
    `selection_path: ${context.request.selectionPath ?? ""}`,
    `selected_text: ${context.request.selectedText ?? ""}`,
    `selected_html: ${context.request.selectedHtml ?? ""}`,
  ].join("\n");

  if (context.project.artifact.type === "pptx") {
    return `<slide_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
artifact_type: pptx
mode: ${context.request.mode}
canonical_pptx_path: slides.pptx
${selection}
</slide_agent_context>

<current_pptx_manifest>
${JSON.stringify(context.project.pptxManifest ?? null, null, 2)}
</current_pptx_manifest>

<current_pptx_text_preview>
${extractOoxmlTextPreview(resolve(projectWorkspaceRoot(context.project.id), "slides.pptx"), {
  pathPattern: /^ppt\/slides\/slide\d+\.xml$/,
})}
</current_pptx_text_preview>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

Create or edit the PPTX file at slides.pptx.`;
  }

  return `<slide_agent_context>
project_id: ${context.project.id}
title: ${context.project.title}
artifact_type: deck
mode: ${context.request.mode}
canonical_deck_dir: deck.slides
${selection}
</slide_agent_context>

<current_deck_manifest>
${JSON.stringify(context.project.deckManifest ?? null, null, 2)}
</current_deck_manifest>

<current_deck_slide_html_previews>
${JSON.stringify(context.project.deckSlides ?? [], null, 2)}
</current_deck_slide_html_previews>

<user_instruction>
${context.request.userPrompt}
</user_instruction>

Edit the deck files in deck.slides directly.`;
}
