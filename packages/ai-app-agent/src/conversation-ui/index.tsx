import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  Loader2,
  MessageSquareText,
  Sparkles,
  TerminalSquare,
  WandSparkles,
  XCircle,
} from "lucide-react";
import type { BaseRun, BaseRunEvent, BaseRunTimelineItem } from "@ai-app/shared/types";
import { timelineToMessages, type AgentConversationBlock, type AgentConversationMessage } from "@ai-app/agent/conversation";

export type AgentConversationVariant = "document" | "slide";

export type AgentConversationCopy = {
  homeLabel: string;
  introTitle: string;
  introBody: string;
  emptySelection: string;
  selectedTitle: string;
  emptyConversation: string;
  placeholder: string;
  quickPrompts: string[];
};

export type AgentConversationPanelProps<TRun extends BaseRun = BaseRun, TEvent extends BaseRunEvent = BaseRunEvent> = {
  activeSelectionText: string;
  dirty: boolean;
  error: string;
  items: Array<BaseRunTimelineItem<TRun, TEvent>>;
  loading: boolean;
  sending: boolean;
  variant: AgentConversationVariant;
  copy: AgentConversationCopy;
  onBackHome: () => void;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  props: AgentConversationPanelProps<TRun, TEvent>,
) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => timelineToMessages(props.items), [props.items]);
  const cx = classes[props.variant];

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTop = element.scrollHeight;
  }, [messages.length, props.sending]);

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

  return (
    <aside className={cx.root}>
      <div className={cx.header}>
        <button className={cx.homeButton} type="button" onClick={props.onBackHome}>
          {props.copy.homeLabel}
        </button>
        <div className={cx.headerStatus}>
          {props.loading ? <Loader2 className={cx.spin} size={13} /> : <CircleDashed size={13} />}
          Conversation
        </div>
      </div>

      <div ref={scrollRef} className={cx.scroll}>
        <IntroCard copy={props.copy} cx={cx} />
        <SelectionCard copy={props.copy} cx={cx} text={props.activeSelectionText} />

        <div className={cx.quickPrompts}>
          {props.copy.quickPrompts.map((label) => (
            <button className={cx.quickButton} key={label} type="button" onClick={() => setDraft(label)}>
              <WandSparkles size={13} />
              {label}
            </button>
          ))}
        </div>

        {props.error ? <div className={cx.error}>{props.error}</div> : null}

        <div className={cx.messages}>
          {messages.length ? messages.map((message) => <ConversationMessage cx={cx} key={message.id} message={message} />) : <EmptyState copy={props.copy} cx={cx} />}
        </div>
      </div>

      <div className={cx.composerWrap}>
        <div className={cx.composer}>
          <textarea
            className={cx.textarea}
            value={draft}
            placeholder={props.copy.placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
          />
          <div className={cx.composerFooter}>
            <div className={cx.saveState}>{props.dirty ? "Unsaved changes" : "Saved"}</div>
            <button className={cx.sendButton} type="button" disabled={!draft.trim() || props.sending} onClick={() => void submit()}>
              {props.sending ? <Loader2 className={cx.spin} size={15} /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function IntroCard(props: { copy: AgentConversationCopy; cx: ConversationClassNames }) {
  return (
    <div className={props.cx.introCard}>
      <div className={props.cx.introIcon}>
        <Sparkles size={15} />
      </div>
      <div>
        <div className={props.cx.introTitle}>{props.copy.introTitle}</div>
        <p className={props.cx.introBody}>{props.copy.introBody}</p>
      </div>
    </div>
  );
}

function SelectionCard(props: { copy: AgentConversationCopy; cx: ConversationClassNames; text: string }) {
  if (!props.text) {
    return <div className={props.cx.selectionEmpty}>{props.copy.emptySelection}</div>;
  }
  return (
    <div className={props.cx.selectionCard}>
      <div className={props.cx.selectionTitle}>
        <MessageSquareText size={14} />
        {props.copy.selectedTitle}
      </div>
      <p className={props.cx.selectionText}>{props.text}</p>
    </div>
  );
}

function EmptyState(props: { copy: AgentConversationCopy; cx: ConversationClassNames }) {
  return <div className={props.cx.empty}>{props.copy.emptyConversation}</div>;
}

function ConversationMessage<TRun extends BaseRun>(props: { cx: ConversationClassNames; message: AgentConversationMessage<TRun> }) {
  if (props.message.role === "user") {
    return (
      <div className={props.cx.userRow}>
        <div className={props.cx.userMessage}>
          {props.message.selectedText ? <div className={props.cx.userSelection}>{props.message.selectedText}</div> : null}
          <div className={props.cx.userText}>{props.message.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className={props.cx.assistantRow}>
      <div className={props.cx.assistantMessage}>
        <RunStatusBadge cx={props.cx} message={props.message} />
        <div className={props.cx.blocks}>
          {props.message.blocks.map((block, index) => (
            <ConversationBlock block={block} cx={props.cx} key={`${block.type}:${index}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RunStatusBadge<TRun extends BaseRun>(props: { cx: ConversationClassNames; message: Extract<AgentConversationMessage<TRun>, { role: "assistant" }> }) {
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
      {props.message.run.provider} · {status}
    </div>
  );
}

function ConversationBlock(props: { cx: ConversationClassNames; block: AgentConversationBlock }) {
  const block = props.block;
  if (block.type === "tool") {
    return (
      <div className={props.cx.toolBlock(block.status)}>
        <div className={props.cx.toolTitle}>
          <TerminalSquare size={13} />
          {block.title}
        </div>
        {block.detail ? <div className={props.cx.toolDetail}>{block.detail}</div> : null}
      </div>
    );
  }
  if (block.type === "thinking") return <div className={props.cx.thinkingBlock}>Thinking: {block.text}</div>;
  if (block.type === "error") return <div className={props.cx.errorBlock}>{block.text}</div>;
  if (block.type === "result") return <div className={props.cx.resultBlock}>{block.text}</div>;
  return <div className={props.cx.statusBlock}>{block.text}</div>;
}

type ConversationClassNames = {
  root: string;
  header: string;
  homeButton: string;
  headerStatus: string;
  scroll: string;
  introCard: string;
  introIcon: string;
  introTitle: string;
  introBody: string;
  selectionEmpty: string;
  selectionCard: string;
  selectionTitle: string;
  selectionText: string;
  quickPrompts: string;
  quickButton: string;
  error: string;
  messages: string;
  empty: string;
  composerWrap: string;
  composer: string;
  textarea: string;
  composerFooter: string;
  saveState: string;
  sendButton: string;
  userRow: string;
  userMessage: string;
  userSelection: string;
  userText: string;
  assistantRow: string;
  assistantMessage: string;
  runStatus: string;
  blocks: string;
  toolBlock: (status: "streaming" | "success" | "error") => string;
  toolTitle: string;
  toolDetail: string;
  thinkingBlock: string;
  errorBlock: string;
  resultBlock: string;
  statusBlock: string;
  spin: string;
};

const classes: Record<AgentConversationVariant, ConversationClassNames> = {
  document: {
    root: "hidden min-h-0 flex-col border-r border-white/8 bg-[#202020] xl:flex",
    header: "flex h-12 items-center justify-between border-b border-white/8 px-4",
    homeButton: "text-[12px] font-semibold text-white/62 hover:text-white",
    headerStatus: "flex items-center gap-2 text-[11px] font-semibold text-white/36",
    scroll: "min-h-0 flex-1 overflow-auto px-4 py-5",
    introCard: "rounded-2xl bg-[#2c2c2c] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)] flex items-start gap-3",
    introIcon: "grid size-8 shrink-0 place-items-center rounded-full bg-white text-black",
    introTitle: "text-[13px] font-semibold text-white",
    introBody: "mt-1 text-[12px] leading-5 text-white/55",
    selectionEmpty: "mt-4 rounded-[18px] bg-[#2b2b2b] px-3 py-2 text-[12px] leading-5 text-white/62",
    selectionCard: "mt-4 rounded-xl border border-[#3d5e66] bg-[#26373b] p-3 text-[12px] leading-5 text-white/72",
    selectionTitle: "mb-1 flex items-center gap-2 font-semibold text-white",
    selectionText: "line-clamp-5",
    quickPrompts: "mt-4 flex flex-wrap gap-2",
    quickButton: "flex h-8 items-center gap-1.5 rounded-full border border-white/8 bg-[#252525] px-3 text-left text-[12px] text-white/58 hover:bg-[#2d2d2d] hover:text-white",
    error: "mt-4 rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]",
    messages: "mt-5 space-y-4",
    empty: "rounded-2xl border border-white/8 bg-[#252525] px-4 py-5 text-[12px] leading-5 text-white/48",
    composerWrap: "p-3",
    composer: "rounded-2xl border border-white/12 bg-[#2b2b2b] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.35)]",
    textarea: "h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-white/36",
    composerFooter: "mt-2 flex items-center justify-between border-t border-white/8 pt-2",
    saveState: "flex items-center gap-2 text-[11px] font-semibold text-white/38",
    sendButton: "grid size-8 place-items-center rounded-full bg-white text-black disabled:bg-white/20 disabled:text-white/40",
    userRow: "flex justify-end",
    userMessage: "max-w-[88%] rounded-2xl rounded-tr-md bg-white px-3 py-2 text-[12px] leading-5 text-[#1f1f1f]",
    userSelection: "mb-2 rounded-xl bg-black/[0.06] px-2 py-1.5 text-[11px] leading-4 text-black/58",
    userText: "whitespace-pre-wrap",
    assistantRow: "flex justify-start",
    assistantMessage: "max-w-[92%] rounded-2xl rounded-tl-md border border-white/8 bg-[#292929] px-3 py-2 text-[12px] leading-5 text-white/72",
    runStatus: "flex items-center gap-1.5 text-[11px] font-semibold text-white/38",
    blocks: "mt-2 space-y-2",
    toolBlock: (status) => {
      const tone =
        status === "error"
          ? "border-[#5a2c28] bg-[#33211f] text-[#ffb2a5]"
          : status === "success"
            ? "border-[#2f4e3c] bg-[#213027] text-[#a9dfbf]"
            : "border-white/8 bg-[#222] text-white/60";
      return `rounded-xl border px-2.5 py-2 ${tone}`;
    },
    toolTitle: "flex items-center gap-2 text-[11px] font-semibold",
    toolDetail: "mt-1 whitespace-pre-wrap break-words text-[11px] leading-4 opacity-80",
    thinkingBlock: "rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] leading-4 text-white/46",
    errorBlock: "rounded-xl bg-[#3a241f] px-2.5 py-2 text-[11px] leading-4 text-[#ffad9f]",
    resultBlock: "whitespace-pre-wrap break-words text-[12px] leading-5 text-white/70",
    statusBlock: "text-[11px] leading-4 text-white/42",
    spin: "animate-spin",
  },
  slide: {
    root: "agent-panel",
    header: "agent-header",
    homeButton: "agent-home-button",
    headerStatus: "agent-header-status",
    scroll: "agent-scroll",
    introCard: "agent-intro-card",
    introIcon: "agent-intro-icon",
    introTitle: "agent-intro-title",
    introBody: "",
    selectionEmpty: "agent-selection-empty",
    selectionCard: "agent-selection-card",
    selectionTitle: "agent-selection-title",
    selectionText: "",
    quickPrompts: "agent-quick-prompts",
    quickButton: "agent-quick-button",
    error: "agent-error",
    messages: "agent-messages",
    empty: "agent-empty",
    composerWrap: "agent-composer-wrap",
    composer: "agent-composer",
    textarea: "",
    composerFooter: "agent-composer-footer",
    saveState: "agent-save-state",
    sendButton: "agent-send-button",
    userRow: "agent-message-row user",
    userMessage: "agent-user-message",
    userSelection: "agent-user-selection",
    userText: "",
    assistantRow: "agent-message-row assistant",
    assistantMessage: "agent-assistant-message",
    runStatus: "agent-run-status",
    blocks: "agent-blocks",
    toolBlock: (status) => `agent-tool-block ${status}`,
    toolTitle: "agent-tool-title",
    toolDetail: "agent-tool-detail",
    thinkingBlock: "agent-thinking-block",
    errorBlock: "agent-error-block",
    resultBlock: "agent-result-block",
    statusBlock: "agent-status-block",
    spin: "spin",
  },
};
