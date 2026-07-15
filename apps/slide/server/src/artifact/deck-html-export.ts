import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, normalize, sep } from "node:path";
import {
  deckSlideDisplayName,
  type DeckManifest,
  type SlideArtifact,
} from "@ai-slide/shared";
import { ensureProjectDirs, projectWorkspaceRoot } from "../local/paths.js";

const htmlMimeType = "text/html";

type DeckHtmlExportSlide = {
  bodyAttrs: string;
  bodyHtml: string;
  headHtml: string;
  id: string;
  label: string;
};

type DeckHtmlAssetCollector = {
  assets: Map<string, string>;
  deckRoot: string;
};

export function writeDeckHtmlExportBundle(input: {
  artifact: SlideArtifact;
  manifest: DeckManifest;
  projectId: string;
  projectTitle: string;
}) {
  const exportsRoot = join(ensureProjectDirs(input.projectId), "exports");
  mkdirSync(exportsRoot, { recursive: true });
  const exportDirName = uniqueExportDirectoryName(exportsRoot, input.projectTitle || input.manifest.title || "slides");
  const exportDir = join(exportsRoot, exportDirName);
  const exported = writeDeckHtmlExportToDirectory(input, exportDir);
  return {
    path: exported.absolutePath,
    absolutePath: exported.absolutePath,
    exportsDir: exportsRoot,
    fileName: `${exportDirName}/index.html`,
    mimeType: htmlMimeType,
    sizeBytes: exported.sizeBytes,
  };
}

export function writeDeckHtmlExportToDirectory(input: {
  artifact: SlideArtifact;
  manifest: DeckManifest;
  projectId: string;
  projectTitle: string;
}, exportDir: string) {
  mkdirSync(exportDir, { recursive: true });

  const deckRoot = join(projectWorkspaceRoot(input.projectId), input.artifact.fileRef);
  const assetCollector = createDeckHtmlAssetCollector(deckRoot);
  const slideExports = input.manifest.slides.map((slide, index) => {
    const html = readFileSync(resolveDeckSlidePath(input.projectId, input.artifact, slide.file), "utf8");
    return parseSlideHtmlForExport(html, {
      assetCollector,
      deckRoot,
      fallbackTitle: deckSlideDisplayName(slide, index),
      id: slide.id,
    });
  });
  copyDeckHtmlExportAssets(assetCollector, exportDir);
  const html = renderDeckHtmlExport({
    canvas: input.manifest.canvas,
    slides: slideExports,
    title: input.projectTitle || input.manifest.title || "Untitled Presentation",
  });
  const absolutePath = join(exportDir, "index.html");
  writeFileSync(absolutePath, html, "utf8");
  return {
    absolutePath,
    sizeBytes: Buffer.byteLength(html, "utf8"),
  };
}

function uniqueExportDirectoryName(exportsDir: string, requestedName: string) {
  const parsed = safeFileStem(requestedName || "slides", "slides");
  let candidate = parsed;
  let index = 2;
  while (existsSync(join(exportsDir, candidate))) {
    candidate = `${parsed}-${index}`;
    index += 1;
  }
  return candidate;
}

function createDeckHtmlAssetCollector(deckRoot: string): DeckHtmlAssetCollector {
  return {
    assets: new Map(),
    deckRoot,
  };
}

function copyDeckHtmlExportAssets(collector: DeckHtmlAssetCollector, exportDir: string) {
  for (const [assetPath, sourcePath] of collector.assets) {
    const targetPath = join(exportDir, assetPath);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath);
  }
}

function parseSlideHtmlForExport(html: string, input: { assetCollector: DeckHtmlAssetCollector; deckRoot: string; fallbackTitle: string; id: string }): DeckHtmlExportSlide {
  const bodyMatch = html.match(/<body\b([^>]*)>([\s\S]*?)<\/body>/i);
  const headMatch = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  return {
    bodyAttrs: bodyMatch?.[1] ? normalizeSlideBodyAttrs(bodyMatch[1], input.assetCollector) : "",
    bodyHtml: rewriteSlideAssetReferences(bodyMatch?.[2] ?? html, input.assetCollector),
    headHtml: slideHeadStylesForExport(headMatch?.[1] ?? "", input.deckRoot, input.assetCollector),
    id: input.id,
    label: input.fallbackTitle,
  };
}

