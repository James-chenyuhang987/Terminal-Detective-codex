import {
  normalizeProfile, evaluateAchievements, applyCheckin, purchaseItem, consumeEnergyCell,
  buyAndUseEnergyCell, toggleEquipItem, unlockTech, claimAchievement, claimTask,
  claimWeeklyReward, claimLevelReward, markActivity, editIdentity, SEVEN_DAY_TASKS,
  startCase, settleCase,
} from '../../src/game/homeProgress.js';
import {
  DEFAULT_AGENT_IDS, getAgentById, getOwnedAgentIds, getActiveSupportAgentId,
  purchaseAgent, activateSupportAgent,
} from '../../src/game/agentMarket.js';
import { getLevelFromXP, SKILL_TREES } from '../../src/game/agentProgression.js';
import { AGENT_SPECIALTIES, SPECIALTY_BUDGET } from '../../src/game/specialtySystem.js';
import { buildTeamConfig, normalizeSavedTeamConfig } from '../../src/game/teamConfig.js';
import { ALL_CASES } from '../../src/game/caseData.js';

export function invalidCommand(message = 'Invalid command.') {
  return Object.assign(new Error(message), { code: 'INVALID_COMMAND', status: 400 });
}

export function plainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

export function exactKeys(value, allowed, required = []) {
  if (!plainObject(value) || Object.keys(value).some(key => !allowed.includes(key))
    || required.some(key => !Object.hasOwn(value, key))) throw invalidCommand();
}

function identifier(value) {
  if (typeof value !== 'string' || !value || value.length > 128) throw invalidCommand();
  return value;
}

export function normalizeProgression(value) {
  const rows = Array.isArray(value) ? value : [];
  return DEFAULT_AGENT_IDS.map((agent_id, index) => {
    const known = rows.find(row => row?.agent_id === agent_id);
    const legacy = rows[index]?.agent_id ? null : rows[index];
    const xp = Number(known?.xp ?? legacy?.xp ?? 0);
    return { agent_id, xp: Number.isFinite(xp) ? Math.max(0, Math.floor(xp)) : 0 };
  });
}

export function normalizeSkills(value, progression) {
  const rows = Array.isArray(value) ? value : [];
  return DEFAULT_AGENT_IDS.map((agent_id, index) => {
    const requested = rows.find(row => row?.agent_id === agent_id)?.skill_ids
      ?? (Array.isArray(rows[index]) ? rows[index] : []);
    const ids = new Set(Array.isArray(requested) ? requested : []);
    const level = getLevelFromXP(progression[index]?.xp || 0);
    const skill_ids = [];
    for (const skill of SKILL_TREES[index]) {
      if (level < skill.unlock_level || !ids.has(skill.id)) break;
      skill_ids.push(skill.id);
    }
    return { agent_id, skill_ids };
  });
}

export function validateSavedTeam(value, profile) {
  exactKeys(value, ['specs', 'priorities', 'primary_agent_index', 'command_plan', 'core_agent_ids'], ['specs']);
  if (!Array.isArray(value.specs) || value.specs.length !== 3) throw invalidCommand('Invalid team specs.');
  value.specs.forEach((spec, index) => {
    exactKeys(spec, AGENT_SPECIALTIES[index].specialty_slots);
    if (Object.values(spec).some(points => !Number.isSafeInteger(points) || points < 0)
      || Object.values(spec).reduce((sum, points) => sum + points, 0) > SPECIALTY_BUDGET) {
      throw invalidCommand('Invalid specialty allocation.');
    }
  });
  if (value.primary_agent_index !== undefined
    && (!Number.isInteger(value.primary_agent_index) || value.primary_agent_index < 0 || value.primary_agent_index > 2)) {
    throw invalidCommand('Invalid primary agent.');
  }
  if (value.command_plan !== undefined) exactKeys(value.command_plan, ['doctrine_id', 'contingency_id']);
  if (value.priorities !== undefined && (!Array.isArray(value.priorities) || value.priorities.length !== 3
    || value.priorities.some(row => !Array.isArray(row) || row.length > 12 || row.some(id => typeof id !== 'string')))) {
    throw invalidCommand('Invalid priorities.');
  }
  if (value.core_agent_ids !== undefined) {
    const owned = getOwnedAgentIds(profile);
    if (!Array.isArray(value.core_agent_ids) || value.core_agent_ids.length !== 3
      || value.core_agent_ids.some((id, index) => !owned.includes(id) || getAgentById(id)?.core_slot !== index)) {
      throw invalidCommand('Agent not owned or in wrong slot.');
    }
  }
  return normalizeSavedTeamConfig(value);
}

