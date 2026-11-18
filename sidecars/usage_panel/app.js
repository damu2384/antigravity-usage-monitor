/**
 * 用量监控 — 前端控制器
 *
 * 数据诚实原则：界面上每个数字都来自 transcript.jsonl 的真实字段
 * （input_tokens / output_tokens / cache_read_tokens / created_at / tool_calls / status / error）。
 * 算不出来的指标（首字耗时、提示词切分）不展示，而不是编造。
 */

const ID_RE = /^[0-9a-f-]{8,}$/i;

const state = {
  tab: 'current',
  data: null,
  signature: null,
  selectedConvId: null,
  userPinned: false,
  search: '',
  sort: 'recent',
  chartMode: 'hourly',   // 'hourly' | 'daily'
  chartMetric: 'total',  // 'total' | 'billed'
};

/* ---------------- 工具 ---------------- */

function getHostConvId() {
  const fromSdk = window.sidecar?.conversationId;
  if (typeof fromSdk === 'string' && ID_RE.test(fromSdk)) return fromSdk;
  const fromUrl = new URLSearchParams(window.location.search).get('conversationId');
  if (typeof fromUrl === 'string' && ID_RE.test(fromUrl)) return fromUrl;
  return '';
}

function apiFetch(url, options) {
  if (window.sidecar?.fetch) return window.sidecar.fetch(url, options);
  return fetch(url, options);
}

function fmt(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 10_000) return `${(num / 1_000).toFixed(1)}k`;
  return num.toLocaleString('en-US');
}

function exact(n) {
  return (Number(n) || 0).toLocaleString('en-US');
}

function fmtTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function fmtClock(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('zh-CN', { hour12: false });
}

function esc(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function seg(active, attr, value, label) {
  return `<button class="seg-btn ${active ? 'active' : ''}" ${attr}="${value}">${label}</button>`;
}

/* ---------------- 统计卡片 ---------------- */

function renderStatCards(el, s) {
  const cacheRate = s.cacheHitRate ?? 0;
  const errs = s.errorCount || 0;
  const errTip = errs ? `模型报错 ${s.modelErrors || 0} · 工具失败 ${s.toolErrors || 0}` : '';
  const callFoot = errs
    ? `${s.turnCount ?? 0} 轮 · ${s.toolCalls ?? 0} 工具 · <span style="color:var(--c-danger)">${errs} 异常</span>`
    : `${s.turnCount ?? 0} 轮 · ${s.toolCalls ?? 0} 次工具`;

  el.innerHTML = `
    <div class="stat">
      <div class="stat-label"><i class="dot dot-total"></i>总令牌</div>
      <div class="stat-value" title="${exact(s.totalTokens)}">${fmt(s.totalTokens)}</div>
      <div class="stat-foot">输入 ${fmt(s.inputTokens)} · 输出 ${fmt(s.outputTokens)}</div>
    </div>
    <div class="stat">
      <div class="stat-label"><i class="dot dot-cache"></i>缓存命中</div>
      <div class="stat-value" title="${exact(s.cacheReadTokens)}">${fmt(s.cacheReadTokens)}</div>
      <div class="stat-foot">命中率 ${cacheRate}%</div>
    </div>
    <div class="stat">
      <div class="stat-label"><i class="dot dot-input"></i>计费用量</div>
      <div class="stat-value" title="${exact(s.billedTokens)}">${fmt(s.billedTokens)}</div>
      <div class="stat-foot">输入 + 输出，不含缓存</div>
    </div>
    <div class="stat">
      <div class="stat-label"><i class="dot dot-output"></i>模型调用</div>
      <div class="stat-value">${s.modelCalls ?? 0}<span class="unit"> 次</span></div>
      <div class="stat-foot" title="${esc(errTip)}">${callFoot}</div>
    </div>
  `;
}

/* ---------------- 顶栏 / 切换 ---------------- */

function switchTab(tab) {
  state.tab = tab;
  document.querySelectorAll('.seg-btn[data-tab]').forEach((btn) => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
  });
  document.getElementById('view-current').classList.toggle('active', tab === 'current');
  document.getElementById('view-history').classList.toggle('active', tab === 'history');
}

