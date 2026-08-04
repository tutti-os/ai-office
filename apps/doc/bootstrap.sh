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
export TUTTI_APP_ID="${TUTTI_APP_ID:-ai-doc}"
export AI_DOC_APP_VERSION="0.1.0"
export AI_DOC_WEB_DIST="$web_dist"
export AI_DOC_HOME="${TUTTI_APP_DATA_DIR:-$script_dir/.ai-doc-dev}"
export TUTTI_APP_DATABASE_DIR="${TUTTI_APP_DATABASE_DIR:-$AI_DOC_HOME/data}"
export AI_DOC_RUNTIME_ROOT="${TUTTI_APP_RUNTIME_DIR:-$AI_DOC_HOME/.runtime}"
export AI_DOC_LOG_ROOT="${TUTTI_APP_LOG_DIR:-$AI_DOC_RUNTIME_ROOT/logs}"
export AI_DOC_TEMPLATE_ROOT="${AI_DOC_TEMPLATE_ROOT:-$AI_DOC_HOME/templates/tutti}"
export AI_DOC_TUTTI_CLI="${TUTTI_CLI:-}"
# TSH sandboxes always expose OfficeCLI at the managed runtime path.
if [ "${TSH_WORKSPACE_APP:-}" = "1" ] && [ -z "${TUTTI_APP_OFFICECLI_PATH:-}" ]; then
  export TUTTI_APP_OFFICECLI_PATH=/usr/local/bin/officecli
fi

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

node_bin="${TUTTI_APP_NODE:-node}"
mkdir -p "$AI_DOC_HOME" "$TUTTI_APP_DATABASE_DIR" "$AI_DOC_RUNTIME_ROOT" "$AI_DOC_LOG_ROOT"
legacy_db="$AI_DOC_HOME/data/ai-doc.db"
database_db="$TUTTI_APP_DATABASE_DIR/ai-doc.db"
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
