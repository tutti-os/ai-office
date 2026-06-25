import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronDown,
  CheckCircle2,
  File,
  Loader2,
  WandSparkles,
  XCircle,
} from "lucide-react";
import type { BaseRun, BaseRunEvent, BaseRunTimelineItem, LocalAgentProviderStatus, RuntimeProfile } from "@ai-app/shared/types";
import { isAgentRunActive, timelineToMessages, type AgentConversationBlock, type AgentConversationMessage } from "@ai-app/agent/conversation";
import { MarkdownText } from "./markdown.js";
import { defaultConversationToolCopy, ToolGroupBlock, type ConversationToolCopy } from "./toolGroup.js";
import { classes, type ConversationClassNames } from "./styles.js";

export type AgentConversationVariant = "document" | "slide";

export type AgentConversationCopy = {
  homeLabel: string;
  introTitle: string;
  introBody: string;
  placeholder: string;
  quickPrompts: string[];
};

export type AgentConversationUiCopy = {
  activeSelection: string;
  accepted: string;
  cancelled: string;
  completed: string;
  failed: string;
  running: string;
  selectAgent: string;
  stopAgent: string;
  thinking: string;
  tool: ConversationToolCopy;
};

export const defaultAgentConversationUiCopy: AgentConversationUiCopy = {
  activeSelection: "Selected text",
  accepted: "accepted",
  cancelled: "cancelled",
  completed: "completed",
  failed: "failed",
  running: "running",
  selectAgent: "Select ACP agent",
  stopAgent: "Stop agent",
  thinking: "Thinking",
  tool: defaultConversationToolCopy,
};

export type AgentConversationOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type AgentConversationPanelProps<TRun extends BaseRun = BaseRun, TEvent extends BaseRunEvent = BaseRunEvent> = {
  activeSelectionLabel?: string;
  activeSelectionText: string;
  activeSelectionVisible?: boolean;
  agentOptions?: AgentConversationOption[];
  artifactLabel: string;
  dirty: boolean;
  error: string;
  items: Array<BaseRunTimelineItem<TRun, TEvent>>;
  loading: boolean;
  sending: boolean;
  variant: AgentConversationVariant;
  copy: AgentConversationCopy;
  uiCopy?: Partial<Omit<AgentConversationUiCopy, "tool">> & { tool?: Partial<ConversationToolCopy> };
  quickPromptsVisible?: boolean;
  selectedAgentId?: string;
  onBackHome: () => void;
  onAgentChange?: (agentId: string) => void;
  onCancel?: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export type ArtifactAgentConversationPanelProps<TRun extends BaseRun = BaseRun, TEvent extends BaseRunEvent = BaseRunEvent> =
  Omit<AgentConversationPanelProps<TRun, TEvent>, "agentOptions" | "copy" | "onAgentChange" | "selectedAgentId" | "variant"> & {
    copy: AgentConversationCopy;
    formatUnavailableRuntimeProfileLabel?: (profile: RuntimeProfile, provider: LocalAgentProviderStatus | null) => string;
    localAgentProviders?: LocalAgentProviderStatus[];
    runtimeProfiles?: RuntimeProfile[];
    selectedRuntimeProfileId?: string;
    variant?: AgentConversationVariant;
    onRuntimeProfileChange?: (profileId: string) => void;
  };

export function ArtifactAgentConversationPanel<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  props: ArtifactAgentConversationPanelProps<TRun, TEvent>,
) {
  const {
    formatUnavailableRuntimeProfileLabel,
    localAgentProviders = [],
    runtimeProfiles = [],
    selectedRuntimeProfileId,
    variant = "document",
    onRuntimeProfileChange,
    ...panelProps
  } = props;
  const agentOptions = runtimeProfiles.map((profile) => {
    const provider = profile.kind === "local-agent" ? localAgentProviders.find((item) => item.provider === profile.provider) ?? null : null;
    return {
      id: profile.id,
      label: !provider || provider.available
        ? profile.displayName
        : formatUnavailableRuntimeProfileLabel?.(profile, provider) ?? `${profile.displayName} (${provider.authState})`,
      disabled: provider ? !provider.available : false,
    };
  });

  return (
    <AgentConversationPanel<TRun, TEvent>
      {...panelProps}
      agentOptions={agentOptions.length ? agentOptions : undefined}
      selectedAgentId={selectedRuntimeProfileId}
      variant={variant}
      onAgentChange={onRuntimeProfileChange}
    />
  );
}

