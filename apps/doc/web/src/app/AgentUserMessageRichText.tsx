import { RichTextReadonlyContent, type RichTextReadonlyWorkspaceReference } from "@tutti-os/ui-rich-text/editor";
import type { AgentUserMessageTextRenderProps } from "@ai-app/agent/conversation-ui";

type TuttiFilesBridge = {
  files?: {
    open?: (input: { mode?: "auto" | "preview" | "reveal"; name?: string; path: string }) => Promise<void>;
  };
};

export function AgentUserMessageRichText(props: AgentUserMessageTextRenderProps) {
  return (
    <RichTextReadonlyContent
      className={`${props.className} ai-doc-agent-user-rich-text`}
      paragraphClassName="ai-doc-agent-user-rich-text-paragraph"
      value={props.text}
      onOpenWorkspaceReference={(reference) => void openWorkspaceReference(reference)}
    />
  );
}

async function openWorkspaceReference(reference: RichTextReadonlyWorkspaceReference) {
  const open = (window as unknown as { tuttiExternal?: TuttiFilesBridge }).tuttiExternal?.files?.open;
  if (!open) return;

  try {
    await open({
      path: reference.path,
      name: reference.label,
      mode: "reveal",
    });
  } catch {
    // Host open failures should not break the conversation view.
  }
}
