import {
  assetPathFromRelativeUrl,
  encodeAssetPath,
  rewriteHtmlAssetReferences,
  rewriteAssetReferencesInElement,
} from "@ai-app/shared/artifact-assets";

export function renderHtmlProjectAssetReferences(html: string, projectId: string | null) {
  if (!projectId) return html;
  return rewriteHtmlAssetReferences(html, (url) => {
    const assetPath = assetPathFromRelativeUrl(url, ["./assets/", "assets/"]);
    return assetPath ? htmlProjectAssetRuntimeUrl(projectId, assetPath) : null;
  });
}

export function renderHtmlProjectFragmentAssetReferences(html: string, projectId: string | null, container: "body" | "head" = "body") {
  if (!projectId) return html;
  return rewriteHtmlFragmentAssetReferences(
    html,
    (url) => {
      const assetPath = assetPathFromRelativeUrl(url, ["./assets/", "assets/"]);
      return assetPath ? htmlProjectAssetRuntimeUrl(projectId, assetPath) : null;
    },
    container,
  );
}

export function htmlProjectAssetRuntimeUrl(projectId: string, assetPath: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeAssetPath(assetPath)}`;
}

export function restoreHtmlProjectAssetReferences(html: string) {
  return rewriteHtmlAssetReferences(html, restoreProjectAssetUrl);
}

export function restoreHtmlProjectFragmentAssetReferences(html: string, container: "body" | "head" = "body") {
  return rewriteHtmlFragmentAssetReferences(html, restoreProjectAssetUrl, container);
}

export function restoreProjectAssetUrl(url: string) {
  const normalized = url.trim();
  const path = pathPart(normalized);
  const match = path.match(/^\/api\/projects\/[^/]+\/assets\/(.+)$/);
  if (match?.[1]) {
    const assetPath = decodeURIComponent(match[1]);
    return assetPath ? `./assets/${assetPath}` : null;
  }
  return null;
}

function pathPart(value: string) {
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}

function rewriteHtmlFragmentAssetReferences(html: string, mapUrl: (url: string) => string | null, container: "body" | "head") {
  const parser = new DOMParser();
  const parsed = parser.parseFromString(`<!DOCTYPE html><html><head></head><body></body></html>`, "text/html");
  const target = container === "head" ? parsed.head : parsed.body;
  target.innerHTML = html;
  rewriteAssetReferencesInElement(target, mapUrl);
  return target.innerHTML;
}
