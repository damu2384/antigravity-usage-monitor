#!/usr/bin/env bash
set -e

echo "正在安装 Antigravity 全能用量监控套件 (v2.0.0)..."

CONFIG_DIR="$HOME/.gemini/config"
SIDECAR_DIR="$CONFIG_DIR/sidecars/usage_monitor"
SKILL_DIR="$CONFIG_DIR/skills/usage-monitor"

mkdir -p "$SIDECAR_DIR" "$SKILL_DIR"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "[1/3] 部署 Sidecar 监控面板..."
cp -rf "$SCRIPT_DIR/sidecars/usage_monitor/"* "$SIDECAR_DIR/"

echo "[2/3] 安装自然语言查账技能 (Skill)...
cp -rf "$SCRIPT_DIR/skills/usage-monitor/"* "$SKILL_DIR/"

echo "[3/3] 部署 PostInvocation 自动播报 Hook..."
if [ -f "$SCRIPT_DIR/hooks.json" ]; then
    cp -f "$SCRIPT_DIR/hooks.json" "$CONFIG_DIR/hooks.json"
fi
if [ -d "$SCRIPT_DIR/hooks" ]; then
    mkdir -p "$CONFIG_DIR/hooks"
    cp -rf "$SCRIPT_DIR/hooks/"* "$CONFIG_DIR/hooks/"
fi

echo ""
echo "=============================================================="
echo " 🎉 安装成功！用量监控全能套件已部署就绪。"
echo " - 侧边栏面板: sidecar://usage_monitor/"
echo " - 自然语言查账: 直接对 AI 提问 “查账” 或 “我用了多少Token”"
echo " - 轮次自动播报: 每次对话完成自动呈现用量小卡片"
echo "=============================================================="
