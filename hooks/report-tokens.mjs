/**
 * PostInvocation Hook — 可选的每轮用量摘要。
 *
 * 默认 **关闭**，原因有两个真实问题：
 *
 *   1. 用 `systemMessage + metadata.user_markdown`（文档推荐、模型读不到）时，
 *      语言服务器每轮都抛 `type mismatch: cannot convert string to message`
 *      （见 language_server.log，连续 80 条，无一次成功），这条路径在本版本不可用。
 *
 *   2. 退而用 `userMessage` 能跑通，但它会被当成**真实用户消息**写进轨迹，
 *      导致每轮上下文凭空增长、Token 消耗上升。这不是摘要该有的代价。
 *
 * 因此默认关闭；只有 settings.json 中 `{"hook":{"injectSummary":true}}` 时才加载解析模块并注入。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);
const CONFIG_ROOT = join(homedir(), '.gemini', 'config');

const PANEL_LINK = '[打开面板](sidecar://usage-monitor/usage_panel/)';

function findTokensModule() {
  const candidates = [
    join(PLUGIN_ROOT, 'sidecars', 'usage_panel', 'lib', 'tokens.mjs'),
    join(CONFIG_ROOT, 'plugins', 'usage-monitor', 'sidecars', 'usage_panel', 'lib', 'tokens.mjs'),
    join(PLUGIN_ROOT, 'lib', 'tokens.mjs'),
  ];

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

/**
 * 零依赖快速读取 settings.json，未开启时直接跳过动态 import(tokens.mjs)
 */
function quickReadSettings(tokensPath) {
  const sidecarRoot = dirname(dirname(tokensPath));
  const settingsPath = join(sidecarRoot, 'settings.json');
  try {
    return JSON.parse(readFileSync(settingsPath, 'utf-8'));
  } catch {
    return null;
  }
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

function emitNothing() {
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
}

async function main() {
  const tokensPath = findTokensModule();
  if (!tokensPath) return emitNothing();

  // 快速短路：未显式开启时，直接返回空结果，避免解析 stdin 与加载整个模块
  const quick = quickReadSettings(tokensPath);
  if (quick?.hook?.injectSummary !== true) return emitNothing();

  const payload = readStdin();
  const convId = payload.conversationId || 'unknown';
  const transcriptPath = payload.transcriptPath;
  if (!transcriptPath) return emitNothing();

  const { parseTranscript, readSettings } = await import(pathToFileURL(tokensPath).href);
  const settings = readSettings();
  if (settings?.hook?.injectSummary !== true) return emitNothing();

  const parsed = parseTranscript(convId, transcriptPath);
  const lastTurn = parsed?.turns?.[parsed.turns.length - 1];
  if (!lastTurn) return emitNothing();

  const parts = [
    `本轮 ${fmt(lastTurn.totalTokens)}`,
    `In ${fmt(lastTurn.inputTokens)}`,
    `Out ${fmt(lastTurn.outputTokens)}`,
    `Cache ${fmt(lastTurn.cacheReadTokens)}`,
  ];
  if (lastTurn.toolCalls) parts.push(`${lastTurn.toolCalls} 工具`);
  if (lastTurn.errorCount) parts.push(`${lastTurn.errorCount} 异常`);
  if (settings.hook.showSessionTotal !== false && parsed) {
    parts.push(`会话累计 ${fmt(parsed.totalTokens)}`);
  }

  process.stdout.write(JSON.stringify({
    injectSteps: [{ userMessage: `📊 ${parts.join(' · ')} · ${PANEL_LINK}` }],
    terminationBehavior: '',
  }));
}

main().catch(() => emitNothing());
