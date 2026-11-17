/**
 * Antigravity Token Engine (lib/tokens.mjs)
 *
 * 设计原则：**只报告可以从 transcript.jsonl 实测得到的东西**。
 * 拿不到的（例如首字耗时 TTFT、系统提示词/规则的 Token 拆分）一律不猜测、不硬编码。
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SIDECAR_ROOT = dirname(__dirname);
const QUOTA_PATH = join(SIDECAR_ROOT, 'quota.json');
const SETTINGS_PATH = join(SIDECAR_ROOT, 'settings.json');

/** 会话 ID 白名单正则，防止路径穿越 */
export const ID_RE = /^[0-9a-f-]{8,}$/i;

export const DEFAULT_QUOTA = {
  limit5h: 5_000_000,
  limitWeekly: 50_000_000,
  countMode: 'billed', // 'billed' = input+output | 'total' = input+output+cache
};

export const DEFAULT_SETTINGS = {
  hook: { showSessionTotal: true },
};

const cache = new Map(); // filePath -> { mtimeMs, size, parsed }

/* ------------------------------------------------------------------ */
/* 配置读写                                                            */
/* ------------------------------------------------------------------ */

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n', 'utf-8');
  return value;
}

export function readQuota() {
  const raw = readJson(QUOTA_PATH, {});
  const limit5h = Number(raw?.limit5h);
  const limitWeekly = Number(raw?.limitWeekly);
  return {
    limit5h: Number.isFinite(limit5h) && limit5h > 0 ? limit5h : DEFAULT_QUOTA.limit5h,
    limitWeekly: Number.isFinite(limitWeekly) && limitWeekly > 0 ? limitWeekly : DEFAULT_QUOTA.limitWeekly,
    countMode: raw?.countMode === 'total' ? 'total' : 'billed',
  };
}

export function writeQuota(next) {
  const cur = readQuota();
  const limit5h = Number(next?.limit5h);
  const limitWeekly = Number(next?.limitWeekly);
  return writeJson(QUOTA_PATH, {
    limit5h: Number.isFinite(limit5h) && limit5h > 0 ? Math.round(limit5h) : cur.limit5h,
    limitWeekly: Number.isFinite(limitWeekly) && limitWeekly > 0 ? Math.round(limitWeekly) : cur.limitWeekly,
    countMode: next?.countMode === 'total' ? 'total' : next?.countMode === 'billed' ? 'billed' : cur.countMode,
  });
}

export function readSettings() {
  const raw = readJson(SETTINGS_PATH, {});
  const h = raw?.hook || {};
  return {
    hook: {
      showSessionTotal: typeof h.showSessionTotal === 'boolean' ? h.showSessionTotal : DEFAULT_SETTINGS.hook.showSessionTotal,
    },
  };
}

export function writeSettings(next) {
  const cur = readSettings();
  const h = next?.hook || {};
  return writeJson(SETTINGS_PATH, {
    hook: {
      showSessionTotal: typeof h.showSessionTotal === 'boolean' ? h.showSessionTotal : cur.hook.showSessionTotal,
    },
  });
}

/* ------------------------------------------------------------------ */
/* 数据源发现：覆盖桌面端 / IDE / CLI 三种界面                          */
/* ------------------------------------------------------------------ */

export function getBrainDirs() {
  const candidates = [
    process.env.ANTIGRAVITY_APP_DATA && join(process.env.ANTIGRAVITY_APP_DATA, 'brain'),
    join(homedir(), '.gemini', 'antigravity', 'brain'),
    join(homedir(), '.gemini', 'antigravity-ide', 'brain'),
    join(homedir(), '.gemini', 'antigravity-cli', 'brain'),
  ].filter(Boolean);

  const seen = new Set();
  const existing = [];
  for (const dir of candidates) {
    if (!seen.has(dir) && existsSync(dir)) {
      seen.add(dir);
      existing.push(dir);
    }
  }
  return existing;
}

function transcriptPathIn(brainDir, convId) {
  return join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
}

function cleanUserText(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.trim();
  const m = text.match(/<USER_REQUEST>\s*([\s\S]*?)\s*<\/USER_REQUEST>/i);
  if (m) text = m[1].trim();
  return text.replace(/\s+/g, ' ');
}

/* ------------------------------------------------------------------ */
/* 单会话解析                                                          */
/* ------------------------------------------------------------------ */

