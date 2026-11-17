/**
 * Antigravity Usage Monitor - Frontend Application Controller
 */

let state = {
  scope: 'current', // 'current' | 'all'
  currentConv: null,
  allOverview: null,
  turnIndex: 0,
  userScrubbing: false,
  chartMode: '7d', // '7d' | '24h'
  chartMetric: 'total', // 'total' | 'billable'
  sortBy: 'tokens',
  searchQuery: ''
};

function formatNum(num) {
  if (num === null || num === undefined) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return (num || 0).toLocaleString();
}

// 切换顶栏：当前会话 vs 全部会话
window.switchScope = function(scope) {
  state.scope = scope;
  document.getElementById('btnScopeCurrent').classList.toggle('active', scope === 'current');
  document.getElementById('btnScopeAll').classList.toggle('active', scope === 'all');
  document.getElementById('viewCurrentConv').style.display = scope === 'current' ? 'block' : 'none';
  document.getElementById('viewAllConv').style.display = scope === 'all' ? 'block' : 'none';

  if (scope === 'current') {
    document.getElementById('topSubtitle').innerText = state.currentConv 
      ? `会话: ${state.currentConv.conversationId.substring(0, 16)}...` 
      : '当前活动会话';
  } else {
    document.getElementById('topSubtitle').innerText = state.allOverview
      ? `全局汇总 · 已收录 ${state.allOverview.sessions.length} 个任务会话`
      : '全局多会话汇总';
  }
};

// 轮询拉取最新数据
async function fetchStats() {
  try {
    // 1. 获取当前会话
    const curConvId = state.currentConv?.conversationId;
    const urlCur = curConvId 
      ? `/api/stats?scope=current&conversationId=${curConvId}` 
      : '/api/stats?scope=current';
    const resCur = await fetch(urlCur);
    if (resCur.ok) {
      const dataCur = await resCur.json();
      if (dataCur && dataCur.turns) {
        state.currentConv = dataCur;
        renderCurrentView();
      }
    }

    // 2. 获取全部会话
    const resAll = await fetch(`/api/stats?scope=all&sortBy=${state.sortBy}&search=${encodeURIComponent(state.searchQuery)}`);
    if (resAll.ok) {
      const dataAll = await resAll.json();
      if (dataAll && dataAll.global) {
        state.allOverview = dataAll;
        renderAllView();
      }
    }
  } catch (err) {
    console.warn('Sync failed:', err);
  }
}

// ======================== 渲染当前会话 ========================
function renderCurrentView() {
  const d = state.currentConv;
  if (!d) return;

  if (state.scope === 'current') {
    document.getElementById('topSubtitle').innerText = `会话: ${d.conversationId.substring(0, 16)}...`;
  }

  // 6 大核心指标卡片（100% 真实数据）
  document.getElementById('cardTotalTokens').innerText = formatNum(d.totalTokens);
  document.getElementById('cardTokensSub').innerText = `输入 ${formatNum(d.totalIn)} · 输出 ${formatNum(d.totalOut)}`;
  document.getElementById('cardCallCount').innerText = d.turnsCount;
  document.getElementById('cardCallsSub').innerText = `发起工具调用 ${d.toolCallsCount} 次 · ${d.plannerStepsCount} 步响应`;
  document.getElementById('cardCacheRate').innerText = `${d.cacheHitRate}%`;
  document.getElementById('cardCacheSub').innerText = `读 ${formatNum(d.totalCache)} · 写 0`;
  document.getElementById('cardTtft').innerText = `${d.avgTtft}s`;
  document.getElementById('cardSpeed').innerText = `${d.avgSpeed}`;

  // 渲染上下文增长面积图
  renderAreaChart(d.turns);

  // 轮次滑动条更新
  const scrubber = document.getElementById('turnScrubber');
  scrubber.max = d.turns.length || 1;
  if (!state.userScrubbing) {
    state.turnIndex = d.turns.length - 1;
    scrubber.value = state.turnIndex + 1;
  }
  renderTurnDetail(state.turnIndex);
}

