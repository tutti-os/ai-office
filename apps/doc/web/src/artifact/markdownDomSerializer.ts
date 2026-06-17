export function markdownDomToMarkdown(root: HTMLElement) {
  const blocks = Array.from(root.childNodes)
    .map((node) => blockNodeToMarkdown(node, 0))
    .map((block) => block.trimEnd())
    .filter(Boolean);
  return `${blocks.join("\n\n")}\n`;
}

function blockNodeToMarkdown(node: Node, depth: number): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";

  const tagName = node.tagName.toLowerCase();
  if (/^h[1-6]$/.test(tagName)) {
    const level = Number(tagName.slice(1));
    return `${"#".repeat(level)} ${inlineChildrenToMarkdown(node)}`;
  }
  if (tagName === "p" || tagName === "div") return inlineChildrenToMarkdown(node);
  if (tagName === "blockquote") {
    return Array.from(node.childNodes)
      .map((child) => blockNodeToMarkdown(child, depth))
      .join("\n\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }
  if (tagName === "pre") {
    const code = node.textContent ?? "";
    const fence = code.includes("```") ? "````" : "```";
    return `${fence}\n${code.replace(/\n$/, "")}\n${fence}`;
  }
  if (tagName === "ul") return listToMarkdown(node, false, depth);
  if (tagName === "ol") return listToMarkdown(node, true, depth);
  if (tagName === "hr") return "---";
  if (tagName === "table") return tableToMarkdown(node);
  if (tagName === "br") return "\n";
  return inlineNodeToMarkdown(node);
}

function listToMarkdown(list: HTMLElement, ordered: boolean, depth: number) {
  return Array.from(list.children)
    .filter((child): child is HTMLLIElement => child instanceof HTMLLIElement && child.tagName.toLowerCase() === "li")
    .map((item, index) => {
      const checkbox = item.querySelector(":scope > input[type='checkbox']");
      const taskMarker = checkbox instanceof HTMLInputElement ? `[${checkbox.checked ? "x" : " "}] ` : "";
      const marker = ordered ? `${index + 1}. ` : "- ";
      const nestedBlocks: string[] = [];
      const inlineParts: string[] = [];
      for (const child of Array.from(item.childNodes)) {
        if (child instanceof HTMLInputElement && child.type === "checkbox") continue;
        if (child instanceof HTMLElement && ["ul", "ol"].includes(child.tagName.toLowerCase())) {
          nestedBlocks.push(blockNodeToMarkdown(child, depth + 1));
        } else {
          inlineParts.push(inlineNodeToMarkdown(child));
        }
      }
      const indent = "  ".repeat(depth);
      const line = `${indent}${marker}${taskMarker}${inlineParts.join("").trim() || "item"}`;
      return [line, ...nestedBlocks].filter(Boolean).join("\n");
    })
    .join("\n");
}

function tableToMarkdown(table: HTMLElement) {
  const rows = Array.from(table.querySelectorAll("tr")).map((row) =>
    Array.from(row.children).map((cell) => inlineChildrenToMarkdown(cell as HTMLElement).replace(/\|/g, "\\|").trim()),
  );
  if (!rows.length) return "";
  const [head, ...body] = rows;
  const divider = head.map(() => "---");
  return [head, divider, ...body].map((row) => `| ${row.join(" | ")} |`).join("\n");
}

function inlineChildrenToMarkdown(element: HTMLElement) {
  return Array.from(element.childNodes).map(inlineNodeToMarkdown).join("").replace(/[ \t]+\n/g, "\n").trim();
}

function inlineNodeToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return normalizeText(node.textContent ?? "");
  if (!(node instanceof HTMLElement)) return "";

  const tagName = node.tagName.toLowerCase();
  const children = inlineChildrenToMarkdown(node);
  if (tagName === "strong" || tagName === "b") return children ? `**${children}**` : "";
  if (tagName === "em" || tagName === "i") return children ? `*${children}*` : "";
  if (tagName === "s" || tagName === "strike" || tagName === "del") return children ? `~~${children}~~` : "";
  if (tagName === "code") return node.closest("pre") ? node.textContent ?? "" : `\`${node.textContent ?? ""}\``;
  if (tagName === "a") return `[${children || node.getAttribute("href") || "link"}](${node.getAttribute("href") || "#"})`;
  if (tagName === "img") return `![${node.getAttribute("alt") || "image"}](${node.getAttribute("src") || ""})`;
  if (tagName === "br") return "\n";
  return children;
}

function normalizeText(value: string) {
  return value.replace(/\u00a0/g, " ");
}
