import { ImageAttributes, inlineTags } from './types';
import { descendantDepth, selectNodeRange } from './clearFormatHelpers';
import { applyPresentationStyleToElement, readPresentationStyle, selectedElement } from './presentationHelpers';
export function findTargetImage(doc: Document, targetElement?: Element | null) {
  const target = targetElement && doc.body.contains(targetElement) ? targetElement : selectedElement(doc);
  if (!target) return null;
  if (target.tagName === "IMG") return target as HTMLImageElement;
  const selected = selectedElement(doc);
  return selected?.tagName === "IMG" ? (selected as HTMLImageElement) : null;
}

export function applyImageAttributes(image: HTMLImageElement, attributes: ImageAttributes) {
  image.setAttribute("src", attributes.src);
  image.setAttribute("alt", attributes.alt?.trim() ?? "");
  const width = normalizeCssSize(attributes.width ?? "");
  const height = normalizeCssSize(attributes.height ?? "");
  image.removeAttribute("width");
  image.removeAttribute("height");
  if (width) image.style.width = width;
  else image.style.removeProperty("width");
  if (height) image.style.height = height;
  else image.style.removeProperty("height");
}

export function normalizeCssSize(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return /^(auto|[\d.]+(px|%|rem|em|vw|vh))$/i.test(trimmed) ? trimmed : "";
}

export function normalizeCssSizeOrNormal(value: string) {
  const trimmed = value.trim();
  return trimmed.toLowerCase() === "normal" ? "normal" : normalizeCssSize(trimmed);
}

export function normalizeLineHeight(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.toLowerCase() === "normal") return "normal";
  if (/^\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  return normalizeCssSize(trimmed);
}

export function normalizeBoxSize(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 4) return "";
  const normalized = parts.map((part) => normalizeCssSize(part));
  return normalized.every(Boolean) ? normalized.join(" ") : "";
}

export function normalizeBorderStyle(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["none", "solid", "dashed", "dotted", "double"].includes(normalized) ? normalized : "";
}

export function normalizeVerticalAlign(value: string) {
  const normalized = value.trim().toLowerCase();
  return ["baseline", "top", "middle", "bottom"].includes(normalized) ? normalized : "";
}

export function normalizeColor(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(trimmed) || /^rgba?\([\d\s.,%]+\)$/i.test(trimmed) ? trimmed : "";
}

export function kebabCase(value: string) {
  return value.replace(/[A-Z]/g, (match) => `-${match.toLowerCase()}`);
}

export function sanitizeHtml(doc: Document, html: string) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script").forEach((script) => script.remove());
  template.content.querySelectorAll("*").forEach((element) => {
    Array.from(element.attributes).forEach((attribute) => {
      if (isUnsafeHtmlAttribute(attribute.name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      const safeValue = sanitizeAttributeValue(attribute.name, attribute.value);
      if (safeValue === null) element.removeAttribute(attribute.name);
      else if (safeValue !== attribute.value) element.setAttribute(attribute.name, safeValue);
    });
  });
  return template.innerHTML;
}

export function sanitizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|data:image\/|blob:|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  return "";
}

export function normalizeLinkUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(trimmed)) return trimmed;
  if (!/^[a-z][a-z\d+.-]*:/i.test(trimmed) && /^[^\s@]+\.[^\s]+$/.test(trimmed)) return `https://${trimmed}`;
  return "";
}

export function normalizeLinkText(text: string | undefined, href: string) {
  const trimmed = text?.trim() ?? "";
  return trimmed || href;
}

export function applyLinkAttributes(link: HTMLAnchorElement, href: string) {
  link.setAttribute("href", href);
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
}

export function normalizeWrapperTag(tagName: string): keyof HTMLElementTagNameMap | null {
  const normalized = tagName.trim().toLowerCase();
  const allowed = new Set([
    "a",
    "abbr",
    "article",
    "aside",
    "b",
    "blockquote",
    "cite",
    "code",
    "div",
    "em",
    "footer",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "li",
    "main",
    "mark",
    "ol",
    "p",
    "pre",
    "section",
    "small",
    "span",
    "strong",
    "sub",
    "sup",
    "u",
    "ul",
  ]);
  return allowed.has(normalized) ? (normalized as keyof HTMLElementTagNameMap) : null;
}

export function isSafeAttributeName(name: string) {
  const normalized = name.trim().toLowerCase();
  return /^[a-z_:][a-z0-9_:.-]*$/i.test(normalized) && !isUnsafeHtmlAttribute(normalized);
}

export function isUnsafeHtmlAttribute(name: string) {
  const normalized = name.trim().toLowerCase();
  return normalized.startsWith("on") || normalized === "srcdoc";
}

export function sanitizeAttributeValue(name: string, value: string) {
  const normalized = name.trim().toLowerCase();
  if (normalized === "style") return sanitizeStyleValue(value);
  if (!isUrlAttribute(normalized)) return value;
  if (normalized === "src") return sanitizeUrl(value) || null;
  return normalizeLinkUrl(value) || null;
}

export function sanitizeStyleValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/expression\s*\(/i.test(trimmed) || /javascript\s*:/i.test(trimmed)) return null;
  return trimmed;
}

export function isUrlAttribute(name: string) {
  return ["href", "xlink:href", "src", "poster", "cite", "action", "formaction"].includes(name);
}

export function normalizeEditableDocument(doc: Document) {
  cleanupEmptyInlineElements(doc);
  doc.body.normalize();
}

export function cleanupEmptyInlineElements(doc: Document) {
  Array.from(doc.body.querySelectorAll(inlineTags.join(",")))
    .sort((left, right) => descendantDepth(right) - descendantDepth(left))
    .forEach((element) => {
      if (element.attributes.length > 0) return;
      if (element.textContent?.trim()) return;
      if (element.querySelector("img,svg,video,audio,canvas,input,textarea,select,br")) return;
      element.remove();
    });
}

export function execNativeCommand(doc: Document, command: string, value?: string) {
  doc.defaultView?.focus();
  return doc.execCommand(command, false, value);
}

export function ensureSelectionOnTarget(doc: Document, targetElement?: Element | null) {
  if (!targetElement || targetElement === doc.body) return;
  const selection = doc.getSelection();
  if (!selection) return;
  if (selection.rangeCount > 0 && selection.toString().trim()) return;
  const range = doc.createRange();
  range.selectNodeContents(targetElement);
  selection.removeAllRanges();
  selection.addRange(range);
}

export function unwrapElement(element: Element) {
  const parent = element.parentNode;
  if (!parent) return;
  while (element.firstChild) parent.insertBefore(element.firstChild, element);
  parent.removeChild(element);
}

export function replaceLinkWithTextAndSelect(doc: Document, link: HTMLAnchorElement) {
  const parent = link.parentNode;
  if (!parent) return;
  const textNode = replaceElementWithText(link);
  const selection = doc.getSelection();
  if (selection && textNode.isConnected) selectNodeRange(doc, selection, textNode, textNode);
}

export function replaceElementWithText(element: Element) {
  const textNode = element.ownerDocument.createTextNode(element.textContent ?? "");
  element.parentNode?.replaceChild(textNode, element);
  return textNode;
}

export function copyPresentation(source: HTMLElement, target: HTMLElement) {
  const style = readPresentationStyle(source);
  if (style) applyPresentationStyleToElement(target, style);
}

export function isElementNode(node: unknown): node is Element {
  return Boolean(node && typeof node === "object" && (node as Node).nodeType === 1 && "tagName" in node);
}

export function isHtmlElement(node: unknown): node is HTMLElement {
  return Boolean(isElementNode(node) && "style" in node);
}
