export const COMMAND_POINT_MAX = 5;

export const DEFAULT_COMMAND_PLAN = Object.freeze({
  doctrine_id: 'evidence_control',
  contingency_id: 'cognitive_stabilizer',
});

export const COMMAND_DOCTRINES = Object.freeze([
  {
    id: 'evidence_control', icon: '🔎', color: '#00e5ff',
    name: '精准取证', nameEn: 'EVIDENCE CONTROL',
    desc: '首次建立有效线索连线时恢复 1 指挥点。',
    descEn: 'Recover 1 Command Point after the first valid evidence link.',
  },
  {
    id: 'rapid_pursuit', icon: '⚡', color: '#ffaa00',
    name: '快速追击', nameEn: 'RAPID PURSUIT',
    desc: '每起案件以 4 点指挥点开始。',
    descEn: 'Begin each case with 4 Command Points.',
  },
  {
    id: 'steady_control', icon: '🛡️', color: '#00ff88',
    name: '稳态控制', nameEn: 'STEADY CONTROL',
    desc: '紧急稳态的消耗由 2 点降低至 1 点。',
    descEn: 'Emergency Stabilize costs 1 Command Point instead of 2.',
  },
]);

export const COMMAND_CONTINGENCIES = Object.freeze([
  {
    id: 'cognitive_stabilizer', icon: '🧠', color: '#a78bfa',
    name: '认知稳压', nameEn: 'COGNITIVE STABILIZER',
    desc: '混乱首次达到 50 时自动降低 12。',
    descEn: 'Automatically reduce Confusion by 12 when it first reaches 50.',
  },
  {
    id: 'emergency_throttle', icon: '🔋', color: '#ffaa00',
    name: '紧急节流', nameEn: 'EMERGENCY THROTTLE',
    desc: 'AP 首次不高于 6 时，下一行动额外减少 2 AP 消耗。',
    descEn: 'When AP first falls to 6 or less, reduce the next action cost by 2.',
  },
  {
    id: 'evidence_lockdown', icon: '🔐', color: '#00e5ff',
    name: '证据封存', nameEn: 'EVIDENCE LOCKDOWN',
    desc: '首次证据销毁危机的期限延长一回合。',
    descEn: 'Extend the first evidence-purge deadline by one turn.',
  },
]);

const DOCTRINE_IDS = new Set(COMMAND_DOCTRINES.map(item => item.id));
const CONTINGENCY_IDS = new Set(COMMAND_CONTINGENCIES.map(item => item.id));

const ACTION_FOCUS = Object.freeze({
  search_area: ['observation_focus'],
  examine_clue: ['observation_focus'],
  analyze_forensics: ['observation_focus'],
  check_cctv: ['observation_focus'],
  hack_terminal: ['hack_level'],
  access_database: ['hack_level'],
  interrogate_suspect: ['logic_power', 'confusion_resistance'],
  check_alibi: ['logic_power', 'confusion_resistance'],
  present_evidence: ['logic_power', 'confusion_resistance'],
  talk_to_npc: ['logic_power', 'confusion_resistance'],
  tail_suspect: ['observation_focus', 'confusion_resistance'],
  bribe_informant: ['confusion_resistance', 'logic_power'],
});

const FORECAST_BY_ACTION = Object.freeze({
  search_area: [2, 4], examine_clue: [2, 3], analyze_forensics: [3, 4],
  check_cctv: [2, 4], hack_terminal: [3, 5], access_database: [3, 5],
  interrogate_suspect: [3, 5], check_alibi: [2, 4], present_evidence: [3, 5],
});

const RISK_FORECAST = Object.freeze({
  low: { confusion: [0, 6], trap: 8 },
  medium: { confusion: [4, 12], trap: 22 },
  high: { confusion: [8, 20], trap: 40 },
});

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeCommandPlan(value) {
  const plan = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    doctrine_id: DOCTRINE_IDS.has(plan.doctrine_id) ? plan.doctrine_id : DEFAULT_COMMAND_PLAN.doctrine_id,
    contingency_id: CONTINGENCY_IDS.has(plan.contingency_id) ? plan.contingency_id : DEFAULT_COMMAND_PLAN.contingency_id,
  };
}

