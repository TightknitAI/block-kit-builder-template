#!/bin/bash
set -e

# Copy manifest to clipboard
if command -v pbcopy &> /dev/null; then
  cat manifest.json | pbcopy
  echo "✓ Manifest copied to clipboard"
elif command -v xclip &> /dev/null; then
  cat manifest.json | xclip -selection clipboard
  echo "✓ Manifest copied to clipboard"
elif command -v xsel &> /dev/null; then
  cat manifest.json | xsel --clipboard
  echo "✓ Manifest copied to clipboard"
else
  echo "(Could not copy to clipboard — copy manifest.json manually)"
fi

# Open the app manifest page directly if .slack.json exists
if [ -f .slack.json ]; then
  TEAM_ID=$(python3 -c "import json; print(json.load(open('.slack.json'))['team_id'])" 2>/dev/null || true)
  APP_ID=$(python3 -c "import json; print(json.load(open('.slack.json'))['app_id'])" 2>/dev/null || true)

  if [ -n "$TEAM_ID" ] && [ -n "$APP_ID" ]; then
    URL="https://app.slack.com/app-settings/$TEAM_ID/$APP_ID/app-manifest"
    echo "Opening $URL ..."
    if command -v open &> /dev/null; then
      open "$URL"
    elif command -v xdg-open &> /dev/null; then
      xdg-open "$URL"
    fi
    echo ""
    echo "Paste the manifest and click Save Changes."
    exit 0
  fi
fi

# Fallback: open the generic apps page
echo "Opening https://api.slack.com/apps ..."
if command -v open &> /dev/null; then
  open "https://api.slack.com/apps"
elif command -v xdg-open &> /dev/null; then
  xdg-open "https://api.slack.com/apps"
fi
echo ""
echo "Select your app → App Manifest → paste and save."
echo ""
echo "Tip: Run 'pnpm run setup:manifest' to save your app/team IDs for direct links."
