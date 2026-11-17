/**
 * PostInvocation Hook — 每轮结束后在对话流末尾追加一条用量摘要。
 *
 * 只读取 hook 传入的真实 transcriptPath，不做任何估算。
 *
 * tokens.mjs 可能有两处位置：
 *   1. ~/.gemini/config/sidecars/usage_monitor/lib/tokens.mjs   ← 顶层 sidecar（本项目安装方式）
 *   2. <plugin>/sidecars/<name>/lib/tokens.mjs                  ← 纯插件内打包方式
 * 按顺序探测，避免安装形态不同就静默失效。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);
const CONFIG_ROOT = join(homedir(), '.gemini', 'config');

function findTokensModule() {
  const candidates = [
    // 1) 顶层 sidecar（本项目的安装方式）
    join(CONFIG_ROOT, 'sidecars', 'usage_monitor', 'lib', 'tokens.mjs'),
    // 2) 插件内打包
    join(PLUGIN_ROOT, 'sidecars', 'usage_panel', 'lib', 'tokens.mjs'),
    join(PLUGIN_ROOT, 'lib', 'tokens.mjs'),
  ];

  // 3) 兜底：扫描插件 sidecars/*/lib/tokens.mjs
  const sidecarsDir = join(PLUGIN_ROOT, 'sidecars');
  if (existsSync(sidecarsDir)) {
    try {
      for (const name of readdirSync(sidecarsDir)) {
        candidates.push(join(sidecarsDir, name, 'lib', 'tokens.mjs'));
      }
    } catch {
      // 忽略不可读目录
    }
  }

  return candidates.find((p) => existsSync(p)) || null;
}

function fmt(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString('en-US');
}

function readStdin() {
  try {
    const raw = readFileSync(0, 'utf-8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function emit(md) {
  process.stdout.write(JSON.stringify({
    injectSteps: [{
      systemMessage: {
        systemMessage: '',
        metadata: { user_markdown: md },
      },
    }],
    terminationBehavior: '',
  }));
}

async function main() {
  const payload = readStdin();
  const convId = payload.conversationId || 'unknown';
  const transcriptPath = payload.transcriptPath;

  const tokensPath = findTokensModule();

  // 找不到解析模块时不输出任何内容，而不是打印一个假数字
  if (!tokensPath) {
    emit('> 📊 用量统计：未找到 tokens.mjs，请重新安装插件');
    return;
  }

  const { parseTranscript, readSettings } = await import(pathToFileURL(tokensPath).href);

  let text = '';

  if (transcriptPath) {
    const parsed = parseTranscript(convId, transcriptPath);
    const lastTurn = parsed?.turns?.[parsed.turns.length - 1];

    if (lastTurn) {
      const parts = [
        `本轮 ${fmt(lastTurn.totalTokens)}`,
        `In ${fmt(lastTurn.inputTokens)}`,
        `Out ${fmt(lastTurn.outputTokens)}`,
        `Cache ${fmt(lastTurn.cacheReadTokens)}`,
      ];
      if (lastTurn.phaseSummary) parts.push(lastTurn.phaseSummary);
      if (lastTurn.durationSec) parts.push(`${lastTurn.durationSec}s`);
      if (lastTurn.toolCalls) parts.push(`${lastTurn.toolCalls} 工具`);

      if (readSettings().hook.showSessionTotal && parsed) {
        parts.push(`会话累计 ${fmt(parsed.totalTokens)}`);
      }

      text = `📊 ${parts.join(' · ')}`;
    } else if (parsed) {
      text = `📊 会话累计 ${fmt(parsed.totalTokens)}`;
    }
  }

  if (!text) text = '📊 用量统计就绪';

  emit(`> ${text} · [打开面板](sidecar://usage_monitor/)`);
}

main();
