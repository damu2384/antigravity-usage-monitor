import { SidecarApp, Response } from 'sidecar_sdk';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = new SidecarApp();

const BRAIN_DIR = join(homedir(), '.gemini', 'antigravity', 'brain');

function findActiveConversationId(preferredId) {
  if (preferredId && existsSync(join(BRAIN_DIR, preferredId, '.system_generated', 'logs', 'transcript.jsonl'))) {
    return preferredId;
  }
  if (!existsSync(BRAIN_DIR)) return null;
  try {
    const entries = readdirSync(BRAIN_DIR)
      .map(name => {
        const p = join(BRAIN_DIR, name, '.system_generated', 'logs', 'transcript.jsonl');
        if (existsSync(p)) {
          return { id: name, time: statSync(p).mtimeMs };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.time - a.time);
    return entries.length > 0 ? entries[0].id : null;
  } catch {
    return null;
  }
}

function parseTranscript(convId) {
  if (!convId) return null;
  const logPath = join(BRAIN_DIR, convId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!existsSync(logPath)) return null;

  try {
    const content = readFileSync(logPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const steps = [];
    for (const line of lines) {
      try {
        steps.push(JSON.parse(line));
      } catch {}
    }

    const plannerSteps = steps.filter(s => s.type === 'PLANNER_RESPONSE');
    let totalIn = 0;
    let totalOut = 0;
    let totalCache = 0;
    let toolCallsCount = 0;

    const timeline = [];
    for (let i = 0; i < plannerSteps.length; i++) {
      const s = plannerSteps[i];
      const inTok = s.input_tokens || 0;
      const outTok = s.output_tokens || 0;
      const cacheTok = s.cache_read_tokens || 0;
      const tools = s.tool_calls || [];
      const tStr = s.created_at || '';

      totalIn += inTok;
      totalOut += outTok;
      totalCache += cacheTok;
      toolCallsCount += tools.length;

      timeline.push({
        turn: i + 1,
        time: tStr.length >= 19 ? tStr.substring(11, 19) : '',
        input: inTok,
        output: outTok,
        cache: cacheTok,
        total: inTok + cacheTok,
        toolCount: tools.length,
        tools: tools.map(t => t.name)
      });
    }

    const cacheHitRate = (totalIn + totalCache) > 0
      ? ((totalCache / (totalIn + totalCache)) * 100).toFixed(1)
      : '0.0';

    return {
      conversationId: convId,
      turnCount: plannerSteps.length,
      totalTokens: totalIn + totalOut + totalCache,
      totalIn,
      totalOut,
      totalCache,
      cacheHitRate,
      toolCallsCount,
      timeline
    };
  } catch (err) {
    return { error: err.message };
  }
}

function getAllSessionsStats() {
  if (!existsSync(BRAIN_DIR)) return { sessions: [], global: {} };
  try {
    const entries = readdirSync(BRAIN_DIR);
    const sessions = [];
    let globalIn = 0, globalOut = 0, globalCache = 0, globalCalls = 0, globalTurns = 0;

    for (const name of entries) {
      const logPath = join(BRAIN_DIR, name, '.system_generated', 'logs', 'transcript.jsonl');
      if (!existsSync(logPath)) continue;

      const stats = parseTranscript(name);
      if (!stats || stats.error) continue;

      let title = '会话 ' + name.substring(0, 8);
      try {
        const content = readFileSync(logPath, 'utf-8');
        const lines = content.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const obj = JSON.parse(line);
          if (obj.type === 'USER_INPUT' && obj.content) {
            let clean = obj.content.replace(/<USER_REQUEST>|<\/USER_REQUEST>/g, '').trim();
            if (clean.length > 35) clean = clean.substring(0, 35) + '...';
            if (clean) { title = clean; break; }
          }
        }
      } catch {}

      globalIn += stats.totalIn;
      globalOut += stats.totalOut;
      globalCache += stats.totalCache;
      globalCalls += stats.toolCallsCount;
      globalTurns += stats.turnCount;

      sessions.push({
        id: name,
        title,
        turnCount: stats.turnCount,
        totalTokens: stats.totalTokens,
        totalIn: stats.totalIn,
        totalOut: stats.totalOut,
        totalCache: stats.totalCache,
        cacheHitRate: stats.cacheHitRate,
        toolCallsCount: stats.toolCallsCount,
        lastTime: stats.timeline.length > 0 ? stats.timeline[stats.timeline.length - 1].time : '--'
      });
    }

    sessions.sort((a, b) => b.totalTokens - a.totalTokens);

    const globalCacheRate = (globalIn + globalCache) > 0
      ? ((globalCache / (globalIn + globalCache)) * 100).toFixed(1)
      : '0.0';

    return {
      global: {
        totalSessions: sessions.length,
        totalTurns: globalTurns,
        totalTokens: globalIn + globalOut + globalCache,
        totalIn: globalIn,
        totalOut: globalOut,
        totalCache: globalCache,
        cacheHitRate: globalCacheRate,
        toolCallsCount: globalCalls
      },
      sessions
    };
  } catch (err) {
    return { error: err.message, sessions: [] };
  }
}

app.page('/', () => {
  return readFileSync(join(__dirname, 'index.html'), 'utf-8');
});

app.api('/api/stats', (data) => {
  if (data && data.scope === 'all') {
    return getAllSessionsStats();
  }
  const convId = (data && data.conversationId) || app.config.conversationId || findActiveConversationId();
  const stats = parseTranscript(convId);
  return stats || { error: 'No active conversation found' };
}, 'GET');

app.run();
