#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DEV_WEB_DOMAIN:-dev-app.biovault.net}"
EXPO_WEB_PORT_WAS_SET="${EXPO_WEB_PORT+x}"
EXPO_WEB_PORT="${EXPO_WEB_PORT:-8081}"
DEV_WEB_HTTPS="${DEV_WEB_HTTPS:-1}"
CERT_DIR="${DEV_WEB_CERT_DIR:-.tmp/dev-web-certs}"
DEV_WEB_OPEN="${DEV_WEB_OPEN:-$([[ -n "${CI:-}" ]] && echo 0 || echo 1)}"
DEV_WEB_OPEN_PATH="${DEV_WEB_OPEN_PATH:-/}"
TLS_CERT=""
TLS_KEY=""

command_exists() {
  command -v "$1" >/dev/null 2>&1
}

is_interactive() {
  [[ -t 0 && -z "${CI:-}" ]]
}

prompt_yes_no() {
  local prompt="$1"
  local default="${2:-n}"
  local suffix="[y/N]"
  [[ "$default" == "y" ]] && suffix="[Y/n]"
  if ! is_interactive; then
    [[ "$default" == "y" ]]
    return
  fi
  local answer
  read -r -p "${prompt} ${suffix} " answer
  answer="${answer:-$default}"
  [[ "$answer" =~ ^[Yy]$ ]]
}

port_pids() {
  lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null || true
}

process_command() {
  ps -p "$1" -o command= 2>/dev/null || true
}

free_stale_dev_web_port() {
  local port="$1"
  local pids
  pids="$(port_pids "$port")"
  [[ -z "$pids" ]] && return 0

  local pid command_line all_stale=1
  while IFS= read -r pid; do
    [[ -z "$pid" ]] && continue
    command_line="$(process_command "$pid")"
    if [[ "$command_line" != *"scripts/dev-web-server.mjs"* ]]; then
      all_stale=0
    fi
  done <<<"$pids"

  if [[ "$all_stale" == "1" ]]; then
    echo "==> Stopping stale dev-web shell on :${port}"
    while IFS= read -r pid; do
      [[ -z "$pid" ]] && continue
      kill "$pid" >/dev/null 2>&1 || true
    done <<<"$pids"
    sleep 0.5
    return 0
  fi

  echo "Port ${port} is already in use:" >&2
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >&2 || true
  exit 1
}

find_free_port_from() {
  local port="$1"
  while nc -z -w 1 localhost "$port" >/dev/null 2>&1; do
    port=$((port + 1))
  done
  echo "$port"
}

ensure_hosts_entry() {
  if awk -v domain="$DOMAIN" '
    $1 == "127.0.0.1" {
      for (i = 2; i <= NF; i += 1) {
        if ($i == domain) found = 1
      }
    }
    END { exit found ? 0 : 1 }
  ' /etc/hosts; then
    return 0
  fi

  if [[ -n "${CI:-}" ]] && command_exists sudo; then
    echo "==> Adding ${DOMAIN} to /etc/hosts for CI"
    echo "127.0.0.1 ${DOMAIN}" | sudo tee -a /etc/hosts >/dev/null
    return 0
  fi

  cat >&2 <<EOF
${DOMAIN} is not mapped to 127.0.0.1 in /etc/hosts.

Add it with:
  sudo sh -c 'echo "127.0.0.1 ${DOMAIN}" >> /etc/hosts'

Then run:
  ./dev-web.sh
EOF
  exit 1
}

create_self_signed_cert() {
  local cert="$1"
  local key="$2"
  local conf="${CERT_DIR}/${DOMAIN}.openssl.cnf"
  if ! command_exists openssl; then
    echo "openssl is required to generate a CI self-signed certificate." >&2
    exit 1
  fi
  cat >"$conf" <<EOF
[req]
distinguished_name=req_distinguished_name
x509_extensions=v3_req
prompt=no
[req_distinguished_name]
CN=${DOMAIN}
[v3_req]
subjectAltName=@alt_names
[alt_names]
DNS.1=${DOMAIN}
IP.1=127.0.0.1
EOF
  openssl req -x509 -nodes -newkey rsa:2048 -days 7 \
    -keyout "$key" \
    -out "$cert" \
    -config "$conf" >/dev/null 2>&1
}

if [[ "$DEV_WEB_HTTPS" == "1" ]]; then
  if ! command_exists mkcert; then
    if command_exists brew && prompt_yes_no "mkcert is missing. Install it with Homebrew now?" "y"; then
      brew install mkcert
    fi
  fi

  if ! command_exists mkcert && [[ "${DEV_WEB_ALLOW_SELF_SIGNED:-0}" != "1" ]]; then
    cat >&2 <<EOF
mkcert is required for trusted HTTPS dev mode so Chrome exposes persistent file handles.

Install it with:
  brew install mkcert
  mkcert -install

Or run insecure HTTP mode explicitly:
  DEV_WEB_HTTPS=0 ./dev-web.sh
EOF
    exit 1
  fi

  mkdir -p "$CERT_DIR"
  TLS_CERT="${CERT_DIR}/${DOMAIN}.pem"
  TLS_KEY="${CERT_DIR}/${DOMAIN}-key.pem"
  if [[ ! -f "$TLS_CERT" || ! -f "$TLS_KEY" ]]; then
    if command_exists mkcert; then
      if [[ ! -f "${CERT_DIR}/.mkcert-installed" ]] && prompt_yes_no "Install/trust the mkcert local CA now? This may ask for your password." "y"; then
        mkcert -install
        touch "${CERT_DIR}/.mkcert-installed"
      fi
      echo "==> Creating trusted local TLS cert for ${DOMAIN}"
      mkcert -cert-file "$TLS_CERT" -key-file "$TLS_KEY" "$DOMAIN"
    else
      echo "==> Creating self-signed TLS cert for ${DOMAIN}"
      create_self_signed_cert "$TLS_CERT" "$TLS_KEY"
    fi
  fi
