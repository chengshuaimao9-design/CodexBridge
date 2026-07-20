#!/bin/bash
export CODEX_REAL_BIN="/Users/zhuanz/.nvm/versions/node/v24.16.0/bin/codex"
export PATH="/Users/zhuanz/.nvm/versions/node/v24.16.0/bin:/usr/local/bin:/usr/bin:/bin"
PROJECT="/Users/zhuanz/Desktop/Githup/运行项目/CodexBridge"
OUTDIR="/Users/zhuanz/Desktop/Githup/微信端运营/生成的文件"
export CODEXBRIDGE_DEFAULT_CWD="$OUTDIR"
mkdir -p "$OUTDIR"
/bin/rm -f "$PROJECT/bridge_data/runtime/weixin-serve.lock"
exec /Users/zhuanz/.nvm/versions/node/v24.16.0/bin/node \
  --require "$PROJECT/node_modules/tsx/dist/preflight.cjs" \
  --import "file://$PROJECT/node_modules/tsx/dist/loader.mjs" \
  "$PROJECT/src/cli.ts" \
  weixin serve --state-dir "$PROJECT/bridge_data"
