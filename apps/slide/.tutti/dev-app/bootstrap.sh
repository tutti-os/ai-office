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
web_dir="$app_dir/web"
vite_cli="$web_dir/node_modules/vite/bin/vite.js"

if [ ! -f "$server_entry" ]; then
  echo "AI Slide server entry is missing: $server_entry" >&2
  exit 1
fi

if [ ! -f "$tsx_cli" ]; then
  echo "AI Slide dependencies are missing. Install workspace dependencies from $repo_root before loading this local app." >&2
  exit 1
fi

if [ ! -f "$vite_cli" ]; then
  echo "AI Slide web dependencies are missing. Install workspace dependencies from $repo_root before loading this local app." >&2
  exit 1
fi

mkdir -p "$data_dir" "$runtime_dir" "$log_dir"

backend_port=$("$node_bin" -e '
  const net = require("node:net");
  const server = net.createServer();
  server.on("error", (error) => { console.error(error.message); process.exit(1); });
  const listen = () => server.listen({ host: process.argv[1], port: 0 }, () => {
    const address = server.address();
    if (!address || typeof address === "string") process.exit(1);
    if (address.port === Number(process.argv[2])) {
      server.close(listen);
      return;
    }
    process.stdout.write(String(address.port));
    server.close();
  });
  listen();
' "$host" "$port")
backend_origin="http://$host:$backend_port"

export HOST="$host"
export PORT="$backend_port"
export TUTTI_APP_ID="${TUTTI_APP_ID:-ai-slide}"
export AI_SLIDE_APP_VERSION="0.1.0-local"
export AI_SLIDE_HOME="$data_dir"
export AI_SLIDE_RUNTIME_ROOT="$runtime_dir"
export AI_SLIDE_LOG_ROOT="$log_dir"
export AI_SLIDE_TEMPLATE_ROOT="${AI_SLIDE_TEMPLATE_ROOT:-$app_dir/templates/source}"
export AI_SLIDE_TEMPLATE_ASSET_ROOT="${AI_SLIDE_TEMPLATE_ASSET_ROOT:-$app_dir/templates/generated}"
export AI_SLIDE_TUTTI_CLI="${TUTTI_CLI:-}"
export AI_OFFICE_TOOLCHAIN_ROOT="${TUTTI_APP_TOOLCHAIN_ROOT:-$data_dir/toolchains}"
export AI_SLIDE_DEV_BACKEND_ORIGIN="$backend_origin"

base_url="${TUTTI_APP_BASE_URL:-http://$host:$port}"
export AI_SLIDE_SERVER_URL="$base_url"

server_pid=""
web_pid=""

cleanup() {
  exit_code=$?
  trap - EXIT INT TERM

  if [ -n "$server_pid" ] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
  fi
  if [ -n "$web_pid" ] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
  fi
  if [ -n "$server_pid" ]; then
    wait "$server_pid" 2>/dev/null || true
  fi
  if [ -n "$web_pid" ]; then
    wait "$web_pid" 2>/dev/null || true
  fi

  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "[ai-slide] web: http://$host:$port"
echo "[ai-slide] server: $backend_origin"

(
  cd "$server_dir"
  exec "$node_bin" "$tsx_cli" watch "$server_entry"
) &
server_pid=$!

(
  cd "$web_dir"
  exec "$node_bin" "$vite_cli" --host "$host" --port "$port" --strictPort
) &
web_pid=$!

while true; do
  if ! kill -0 "$server_pid" 2>/dev/null; then
    wait "$server_pid"
    exit $?
  fi
  if ! kill -0 "$web_pid" 2>/dev/null; then
    wait "$web_pid"
    exit $?
  fi
  sleep 1
done
