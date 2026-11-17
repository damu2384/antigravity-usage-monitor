---
name: usage-monitor
description: 查询和分析 Antigravity 会话的 Token 用量、缓存命中率、交互轮次及模型消耗开销。当用户询问“查账”、“用了多少Token”、“各会话消耗”、“费用分析”时激活此技能。
---

# 用量监控与自然语言查账技能 (Usage Monitor Skill)

本技能赋予助手精确读取、统计并分析当前会话及全局所有会话 Token 消耗的能力。

## 何时激活
- 用户询问 Token 用量（如：“我当前用了多少 Token？”、“今天消耗了多少？”、“查账”）。
- 用户询问各任务开销对比（如：“哪个会话用的 Token 最多？”、“帮我分析下各轮次的消耗”）。
- 用户需要打开用量可视化看板。

## 执行操作指南

1. **读取数据源**：
   - 当前会话日志位于：`~/.gemini/antigravity/brain/<当前会话ID>/.system_generated/logs/transcript.jsonl`
   - 全局会话目录位于：`~/.gemini/antigravity/brain/`
2. **汇报格式要求**：
   - 必须提供**100% 真实数据**：输入 Tokens、输出 Tokens、缓存读取 Tokens、缓存命中率。
   - 标注当前会话包含的自然交互轮次、规划/执行步数以及工具调用次数。
   - 在回答末尾附带侧边栏看板入口：
     `[👉 在侧边栏打开完整用量看板](sidecar://usage_monitor/)`
