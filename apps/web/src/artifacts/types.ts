import type { AgentArtifactContext, AiEditRequest, ArtifactSelection, ArtifactType } from "@ai-document/shared";

export type ArtifactSource = "imported-html" | "blank" | "fixture";

export type ArtifactRuntimeParseInput = {
  content: string;
  title: string;
  source?: ArtifactSource;
};

export type AgentEditRequestInput<TRuntime> = {
  projectId: string;
  runtime: TRuntime;
  userPrompt: string;
  runtimeProfileId?: string | null;
};

export interface ArtifactRuntimeAdapter<TRuntime> {
  type: ArtifactType;
  parse(input: ArtifactRuntimeParseInput): TRuntime;
  serialize(runtime: TRuntime): string;
  getSelection(runtime: TRuntime): ArtifactSelection | null;
  getAgentContext(projectId: string, runtime: TRuntime): AgentArtifactContext;
  createAiEditRequest(input: AgentEditRequestInput<TRuntime>): AiEditRequest;
}
