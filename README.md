# Antigravity Usage Monitor

> 按任务与会话统计 Antigravity 的 **真实** Token 消耗：输入、输出、缓存读取，以及缓存命中率、额度窗口与 7 天 / 24 小时趋势。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 设计原则：只报能实测的东西

Antigravity 在 `transcript.jsonl` 的 `PLANNER_RESPONSE` 步里记录了以下字段：

| 字段 | 含义 |
| :--- | :--- |
| `input_tokens` | 本次调用计入计费的输入 token |
| `output_tokens` | 本次调用的输出 token |
| `cache_read_tokens` | 本次调用命中提示词缓存、按折扣计费的 token |
| `created_at` | 该步的时间戳 |
| `tool_calls` | 该步发起的工具调用列表 |

**本插件只展示能从上表推导出的数字。** 首字耗时（TTFT）和「系统提示词 / 规则 / 工具定义 / 历史消息 / 工具结果」这类提示词内部拆分，`transcript.jsonl` 里并不存在，因此本项目**不提供**，也不编造。

---

## 功能

### 1. 当前任务视图

- **四张统计卡**：总令牌、缓存命中（含命中率）、计费用量（输入 + 输出）、模型调用次数（含轮次、工具调用数与真实异常数）。
- **常用工具分布**：按真实 `tool_calls` 频次统计展示本任务 Top 工具标签（如 `run_command ×40`）。
- **上下文增长图**：按轮次绘制每轮**末次调用**的 `input_tokens + cache_read_tokens`，即该轮真实的上下文规模；支持鼠标悬停查看各轮次数值。数据点不足 2 个时不绘制。
- **轮次明细**：每轮的 In / Out / Cache、模型调用次数、真实墙钟耗时（首步到末步）、工具调用数、真实异常标签（读取 `ERROR_MESSAGE` 与错误/无效状态的 `GENERIC` 步），以及三色占比条。
- **规划 / 执行阶段**：仅当日志中出现真实信号时才标注 —— `SYSTEM_MESSAGE` 含 `Plan mode is off`（进入执行）、含 `[plan review]`（回到规划），或工具调用中出现 `exit_plan_mode` / `enter_plan_mode`。没有信号就不显示。

### 2. 全部任务视图

- 全局汇总四卡：总令牌、缓存命中、计费用量、模型调用。
- **额度窗口**：最近 5 小时与本周（周一 00:00 起）的用量进度条。上限由你在设置里按实际套餐填写 —— 这是**本地记账**，不是官方配额查询。
- **消耗趋势**：7 天按日 / 24 小时按小时，堆叠展示输入 / 输出 / 缓存；可切换「总计」与「非缓存」两种口径。时区按本地时间分桶。
- **会话列表**：关键词搜索 + 按最近活跃 / 总用量 / 非缓存用量三种排序，点击可下钻到该会话的轮次明细。

### 3. Subagent 与 Swarm 归集

自动读取 `.system_generated/subagents/*.json` 与 `.system_generated/swarm/members.json`，把子会话的用量递归归集到根任务（带环检测），并在轮次列表里以 `[子代理 · <角色>]` 标注其独立占比。

### 4. 每轮摘要 Hook（默认关闭）

`hooks/report-tokens.mjs` 可以在每轮结束时输出一行用量摘要。**默认关闭**，原因是实测出的两个问题：

1. 文档推荐的 `systemMessage + metadata.user_markdown`（模型读不到、UI 渲染为 Markdown）在 Antigravity 2.32.1 上**每轮都抛** `type mismatch: cannot convert string to message`，`language_server.log` 里连续 80 条，无一次成功。这条路径在当前版本不可用。
2. 退回 `userMessage`（plain string，类型明确）可以跑通，但它会被当成**真实用户消息**写进轨迹，导致上下文凭空增长、Token 消耗上升 —— 摘要不该有这种代价。

需要时可在面板右上角「设置」里直接勾选开启，或编辑 `sidecars/usage_panel/settings.json`：

```json
{ "hook": { "showSessionTotal": true, "injectSummary": true } }
```

### 5. Skill

`skills/usage-monitor/SKILL.md` 让 Agent 能用自然语言查账，并明确约束它不得编造 TTFT 或提示词拆分。

### 6. 性能

- 后端以 `mtimeMs + size` 做文件级增量缓存，并生成数据变更签名；无变更时 `/api/tokens` 直接返回 `unchanged: true`，前端跳过 DOM 重建。
- Hook 默认关闭时零额外模块加载直接短路退出。
- 面板每 3 秒轮询，页面隐藏时暂停。
- 静态资源全部本地，无外部 CDN，内网 / 离线可用。

---

## 安装

```bash
git clone https://github.com/damu2384/antigravity-usage-monitor.git ~/.gemini/config/plugins/usage-monitor
```

Windows：

```powershell
git clone https://github.com/damu2384/antigravity-usage-monitor.git "$env:USERPROFILE\.gemini\config\plugins\usage-monitor"
```

要求 **Node.js 18+**（ES Module 支持）。重启 Antigravity 后，在 Customizations / 插件页启用 `usage-monitor`。

也可以用安装脚本：

```powershell
.\install.bat      # Windows
bash install.sh    # macOS / Linux
```

### 关于菜单位置（实测结论）

面板会出现在侧边栏的 **Extensions** 分组下，需要点两下。这是 Antigravity 2.32.1 的插件式 sidecar 组织方式，**不是本项目可以绕过的**。

语言服务器日志中有 `MIGRATION_ID_BUILTIN_SIDECARS_TO_PLUGINS: COMPLETED`，说明该版本正把 sidecar 统一收进插件命名空间。实测把同一份 sidecar 放到 `~/.gemini/config/sidecars/usage_monitor/`（顶层目录）后，**重启不会加载它**（`sidecar_data/` 不生成对应目录，`GetSidecars` RPC 也不返回），所以顶层目录在 2.32.1 上不生效。

想要单击直达，只有一个办法：直接打开 sidecar 的 URL（`GetSidecars` 返回的 `baseUrl`），或把这个链接存成浏览器书签。

---

## 使用

侧边栏「Extensions → 用量」打开面板，或在任意对话中输出：

```
[用量监控](sidecar://usage-monitor/usage_panel/)
```

也可以直接问 Agent：

- 「当前会话一共用了多少 Token？」
- 「哪个会话消耗最多？」
- 「这周我用了多少？」

---

## 目录结构

```text
usage-monitor/
├── plugin.json
├── hooks.json
├── assets/logo.svg
├── hooks/report-tokens.mjs           # 每轮摘要（默认关闭）
├── skills/usage-monitor/SKILL.md     # 自然语言查账
└── sidecars/usage_panel/
    ├── sidecar.json
    ├── package.json
    ├── main.mjs                      # HTTP 服务 + /api/tokens
    ├── index.html
    ├── app.js
    ├── styles.css
    └── lib/tokens.mjs                # 解析、归集、时序、额度
```

---

## 数据与隐私

- 只读本地文件：`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`，以及 `ANTIGRAVITY_APP_DATA`、`antigravity-ide`、`antigravity-cli` 下对应的 brain 目录（存在时）。
- 全部解析与渲染在本地完成，不向任何外部服务发送数据。
- 面板设置在 `sidecars/usage_panel/` 下的 `quota.json` / `settings.json`（已加入 `.gitignore`）。

---

## License

[MIT](LICENSE)
