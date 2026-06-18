import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { DocumentRun, DocumentRunEvent, DocumentRunTimelineItem } from "@ai-doc/shared";

type AgentConversationPanelProps = {
  activeSelectionText: string;
  artifactLabel: Extract<ArtifactEditorKind, "html" | "markdown" | "docx">;
  dirty: boolean;
  error: string;
  items: DocumentRunTimelineItem[];
  loading: boolean;
  sending: boolean;
  onBackHome: () => void;
  onCancel: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <SharedAgentConversationPanel<DocumentRun, DocumentRunEvent>
      {...props}
      variant="document"
      copy={{
        homeLabel: "AI Doc",
        introTitle: "AI Docs Agent",
        introBody: "Select text in the document, then ask for a rewrite, continuation, polish, or structural edit.",
        placeholder: "Ask AI to edit this document...",
        quickPrompts: ["Rewrite selection", "Continue writing", "Polish tone", "Format section"],
      }}
    />
  );
}
