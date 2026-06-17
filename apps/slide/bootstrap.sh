#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
server_entry="$script_dir/server/dist/apps/slide/server/src/main.js"
web_dist="$script_dir/web/dist"

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Slide is not built yet. Run: pnpm package:slide-nextop" >&2
  exit 1
fi

export HOST="${NEXTOP_APP_HOST:-127.0.0.1}"
export PORT="${NEXTOP_APP_PORT:-8791}"
export AI_SLIDE_APP_VERSION="0.1.0"
export AI_SLIDE_WEB_DIST="$web_dist"
export AI_SLIDE_HOME="${NEXTOP_APP_DATA_DIR:-$script_dir/.ai-slide-dev}"
export AI_SLIDE_WORKSPACE_ROOT="${NEXTOP_WORKSPACE_ROOT:-$AI_SLIDE_HOME}"
export AI_SLIDE_TEMPLATE_ROOT="${AI_SLIDE_TEMPLATE_ROOT:-$AI_SLIDE_HOME/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$AI_SLIDE_HOME/templates/generated/templates}"

base_url="${NEXTOP_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SLIDE_SERVER_URL="$base_url"

node_bin="${NEXTOP_APP_NODE:-node}"
mkdir -p "$AI_SLIDE_HOME"

exec "$node_bin" "$server_entry"
