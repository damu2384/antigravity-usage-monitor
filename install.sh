#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="$HOME/.gemini/config"
SIDECAR_DIR="$CONFIG_DIR/sidecars/usage_monitor"
PLUGIN_DIR="$CONFIG_DIR/plugins/usage-monitor"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "正在安装 Antigravity 用量监控..."

# 1. 顶层 sidecar：侧边栏菜单里是一级项，点一次就能打开
mkdir -p "$SIDECAR_DIR"
cp -rf "$SRC_DIR/sidecars/usage_monitor/"* "$SIDECAR_DIR/"

# 2. 插件：每轮摘要 Hook + 自然语言查账 Skill
mkdir -p "$PLUGIN_DIR"
cp -f  "$SRC_DIR/plugin.json" "$PLUGIN_DIR/"
cp -f  "$SRC_DIR/hooks.json"  "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/assets"      "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/hooks"       "$PLUGIN_DIR/"
cp -rf "$SRC_DIR/skills"      "$PLUGIN_DIR/"

echo
echo "========================================================="
echo " 安装完成"
echo "  侧边栏面板: $SIDECAR_DIR"
echo "  插件目录:   $PLUGIN_DIR"
echo
echo " 侧边栏菜单里会出现一级项「用量」，点击即可打开。"
echo " 若没出现，请重启 Antigravity。"
echo "========================================================="