/* ---------------- 常用工具分布 ---------------- */

function renderTopTools(el, tools) {
  if (!tools || !tools.length) {
    el.innerHTML = '';
    return;
  }
  el.innerHTML = `
    <div class="tools-bar">
      <span class="faint" style="font-size:9.5px">常用工具:</span>
      ${tools.slice(0, 6).map((t) => `<span class="tool-pill">${esc(t.name)}<b>×${t.count}</b></span>`).join('')}
    </div>
  `;
}

/* ---------------- 当前会话 ---------------- */

function renderCurrent() {
  const banner = document.getElementById('current-banner');
  const cards = document.getElementById('current-cards');
  const toolsEl = document.getElementById('current-tools');
  const chart = document.getElementById('current-chart');
  const turnsEl = document.getElementById('turns-list');
  const countEl = document.getElementById('turn-count');

  const hostConvId = getHostConvId();
  const activeId = hostConvId || state.data?.activeConversationId || state.data?.conversations?.[0]?.id || '';
  const cur = state.data?.current;

  if (!cur) {
    banner.innerHTML = `<div class="card"><div class="empty">${
      hostConvId ? '当前会话正在进行首次推理，完成后会自动出现统计' : '还没有任何用量记录'
    }</div></div>`;
    renderStatCards(cards, { totalTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, billedTokens: 0, modelCalls: 0, turnCount: 0, toolCalls: 0, cacheHitRate: 0, errorCount: 0 });
    toolsEl.innerHTML = '';
    chart.innerHTML = '';
    countEl.textContent = '';
    turnsEl.innerHTML = '';
    return;
  }

  const isLive = Boolean(activeId && cur.id === activeId);
  banner.innerHTML = `
    <div class="card" style="margin-bottom:8px">
      <div class="row between gap8" style="align-items:flex-start">
        <div style="min-width:0;flex:1">
          <div style="font-size:11.5px;font-weight:600;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(cur.title)}</div>
          <div class="faint mono" style="font-size:9.5px">${esc(cur.id.slice(0, 8))} · 更新 ${fmtTime(cur.updatedAt)}</div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          ${isLive
            ? '<span class="tag tag-live">当前会话</span>'
            : `<button class="seg-btn" id="back-active" style="border:1px solid var(--border)">回到当前</button>`}
          ${cur.subagentCount ? `<div class="faint" style="font-size:9.5px;margin-top:3px">含 ${cur.subagentCount} 个子代理</div>` : ''}
        </div>
      </div>
    </div>
  `;

  renderStatCards(cards, cur);
  renderTopTools(toolsEl, cur.topTools);
  chart.innerHTML = renderContextChart(cur.turns);
  bindContextChartEvents(chart);
  countEl.textContent = `${cur.turns.length} 轮`;

  if (!cur.turns.length) {
    turnsEl.innerHTML = `<div class="empty">暂无轮次记录</div>`;
    return;
  }

  turnsEl.innerHTML = [...cur.turns].reverse().map((t) => {
    const total = t.totalTokens || 0;
    const pIn = total ? (t.inputTokens / total) * 100 : 0;
    const pOut = total ? (t.outputTokens / total) * 100 : 0;
    const pCache = total ? (t.cacheReadTokens / total) * 100 : 0;
    const title = t.isSubagent ? esc(t.prompt) : `#${t.index} ${esc(t.prompt)}`;
    const errTip = t.errorCount ? `模型报错 ${t.modelErrors || 0} · 工具失败 ${t.toolErrors || 0}` : '';

    return `
      <div class="turn">
        <div class="turn-top">
          <div class="turn-title" title="${esc(t.prompt)}">${title}</div>
          <div class="turn-total" title="${exact(total)}">${fmt(total)}</div>
        </div>
        <div class="turn-meta">
          <span>In ${fmt(t.inputTokens)}</span>
          <span>Out ${fmt(t.outputTokens)}</span>
          <span>Cache ${fmt(t.cacheReadTokens)}</span>
          <span>${t.modelCalls} 次调用</span>
          ${t.toolCalls ? `<span>${t.toolCalls} 工具</span>` : ''}
          ${t.durationSec ? `<span>${t.durationSec}s</span>` : ''}
          ${t.phaseSummary ? `<span class="tag tag-phase">${esc(t.phaseSummary)}</span>` : ''}
          ${t.isSubagent ? '<span class="tag tag-sub">子代理</span>' : ''}
          ${t.errorCount ? `<span class="tag tag-err" title="${esc(errTip)}">⚠ ${t.errorCount} 异常</span>` : ''}
          <span>${fmtClock(t.createdAt)}</span>
        </div>
        <div class="bar">
          <i class="bar-in" style="width:${pIn.toFixed(2)}%"></i>
          <i class="bar-out" style="width:${pOut.toFixed(2)}%"></i>
          <i class="bar-cache" style="width:${pCache.toFixed(2)}%"></i>
        </div>
      </div>
    `;
  }).join('');
}

