import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, CheckCircle2, CircleDashed, Loader2, MessageSquareText, Sparkles, TerminalSquare, WandSparkles, XCircle } from "lucide-react";
import type { DocumentRunTimelineItem } from "@ai-document/shared";
import { timelineToMessages, type AgentConversationBlock, type AgentConversationMessage } from "./agentConversation";

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

const quickPrompts = ["Rewrite selection", "Continue writing", "Polish tone", "Format section"];

export function AgentConversationPanel(props: AgentConversationPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messages = useMemo(() => timelineToMessages(props.items), [props.items]);

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
    <aside className="hidden min-h-0 flex-col border-r border-white/8 bg-[#202020] xl:flex">
      <div className="flex h-12 items-center justify-between border-b border-white/8 px-4">
        <button className="text-[12px] font-semibold text-white/62 hover:text-white" type="button" onClick={props.onBackHome}>
          AI Docs
        </button>
        <div className="flex items-center gap-2 text-[11px] font-semibold text-white/36">
          {props.loading ? <Loader2 className="animate-spin" size={13} /> : <CircleDashed size={13} />}
          Conversation
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto px-4 py-5">
        <IntroCard />
        <SelectionCard text={props.activeSelectionText} />

        <div className="mt-4 flex flex-wrap gap-2">
          {quickPrompts.map((label) => (
            <button
              className="flex h-8 items-center gap-1.5 rounded-full border border-white/8 bg-[#252525] px-3 text-left text-[12px] text-white/58 hover:bg-[#2d2d2d] hover:text-white"
              key={label}
              type="button"
              onClick={() => setDraft(label)}
            >
              <WandSparkles size={13} />
              {label}
            </button>
          ))}
        </div>

        {props.error ? <div className="mt-4 rounded-xl bg-[#3a241f] p-3 text-[12px] leading-5 text-[#ffad9f]">{props.error}</div> : null}

        <div className="mt-5 space-y-4">
          {messages.length ? messages.map((message) => <ConversationMessage key={message.id} message={message} />) : <EmptyState />}
        </div>
      </div>

      <div className="p-3">
        <div className="rounded-2xl border border-white/12 bg-[#2b2b2b] p-3 shadow-[0_14px_40px_rgba(0,0,0,0.35)]">
          <textarea
            className="h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-white/36"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void submit();
              }
            }}
            placeholder="Ask AI to edit this document..."
          />
          <div className="mt-2 flex items-center justify-between border-t border-white/8 pt-2">
            <div className="flex items-center gap-2 text-[11px] font-semibold text-white/38">
              <span>{props.dirty ? "Unsaved changes" : "Saved"}</span>
            </div>
            <button
              className="grid size-8 place-items-center rounded-full bg-white text-black disabled:bg-white/20 disabled:text-white/40"
              type="button"
              disabled={!draft.trim() || props.sending}
              onClick={() => void submit()}
            >
              {props.sending ? <Loader2 className="animate-spin" size={15} /> : <ArrowUp size={15} />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

function IntroCard() {
  return (
    <div className="rounded-2xl bg-[#2c2c2c] p-4 shadow-[0_12px_36px_rgba(0,0,0,0.24)]">
      <div className="flex items-start gap-3">
        <div className="grid size-8 shrink-0 place-items-center rounded-full bg-white text-black">
          <Sparkles size={15} />
        </div>
        <div>
          <div className="text-[13px] font-semibold text-white">AI Docs Agent</div>
          <p className="mt-1 text-[12px] leading-5 text-white/55">
            Select text in the document and tell me how to revise it, or ask for a new section.
          </p>
        </div>
      </div>
    </div>
  );
}

function SelectionCard(props: { text: string }) {
  if (!props.text) {
    return (
      <div className="mt-4 rounded-[18px] bg-[#2b2b2b] px-3 py-2 text-[12px] leading-5 text-white/62">
        Choose a passage in the document to edit it with AI.
      </div>
    );
  }
  return (
    <div className="mt-4 rounded-xl border border-[#3d5e66] bg-[#26373b] p-3 text-[12px] leading-5 text-white/72">
      <div className="mb-1 flex items-center gap-2 font-semibold text-white">
        <MessageSquareText size={14} />
        Selected text
      </div>
      <p className="line-clamp-5">{props.text}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/8 bg-[#252525] px-4 py-5 text-[12px] leading-5 text-white/48">
      The conversation for this document will appear here.
    </div>
  );
}

function ConversationMessage(props: { message: AgentConversationMessage }) {
  if (props.message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] rounded-2xl rounded-tr-md bg-white px-3 py-2 text-[12px] leading-5 text-[#1f1f1f]">
          {props.message.selectedText ? (
            <div className="mb-2 rounded-xl bg-black/[0.06] px-2 py-1.5 text-[11px] leading-4 text-black/58">
              {props.message.selectedText}
            </div>
          ) : null}
          <div className="whitespace-pre-wrap">{props.message.text}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[92%] rounded-2xl rounded-tl-md border border-white/8 bg-[#292929] px-3 py-2 text-[12px] leading-5 text-white/72">
        <RunStatusBadge message={props.message} />
        <div className="mt-2 space-y-2">
          {props.message.blocks.map((block, index) => (
            <ConversationBlock block={block} key={`${block.type}:${index}`} />
          ))}
        </div>
      </div>
    </div>
  );
}

function RunStatusBadge(props: { message: Extract<AgentConversationMessage, { role: "assistant" }> }) {
  const status = props.message.run.status;
  const icon =
    status === "completed" ? (
      <CheckCircle2 size={13} />
    ) : status === "failed" || status === "cancelled" ? (
      <XCircle size={13} />
    ) : (
      <Loader2 className="animate-spin" size={13} />
    );
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-white/38">
      {icon}
      {props.message.run.provider} · {status}
    </div>
  );
}

function ConversationBlock(props: { block: AgentConversationBlock }) {
  const block = props.block;
  if (block.type === "tool") {
    const tone =
      block.status === "error"
        ? "border-[#5a2c28] bg-[#33211f] text-[#ffb2a5]"
        : block.status === "success"
          ? "border-[#2f4e3c] bg-[#213027] text-[#a9dfbf]"
          : "border-white/8 bg-[#222] text-white/60";
    return (
      <div className={`rounded-xl border px-2.5 py-2 ${tone}`}>
        <div className="flex items-center gap-2 text-[11px] font-semibold">
          <TerminalSquare size={13} />
          {block.title}
        </div>
        {block.detail ? <div className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-4 opacity-80">{block.detail}</div> : null}
      </div>
    );
  }
  if (block.type === "thinking") {
    return <div className="rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] leading-4 text-white/46">Thinking: {block.text}</div>;
  }
  if (block.type === "error") {
    return <div className="rounded-xl bg-[#3a241f] px-2.5 py-2 text-[11px] leading-4 text-[#ffad9f]">{block.text}</div>;
  }
  if (block.type === "result") {
    return <div className="whitespace-pre-wrap break-words text-[12px] leading-5 text-white/70">{block.text}</div>;
  }
  return <div className="text-[11px] leading-4 text-white/42">{block.text}</div>;
}
