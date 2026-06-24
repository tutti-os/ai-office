import { ChevronDown, TerminalSquare } from "lucide-react";
import type { AgentConversationBlock } from "@ai-app/agent/conversation";
import type { ConversationClassNames } from "./styles.js";

export function ToolGroupBlock(props: { cx: ConversationClassNames; block: Extract<AgentConversationBlock, { type: "tool_group" }> }) {
  const { block, cx } = props;
  const primaryCall = block.calls[0];
  const title = primaryCall ? toolDisplayName(primaryCall.name) : "Tool result";
  const summary = summarizeToolBlock(block);
  const resultById = new Map(block.results.map((result) => [result.id, result]));

  return (
    <details className={cx.toolGroup(block.status)}>
      <summary className={cx.toolSummary}>
        <div className={cx.toolSummaryMain}>
          <TerminalSquare size={13} />
          <span>{title}</span>
          {block.calls.length > 1 ? <span className={cx.toolCount}>{block.calls.length}</span> : null}
        </div>
        <div className={cx.toolSummaryMeta}>
          {summary ? <span className={cx.toolPreview}>{summary}</span> : null}
          <span className={cx.toolStatus(block.status)}>{toolStatusLabel(block.status)}</span>
          <ChevronDown className={cx.toolChevron} size={13} />
        </div>
      </summary>
      <div className={cx.toolRows}>
        {block.calls.map((call) => (
          <ToolCallRow call={call} cx={cx} key={call.id} result={resultById.get(call.id)} />
        ))}
        {block.calls.length === 0
          ? block.results.map((result) => <ToolResultRow cx={cx} key={result.id} result={result} />)
          : null}
      </div>
    </details>
  );
}

function summarizeToolBlock(block: Extract<AgentConversationBlock, { type: "tool_group" }>) {
  const failedResult = block.results.find((result) => result.status === "error" && result.content.trim());
  if (failedResult) return truncateMiddle(failedResult.content.trim(), 96);
  if (block.calls.length > 0) return block.calls.map((call) => summarizeToolInput(call.input)).find(Boolean) || "";
  return block.results.map((result) => result.content).find(Boolean) || "";
}

function ToolCallRow(props: {
  call: Extract<AgentConversationBlock, { type: "tool_group" }>["calls"][number];
  cx: ConversationClassNames;
  result?: Extract<AgentConversationBlock, { type: "tool_group" }>["results"][number];
}) {
  return (
    <div className={props.cx.toolRow}>
      <div className={props.cx.toolRowHead}>
        <span className={props.cx.toolName}>{toolDisplayName(props.call.name)}</span>
        <span className={props.cx.toolRowStatus(props.result?.status ?? "streaming")}>
          {props.result ? toolStatusLabel(props.result.status) : "running"}
        </span>
      </div>
      <ToolPayload label="Input" value={props.call.input} cx={props.cx} />
      {props.result ? <ToolPayload label={props.result.status === "error" ? "Error" : "Result"} value={props.result.content} cx={props.cx} /> : null}
    </div>
  );
}

function ToolResultRow(props: {
  cx: ConversationClassNames;
  result: Extract<AgentConversationBlock, { type: "tool_group" }>["results"][number];
}) {
  return (
    <div className={props.cx.toolRow}>
      <div className={props.cx.toolRowHead}>
        <span className={props.cx.toolName}>{toolDisplayName(props.result.name)}</span>
        <span className={props.cx.toolRowStatus(props.result.status)}>{toolStatusLabel(props.result.status)}</span>
      </div>
      <ToolPayload label={props.result.status === "error" ? "Error" : "Result"} value={props.result.content} cx={props.cx} />
    </div>
  );
}

function ToolPayload(props: { cx: ConversationClassNames; label: string; value: unknown }) {
  const value = formatToolPayload(props.value);
  if (!value) return null;
  return (
    <div className={props.cx.toolPayload}>
      <span className={props.cx.toolPayloadLabel}>{props.label}</span>
      <span className={props.cx.toolPayloadText}>{value}</span>
    </div>
  );
}

function toolDisplayName(name: string) {
  const normalized = name.trim();
  if (normalized === "ai_document_get_document") return "Read doc";
  if (normalized === "ai_document_save_document") return "Save doc";
  if (normalized === "ai_slide_get_project") return "Read slide";
  if (normalized === "ai_slide_save_project") return "Save slide";
  return normalized.replace(/^mcp__/, "").replace(/__/g, " / ").replace(/_/g, " ");
}

function toolStatusLabel(status: "streaming" | "success" | "error") {
  if (status === "streaming") return "running";
  if (status === "success") return "done";
  return "failed";
}

function summarizeToolInput(input: unknown) {
  if (isEmptyToolInput(input)) return "";
  const record = isRecord(input) ? input : null;
  const preferred =
    readString(record?.cmd) ??
    readString(record?.command) ??
    readString(record?.title) ??
    readString(record?.path) ??
    readString(record?.filePath) ??
    readString(record?.file_path) ??
    readString(record?.query) ??
    readString(record?.pattern) ??
    readString(record?.htmlContent);
  return truncateMiddle(preferred ?? formatToolPayload(input), 96);
}

function formatToolPayload(value: unknown) {
  if (value == null || value === "") return "";
  if (isEmptyToolInput(value)) return "";
  if (typeof value === "string") return truncateText(value.trim(), 1600);
  try {
    return truncateText(JSON.stringify(value, null, 2), 1600);
  } catch {
    return String(value);
  }
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}…`;
}

function truncateMiddle(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  const keep = Math.max(8, Math.floor((maxLength - 1) / 2));
  return `${value.slice(0, keep)}…${value.slice(-keep)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isEmptyToolInput(value: unknown) {
  return isRecord(value) && Object.keys(value).length === 0;
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
