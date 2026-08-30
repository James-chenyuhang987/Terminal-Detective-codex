import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runDetectiveRule } from './rules.js';

const MAX_BODY_BYTES = 64 * 1024;

export default async function (req) {
  try {
    if (req.method !== 'POST') return Response.json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' }, { status: 405 });
    const declaredLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' }, { status: 413 });
    }

    // This validates the Base44 request context while the case registry remains
    // server-only and absent from the browser bundle.
    createClientFromRequest(req);
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return Response.json({ error: 'Request body too large.', code: 'BODY_TOO_LARGE' }, { status: 413 });
    }
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'Invalid JSON body.', code: 'INVALID_JSON' }, { status: 400 });
    }
    const task = typeof body?.task === 'string' ? body.task.slice(0, 64) : '';
    const payload = body?.payload && typeof body.payload === 'object' && !Array.isArray(body.payload)
      ? body.payload
      : {};
    return Response.json({ data: runDetectiveRule(task, payload), source: 'rules' });
  } catch (error) {
    const code = typeof error?.code === 'string' ? error.code : 'RULES_UNAVAILABLE';
    const status = ['UNKNOWN_TASK', 'UNKNOWN_CASE', 'UNKNOWN_NPC', 'INVALID_TEAM', 'INVALID_QUESTION', 'INVALID_CLUES', 'INVALID_EVIDENCE', 'INVALID_REPORT_OPTION', 'QUESTION_LOCKED', 'STALE_OPTIONS'].includes(code)
      ? 400
      : 500;
    console.error('detectiveRules failed:', code);
    return Response.json({ error: code, code }, { status });
  }
}
