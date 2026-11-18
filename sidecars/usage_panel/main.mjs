import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Response, SidecarApp } from 'sidecar_sdk';
import {
  collectConversations,
  computeQuotaStats,
  computeTimeSeries,
  findConversation,
  ID_RE,
  readQuota,
  readSettings,
  writeQuota,
  writeSettings,
} from './lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const noStore = { 'Cache-Control': 'no-store' };

const app = new SidecarApp();

app.page('/', () => new Response(readFileSync(join(__dirname, 'index.html'), 'utf-8'), {
  contentType: 'text/html; charset=utf-8',
  headers: noStore,
}));

// 静态资源用 GET api 注册，以便自定义 content-type
for (const [route, file, contentType] of [
  ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
  ['/app.js', 'app.js', 'application/javascript; charset=utf-8'],
]) {
  app.api(route, () => new Response(readFileSync(join(__dirname, file), 'utf-8'), {
    contentType,
    headers: noStore,
  }), 'GET');
}

function buildSignature(all, selectedConvId, quota, settings, nowMs) {
  const minuteBucket = Math.floor(nowMs / 60_000);
  const convSig = all.map((c) => `${c.id}:${c.mtimeMs}:${c.fileSize}:${c.modelCalls}`).join('|');
  return `${minuteBucket}#${selectedConvId}#${JSON.stringify(quota)}#${JSON.stringify(settings)}#${convSig}`;
}

app.api('/api/tokens', (data = {}) => {
  const nowMs = Date.now();
  const all = collectConversations();
  const quota = readQuota();
  const settings = readSettings();

  const explicitConvId = typeof data.conversationId === 'string' && ID_RE.test(data.conversationId)
    ? data.conversationId
    : '';
  const activeConvId = app.config.conversationId || all[0]?.id || '';
  const selectedConvId = explicitConvId || activeConvId;

  const found = explicitConvId
    ? findConversation(explicitConvId, all)
    : (findConversation(selectedConvId, all) || all[0] || null);

  const resolvedId = found?.id || selectedConvId || '';
  const signature = buildSignature(all, resolvedId, quota, settings, nowMs);

  if (typeof data.signature === 'string' && data.signature === signature) {
    return { unchanged: true, signature };
  }

  // stepMetrics 体积大且只供后端聚合，不下发前端
  const current = found ? (({ stepMetrics, ...rest }) => rest)(found) : null;

  const totals = all.reduce((acc, c) => {
    acc.inputTokens += c.inputTokens;
    acc.outputTokens += c.outputTokens;
    acc.cacheReadTokens += c.cacheReadTokens;
    acc.billedTokens += c.billedTokens;
    acc.totalTokens += c.totalTokens;
    acc.modelCalls += c.modelCalls;
    acc.toolCalls += c.toolCalls;
    acc.turnCount += c.turnCount;
    acc.errorCount += c.errorCount || 0;
    acc.modelErrors += c.modelErrors || 0;
    acc.toolErrors += c.toolErrors || 0;
    return acc;
  }, {
    inputTokens: 0, outputTokens: 0, cacheReadTokens: 0,
    billedTokens: 0, totalTokens: 0, modelCalls: 0, toolCalls: 0, turnCount: 0,
    errorCount: 0, modelErrors: 0, toolErrors: 0,
  });

  totals.cacheHitRate = (totals.inputTokens + totals.cacheReadTokens) > 0
    ? Number(((totals.cacheReadTokens / (totals.inputTokens + totals.cacheReadTokens)) * 100).toFixed(1))
    : 0;

  return {
    unchanged: false,
    signature,
    activeConversationId: activeConvId || null,
    selectedConversationId: selectedConvId || null,
    current,
    conversations: all.map(({ turns, stepMetrics, topTools, ...summary }) => summary),
    totals,
    series: computeTimeSeries(all, nowMs),
    quota: computeQuotaStats(all, quota, nowMs),
    settings,
  };
}, 'GET');

app.api('/api/settings', (data) => writeSettings(data), 'POST');
app.api('/api/quota', (data) => writeQuota(data), 'POST');

app.run();
