import type { RuntimeDocument } from "./types";

const fallbackHeadHTML = `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Document</title>`;

export function parseRuntimeDocument(html: string): RuntimeDocument {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html || emptyHtmlDocument(), "text/html");
  const htmlElement = parsed.documentElement;
  const head = parsed.head;
  const body = parsed.body;

  return {
    doctype: detectDoctype(html),
    htmlAttributes: attributesToRecord(htmlElement),
    headHTML: sanitizeHeadHTML(head.innerHTML.trim() || fallbackHeadHTML),
    bodyAttributes: attributesToRecord(body),
    bodyInnerHTML: body.innerHTML,
  };
}

export function serializeRuntimeDocument(document: RuntimeDocument) {
  const htmlAttributes = serializeAttributes(document.htmlAttributes);
  const bodyAttributes = serializeAttributes(document.bodyAttributes);
  const headHTML = sanitizeHeadHTML(document.headHTML);
  return `${document.doctype || "<!DOCTYPE html>"}
<html${htmlAttributes ? ` ${htmlAttributes}` : ""}>
<head>
${headHTML}
</head>
<body${bodyAttributes ? ` ${bodyAttributes}` : ""}>
${document.bodyInnerHTML}
</body>
</html>`;
}

export function runtimeDocumentFromFrame(doc: Document): RuntimeDocument {
  return {
    doctype: doc.doctype ? `<!DOCTYPE ${doc.doctype.name}>` : "<!DOCTYPE html>",
    htmlAttributes: attributesToRecord(doc.documentElement),
    headHTML: sanitizeHeadHTML(doc.head.innerHTML.trim() || fallbackHeadHTML),
    bodyAttributes: attributesToRecord(doc.body),
    bodyInnerHTML: doc.body.innerHTML,
  };
}

export function getRuntimeTitle(document: RuntimeDocument) {
  const parsed = new DOMParser().parseFromString(`<head>${document.headHTML}</head>`, "text/html");
  return parsed.querySelector("title")?.textContent?.trim() || "Untitled Document";
}

function emptyHtmlDocument() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${fallbackHeadHTML}
</head>
<body contenteditable="true"><p><br></p></body>
</html>`;
}

function detectDoctype(html: string) {
  const match = html.match(/<!doctype\s+html[^>]*>/i);
  return match?.[0] ?? "<!DOCTYPE html>";
}

function attributesToRecord(element: Element | null): Record<string, string> {
  if (!element) return {};
  return Object.fromEntries(Array.from(element.attributes).map((attr) => [attr.name, attr.value]));
}

function serializeAttributes(attributes: Record<string, string>) {
  return Object.entries(attributes)
    .filter(([name]) => !isRuntimeOnlyAttribute(name))
    .map(([name, value]) => (value === "" ? name : `${name}="${escapeAttribute(value)}"`))
    .join(" ");
}

function sanitizeHeadHTML(headHTML: string) {
  const parsed = new DOMParser().parseFromString(`<head>${headHTML}</head>`, "text/html");
  parsed.querySelector("#__web-inspector-hide-shortcut-style__")?.remove();
  parsed.querySelectorAll("script[data-editor-runtime], style[data-editor-runtime]").forEach((node) => node.remove());
  return parsed.head.innerHTML.trim();
}

function isRuntimeOnlyAttribute(name: string) {
  return name.startsWith("data-runtime-");
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;");
}
