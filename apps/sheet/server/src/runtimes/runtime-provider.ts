import type { AiEditRequest, ProjectDetailResponse, SheetRun } from "@ai-sheet/shared";
import type { RuntimeEditContext as BaseRuntimeEditContext } from "@ai-app/agent/runtime";

export type SheetRuntimeProject = ProjectDetailResponse["project"] & {
  artifact: ProjectDetailResponse["artifact"];
  xlsxManifest: ProjectDetailResponse["xlsxManifest"];
};

export type RuntimeEditContext = BaseRuntimeEditContext<SheetRun, SheetRuntimeProject, AiEditRequest>;
