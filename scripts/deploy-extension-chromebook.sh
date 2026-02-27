#!/bin/bash
#
# Deploy extension to Chromebook for testing.
# Run from dev laptop, not from Crostini.
#
# Prerequisites:
#   - SSH access: ssh chromebook works
#   - CDP tunnel active: ssh -L 9222:127.0.0.1:9222 chromebook
#   - Extension loaded once from ~/Downloads/crostini-shared/wsc-extension/
#
# Usage:
#   ./scripts/deploy-extension-chromebook.sh
#
set -e
cd "$(dirname "$0")/.."

CHROMEBOOK_HOST="${CHROMEBOOK_HOST:-chromebook}"
REMOTE_PATH="/mnt/chromeos/MyFiles/Downloads/crostini-shared/wsc-extension"

# Warn if running from Crostini
if [[ -f /etc/apt/sources.list.d/cros.list ]]; then
    echo "Warning: Running from Crostini. This script is meant for external dev machines."
    echo "   Press Ctrl+C to cancel, or wait 3s to continue anyway..."
    sleep 3
fi

echo "Building extension..."
cd extension
pnpm build
cd ..

echo "Deploying to $CHROMEBOOK_HOST:$REMOTE_PATH/"

# Create target directory if needed
ssh "$CHROMEBOOK_HOST" "mkdir -p '$REMOTE_PATH'"

rsync -av --delete \
    --exclude='.git' \
    --exclude='node_modules' \
    extension/dist/ \
    "$CHROMEBOOK_HOST:$REMOTE_PATH/"

# Reload extension via CDP if tunnel is active
CDP_PORT="${CDP_PORT:-9222}"
if nc -z localhost "$CDP_PORT" 2>/dev/null; then
    echo "Reloading extension via CDP..."
    python3 -c "
import json
import urllib.request
import websocket

# Get targets
targets = json.loads(urllib.request.urlopen('http://localhost:$CDP_PORT/json').read())
sw = next((t for t in targets if t.get('type') == 'service_worker' and 'lpkjdhnmgkhaabhimpdinmdgejoaejic' in t.get('url', '')), None)
if sw:
    ws = websocket.create_connection(sw['webSocketDebuggerUrl'])
    ws.send(json.dumps({'id': 1, 'method': 'Runtime.evaluate', 'params': {'expression': 'chrome.runtime.reload()'}}))
    ws.close()
    print('Extension reloaded')
else:
    print('Service worker not found, skipping reload')
" 2>/dev/null || echo "CDP reload failed (websocket-client not installed?), manual reload may be needed"
fi

echo "Done! Extension deployed."
