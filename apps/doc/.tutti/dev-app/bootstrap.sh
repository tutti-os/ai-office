#!/bin/sh
set -eu

package_dir="${TUTTI_APP_PACKAGE_DIR:?TUTTI_APP_PACKAGE_DIR is required}"
port="${TUTTI_APP_PORT:?TUTTI_APP_PORT is required}"
host="${TUTTI_APP_HOST:-127.0.0.1}"
node_bin="${TUTTI_APP_NODE:?TUTTI_APP_NODE is required}"
data_dir="${TUTTI_APP_DATA_DIR:?TUTTI_APP_DATA_DIR is required}"
runtime_dir="${TUTTI_APP_RUNTIME_DIR:?TUTTI_APP_RUNTIME_DIR is required}"
log_dir="${TUTTI_APP_LOG_DIR:?TUTTI_APP_LOG_DIR is required}"

app_dir=$(CDPATH= cd -- "$package_dir/../.." && pwd)
repo_root=$(CDPATH= cd -- "$app_dir/../.." && pwd)
server_dir="$app_dir/server"
server_entry="$server_dir/src/main.ts"
tsx_cli="$server_dir/node_modules/tsx/dist/cli.mjs"
web_dist="$app_dir/web/dist"

if [ ! -f "$server_entry" ]; then
  echo "AI Doc server entry is missing: $server_entry" >&2
  exit 1
fi

if [ ! -f "$tsx_cli" ]; then
  echo "AI Doc dependencies are missing. Install workspace dependencies from $repo_root before loading this local app." >&2
  exit 1
fi

if [ ! -d "$web_dist" ]; then
  echo "AI Doc web build is missing: $web_dist" >&2
  exit 1
fi

mkdir -p "$data_dir" "$runtime_dir" "$log_dir"

export HOST="$host"
export PORT="$port"
export TUTTI_APP_ID="${TUTTI_APP_ID:-ai-doc}"
export AI_DOC_APP_VERSION="0.1.0-local"
export AI_DOC_WEB_DIST="$web_dist"
export AI_DOC_HOME="$data_dir"
export AI_DOC_RUNTIME_ROOT="$runtime_dir"
export AI_DOC_LOG_ROOT="$log_dir"
export AI_DOC_WORKSPACE_ROOT="${TUTTI_WORKSPACE_ROOT:-$data_dir}"
export AI_DOC_TEMPLATE_ROOT="${AI_DOC_TEMPLATE_ROOT:-$data_dir/templates/tutti}"
export AI_DOC_TUTTI_CLI="${TUTTI_CLI:-}"
export AI_OFFICE_TOOLCHAIN_ROOT="${TUTTI_APP_TOOLCHAIN_ROOT:-$data_dir/toolchains}"

base_url="${TUTTI_APP_BASE_URL:-http://$HOST:$PORT}"
export AI_DOC_SERVER_URL="$base_url"

cd "$server_dir"
exec "$node_bin" "$tsx_cli" watch "$server_entry"
