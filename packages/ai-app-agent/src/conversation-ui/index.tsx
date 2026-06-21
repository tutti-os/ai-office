import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  CheckCircle2,
  CircleDashed,
  Loader2,
  Sparkles,
  Square,
  WandSparkles,
  XCircle,
} from "lucide-react";
import type { BaseRun, BaseRunEvent, BaseRunTimelineItem } from "@ai-app/shared/types";
import { timelineToMessages, type AgentConversationBlock, type AgentConversationMessage } from "@ai-app/agent/conversation";
import { MarkdownText } from "./markdown.js";
import { ToolGroupBlock } from "./toolGroup.js";

export type AgentConversationVariant = "document" | "slide";

export type AgentConversationCopy = {
  homeLabel: string;
  introTitle: string;
  introBody: string;
  placeholder: string;
  quickPrompts: string[];
};

export type AgentConversationOption = {
  id: string;
  label: string;
  disabled?: boolean;
};

export type AgentConversationPanelProps<TRun extends BaseRun = BaseRun, TEvent extends BaseRunEvent = BaseRunEvent> = {
  activeSelectionText: string;
  agentOptions?: AgentConversationOption[];
  artifactLabel: string;
  dirty: boolean;
  error: string;
  items: Array<BaseRunTimelineItem<TRun, TEvent>>;
  loading: boolean;
  sending: boolean;
  variant: AgentConversationVariant;
  copy: AgentConversationCopy;
  quickPromptsVisible?: boolean;
  selectedAgentId?: string;
  onBackHome: () => void;
  onAgentChange?: (agentId: string) => void;
  onCancel?: (runId: string) => Promise<void>;
  onSend: (prompt: string) => Promise<void>;
};