/* ---------------- 上下文增长图（无变形 Y 轴 + 悬停点位） ---------------- */

function renderContextChart(turns) {
  const pts = (turns || []).filter((t) => !t.isSubagent && t.contextTokens > 0);
  if (pts.length < 2) {
    return `<div class="card" style="margin-bottom:8px">
      <div class="card-title" style="margin-bottom:5px">上下文增长</div>
      <div class="empty">轮次不足，暂不绘制趋势</div>
    </div>`;
  }

  const peak = Math.max(...pts.map((t) => t.contextTokens));
  const maxV = Math.ceil((peak * 1.12) / 10000) * 10000 || 10000;
  const n = pts.length;

  // 归一化到 0..100，Y 轴文字与高亮圆点用 HTML 层渲染，不受宽窄拉伸影响
  const norm = pts.map((t, i) => ({
    xPct: (i / (n - 1)) * 100,
    yPct: 100 - (t.contextTokens / maxV) * 100,
    index: t.index,
    ctx: t.contextTokens,
    time: fmtClock(t.endedAt || t.createdAt),
  }));

  let dLine = `M ${norm[0].xPct.toFixed(2)} ${norm[0].yPct.toFixed(2)}`;
  for (let i = 1; i < norm.length; i++) {
    dLine += ` L ${norm[i].xPct.toFixed(2)} ${norm[i].yPct.toFixed(2)}`;
  }
  const dArea = `${dLine} L 100 100 L 0 100 Z`;
  const last = norm[n - 1];
  const defaultReadout = `峰值 ${fmt(peak)}`;

  const hitsHtml = norm.map((p) => {
    const tip = `#${p.index} · ${fmt(p.ctx)} (${p.time})`;
    return `<div class="chart-hit" data-x="${p.xPct.toFixed(2)}" data-y="${p.yPct.toFixed(2)}" data-tip="${esc(tip)}"></div>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:8px">
      <div class="row between" style="margin-bottom:5px">
        <span class="card-title">上下文增长</span>
        <span class="faint mono" id="ctx-readout" data-default="${esc(defaultReadout)}" style="font-size:9.5px">${defaultReadout}</span>
      </div>
      <div class="legend" style="margin-bottom:5px">
        <span><i class="dot dot-cache"></i>每轮末次调用的上下文（输入 + 缓存读取）</span>
      </div>
      <div class="chart-stage">
        <div class="chart-yaxis">
          <span>${fmt(maxV)}</span>
          <span>${fmt(Math.round(maxV / 2))}</span>
          <span>0</span>
        </div>
        <div class="chart-plot">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient id="ctxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="var(--c-cache)" stop-opacity=".5"/>
                <stop offset="100%" stop-color="var(--c-cache)" stop-opacity=".04"/>
              </linearGradient>
            </defs>
            <line x1="0" y1="0" x2="100" y2="0" stroke="var(--border-strong)" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".45"/>
            <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border-strong)" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="2 3" opacity=".45"/>
            <line x1="0" y1="100" x2="100" y2="100" stroke="var(--border-strong)" stroke-width="1" vector-effect="non-scaling-stroke" opacity=".55"/>
            <path d="${dArea}" fill="url(#ctxGrad)"/>
            <path d="${dLine}" fill="none" stroke="var(--c-cache)" stroke-width="1.8" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
          </svg>
          <div class="chart-dot" id="ctx-dot" data-default-x="${last.xPct.toFixed(2)}" data-default-y="${last.yPct.toFixed(2)}" style="left:${last.xPct.toFixed(2)}%;top:${last.yPct.toFixed(2)}%"></div>
          <div class="chart-hits">${hitsHtml}</div>
        </div>
      </div>
      <div class="chart-axis-labels">
        <span>${esc(fmtClock(pts[0].createdAt))}</span>
        <span>${esc(fmtClock(pts[n - 1].endedAt))}</span>
      </div>
    </div>
  `;
}

function bindContextChartEvents(container) {
  const readout = container.querySelector('#ctx-readout');
  const dot = container.querySelector('#ctx-dot');
  const hits = container.querySelector('.chart-hits');
  if (!readout || !dot || !hits) return;

  hits.querySelectorAll('.chart-hit').forEach((hit) => {
    hit.addEventListener('mouseenter', () => {
      readout.textContent = hit.dataset.tip || '';
      dot.style.left = `${hit.dataset.x}%`;
      dot.style.top = `${hit.dataset.y}%`;
    });
  });

  hits.addEventListener('mouseleave', () => {
    readout.textContent = readout.dataset.default || '';
    dot.style.left = `${dot.dataset.defaultX}%`;
    dot.style.top = `${dot.dataset.defaultY}%`;
  });
}

/* ---------------- 额度 ---------------- */

function renderQuotaCard() {
  const el = document.getElementById('quota-card');
  const q = state.data?.quota;
  if (!q) { el.innerHTML = ''; return; }

  const row = (label, w) => {
    const cls = w.usedPct >= 90 ? 'hot' : w.usedPct >= 70 ? 'warn' : 'ok';
    return `
      <div class="quota-row">
        <div class="quota-head">
          <span class="muted">${label}</span>
          <span class="mono">${fmt(w.used)} / ${fmt(w.limit)} · 剩 ${fmt(w.remaining)}</span>
        </div>
        <div class="quota-track">
          <div class="quota-fill ${cls}" style="width:${Math.min(100, w.usedPct)}%"></div>
        </div>
      </div>
    `;
  };

  el.innerHTML = `
    <div class="card" style="margin-top:8px">
      <div class="row between" style="margin-bottom:7px">
        <span class="card-title">额度窗口</span>
        <span class="faint" style="font-size:9.5px">口径：${q.config.countMode === 'total' ? '含缓存' : '仅计费'}</span>
      </div>
      ${row('最近 5 小时', q.window5h)}
      ${row('本周（周一 00:00 起）', q.windowWeekly)}
      <div class="note" style="margin-top:8px">
        <span>ℹ️</span>
        <span>额度上限需按你的实际套餐在设置中填写（当前 ${fmt(q.config.limit5h)} / ${fmt(q.config.limitWeekly)}）。这是本地记账，不是官方配额。</span>
      </div>
    </div>
  `;
}

/* ---------------- 趋势柱状图（对齐基线 + 悬停明细） ---------------- */

function renderTrendCard() {
  const el = document.getElementById('trend-card');
  const buckets = state.data?.series?.[state.chartMode] || [];
  const isBilled = state.chartMetric === 'billed';
  const isHourly = state.chartMode === 'hourly';

  const valOf = (b) => (isBilled ? b.billedTokens : b.totalTokens);
  const maxVal = Math.max(0, ...buckets.map(valOf));
  const sumVal = buckets.reduce((a, b) => a + valOf(b), 0);
  const n = buckets.length;

  const cols = buckets.map((b, i) => {
    const val = valOf(b);
    const hPct = maxVal > 0 ? Math.max(val > 0 ? 5 : 0, (val / maxVal) * 100) : 0;
    const pIn = val > 0 ? (b.inputTokens / val) * 100 : 0;
    const pOut = val > 0 ? (b.outputTokens / val) * 100 : 0;
    const pCache = !isBilled && val > 0 ? (b.cacheReadTokens / val) * 100 : 0;
    const tip = `${b.label} · ${exact(val)}（In ${fmt(b.inputTokens)} / Out ${fmt(b.outputTokens)}${isBilled ? '' : ` / Cache ${fmt(b.cacheReadTokens)}`}）`;
    const showLabel = !isHourly || i % 6 === 0 || i === n - 1;
    const isNow = i === n - 1;

    const stack = val > 0
      ? `<div class="bars-stack" style="height:${hPct.toFixed(1)}%">
           ${pIn > 0 ? `<i style="background:var(--c-input);flex:${pIn.toFixed(2)}"></i>` : ''}
           ${pOut > 0 ? `<i style="background:var(--c-output);flex:${pOut.toFixed(2)}"></i>` : ''}
           ${pCache > 0 ? `<i style="background:var(--c-cache);flex:${pCache.toFixed(2)}"></i>` : ''}
         </div>`
      : `<div class="bars-empty"></div>`;

    return `
      <div class="bars-col ${isNow ? 'is-now' : ''}" data-tip="${esc(tip)}" title="${esc(tip)}">
        <div class="bars-wrap">
          ${isNow && val > 0 ? `<span class="bars-val">${fmt(val)}</span>` : ''}
          ${stack}
        </div>
        <div class="bars-label">${showLabel ? esc(b.label) : ''}</div>
      </div>
    `;
  }).join('');

  const defaultLegend = `
    <div class="legend">
      <span><i class="dot dot-input"></i>输入</span>
      <span><i class="dot dot-output"></i>输出</span>
      ${isBilled ? '' : '<span><i class="dot dot-cache"></i>缓存</span>'}
    </div>
  `;

  el.innerHTML = `
    <div class="row between" style="margin-bottom:6px;flex-wrap:wrap;gap:6px">
      <div style="min-width:0">
        <div class="card-title">消耗趋势</div>
        <div class="faint" style="font-size:9.5px">合计 ${fmt(sumVal)} · 峰值 ${fmt(maxVal)}</div>
      </div>
      <div class="row gap4">
        <div class="seg">
          ${seg(state.chartMode === 'daily', 'data-chart-mode', 'daily', '7天')}
          ${seg(state.chartMode === 'hourly', 'data-chart-mode', 'hourly', '24h')}
        </div>
        <div class="seg">
          ${seg(state.chartMetric === 'total', 'data-chart-metric', 'total', '总计')}
          ${seg(state.chartMetric === 'billed', 'data-chart-metric', 'billed', '非缓存')}
        </div>
      </div>
    </div>
    <div class="bars">${cols}</div>
    <div class="trend-foot" id="trend-foot">${defaultLegend}</div>
  `;

  const footEl = el.querySelector('#trend-foot');
  el.querySelectorAll('.bars-col').forEach((col) => {
    col.addEventListener('mouseenter', () => {
      if (footEl) footEl.textContent = col.dataset.tip || '';
    });
    col.addEventListener('mouseleave', () => {
      if (footEl) footEl.innerHTML = defaultLegend;
    });
  });

  el.querySelectorAll('[data-chart-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.chartMode = btn.dataset.chartMode;
      renderTrendCard();
    });
  });
  el.querySelectorAll('[data-chart-metric]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.chartMetric = btn.dataset.chartMetric;
      renderTrendCard();
    });
  });
}

