# AI Slide Local Debug App

This directory is the Tutti App Center Load unpacked wrapper for `apps/slide`.

Tutti may load either `apps/slide` or this `.tutti/dev-app` directory. When `apps/slide` is selected, the daemon resolves this wrapper before the source manifest in `apps/slide/tutti.app.json`.

Runtime:

- `bootstrap.sh` reads `TUTTI_APP_HOST` and the required `TUTTI_APP_PORT`.
- The source server starts with managed Node through `apps/slide/server/node_modules/tsx/dist/cli.mjs watch apps/slide/server/src/main.ts`.
- Durable data maps to `TUTTI_APP_DATA_DIR` through `AI_SLIDE_HOME`.
- Runtime scratch data maps to `TUTTI_APP_RUNTIME_DIR` through `AI_SLIDE_RUNTIME_ROOT`.
- Backend logs map to `TUTTI_APP_LOG_DIR` through `AI_SLIDE_LOG_ROOT`.
- OfficeCLI reusable binaries use `TUTTI_APP_TOOLCHAIN_ROOT` through `AI_OFFICE_TOOLCHAIN_ROOT`.
- Template source and generated assets default to `apps/slide/templates/source` and `apps/slide/templates/generated`.
- The app serves `apps/slide/web/dist` through `AI_SLIDE_WEB_DIST`.

Development:

- Server source edits hot-restart through `tsx watch`.
- Frontend source edits require rebuilding `apps/slide/web/dist`; reload the app webview after the build.
- Changes to this directory's `tutti.app.json`, `tutti.cli.json`, `bootstrap.sh`, `icon.svg`, locale files, or this guide require App Center's Reload action.
- Keep this wrapper small. Do not copy the full app source tree into `.tutti/dev-app`.

Validation:

- Run the local debug checker against `apps/slide` after editing this wrapper.
- Keep `tutti.cli.json` aligned with `apps/slide/tutti.cli.json` when CLI commands change.
- Keep localized manifest metadata under `locales/<locale>/manifest.json`.
