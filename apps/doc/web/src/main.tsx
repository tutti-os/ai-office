import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArtifactAppRoot } from "@ai-app/ui/error-boundary";
import { RuntimeWorkbench } from "./app/RuntimeWorkbench";
import { I18nProvider } from "./i18n";
import "@ai-app/ui/app-reset.css";
import "@tutti-os/ui-rich-text/at-panel/index.css";
import "@tutti-os/ui-system/styles.css";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArtifactAppRoot appName="AI Doc">
      <I18nProvider>
        <RuntimeWorkbench />
      </I18nProvider>
    </ArtifactAppRoot>
  </StrictMode>,
);