/* ---------------- 全部会话 ---------------- */

function renderHistory() {
  const cards = document.getElementById('global-cards');
  const listEl = document.getElementById('history-list');
  const countEl = document.getElementById('conv-count');

  renderStatCards(cards, state.data?.totals || {});
  renderQuotaCard();
  renderTrendCard();

  let items = [...(state.data?.conversations || [])];
  const q = state.search.trim().toLowerCase();
  if (q) {
    items = items.filter((c) => c.title.toLowerCase().includes(q) || c.id.toLowerCase().includes(q));
  }

  if (state.sort === 'total') items.sort((a, b) => b.totalTokens - a.totalTokens);
  else if (state.sort === 'billed') items.sort((a, b) => b.billedTokens - a.billedTokens);
  else items.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));

  countEl.textContent = `${items.length} 个`;

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">没有匹配的会话</div>`;
    return;
  }

  const hostConvId = getHostConvId();
  const effectiveActiveId = hostConvId || state.data?.activeConversationId || '';
  const shownId = state.data?.current?.id || '';

  listEl.innerHTML = items.map((c) => {
    const isLive = Boolean(effectiveActiveId && c.id === effectiveActiveId);
    const total = c.totalTokens || 0;
    const pIn = total ? (c.inputTokens / total) * 100 : 0;
    const pOut = total ? (c.outputTokens / total) * 100 : 0;
    const pCache = total ? (c.cacheReadTokens / total) * 100 : 0;

    return `
      <div class="conv ${c.id === shownId ? 'is-active' : ''}" data-conv-id="${esc(c.id)}">
        <div class="conv-top">
          <div class="conv-title">${isLive ? '<span class="tag tag-live">当前</span> ' : ''}${esc(c.title)}</div>
          <div class="conv-total" title="${exact(total)}">${fmt(total)}</div>
        </div>
        <div class="conv-meta">
          <span>In ${fmt(c.inputTokens)}</span>
          <span>Out ${fmt(c.outputTokens)}</span>
          <span>Cache ${fmt(c.cacheReadTokens)}</span>
          <span>${c.turnCount} 轮 / ${c.modelCalls} 次</span>
          ${c.subagentCount ? `<span class="tag tag-sub">${c.subagentCount} 子代理</span>` : ''}
          ${c.errorCount ? `<span class="tag tag-err">${c.errorCount} 异常</span>` : ''}
          <span>${fmtTime(c.updatedAt)}</span>
        </div>
        <div class="bar">
          <i class="bar-in" style="width:${pIn.toFixed(2)}%"></i>
          <i class="bar-out" style="width:${pOut.toFixed(2)}%"></i>
          <i class="bar-cache" style="width:${pCache.toFixed(2)}%"></i>
        </div>
      </div>
    `;
  }).join('');

  for (const el of listEl.querySelectorAll('[data-conv-id]')) {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-conv-id');
      state.selectedConvId = id;
      state.userPinned = Boolean(id && id !== effectiveActiveId);
      state.signature = null;
      switchTab('current');
      fetchTokens();
    });
  }
}