export function AgentConversationPanel<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  props: AgentConversationPanelProps<TRun, TEvent>,
) {
  const [draft, setDraft] = useState("");
  const [cancellingRunId, setCancellingRunId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => timelineToMessages(props.items), [props.items]);
  const activeRun = useMemo(() => props.items.find((item) => isAgentRunActive(item.run))?.run ?? null, [props.items]);
  const cancellingActiveRun = Boolean(activeRun && cancellingRunId === activeRun.id);
  const cx = classes[props.variant];
  const uiCopy: AgentConversationUiCopy = {
    ...defaultAgentConversationUiCopy,
    ...props.uiCopy,
    tool: { ...defaultConversationToolCopy, ...props.uiCopy?.tool },
  };
  const showQuickPrompts = props.quickPromptsVisible === true && props.copy.quickPrompts.length > 0;
  const showActiveSelection = props.activeSelectionVisible ?? Boolean(props.activeSelectionText.trim());
  const sendButtonBusy = Boolean(props.sending || activeRun);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, props.sending]);

  const submit = async () => {
    const prompt = draft.trim();
    if (!prompt || props.sending) return;
    setDraft("");
    try {
      await props.onSend(prompt);
    } catch {
      setDraft(prompt);
    }
  };

  const cancelActiveRun = async () => {
    if (!activeRun || !props.onCancel || cancellingActiveRun) return;
    setCancellingRunId(activeRun.id);
    try {
      await props.onCancel(activeRun.id);
    } finally {
      setCancellingRunId((current) => (current === activeRun.id ? null : current));
    }
  };

  return (
    <aside className={cx.root}>
      <div className={cx.header}>
        <button className={cx.homeButton} type="button" onClick={props.onBackHome}>
          {props.copy.homeLabel}
        </button>
        <div className={cx.headerStatus}>
          {props.loading ? <Loader2 className={cx.spin} size={13} /> : null}
          {props.artifactLabel}
        </div>
      </div>

      <div ref={scrollRef} className={cx.scroll}>
        <IntroCard copy={props.copy} cx={cx} />

        {props.error ? <div className={cx.error}>{props.error}</div> : null}

        <div className={cx.messages}>
          {messages.map((message) => <ConversationMessage copy={uiCopy} cx={cx} key={message.id} message={message} />)}
        </div>
      </div>

      <div className={cx.composerWrap}>
        {showActiveSelection ? (
          <div className={cx.composerSelection}>
            <div className={cx.activeSelectionLabel}>{props.activeSelectionLabel ?? uiCopy.activeSelection}</div>
            {props.activeSelectionText.trim() ? <div className={cx.composerSelectionText}>{props.activeSelectionText}</div> : null}
          </div>
        ) : null}
        {showQuickPrompts ? (
          <div className={cx.quickPrompts}>
            {props.copy.quickPrompts.map((label) => (
              <button className={cx.quickButton} key={label} type="button" onClick={() => setDraft(label)}>
                <WandSparkles size={13} />
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className={cx.composer}>
          <textarea
            className={cx.textarea}
            value={draft}
            placeholder={props.copy.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
              if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className={cx.composerFooter}>
            {props.agentOptions?.length ? (
              <div className={cx.agentSelectWrap}>
                <select
                  className={cx.agentSelect}
                  value={props.selectedAgentId ?? props.agentOptions[0]?.id ?? ""}
                  aria-label={uiCopy.selectAgent}
                  disabled={props.sending}
                  onChange={(event) => props.onAgentChange?.(event.currentTarget.value)}
                >
                  {props.agentOptions.map((option) => (
                    <option disabled={option.disabled} key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className={cx.agentSelectChevron} size={15} />
              </div>
            ) : (
              <div />
            )}
            <div className={cx.composerActions}>
              <button
                className={[cx.sendButton, sendButtonBusy ? cx.sendButtonBusy : ""].filter(Boolean).join(" ")}
                type="button"
                aria-label={activeRun && props.onCancel ? uiCopy.stopAgent : undefined}
                aria-busy={sendButtonBusy}
                aria-disabled={(!draft.trim() && !sendButtonBusy) || (sendButtonBusy && !activeRun)}
                disabled={!draft.trim() && !sendButtonBusy}
                onClick={() => {
                  if (activeRun && props.onCancel) void cancelActiveRun();
                  else if (!sendButtonBusy) void submit();
                }}
              >
                {sendButtonBusy ? <BusyStopIcon /> : <ArrowUp size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function BusyStopIcon() {
  return (
    <span className="relative grid size-8 place-items-center" aria-hidden="true">
      <svg className="absolute inset-0 size-8" viewBox="0 0 32 32">
        <circle cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeOpacity="0.16" strokeWidth="2.5" />
        <circle className="animate-spin origin-center" cx="16" cy="16" r="14" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2.5" strokeDasharray="22 66" />
      </svg>
      <span className="absolute size-[9px] rounded-[2px] bg-current" />
    </span>
  );
}

function IntroCard(props: { copy: AgentConversationCopy; cx: ConversationClassNames }) {
  return (
    <div className={props.cx.introCard}>
      <div className={props.cx.introMain}>
        <div>
          <div className={props.cx.introTitle}>{props.copy.introTitle}</div>
          <p className={props.cx.introBody}>{props.copy.introBody}</p>
        </div>
      </div>
    </div>
  );
}

function ConversationMessage<TRun extends BaseRun>(props: { copy: AgentConversationUiCopy; cx: ConversationClassNames; message: AgentConversationMessage<TRun> }) {
  if (props.message.role === "user") {
    const userContent = splitUserAttachmentContext(props.message.text);
    return (
      <div className={props.cx.userRow}>
        <div className={props.cx.userMessage}>
          {props.message.selectedText ? <div className={props.cx.userSelection}>{props.message.selectedText}</div> : null}
          {userContent.attachments.length > 0 ? (
            <div className={props.cx.userAttachments}>
              {userContent.attachments.map((attachment) => (
                <UserAttachmentCard attachment={attachment} cx={props.cx} key={`${attachment.path}:${attachment.name}`} />
              ))}
            </div>
          ) : null}
          <div className={props.cx.userText}>{userContent.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={props.cx.assistantRow}>
      <div className={props.cx.assistantMessage}>
        <RunStatusBadge copy={props.copy} cx={props.cx} message={props.message} />
        {props.message.blocks.map((block, index) => (
          <ConversationBlock block={block} copy={props.copy} cx={props.cx} key={`${block.type}:${index}`} />
        ))}
      </div>
    </div>
  );
}

function RunStatusBadge<TRun extends BaseRun>(props: { copy: AgentConversationUiCopy; cx: ConversationClassNames; message: Extract<AgentConversationMessage<TRun>, { role: "assistant" }> }) {
  const status = props.message.run.status;
  const icon =
    status === "completed" ? (
      <CheckCircle2 size={13} />
    ) : status === "failed" || status === "cancelled" ? (
      <XCircle size={13} />
    ) : (
      <Loader2 className={props.cx.spin} size={13} />
    );
  return (
    <div className={props.cx.runStatus}>
      {icon}
      {props.message.run.provider} · {runStatusLabel(status, props.copy)}
    </div>
  );
}

function ConversationBlock(props: { copy: AgentConversationUiCopy; cx: ConversationClassNames; block: AgentConversationBlock }) {
  const block = props.block;
  if (block.type === "tool_group") return <ToolGroupBlock block={block} copy={props.copy.tool} cx={props.cx} />;
  if (block.type === "thinking") return <div className={props.cx.thinkingBlock}>{props.copy.thinking}: {block.text}</div>;
  if (block.type === "error") return <div className={props.cx.errorBlock}>{block.text}</div>;
  if (block.type === "result") return <MarkdownText className={props.cx.resultBlock} text={block.text} />;
  return <div className={props.cx.statusBlock}>{block.text}</div>;
}

function runStatusLabel(status: BaseRun["status"], copy: AgentConversationUiCopy) {
  if (status === "completed") return copy.completed;
  if (status === "failed") return copy.failed;
  if (status === "cancelled") return copy.cancelled;
  if (status === "accepted") return copy.accepted;
  return copy.running;
}

type UserAttachment = {
  name: string;
  savedName: string;
  mimeType: string;
  sizeLabel: string;
  path: string;
};

function UserAttachmentCard(props: { cx: ConversationClassNames; attachment: UserAttachment }) {
  return (
    <div className={props.cx.userAttachmentCard}>
      <div className={props.cx.userAttachmentIcon}>
        <File size={18} />
      </div>
      <div className={props.cx.userAttachmentMeta}>
        <div className={props.cx.userAttachmentName}>{props.attachment.name}</div>
        <div className={props.cx.userAttachmentSize}>{props.attachment.sizeLabel}</div>
      </div>
    </div>
  );
}

function splitUserAttachmentContext(text: string): { text: string; attachments: UserAttachment[] } {
  const marker = "\n\nContext attachments uploaded with this project:\n";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) return { text, attachments: [] };
  const visibleText = text.slice(0, markerIndex).trimEnd();
  const context = text.slice(markerIndex + marker.length);
  const instructionIndex = context.indexOf("\n\nUse these files as source context.");
  const attachmentLines = (instructionIndex >= 0 ? context.slice(0, instructionIndex) : context)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const attachments = attachmentLines.map(parseUserAttachmentLine).filter((attachment): attachment is UserAttachment => Boolean(attachment));
  if (attachments.length === 0) return { text, attachments: [] };
  return { text: visibleText, attachments };
}

function parseUserAttachmentLine(line: string): UserAttachment | null {
  const match = line.match(/^\d+\.\s+(.+?)\s+\(([^,()]+),\s*([^)]+)\):\s*(.+)$/);
  if (!match) return null;
  const rawName = match[1]!.trim();
  const savedAsMatch = rawName.match(/^(.*?)\s+saved as\s+(.+)$/);
  return {
    name: (savedAsMatch?.[1] ?? rawName).trim(),
    savedName: (savedAsMatch?.[2] ?? rawName).trim(),
    mimeType: match[2]!.trim(),
    sizeLabel: match[3]!.trim(),
    path: match[4]!.trim(),
  };
}
