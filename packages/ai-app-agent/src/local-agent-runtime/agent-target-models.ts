import type { loadTuttiAgentComposerOptions } from "@tutti-os/agent-acp-kit/tutti";
import type { LocalAgentTargetStatus } from "@ai-app/shared/types";

type ComposerOptions = Awaited<ReturnType<typeof loadTuttiAgentComposerOptions>>;

export function projectAgentTargetModels(
  composer: ComposerOptions,
): Pick<LocalAgentTargetStatus, "models" | "defaultModelId"> {
  const seen = new Set<string>();
  const models = composer.modelConfig.options.flatMap((option) => {
    const id = (option.value || option.id).trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: option.label.trim() || id }];
  });
  const configuredDefault = composer.modelConfig.defaultValue.trim() || composer.modelConfig.currentValue.trim();
  const defaultModelId = configuredDefault && seen.has(configuredDefault)
    ? configuredDefault
    : models[0]?.id;
  return {
    models,
    ...(defaultModelId ? { defaultModelId } : {}),
  };
}

export function logAgentComposerOptionsFailure(
  error: unknown,
  target: Pick<LocalAgentTargetStatus, "agentTargetId" | "providerId">,
) {
  const candidate = error as { code?: unknown; message?: unknown };
  console.warn(JSON.stringify({
    event: "ai_app.local_agent.composer_options.failed",
    agentTargetId: target.agentTargetId,
    providerId: target.providerId,
    code: typeof candidate?.code === "string" ? candidate.code : "unknown",
    message: typeof candidate?.message === "string" ? candidate.message : "Unable to load composer options",
  }));
}
