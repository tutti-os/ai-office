import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArtifactAppRoot } from "@ai-app/ui/error-boundary";
import { App } from "./App";
import { I18nProvider } from "./i18n";
import "@ai-app/ui/app-reset.css";
import "@tutti-os/ui-system/styles.css";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArtifactAppRoot appName="AI Slide">
      <I18nProvider>
        <App />
      </I18nProvider>
    </ArtifactAppRoot>
  </StrictMode>,
);
