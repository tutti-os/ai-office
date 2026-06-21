import type { AgentArtifactContext, AiEditRequest, ArtifactSelection, ArtifactType } from "@ai-doc/shared";
import type { AgentEditRequestInputBase, ArtifactRuntimeAdapterBase } from "@ai-app/shared/artifact-runtime";

export type ArtifactSource = "imported-html" | "blank" | "fixture";

export type ArtifactRuntimeParseInput = {
  content: string;
  projectId?: string | null;
  title: string;
  source?: ArtifactSource;
};

export type AgentEditRequestInput<TRuntime> = AgentEditRequestInputBase<TRuntime>;

export interface ArtifactRuntimeAdapter<TRuntime>
  extends ArtifactRuntimeAdapterBase<
    ArtifactType,
    TRuntime,
    ArtifactSelection,
    AgentArtifactContext,
    AiEditRequest,
    ArtifactRuntimeParseInput,
    AgentEditRequestInput<TRuntime>
  > {
  parse(input: ArtifactRuntimeParseInput): TRuntime;
  serialize(runtime: TRuntime): string;
}