/**
 * 解析一个 transcript.jsonl。
 *
 * 真实字段全部来自日志：
 *   input_tokens / output_tokens / cache_read_tokens / created_at / tool_calls
 *
 * 阶段识别使用日志中的**真实信号**：
 *   - SYSTEM_MESSAGE 含 "Plan mode is off"        -> 进入执行阶段
 *   - SYSTEM_MESSAGE 含 "[plan review]"           -> 回到规划阶段
 *   - tool_calls 含 exit_plan_mode / enter_plan_mode
 *   没有出现过任何上述信号时，不标注阶段（避免臆造）。
 */
export function parseTranscript(convId, filePath) {
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return null;
  }

  const cached = cache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return cached.parsed;
  }

  let text;
  try {
    text = readFileSync(filePath, 'utf-8');
  } catch {
    return null;
  }

  const turns = [];
  const stepMetrics = []; // 每一步的时间戳与三项 token，用于时序 / 额度窗口
  const toolNameCounts = new Map();

  let currentTurn = null;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCalls = 0;
  let totalToolCalls = 0;
  let startedAt = null;
  let updatedAt = null;
  let hasOrchestrator = false;
  let inExecPhase = false;

  const ensureTurn = (createdAt, prompt) => {
    if (currentTurn) return currentTurn;
    currentTurn = {
      index: turns.length + 1,
      prompt: prompt || '(system / subagent)',
      createdAt: createdAt || null,
      endedAt: createdAt || null,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      billedTokens: 0,
      totalTokens: 0,
      contextTokens: 0, // 该轮最后一步的 input + cache_read，即真实上下文规模
      modelCalls: 0,
      toolCalls: 0,
      toolNames: [],
      durationSec: 0,
      _planCalls: 0,
      _execCalls: 0,
      _firstTs: null,
      _lastTs: null,
    };
    turns.push(currentTurn);
    return currentTurn;
  };

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let step;
    try {
      step = JSON.parse(line);
    } catch {
      continue;
    }

    if (step.created_at) {
      if (!startedAt) startedAt = step.created_at;
      updatedAt = step.created_at;
    }

    if (step.type === 'USER_INPUT') {
      inExecPhase = false;
      if (typeof step.content === 'string' && /to Orchestrator/i.test(step.content)) {
        hasOrchestrator = true;
      }
      currentTurn = null;
      ensureTurn(step.created_at, cleanUserText(step.content));
    } else if (step.type === 'SYSTEM_MESSAGE') {
      if (typeof step.content === 'string') {
        if (step.content.includes('Plan mode is off')) {
          hasOrchestrator = true;
          inExecPhase = true;
        } else if (step.content.includes('[plan review]')) {
          hasOrchestrator = true;
          inExecPhase = false;
        }
      }
    } else if (step.type === 'PLANNER_RESPONSE') {
      const inp = Number(step.input_tokens) || 0;
      const out = Number(step.output_tokens) || 0;
      const cacheRead = Number(step.cache_read_tokens) || 0;
      const ts = step.created_at ? Date.parse(step.created_at) : st.mtimeMs;
      const toolCalls = Array.isArray(step.tool_calls) ? step.tool_calls : [];

      if (toolCalls.some((tc) => tc?.name === 'exit_plan_mode' || tc?.name === 'enter_plan_mode')) {
        hasOrchestrator = true;
      }

      totalInput += inp;
      totalOutput += out;
      totalCacheRead += cacheRead;
      totalCalls += 1;

      if (Number.isFinite(ts)) {
        stepMetrics.push({ ts, inp, out, cache: cacheRead });
      }

      const t = ensureTurn(step.created_at, null);
      t.inputTokens += inp;
      t.outputTokens += out;
      t.cacheReadTokens += cacheRead;
      t.billedTokens += inp + out;
      t.totalTokens += inp + out + cacheRead;
      t.contextTokens = inp + cacheRead;
      t.modelCalls += 1;
      t.endedAt = step.created_at || t.endedAt;

      if (Number.isFinite(ts)) {
        if (t._firstTs === null) t._firstTs = ts;
        t._lastTs = ts;
      }

      for (const tc of toolCalls) {
        const name = tc?.name;
        if (!name) continue;
        totalToolCalls += 1;
        t.toolCalls += 1;
        t.toolNames.push(name);
        toolNameCounts.set(name, (toolNameCounts.get(name) || 0) + 1);
      }

      if (inExecPhase) t._execCalls += 1;
      else t._planCalls += 1;

      if (toolCalls.some((tc) => tc?.name === 'exit_plan_mode')) inExecPhase = true;
      else if (toolCalls.some((tc) => tc?.name === 'enter_plan_mode')) inExecPhase = false;
    }
  }

  const finalTurns = turns.map(({ _planCalls, _execCalls, _firstTs, _lastTs, ...turn }) => {
    // 真实耗时：本轮首步到末步的墙钟时间（含模型思考与工具执行）
    const durationSec = _firstTs !== null && _lastTs !== null && _lastTs > _firstTs
      ? Number(((_lastTs - _firstTs) / 1000).toFixed(1))
      : 0;

    let phaseSummary = null;
    if (hasOrchestrator && turn.modelCalls > 0) {
      if (_planCalls > 0 && _execCalls > 0) phaseSummary = `规划 ${_planCalls} + 执行 ${_execCalls} 次`;
      else if (_planCalls > 0) phaseSummary = `规划 ${_planCalls} 次`;
      else phaseSummary = `执行 ${_execCalls} 次`;
    }
    return { ...turn, durationSec, phaseSummary };
  });

  const title = finalTurns.length > 0 ? finalTurns[0].prompt.slice(0, 100) : convId;

  const parsed = {
    id: convId,
    title,
    startedAt: startedAt || (st.birthtime ? st.birthtime.toISOString() : st.mtime.toISOString()),
    updatedAt: updatedAt || st.mtime.toISOString(),
    turnCount: finalTurns.length,
    modelCalls: totalCalls,
    toolCalls: totalToolCalls,
    topTools: [...toolNameCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count })),
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cacheReadTokens: totalCacheRead,
    billedTokens: totalInput + totalOutput,
    totalTokens: totalInput + totalOutput + totalCacheRead,
    cacheHitRate: (totalInput + totalCacheRead) > 0
      ? Number(((totalCacheRead / (totalInput + totalCacheRead)) * 100).toFixed(1))
      : 0,
    phaseDetected: hasOrchestrator,
    turns: finalTurns,
    stepMetrics,
  };

  cache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, parsed });
  return parsed;
}