export function createCommandState(planValue, primaryAgentId = 'AURORA-09') {
  const plan = normalizeCommandPlan(planValue);
  return {
    points: plan.doctrine_id === 'rapid_pursuit' ? 4 : 3,
    max_points: COMMAND_POINT_MAX,
    earned_milestones: [],
    active_agent_id: primaryAgentId || 'AURORA-09',
    emergency_stabilize_used: false,
    contingency_status: 'armed',
    contingency_event: null,
    spent_points: 0,
    doctrine_id: plan.doctrine_id,
    contingency_id: plan.contingency_id,
  };
}

export function commandCost(commandId, commandState) {
  if (commandId === 'joint_action' || commandId === 'tactical_preview') return 1;
  if (commandId === 'emergency_stabilize') return commandState?.doctrine_id === 'steady_control' ? 1 : 2;
  return 0;
}

export function spendCommandPoints(commandState, amount, eventId = '') {
  const cost = Math.max(0, Math.floor(finite(amount)));
  const state = commandState || createCommandState();
  if (state.points < cost) return { state, error: 'insufficient_command_points' };
  return {
    state: {
      ...state,
      points: state.points - cost,
      spent_points: Math.max(0, finite(state.spent_points)) + cost,
      last_event: eventId || state.last_event || null,
    },
    error: null,
  };
}

export function awardCommandMilestone(commandState, milestoneId, amount = 1) {
  const state = commandState || createCommandState();
  const earned = Array.isArray(state.earned_milestones) ? state.earned_milestones : [];
  if (!milestoneId || earned.includes(milestoneId)) return { state, awarded: 0 };
  const room = Math.max(0, finite(state.max_points, COMMAND_POINT_MAX) - finite(state.points));
  const awarded = Math.min(room, Math.max(0, Math.floor(finite(amount))));
  return {
    state: {
      ...state,
      points: finite(state.points) + awarded,
      earned_milestones: [...earned, milestoneId],
      last_event: milestoneId,
    },
    awarded,
  };
}

export function getActionFocus(actionTag) {
  return ACTION_FOCUS[actionTag] || ['logic_power'];
}

function agentScore(agent, actionTag) {
  const keys = getActionFocus(actionTag);
  return keys.reduce((sum, key, index) => sum + finite(agent?.[key]) * (index === 0 ? 0.72 : 0.28), 0);
}

export function agentExpertise(agent, actionTag) {
  const score = agentScore(agent, actionTag);
  return Math.max(0, Math.min(100, Math.round((score / 40) * 100)));
}

export function confidenceFromExpertise(expertise) {
  const value = Math.max(0, Math.min(100, finite(expertise)));
  if (value >= 75) return 'high';
  if (value >= 45) return 'medium';
  return 'low';
}

export function recommendExecutor(team, actionTag) {
  const agents = Array.isArray(team) ? team.filter(agent => agent?.agent_id) : [];
  if (!agents.length) return null;
  return [...agents].sort((a, b) => agentScore(b, actionTag) - agentScore(a, actionTag))[0].agent_id;
}

export function buildExecutingStrategy(strategy, actionTag, executorAgentId, assistAgentId = null, jointAction = false) {
  const team = Array.isArray(strategy?.team) ? strategy.team : [];
  const executor = team.find(agent => agent.agent_id === executorAgentId) || team[0];
  if (!executor) return strategy || {};
  const assistant = jointAction && assistAgentId && assistAgentId !== executor.agent_id
    ? team.find(agent => agent.agent_id === assistAgentId)
    : null;
  const combat = {
    logic_power: finite(executor.logic_power),
    observation_focus: finite(executor.observation_focus),
    hack_level: finite(executor.hack_level),
  };
  const focus = getActionFocus(actionTag);
  if (assistant) {
    focus.forEach(key => {
      if (Object.hasOwn(combat, key)) combat[key] = Math.max(combat[key], finite(assistant[key]));
    });
  }
  const confusionResistance = assistant && focus.includes('confusion_resistance')
    ? Math.max(finite(executor.confusion_resistance), finite(assistant.confusion_resistance))
    : finite(executor.confusion_resistance);
  const apDiscount = finite(executor.ap_cost_discount);
  return {
    ...(strategy || {}),
    executing_agent_id: executor.agent_id,
    assisting_agent_id: assistant?.agent_id || null,
    team: [executor, ...team.filter(agent => agent.agent_id !== executor.agent_id)],
    role: executor.role || strategy?.role,
    base_stance: executor.base_stance || strategy?.base_stance,
    combat_attributes: combat,
    engine_modifiers: {
      ...(strategy?.engine_modifiers || {}),
      confusion_resistance: Math.min(0.8, confusionResistance / 40),
      ap_cost_discount: Math.min(0.6, apDiscount / 30),
    },
    priority_list: executor.priority_list || strategy?.priority_list || [],
    command_effects: {
      ...(strategy?.command_effects || {}),
      ap_reduction: assistant ? 1 : 0,
      joint_action: Boolean(assistant),
    },
  };
}

