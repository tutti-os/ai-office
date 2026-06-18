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
  plugins: [officePreviewDevAssets(), react(), tailwindcss()],
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

function officePreviewDevAssets(): Plugin {
  return {
    name: "ai-doc-office-preview-dev-assets",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/office-preview-dev/ooxml-convert", (request: IncomingMessage, response: ServerResponse, next) => {
        if (!request.url) return next();
        const pathname = request.url.split("?")[0] ?? "";
        const filePath = resolve(officePreviewAssetsRoot, `.${pathname}`);
        const relativePath = relative(officePreviewAssetsRoot, filePath);
        if (relativePath.startsWith("..") || normalize(relativePath).startsWith("..")) return next();
        if (!existsSync(filePath)) return next();
        const ext = extname(filePath);
        if (ext === ".js") response.setHeader("content-type", "application/javascript; charset=utf-8");
        if (ext === ".wasm") response.setHeader("content-type", "application/wasm");
        createReadStream(filePath).pipe(response);
      });
    },
  };
}