/* ---------------- 设置 ---------------- */

function syncHookRowState(enabled) {
  const row = document.getElementById('row-session-total');
  const sub = document.getElementById('opt-session-total');
  if (row && sub) {
    row.classList.toggle('is-disabled', !enabled);
    sub.disabled = !enabled;
  }
}

function setInputIfIdle(id, value) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) {
    el.value = value;
  }
}

function renderSettings() {
  const q = state.data?.quota?.config;
  const h = state.data?.settings?.hook;
  if (h) {
    const injectEl = document.getElementById('opt-inject-summary');
    const totalEl = document.getElementById('opt-session-total');
    if (injectEl && document.activeElement !== injectEl) injectEl.checked = Boolean(h.injectSummary);
    if (totalEl && document.activeElement !== totalEl) totalEl.checked = Boolean(h.showSessionTotal);
    syncHookRowState(Boolean(h.injectSummary));
  }
  if (q) {
    setInputIfIdle('opt-limit-5h', q.limit5h);
    setInputIfIdle('opt-limit-week', q.limitWeekly);
    setInputIfIdle('opt-count-mode', q.countMode);
  }
}

async function postJson(url, payload) {
  return apiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

async function saveSettings() {
  const statusEl = document.getElementById('settings-status');
  const injectEnabled = document.getElementById('opt-inject-summary').checked;
  syncHookRowState(injectEnabled);

  const quotaPayload = {
    limit5h: Number(document.getElementById('opt-limit-5h').value),
    limitWeekly: Number(document.getElementById('opt-limit-week').value),
    countMode: document.getElementById('opt-count-mode').value,
  };
  const settingsPayload = {
    hook: {
      injectSummary: injectEnabled,
      showSessionTotal: document.getElementById('opt-session-total').checked,
    },
  };

  try {
    const [rq, rs] = await Promise.all([
      postJson('/api/quota', quotaPayload),
      postJson('/api/settings', settingsPayload),
    ]);
    if (rq.ok && rs.ok && state.data) {
      const quota = await rq.json();
      const settings = await rs.json();
      state.data.quota = { ...state.data.quota, config: quota };
      state.data.settings = settings;
      state.signature = null;
      fetchTokens();
      statusEl.textContent = '已保存';
      setTimeout(() => {
        if (statusEl.textContent === '已保存') {
          statusEl.textContent = '额度上限请按你的实际套餐填写，本地保存，不上传。';
        }
      }, 1600);
    } else {
      statusEl.textContent = '保存失败';
    }
  } catch {
    statusEl.textContent = '保存失败';
  }
}

/* ---------------- 数据拉取 ---------------- */

async function fetchTokens() {
  const hostConvId = getHostConvId();
  const targetId = state.userPinned
    ? state.selectedConvId
    : (hostConvId || state.selectedConvId || '');

  const params = new URLSearchParams();
  if (targetId) params.set('conversationId', targetId);
  if (state.signature) params.set('signature', state.signature);
  const qs = params.toString() ? `?${params.toString()}` : '';

  try {
    const res = await apiFetch(`/api/tokens${qs}`);
    if (!res.ok) return;
    let data = await res.json();

    if (data.unchanged) return;

    // 独立打开（URL 里没有 conversationId）时跟随最新会话
    if (!state.userPinned && !hostConvId) {
      const latestId = data.activeConversationId || data.conversations?.[0]?.id || '';
      if (latestId && data.current?.id !== latestId) {
        state.selectedConvId = latestId;
        const retry = await apiFetch(`/api/tokens?conversationId=${encodeURIComponent(latestId)}`);
        if (retry.ok) data = await retry.json();
      } else if (latestId) {
        state.selectedConvId = latestId;
      }
    } else if (!state.userPinned && hostConvId) {
      state.selectedConvId = hostConvId;
    }

    state.signature = data.signature || null;
    state.data = data;
    state.activeConvId = hostConvId || data.activeConversationId || data.conversations?.[0]?.id || null;

    const sub = document.getElementById('brand-sub');
    const cur = data.current;
    sub.textContent = cur
      ? `${cur.id.slice(0, 8)} · ${data.conversations.length} 个会话`
      : `${data.conversations?.length || 0} 个会话`;

    renderCurrent();
    renderHistory();
    renderSettings();
  } catch {
    // 忽略轮询期间的瞬时错误
  }
}

/* ---------------- 事件绑定 ---------------- */

document.querySelectorAll('.seg-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

document.getElementById('settings-btn').addEventListener('click', () => {
  const panel = document.getElementById('settings-panel');
  const btn = document.getElementById('settings-btn');
  const nextHidden = !panel.hidden;
  panel.hidden = nextHidden;
  btn.setAttribute('aria-expanded', String(!nextHidden));
});

document.getElementById('opt-inject-summary').addEventListener('change', saveSettings);
document.getElementById('opt-session-total').addEventListener('change', saveSettings);
document.getElementById('opt-limit-5h').addEventListener('change', saveSettings);
document.getElementById('opt-limit-week').addEventListener('change', saveSettings);
document.getElementById('opt-count-mode').addEventListener('change', saveSettings);

document.getElementById('current-banner').addEventListener('click', (e) => {
  if (e.target.closest('#back-active')) {
    state.userPinned = false;
    state.selectedConvId = getHostConvId() || state.data?.conversations?.[0]?.id || null;
    state.signature = null;
    fetchTokens();
  }
});

document.getElementById('search-input').addEventListener('input', (e) => {
  state.search = e.target.value;
  renderHistory();
});

document.getElementById('sort-select').addEventListener('change', (e) => {
  state.sort = e.target.value;
  renderHistory();
});

/* ---------------- 启动 ---------------- */

fetchTokens();
setInterval(() => {
  if (!document.hidden) fetchTokens();
}, 3000);
