#!/bin/sh
set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
package_dir="${TUTTI_APP_PACKAGE_DIR:-$script_dir}"
server_entry="$package_dir/server/dist/apps/slide/server/src/main.js"
packaged_server_entry="$package_dir/server/server.js"
web_dist="$script_dir/web/dist"

if [ -f "$packaged_server_entry" ]; then
  server_entry="$packaged_server_entry"
  web_dist="$package_dir/dist"
fi

if [ ! -f "$server_entry" ] || [ ! -d "$web_dist" ]; then
  echo "AI Slide is not built yet. Run: pnpm package:slide-tutti" >&2
  exit 1
fi

export HOST="${TUTTI_APP_HOST:-127.0.0.1}"
export PORT="${TUTTI_APP_PORT:-8791}"
export TUTTI_APP_ID="${TUTTI_APP_ID:-ai-slide}"
export AI_SLIDE_APP_VERSION="0.1.0"
export AI_SLIDE_WEB_DIST="$web_dist"
export AI_SLIDE_HOME="${TUTTI_APP_DATA_DIR:-$script_dir/.ai-slide-dev}"
export TUTTI_APP_DATABASE_DIR="${TUTTI_APP_DATABASE_DIR:-$AI_SLIDE_HOME/data}"
export AI_SLIDE_RUNTIME_ROOT="${TUTTI_APP_RUNTIME_DIR:-$AI_SLIDE_HOME/.runtime}"
export AI_SLIDE_LOG_ROOT="${TUTTI_APP_LOG_DIR:-$AI_SLIDE_RUNTIME_ROOT/logs}"
export AI_SLIDE_TEMPLATE_ROOT="${AI_SLIDE_TEMPLATE_ROOT:-$script_dir/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$script_dir/templates/generated}"
export AI_SLIDE_TUTTI_CLI="${TUTTI_CLI:-}"

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_SLIDE_SERVER_URL="$base_url"

node_bin="${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_SLIDE_HOME" "$TUTTI_APP_DATABASE_DIR" "$AI_SLIDE_RUNTIME_ROOT" "$AI_SLIDE_LOG_ROOT"
legacy_db="$AI_SLIDE_HOME/data/ai-slide.db"
database_db="$TUTTI_APP_DATABASE_DIR/ai-slide.db"
if [ "$legacy_db" != "$database_db" ] && [ ! -e "$database_db" ] && [ -f "$legacy_db" ]; then
  database_tmp="$database_db.migrate-$$"
  wal_tmp="$database_db-wal.migrate-$$"
  rm -f "$database_tmp" "$wal_tmp"
  if [ -f "$legacy_db-wal" ]; then
    cp "$legacy_db-wal" "$wal_tmp"
    mv "$wal_tmp" "$database_db-wal"
  fi
  cp "$legacy_db" "$database_tmp"
  mv "$database_tmp" "$database_db"
fi

exec "$node_bin" "$server_entry"
