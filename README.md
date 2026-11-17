# Antigravity 全能用量与 Token 监控套件 (v2.0.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Antigravity](https://img.shields.io/badge/Antigravity-Plugin-green.svg)](https://antigravity.google)
[![Architecture: Triple-Integrated](https://img.shields.io/badge/Architecture-Sidecar%20%2B%20Hook%20%2B%20Skill-purple.svg)](https://antigravity.google)

专为 **Google Antigravity** 深度定制的企业级用量与 Token 监控全能套件。采用 **“Sidecar 面板 + PostInvocation 自动播报 Hook + 自然语言查账 Skill” 三位一体架构**，实现 100% 真实数据追踪、Subagent/Swarm 多代理任务递归聚合、Orchestrator 规划/执行阶段拆解与多维时序分析。

---

## 🌟 核心能力全景图

### 1. 100% 绝对真实数据（告别硬编码与造假）
- **真·TTFT（首字响应耗时）**：基于用户输入时间戳与首个响应包的精准时间差实测计算。
- **真·输出速率**：按模型实际输出 Token 数与生成持续时间实时测速（tok/s）。
- **真·请求构成拆解**：动态测算并严格校验系统指令、规则上下文、工具声明定义、对话历史及工具输出的精准占比。

### 2. Subagent / Swarm 递归聚合与树状父子穿透
- 自动读取 `.system_generated/subagents/*.json` 与 `swarm/members.json`，递归防环追踪子任务。
- 自动将子代理/Swarm 成员的消耗聚合到主任务，并在轮次明细中醒目标注 `[🤖 子代理 · <Role>]`。

### 3. 自然轮次 (Natural Turn) 与 Orchestrator 阶段识别
- 摆脱底层杂乱的原始响应包，按用户提问聚合为自然交互轮次。
- 智能识别 Orchestrator 运行状态：清晰区分 **规划阶段 (Planning)** 与 **执行阶段 (Execution)**，标识如：`规划 1 次 + 执行 4 次 (共 5 步)`。

### 4. 7天按日 / 24小时时序堆叠分析
- **时间维度**：支持 7 天按日聚合与 24 小时按小时分布。
- **指标切换**：一键切换 **【总计用量】** 与 **【非缓存 (计费) Token】**，精确掌控实际 Token 预算。
- **检索与排序**：支持实时模糊搜索会话名称/ID，支持 **按用量**、**按最新活跃**、**按交互轮次** 3 种排序模式。

### 5. 三位一体形态完整度
- **Sidecar 辅助面板**：极具视觉冲击力的微图 Sparkline、上下文膨胀平滑渐变面积图、轮次回放滑动条。
- **PostInvocation Hook (`report-tokens.mjs`)**：每轮对话结束后，自动在聊天流末尾注入当前轮次用量摘要小卡片与直达链接。
- **自然语言查账 Skill (`usage-monitor`)**：让 AI 助手直接具备“查账”能力，对 AI 说一句“我今天花了多少 Token”，助手自动统计并汇报。

### 6. 高性能与零外网依赖
- **增量解析缓存**：基于文件 `mtimeMs + size` 做内存级增量缓存，毫秒级即时重绘，避免重复全量扫描。
- **纯本地离线资源**：彻底去除外部 CDN 依赖，纯本地 `styles.css` 与 `app.js`，内网离线秒级启动。

---

## 🚀 安装方法（一键安装）

### 方式 1：一键脚本（推荐）
1. 克隆本仓库：
   ```bash
   git clone https://github.com/damu2384/antigravity-usage-monitor.git
   cd antigravity-usage-monitor
   ```
2. 执行安装：
   - **Windows**：双击运行 `install.bat`
   - **macOS / Linux**：终端运行 `bash install.sh`

### 方式 2：团队 Git 项目仓库共享（免安装即插即用）
直接将整个目录放进项目代码仓库：
```text
<项目根目录>/.agents/plugins/usage-monitor/
```
提交 Git 后，团队全员拉取代码开箱即用！

---

## 💡 使用指南

1. **呼出侧边栏看板**：
   在 Antigravity 任意对话中点击或输入：
   > **`[用量监控](sidecar://usage_monitor/)`**

2. **自然语言直接查账**：
   直接在聊天框问助手：
   > “*帮我查下当前会话的用量消耗*” 或 “*我最近哪个任务 Token 消耗最高？*”

3. **轮次自动播报**：
   每轮对话结束时，系统会自动在对话流下方显示本轮真实消耗及看板快捷跳转入口。

---

## 📄 License
[MIT](LICENSE)
