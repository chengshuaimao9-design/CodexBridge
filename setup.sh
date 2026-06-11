#!/bin/bash
set -e

echo "============================================"
echo "  CodexBridge - 微信桥接一键安装"
echo "============================================"
echo ""

# 检查 Node.js
if ! command -v node &>/dev/null; then
  echo "[错误] 未安装 Node.js，请先安装 Node.js >= 24"
  echo "       推荐使用 nvm：curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash"
  echo "       然后：nvm install 24"
  exit 1
fi

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 24 ]; then
  echo "[错误] Node.js 版本过低（当前 $(node --version)），需要 >= 24"
  exit 1
fi
echo "[OK] Node.js $(node --version)"

# 检查 pnpm
if ! command -v pnpm &>/dev/null; then
  echo "[...] 安装 pnpm..."
  npm install -g pnpm
fi
echo "[OK] pnpm $(pnpm --version)"

# 安装依赖
echo "[...] 安装项目依赖..."
pnpm install
echo "[OK] 依赖安装完成"

# 创建配置
if [ ! -f .env ]; then
  echo "[...] 创建 .env 配置文件..."
  cp .env.example .env
  echo "[!] 请编辑 .env 文件，确认 CODEX_REAL_BIN 指向你的 Codex CLI 路径"
else
  echo "[OK] .env 已存在"
fi

# 创建数据目录
echo "[...] 创建数据目录..."
mkdir -p bridge_data/accounts bridge_data/runtime bridge_data/media bridge_data/logs

# 微信登录
echo ""
echo "============================================"
echo "  微信扫码登录（用手机微信扫二维码）"
echo "============================================"
echo ""
pnpm weixin:login

echo ""
echo "============================================"
echo "  安装完成！"
echo "============================================"
echo ""
echo "启动桥接："
echo "  ./bridge-runner.sh &"
echo ""
echo "或者手动："
echo "  pnpm weixin:serve"
echo ""
echo "启动后，在微信 Open Cloud 聊天里发消息即可。"
