/**
 * PostInvocation Hook — 每轮结束后在对话流末尾追加一条用量摘要。
 *
 * 只读取 hook 传入的真实 transcriptPath，不做任何估算。
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTranscript, readSettings } from '../sidecars/usage_panel/lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = dirname(__dirname);

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

function main() {
  const payload = readStdin();
  const convId = payload.conversationId || 'unknown';
  const transcriptPath = payload.transcriptPath;

  let text;
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

      if (readSettings().hook.showSessionTotal && parsed) {
        parts.push(`会话累计 ${fmt(parsed.totalTokens)}`);
      }

      text = `📊 ${parts.join(' · ')}`;
    } else if (parsed) {
      text = `📊 会话累计 ${fmt(parsed.totalTokens)}`;
    }
  }

  if (!text) text = '📊 用量统计就绪';

  const md = `> ${text} · [打开面板](sidecar://usage-monitor/usage_panel/)`;

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

main();