export function authoritativeProfile(raw, now = new Date()) {
  const profile = normalizeProfile(raw, now);
  profile.agent_progression = normalizeProgression(profile.agent_progression);
  profile.skill_loadout = normalizeSkills(profile.skill_loadout, profile.agent_progression);
  // Existing D1 snapshots are the migration baseline, never a browser import.
  // Invalid old loadouts must not become a route to fabricated team attributes.
  try {
    profile.saved_team_config = profile.saved_team_config
      ? validateSavedTeam(profile.saved_team_config, profile) : null;
  } catch {
    profile.saved_team_config = null;
  }
  profile.home_progress_version = 2;
  return evaluateAchievements(profile);
}

function mailAvailable(profile, id) {
  if (id === 'welcome') return true;
  if (/^case[1-8]$/.test(id)) return profile.solved_cases.includes(`Lvl_0${id.slice(4)}`);
  if (id === 'tech') return profile.tech_unlocks.length > 0;
  if (id === 'week') return SEVEN_DAY_TASKS.every(task => profile.reward_claims.includes(`seven:${task.id}`));
  return false;
}

const COMMAND_FIELDS = Object.freeze({
  identity: ['patch'], checkin: [], purchase_item: ['item_id', 'quantity'], consume_energy_cell: [],
  buy_use_energy_cell: [], equip_item: ['item_id'], unlock_tech: ['tech_id'],
  claim_achievement: ['achievement_id'], claim_task: ['kind', 'task_id'], claim_weekly: [], claim_level: ['level'],
  visit_lobby: [], save_team: ['team_config'], skill_loadout: ['skill_loadout'],
  purchase_agent: ['agent_id'], activate_support: ['agent_id'], mail_read: ['mail_id'],
  mail_reply: ['mail_id', 'choice_id'], start_case: ['case_id', 'team_config'], settle_case: ['run_id'],
});

export function validateProfileCommand(command) {
  if (!plainObject(command) || !Object.hasOwn(COMMAND_FIELDS, command.type)) throw invalidCommand();
  exactKeys(command, ['type', ...COMMAND_FIELDS[command.type]], ['type']);
  for (const key of COMMAND_FIELDS[command.type]) {
    if (key.endsWith('_id')) identifier(command[key]);
  }
  if (command.type === 'claim_task' && !['tutorial', 'seven'].includes(command.kind)) throw invalidCommand();
  if (command.type === 'claim_level' && !Number.isSafeInteger(command.level)) throw invalidCommand();
  if (command.type === 'purchase_item' && command.quantity !== undefined
    && (!Number.isSafeInteger(command.quantity) || command.quantity < 1 || command.quantity > 10)) throw invalidCommand();
  if (command.type === 'identity') {
    exactKeys(command.patch, ['detective_name', 'avatar', 'signature', 'identity_badge', 'detective_tags']);
    for (const [key, value] of Object.entries(command.patch)) {
      if (key === 'detective_tags') {
        if (!Array.isArray(value) || value.length > 3 || value.some(tag => typeof tag !== 'string' || tag.length > 16)) throw invalidCommand();
      } else if (typeof value !== 'string' || value.length > 100) throw invalidCommand();
    }
  }
  return command;
}

