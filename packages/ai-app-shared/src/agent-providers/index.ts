export function normalizeLocalAgentProviderId(provider: string | null | undefined) {
  const normalized = provider?.trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!normalized) return "";
  if (normalized === "claude" || normalized === "claude-code") return "claude-code";
  return normalized;
}

export function localAgentProviderIdsMatch(left: string | null | undefined, right: string | null | undefined) {
  const normalizedLeft = normalizeLocalAgentProviderId(left);
  const normalizedRight = normalizeLocalAgentProviderId(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}
