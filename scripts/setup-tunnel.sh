#!/bin/bash
set -e

if ! command -v cloudflared &> /dev/null; then
  echo "Error: cloudflared is not installed"
  echo "Install it from: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

TUNNEL_NAME="block-kit-builder-template-dev"
CONFIG_FILE="cloudflared.yml"

if [ -z "$1" ]; then
  echo "Usage: pnpm run setup:tunnel <hostname>"
  echo "Example: pnpm run setup:tunnel slack-dev.yourdomain.com"
  echo ""
  echo "The domain must be a zone in your Cloudflare account."
  echo "Check your domains at: https://dash.cloudflare.com"
  exit 1
fi

HOSTNAME="$1"

echo "==> Logging in to Cloudflare (opens browser)..."
cloudflared tunnel login

echo ""
echo "==> Creating tunnel '$TUNNEL_NAME'..."
TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" 2>&1 | grep -oE '[0-9a-f-]{36}' | head -1)

if [ -z "$TUNNEL_ID" ]; then
  # Tunnel might already exist
  TUNNEL_ID=$(cloudflared tunnel list -o json 2>/dev/null | python3 -c "import sys,json; tunnels=json.load(sys.stdin); print(next((t['id'] for t in tunnels if t['name']=='$TUNNEL_NAME'), ''))" 2>/dev/null || true)
fi

if [ -z "$TUNNEL_ID" ]; then
  echo "Error: Could not create or find tunnel. Check 'cloudflared tunnel list'."
  exit 1
fi

echo "   Tunnel ID: $TUNNEL_ID"

echo ""
echo "==> Routing $HOSTNAME to tunnel..."
cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME"

echo ""
echo "==> Writing $CONFIG_FILE..."
cat > "$CONFIG_FILE" <<EOF
tunnel: $TUNNEL_ID
credentials-file: ~/.cloudflared/$TUNNEL_ID.json
ingress:
  - hostname: $HOSTNAME
    service: http://localhost:5173
  - service: http_status:404
EOF

echo "✓ Tunnel configured"
echo ""
echo "Your permanent dev URL: https://$HOSTNAME"
echo "Run 'pnpm run dev:tunnel' to start developing"
