import { StrictMode, useEffect, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ArtifactAppRoot } from "@ai-app/ui/error-boundary";
import { createRichTextMentionService } from "@tutti-os/ui-rich-text/service";
import { AgentMentionProviderRoot } from "./app/AgentMentionProviderRoot";
import { App } from "./App";
import { createTuttiExternalMentionService } from "./app/tuttiMentionService";
import { I18nProvider } from "./i18n";
import "@ai-app/ui/app-reset.css";
import "@tutti-os/ui-rich-text/at-panel/index.css";
import "@tutti-os/ui-system/styles.css";
import "./styles/index.css";

function MentionServiceRoot({ children }: { children: ReactNode }) {
  const [fallbackService] = useState(() => createRichTextMentionService({ providers: [] }));
  const [service, setService] = useState<ReturnType<typeof createTuttiExternalMentionService>>(fallbackService);
  useEffect(() => {
    const next = createTuttiExternalMentionService();
    setService(next);
    fallbackService.dispose();
    return () => next.dispose();
  }, [fallbackService]);
  return <AgentMentionProviderRoot service={service}>{children}</AgentMentionProviderRoot>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ArtifactAppRoot appName="AI Slide">
      <MentionServiceRoot><I18nProvider><App /></I18nProvider></MentionServiceRoot>
    </ArtifactAppRoot>
  </StrictMode>,
);
