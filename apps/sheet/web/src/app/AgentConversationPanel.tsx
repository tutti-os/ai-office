import { ArtifactAgentConversationPanel } from "@ai-app/agent/conversation-ui";
import type { ArtifactEditorKind } from "@ai-app/ui/editor-frame";
import type { RuntimeProfile, SheetRun, SheetRunEvent, SheetRunTimelineItem } from "@ai-sheet/shared";

type AgentConversationPanelProps = {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
  artifactLabel: Extract<ArtifactEditorKind, "xlsx">;
  dirty: boolean;
  error: string;
  items: SheetRunTimelineItem[];
  loading: boolean;
  sending: boolean;
  onBackHome: () => void;
  onSend: (prompt: string) => Promise<void>;
};

const sheetRuntimeProfiles: RuntimeProfile[] = [
  {
    id: "codex",
    kind: "local-agent",
    provider: "codex",
    model: "codex",
    displayName: "Codex",
    enabled: true,
    capabilities: {
      streaming: true,
      toolUse: true,
      reasoning: true,
      resume: true,
    },
    createdAt: "",
    updatedAt: "",
  },
];

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  return (
    <ArtifactAgentConversationPanel<SheetRun, SheetRunEvent>
      {...props}
      quickPromptsVisible={false}
      runtimeProfiles={sheetRuntimeProfiles}
      selectedRuntimeProfileId="codex"
      copy={{
        homeLabel: "AI Sheet",
        introTitle: "AI Sheet Agent",
        introBody: "Select cells in the workbook, then ask for edits, formulas, cleanup, or analysis.",
        placeholder: "Ask AI to edit this sheet...",
        quickPrompts: [],
      }}
    />
  );
}
