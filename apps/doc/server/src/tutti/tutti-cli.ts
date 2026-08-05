import { createTuttiCliClient } from "@ai-app/shared/tutti-cli-client";

export type {
  RunTuttiCliOptions,
  TuttiCliStatus,
} from "@ai-app/shared/tutti-cli-client";

export const {
  configuredTuttiCliPath,
  getTuttiCliStatus,
  openTuttiAppRoute,
  runTuttiCli,
  tuttiCliEnv,
} = createTuttiCliClient("AI_DOC_TUTTI_CLI");