export function decisionForecast(actionTag, riskLevel = 'medium') {
  const [apMin, apMax] = FORECAST_BY_ACTION[actionTag] || [2, 5];
  const risk = RISK_FORECAST[riskLevel] || RISK_FORECAST.medium;
  return { ap: [apMin, apMax], confusion: [...risk.confusion], trap: risk.trap };
}

export function applyEmergencyStabilize(gameState) {
  const commandState = gameState?.command_state || createCommandState();
  if (commandState.emergency_stabilize_used) return { gameState, error: 'command_already_used', cost: 0 };
  const cost = commandCost('emergency_stabilize', commandState);
  const spent = spendCommandPoints(commandState, cost, 'emergency_stabilize');
  if (spent.error) return { gameState, error: spent.error, cost };
  return {
    gameState: {
      ...gameState,
      confusion_score: Math.max(0, finite(gameState?.confusion_score) - 12),
      command_state: { ...spent.state, emergency_stabilize_used: true },
    },
    error: null,
    cost,
  };
}

export function applyDecisionCommandCost(gameState, commandIds = []) {
  const ids = [...new Set((Array.isArray(commandIds) ? commandIds : []).filter(Boolean))];
  const state = gameState?.command_state || createCommandState();
  const cost = ids.reduce((sum, id) => sum + commandCost(id, state), 0);
  const spent = spendCommandPoints(state, cost, ids.join('+'));
  if (spent.error) return { gameState, error: spent.error, cost };
  return { gameState: { ...gameState, command_state: spent.state }, error: null, cost };
}

export function applyCommandContingency(gameState) {
  const state = gameState?.command_state;
  if (!state || state.contingency_status !== 'armed') return { gameState, event: null };
  const triggered = state.contingency_id === 'cognitive_stabilizer'
    ? finite(gameState.confusion_score) >= 50
    : state.contingency_id === 'emergency_throttle'
      ? finite(gameState.action_points_left, 99) <= 6
      : state.contingency_id === 'evidence_lockdown'
        ? Boolean(gameState.evidence_crisis)
        : false;
  if (!triggered) return { gameState, event: null };
  const spent = spendCommandPoints(state, 1, `contingency:${state.contingency_id}`);
  if (spent.error) {
    return {
      gameState: { ...gameState, command_state: { ...state, contingency_status: 'missed', contingency_event: 'insufficient_command_points' } },
      event: { type: 'error', id: state.contingency_id, code: 'insufficient_command_points' },
    };
  }
  let next = { ...gameState, command_state: { ...spent.state, contingency_status: 'used', contingency_event: state.contingency_id } };
  if (state.contingency_id === 'cognitive_stabilizer') {
    next.confusion_score = Math.max(0, finite(next.confusion_score) - 12);
  } else if (state.contingency_id === 'emergency_throttle') {
    next.command_ap_credit = Math.max(0, finite(next.command_ap_credit)) + 2;
  } else if (state.contingency_id === 'evidence_lockdown' && next.evidence_crisis) {
    next.evidence_crisis = { ...next.evidence_crisis, deadline: finite(next.evidence_crisis.deadline) + 1 };
  }
  return { gameState: next, event: { type: 'success', id: state.contingency_id, code: 'contingency_triggered' } };
}
