import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RuntimeWorkbench } from "./app/RuntimeWorkbench";
import { I18nProvider } from "./i18n";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <I18nProvider>
      <RuntimeWorkbench />
    </I18nProvider>
  </StrictMode>,
);
