#!/usr/bin/env bash
set -e

echo "正在安装 Antigravity 用量监控侧边栏插件..."

TARGET_DIR="$HOME/.gemini/config/sidecars/usage_monitor"
mkdir -p "$TARGET_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp -f "$SCRIPT_DIR/sidecars/usage_monitor/"* "$TARGET_DIR/"

echo ""
echo "=============================================="
echo " 安装成功！"
echo " 插件已复制到: $TARGET_DIR"
echo " 在 Antigravity 中点击即可唤起侧边栏:"
echo " [用量监控](sidecar://usage_monitor/)"
echo "=============================================="
