#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
server_entry="$script_dir/server/dist/apps/slide/server/src/main.js"
web_dist="$script_dir/web/dist"

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Slide is not built yet. Run: pnpm package:slide-tutti" >&2
  exit 1
fi

export HOST="${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="${TUTTI_APP_PORT:-8791}"
export AI_SLIDE_APP_VERSION="0.1.0"
export AI_SLIDE_WEB_DIST="$web_dist"
export AI_SLIDE_HOME="${TUTTI_APP_DATA_DIR:-$script_dir/.ai-slide-dev}"
export AI_SLIDE_RUNTIME_ROOT="${TUTTI_APP_RUNTIME_DIR:-$AI_SLIDE_HOME/.runtime}"
export AI_SLIDE_LOG_ROOT="${TUTTI_APP_LOG_DIR:-$AI_SLIDE_RUNTIME_ROOT/logs}"
export AI_SLIDE_WORKSPACE_ROOT="${TUTTI_WORKSPACE_ROOT:-$AI_SLIDE_HOME}"
export AI_SLIDE_TEMPLATE_ROOT="${AI_SLIDE_TEMPLATE_ROOT:-$script_dir/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$script_dir/templates/generated/templates}"

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SLIDE_SERVER_URL="$base_url"

node_bin="${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SLIDE_HOME" "$AI_SLIDE_RUNTIME_ROOT" "$AI_SLIDE_LOG_ROOT"

exec "$node_bin" "$server_entry"
