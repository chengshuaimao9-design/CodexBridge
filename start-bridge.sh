#!/bin/bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export HTTPS_PROXY=http://127.0.0.1:7890 HTTP_PROXY=http://127.0.0.1:7890

LOCK=/Users/zhuanz/.codexbridge/runtime/weixin-serve.lock
[ -f "$LOCK" ] && rm -f "$LOCK"

cd "$(dirname "$0")"
npx tsx src/cli.ts weixin serve > /tmp/codexbridge.log 2>&1 &
PID=$!
echo "CodexBridge started (PID $PID)"
echo "Logs: tail -f /tmp/codexbridge.log"
