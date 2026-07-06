#!/usr/bin/env bash
set -euo pipefail

SKIP_BACKEND=0
SKIP_FRONTEND=0
BACKEND_PORT=4001
FRONTEND_PORT=3002

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-backend)
      SKIP_BACKEND=1
      shift
      ;;
    --skip-frontend)
      SKIP_FRONTEND=1
      shift
      ;;
    --backend-port)
      BACKEND_PORT="${2:?Missing value for --backend-port}"
      shift 2
      ;;
    --frontend-port)
      FRONTEND_PORT="${2:?Missing value for --frontend-port}"
      shift 2
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 2
      ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT/backend"
FRONTEND_DIR="$ROOT/frontend"

if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
  # shellcheck source=/dev/null
  source "$HOME/.nvm/nvm.sh"
  nvm use --silent default >/dev/null
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found in WSL. Install Node/npm in Ubuntu or enable nvm first." >&2
  exit 1
fi

if [[ "$(command -v npm)" == /mnt/c/* ]]; then
  echo "Refusing to use Windows npm from WSL: $(command -v npm)" >&2
  echo "Load nvm or install Linux npm, then run this script again." >&2
  exit 1
fi

test_port() {
  local port="$1"
  ss -ltn "sport = :$port" | tail -n +2 | grep -q .
}

wait_port() {
  local port="$1"
  local name="$2"
  local timeout_seconds="${3:-120}"
  local deadline=$((SECONDS + timeout_seconds))

  while (( SECONDS < deadline )); do
    if test_port "$port"; then
      echo "$name is listening on port $port."
      return 0
    fi
    sleep 2
  done

  echo "$name did not start on port $port within $timeout_seconds seconds." >&2
  return 1
}

start_npm_process() {
  local name="$1"
  local working_directory="$2"
  shift 2

  local stdout="$working_directory/$name.stdout.log"
  local stderr="$working_directory/$name.stderr.log"

  (
    cd "$working_directory"
    setsid -f nohup npm "$@" >"$stdout" 2>"$stderr"
    pgrep -n -u "$(id -u)" -f "npm $*" >"$working_directory/$name.pid"
  )

  local pid
  pid="$(cat "$working_directory/$name.pid")"
  echo "Started $name, pid $pid."
}

echo "Starting NuCAD from $ROOT"
echo "Using node: $(command -v node) ($(node -v))"
echo "Using npm:  $(command -v npm) ($(npm -v))"

if [[ "$SKIP_BACKEND" -eq 0 ]]; then
  if test_port "$BACKEND_PORT"; then
    echo "Backend port $BACKEND_PORT is already in use; leaving it as-is."
  else
    start_npm_process backend "$BACKEND_DIR" start
    wait_port "$BACKEND_PORT" Backend 120
  fi
fi

if [[ "$SKIP_FRONTEND" -eq 0 ]]; then
  if test_port "$FRONTEND_PORT"; then
    echo "Frontend port $FRONTEND_PORT is already in use; leaving it as-is."
  else
    (
      export DANGEROUSLY_DISABLE_HOST_CHECK=true
      export BROWSER=none
      export PORT="$FRONTEND_PORT"
      start_npm_process frontend "$FRONTEND_DIR" start
    )
    wait_port "$FRONTEND_PORT" Frontend 180
  fi
fi

(
  export ELECTRON_RUN_AS_NODE=
  start_npm_process electron "$FRONTEND_DIR" run electron-start
)

echo "NuCAD is starting in Electron."
echo "Backend/frontend/electron logs and pid files are written next to each package.json."
