---
name: usage-monitor
description: 查询 Antigravity 会话的 Token 用量（输入 / 输出 / 缓存读取）、缓存命中率、模型调用次数、常用工具与异常记录，或打开用量面板。当用户问“我用了多少 Token”“哪个会话最费”“查一下用量”时使用。
---

# 用量监控

Antigravity 把每一步的真实 token 计数写在会话日志里：

```
~/.gemini/antigravity/brain/<conversationId>/.system_generated/logs/transcript.jsonl
```

`PLANNER_RESPONSE` 步包含 `input_tokens`、`output_tokens`、`cache_read_tokens`、`created_at` 与 `tool_calls`；`ERROR_MESSAGE` 和带错误状态的 `GENERIC` 步记录真实异常。**只有这些是真实可得的**。

## 查账方法

用 Node 直接调用插件自带解析引擎（跨平台，Windows / macOS / Linux 通用，无需 `PLUGIN_ROOT`）：

```bash
node --input-type=module -e "
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const p = join(homedir(), '.gemini', 'config', 'plugins', 'usage-monitor', 'sidecars', 'usage_panel', 'lib', 'tokens.mjs');
const { collectConversations } = await import(pathToFileURL(p).href);
for (const c of collectConversations().slice(0, 10)) {
  console.log(c.id.slice(0, 8), 'total:', c.totalTokens, 'billed:', c.billedTokens, 'in:', c.inputTokens, 'out:', c.outputTokens, 'cache:', c.cacheReadTokens, 'errs:', c.errorCount, c.title.slice(0, 40));
}
"
```

如果是查当前会话，把目标 `conversationId` 传入 `findConversation(id, collectConversations())` 即可。

## 汇报要求

- 只报真实字段：输入、输出、缓存读取、计费合计（输入+输出）、总令牌、调用次数、轮次、常用工具（`topTools`）、异常计数（`errorCount`）。
- **不要**声称能给出首字耗时（TTFT）或提示词按「系统/规则/工具/历史/结果」的精确拆分 —— transcript 里没有这些信息，任何这类数字都是编的。
- 需要时把用户引到面板：`[用量面板](sidecar://usage-monitor/usage_panel/)`
