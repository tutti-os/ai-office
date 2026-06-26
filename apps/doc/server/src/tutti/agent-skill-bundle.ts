import type { SkillMaterializationFile, SkillMaterializationRecord } from "@tutti-os/agent-acp-kit";
import { configuredTuttiCliPath, runTuttiCli } from "./tutti-cli.js";

const skillBundleTimeoutMs = 10_000;
const skillBundleMaxBuffer = 1024 * 1024;

export interface TuttiAgentSkillManifestInput {
  provider: string;
  agentSessionId: string;
  workspaceCwd: string;
}

export interface TuttiAgentSkillContext {
  skills: SkillMaterializationRecord[];
  systemPrompt?: string;
}

interface TuttiAgentSkillBundle {
  schemaVersion?: number;
  provider?: string;
  agentSessionId?: string;
  cliCommand?: string;
  recommendedSystemPrompt?: {
    format?: string;
    content: string;
  };
  skills: SkillMaterializationRecord[];
}

export async function loadTuttiAgentSkillContext(input: TuttiAgentSkillManifestInput): Promise<TuttiAgentSkillContext> {
  if (!configuredTuttiCliPath()) return { skills: [] };

  const bundle = parseTuttiAgentSkillBundle(
    await runTuttiCli(
      [
        "agent",
        "tutti-cli-skill-bundle",
        "--provider",
        input.provider,
        "--agent-session-id",
        input.agentSessionId,
        "--json",
      ],
      {
        cwd: input.workspaceCwd,
        timeoutMs: skillBundleTimeoutMs,
        maxBuffer: skillBundleMaxBuffer,
      },
    ),
  );

  if (bundle.provider && bundle.provider !== input.provider) {
    throw new Error(`Tutti skill bundle provider mismatch: expected ${input.provider}, got ${bundle.provider}`);
  }
  if (bundle.agentSessionId && bundle.agentSessionId !== input.agentSessionId) {
    throw new Error(
      `Tutti skill bundle session mismatch: expected ${input.agentSessionId}, got ${bundle.agentSessionId}`,
    );
  }

  return {
    skills: bundle.skills,
    systemPrompt: normalizeRecommendedSystemPrompt(bundle.recommendedSystemPrompt),
  };
}

export async function loadTuttiAgentSkillManifest(input: TuttiAgentSkillManifestInput): Promise<SkillMaterializationRecord[]> {
  return (await loadTuttiAgentSkillContext(input)).skills;
}

function parseTuttiAgentSkillBundle(value: unknown): TuttiAgentSkillBundle {
  if (!isRecord(value)) throw new Error("Tutti skill bundle response is not an object");
  if (!Array.isArray(value.skills)) throw new Error("Tutti skill bundle response does not contain a skills array");
  const recommendedSystemPrompt = parseRecommendedSystemPrompt(value.recommendedSystemPrompt);

  return {
    ...(typeof value.schemaVersion === "number" ? { schemaVersion: value.schemaVersion } : {}),
    ...(typeof value.provider === "string" ? { provider: value.provider } : {}),
    ...(typeof value.agentSessionId === "string" ? { agentSessionId: value.agentSessionId } : {}),
    ...(typeof value.cliCommand === "string" ? { cliCommand: value.cliCommand } : {}),
    ...(recommendedSystemPrompt ? { recommendedSystemPrompt } : {}),
    skills: value.skills.map((item, index) => {
      if (!isSkillMaterializationRecord(item)) {
        throw new Error(`Tutti skill bundle contains an invalid skill record at index ${index}`);
      }
      return item;
    }),
  };
}

function parseRecommendedSystemPrompt(value: unknown): TuttiAgentSkillBundle["recommendedSystemPrompt"] {
  if (value === undefined || value === null) return undefined;
  if (!isRecord(value)) throw new Error("Tutti skill bundle recommendedSystemPrompt is not an object");
  if (typeof value.content !== "string") {
    throw new Error("Tutti skill bundle recommendedSystemPrompt.content is not a string");
  }
  return {
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    content: value.content,
  };
}

function normalizeRecommendedSystemPrompt(value: TuttiAgentSkillBundle["recommendedSystemPrompt"]) {
  const content = value?.content.trim();
  return content ? content : undefined;
}

function isSkillMaterializationRecord(value: unknown): value is SkillMaterializationRecord {
  if (!isRecord(value)) return false;
  if (typeof value.skillId !== "string" || !value.skillId) return false;
  if (typeof value.slug !== "string" || !value.slug) return false;
  if (
    value.deliveryMode !== "materialized-files" &&
    value.deliveryMode !== "prompt-injection" &&
    value.deliveryMode !== "project-instructions"
  ) {
    return false;
  }
  if (value.content !== undefined && typeof value.content !== "string") return false;
  if (value.materializedPath !== undefined && typeof value.materializedPath !== "string") return false;
  if (value.files !== undefined) {
    if (!Array.isArray(value.files)) return false;
    return value.files.every(isSkillMaterializationFile);
  }
  return true;
}

function isSkillMaterializationFile(value: unknown): value is SkillMaterializationFile {
  return isRecord(value) && typeof value.path === "string" && typeof value.content === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
