#!/bin/bash
set -e

echo "Configure Cloudflare Workers secrets"
echo "Find these at: Settings > Basic Information > App Credentials"
echo ""

echo "==> Signing Secret (Settings > Basic Information > App Credentials > Signing Secret)"
wrangler secret put SLACK_SIGNING_SECRET

echo ""
echo "==> Client ID (Settings > Basic Information > App Credentials > Client ID)"
wrangler secret put SLACK_CLIENT_ID

echo ""
echo "==> Client Secret (Settings > Basic Information > App Credentials > Client Secret)"
wrangler secret put SLACK_CLIENT_SECRET

echo ""
echo "✓ All secrets configured"
echo ""
echo "Note: SLACK_BOT_SCOPES is set in wrangler.jsonc (not a secret)"
