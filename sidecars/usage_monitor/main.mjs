import { SidecarApp, Response } from 'sidecar_sdk';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseConversation, getAllConversationsOverview } from './lib/tokens.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = new SidecarApp();

// 主页与本地静态资源路由（彻底摆脱外部 CDN，实现纯本地离线闪电加载）
app.page('/', () => {
  return readFileSync(join(__dirname, 'index.html'), 'utf-8');
});

app.page('/styles.css', () => {
  const css = readFileSync(join(__dirname, 'public', 'styles.css'), 'utf-8');
  return new Response(css, { contentType: 'text/css' });
});

app.page('/app.js', () => {
  const js = readFileSync(join(__dirname, 'public', 'app.js'), 'utf-8');
  return new Response(js, { contentType: 'application/javascript' });
});

// 数据路由
app.api('/api/stats', (data = {}) => {
  if (data.scope === 'all') {
    return getAllConversationsOverview({
      search: data.search,
      sortBy: data.sortBy
    });
  }

  const convId = data.conversationId || app.config.conversationId;
  if (!convId) {
    // 自动选取最近活跃的会话
    const overview = getAllConversationsOverview();
    if (overview.sessions && overview.sessions.length > 0) {
      return overview.sessions[0];
    }
    return { error: '未找到活动会话' };
  }

  const result = parseConversation(convId);
  return result || { error: `未找到会话 ${convId}` };
}, 'GET');

app.run();
