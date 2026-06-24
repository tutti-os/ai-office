import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ArtifactAppRoot } from "@ai-app/ui/error-boundary";
import { App } from "./App";
import "@ai-app/ui/app-reset.css";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArtifactAppRoot appName="AI Sheet">
      <App />
    </ArtifactAppRoot>
  </StrictMode>,
);
