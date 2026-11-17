---
name: usage-monitor
description: 查询 Antigravity 会话的 Token 用量（输入 / 输出 / 缓存读取）、缓存命中率、模型调用次数与轮次明细，或打开用量面板。当用户问“我用了多少 Token”“哪个会话最费”“查一下用量”时使用。
---

# 用量监控

Antigravity 把每一步的真实 token 计数写在会话日志里：

```
~/.gemini/antigravity/brain/<conversationId>/.system_generated/logs/transcript.jsonl
```

`PLANNER_RESPONSE` 步包含 `input_tokens`、`output_tokens`、`cache_read_tokens`、`created_at` 与 `tool_calls`。**只有这些是真实可得的**。

## 查账方法

优先用 Node 直接解析日志（跨平台、无需额外依赖）：

```bash
node -e "
const {collectConversations}=await import('file://' + process.env.PLUGIN_ROOT + '/sidecars/usage_panel/lib/tokens.mjs');
const all=collectConversations();
for(const c of all.slice(0,10)) console.log(c.totalTokens, c.inputTokens, c.outputTokens, c.cacheReadTokens, c.title.slice(0,40));
" --input-type=module
```

如果是查当前会话，把 `<conversationId>` 换成当前会话 ID，直接读单个文件即可。

## 汇报要求

- 只报真实字段：输入、输出、缓存读取、总令牌、调用次数、轮次。
- **不要**声称能给出首字耗时（TTFT）或提示词按「系统/规则/工具/历史/结果」的精确拆分 —— transcript 里没有这些信息，任何这类数字都是编的。
- 需要时把用户引到面板：`[用量面板](sidecar://usage-monitor/usage_panel/)`
