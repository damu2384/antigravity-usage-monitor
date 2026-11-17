#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$HOME/.gemini/config/plugins/usage-monitor"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "正在安装 Antigravity 用量监控插件..."
mkdir -p "$PLUGIN_DIR"

echo "$SRC_DIR" > /dev/null  # noop, keeps shellcheck quiet about unused var
cp -f  "$SRC_DIR/plugin.json"  "$PLUGIN_DIR/"
cp -f  "$SRC_DIR/hooks.json"   "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/assets"       "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/hooks"        "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/skills"       "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/sidecars"     "$PLUGIN_DIR/"

echo
echo "========================================================="
echo " 安装完成: $PLUGIN_DIR"
echo
echo " 请在 Antigravity 的插件页启用 \"用量监控\"，"
echo " 然后打开: [用量监控](sidecar://usage-monitor/usage_panel/)"
echo "========================================================="
