import { AgentConversationPanel as SharedAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { DocumentRun, DocumentRunEvent, DocumentRunTimelineItem } from "@ai-doc/shared";

type AgentConversationPanelProps = {
  activeSelectionText: string;
  dirty: boolean;
  error: string;
  items: DocumentRunTimelineItem[];
  loading: boolean;
  sending: boolean;
  onBackHome: () => void;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <SharedAgentConversationPanel<DocumentRun, DocumentRunEvent>
      {...props}
      variant="document"
      copy={{
        homeLabel: "AI Docs",
        introTitle: "AI Docs Agent",
        introBody: "Select text in the document and tell me how to revise it, or ask for a new section.",
        emptySelection: "Choose a passage in the document to edit it with AI.",
        selectedTitle: "Selected text",
        emptyConversation: "The conversation for this document will appear here.",
        placeholder: "Ask AI to edit this document...",
        quickPrompts: ["Rewrite selection", "Continue writing", "Polish tone", "Format section"],
      }}
    />
  );
}
