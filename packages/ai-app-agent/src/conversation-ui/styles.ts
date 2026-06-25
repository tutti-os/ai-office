import type { AgentConversationVariant } from "./index.js";

export type ConversationClassNames = {
  root: string;
  header: string;
  homeButton: string;
  headerStatus: string;
  scroll: string;
  introCard: string;
  introMain: string;
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
  agentSelectWrap: string;
  agentSelect: string;
  agentSelectChevron: string;
  cancelButton: string;
  sendButton: string;
  sendButtonBusy: string;
  userRow: string;
  userMessage: string;
  userSelection: string;
  userText: string;
  userAttachments: string;
  userAttachmentCard: string;
  userAttachmentIcon: string;
  userAttachmentMeta: string;
  userAttachmentName: string;
  userAttachmentSize: string;
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

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const documentScrollbarClass =
  "[scrollbar-color:rgba(92,107,80,0.54)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:size-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-[#5C6B50]/45 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-[#5C6B50]/62";

const documentNestedScrollbarClass =
  "[&_pre]:[scrollbar-color:rgba(92,107,80,0.54)_transparent] [&_pre]:[scrollbar-width:thin] [&_pre::-webkit-scrollbar]:size-2 [&_pre::-webkit-scrollbar-track]:bg-transparent [&_pre::-webkit-scrollbar-thumb]:rounded-full [&_pre::-webkit-scrollbar-thumb]:border-2 [&_pre::-webkit-scrollbar-thumb]:border-solid [&_pre::-webkit-scrollbar-thumb]:border-transparent [&_pre::-webkit-scrollbar-thumb]:bg-[#5C6B50]/45 [&_pre::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&_pre::-webkit-scrollbar-thumb]:bg-[#5C6B50]/62";

const slideScrollbarClass =
  "[scrollbar-color:rgba(255,255,255,0.32)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar]:size-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:border-2 [&::-webkit-scrollbar-thumb]:border-solid [&::-webkit-scrollbar-thumb]:border-transparent [&::-webkit-scrollbar-thumb]:bg-white/28 [&::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&::-webkit-scrollbar-thumb]:bg-white/40";

const slideNestedScrollbarClass =
  "[&_pre]:[scrollbar-color:rgba(255,255,255,0.32)_transparent] [&_pre]:[scrollbar-width:thin] [&_pre::-webkit-scrollbar]:size-2 [&_pre::-webkit-scrollbar-track]:bg-transparent [&_pre::-webkit-scrollbar-thumb]:rounded-full [&_pre::-webkit-scrollbar-thumb]:border-2 [&_pre::-webkit-scrollbar-thumb]:border-solid [&_pre::-webkit-scrollbar-thumb]:border-transparent [&_pre::-webkit-scrollbar-thumb]:bg-white/28 [&_pre::-webkit-scrollbar-thumb]:bg-clip-padding hover:[&_pre::-webkit-scrollbar-thumb]:bg-white/40";

export const classes: Record<AgentConversationVariant, ConversationClassNames> = {
  document: {
    root: "flex h-screen min-h-0 flex-col overflow-hidden border-r border-[#B8A07C]/30 bg-[#EEE8DC] text-[#2A2620]",
    header: "flex h-12 items-center justify-between border-b border-[#B8A07C]/30 px-4",
    homeButton: "text-[13px] font-semibold text-[#2A2620]/72 hover:text-[#5C6B50]",
    headerStatus: "flex items-center gap-2 text-[11px] font-semibold text-[#8B8275]",
    scroll: cx("min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-0 pt-5", documentScrollbarClass),
    introCard: "rounded-[20px] border border-[#B8A07C]/30 bg-[#F9F4EC] p-4  backdrop-blur",
    introMain: "flex items-start",
    introTitle: "text-[13px] font-semibold text-[#2A2620]",
    introBody: "mt-1 text-[13px] leading-5 text-[#8B8275]",
    quickPrompts: "mb-3 flex flex-wrap gap-2 px-1",
    quickButton: "flex h-8 items-center gap-1.5 rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/55 px-3 text-left text-[13px] text-[#2A2620]/66 hover:border-[#B8A07C]/30 hover:text-[#5C6B50]",
    error: "mt-4 rounded-[16px] border border-[#B8A07C]/30 bg-[#F4EFE6]/80 p-3 text-[13px] leading-5 text-[#7b2e24]",
    activeSelection: "mt-4 rounded-[20px] border border-[#B8A07C]/30 bg-[#F4EFE6]/48 p-3",
    composerSelection: "mb-3 rounded-[16px] border border-[#B8A07C]/30 bg-[#F4EFE6]/48 p-3",
    activeSelectionLabel: "mb-1.5 text-[11px] font-semibold uppercase text-[#8B8275]",
    activeSelectionText: cx("max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-[#2A2620]/62", documentScrollbarClass),
    composerSelectionText: cx("max-h-20 overflow-auto overscroll-contain whitespace-pre-wrap break-words text-[11px] leading-4 text-[#2A2620]/62", documentScrollbarClass),
    messages: "mt-5 space-y-4 px-3",
    composerWrap: "px-3 pb-3 pt-0",
    composer: "rounded-[16px] border border-[#B8A07C]/30 bg-[#F9F4EC] p-3 ",
    textarea: "h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-[#2A2620] outline-none placeholder:text-[#8B8275]",
    composerFooter: "mt-2 flex items-center justify-between pt-2",
    composerActions: "flex items-center gap-2",
    agentSelectWrap: "relative min-w-0 max-w-[176px] shrink",
    agentSelect: "h-8 w-full min-w-[108px] appearance-none rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6]/70 py-0 pl-3.5 pr-8 text-[13px] font-semibold text-[#2A2620]/78 outline-none transition hover:border-[#B8A07C]/30 hover:text-[#5C6B50] focus:border-[#B8A07C]/30 focus:ring-2 focus:ring-[#B8A07C]/30 disabled:cursor-default disabled:opacity-50",
    agentSelectChevron: "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8B8275]",
    cancelButton: "grid size-8 place-items-center rounded-full border border-[#B8A07C]/30 bg-[#F4EFE6] text-[#7b2e24] hover:border-[#B8A07C]/30 disabled:cursor-wait disabled:opacity-70",
    sendButton: "grid size-8 place-items-center rounded-full bg-[#2A2620] text-[#F4EFE6] disabled:bg-[#B8A07C]/32 disabled:text-[#8B8275]",
    sendButtonBusy: "relative !bg-transparent !text-[#2A2620] disabled:!bg-transparent disabled:!text-[#2A2620]",
    userRow: "flex justify-end",
    userMessage: "max-w-[88%] rounded-[20px] rounded-tr-md bg-[#5C6B50] px-3 py-2 text-[13px] leading-5 text-[#F4EFE6]",
    userSelection: "mb-2 rounded-[14px] bg-[#F4EFE6]/16 px-2 py-1.5 text-[11px] leading-4 text-[#F4EFE6]/72",
    userText: "whitespace-pre-wrap",
    userAttachments: "mb-3 grid gap-2",
    userAttachmentCard: "flex h-[64px] min-w-0 items-center gap-3 rounded-[16px] border border-[#B8A07C]/30 bg-[#EEE8DC]/92 p-2 text-[#2A2620]",
    userAttachmentIcon: "grid size-11 shrink-0 place-items-center rounded-[14px] bg-[#F4EFE6] text-[#5C6B50]",
    userAttachmentMeta: "min-w-0",
    userAttachmentName: "truncate text-[13px] font-medium text-[#2A2620]",
    userAttachmentSize: "mt-0.5 text-[13px] font-medium text-[#8B8275]",
    assistantRow: "flex justify-start",
    assistantMessage: "grid max-w-[92%] gap-2 text-[13px] leading-5 text-[#2A2620]/72",
    runStatus: "flex items-center gap-1.5 text-[11px] font-semibold text-[#8B8275]",
    toolGroup: (status) => {
      const tone =
        status === "error"
          ? "border-[#B8A07C]/30 bg-[#F4EFE6]/70 text-[#7b2e24]"
          : status === "success"
            ? "border-[#B8A07C]/30 bg-[#F4EFE6]/58 text-[#5C6B50]"
            : "border-[#B8A07C]/30 bg-[#F4EFE6]/48 text-[#2A2620]/62";
      return `group rounded-[16px] border ${tone}`;
    },
    toolSummary: "flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 [&::-webkit-details-marker]:hidden",
    toolSummaryMain: "flex min-w-0 items-center gap-2 text-[11px] font-semibold",
    toolSummaryMeta: "flex min-w-0 items-center gap-2",
    toolCount: "rounded-full bg-[#EEE8DC]/70 px-1.5 py-0.5 text-[11px] text-[#8B8275]",
    toolPreview: "max-w-[150px] truncate text-[11px] font-medium text-[#8B8275]",
    toolStatus: (status) =>
      status === "error"
        ? "rounded-full bg-[#7b2e24]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#7b2e24]"
        : status === "success"
          ? "rounded-full bg-[#5C6B50]/10 px-1.5 py-0.5 text-[11px] font-semibold text-[#5C6B50]"
          : "rounded-full bg-[#EEE8DC]/70 px-1.5 py-0.5 text-[11px] font-semibold text-[#8B8275]",
    toolChevron: "shrink-0 text-[#8B8275] transition-transform group-open:rotate-180",
    toolRows: "border-t border-[#B8A07C]/30 px-2.5 py-2",
    toolRow: "border-b border-[#B8A07C]/30 py-2 last:border-b-0",
    toolRowHead: "mb-1.5 flex items-center justify-between gap-2",
    toolName: "min-w-0 truncate text-[11px] font-semibold text-[#2A2620]/66",
    toolRowStatus: (status) =>
      status === "error"
        ? "text-[11px] font-semibold text-[#7b2e24]"
        : status === "success"
          ? "text-[11px] font-semibold text-[#5C6B50]"
          : "text-[11px] font-semibold text-[#8B8275]",
    toolPayload: "mt-1 grid gap-1",
    toolPayloadLabel: "text-[11px] font-semibold uppercase text-[#8B8275]",
    toolPayloadText: cx("max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-[12px] bg-[#EEE8DC]/70 px-2 py-1.5 font-mono text-[11px] leading-4 text-[#2A2620]/58", documentScrollbarClass),
    thinkingBlock: "rounded-[16px] bg-[#F4EFE6]/50 px-2.5 py-2 text-[11px] leading-4 text-[#8B8275]",
    errorBlock: "rounded-[16px] border border-[#B8A07C]/30 bg-[#F4EFE6]/70 px-2.5 py-2 text-[11px] leading-4 text-[#7b2e24]",
    resultBlock:
      cx("break-words text-[12px] leading-5 text-[#2A2620]/70 [&_.ai-agent-file-link]:border-0 [&_.ai-agent-file-link]:bg-transparent [&_.ai-agent-file-link]:p-0 [&_.ai-agent-file-link]:font-semibold [&_.ai-agent-file-link]:text-[#5C6B50] [&_.ai-agent-file-link]:underline [&_.ai-agent-file-link]:underline-offset-2 [&_a]:font-semibold [&_a]:text-[#5C6B50] [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-[#B8A07C] [&_blockquote]:pl-2.5 [&_blockquote]:text-[#8B8275] [&_code]:rounded-md [&_code]:bg-[#F4EFE6]/80 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:text-[#2A2620]/72 [&_h1]:mb-1.5 [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-[#2A2620] [&_h2]:mb-1 [&_h2]:text-[13px] [&_h2]:font-bold [&_h2]:text-[#2A2620] [&_h3]:mb-1 [&_h3]:text-[12px] [&_h3]:font-bold [&_h3]:text-[#2A2620] [&_hr]:my-2 [&_hr]:border-[#B8A07C]/55 [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-1.5 [&_pre]:max-h-[220px] [&_pre]:overflow-auto [&_pre]:rounded-[12px] [&_pre]:bg-[#F4EFE6]/80 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-bold [&_strong]:text-[#2A2620] [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5", documentNestedScrollbarClass),
    statusBlock: "text-[11px] leading-4 text-[#8B8275]",
    spin: "animate-spin",
  },
  slide: {
    root: "flex h-screen min-h-0 min-w-0 flex-col overflow-hidden border-r border-[#B8A07C]/30 bg-[#202020]",
    header: "flex h-12 shrink-0 items-center justify-between border-b border-[#B8A07C]/30 px-4",
    homeButton: "border-0 bg-transparent p-0 text-[13px] font-bold text-white/62 hover:text-white",
    headerStatus: "flex items-center gap-[7px] text-[11px] font-bold text-white/38",
    scroll: cx("min-h-0 flex-1 overflow-auto overscroll-contain px-4 pb-0 pt-5", slideScrollbarClass),
    introCard: "rounded-2xl bg-[#2c2c2c] p-4 ",
    introMain: "flex items-start",
    introTitle: "text-[13px] font-extrabold text-white",
    introBody: "mt-1 text-[13px] leading-[1.65] text-white/55",
    quickPrompts: "mb-3 flex flex-wrap gap-2 px-1",
    quickButton: "inline-flex h-8 items-center gap-1.5 rounded-full border border-[#B8A07C]/30 bg-[#252525] px-3 text-[13px] text-white/58 hover:bg-[#2d2d2d] hover:text-white",
    error: "mt-4 rounded-xl bg-[#3a241f] px-3 py-2.5 text-[13px] leading-5 text-[#ffad9f]",
    activeSelection: "mt-4 rounded-2xl border border-[#B8A07C]/30 bg-white/[0.04] p-3",
    composerSelection: "mb-3 rounded-2xl border border-[#B8A07C]/30 bg-white/[0.04] p-3",
    activeSelectionLabel: "mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-white/28",
    activeSelectionText: cx("max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58", slideScrollbarClass),
    composerSelectionText: cx("max-h-20 overflow-auto overscroll-contain whitespace-pre-wrap break-words text-[11px] leading-4 text-white/58", slideScrollbarClass),
    messages: "mt-5 grid gap-4 px-3",
    composerWrap: "shrink-0 px-3 pb-3 pt-0",
    composer: "rounded-2xl border border-[#B8A07C]/30 bg-[#2b2b2b] p-3 ",
    textarea: "block h-[92px] w-full resize-none border-0 bg-transparent text-[13px] leading-5 text-white outline-none placeholder:text-white/36",
    composerFooter: "mt-2 flex items-center justify-between pt-2",
    composerActions: "flex items-center gap-2",
    agentSelectWrap: "relative min-w-0 max-w-[176px] shrink",
    agentSelect: "h-8 w-full min-w-[108px] appearance-none rounded-full border border-[#B8A07C]/30 bg-[#242424] py-0 pl-3.5 pr-8 text-[13px] font-bold text-white/78 outline-none transition hover:border-[#B8A07C]/30 hover:bg-[#292929] focus:border-[#B8A07C]/30 focus:ring-2 focus:ring-[#B8A07C]/30 disabled:cursor-default disabled:opacity-50",
    agentSelectChevron: "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-white/46",
    cancelButton: "grid size-8 place-items-center rounded-full border border-[#B8A07C]/30 bg-[#3a241f] text-[#ffad9f] hover:bg-[#4a2a24] disabled:cursor-wait disabled:opacity-70",
    sendButton: "grid size-8 place-items-center rounded-full border-0 bg-white text-black disabled:cursor-default disabled:bg-white/20 disabled:text-white/40",
    sendButtonBusy: "relative !bg-transparent !text-[#2A2620] disabled:!bg-transparent disabled:!text-[#2A2620]",
    userRow: "flex justify-end",
    userMessage: "max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-white px-3 py-2 text-[13px] leading-[1.65] text-[#1f1f1f]",
    userSelection: "mb-2 rounded-xl bg-black/[0.06] px-2 py-1.5 text-[11px] leading-4 text-black/58",
    userText: "",
    userAttachments: "mb-3 grid gap-2",
    userAttachmentCard: "flex h-[64px] min-w-0 items-center gap-3 rounded-xl border border-[#B8A07C]/30 bg-black/[0.04] p-2 text-[#1f1f1f]",
    userAttachmentIcon: "grid size-11 shrink-0 place-items-center rounded-xl bg-white text-black/68",
    userAttachmentMeta: "min-w-0",
    userAttachmentName: "truncate text-[13px] font-bold text-[#1f1f1f]",
    userAttachmentSize: "mt-0.5 text-[13px] font-bold text-black/42",
    assistantRow: "flex justify-start",
    assistantMessage: "grid max-w-[92%] gap-2 text-[13px] leading-[1.65] text-white/72",
    runStatus: "flex items-center gap-[7px] text-[11px] font-bold text-white/38",
    toolGroup: (status) => {
      const tone =
        status === "error"
          ? "border-[#B8A07C]/30 bg-[#33211f] text-[#ffb2a5]"
          : status === "success"
            ? "border-[#B8A07C]/30 bg-[#242824] text-white/64"
            : "border-[#B8A07C]/30 bg-[#232323] text-white/62";
      return `group rounded-xl border ${tone}`;
    },
    toolSummary: "flex cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 [&::-webkit-details-marker]:hidden",
    toolSummaryMain: "flex min-w-0 items-center gap-2 text-[11px] font-extrabold",
    toolSummaryMeta: "flex min-w-0 items-center gap-2",
    toolCount: "rounded-full bg-white/10 px-1.5 py-0.5 text-[11px] text-white/48",
    toolPreview: "max-w-[150px] truncate text-[11px] font-bold text-white/36",
    toolStatus: (status) =>
      status === "error"
        ? "rounded-full bg-[#5a2c28] px-1.5 py-0.5 text-[11px] font-extrabold text-[#ffb2a5]"
        : status === "success"
          ? "rounded-full bg-white/8 px-1.5 py-0.5 text-[11px] font-extrabold text-white/42"
          : "rounded-full bg-white/8 px-1.5 py-0.5 text-[11px] font-extrabold text-white/54",
    toolChevron: "shrink-0 text-white/32 transition-transform group-open:rotate-180",
    toolRows: "border-t border-[#B8A07C]/30 px-2.5 py-2",
    toolRow: "border-b border-[#B8A07C]/30 py-2 last:border-b-0",
    toolRowHead: "mb-1.5 flex items-center justify-between gap-2",
    toolName: "min-w-0 truncate text-[11px] font-extrabold text-white/62",
    toolRowStatus: (status) =>
      status === "error"
        ? "text-[11px] font-extrabold text-[#ffad9f]"
        : status === "success"
          ? "text-[11px] font-extrabold text-white/36"
          : "text-[11px] font-extrabold text-white/48",
    toolPayload: "mt-1 grid gap-1",
    toolPayloadLabel: "text-[11px] font-extrabold uppercase text-white/28",
    toolPayloadText: cx("max-h-[180px] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/18 px-2 py-1.5 font-mono text-[11px] leading-4 text-white/46", slideScrollbarClass),
    thinkingBlock: "rounded-xl bg-white/[0.04] px-2.5 py-2 text-[11px] leading-4 text-white/48",
    errorBlock: "rounded-xl bg-[#3a241f] px-3 py-2.5 text-[13px] leading-5 text-[#ffad9f]",
    resultBlock:
      cx("break-words text-[12px] leading-[1.65] text-white/70 [&_.ai-agent-file-link]:border-0 [&_.ai-agent-file-link]:bg-transparent [&_.ai-agent-file-link]:p-0 [&_.ai-agent-file-link]:font-bold [&_.ai-agent-file-link]:text-white/86 [&_.ai-agent-file-link]:underline [&_.ai-agent-file-link]:underline-offset-2 [&_a]:font-bold [&_a]:text-white/86 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:my-1.5 [&_blockquote]:border-l-2 [&_blockquote]:border-white/18 [&_blockquote]:pl-2.5 [&_blockquote]:text-white/56 [&_code]:rounded-md [&_code]:bg-black/22 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[11px] [&_em]:text-white/72 [&_h1]:mb-1.5 [&_h1]:text-[14px] [&_h1]:font-extrabold [&_h1]:text-white/86 [&_h2]:mb-1 [&_h2]:text-[13px] [&_h2]:font-extrabold [&_h2]:text-white/82 [&_h3]:mb-1 [&_h3]:text-[12px] [&_h3]:font-extrabold [&_h3]:text-white/78 [&_hr]:my-2 [&_hr]:border-white/10 [&_li]:my-0.5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-1.5 [&_pre]:my-1.5 [&_pre]:max-h-[220px] [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-black/22 [&_pre]:p-2 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_strong]:font-extrabold [&_strong]:text-white/84 [&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5", slideNestedScrollbarClass),
    statusBlock: "mt-1 whitespace-pre-wrap break-words text-[11px] leading-4 text-white/48",
    spin: "animate-spin",
  },
};
