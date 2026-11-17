# Antigravity 用量与 Token 实时监控侧边栏插件 (Usage Monitor)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Antigravity](https://img.shields.io/badge/Antigravity-Plugin-green.svg)](https://antigravity.google)

专为 **Google Antigravity** 打造的用量与 Token 监控侧边栏插件，支持在桌面端及 IDE 的右侧辅助面板（Auxiliary Pane）中实时展示当前会话与全局历史会话的多维度用量分析看板。

---

## 🌟 核心特色

1. **双维度灵活切换**：
   - **当前会话 (Current Conversation)**：实时追踪当前正在进行的交互。
   - **全部会话 (All Conversations)**：跨会话聚合统计，提供全局总令牌、会话用量消耗排行与详细卡片。
2. **6 大核心指标卡片（带微图 Sparkline）**：
   - **总令牌**：细分输入、输出、缓存读取总量。
   - **调用次数**：发起工具调用（文件读写、终端命令等）统计。
   - **缓存命中率**：提示词缓存优化与复用率。
   - **首字耗时 & 输出速度**：响应速度与推理效率监测。
   - **系统稳定性**：失败次数与成功率监控。
3. **上下文增长面积图 (Context Growth Chart)**：
   - 动态堆叠渐变区域，精确可视化多轮交互中上下文膨胀趋势。
4. **单轮请求拆解检查器 (Request Inspector)**：
   - 支持通过滑动条或翻页按钮，精确拆解任一轮的**系统提示词、规则文件、内置工具定义、历史消息与工具执行结果**。
5. **全自动跟随同步**：
   - 后台自动轮询重绘，无需手动刷新，对话进行时界面自动平滑更新。

---

## 🚀 安装方法

### 方式 1：一键脚本安装（推荐）

1. 克隆本仓库到本地：
   ```bash
   git clone https://github.com/damu2384/antigravity-usage-monitor.git
   cd antigravity-usage-monitor
   ```
2. 执行一键安装脚本：
   - **Windows**：双击运行 `install.bat`
   - **macOS / Linux**：终端执行 `bash install.sh`

### 方式 2：纯手动安装

直接将仓库内的 `sidecars/usage_monitor` 文件夹，复制到 Antigravity 全局配置目录中：
- **Windows**: `%USERPROFILE%\.gemini\config\sidecars\usage_monitor\`
- **macOS / Linux**: `~/.gemini/config/sidecars/usage_monitor/`

### 方式 3：团队 Git 项目仓库共享（开箱即用）
若团队在同一项目代码仓库下开发，可将本插件放入项目根目录：
```text
<项目根目录>/.agents/plugins/usage-monitor/
```
提交代码后，所有拉取该仓库的成员无需任何安装配置，Antigravity 会自动识别并加载该侧边栏插件！

---

## 💡 如何在 Antigravity 中打开？

安装完成后，在 Antigravity 任意对话中输入或点击链接：
> **`[用量监控](sidecar://usage_monitor/)`**

即可在右侧侧边栏一键弹出实时监控面板！

---

## 📄 License
[MIT](LICENSE)
