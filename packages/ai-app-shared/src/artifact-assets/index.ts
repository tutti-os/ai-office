export type AssetUrlMapper = (url: string) => string | null;

const urlAttributeSelectors: Array<{ selector: string; attribute: string }> = [
  { selector: "img[src]", attribute: "src" },
  { selector: "source[src]", attribute: "src" },
  { selector: "video[src]", attribute: "src" },
  { selector: "video[poster]", attribute: "poster" },
  { selector: "audio[src]", attribute: "src" },
  { selector: "track[src]", attribute: "src" },
  { selector: "script[src]", attribute: "src" },
  { selector: "link[href]", attribute: "href" },
  { selector: "embed[src]", attribute: "src" },
  { selector: "object[data]", attribute: "data" },
  { selector: "image[href]", attribute: "href" },
  { selector: "image[xlink\\:href]", attribute: "xlink:href" },
];

export function rewriteHtmlAssetReferences(html: string, mapUrl: AssetUrlMapper) {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(html || emptyHtmlDocument(), "text/html");
  rewriteAssetReferencesInElement(parsed.documentElement, mapUrl);
  const doctype = html.match(/<!doctype\s+html[^>]*>/i)?.[0] ?? "<!DOCTYPE html>";
  return `${doctype}\n${parsed.documentElement.outerHTML}`;
}

export function rewriteAssetReferencesInElement(root: ParentNode, mapUrl: AssetUrlMapper) {
  for (const { selector, attribute } of urlAttributeSelectors) {
    root.querySelectorAll<Element>(selector).forEach((element) => rewriteAttributeUrl(element, attribute, mapUrl));
  }
  root.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
    const style = element.getAttribute("style");
    if (!style) return;
    const nextStyle = rewriteCssUrlReferences(style, mapUrl);
    if (nextStyle !== style) element.setAttribute("style", nextStyle);
  });
  root.querySelectorAll<HTMLStyleElement>("style").forEach((styleElement) => {
    const css = styleElement.textContent ?? "";
    const nextCss = rewriteCssUrlReferences(css, mapUrl);
    if (nextCss !== css) styleElement.textContent = nextCss;
  });
}

export function assetPathFromRelativeUrl(url: string, prefixes: string[]) {
  const normalized = url.trim();
  if (!normalized || hasSchemeOrAbsoluteUrl(normalized) || normalized.startsWith("#")) return null;
  const withoutQuery = normalized.split(/[?#]/, 1)[0] ?? "";
  for (const prefix of prefixes) {
    if (withoutQuery.startsWith(prefix)) return safeAssetPath(withoutQuery.slice(prefix.length));
  }
  return null;
}

export function assetPathFromRouteUrl(url: string, routePrefix: string) {
  const normalized = url.trim();
  const path = pathPart(normalized);
  const encodedPrefix = routePrefix.endsWith("/") ? routePrefix : `${routePrefix}/`;
  if (!path.startsWith(encodedPrefix)) return null;
  return safeAssetPath(decodeURIComponent(path.slice(encodedPrefix.length)));
}

export function encodeAssetPath(assetPath: string) {
  return assetPath.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

function rewriteAttributeUrl(element: Element, attribute: string, mapUrl: AssetUrlMapper) {
  const value = element.getAttribute(attribute);
  if (!value) return;
  const nextValue = mapUrl(value);
  if (nextValue && nextValue !== value) element.setAttribute(attribute, nextValue);
}

function rewriteCssUrlReferences(css: string, mapUrl: AssetUrlMapper) {
  return css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (match, quote: string, rawUrl: string) => {
    const nextUrl = mapUrl(rawUrl.trim());
    if (!nextUrl) return match;
    const safeQuote = quote || "\"";
    return `url(${safeQuote}${nextUrl.replaceAll(safeQuote, `\\${safeQuote}`)}${safeQuote})`;
  });
}

function safeAssetPath(value: string | null | undefined) {
  const trimmed = (value ?? "").trim().replace(/^\/+/, "");
  if (!trimmed || trimmed.split("/").some((part) => !part || part === "." || part === "..")) return null;
  return trimmed;
}

function hasSchemeOrAbsoluteUrl(value: string) {
  return /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith("//") || value.startsWith("/");
}

function pathPart(value: string) {
  try {
    return new URL(value, "http://asset.local").pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

function emptyHtmlDocument() {
  return "<!DOCTYPE html><html><head></head><body></body></html>";
}