fi

DEV_WEB_PORT="${DEV_WEB_PORT:-$([[ "$DEV_WEB_HTTPS" == "1" ]] && echo 443 || echo 80)}"
DEV_WEB_PROTOCOL="$([[ "$DEV_WEB_HTTPS" == "1" ]] && echo https || echo http)"

ensure_hosts_entry
free_stale_dev_web_port "$DEV_WEB_PORT"

if [[ -z "$EXPO_WEB_PORT_WAS_SET" ]]; then
  EXPO_WEB_PORT="$(find_free_port_from "$EXPO_WEB_PORT")"
fi

cleanup() {
  if [[ -n "${EXPO_PID:-}" ]]; then
    kill "$EXPO_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${PROXY_PID:-}" ]]; then
    kill "$PROXY_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

# bioscript-wasm + monty-wasm are untracked build outputs; regenerate them
# from the submodule source if missing/stale before the web app starts.
echo "==> Ensuring web wasm artifacts are up to date"
node scripts/check-monty-artifacts.mjs || true
node scripts/check-bioscript-wasm-artifacts.mjs

# Single build id for this dev session so the splash page (/) and the web app
# (/web/) show the identical string instead of "<version>+dev".
export EXPO_PUBLIC_BUILD_ID="${EXPO_PUBLIC_BUILD_ID:-$(node scripts/build-id.mjs)}"
echo "==> Build id: ${EXPO_PUBLIC_BUILD_ID}"

echo "==> Starting local web shell on :${DEV_WEB_PORT}"
DEV_WEB_DOMAIN="$DOMAIN" \
DEV_WEB_PORT="$DEV_WEB_PORT" \
EXPO_WEB_PORT="$EXPO_WEB_PORT" \
DEV_WEB_TLS_CERT="$TLS_CERT" \
DEV_WEB_TLS_KEY="$TLS_KEY" \
BIOVAULT_METRICS_SITE_ID="${BIOVAULT_METRICS_SITE_ID:-4}" \
node scripts/dev-web-server.mjs &
PROXY_PID=$!
sleep 0.5
if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
  wait "$PROXY_PID" || true
  echo "dev web shell failed to start on :${DEV_WEB_PORT}" >&2
  exit 1
fi

PUBLIC_ORIGIN="${DEV_WEB_PROTOCOL}://${DOMAIN}"
if [[ ! ( "$DEV_WEB_PROTOCOL" == "https" && "$DEV_WEB_PORT" == "443" ) && ! ( "$DEV_WEB_PROTOCOL" == "http" && "$DEV_WEB_PORT" == "80" ) ]]; then
  PUBLIC_ORIGIN="${PUBLIC_ORIGIN}:${DEV_WEB_PORT}"
fi

echo "==> Starting Expo web dev server on :${EXPO_WEB_PORT}"
APP_VARIANT=development \
EXPO_BASE_URL=/web \
EXPO_PUBLIC_SITE_ORIGIN="$PUBLIC_ORIGIN" \
BIOVAULT_METRICS_SITE_ID="${BIOVAULT_METRICS_SITE_ID:-4}" \
BIOVAULT_METRICS_DOMAIN="${BIOVAULT_METRICS_DOMAIN:-${DOMAIN}}" \
BROWSER=none \
npx expo start --web --localhost --clear --port "$EXPO_WEB_PORT" &
EXPO_PID=$!

echo "==> Waiting for Expo web app through ${PUBLIC_ORIGIN}/web/"
for _ in {1..120}; do
  if curl --max-time 5 -Lskf "${PUBLIC_ORIGIN}/web/" >/dev/null 2>&1; then
    break
  fi
  if ! kill -0 "$EXPO_PID" >/dev/null 2>&1; then
    wait "$EXPO_PID" || true
    echo "Expo web dev server exited before ${PUBLIC_ORIGIN}/web/ became reachable." >&2
    exit 1
  fi
  if ! kill -0 "$PROXY_PID" >/dev/null 2>&1; then
    wait "$PROXY_PID" || true
    echo "dev web shell exited before ${PUBLIC_ORIGIN}/web/ became reachable." >&2
    exit 1
  fi
  sleep 1
done

if ! curl --max-time 5 -Lskf "${PUBLIC_ORIGIN}/web/" >/dev/null 2>&1; then
  echo "${PUBLIC_ORIGIN}/web/ did not become reachable." >&2
  exit 1
fi

cat <<EOF

Open:
  ${PUBLIC_ORIGIN}/      main landing/download page
  ${PUBLIC_ORIGIN}/web/  Expo web app with hot reload

Metrics should report to site id ${BIOVAULT_METRICS_SITE_ID:-4} as ${BIOVAULT_METRICS_DOMAIN:-${DOMAIN}}.

EOF

if [[ "$DEV_WEB_OPEN" == "1" ]]; then
  if command_exists open; then
    open "${PUBLIC_ORIGIN}${DEV_WEB_OPEN_PATH}"
  elif command_exists xdg-open; then
    xdg-open "${PUBLIC_ORIGIN}${DEV_WEB_OPEN_PATH}" >/dev/null 2>&1 || true
  fi
fi

wait "$EXPO_PID" "$PROXY_PID"
