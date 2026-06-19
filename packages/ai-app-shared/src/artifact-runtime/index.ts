export type ArtifactSelectionBase<TSelectionType extends string = string> = {
  type: "none" | TSelectionType | "range";
  text: string;
  html: string;
  path: string;
  range?: unknown;
};

export type AgentArtifactContextBase<
  TArtifactType extends string = string,
  TSelection extends ArtifactSelectionBase = ArtifactSelectionBase,
> = {
  projectId: string;
  artifactId: string;
  type: TArtifactType;
  selection: TSelection | null;
  revision: number;
};

export type ArtifactRuntimeParseInputBase<TSource extends string = string> = {
  title: string;
  source?: TSource;
};

export type AgentEditRequestInputBase<TRuntime> = {
  projectId: string;
  runtime: TRuntime;
  userPrompt: string;
  runtimeProfileId?: string | null;
};

export type ArtifactRuntimeCapabilities = {
  parse?: boolean;
  serialize?: boolean;
  inlineEditing?: boolean;
  officePreview?: boolean;
};

export type ArtifactInteractionMode = "editable" | "read-only";

export type ArtifactReadOnlyReason = "agent-running" | "loading" | "unsupported" | "system";

export type ArtifactInteractionPolicy = {
  mode: ArtifactInteractionMode;
  readOnlyReason?: ArtifactReadOnlyReason;
};

export const editableArtifactInteraction: ArtifactInteractionPolicy = { mode: "editable" };

export function isArtifactReadOnly(policy: ArtifactInteractionPolicy) {
  return policy.mode === "read-only";
}

export function isArtifactAgentRunning(policy: ArtifactInteractionPolicy) {
  return policy.mode === "read-only" && policy.readOnlyReason === "agent-running";
}

export interface ArtifactRuntimeAdapterBase<
  TArtifactType extends string,
  TRuntime,
  TSelection extends ArtifactSelectionBase,
  TContext extends AgentArtifactContextBase<TArtifactType, TSelection>,
  TAiEditRequest,
  TParseInput = ArtifactRuntimeParseInputBase,
  TAgentEditInput extends AgentEditRequestInputBase<TRuntime> = AgentEditRequestInputBase<TRuntime>,
> {
  type: TArtifactType;
  capabilities?: ArtifactRuntimeCapabilities;
  parse?(input: TParseInput): TRuntime;
  serialize?(runtime: TRuntime): string;
  getSelection(runtime: TRuntime): TSelection | null;
  getAgentContext(projectId: string, runtime: TRuntime): TContext;
  createAiEditRequest(input: TAgentEditInput): TAiEditRequest;
}
