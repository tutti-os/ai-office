import { createOfficeCliToolchain } from "@ai-app/shared/toolchains/officecli";
import { appPaths } from "../local/paths.js";

const officeCli = createOfficeCliToolchain({
  appRoot: appPaths.root,
  envPrefix: "AI_SLIDE",
  requiredForLabel: "PPTX",
});

export const getOfficeCliStatus = officeCli.getOfficeCliStatus;
export const installOfficeCli = officeCli.installOfficeCli;
export const requireOfficeCli = officeCli.requireOfficeCli;
export const officeCliEnvSync = officeCli.officeCliEnvSync;
