import { createReadStream, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, normalize, relative, resolve } from "node:path";
import { defineConfig } from "vite";
import type { Plugin, ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const officePreviewAssetsRoot = resolve(
  import.meta.dirname,
  "node_modules/@tutti-os/office-preview/dist/ooxml-convert",
);

export default defineConfig({
  plugins: [officeAssetDevRoutes(), react(), tailwindcss()],
  build: {
    minify: false,
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8790",
        ws: true,
      },
      "/local-assets": "http://127.0.0.1:8790",
    },
  },
});

function officeAssetDevRoutes(): Plugin {
  return {
    name: "ai-doc-office-dev-assets",
    configureServer(server: ViteDevServer) {
      serveAssetRoot(server, "/office-preview-dev/ooxml-convert", officePreviewAssetsRoot);
    },
  };
}

function serveAssetRoot(server: ViteDevServer, routePrefix: string, assetRoot: string) {
  server.middlewares.use(routePrefix, (request: IncomingMessage, response: ServerResponse, next) => {
    if (!request.url || !assetRoot) return next();
    const pathname = request.url.split("?")[0] ?? "";
    const filePath = resolve(assetRoot, `.${pathname}`);
    const relativePath = relative(assetRoot, filePath);
    if (relativePath.startsWith("..") || normalize(relativePath).startsWith("..")) return next();
    if (!existsSync(filePath)) return next();
    const ext = extname(filePath);
    if (ext === ".js") response.setHeader("content-type", "application/javascript; charset=utf-8");
    if (ext === ".wasm") response.setHeader("content-type", "application/wasm");
    createReadStream(filePath).pipe(response);
  });
}