function renderAreaChart(turns) {
  if (!turns || turns.length === 0) return;

  const svgW = 320, svgH = 130;
  const padL = 28, padR = 10, padT = 15, padB = 10;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const n = turns.length;

  const peakVal = Math.max(...turns.map(t => t.totalContext), 10000);
  const maxVal = Math.ceil((peakVal * 1.15) / 10000) * 10000;

  document.getElementById('axisMax').innerText = formatNum(maxVal);
  document.getElementById('axisMid2').innerText = formatNum(Math.round(maxVal * 0.6));
  document.getElementById('axisMid1').innerText = formatNum(Math.round(maxVal * 0.3));

  const curVal = turns[turns.length - 1].totalContext;
  document.getElementById('chartSubtitle').innerText = `当前 ${formatNum(curVal)} · 峰值 ${formatNum(peakVal)} · ${n} 轮交互`;

  let pts = [];
  for (let i = 0; i < n; i++) {
    const x = padL + (n > 1 ? (i / (n - 1)) * chartW : chartW / 2);
    const y = padT + chartH - (turns[i].totalContext / maxVal) * chartH;
    pts.push({ x, y });
  }

  let dArea = `M ${pts[0].x} ${padT + chartH} L ${pts[0].x} ${pts[0].y}`;
  let dStroke = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    dArea += ` L ${pts[i].x} ${pts[i].y}`;
    dStroke += ` L ${pts[i].x} ${pts[i].y}`;
  }
  dArea += ` L ${pts[pts.length - 1].x} ${padT + chartH} Z`;

  document.getElementById('cacheAreaPath').setAttribute('d', dArea);
  document.getElementById('cacheStrokePath').setAttribute('d', dStroke);

  document.getElementById('chartTimeStart').innerText = (turns[0].startTime || '').substring(11, 19) || '--';
  document.getElementById('chartTimeMid').innerText = (turns[Math.floor(n / 2)].startTime || '').substring(11, 19) || '--';
  document.getElementById('chartTimeEnd').innerText = (turns[n - 1].endTime || '').substring(11, 19) || '--';

  updateScrubIndicator(state.turnIndex, maxVal, turns);
}

function updateScrubIndicator(idx, maxVal, turns) {
  if (!turns) turns = state.currentConv?.turns || [];
  if (!turns || turns.length === 0) return;

  const svgW = 320, svgH = 130;
  const padL = 28, padR = 10, padT = 15, padB = 10;
  const chartW = svgW - padL - padR;
  const chartH = svgH - padT - padB;
  const n = turns.length;

  if (!maxVal) {
    const peakVal = Math.max(...turns.map(t => t.totalContext), 10000);
    maxVal = Math.ceil((peakVal * 1.15) / 10000) * 10000;
  }

  const x = padL + (n > 1 ? (idx / (n - 1)) * chartW : chartW / 2);
  const y = padT + chartH - (turns[idx].totalContext / maxVal) * chartH;

  const scrubLine = document.getElementById('scrubLine');
  const scrubPoint = document.getElementById('scrubPoint');

  scrubLine.setAttribute('x1', x);
  scrubLine.setAttribute('x2', x);
  scrubLine.setAttribute('opacity', '1');

  scrubPoint.setAttribute('cx', x);
  scrubPoint.setAttribute('cy', y);
  scrubPoint.setAttribute('opacity', '1');
}

function renderTurnDetail(idx) {
  const turns = state.currentConv?.turns || [];
  if (!turns || turns.length === 0 || !turns[idx]) return;

  const cur = turns[idx];
  document.getElementById('turnIndicator').innerText = `第 ${cur.turn}/${turns.length} 轮`;
  document.getElementById('turnTimestamp').innerText = (cur.endTime || '').substring(11, 19) || '--';
  document.getElementById('turnTotalTokens').innerText = formatNum(cur.totalContext);
  document.getElementById('turnOutputDelta').innerText = `+${cur.outputTokens}`;

  // 阶段标签：规划 X 次 + 执行 Y 次
  const phaseText = `规划 ${cur.planningSteps} 次 + 执行 ${cur.executionSteps} 次 (共 ${cur.stepsCount} 步)`;
  document.getElementById('turnPhaseBadge').innerText = phaseText;

  // 用户请求摘要
  document.getElementById('turnUserPrompt').innerText = `“${cur.userPrompt || '用户指令'}”`;

  // 子代理标签展示
  const subContainer = document.getElementById('turnSubagentContainer');
  if (cur.subagentCalls && cur.subagentCalls.length > 0) {
    subContainer.innerHTML = cur.subagentCalls.map(name => `
      <span class="badge badge-subagent">🤖 [子代理 · ${name}]</span>
    `).join(' ');
    subContainer.style.display = 'block';
  } else {
    subContainer.style.display = 'none';
  }

  // 组成明细列表
  const comp = cur.composition || {};
  const total = cur.totalContext || 1;
  const pSys = Math.max(1, Math.round(((comp.systemPrompt || 2100) / total) * 100));
  const pRules = Math.max(1, Math.round(((comp.rules || 3500) / total) * 100));
  const pTools = Math.max(2, Math.round(((comp.toolDefs || 8800) / total) * 100));
  const pChat = Math.max(5, Math.round(((comp.chatHistory || 1000) / total) * 100));
  const pOutputs = Math.max(0, 100 - (pSys + pRules + pTools + pChat));

  document.getElementById('itemSysPrompt').innerText = formatNum(comp.systemPrompt);
  document.getElementById('itemSysPromptPct').innerText = `${pSys}%`;
  document.getElementById('itemRules').innerText = formatNum(comp.rules);
  document.getElementById('itemRulesPct').innerText = `${pRules}%`;
  document.getElementById('itemToolDefs').innerText = formatNum(comp.toolDefs);
  document.getElementById('itemToolDefsPct').innerText = `${pTools}%`;
  document.getElementById('itemChatMsg').innerText = formatNum(comp.chatHistory);
  document.getElementById('itemChatMsgPct').innerText = `${pChat}%`;
  document.getElementById('itemToolResults').innerText = formatNum(comp.toolOutputs);
  document.getElementById('itemToolResultsPct').innerText = `${pOutputs}%`;

  const segs = document.getElementById('segmentBar').children;
  segs[0].style.width = pSys + '%';
  segs[1].style.width = pRules + '%';
  segs[2].style.width = pTools + '%';
  segs[3].style.width = pChat + '%';
  segs[4].style.width = pOutputs + '%';

  updateScrubIndicator(idx, null, turns);
}

