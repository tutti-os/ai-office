import type { SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";
import type { TuttiRecommendedSystemPrompt } from "@tutti-os/agent-acp-kit/tutti";
import type { AgentRunTimingLogger } from "@ai-app/agent/agent-run-timing";

export type LocalAgentSkillContext = {
  skills: SkillMaterializationRecord[];
  recommendedSystemPrompt?: TuttiRecommendedSystemPrompt;
};

export type LocalAgentSkillManifestResult = SkillMaterializationRecord[] | Partial<LocalAgentSkillContext>;

export type PreparedLocalAgentRun = {
  appEnv: Record<string, string>;
  skillContext: LocalAgentSkillContext;
  systemPrompt: string;
};

export async function prepareLocalAgentRun<TContext>(input: {
  context: TContext;
  runCwd: string;
  timing: AgentRunTimingLogger;
  buildSkillManifest?: (context: TContext, runCwd: string) => LocalAgentSkillManifestResult | Promise<LocalAgentSkillManifestResult>;
  buildEnv?: (context: TContext, runCwd: string) => Record<string, string> | Promise<Record<string, string>>;
  buildSystemPrompt: (context: TContext, runCwd: string, skillContext: LocalAgentSkillContext) => string | Promise<string>;
}): Promise<PreparedLocalAgentRun> {
  const skillContextPromise = input.timing.measure("prepare", "skill_manifest", async () =>
    normalizeSkillManifestResult(await input.buildSkillManifest?.(input.context, input.runCwd)));
  const appEnvPromise = input.timing.measure("prepare", "app_env", async () =>
    (await input.buildEnv?.(input.context, input.runCwd)) ?? {});
  const [skillContext, appEnv] = await Promise.all([skillContextPromise, appEnvPromise]);
  const systemPrompt = await input.timing.measure("prepare", "system_prompt", () =>
    input.buildSystemPrompt(input.context, input.runCwd, skillContext));
  return { appEnv, skillContext, systemPrompt };
}

function normalizeSkillManifestResult(value: LocalAgentSkillManifestResult | undefined): LocalAgentSkillContext {
  if (!value) return { skills: [] };
  if (Array.isArray(value)) return { skills: value };
  return {
    skills: value.skills ?? [],
    ...(value.recommendedSystemPrompt ? { recommendedSystemPrompt: value.recommendedSystemPrompt } : {}),
  };
}
