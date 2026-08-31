import { appParams } from '../lib/app-params.js';
import { SKILL_TREES, getLevelFromXP } from './agentProgression.js';
import { AGENT_DEFS, normalizeSavedTeamConfig } from './teamConfig.js';
import {
  ACHIEVEMENTS,
  PROFILE_FIELD_KEYS,
  evaluateAchievements,
  normalizeProfile,
  settleCase,
} from './homeProgress.js';

export {
  ACHIEVEMENT_TOTAL, ENERGY_MAX, ENERGY_OVERFLOW_MAX, ENERGY_MINUTES_PER_POINT,
  XP_PER_LEVEL, DETECTIVE_LEVEL_CAP, CURRENCY_CAPS, CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS,
  ITEM_CATALOG, TECH_CATALOG, ACHIEVEMENTS,
  TUTORIAL_TASKS, SEVEN_DAY_TASKS, LEVEL_REWARDS, KNOWN_CASE_IDS, localDateKey, isoWeekKey,
  daysBetween, regenEnergy, energyCountdown, canCheckin, applyCheckin,
  quotePurchase, purchaseItem, consumeEnergyCell, buyAndUseEnergyCell, getEconomySnapshot,
  toggleEquipItem, unlockTech, getTechEffects,
  startCase, settleCase, dailyIntelCaseId, weeklyChallenge, evaluateAchievements,
  achievementProgress, claimAchievement, tutorialTaskDone, sevenDayTaskDone,
  claimTask, claimWeeklyReward, claimLevelReward, claimableLevelRewardCount,
  markActivity, editIdentity, normalizeProfile,
} from './homeProgress.js';

export const PROFILE_VERSION = 2;
export const PROFILE_SYNC_FIELDS = Object.freeze([...PROFILE_FIELD_KEYS]);
export const PROFILE_PATCH_FIELDS = Object.freeze(PROFILE_SYNC_FIELDS.filter(
  key => !['profile_revision', 'active_session_id'].includes(key),
));
export const PENDING_SETTLEMENTS_KEY = 'pending_settlements_v1';
const LOCAL_MIGRATION_KEYS = Object.freeze({
  progression: 'agent_progression_v1', rewarded: 'agent_rewarded_runs_v1',
  skills: 'skill_equipped_v1', team: 'save_team_config',
});

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).filter(value => typeof value === 'string' && value))];
}

function safeParse(value, fallback) {
  try { return value ? JSON.parse(value) : fallback; } catch { return fallback; }
}

function storageOrNull(storage) {
  if (storage) return storage;
  return typeof localStorage === 'undefined' ? null : localStorage;
}

function pendingKey(ownerId) {
  const suffix = typeof ownerId === 'string' && ownerId ? ownerId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96) : '';
  return suffix ? `${PENDING_SETTLEMENTS_KEY}:${suffix}` : PENDING_SETTLEMENTS_KEY;
}

export function sanitizeProfileWrite(profile) {
  const normalized = normalizeProfile(profile || {});
  return Object.fromEntries(PROFILE_PATCH_FIELDS.map(key => [key, normalized[key]]));
}

export function sanitizeProfilePatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const keys = Object.keys(patch);
  if (keys.some(key => !PROFILE_PATCH_FIELDS.includes(key))) return null;
  const normalized = sanitizeProfileWrite(patch);
  return Object.fromEntries(keys.map(key => [key, normalized[key]]));
}

