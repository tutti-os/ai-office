/** Canonical TSH ADR 0017 routing preload (VM bundle layout). */
export const TSH_ROUTING_LD_PRELOAD = "/opt/tsh/bundle/lib/tsh_exec_trace.so";

/** Bash non-interactive builtin/command-not-found routing fallback. */
export const TSH_CMD_ROUTING_BASH_ENV = "/opt/tsh/bundle/etc/cmd-routing.sh";

/**
 * Env stamp so workspace-app local agents inherit command routing into the
 * sandbox (same contract room agents get from desktopd).
 *
 * No-op outside TSH workspace apps so Tutti Desktop is unchanged.
 * Keeps the host check local to avoid a circular import with `./index`.
 */
export function tshAgentRoutingEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  if (env.TSH_WORKSPACE_APP?.trim() !== "1") return {};
  const preload = env.LD_PRELOAD?.trim() || env.TSH_ROUTING_LD_PRELOAD?.trim() || TSH_ROUTING_LD_PRELOAD;
  return {
    TSH_AGENT_ROUTING: "1",
    LD_PRELOAD: preload,
    BASH_ENV: env.BASH_ENV?.trim() || TSH_CMD_ROUTING_BASH_ENV,
  };
}