/* ------------------------------------------------------------------ */
/* 子代理 / Swarm 归集                                                  */
/* ------------------------------------------------------------------ */

function readChildLinks(brainDir, parentId) {
  const links = [];
  const seen = new Set();
  const addLink = (childId, label) => {
    if (typeof childId !== 'string' || !ID_RE.test(childId)) return;
    if (childId === parentId || seen.has(childId)) return;
    seen.add(childId);
    links.push({ childId, label });
  };

  const subagentsDir = join(brainDir, parentId, '.system_generated', 'subagents');
  if (existsSync(subagentsDir)) {
    try {
      for (const entry of readdirSync(subagentsDir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
        try {
          const raw = JSON.parse(readFileSync(join(subagentsDir, entry.name), 'utf-8'));
          const label = raw?.subagentDescriptor?.role || raw?.subagentDescriptor?.typeName || 'subagent';
          addLink(raw?.conversationId, label);
        } catch {
          // 忽略损坏的 descriptor
        }
      }
    } catch {
      // 忽略不可读目录
    }
  }

  const swarmMembersPath = join(brainDir, parentId, '.system_generated', 'swarm', 'members.json');
  if (existsSync(swarmMembersPath)) {
    try {
      const raw = JSON.parse(readFileSync(swarmMembersPath, 'utf-8'));
      const members = raw?.members && typeof raw.members === 'object' ? raw.members : {};
      for (const [name, member] of Object.entries(members)) {
        addLink(member?.conversation_id, `swarm:${name}`);
      }
    } catch {
      // 忽略损坏的 members.json
    }
  }

  return links;
}

/**
 * 收集所有会话，建立父子链路（防环），把子代理/Swarm 用量归集到根任务。
 */
export function collectConversations() {
  const rawById = new Map();
  for (const brainDir of getBrainDirs()) {
    let entries;
    try {
      entries = readdirSync(brainDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !ID_RE.test(entry.name)) continue;
      if (rawById.has(entry.name)) continue;
      const tp = transcriptPathIn(brainDir, entry.name);
      if (!existsSync(tp)) continue;
      const parsed = parseTranscript(entry.name, tp);
      if (parsed) rawById.set(entry.name, { parsed, brainDir });
    }
  }

  const parentOf = new Map(); // childId -> { parentId, label }
  const createsCycle = (parentId, childId) => {
    let cur = parentId;
    const visited = new Set();
    while (cur) {
      if (cur === childId) return true;
      if (visited.has(cur)) return true;
      visited.add(cur);
      cur = parentOf.get(cur)?.parentId;
    }
    return false;
  };

  for (const [parentId, { brainDir }] of rawById) {
    for (const { childId, label } of readChildLinks(brainDir, parentId)) {
      const childEntry = rawById.get(childId);
      if (!childEntry || childEntry.parsed.modelCalls <= 0) continue;
      if (parentOf.has(childId) || createsCycle(parentId, childId)) continue;
      parentOf.set(childId, { parentId, label });
    }
  }

  const childrenByParent = new Map();
  for (const [childId, info] of parentOf) {
    if (!childrenByParent.has(info.parentId)) childrenByParent.set(info.parentId, []);
    childrenByParent.get(info.parentId).push({ childId, label: info.label });
  }

  const gatherDescendants = (rootId) => {
    const out = [];
    const queue = [...(childrenByParent.get(rootId) || [])];
    const visited = new Set([rootId]);
    while (queue.length > 0) {
      const next = queue.shift();
      if (visited.has(next.childId)) continue;
      visited.add(next.childId);
      out.push(next);
      for (const grand of childrenByParent.get(next.childId) || []) queue.push(grand);
    }
    return out;
  };

  const result = [];
  for (const [id, { parsed }] of rawById) {
    if (parentOf.has(id)) continue;
    const descendants = gatherDescendants(id);
    if (parsed.modelCalls === 0 && descendants.length === 0) continue;

    if (descendants.length === 0) {
      result.push({ ...parsed, subagentCount: 0 });
      continue;
    }

    let inputTokens = parsed.inputTokens;
    let outputTokens = parsed.outputTokens;
    let cacheReadTokens = parsed.cacheReadTokens;
    let billedTokens = parsed.billedTokens;
    let totalTokens = parsed.totalTokens;
    let modelCalls = parsed.modelCalls;
    let toolCalls = parsed.toolCalls;
    let updatedAt = parsed.updatedAt;
    const stepMetrics = [...parsed.stepMetrics];
    const mergedTurns = [...parsed.turns];

    for (const { childId, label } of descendants) {
      const child = rawById.get(childId)?.parsed;
      if (!child) continue;
      inputTokens += child.inputTokens;
      outputTokens += child.outputTokens;
      cacheReadTokens += child.cacheReadTokens;
      billedTokens += child.billedTokens;
      totalTokens += child.totalTokens;
      modelCalls += child.modelCalls;
      toolCalls += child.toolCalls;
      if (String(child.updatedAt).localeCompare(String(updatedAt)) > 0) updatedAt = child.updatedAt;
      stepMetrics.push(...child.stepMetrics);
      mergedTurns.push({
        index: mergedTurns.length + 1,
        prompt: `[子代理 · ${label}] ${child.turns[0]?.prompt || child.id.slice(0, 8)}`,
        createdAt: child.startedAt,
        endedAt: child.updatedAt,
        inputTokens: child.inputTokens,
        outputTokens: child.outputTokens,
        cacheReadTokens: child.cacheReadTokens,
        billedTokens: child.billedTokens,
        totalTokens: child.totalTokens,
        contextTokens: child.turns[child.turns.length - 1]?.contextTokens || 0,
        modelCalls: child.modelCalls,
        toolCalls: child.toolCalls,
        toolNames: [],
        durationSec: 0,
        phaseSummary: null,
        isSubagent: true,
      });
    }

    result.push({
      ...parsed,
      updatedAt,
      turnCount: mergedTurns.length,
      modelCalls,
      toolCalls,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      billedTokens,
      totalTokens,
      cacheHitRate: (inputTokens + cacheReadTokens) > 0
        ? Number(((cacheReadTokens / (inputTokens + cacheReadTokens)) * 100).toFixed(1))
        : 0,
      subagentCount: descendants.length,
      turns: mergedTurns,
      stepMetrics,
    });
  }

  return result.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export function findConversation(convId, conversations) {
  if (typeof convId !== 'string' || !ID_RE.test(convId)) return null;
  const hit = Array.isArray(conversations) ? conversations.find((c) => c.id === convId) : null;
  if (hit) return hit;
  for (const brainDir of getBrainDirs()) {
    const tp = transcriptPathIn(brainDir, convId);
    if (existsSync(tp)) return parseTranscript(convId, tp);
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* 额度窗口（5 小时 / 本周）                                            */
/* ------------------------------------------------------------------ */

function startOfLocalWeekMs(nowMs) {
  const d = new Date(nowMs);
  const day = d.getDay(); // 0 = 周日
  const diffToMon = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diffToMon);
  return d.getTime();
}

function buildWindowQuota(used, limit) {
  const remaining = Math.max(0, limit - used);
  const remainingPct = limit > 0 ? Math.max(0, Math.min(100, (remaining / limit) * 100)) : 0;
  const usedPct = limit > 0 ? Math.min(100, (used / limit) * 100) : 100;
  return {
    used,
    limit,
    remaining,
    remainingPct: Number(remainingPct.toFixed(1)),
    usedPct: Number(usedPct.toFixed(1)),
  };
}

export function computeQuotaStats(conversations, quota, nowMs = Date.now()) {
  const fiveHoursAgo = nowMs - 5 * 60 * 60 * 1000;
  const weekStart = startOfLocalWeekMs(nowMs);
  const includeCache = quota.countMode === 'total';

  let used5h = 0;
  let usedWeekly = 0;

  for (const conv of conversations) {
    for (const s of conv.stepMetrics || []) {
      const val = includeCache ? s.inp + s.out + s.cache : s.inp + s.out;
      if (s.ts >= fiveHoursAgo) used5h += val;
      if (s.ts >= weekStart) usedWeekly += val;
    }
  }

  return {
    config: quota,
    weekStartAt: new Date(weekStart).toISOString(),
    window5h: buildWindowQuota(used5h, quota.limit5h),
    windowWeekly: buildWindowQuota(usedWeekly, quota.limitWeekly),
  };
}

/* ------------------------------------------------------------------ */
/* 时序聚合（7 天按日 / 24 小时按小时，本地时区）                        */
/* ------------------------------------------------------------------ */

function localDayKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function localHourKey(d) {
  return `${localDayKey(d)}-${String(d.getHours()).padStart(2, '0')}`;
}

function emptyBucket(key, label) {
  return { key, label, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, billedTokens: 0, totalTokens: 0 };
}

export function computeTimeSeries(conversations, nowMs = Date.now()) {
  const dailyMap = new Map();
  const daily = [];
  const todayStart = new Date(nowMs);
  todayStart.setHours(0, 0, 0, 0);

  for (let i = 6; i >= 0; i--) {
    const d = new Date(todayStart);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    const bucket = emptyBucket(key, `${d.getMonth() + 1}/${d.getDate()}`);
    dailyMap.set(key, bucket);
    daily.push(bucket);
  }

  const hourlyMap = new Map();
  const hourly = [];
  const curHour = new Date(nowMs);
  curHour.setMinutes(0, 0, 0);

  for (let i = 23; i >= 0; i--) {
    const d = new Date(curHour.getTime() - i * 3600_000);
    const key = localHourKey(d);
    const bucket = emptyBucket(key, `${String(d.getHours()).padStart(2, '0')}:00`);
    hourlyMap.set(key, bucket);
    hourly.push(bucket);
  }

  const minHourMs = curHour.getTime() - 23 * 3600_000;
  const minDayMs = todayStart.getTime() - 6 * 86_400_000;

  for (const conv of conversations) {
    for (const s of conv.stepMetrics || []) {
      if (s.ts < minDayMs && s.ts < minHourMs) continue;
      const d = new Date(s.ts);

      const dayBucket = dailyMap.get(localDayKey(d));
      if (dayBucket) {
        dayBucket.inputTokens += s.inp;
        dayBucket.outputTokens += s.out;
        dayBucket.cacheReadTokens += s.cache;
        dayBucket.billedTokens += s.inp + s.out;
        dayBucket.totalTokens += s.inp + s.out + s.cache;
      }

      if (s.ts >= minHourMs) {
        const hourBucket = hourlyMap.get(localHourKey(d));
        if (hourBucket) {
          hourBucket.inputTokens += s.inp;
          hourBucket.outputTokens += s.out;
          hourBucket.cacheReadTokens += s.cache;
          hourBucket.billedTokens += s.inp + s.out;
          hourBucket.totalTokens += s.inp + s.out + s.cache;
        }
      }
    }
  }

  return { daily, hourly };
}
