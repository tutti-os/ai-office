#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
server_entry="$script_dir/apps/server/dist/apps/server/src/main.js"
web_dist="$script_dir/apps/web/dist"

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Document is not built yet. Run: pnpm package:nextop" >&2
  exit 1
fi

export HOST="${NEXTOP_APP_HOST:-127.0.0.1}"
export PORT="${NEXTOP_APP_PORT:-8790}"
export AI_DOCUMENT_APP_VERSION="0.1.0"
export AI_DOCUMENT_WEB_DIST="$web_dist"
export AI_DOCUMENT_HOME="${NEXTOP_APP_DATA_DIR:-$script_dir/.ai-document-dev}"
export AI_DOCUMENT_WORKSPACE_ROOT="${NEXTOP_WORKSPACE_ROOT:-$AI_DOCUMENT_HOME}"

base_url="${NEXTOP_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOCUMENT_SERVER_URL="$base_url"

node_bin="${NEXTOP_APP_NODE:-node}"
mkdir -p "$AI_DOCUMENT_HOME"

exec "$node_bin" "$server_entry"
