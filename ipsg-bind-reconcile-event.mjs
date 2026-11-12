// 只读对账事件桥：将 IPSG 已判定事件提交到 agent-autoloop，不执行设备动作。
import { readFileSync } from 'node:fs';

const base = (process.env.AGENT_AUTOLOOP_URL || 'http://127.0.0.1:3351').replace(/\/$/, '');
const source = 'ipsg-reconciliation';
const type = 'bind.reconciliation';
function sourceKey() {
  if (process.env.AGENT_AUTOLOOP_KEY) return process.env.AGENT_AUTOLOOP_KEY.trim();
  const home = process.env.AGENT_AUTOLOOP_HOME;
  if (!home) return '';
  try {
    const config = JSON.parse(readFileSync(`${home}/config.json`, 'utf8'));
    return String(config?.sources?.[source]?.key || '').trim();
  } catch {
    return '';
  }
}
const key = sourceKey();
const file = process.argv[2];
if (!file) { console.error('用法: node ipsg-bind-reconcile-event.mjs event.json'); process.exit(2); }
const fs = await import('node:fs/promises');
const event = JSON.parse(await fs.readFile(file, 'utf8'));
if (!event.eventId || !['overdue_missing', 'mismatch', 'needs_review'].includes(event.status)) throw new Error('只允许提交已判定的对账异常事件');
if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(String(event.bindIp || ''))) throw new Error('对账事件缺少合法 bindIp');
if (event.matchType !== undefined && typeof event.matchType !== 'string') throw new Error('matchType 必须是文字');
const payload = { id: event.eventId, type, subject: event.bindIp, summary: event.status, detail: JSON.stringify({ eventId: event.eventId, decisionId: event.decisionId || null, matchType: event.matchType, evidence: event.evidenceRefs || null }) };
if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({ url: `${base}/v1/events`, source, payload }, null, 2)); process.exit(0); }
if (!key) throw new Error('缺少 AGENT_AUTOLOOP_KEY（必须是 ipsg-reconciliation 来源密钥）');
const res = await fetch(`${base}/v1/events`, { method: 'POST', headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: JSON.stringify(payload) });
const text = await res.text();
if (!res.ok) throw new Error(`agent-autoloop ${res.status}: ${text.slice(0, 200)}`);
console.log(text);
