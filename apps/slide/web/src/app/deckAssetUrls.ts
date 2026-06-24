import {
  assetPathFromRelativeUrl,
  encodeAssetPath,
  rewriteAssetReferencesInElement,
} from "@ai-app/shared/artifact-assets";

export function projectAssetUrl(projectId: string, fileRef: string, filePath: string, revision?: number) {
  const path = `/local-assets/projects/${encodeURIComponent(projectId)}/${[fileRef, ...filePath.split("/")].map(encodeURIComponent).join("/")}`;
  return revision ? `${path}?v=${encodeURIComponent(String(revision))}` : path;
}

export function renderDeckSlideAssetReferences(root: ParentNode, options: { fileRef: string; projectId: string }) {
  rewriteAssetReferencesInElement(root, (url) => {
    const assetPath = assetPathFromRelativeUrl(url, ["../assets/", "./assets/", "assets/"]);
    return assetPath ? projectAssetUrl(options.projectId, options.fileRef, `assets/${assetPath}`) : null;
  });
}

export function restoreDeckSlideAssetReferences(root: ParentNode) {
  rewriteAssetReferencesInElement(root, (url) => {
    const path = localAssetRoutePath(url);
    const match = path.match(/^\/local-assets\/projects\/[^/]+\/[^/]+\/assets\/(.+)$/);
    return match?.[1] ? `../assets/${encodeAssetPath(decodeURIComponent(match[1]))}` : null;
  });
}

function localAssetRoutePath(value: string) {
  try {
    return new URL(value, window.location.href).pathname;
  } catch {
    return value.split(/[?#]/, 1)[0] ?? "";
  }
}