export function applyProfileCommand(profile, command, now = new Date()) {
  validateProfileCommand(command);
  switch (command.type) {
    case 'identity': return editIdentity(profile, command.patch);
    case 'checkin': return applyCheckin(profile, now);
    case 'purchase_item': return purchaseItem(profile, command.item_id, command.quantity ?? 1);
    case 'consume_energy_cell': return consumeEnergyCell(profile);
    case 'buy_use_energy_cell': return buyAndUseEnergyCell(profile);
    case 'equip_item': return toggleEquipItem(profile, command.item_id);
    case 'unlock_tech': return unlockTech(profile, command.tech_id);
    case 'claim_achievement': return claimAchievement(profile, command.achievement_id);
    case 'claim_task': return claimTask(profile, command.kind, command.task_id, now);
    case 'claim_weekly': return claimWeeklyReward(profile, now);
    case 'claim_level': return claimLevelReward(profile, command.level, now);
    case 'visit_lobby': return { profile: markActivity(profile, 'lobby_visits') };
    case 'purchase_agent': return purchaseAgent(profile, command.agent_id);
    case 'activate_support': return activateSupportAgent(profile, command.agent_id);
    case 'save_team': return {
      profile: { ...markActivity(profile, 'team_saved'), saved_team_config: validateSavedTeam(command.team_config, profile) },
    };
    case 'skill_loadout': {
      if (!Array.isArray(command.skill_loadout) || command.skill_loadout.length !== 3) throw invalidCommand();
      command.skill_loadout.forEach(row => {
        if (Array.isArray(row)) {
          if (row.length > 5 || row.some(id => typeof id !== 'string')) throw invalidCommand();
        } else {
          exactKeys(row, ['agent_id', 'skill_ids'], ['agent_id', 'skill_ids']);
          if (!DEFAULT_AGENT_IDS.includes(row.agent_id) || !Array.isArray(row.skill_ids)
            || row.skill_ids.length > 5 || row.skill_ids.some(id => typeof id !== 'string')) throw invalidCommand();
        }
      });
      const skill_loadout = normalizeSkills(command.skill_loadout, profile.agent_progression);
      const requestedCount = command.skill_loadout.reduce((count, row) => count + (Array.isArray(row) ? row : row.skill_ids).length, 0);
      if (skill_loadout.reduce((count, row) => count + row.skill_ids.length, 0) !== requestedCount) {
        return { profile, error: 'skill_locked' };
      }
      return { profile: { ...profile, skill_loadout } };
    }
    case 'mail_read': {
      if (!mailAvailable(profile, command.mail_id)) return { profile, error: 'mail_locked' };
      return { profile: { ...profile, mail_read_ids: [...new Set([...profile.mail_read_ids, command.mail_id])] } };
    }
    case 'mail_reply': {
      if (!mailAvailable(profile, command.mail_id) || !/^case[1-8]$/.test(command.mail_id)) return { profile, error: 'mail_locked' };
      if (![`${command.mail_id}:0`, `${command.mail_id}:1`].includes(command.choice_id)) throw invalidCommand();
      if (profile.mail_reply_choices.some(id => id.startsWith(`${command.mail_id}:`))) return { profile, error: 'already_claimed' };
      return { profile: {
        ...profile, mail_read_ids: [...new Set([...profile.mail_read_ids, command.mail_id])],
        mail_reply_choices: [...profile.mail_reply_choices, command.choice_id],
      } };
    }
    default: throw invalidCommand();
  }
}

export function prepareCaseStart(profile, command, now) {
  const caseData = ALL_CASES.find(entry => entry.case_id === command.case_id);
  if (!caseData) throw invalidCommand('Unknown case.');
  const saved = validateSavedTeam(command.team_config ?? profile.saved_team_config ?? { specs: [{}, {}, {}] }, profile);
  const teamConfig = buildTeamConfig(saved, saved.primary_agent_index, profile.skill_loadout, getActiveSupportAgentId(profile), caseData.case_id);
  // Mission bonuses only apply when an owned item is consumed by this paid start.
  const equipped_items = profile.equipped_items.filter(id => profile.inventory[id] > 0);
  const outcome = startCase({ ...profile, equipped_items }, caseData, now);
  return { ...outcome, caseData, teamConfig };
}

export function settleAuthoritativeCase(profile, summary, now) {
  if (profile.rewarded_runs.includes(summary.run_id)) return { profile, duplicate: true };
  const progression = normalizeProgression(profile.agent_progression)
    .map(row => ({ ...row, xp: row.xp + Math.max(0, Number(summary.xp_gain) || 0) }));
  const levels = progression.map(row => getLevelFromXP(row.xp));
  return settleCase({ ...profile, agent_progression: progression }, {
    ...summary, best_agent_level: Math.max(...levels), all_agents_min_level: Math.min(...levels),
  }, now);
}
