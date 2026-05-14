#!/bin/bash
set -e

MANIFEST="manifest.json"

if [ -z "$1" ]; then
  echo "Usage: pnpm run setup:manifest <your-worker-url>"
  echo "Example: pnpm run setup:manifest https://slack-hono-example.your-subdomain.workers.dev"
  exit 1
fi

URL="$1"
URL="${URL%/}"

if [[ ! "$URL" =~ ^https:// ]]; then
  echo "Error: URL must start with https://"
  exit 1
fi

# Replace YOUR_WORKER_URL in manifest.json
sed -i.bak "s|YOUR_WORKER_URL|${URL#https://}|g" "$MANIFEST"
rm -f "$MANIFEST.bak"

echo "✓ Updated $MANIFEST with: $URL"

# Copy manifest to clipboard
if command -v pbcopy &> /dev/null; then
  cat "$MANIFEST" | pbcopy
  echo "✓ Manifest copied to clipboard"
elif command -v xclip &> /dev/null; then
  cat "$MANIFEST" | xclip -selection clipboard
  echo "✓ Manifest copied to clipboard"
elif command -v xsel &> /dev/null; then
  cat "$MANIFEST" | xsel --clipboard
  echo "✓ Manifest copied to clipboard"
else
  echo "  (Could not copy to clipboard — copy manifest.json manually)"
fi

echo ""
echo "Now create your Slack app:"
echo "  1. Opening https://api.slack.com/apps/new ..."
echo "  2. Choose 'From an app manifest'"
echo "  3. Paste from clipboard (the manifest is already copied)"
echo "  4. Click Next → Create"
echo ""

# Open browser (macOS / Linux)
if command -v open &> /dev/null; then
  open "https://api.slack.com/apps/new"
elif command -v xdg-open &> /dev/null; then
  xdg-open "https://api.slack.com/apps/new"
fi

echo "After creating the app, enter the IDs from the URL bar."
echo "URL format: https://app.slack.com/app-settings/TEAM_ID/APP_ID/..."
echo ""
read -p "Team ID (starts with T): " TEAM_ID
read -p "App ID (starts with A): " APP_ID

if [ -n "$TEAM_ID" ] && [ -n "$APP_ID" ]; then
  cat > .slack.json <<EOF
{
  "team_id": "$TEAM_ID",
  "app_id": "$APP_ID"
}
EOF
  echo "✓ Saved to .slack.json"
else
  echo "Skipped — you can set these later in .slack.json"
fi

echo ""
echo "Next step: pnpm run setup:secrets"
