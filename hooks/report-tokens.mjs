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
 * 因此改成显式开关：settings.json 里 `{"hook":{"injectSummary":true}}` 才注入，
 * 并沿用 `userMessage`（唯一验证可用的类型）。默认不注入。
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
    join(CONFIG_ROOT, 'plugins', 'usage-monitor', 'sidecars', 'usage_panel', 'lib', 'tokens.mjs'),
    join(PLUGIN_ROOT, 'sidecars', 'usage_panel', 'lib', 'tokens.mjs'),
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

/** 输出空结果，什么都不注入。 */
function emitNothing() {
  process.stdout.write(JSON.stringify({ injectSteps: [] }));
}

async function main() {
  const payload = readStdin();
  const convId = payload.conversationId || 'unknown';
  const transcriptPath = payload.transcriptPath;

  const tokensPath = findTokensModule();
  if (!tokensPath) return emitNothing();

  const { parseTranscript, readSettings } = await import(pathToFileURL(tokensPath).href);

  // 默认关闭：注入摘要会作为真实用户消息进入轨迹并推高上下文
  const settings = readSettings();
  if (settings?.hook?.injectSummary !== true) return emitNothing();

  if (!transcriptPath) return emitNothing();

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
  if (settings.hook.showSessionTotal !== false && parsed) {
    parts.push(`会话累计 ${fmt(parsed.totalTokens)}`);
  }

  process.stdout.write(JSON.stringify({
    injectSteps: [{ userMessage: `📊 ${parts.join(' · ')} · ${PANEL_LINK}` }],
    terminationBehavior: '',
  }));
}

main().catch(() => emitNothing());
