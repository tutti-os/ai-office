# AI Doc Local Debug App

This directory is the Tutti App Center Load unpacked wrapper for `apps/doc`.

Tutti may load either `apps/doc` or this `.tutti/dev-app` directory. When `apps/doc` is selected, the daemon resolves this wrapper before the source manifest in `apps/doc/tutti.app.json`.

Runtime:

- `bootstrap.sh` reads `TUTTI_APP_HOST` and the required `TUTTI_APP_PORT`.
- Tutti's assigned port runs the Vite development server and its HMR client.
- The source server starts on an ephemeral loopback port with managed Node through `apps/doc/server/node_modules/tsx/dist/cli.mjs watch apps/doc/server/src/main.ts`.
- Vite proxies `/api`, `/tutti`, and `/local-assets` to the source server through `AI_DOC_DEV_BACKEND_ORIGIN`.
- Durable data maps to `TUTTI_APP_DATA_DIR` through `AI_DOC_HOME`.
- Runtime scratch data maps to `TUTTI_APP_RUNTIME_DIR` through `AI_DOC_RUNTIME_ROOT`.
- Backend logs map to `TUTTI_APP_LOG_DIR` through `AI_DOC_LOG_ROOT`.
- OfficeCLI reusable binaries use `TUTTI_APP_TOOLCHAIN_ROOT` through `AI_OFFICE_TOOLCHAIN_ROOT`.

Development:

- Server source edits hot-restart through `tsx watch`.
- Frontend source edits hot-update through Vite. No manual web build or app reload is required.
- Changes to this directory's `tutti.app.json`, `tutti.cli.json`, `bootstrap.sh`, `icon.svg`, locale files, or this guide require App Center's Reload action.
- Keep this wrapper small. Do not copy the full app source tree into `.tutti/dev-app`.

Validation:

- Run the local debug checker against `apps/doc` after editing this wrapper.
- Keep `tutti.cli.json` aligned with `apps/doc/tutti.cli.json` when CLI commands change.
- Keep localized manifest metadata under `locales/<locale>/manifest.json`.
