#!/bin/zsh

set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=4321

cd "$PROJECT_DIR"

# Astro moves to the next port when the default one is already in use.
# Pick that free port first so the links printed below stay accurate.
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo "Starting the Personal News Digest local server…"
echo
echo "Mac link:       http://localhost:$PORT/"

LAN_IP=""
DEFAULT_INTERFACE="$(route -n get default 2>/dev/null | awk '/interface:/{print $2; exit}')"

if [[ -n "$DEFAULT_INTERFACE" ]]; then
  LAN_IP="$(ipconfig getifaddr "$DEFAULT_INTERFACE" 2>/dev/null || true)"
fi

if [[ -z "$LAN_IP" ]]; then
  for INTERFACE in en0 en1 en2 en3; do
    LAN_IP="$(ipconfig getifaddr "$INTERFACE" 2>/dev/null || true)"
    [[ -n "$LAN_IP" ]] && break
  done
fi

if [[ -n "$LAN_IP" ]]; then
  echo "iPhone preview: http://$LAN_IP:$PORT/"
  echo "(Connect the iPhone to the same Wi-Fi network.)"
else
  echo "iPhone preview: Couldn't detect this Mac's Wi-Fi address."
  echo "Connect the Mac to Wi-Fi and run this launcher again."
fi

echo

if [[ ! -d node_modules ]]; then
  echo "Project dependencies are missing. In Terminal, run: npm ci"
  echo "Then double-click this launcher again."
  echo
  read -r "REPLY?Press Return to close this window…"
  exit 1
fi

npm run dev -- --host 0.0.0.0 --port "$PORT"
