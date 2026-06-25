import type { ReactNode } from "react";

export function MarkdownText(props: { className: string; text: string }) {
  return <div className={classNames(props.className, "ai-agent-markdown")}>{renderMarkdownBlocks(props.text)}</div>;
}

function renderMarkdownBlocks(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (lines[index]?.startsWith("```")) index += 1;
      blocks.push(
        <pre key={`code:${index}`}>
          <code data-language={language || undefined}>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(renderMarkdownHeading(level, heading[2], `heading:${index}`));
      index += 1;
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(<li key={`ul:${index}`}>{renderInlineMarkdown(lines[index].replace(/^\s*[-*+]\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ul key={`ul:${index}`}>{items}</ul>);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(<li key={`ol:${index}`}>{renderInlineMarkdown(lines[index].replace(/^\s*\d+\.\s+/, ""))}</li>);
        index += 1;
      }
      blocks.push(<ol key={`ol:${index}`}>{items}</ol>);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={`quote:${index}`}>{quoteLines.map((quote, quoteIndex) => <p key={quoteIndex}>{renderInlineMarkdown(quote)}</p>)}</blockquote>);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={`hr:${index}`} />);
      index += 1;
      continue;
    }

    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={`p:${index}`}>{renderInlineMarkdown(paragraph.join(" "))}</p>);
  }

  return blocks.length ? blocks : null;
}

function isMarkdownBlockStart(line: string) {
  return (
    line.startsWith("```") ||
    /^(#{1,6})\s+/.test(line) ||
    /^\s*[-*+]\s+/.test(line) ||
    /^\s*\d+\.\s+/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*---+\s*$/.test(line)
  );
}

function renderInlineMarkdown(value: string) {
  const nodes: ReactNode[] = [];
  const pattern = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^)]+\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value))) {
    if (match.index > lastIndex) nodes.push(value.slice(lastIndex, match.index));
    nodes.push(renderInlineToken(match[0], nodes.length));
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < value.length) nodes.push(value.slice(lastIndex));
  return nodes;
}

function renderMarkdownHeading(level: number, text: string, key: string) {
  if (level === 1) return <h1 key={key}>{renderInlineMarkdown(text)}</h1>;
  if (level === 2) return <h2 key={key}>{renderInlineMarkdown(text)}</h2>;
  if (level === 3) return <h3 key={key}>{renderInlineMarkdown(text)}</h3>;
  if (level === 4) return <h4 key={key}>{renderInlineMarkdown(text)}</h4>;
  if (level === 5) return <h5 key={key}>{renderInlineMarkdown(text)}</h5>;
  return <h6 key={key}>{renderInlineMarkdown(text)}</h6>;
}

function renderInlineToken(token: string, key: number) {
  if (token.startsWith("`") && token.endsWith("`")) return <code key={key}>{token.slice(1, -1)}</code>;
  if (token.startsWith("**") && token.endsWith("**")) return <strong key={key}>{token.slice(2, -2)}</strong>;
  if (token.startsWith("__") && token.endsWith("__")) return <strong key={key}>{token.slice(2, -2)}</strong>;
  if (token.startsWith("~~") && token.endsWith("~~")) return <s key={key}>{token.slice(2, -2)}</s>;
  if (token.startsWith("*") && token.endsWith("*")) return <em key={key}>{token.slice(1, -1)}</em>;
  if (token.startsWith("_") && token.endsWith("_")) return <em key={key}>{token.slice(1, -1)}</em>;
  const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
  if (link) {
    const destination = link[2].trim();
    const localPath = localFilePathDestination(destination);
    if (localPath) {
      return (
        <button key={key} type="button" className="ai-agent-file-link" onClick={() => void openLocalFilePath(localPath)}>
          {link[1]}
        </button>
      );
    }

    const href = safeMarkdownHref(destination);
    return href ? (
      <a key={key} href={href} target="_blank" rel="noreferrer">
        {link[1]}
      </a>
    ) : (
      <span key={key}>{link[1]}</span>
    );
  }
  return token;
}

function safeMarkdownHref(href: string) {
  const trimmed = href.trim();
  if (/^(https?:|mailto:|\/|#)/i.test(trimmed)) return trimmed;
  return "";
}

function localFilePathDestination(destination: string) {
  const decoded = decodeMarkdownDestination(destination);
  if (isLocalAbsolutePath(decoded)) return decoded;
  if (/^file:\/\//i.test(decoded)) {
    try {
      const url = new URL(decoded);
      return isLocalAbsolutePath(url.pathname) ? decodeURIComponent(url.pathname) : "";
    } catch {
      return "";
    }
  }
  return "";
}

function decodeMarkdownDestination(destination: string) {
  try {
    return decodeURI(destination.trim());
  } catch {
    return destination.trim();
  }
}

function isLocalAbsolutePath(value: string) {
  return /^\/(?:Users|Volumes|private|tmp|var|home|mnt|opt)(?:\/|$)/.test(value) || /^[A-Za-z]:[\\/]/.test(value);
}

async function openLocalFilePath(path: string) {
  if (typeof window === "undefined") return;

  const tuttiExternal = (window as unknown as { tuttiExternal?: { files?: { open?: (input: { path: string; name?: string; mode?: "auto" | "preview" | "reveal" }) => Promise<void> } } }).tuttiExternal;

  if (tuttiExternal?.files?.open) {
    try {
      await tuttiExternal.files.open({ path, mode: "reveal" });
      return;
    } catch {
      // Fall through to the browser fallback for non-Tutti or partially wired hosts.
    }
  }

  window.open(`file://${encodeURI(path)}`, "_blank", "noreferrer");
}

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
