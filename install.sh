#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$HOME/.gemini/config/plugins/usage-monitor"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "正在安装 Antigravity 用量监控..."

mkdir -p "$PLUGIN_DIR"
cp -f  "$SRC_DIR/plugin.json" "$PLUGIN_DIR/"
cp -f  "$SRC_DIR/hooks.json"  "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/assets"      "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/hooks"       "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/skills"      "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/sidecars"    "$PLUGIN_DIR/"

echo
echo "========================================================="
echo " 安装完成: $PLUGIN_DIR"
echo
echo " 1. 重启 Antigravity"
echo " 2. 侧边栏 → Extensions → 用量"
echo
echo " 注: 面板会归在 Extensions 分组下，这是该版本的组织方式。"
echo "========================================================="
