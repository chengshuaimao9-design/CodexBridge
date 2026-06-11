#!/bin/bash
set -e

echo "============================================"
echo "  CodexBridge - 微信桥接一键安装"
echo "============================================"
echo ""

# 1. 检查 Node.js
if ! command -v node &>/dev/null; then
  echo "[...] 安装 Node.js 24（通过 nvm）..."
  curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm use 24
fi

NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
if [ "$NODE_VER" -lt 24 ]; then
  echo "[错误] Node.js 版本过低（$(node --version)），需要 >= 24"
  exit 1
fi
echo "[OK] Node.js $(node --version)"

# 2. 检查 pnpm
if ! command -v pnpm &>/dev/null; then
  npm install -g pnpm
fi
echo "[OK] pnpm $(pnpm --version)"

# 3. 检查 Codex CLI
CODEX_CLI=$(which codex 2>/dev/null || ls /Applications/Codex.app/Contents/Resources/codex 2>/dev/null || echo "")
if [ -z "$CODEX_CLI" ]; then
  echo ""
  echo "[!] 未检测到 Codex CLI"
  echo "    请从 https://codex.ai 下载桌面版 Codex"
  echo "    安装后重新运行本脚本"
  echo ""
  read -p "按回车键继续（假设已安装）..." 
  CODEX_CLI="/Applications/Codex.app/Contents/Resources/codex"
fi
echo "[OK] Codex CLI: $CODEX_CLI"

# 4. 检查 Codex 登录
echo "[...] 检查 Codex 登录状态..."
$CODEX_CLI login --check 2>/dev/null && echo "[OK] 已登录" || {
  echo "[!] 需要登录 Codex"
  $CODEX_CLI login
}

# 5. 安装依赖
echo "[...] 安装项目依赖..."
pnpm install
echo "[OK] 依赖安装完成"

# 6. 创建配置
if [ ! -f .env ]; then
  cp .env.example .env
  # 自动填写 Codex CLI 路径
  sed -i '' "s|# CODEX_REAL_BIN=.*|CODEX_REAL_BIN=$CODEX_CLI|" .env 2>/dev/null || true
  echo "[OK] .env 已创建"
else
  echo "[OK] .env 已存在"
fi

# 7. 创建数据目录
mkdir -p bridge_data/accounts bridge_data/runtime bridge_data/media bridge_data/logs

# 8. 推荐安装常用技能
echo ""
echo "============================================"
echo "  推荐安装常用技能"
echo "============================================"
echo ""
SKILLS_DIR="$HOME/.codex/skills"
mkdir -p "$SKILLS_DIR"

for skill in pdf PPT-master imagegen playwright; do
  if [ -d "$SKILLS_DIR/$skill" ]; then
    echo "[OK] 技能 $skill 已安装"
  else
    echo "[...] 技能 $skill 未安装"
    echo "     安装: cp -r /path/to/$skill $SKILLS_DIR/"
  fi
done

# 9. 微信扫码登录
echo ""
echo "============================================"
echo "  微信扫码登录"
echo "============================================"
echo "（用手机微信扫描二维码）"
echo ""
pnpm weixin:login

# 10. 完成
echo ""
echo "============================================"
echo "  安装完成！"
echo "============================================"
echo ""
echo "启动桥接："
echo "  ./bridge-runner.sh &"
echo ""
echo "开机自动启动（把 bridge-runner.sh 加入登录项）："
echo "  系统设置 → 通用 → 登录项 → 添加 bridge-runner.sh"
echo ""
echo "微信上支持的中文命令："
echo "  停止 中断 帮助 模型 新对话 快速 等等"
echo ""
echo "生成的文件在：bridge_data/files/"