export function diffProfileWrite(before, after) {
  const previous = sanitizeProfileWrite(before || {});
  const next = sanitizeProfileWrite(after || {});
  return Object.fromEntries(PROFILE_PATCH_FIELDS
    .filter(key => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
    .map(key => [key, next[key]]));
}

export function knownAchievementCount(profile) {
  const known = new Set(ACHIEVEMENTS.map(item => item.id));
  return unique(profile?.achievements).filter(id => known.has(id)).length;
}

export function normalizeAgentProgression(value) {
  const rows = Array.isArray(value) ? value : [];
  return AGENT_DEFS.map((agent, index) => {
    const byId = rows.find(row => row?.agent_id === agent.id);
    // Positional fallback is reserved for the old `{ xp }[]` format. Mixing an
    // identified row into another agent by array index would duplicate XP.
    const legacy = rows[index]?.agent_id ? null : rows[index];
    const xp = Number(byId?.xp ?? legacy?.xp ?? 0);
    return { agent_id: agent.id, xp: Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0 };
  });
}

export function normalizeSkillLoadout(value, progression) {
  const rows = Array.isArray(value) ? value : [];
  const agentProgression = normalizeAgentProgression(progression);
  return AGENT_DEFS.map((agent, agentIdx) => {
    const raw = rows.find(row => row?.agent_id === agent.id)?.skill_ids
      ?? (Array.isArray(rows[agentIdx]) ? rows[agentIdx] : []);
    const allowed = SKILL_TREES[agentIdx] || [];
    const level = getLevelFromXP(agentProgression[agentIdx]?.xp || 0);
    const requested = new Set(unique(raw));
    const skillIds = [];
    for (const skill of allowed) {
      if (level < skill.unlock_level || !requested.has(skill.id)) break;
      skillIds.push(skill.id);
    }
    return { agent_id: agent.id, skill_ids: skillIds };
  });
}

export function migrateProfileV2(raw = {}, storage) {
  const target = storageOrNull(storage);
  const normalized = normalizeProfile(raw);
  if (normalized.home_progress_version >= PROFILE_VERSION) {
    const agentProgression = normalizeAgentProgression(normalized.agent_progression);
    return evaluateAchievements(normalizeProfile({
      ...normalized,
      agent_progression: agentProgression,
      skill_loadout: normalizeSkillLoadout(normalized.skill_loadout, agentProgression),
      saved_team_config: normalizeSavedTeamConfig(normalized.saved_team_config),
      home_progress_version: PROFILE_VERSION,
    }));
  }
  const cloudProgression = normalizeAgentProgression(normalized.agent_progression);
  const localProgression = normalizeAgentProgression(safeParse(target?.getItem(LOCAL_MIGRATION_KEYS.progression), []));
  const agentProgression = cloudProgression.map((row, index) => ({
    ...row, xp: Math.max(row.xp, localProgression[index]?.xp || 0),
  }));
  const rewardedRuns = unique([
    ...normalized.rewarded_runs,
    ...unique(safeParse(target?.getItem(LOCAL_MIGRATION_KEYS.rewarded), [])),
  ]);
  const cloudHasSkills = normalized.skill_loadout.some(row => row?.skill_ids?.length);
  const skillSource = cloudHasSkills
    ? normalized.skill_loadout
    : safeParse(target?.getItem(LOCAL_MIGRATION_KEYS.skills), []);
  const cloudTeam = normalizeSavedTeamConfig(normalized.saved_team_config);
  const localTeam = normalizeSavedTeamConfig(safeParse(target?.getItem(LOCAL_MIGRATION_KEYS.team), null));
  return evaluateAchievements(normalizeProfile({
    ...normalized,
    agent_progression: agentProgression,
    skill_loadout: normalizeSkillLoadout(skillSource, agentProgression),
    saved_team_config: cloudTeam || localTeam,
    rewarded_runs: rewardedRuns,
    home_progress_version: PROFILE_VERSION,
  }));
}

export function enqueuePendingSettlement(summary, storage, ownerId = '') {
  if (!summary?.run_id) return [];
  const target = storageOrNull(storage);
  const key = pendingKey(ownerId);
  const current = safeParse(target?.getItem(key), []);
  const next = [...(Array.isArray(current) ? current.filter(item => item?.run_id !== summary.run_id) : []), summary];
  target?.setItem(key, JSON.stringify(next));
  return next;
}

export function readPendingSettlements(storage, ownerId = '') {
  const target = storageOrNull(storage);
  const current = safeParse(target?.getItem(pendingKey(ownerId)), []);
  return Array.isArray(current) ? current.filter(item => item?.run_id) : [];
}

export function removePendingSettlement(runId, storage, ownerId = '') {
  const target = storageOrNull(storage);
  const key = pendingKey(ownerId);
  const next = readPendingSettlements(target, ownerId).filter(item => item.run_id !== runId);
  if (next.length) target?.setItem(key, JSON.stringify(next));
  else target?.removeItem(key);
  return next;
}

export function applySettlementToProfile(profile, summary) {
  if (profile?.rewarded_runs?.includes(summary?.run_id)) return settleCase(profile, summary);
  const progression = normalizeAgentProgression(profile.agent_progression);
  const xpGain = Math.max(0, Number(summary?.xp_gain) || 0);
  const nextProgression = progression.map(agent => ({ ...agent, xp: agent.xp + xpGain }));
  const levels = nextProgression.map(agent => getLevelFromXP(agent.xp));
  return settleCase({ ...profile, agent_progression: nextProgression }, {
    ...summary,
    best_agent_level: Math.max(0, ...levels),
    all_agents_min_level: Math.min(...levels),
  });
}

function unwrapFunctionResponse(response) {
  const payload = response?.data ?? response ?? {};
  if (payload?.error) {
    const error = /** @type {Error & { code?: string, payload?: any }} */ (new Error(payload.message || payload.error));
    error.code = payload.error;
    error.payload = payload;
    throw error;
  }
  return payload;
}

function profileRequestError(code, message, status, payload = {}) {
  const error = /** @type {Error & { code?: string, status?: number, payload?: any }} */ (new Error(message));
  error.code = code;
  error.status = status;
  error.payload = payload;
  return error;
}

export async function invokePlayerProfile(action, payload = {}) {
  const headers = /** @type {Record<string, string>} */ ({
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-App-Id': String(appParams.appId),
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(`${appParams.serverUrl}/api/apps/${appParams.appId}/functions/playerProfile`, {
      method: 'POST', headers, credentials: 'include', body: JSON.stringify({ action, ...payload }), signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    if (response.ok) {
      const result = unwrapFunctionResponse(body);
      if (result?.profile && typeof result.profile === 'object') return result;
      throw profileRequestError('PROFILE_UNAVAILABLE', 'Cloud profile returned an invalid response.', 502, body);
    }
    const result = unwrapFunctionResponse(body);
    throw profileRequestError(
      body?.error || 'PROFILE_UNAVAILABLE',
      body?.message || body?.detail || `Profile request failed (${response.status}).`,
      response.status,
      result,
    );
  } catch (cause) {
    if (cause?.name === 'AbortError') {
      const error = /** @type {Error & { code?: string }} */ (new Error('Profile request timed out.'));
      error.code = 'PROFILE_TIMEOUT';
      throw error;
    }
    const data = cause?.response?.data || cause?.data || cause?.body;
    if (data?.error) {
      const error = /** @type {Error & { code?: string, payload?: any }} */ (new Error(data.message || data.error));
      error.code = data.error;
      error.payload = data;
      throw error;
    }
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}
