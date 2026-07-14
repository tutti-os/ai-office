# Agent Target Runtime Identity

AI Doc, AI Slide, and AI Sheet use the Tutti Agent catalog as the source of truth for local app-agent choices. The stable identity is the exact `agentTargetId`; `providerId` is derived metadata used only to select the ACP runtime adapter and normalize model ids.

## Selection

1. Honor an explicit exact Agent Target selected by the UI or passed as CLI `agent-id`.
2. Otherwise use the available catalog entry marked as default.
3. Otherwise use the first available catalog entry.
4. If the catalog cannot be loaded or contains no available target, fail closed.

Callers and agent instructions should discover current choices with `tutti agent list --json`. They must not assume a fixed list of providers.

The deprecated CLI `provider` input remains temporarily compatible. It is resolved against the full catalog, including unavailable entries, and succeeds only when exactly one target has that provider. Zero or multiple matches are errors. `agent-id`, `provider`, and `runtime-profile-id` are mutually exclusive.

## Persistence and execution

- Runtime profile ids use `local-agent:<agentTargetId>` and persist `agent_target_id` separately from the derived provider.
- Runs and resumable local sessions persist the exact Agent Target so two targets backed by the same provider remain distinct.
- Legacy provider-only runtime state migrates only when the provider maps uniquely in the full catalog. Ambiguous state is removed instead of guessed.
- Composer options and skills are loaded for the exact target immediately before execution.
- Provider-specific adapters and model-prefix normalization remain implementation details and must not influence target identity or picker order.