function slideHeadStylesForExport(headHtml: string, deckRoot: string, assetCollector: DeckHtmlAssetCollector) {
  const fragments = [
    ...Array.from(headHtml.matchAll(/<link\b[^>]*>/gi)).map((match) => slideExportLinkOrInlineStyle(match[0], deckRoot, assetCollector)).filter(Boolean),
    ...Array.from(headHtml.matchAll(/<style\b[^>]*>[\s\S]*?<\/style>/gi)).map((match) => rewriteSlideStyleTag(match[0], assetCollector)),
  ];
  return rewriteSlideAssetReferences(fragments.join("\n"), assetCollector);
}

function slideExportLinkOrInlineStyle(value: string, deckRoot: string, assetCollector: DeckHtmlAssetCollector) {
  const rel = value.match(/\brel\s*=\s*(["']?)([^"'\s>]+)\1/i)?.[2]?.toLowerCase() ?? "";
  if (!["preconnect", "preload", "stylesheet"].includes(rel)) return "";
  if (rel !== "stylesheet") return value;
  const href = value.match(/\bhref\s*=\s*(["'])([^"']+)\1/i)?.[2] ?? "";
  const exportHref = exportAssetUrl(href);
  if (!exportHref.startsWith("assets/") || extname(exportHref).toLowerCase() !== ".css") return value;
  const cssPath = join(deckRoot, exportHref);
  if (!existsSync(cssPath)) return value;
  const css = readFileSync(cssPath, "utf8");
  return `<style data-ai-slide-export-source="${escapeHtmlAttr(exportHref)}">${rewriteSlideCssForExport(css, assetCollector, assetBaseDirForExportPath(exportHref))}</style>`;
}

function rewriteSlideStyleTag(value: string, assetCollector: DeckHtmlAssetCollector) {
  return value.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_match, open: string, css: string, close: string) => {
    return `${open}${rewriteSlideCssForExport(css, assetCollector)}${close}`;
  });
}

function rewriteSlideCssForExport(css: string, assetCollector: DeckHtmlAssetCollector, assetBaseDir = "") {
  return rewriteSlideAssetReferences(css, assetCollector, assetBaseDir)
    .replace(/:root\b/g, ":host")
    .replace(/\bhtml\b/g, ":host")
    .replace(/\bbody\b/g, ".ai-slide-body");
}

function normalizeSlideBodyAttrs(attrs: string, assetCollector?: DeckHtmlAssetCollector) {
  const style = attrs.match(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i)?.[2]?.trim();
  if (!style) return "";
  return ` style="${escapeHtmlAttr(rewriteSlideAssetReferences(style, assetCollector))}"`;
}

function rewriteSlideAssetReferences(value: string, assetCollector?: DeckHtmlAssetCollector, assetBaseDir = "") {
  return value
    .replace(/((?:src|href|poster)\s*=\s*)(["'])([^"']+)\2/gi, (_match, prefix: string, quote: string, url: string) => {
      return `${prefix}${quote}${escapeHtmlAttr(exportAssetUrl(url, assetCollector, assetBaseDir))}${quote}`;
    })
    .replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (_match, quote: string, url: string) => {
      return `url(${quote}${exportAssetUrl(url, assetCollector, assetBaseDir)}${quote})`;
    });
}

function exportAssetUrl(value: string, assetCollector?: DeckHtmlAssetCollector, assetBaseDir = "") {
  const trimmed = value.trim();
  if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(trimmed)) return trimmed;
  const normalized = trimmed.replace(/\\/g, "/");
  for (const prefix of ["../assets/", "./assets/", "assets/"]) {
    if (normalized.startsWith(prefix)) {
      const exportPath = `assets/${normalized.slice(prefix.length)}`;
      collectDeckHtmlAsset(assetCollector, exportPath);
      return exportPath;
    }
  }
  const resolvedFromAsset = resolveAssetRelativeToBase(normalized, assetBaseDir);
  if (resolvedFromAsset) {
    const exportPath = `assets/${resolvedFromAsset}`;
    collectDeckHtmlAsset(assetCollector, exportPath);
    return exportPath;
  }
  return trimmed;
}

function assetBaseDirForExportPath(exportPath: string) {
  if (!exportPath.startsWith("assets/")) return "";
  const base = dirname(exportPath.slice("assets/".length)).split(sep).join("/");
  return base === "." ? "." : base;
}

function resolveAssetRelativeToBase(value: string, assetBaseDir: string) {
  if (!assetBaseDir && !value.startsWith("./") && !value.startsWith("../")) return "";
  const resolved = normalize(join(assetBaseDir || ".", value));
  if (!resolved || resolved === "." || resolved.startsWith("..") || resolved.includes(`..${sep}`)) return "";
  return resolved.split(sep).join("/");
}

function collectDeckHtmlAsset(collector: DeckHtmlAssetCollector | undefined, exportPath: string) {
  if (!collector || extname(exportPath).toLowerCase() === ".css") return;
  if (!exportPath.startsWith("assets/")) return;
  const relativePath = normalize(exportPath.slice("assets/".length));
  if (!relativePath || relativePath.startsWith("..") || relativePath.includes(`..${sep}`)) return;
  const sourcePath = join(collector.deckRoot, "assets", relativePath);
  if (!existsSync(sourcePath)) return;
  const info = statSync(sourcePath);
  if (!info.isFile()) return;
  collector.assets.set(`assets/${relativePath.split(sep).join("/")}`, sourcePath);
}

function renderDeckHtmlExport(input: {
  canvas: { height: number; width: number };
  slides: DeckHtmlExportSlide[];
  title: string;
}) {
  const slides = input.slides.map((slide) => renderDeckHtmlExportSlide(slide)).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(input.title)}</title>
  <style>
    :root {
      --deck-width: ${input.canvas.width}px;
      --deck-height: ${input.canvas.height}px;
      --stage-bg: #000;
    }

    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      overflow: hidden;
      background: var(--stage-bg);
      color: #fff;
      font-family: Lexend, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .deck-viewport {
      position: fixed;
      inset: 0;
      overflow: hidden;
      background: var(--stage-bg);
    }

    .deck-stage {
      position: absolute;
      left: 0;
      top: 0;
      width: var(--deck-width);
      height: var(--deck-height);
      overflow: hidden;
      transform-origin: 0 0;
      background: #fff;
    }

    .slide {
      position: absolute;
      inset: 0;
      width: var(--deck-width);
      height: var(--deck-height);
      overflow: hidden;
      display: block;
      visibility: hidden;
      opacity: 0;
      pointer-events: none;
      background: #fff;
    }

    .slide.active,
    .slide.visible {
      visibility: visible;
      opacity: 1;
      pointer-events: auto;
      z-index: 1;
    }

    .deck-controls {
      position: fixed;
      left: 50%;
      bottom: 22px;
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 4px;
      border-radius: 999px;
      background: rgba(0, 0, 0, 0.82);
      color: #fff;
      transform: translateX(-50%);
      opacity: 0.88;
      transition: opacity 180ms ease;
      user-select: none;
    }

    .deck-controls:hover { opacity: 1; }
    .deck-button {
      appearance: none;
      display: inline-grid;
      width: 30px;
      height: 30px;
      place-items: center;
      border: 0;
      border-radius: 999px;
      background: transparent;
      color: rgba(255, 255, 255, 0.78);
      cursor: pointer;
      font: inherit;
    }
    .deck-button:hover {
      background: rgba(255, 255, 255, 0.13);
      color: #fff;
    }
    .deck-count {
      min-width: 54px;
      padding: 0 8px;
      color: rgba(255, 255, 255, 0.9);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      text-align: center;
    }

    @page {
      size: ${input.canvas.width}px ${input.canvas.height}px;
      margin: 0;
    }

    @media print {
      html, body {
        width: ${input.canvas.width}px;
        height: auto;
        overflow: visible;
        background: #fff;
      }
      .deck-viewport,
      .deck-stage {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        transform: none !important;
        background: none;
      }
      .slide {
        position: relative;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        width: ${input.canvas.width}px;
        height: ${input.canvas.height}px;
        break-after: page;
        page-break-after: always;
      }
      .slide:last-child {
        break-after: auto;
        page-break-after: auto;
      }
      .deck-controls { display: none !important; }
    }

    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        transition-duration: 0.2s !important;
      }
    }
  </style>
</head>
<body>
  <div class="deck-viewport">
    <main class="deck-stage" id="deckStage" aria-live="polite">
${slides}
    </main>
  </div>
  <nav class="deck-controls" aria-label="Slide navigation">
    <button class="deck-button" type="button" data-prev aria-label="Previous slide">&lsaquo;</button>
    <div class="deck-count"><span data-current>1</span> / <span data-total>${input.slides.length}</span></div>
    <button class="deck-button" type="button" data-next aria-label="Next slide">&rsaquo;</button>
  </nav>
  <script>
    (() => {
      const stage = document.getElementById("deckStage");
      const slides = Array.from(document.querySelectorAll(".slide"));
      const current = document.querySelector("[data-current]");
      const total = document.querySelector("[data-total]");
      let index = 0;
      for (const slide of slides) {
        const template = slide.querySelector("template[data-slide-template]");
        if (!template) continue;
        const shadow = slide.attachShadow({ mode: "open" });
        shadow.append(template.content.cloneNode(true));
        template.remove();
      }
      function scaleStage() {
        const factor = Math.min(window.innerWidth / ${input.canvas.width}, window.innerHeight / ${input.canvas.height});
        const x = (window.innerWidth - ${input.canvas.width} * factor) / 2;
        const y = (window.innerHeight - ${input.canvas.height} * factor) / 2;
        stage.style.transform = \`translate(\${x}px, \${y}px) scale(\${factor})\`;
      }
      function setInnerState(slide, active) {
        const innerSlide = slide.shadowRoot?.querySelector(".slide");
        if (!innerSlide) return;
        innerSlide.classList.toggle("active", active);
        innerSlide.classList.toggle("visible", active);
      }
      function showSlide(nextIndex) {
        index = Math.max(0, Math.min(nextIndex, slides.length - 1));
        slides.forEach((slide, slideIndex) => {
          const active = slideIndex === index;
          slide.classList.toggle("active", active);
          slide.classList.toggle("visible", active);
          setInnerState(slide, active);
        });
        if (current) current.textContent = String(index + 1);
        if (total) total.textContent = String(slides.length);
        history.replaceState(null, "", \`#slide-\${index + 1}\`);
      }
      function go(delta) { showSlide(index + delta); }
      document.querySelector("[data-prev]")?.addEventListener("click", () => go(-1));
      document.querySelector("[data-next]")?.addEventListener("click", () => go(1));
      window.addEventListener("resize", scaleStage);
      window.addEventListener("keydown", (event) => {
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
        if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
          event.preventDefault();
          go(1);
        } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
          event.preventDefault();
          go(-1);
        } else if (event.key === "Home") {
          event.preventDefault();
          showSlide(0);
        } else if (event.key === "End") {
          event.preventDefault();
          showSlide(slides.length - 1);
        }
      });
      let touchStartX = 0;
      window.addEventListener("touchstart", (event) => {
        touchStartX = event.changedTouches[0]?.clientX ?? 0;
      }, { passive: true });
      window.addEventListener("touchend", (event) => {
        const endX = event.changedTouches[0]?.clientX ?? touchStartX;
        const delta = endX - touchStartX;
        if (Math.abs(delta) > 48) go(delta < 0 ? 1 : -1);
      }, { passive: true });
      let wheelLocked = false;
      window.addEventListener("wheel", (event) => {
        if (wheelLocked || Math.abs(event.deltaY) < 40) return;
        wheelLocked = true;
        go(event.deltaY > 0 ? 1 : -1);
        window.setTimeout(() => {
          wheelLocked = false;
        }, 450);
      }, { passive: true });
      window.addEventListener("beforeprint", () => {
        slides.forEach((slide) => setInnerState(slide, true));
      });
      window.addEventListener("afterprint", () => {
        showSlide(index);
      });
      scaleStage();
      const hashMatch = window.location.hash.match(/slide-(\\d+)/);
      showSlide(hashMatch ? Number(hashMatch[1]) - 1 : 0);
    })();
  </script>
</body>
</html>`;
}

function renderDeckHtmlExportSlide(slide: DeckHtmlExportSlide) {
  return `      <section class="slide" data-slide-id="${escapeHtmlAttr(slide.id)}" aria-label="${escapeHtmlAttr(slide.label)}">
        <template data-slide-template>
          <style>
            :host {
              display: block;
              width: 100%;
              height: 100%;
              overflow: hidden;
              background: #fff;
            }

            :host *,
            :host *::before,
            :host *::after {
              box-sizing: border-box;
            }

            .ai-slide-body {
              width: 100%;
              height: 100%;
              margin: 0;
              overflow: hidden;
              background: #fff;
            }
          </style>
          ${slide.headHtml}
          <div class="ai-slide-body"${slide.bodyAttrs}>${slide.bodyHtml}</div>
        </template>
      </section>`;
}

function resolveDeckSlidePath(projectId: string, artifact: SlideArtifact, file: string) {
  const deckRoot = join(projectWorkspaceRoot(projectId), artifact.fileRef);
  const normalizedFile = normalize(file);
  if (normalizedFile.startsWith("..") || normalizedFile.includes(`${sep}..${sep}`) || normalizedFile.startsWith(sep)) {
    throw new Error("Invalid slide path");
  }
  return join(deckRoot, normalizedFile);
}

function safeFileStem(value: string, fallback: string) {
  return value
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/\.+$/g, "")
    .slice(0, 80) || fallback;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeHtmlAttr(value: string) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}
