/**
 * PostInvocation Hook: 每轮交互结束自动在聊天流中输出用量播报与直达链接
 */

import { readFileSync, existsSync } from 'node:fs';

function formatNum(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

async function main() {
  let inputData = '';
  process.stdin.setEncoding('utf-8');

  for await (const chunk of process.stdin) {
    inputData += chunk;
  }

  if (!inputData.trim()) {
    console.log(JSON.stringify({ injectSteps: [] }));
    return;
  }

  try {
    const payload = JSON.parse(inputData);
    const transcriptPath = payload.transcriptPath;

    if (!transcriptPath || !existsSync(transcriptPath)) {
      console.log(JSON.stringify({ injectSteps: [] }));
      return;
    }

    const content = readFileSync(transcriptPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);

    let lastPlanner = null;
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(lines[i]);
        if (obj.type === 'PLANNER_RESPONSE') {
          lastPlanner = obj;
          break;
        }
      } catch {}
    }

    if (!lastPlanner) {
      console.log(JSON.stringify({ injectSteps: [] }));
      return;
    }

    const inTok = lastPlanner.input_tokens || 0;
    const outTok = lastPlanner.output_tokens || 0;
    const cacheTok = lastPlanner.cache_read_tokens || 0;
    const total = inTok + cacheTok;
    const cacheRate = total > 0 ? ((cacheTok / total) * 100).toFixed(1) : '0.0';

    const markdown = `📊 **本轮用量播报**: 输入 \`${formatNum(inTok)}\` · 输出 \`${formatNum(outTok)}\` · 缓存命中 \`${cacheRate}%\` (读 ${formatNum(cacheTok)}) | [📊 打开用量看板](sidecar://usage_monitor/)`;

    const response = {
      injectSteps: [
        {
          systemMessage: {
            systemMessage: "",
            metadata: {
              user_markdown: markdown
            }
          }
        }
      ]
    };

    console.log(JSON.stringify(response));
  } catch (err) {
    console.log(JSON.stringify({ injectSteps: [] }));
  }
}

main();
