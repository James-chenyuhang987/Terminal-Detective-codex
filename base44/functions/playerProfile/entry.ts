import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const MAX_BODY_BYTES = 512 * 1024;
const PROFILE_FIELDS = new Set([
  'detective_name', 'avatar', 'signature', 'identity_badge', 'detective_tags',
  'level', 'xp', 'rank_title', 'energy', 'energy_updated_at', 'diamonds', 'gold',
  'last_checkin', 'checkin_streak', 'checkin_history', 'achievements', 'solved_cases',
  'unsolved_count', 'rename_count', 'inventory', 'equipped_items', 'tech_unlocks',
  'case_records', 'activity_stats', 'reward_claims', 'journey_started_on',
  'mail_read_ids', 'mail_reply_choices', 'rewarded_runs', 'weekly_records',
  'agent_progression', 'skill_loadout', 'saved_team_config', 'home_progress_version',
]);

function json(payload, status = 200) {
  return Response.json(payload, { status });
}

function error(code, message, status = 400, extra = {}) {
  return json({ error: code, message, ...extra }, status);
}

function validSessionId(value) {
  return typeof value === 'string' && value.length >= 16 && value.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(value);
}

function cleanPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  if (keys.some(key => !PROFILE_FIELDS.has(key))) return null;
  return Object.fromEntries(keys.map(key => [key, value[key]]));
}

export default async function (req) {
  try {
    if (req.method !== 'POST') return error('METHOD_NOT_ALLOWED', 'POST is required.', 405);
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return error('INVALID_PATCH', 'Request body is too large.', 413);
    }

    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
      return error('INVALID_PATCH', 'Request body is too large.', 413);
    }
    let body;
    try { body = JSON.parse(raw); } catch { return error('INVALID_PATCH', 'Invalid JSON body.'); }

    const sessionId = body?.session_id;
    if (!validSessionId(sessionId)) return error('INVALID_PATCH', 'Invalid session id.');
    const base44 = createClientFromRequest(req);
    const me = await base44.auth.me();
    if (!me?.id) return error('UNAUTHENTICATED', 'Authentication is required.', 401);
    const revision = Math.max(0, Math.floor(Number(me.profile_revision) || 0));

    if (body.action === 'claim_session') {
      const nextRevision = revision + 1;
      await base44.auth.updateMe({ active_session_id: sessionId, profile_revision: nextRevision });
      return json({
        profile: { ...me, active_session_id: sessionId, profile_revision: nextRevision },
        account: { id: me.id, email: me.email, full_name: me.full_name },
      });
    }

    if (me.active_session_id !== sessionId) {
      return error('SESSION_TAKEN', 'This account is active on another device.', 409, {
        profile_revision: revision,
      });
    }

    if (body.action === 'status') {
      return json({
        profile: me,
        account: { id: me.id, email: me.email, full_name: me.full_name },
      });
    }

    if (body.action !== 'patch') return error('INVALID_PATCH', 'Unknown action.');
    const expected = Math.max(0, Math.floor(Number(body.expected_revision) || 0));
    if (expected !== revision) {
      return error('STALE_PROFILE', 'Profile revision is stale.', 409, {
        profile: me, profile_revision: revision,
      });
    }
    const patch = cleanPatch(body.patch);
    if (!patch) return error('INVALID_PATCH', 'Patch contains unsupported fields.');

    const nextRevision = revision + 1;
    await base44.auth.updateMe({ ...patch, active_session_id: sessionId, profile_revision: nextRevision });
    return json({
      profile: { ...me, ...patch, active_session_id: sessionId, profile_revision: nextRevision },
      account: { id: me.id, email: me.email, full_name: me.full_name },
    });
  } catch (cause) {
    console.error('playerProfile failed:', cause);
    return error('PROFILE_UNAVAILABLE', 'Profile service unavailable.', 500);
  }
}