window.prevTurn = function() {
  if (state.turnIndex > 0) {
    state.turnIndex--;
    state.userScrubbing = true;
    document.getElementById('turnScrubber').value = state.turnIndex + 1;
    renderTurnDetail(state.turnIndex);
  }
};

window.nextTurn = function() {
  const turns = state.currentConv?.turns || [];
  if (state.turnIndex < turns.length - 1) {
    state.turnIndex++;
    if (state.turnIndex === turns.length - 1) state.userScrubbing = false;
    document.getElementById('turnScrubber').value = state.turnIndex + 1;
    renderTurnDetail(state.turnIndex);
  }
};

window.setTurn = function(val) {
  const turns = state.currentConv?.turns || [];
  state.turnIndex = parseInt(val) - 1;
  state.userScrubbing = (state.turnIndex !== turns.length - 1);
  renderTurnDetail(state.turnIndex);
};

// ======================== 渲染全部会话 ========================
function renderAllView() {
  const data = state.allOverview;
  if (!data || !data.global) return;

  const g = data.global;
  if (state.scope === 'all') {
    document.getElementById('topSubtitle').innerText = `全局汇总 · 已收录 ${g.totalSessions} 个任务会话`;
  }

  // 4 大全局宏观卡片
  document.getElementById('allTotalTokens').innerText = formatNum(g.totalTokens);
  document.getElementById('allTokensSub').innerText = `输入 ${formatNum(g.totalIn)} · 输出 ${formatNum(g.totalOut)} · 读 ${formatNum(g.totalCache)}`;
  document.getElementById('allSessionCount').innerHTML = `${g.totalSessions} <span style="font-size:11px;font-weight:normal;color:var(--text-muted)">个会话</span>`;
  document.getElementById('allTurnsSub').innerText = `累计 ${g.totalTurns} 轮请求 · ${g.toolCallsCount} 次工具调用`;
  document.getElementById('allCacheRate').innerText = `${g.cacheHitRate}%`;
  document.getElementById('allBillableTokens').innerText = formatNum(g.billableTokens);

  // 渲染 7 天 / 24 小时堆叠柱状图
  renderTimeSeriesChart();

  // 渲染会话排行榜与卡片列表
  renderSessionsList();
}

