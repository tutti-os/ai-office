#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="${TUTTI_APP_PACKAGE_DIR:-$script_dir}"
server_entry="$package_dir/server/dist/apps/doc/server/src/main.js"
packaged_server_entry="$package_dir/server/server.js"
web_dist="$script_dir/web/dist"

if [ -f "$packaged_server_entry" ]; then
  server_entry="$packaged_server_entry"
  web_dist="$package_dir/dist"
fi

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Doc is not built yet. Run: pnpm package:doc-tutti" >&2
  exit 1
fi

export HOST="${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="${TUTTI_APP_PORT:-8790}"
export AI_DOC_APP_VERSION="0.1.0"
export AI_DOC_WEB_DIST="$web_dist"
export AI_DOC_HOME="${TUTTI_APP_DATA_DIR:-$script_dir/.ai-doc-dev}"
export AI_DOC_RUNTIME_ROOT="${TUTTI_APP_RUNTIME_DIR:-$AI_DOC_HOME/.runtime}"
export AI_DOC_LOG_ROOT="${TUTTI_APP_LOG_DIR:-$AI_DOC_RUNTIME_ROOT/logs}"
export AI_DOC_WORKSPACE_ROOT="${TUTTI_WORKSPACE_ROOT:-$AI_DOC_HOME}"
export AI_DOC_TEMPLATE_ROOT="${AI_DOC_TEMPLATE_ROOT:-$AI_DOC_HOME/templates/tutti}"
export AI_DOC_TUTTI_CLI="${TUTTI_CLI:-}"

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME" "$AI_DOC_RUNTIME_ROOT" "$AI_DOC_LOG_ROOT"

exec "$node_bin" "$server_entry"
