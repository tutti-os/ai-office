import type { ReactNode } from "react";
import { RichTextMentionServiceProvider } from "@tutti-os/ui-rich-text/editor";
import { TooltipProvider } from "@tutti-os/ui-system/components";
import type { createTuttiExternalMentionService } from "./tuttiMentionService";

export function AgentMentionProviderRoot(props: {
  children: ReactNode;
  service: ReturnType<typeof createTuttiExternalMentionService>;
}) {
  return (
    <TooltipProvider>
      <RichTextMentionServiceProvider service={props.service}>
        {props.children}
      </RichTextMentionServiceProvider>
    </TooltipProvider>
  );
}