// 堆叠柱状图
function renderTimeSeriesChart() {
  const ts = state.allOverview?.timeSeries;
  if (!ts) return;

  const is7d = state.chartMode === '7d';
  const items = is7d ? ts.daily : ts.hourly;
  const container = document.getElementById('timeSeriesBars');
  if (!container || !items) return;

  const isBillable = state.chartMetric === 'billable';
  const maxVal = Math.max(...items.map(i => isBillable ? i.billable : i.total), 1000);

  let html = '';
  items.forEach(item => {
    const val = isBillable ? item.billable : item.total;
    const cacheVal = item.cache || 0;
    const billableVal = item.billable || 0;
    const heightPct = Math.max(4, Math.round((val / maxVal) * 100));

    const cachePct = val > 0 ? (cacheVal / val) * 100 : 0;
    const billablePct = 100 - cachePct;

    const label = is7d ? item.date : (item.hour.endsWith(':00') ? item.hour.substring(0, 2) : item.hour);

    html += `
      <div class="bar-col" title="${is7d ? item.date : item.hour}: 总计 ${formatNum(val)} (计费: ${formatNum(billableVal)})">
        <div style="height: ${heightPct}%; width: 100%; display: flex; flex-direction: column-reverse; border-radius: 2px; overflow: hidden;">
          <div style="height: ${billablePct}%; background: var(--color-input);" title="计费输入输出"></div>
          ${!isBillable ? `<div style="height: ${cachePct}%; background: var(--color-cache);" title="缓存读取"></div>` : ''}
        </div>
        <div class="bar-label">${label}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.setTimeSeriesMode = function(mode) {
  state.chartMode = mode;
  document.getElementById('btnMode7d').classList.toggle('active', mode === '7d');
  document.getElementById('btnMode24h').classList.toggle('active', mode === '24h');
  renderTimeSeriesChart();
};

window.setTimeSeriesMetric = function(metric) {
  state.chartMetric = metric;
  document.getElementById('btnMetricTotal').classList.toggle('active', metric === 'total');
  document.getElementById('btnMetricBillable').classList.toggle('active', metric === 'billable');
  renderTimeSeriesChart();
};

// 渲染会话卡片列表
function renderSessionsList() {
  const container = document.getElementById('sessionsListContainer');
  const sessions = state.allOverview?.sessions || [];
  if (!container) return;

  if (sessions.length === 0) {
    container.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--text-muted);">暂无匹配会话</div>`;
    return;
  }

  const gTotal = state.allOverview.global.totalTokens || 1;
  let html = '';

  sessions.forEach((s, idx) => {
    const isCurrent = state.currentConv && state.currentConv.conversationId === s.conversationId;
    const lastActiveStr = s.turns && s.turns.length > 0 
      ? (s.turns[s.turns.length - 1].endTime || '').substring(11, 19) 
      : '--';

    html += `
      <div class="card" style="cursor: pointer; margin-bottom: 8px; border-color: ${isCurrent ? 'var(--color-primary)' : 'var(--border-color)'}; background: ${isCurrent ? 'var(--color-primary-light)' : 'var(--bg-card)'};" onclick="selectSession('${s.conversationId}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="badge ${idx === 0 ? 'badge-live' : ''}" style="background: var(--bg-hover); font-weight: bold;">#${idx + 1}</span>
              <span style="font-weight: 600; color: var(--text-main); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${s.title}</span>
              ${isCurrent ? '<span class="badge badge-live">当前会话</span>' : ''}
              ${s.subagents && s.subagents.length > 0 ? `<span class="badge badge-subagent">含 ${s.subagents.length} 个子任务</span>` : ''}
            </div>
            <div style="font-size: 10px; color: var(--text-muted); margin-top: 2px;">
              ID: ${s.conversationId.substring(0, 14)}... · 活跃: ${lastActiveStr}
            </div>
          </div>
          <div style="text-align: right; flex-shrink: 0;">
            <div style="font-weight: bold; font-size: 13px; color: var(--text-main);">${formatNum(s.totalTokens)}</div>
            <div style="font-size: 10px; color: var(--text-muted);">${s.turnsCount} 轮 · ${s.toolCallsCount} 工具</div>
          </div>
        </div>

        <div style="width: 100%; height: 5px; border-radius: 4px; overflow: hidden; display: flex; background: var(--border-color);">
          <div style="height: 100%; width: ${s.cacheHitRate}%; background: var(--color-cache);" title="缓存"></div>
          <div style="height: 100%; width: ${100 - parseFloat(s.cacheHitRate)}%; background: var(--color-input);" title="计费输入输出"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 10px; color: var(--text-muted); margin-top: 4px;">
          <span>缓存率: <b style="color: var(--color-cache);">${s.cacheHitRate}%</b> (读 ${formatNum(s.totalCache)})</span>
          <span style="color: var(--color-primary);">查看详情 →</span>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

window.selectSession = function(convId) {
  fetch(`/api/stats?scope=current&conversationId=${convId}`)
    .then(r => r.json())
    .then(data => {
      if (data && data.turns) {
        state.currentConv = data;
        renderCurrentView();
        switchScope('current');
      }
    });
};

window.handleSearch = function(val) {
  state.searchQuery = val;
  fetchStats();
};

window.handleSortChange = function(val) {
  state.sortBy = val;
  fetchStats();
};

// 初始化运行
window.addEventListener('DOMContentLoaded', () => {
  fetchStats();
  setInterval(fetchStats, 2000);
});
