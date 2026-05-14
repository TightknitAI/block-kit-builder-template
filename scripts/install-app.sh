#!/bin/bash
set -e

# Read the worker URL from wrangler output or manifest
URL=$(grep -o 'https://[^"]*workers\.dev' wrangler.jsonc 2>/dev/null | head -1 || true)

if [ -z "$URL" ]; then
  # Try to extract from manifest.json
  URL=$(grep -o 'https://[^"]*workers\.dev' manifest.json 2>/dev/null | head -1 || true)
fi

if [ -z "$URL" ]; then
  echo "Could not detect your Worker URL."
  echo "Usage: pnpm run install-app <your-worker-url>"
  exit 1
fi

# Allow override via argument
if [ -n "$1" ]; then
  URL="${1%/}"
fi

INSTALL_URL="$URL/slack/install"

echo "Opening $INSTALL_URL ..."

if command -v open &> /dev/null; then
  open "$INSTALL_URL"
elif command -v xdg-open &> /dev/null; then
  xdg-open "$INSTALL_URL"
else
  echo "Open this URL in your browser: $INSTALL_URL"
fi