export function AgentConversationPanel<TRun extends BaseRun, TEvent extends BaseRunEvent>(
  props: AgentConversationPanelProps<TRun, TEvent>,
) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => timelineToMessages(props.items), [props.items]);
  const activeRun = useMemo(() => props.items.find((item) => item.run.status === "accepted" || item.run.status === "running")?.run ?? null, [props.items]);
  const cx = classes[props.variant];
  const showQuickPrompts = props.quickPromptsVisible === true && props.copy.quickPrompts.length > 0;

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

  return (
    <aside className={cx.root}>
      <div className={cx.header}>
        <button className={cx.homeButton} type="button" onClick={props.onBackHome}>
          {props.copy.homeLabel}
        </button>
        <div className={cx.headerStatus}>
          {props.loading ? <Loader2 className={cx.spin} size={13} /> : <CircleDashed size={13} />}
          {props.artifactLabel}
        </div>
      </div>

      <div ref={scrollRef} className={cx.scroll}>
        <IntroCard copy={props.copy} cx={cx} />

        {props.error ? <div className={cx.error}>{props.error}</div> : null}

        <div className={cx.messages}>
          {messages.map((message) => <ConversationMessage cx={cx} key={message.id} message={message} />)}
        </div>
      </div>

      <div className={cx.composerWrap}>
        {props.activeSelectionText.trim() ? (
          <div className={cx.composerSelection}>
            <div className={cx.activeSelectionLabel}>Selected text</div>
            <div className={cx.composerSelectionText}>{props.activeSelectionText}</div>
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
              <select
                className={cx.agentSelect}
                value={props.selectedAgentId ?? props.agentOptions[0]?.id ?? ""}
                aria-label="Select ACP agent"
                disabled={props.sending}
                onChange={(event) => props.onAgentChange?.(event.currentTarget.value)}
              >
                {props.agentOptions.map((option) => (
                  <option disabled={option.disabled} key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div />
            )}
            <div className={cx.composerActions}>
              {activeRun && props.onCancel ? (
                <button className={cx.cancelButton} type="button" aria-label="Stop agent" onClick={() => void props.onCancel?.(activeRun.id)}>
                  <Square size={13} />
                </button>
              ) : null}
              <button className={cx.sendButton} type="button" disabled={!draft.trim() || props.sending} onClick={() => void submit()}>
                {props.sending ? <Loader2 className={cx.spin} size={15} /> : <ArrowUp size={15} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function IntroCard(props: { copy: AgentConversationCopy; cx: ConversationClassNames }) {
  return (
    <div className={props.cx.introCard}>
      <div className={props.cx.introMain}>
        <div className={props.cx.introIcon}>
          <Sparkles size={15} />
        </div>
        <div>
          <div className={props.cx.introTitle}>{props.copy.introTitle}</div>
          <p className={props.cx.introBody}>{props.copy.introBody}</p>
        </div>
      </div>
    </div>
  );
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
        {props.message.blocks.map((block, index) => (
          <ConversationBlock block={block} cx={props.cx} key={`${block.type}:${index}`} />
        ))}
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
  if (block.type === "tool_group") return <ToolGroupBlock block={block} cx={props.cx} />;
  if (block.type === "thinking") return <div className={props.cx.thinkingBlock}>Thinking: {block.text}</div>;
  if (block.type === "error") return <div className={props.cx.errorBlock}>{block.text}</div>;
  if (block.type === "result") return <MarkdownText className={props.cx.resultBlock} text={block.text} />;
  return <div className={props.cx.statusBlock}>{block.text}</div>;
}

export type ConversationClassNames = {
  root: string;
  header: string;
  homeButton: string;
  headerStatus: string;
  scroll: string;
  introCard: string;
  introMain: string;
  introIcon: string;
  introTitle: string;
  introBody: string;
  quickPrompts: string;
  quickButton: string;
  error: string;
  activeSelection: string;
  composerSelection: string;
  activeSelectionLabel: string;
  activeSelectionText: string;
  composerSelectionText: string;
  messages: string;
  composerWrap: string;
  composer: string;
  textarea: string;
  composerFooter: string;
  composerActions: string;
  agentSelect: string;
  cancelButton: string;
  sendButton: string;
  userRow: string;
  userMessage: string;
  userSelection: string;
  userText: string;
  assistantRow: string;
  assistantMessage: string;
  runStatus: string;
  toolGroup: (status: "streaming" | "success" | "error") => string;
  toolSummary: string;
  toolSummaryMain: string;
  toolSummaryMeta: string;
  toolCount: string;
  toolPreview: string;
  toolStatus: (status: "streaming" | "success" | "error") => string;
  toolChevron: string;
  toolRows: string;
  toolRow: string;
  toolRowHead: string;
  toolName: string;
  toolRowStatus: (status: "streaming" | "success" | "error") => string;
  toolPayload: string;
  toolPayloadLabel: string;
  toolPayloadText: string;
  thinkingBlock: string;
  errorBlock: string;
  resultBlock: string;
  statusBlock: string;
  spin: string;
};

const classes: Record<AgentConversationVariant, ConversationClassNames> = {
  document: {
    root: "flex h-screen min-h-0 flex-col overflow-hidden border-r border-white/8 bg-[#202020]",
    header: "flex h-12 items-center justify-between border-b border-white/8 px-4",
    homeButton: "text-[12px] font-semibold text-white/62 hover:text-white",
    headerStatus: "flex items-center gap-2 text-[11px] font-semibold text-white/36",
    scroll: "min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5",
    introCard: "rounded-2xl bg-[#2c2c2c] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)]",
    introMain: "flex items-start gap-3",
    introIcon: "grid size-8 shrink-0 place-items-center rounded-full bg-white text-black",
    introTitle: "text-[13px] font-semibold text-white",
    introBody: "mt-1 text-[12px] leading-5 text-white/55",
    quickPrompts: "mb-3 flex flex-wrap gap-2 px-1",
    quickButton: "flex h-8 items-center gap-1.5 rounded-full border border-white/8 bg-[#252525] px-3 text-left text-[12px] text-white/58 hover:bg-[#2d2d2d] hover:text-white",
    error: "mt-4 rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]",
    activeSelection: "mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-3",
    composerSelection: "mb-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3",
    activeSelectionLabel: "mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/28",
    activeSelectionText: "max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58",
    composerSelectionText: "max-h-20 overflow-auto overscroll-contain whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58",
    messages: "mt-5 space-y-4",
    composerWrap: "p-3",
    composer: "rounded-2xl border border-white/12 bg-[#2b2b2b] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.35)]",
    textarea: "h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-white/36",
    composerFooter: "mt-2 flex items-center justify-between border-t border-white/8 pt-2",
    composerActions: "flex items-center gap-2",
    agentSelect: "h-8 min-w-0 max-w-[168px] rounded-full border border-white/10 bg-[#242424] px-3 text-[12px] font-semibold text-white/70 outline-none disabled:opacity-50",
    cancelButton: "grid size-8 place-items-center rounded-full border border-white/10 bg-[#3a241f] text-[#ffad9f] hover:bg-[#4a2a24]",
    sendButton: "grid size-8 place-items-center rounded-full bg-white text-black disabled:bg-white/20 disabled:text-white/40",
    userRow: "flex justify-end",
    userMessage: "max-w-[88%] rounded-2xl rounded-tr-md bg-white px-3 py-2 text-[12px] leading-5 text-[#1f1f1f]",
    userSelection: "mb-2 rounded-xl bg-black/[0.06] px-2 py-1.5 text-[11px] leading-4 text-black/58",
    userText: "whitespace-pre-wrap",
    assistantRow: "flex justify-start",
    assistantMessage: "grid max-w-[92%] gap-2 text-[12px] leading-5 text-white/72",
    runStatus: "flex items-center gap-1.5 text-[11px] font-semibold text-white/38",
    toolGroup: (status) => {
      const tone =
        status === "error"
          ? "border-[#5a2c28] bg-[#33211f] text-[#ffb2a5]"
          : status === "success"
            ? "border-white/8 bg-[#242824] text-white/64"
            : "border-white/8 bg-[#232323] text-white/62";
      return `group rounded-xl border ${tone}`;
    },
    toolSummary: "flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 [&::-webkit-details-marker]:hidden",
    toolSummaryMain: "flex min-w-0 items-center gap-2 text-[11px] font-semibold",
    toolSummaryMeta: "flex min-w-0 items-center gap-2",
    toolCount: "rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/48",
    toolPreview: "max-w-[150px] truncate text-[10px] font-medium text-white/36",
    toolStatus: (status) =>
      status === "error"
        ? "rounded-full bg-[#5a2c28] px-1.5 py-0.5 text-[10px] font-semibold text-[#ffb2a5]"
        : status === "success"
          ? "rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-white/42"
          : "rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-semibold text-white/54",
    toolChevron: "shrink-0 text-white/32 transition-transform group-open:rotate-180",
    toolRows: "border-t border-white/8 px-2.5 py-2",
    toolRow: "border-b border-white/6 py-2 last:border-b-0",
    toolRowHead: "mb-1.5 flex items-center justify-between gap-2",
    toolName: "min-w-0 truncate text-[11px] font-semibold text-white/62",
    toolRowStatus: (status) =>
      status === "error"
        ? "text-[10px] font-semibold text-[#ffad9f]"
        : status === "success"
          ? "text-[10px] font-semibold text-white/36"
          : "text-[10px] font-semibold text-white/48",
    toolPayload: "mt-1 grid gap-1",
    toolPayloadLabel: "text-[10px] font-semibold uppercase text-white/28",
    toolPayloadText: "max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/18 px-2 py-1.5 font-mono text-[10px] leading-4 text-white/46",
    thinkingBlock: "rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] leading-4 text-white/46",
    errorBlock: "rounded-xl bg-[#3a241f] px-2.5 py-2 text-[11px] leading-4 text-[#ffad9f]",
    resultBlock:
      "break-words text-[12px] leading-5 text-white/70 [&_a]:font-semibold [&_a]:text-white/86 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-white/18 [&_blockquote]:pl-2.5 [&_blockquote]:text-white/56 [&_code]:rounded-md [&_code]:bg-black/22 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:text-white/72 [&_h1]:mb-1.5 [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-white/86 [&_h2]:mb-1 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-white/82 [&_h3]:mb-1 [&_h3]:text-[12px] [&_h3]:font-bold [&_h3]:text-white/78 [&_hr]:my-2 [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-1.5 [&_pre]:max-h-[220px] [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-black/22 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-bold [&_strong]:text-white/84 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
    statusBlock: "text-[11px] leading-4 text-white/42",
    spin: "animate-spin",
  },
  slide: {
    root: "flex h-screen min-h-0 min-w-0 flex-col overflow-hidden border-r border-white/8 bg-[#202020]",
    header: "flex h-12 shrink-0 items-center justify-between border-b border-white/8 px-4",
    homeButton: "border-0 bg-transparent p-0 text-[12px] font-bold text-white/62 hover:text-white",
    headerStatus: "flex items-center gap-[7px] text-[11px] font-bold text-white/38",
    scroll: "min-h-0 flex-1 overflow-auto overscroll-contain px-4 py-5",
    introCard: "rounded-2xl bg-[#2c2c2c] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)]",
    introMain: "flex items-start gap-3",
    introIcon: "grid size-8 shrink-0 place-items-center rounded-full bg-white text-black",
    introTitle: "text-[13px] font-extrabold text-white",
    introBody: "mt-1 text-[12px] leading-[1.65] text-white/55",
    quickPrompts: "mb-3 flex flex-wrap gap-2 px-1",
    quickButton: "inline-flex h-8 items-center gap-1.5 rounded-full border border-white/8 bg-[#252525] px-3 text-[12px] text-white/58 hover:bg-[#2d2d2d] hover:text-white",
    error: "mt-4 rounded-xl bg-[#3a241f] px-3 py-2.5 text-[12px] leading-5 text-[#ffad9f]",
    activeSelection: "mt-4 rounded-2xl border border-white/8 bg-white/[0.04] p-3",
    composerSelection: "mb-3 rounded-2xl border border-white/8 bg-white/[0.04] p-3",
    activeSelectionLabel: "mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.08em] text-white/28",
    activeSelectionText: "max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58",
    composerSelectionText: "max-h-20 overflow-auto overscroll-contain whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58",
    messages: "mt-5 grid gap-4",
    composerWrap: "shrink-0 p-3",
    composer: "rounded-2xl border border-white/12 bg-[#2b2b2b] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.35)]",
    textarea: "block h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-white/36",
    composerFooter: "mt-2 flex items-center justify-between border-t border-white/8 pt-2",
    composerActions: "flex items-center gap-2",
    agentSelect: "h-8 min-w-0 max-w-[168px] rounded-full border border-white/10 bg-[#242424] px-3 text-[12px] font-bold text-white/70 outline-none disabled:opacity-50",
    cancelButton: "grid size-8 place-items-center rounded-full border border-white/10 bg-[#3a241f] text-[#ffad9f] hover:bg-[#4a2a24]",
    sendButton: "grid size-8 place-items-center rounded-full border-0 bg-white text-black disabled:cursor-default disabled:bg-white/20 disabled:text-white/40",
    userRow: "flex justify-end",
    userMessage: "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white px-3 py-2 text-[12px] leading-[1.65] text-[#1f1f1f]",
    userSelection: "mb-2 rounded-xl bg-black/[0.06] px-2 py-1.5 text-[11px] leading-4 text-black/58",
    userText: "",
    assistantRow: "flex justify-start",
    assistantMessage: "grid max-w-[92%] gap-2 text-[12px] leading-[1.65] text-white/72",
    runStatus: "flex items-center gap-[7px] text-[11px] font-bold text-white/38",
    toolGroup: (status) => {
      const tone =
        status === "error"
          ? "border-[#5a2c28] bg-[#33211f] text-[#ffb2a5]"
          : status === "success"
            ? "border-white/8 bg-[#242824] text-white/64"
            : "border-white/8 bg-[#232323] text-white/62";
      return `group rounded-xl border ${tone}`;
    },
    toolSummary: "flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 [&::-webkit-details-marker]:hidden",
    toolSummaryMain: "flex min-w-0 items-center gap-2 text-[11px] font-extrabold",
    toolSummaryMeta: "flex min-w-0 items-center gap-2",
    toolCount: "rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] text-white/48",
    toolPreview: "max-w-[150px] truncate text-[10px] font-bold text-white/36",
    toolStatus: (status) =>
      status === "error"
        ? "rounded-full bg-[#5a2c28] px-1.5 py-0.5 text-[10px] font-extrabold text-[#ffb2a5]"
        : status === "success"
          ? "rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-extrabold text-white/42"
          : "rounded-full bg-white/8 px-1.5 py-0.5 text-[10px] font-extrabold text-white/54",
    toolChevron: "shrink-0 text-white/32 transition-transform group-open:rotate-180",
    toolRows: "border-t border-white/8 px-2.5 py-2",
    toolRow: "border-b border-white/6 py-2 last:border-b-0",
    toolRowHead: "mb-1.5 flex items-center justify-between gap-2",
    toolName: "min-w-0 truncate text-[11px] font-extrabold text-white/62",
    toolRowStatus: (status) =>
      status === "error"
        ? "text-[10px] font-extrabold text-[#ffad9f]"
        : status === "success"
          ? "text-[10px] font-extrabold text-white/36"
          : "text-[10px] font-extrabold text-white/48",
    toolPayload: "mt-1 grid gap-1",
    toolPayloadLabel: "text-[10px] font-extrabold uppercase text-white/28",
    toolPayloadText: "max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/18 px-2 py-1.5 font-mono text-[10px] leading-4 text-white/46",
    thinkingBlock: "rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] leading-4 text-white/48",
    errorBlock: "rounded-xl bg-[#3a241f] px-3 py-2.5 text-[12px] leading-5 text-[#ffad9f]",
    resultBlock:
      "break-words text-[12px] leading-[1.65] text-white/70 [&_a]:font-bold [&_a]:text-white/86 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-white/18 [&_blockquote]:pl-2.5 [&_blockquote]:text-white/56 [&_code]:rounded-md [&_code]:bg-black/22 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:text-white/72 [&_h1]:mb-1.5 [&_h1]:text-[14px] [&_h1]:font-extrabold [&_h1]:text-white/86 [&_h2]:mb-1 [&_h2]:text-[13px] [&_h2]:font-extrabold [&_h2]:text-white/82 [&_h3]:mb-1 [&_h3]:text-[12px] [&_h3]:font-extrabold [&_h3]:text-white/78 [&_hr]:my-2 [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-1.5 [&_pre]:max-h-[220px] [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-black/22 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-extrabold [&_strong]:text-white/84 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5",
    statusBlock: "mt-1 whitespace-pre-wrap break-words text-[11px] leading-4 text-white/48",
    spin: "animate-spin",
  },
};
