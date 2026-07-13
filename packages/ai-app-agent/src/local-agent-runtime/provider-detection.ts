import { createHash } from "node:crypto";
import type { DetectContext, DetectedProvider, LocalAgentRuntime } from "@tutti-os/agent-acp-kit";
import type { LocalAgentProviderStatus } from "@ai-app/shared/types";

type DetectableRuntime = Pick<LocalAgentRuntime, "detect">;

export interface LocalAgentProviderDetector {
  detect(context?: DetectContext): Promise<LocalAgentProviderStatus[]>;
}

export function createLocalAgentProviderDetector(runtime: DetectableRuntime): LocalAgentProviderDetector {
  const inFlight = new Map<string, Promise<LocalAgentProviderStatus[]>>();

  return {
    detect(context) {
      const key = detectionKey(context);
      const current = inFlight.get(key);
      if (current) return current;

      const operation = runtime.detect(context)
        .then((providers) => providers.map(mapDetectedProvider))
        .finally(() => {
          if (inFlight.get(key) === operation) inFlight.delete(key);
        });
      inFlight.set(key, operation);
      return operation;
    },
  };
}

function mapDetectedProvider(provider: DetectedProvider): LocalAgentProviderStatus {
  return {
    provider: provider.provider,
    displayName: provider.displayName,
    supported: provider.supported,
    authState: provider.authState,
    models: provider.models.map((model) => ({ id: model.id, label: model.label })),
    ...(provider.defaultModelId ? { defaultModelId: provider.defaultModelId } : {}),
    ...(provider.isDefault ? { isDefault: true as const } : {}),
    ...(provider.reason ? { reason: provider.reason } : {}),
  };
}

function detectionKey(context: DetectContext | undefined) {
  const managed = context?.managedAgentInvocation;
  const workspace = managed?.cwd
    ?? context?.cwd
    ?? context?.env?.TSH_WORKSPACE_ID
    ?? context?.env?.TUTTI_WORKSPACE_ROOT
    ?? "standalone";
  return [
    managed ? "managed" : "standalone",
    context?.refresh ? "refresh" : "normal",
    fingerprint(workspace),
    fingerprint(managed?.credential ?? "anonymous"),
    fingerprint(
      Object.entries(context?.env ?? {})
        .filter((entry): entry is [string, string] => typeof entry[1] === "string")
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}\u0000${value}`)
        .join("\u0001"),
    ),
  ].join(":");
}

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
