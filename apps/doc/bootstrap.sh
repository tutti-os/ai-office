#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
server_entry="$script_dir/server/dist/apps/doc/server/src/main.js"
web_dist="$script_dir/web/dist"

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Doc is not built yet. Run: pnpm package:doc-nextop" >&2
  exit 1
fi

export HOST="${NEXTOP_APP_HOST:-127.0.0.1}"
export PORT="${NEXTOP_APP_PORT:-8790}"
export AI_DOC_APP_VERSION="0.1.0"
export AI_DOC_WEB_DIST="$web_dist"
export AI_DOC_HOME="${NEXTOP_APP_DATA_DIR:-$script_dir/.ai-doc-dev}"
export AI_DOC_WORKSPACE_ROOT="${NEXTOP_WORKSPACE_ROOT:-$AI_DOC_HOME}"
export AI_DOC_TEMPLATE_ROOT="${AI_DOC_TEMPLATE_ROOT:-$AI_DOC_HOME/templates/genspark}"

base_url="${NEXTOP_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="${NEXTOP_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME"

exec "$node_bin" "$server_entry"
