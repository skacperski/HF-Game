#!/bin/bash
# ============================================================
# Hey Feelings - Public Tunnel (share with anyone on the internet)
# Uses Cloudflare Quick Tunnels (free, no account required)
# ============================================================

set -e

echo ""
echo "  Hey Feelings - Starting public tunnel..."
echo "  ========================================="
echo ""

# Check dependencies
command -v cloudflared >/dev/null 2>&1 || { echo "ERROR: cloudflared not installed. Run: brew install cloudflared"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: node not installed"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Cleanup on exit
cleanup() {
    echo ""
    echo "  Shutting down..."
    kill $HTTP_PID $SIGNAL_PID $TUNNEL_HTTP_PID $TUNNEL_SIGNAL_PID 2>/dev/null
    wait 2>/dev/null
    rm -f /tmp/hf-tunnel-http.log /tmp/hf-tunnel-signal.log
    echo "  Done."
}
trap cleanup EXIT

# Start HTTP server (if not already running)
if curl -s -o /dev/null http://localhost:8080/ 2>/dev/null; then
    echo "  [OK] HTTP server already running on :8080"
    HTTP_PID=""
else
    echo "  [..] Starting HTTP server on :8080..."
    python3 -m http.server 8080 > /dev/null 2>&1 &
    HTTP_PID=$!
    sleep 1
    echo "  [OK] HTTP server started"
fi

# Start signaling server (if not already running)
if curl -s -o /dev/null http://localhost:4444/ 2>/dev/null; then
    echo "  [OK] Signaling server already running on :4444"
    SIGNAL_PID=""
else
    echo "  [..] Starting signaling server on :4444..."
    node signaling-server.js > /dev/null 2>&1 &
    SIGNAL_PID=$!
    sleep 1
    echo "  [OK] Signaling server started"
fi

# Start Cloudflare tunnel for HTTP
echo "  [..] Creating public tunnel for game..."
cloudflared tunnel --url http://localhost:8080 > /tmp/hf-tunnel-http.log 2>&1 &
TUNNEL_HTTP_PID=$!

# Start Cloudflare tunnel for signaling
echo "  [..] Creating public tunnel for signaling..."
cloudflared tunnel --url http://localhost:4444 > /tmp/hf-tunnel-signal.log 2>&1 &
TUNNEL_SIGNAL_PID=$!

# Wait for tunnels to establish
echo "  [..] Waiting for Cloudflare tunnels..."
for i in $(seq 1 20); do
    sleep 1
    GAME_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/hf-tunnel-http.log 2>/dev/null | head -1)
    SIGNAL_URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' /tmp/hf-tunnel-signal.log 2>/dev/null | head -1)
    if [ -n "$GAME_URL" ] && [ -n "$SIGNAL_URL" ]; then
        break
    fi
done

if [ -z "$GAME_URL" ]; then
    echo "  [FAIL] Could not establish HTTP tunnel"
    cat /tmp/hf-tunnel-http.log
    exit 1
fi

if [ -z "$SIGNAL_URL" ]; then
    echo "  [FAIL] Could not establish signaling tunnel"
    cat /tmp/hf-tunnel-signal.log
    exit 1
fi

SIGNAL_WS="wss://$(echo "$SIGNAL_URL" | sed 's|https://||')"
ROOM_ID=$(cat /dev/urandom | LC_ALL=C tr -dc 'a-z0-9' | head -c 8)
FULL_URL="${GAME_URL}?signal=${SIGNAL_WS}#room=${ROOM_ID}"

echo ""
echo "  ========================================="
echo "  READY! Share this link with anyone:"
echo ""
echo "  $FULL_URL"
echo ""
echo "  ========================================="
echo "  Game:      $GAME_URL"
echo "  Signaling: $SIGNAL_URL ($SIGNAL_WS)"
echo "  Room:      $ROOM_ID"
echo "  ========================================="
echo ""
echo "  Press Ctrl+C to stop"
echo ""

# Copy to clipboard if possible
echo "$FULL_URL" | pbcopy 2>/dev/null && echo "  (Link copied to clipboard!)" && echo ""

# Wait forever
wait
