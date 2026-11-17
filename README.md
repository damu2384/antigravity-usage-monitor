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

**本插件只展示能从上表推导出的数字。** 首字耗时（TTFT）和「系统提示词 / 规则 / 工具定义 / 历史消息 / 工具结果」这类提示词内部拆分，`transcript.jsonl` 里并不存在，因此本项目**不提供**，也不编造。需要更细的归因时，请以 `billedTokens`（输入 + 输出）与 `cacheReadTokens` 两个真实口径为准。

---

## 功能

### 1. 当前任务视图

- **四张统计卡**：总令牌、缓存命中（含命中率）、计费用量（输入 + 输出）、模型调用次数（含轮次与工具调用数）。
- **上下文增长图**：按轮次绘制每轮**末次调用**的 `input_tokens + cache_read_tokens`，即该轮真实的上下文规模。数据点不足 2 个时不绘制，而不是画一条假曲线。
- **轮次明细**：每轮的 In / Out / Cache、模型调用次数、真实墙钟耗时（首步到末步）、工具调用，以及三色占比条。
- **规划 / 执行阶段**：仅当日志中出现真实信号时才标注 —— `SYSTEM_MESSAGE` 含 `Plan mode is off`（进入执行）、含 `[plan review]`（回到规划），或工具调用中出现 `exit_plan_mode` / `enter_plan_mode`。没有信号就不显示，不臆测。

### 2. 全部任务视图

- 全局汇总四卡：总令牌、缓存命中、计费用量、模型调用。
- **额度窗口**：最近 5 小时与本周（周一 00:00 起）的用量进度条。上限由你在设置里按实际套餐填写 —— 这是**本地记账**，不是官方配额查询。
- **消耗趋势**：7 天按日 / 24 小时按小时，堆叠展示输入 / 输出 / 缓存；可切换「总计」与「非缓存」两种口径。时区按本地时间分桶。
- **会话列表**：关键词搜索 + 按最近活跃 / 总用量 / 非缓存用量三种排序，点击可下钻到该会话的轮次明细。

### 3. Subagent 与 Swarm 归集

自动读取 `.system_generated/subagents/*.json` 与 `.system_generated/swarm/members.json`，把子会话的用量递归归集到根任务（带环检测），并在轮次列表里以 `[子代理 · <角色>]` 标注其独立占比。

### 4. 形态

- **Sidecar 面板**：右侧辅助面板中的完整 UI（**装在顶层目录，侧边栏一级菜单项，单击直达**）。
- **PostInvocation Hook**：每轮结束后在对话流末尾追加一行摘要（本轮 / In / Out / Cache / 阶段 / 耗时 / 工具数 / 会话累计），附带打开面板的链接；可在设置中关闭「会话累计」。
- **Skill**：让 Agent 能用自然语言查账，并明确约束它不得编造 TTFT 或提示词拆分。

### 5. 性能

- 以 `mtimeMs + size` 做文件级增量缓存，未变更的 transcript 不会重复解析。
- 面板每 3 秒轮询，页面隐藏时暂停。
- 静态资源全部本地，无外部 CDN，内网 / 离线可用。

---

## 安装

> [!IMPORTANT]
> **面板必须装成顶层 sidecar，不要放进 `plugins/`。**
>
> 这是实测得出的：sidecar 若位于 `plugins/<plugin>/sidecars/<name>/`，平台会把它归入
> 侧边栏的 **Extensions** 折叠组，打开面板要多点两步。
> 放在 `~/.gemini/config/sidecars/<name>/` 则是**一级菜单项，单击直达**。
>
> 正确布局：
> - 面板 → `~/.gemini/config/sidecars/usage_monitor/`
> - Hook / Skill → `~/.gemini/config/plugins/usage-monitor/`

一键安装（会装到上述两个正确位置）：

```powershell
# Windows
.\install.bat
```

```bash
# macOS / Linux
bash install.sh
```

要求 **Node.js 18+**（ES Module 支持）。安装后重启 Antigravity，侧边栏菜单会出现一级项「用量」。

手动安装：

| 内容 | 目标位置 |
| :--- | :--- |
| `sidecars/usage_monitor/` | `~/.gemini/config/sidecars/usage_monitor/` |
| `plugin.json`、`hooks.json`、`hooks/`、`skills/`、`assets/` | `~/.gemini/config/plugins/usage-monitor/` |

---

## 使用

侧边栏菜单点击「用量」即可打开，或在任意对话中输出：

```
[用量监控](sidecar://usage_monitor/)
```

也可以直接问 Agent：

- 「当前会话一共用了多少 Token？」
- 「哪个会话消耗最多？」
- 「这周我用了多少？」

---

## 目录结构

```text
usage-monitor/
├── plugin.json                      # 插件清单（Hook + Skill）
├── hooks.json
├── assets/logo.svg
├── hooks/report-tokens.mjs          # 每轮摘要 Hook
├── skills/usage-monitor/SKILL.md    # 自然语言查账
└── sidecars/usage_monitor/          # → 复制到 ~/.gemini/config/sidecars/
    ├── sidecar.json
    ├── package.json
    ├── main.mjs                     # HTTP 服务 + /api/tokens
    ├── index.html
    ├── app.js
    ├── styles.css
    └── lib/tokens.mjs               # 解析、归集、时序、额度
```

---

## 数据与隐私

- 只读本地文件：`~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`，以及 `ANTIGRAVITY_APP_DATA`、`antigravity-ide`、`antigravity-cli` 下对应的 brain 目录（存在时）。
- 全部解析与渲染在本地完成，不向任何外部服务发送数据。
- 面板设置在 sidecar 目录的 `quota.json` / `settings.json`（已加入 `.gitignore`）。

---

## License

[MIT](LICENSE)
