#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="${TUTTI_APP_PACKAGE_DIR:-$script_dir}"
server_entry="$package_dir/server/dist/apps/sheet/server/src/main.js"
packaged_server_entry="$package_dir/server/server.js"
web_dist="$script_dir/web/dist"

if [ -f "$packaged_server_entry" ]; then
  server_entry="$packaged_server_entry"
  web_dist="$package_dir/dist"
fi

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Sheet is not built yet. Run: pnpm package:sheet-tutti" >&2
  exit 1
fi

export HOST="${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="${TUTTI_APP_PORT:-8792}"
export AI_SHEET_APP_VERSION="0.1.0"
export AI_SHEET_WEB_DIST="$web_dist"
export AI_SHEET_HOME="${TUTTI_APP_DATA_DIR:-$script_dir/.ai-sheet-dev}"
export AI_SHEET_RUNTIME_ROOT="${TUTTI_APP_RUNTIME_DIR:-$AI_SHEET_HOME/.runtime}"
export AI_SHEET_LOG_ROOT="${TUTTI_APP_LOG_DIR:-$AI_SHEET_RUNTIME_ROOT/logs}"
export AI_SHEET_WORKSPACE_ROOT="${TUTTI_WORKSPACE_ROOT:-$AI_SHEET_HOME}"

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SHEET_SERVER_URL="$base_url"

node_bin="${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SHEET_HOME" "$AI_SHEET_RUNTIME_ROOT" "$AI_SHEET_LOG_ROOT"

exec "$node_bin" "$server_entry"
