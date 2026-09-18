import {
  confidenceFromExpertise,
  decisionForecast,
  getActionFocus,
  agentExpertise,
} from './commandSystem.js';

export const REHEARSAL_EVENTS = Object.freeze([
  {
    id: 'missing-surveillance',
    actionTag: 'check_cctv',
    riskLevel: 'medium',
    title: '监控缺失',
    titleEn: 'SURVEILLANCE GAP',
    prompt: '关键时间段的监控被人为切断。谁先重建现场时间线？',
    promptEn: 'The key surveillance window was cut. Who reconstructs the timeline first?',
    focus: 'observation_focus',
  },
  {
    id: 'conflicting-testimony',
    actionTag: 'interrogate_suspect',
    riskLevel: 'high',
    title: '证人口供冲突',
    titleEn: 'CONFLICTING TESTIMONY',
    prompt: '两名证人的说法互相矛盾。谁先稳住谈话并找出逻辑断点？',
    promptEn: 'Two witnesses contradict each other. Who stabilizes the interview and finds the logical break?',
    focus: 'logic_power',
  },
  {
    id: 'locked-terminal',
    actionTag: 'hack_terminal',
    riskLevel: 'medium',
    title: '锁定终端',
    titleEn: 'LOCKED TERMINAL',
    prompt: '终端即将清除缓存。谁先接管访问链路？',
    promptEn: 'The terminal is purging its cache. Who takes over the access chain first?',
    focus: 'hack_level',
  },
]);

function finite(value, fallback = 0) {
  if (typeof value === 'boolean') return fallback;
  try {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  } catch {
    return fallback;
  }
}

function readValue(value, key) {
  try {
    return value?.[key];
  } catch {
    return undefined;
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAgentId(agent) {
  const value = readValue(agent, 'agent_id');
  if (typeof value === 'string' && value) return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : null;
}

function normalizeEvent(event) {
  const actionTag = readValue(event, 'actionTag');
  const configured = REHEARSAL_EVENTS.find(candidate => candidate.actionTag === actionTag) || REHEARSAL_EVENTS[0];
  const riskLevel = readValue(event, 'riskLevel');
  return {
    actionTag: configured.actionTag,
    riskLevel: ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : configured.riskLevel,
  };
}

export function getRehearsalEvent(index = 0) {
  return REHEARSAL_EVENTS[Math.max(0, Math.min(REHEARSAL_EVENTS.length - 1, Math.floor(finite(index))))];
}

export function evaluateRehearsalChoice(event, agent) {
  const safeEvent = normalizeEvent(event);
  const focusKeys = getActionFocus(safeEvent.actionTag);
  const safeAgent = Object.fromEntries(focusKeys.map(key => [key, Math.max(0, finite(readValue(agent, key)))]));
  const expertise = agentExpertise(safeAgent, safeEvent.actionTag);
  const confidence = confidenceFromExpertise(expertise);
  const forecast = decisionForecast(safeEvent.actionTag, safeEvent.riskLevel);
  const focusValue = focusKeys.reduce((best, key) => Math.max(best, safeAgent[key]), 0);
  const mitigation = Math.round(Math.max(0, Math.min(12, focusValue / 4)));
  const confusion = forecast.confusion.map((value, index) => Math.max(0, value - (index ? mitigation : Math.floor(mitigation / 2))));
  const outcome = expertise >= 75 ? 'clean' : expertise >= 45 ? 'tradeoff' : 'exposed';

  return {
    agentId: normalizeAgentId(agent),
    expertise,
    confidence,
    forecast,
    focusKeys,
    mitigation,
    confusion,
    outcome,
  };
}

function normalizeExpertise(result) {
  const value = readValue(result, 'expertise');
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const expertise = finite(value, NaN);
  return Number.isFinite(expertise) ? Math.max(0, Math.min(100, expertise)) : null;
}

export function summarizeRehearsal(results) {
  const entries = (Array.isArray(results) ? results : [])
    .filter(isRecord)
    .map(result => ({ result, expertise: normalizeExpertise(result) }))
    .filter(entry => entry.expertise !== null);
  const total = entries.reduce((sum, entry) => sum + entry.expertise, 0);
  const averageExpertise = entries.length ? Math.round(total / entries.length) : 0;
  const clean = entries.filter(entry => readValue(entry.result, 'outcome') === 'clean').length;
  const exposed = entries.filter(entry => readValue(entry.result, 'outcome') === 'exposed').length;
  return {
    averageExpertise,
    clean,
    exposed,
    tradeoffs: Math.max(0, entries.length - clean - exposed),
  };
}
