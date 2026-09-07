import { createCommandState, buildExecutingStrategy, applyDecisionCommandCost,
  applyEmergencyStabilize, applyCommandContingency, awardCommandMilestone } from '../../src/game/commandSystem.js';
import { normalizeAgentStamina, applyStaminaToTeam, recoverAgentStaminaTurn,
  canAgentInvestigate, spendAgentStamina } from '../../src/game/agentStamina.js';
import { applyRecoveryTurn, buildLastActionContext, checkConflictClues } from '../../src/game/gameState.js';
import { acquireClues, destroyClues, getHiddenCluesDue, removeEvidenceLinks } from '../../src/game/clueState.js';
import { getInitialZone, getAvailableClueIds } from '../../src/game/caseRuntime.js';
import { settleRoundEvidence } from '../../src/game/roundCrisis.js';
import { calculateCaseXP, getRejectedReportPenalty, normalizeJudgeResult } from '../../src/game/caseEvaluation.js';
import { buildDecisionPacks, buildInterrogationPacks, buildReportOptions,
  resolveInterrogation, checkLink, judgeReport } from '../detectiveRules/rules.js';
import { PRIORITY_ACTIONS } from '../../src/game/teamConfig.js';
import { settleRunAction, runRoll } from './runSettlement.js';
import { createRunCrisis, nextRunCrisisTurn, resolveRunCrisis } from './runCrisis.js';

const COMMAND_FIELDS = Object.freeze({
  decision_options: [], round: ['option_id', 'assist_agent_id', 'command_ids'], rest: [],
  interrogation_options: ['npc_id'], question: ['npc_id', 'question_id', 'executor_agent_id'],
  link: ['clue_ids'], report_options: [],
  report: ['conclusion_id', 'method_id', 'motive_id', 'timeline_id', 'evidence_ids'],
  command: ['command_id'], recover: [], crisis: ['option_id'], abandon: [], priority: ['priority_list'],
});
const REQUIRED_FIELDS = Object.freeze({
  round: ['option_id'], interrogation_options: ['npc_id'], question: ['npc_id', 'question_id'],
  link: ['clue_ids'], report: ['conclusion_id', 'method_id', 'motive_id', 'timeline_id', 'evidence_ids'],
  command: ['command_id'], crisis: ['option_id'], priority: ['priority_list'],
});
const PUBLIC_STATE_FIELDS = Object.freeze([
  'run_id', 'case_id', 'case_title', 'current_hp', 'action_points_left', 'ap_discount_credit',
  'command_ap_credit', 'command_state', 'agent_stamina', 'unlocked_clues', 'destroyed_clue_ids',
  'current_zone', 'visited_zones', 'turn_count', 'react_state', 'confusion_score', 'vision_penalty',
  'action_ban_list', 'last_action', 'last_action_context', 'is_crashed', 'trap_shield_charges',
  'traps_triggered', 'evidence_crisis', 'reputation', 'linked_core_pairs',
]);

function fail(code = 'INVALID_COMMAND') {
  throw Object.assign(new Error(code), { code, status: 400 });
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}
function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/.test(value);
}
function ids(value, min, max) {
  return Array.isArray(value) && value.length >= min && value.length <= max
    && value.every(identifier) && new Set(value).size === value.length;
}
function timestamp(now) {
  const date = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(date.getTime())) fail('INVALID_TIME');
  return date.toISOString();
}
export function validateRunCommand(command) {
  if (!plain(command) || typeof command.type !== 'string' || !Object.hasOwn(COMMAND_FIELDS, command.type)) fail();
  const allowed = ['type', 'lang', ...COMMAND_FIELDS[command.type]];
  if (Object.keys(command).some(key => !allowed.includes(key))
    || (REQUIRED_FIELDS[command.type] || []).some(key => !Object.hasOwn(command, key))) fail();
  if (Object.hasOwn(command, 'lang') && !['en', 'zh'].includes(command.lang)) fail();
  for (const key of COMMAND_FIELDS[command.type]) {
    if (Object.hasOwn(command, key) && !key.endsWith('_ids') && key !== 'priority_list' && !identifier(command[key])) fail();
  }
  if (Object.hasOwn(command, 'command_ids') && (!ids(command.command_ids, 0, 2)
    || command.command_ids.some(id => !['joint_action', 'tactical_preview'].includes(id)))) fail();
  if (command.type === 'link' && !ids(command.clue_ids, 2, 2)) fail('INVALID_CLUES');
  if (command.type === 'report' && !ids(command.evidence_ids, 1, 4)) fail('INVALID_EVIDENCE');
  if (command.type === 'priority' && (!ids(command.priority_list, PRIORITY_ACTIONS.length, PRIORITY_ACTIONS.length)
    || command.priority_list.some(id => !PRIORITY_ACTIONS.some(action => action.id === id)))) fail('INVALID_PRIORITY');
}
function agentIds(run) { return run.team_config.team.map(agent => agent.agent_id); }
function runtimeTeam(run, round = false) {
  const stamina = round ? recoverAgentStaminaTurn(run.state.agent_stamina, agentIds(run)) : run.state.agent_stamina;
  return applyStaminaToTeam(run.team_config.team, stamina);
}
function rulePayload(run, lang, round = false) {
  const state = run.state;
  return {
    caseId: run.case_id, runId: run.id, zoneId: state.current_zone,
    turn: state.turn_count + (round ? 1 : 0), lang,
    unlockedClueIds: state.unlocked_clues, visitedZoneIds: state.visited_zones,
    recentActionTags: (state.chat_history || []).slice(-5).map(item => item.actionTag).filter(Boolean),
    confusion: state.confusion_score, actionPoints: state.action_points_left, actionBanList: state.action_ban_list,
    team: runtimeTeam(run, round).map(agent => ({
      agentId: agent.agent_id, logicPower: agent.base_logic_power,
      observationFocus: agent.base_observation_focus, hackLevel: agent.base_hack_level,
      confusionResistance: agent.base_confusion_resistance, stamina: agent.stamina,
      interrogationBonus: agent.skill_effects?.interrogation_bonus || agent.interrogation_bonus || 0,
    })),
  };
}
function requireNpc(run, npcId) {
  if (!run.case_data.npcs?.some(npc => npc.npc_id === npcId)) fail('UNKNOWN_NPC');
}
function clearOffers(run) {
  run.decision_options = null;
  run.interrogation_options = {};
}
function validClueIds(run, incoming) {
  const known = new Set(run.case_data.clue_dictionary.map(clue => clue.clue_id));
  return incoming.filter(id => known.has(id));
}
function acquire(run, incoming) {
  run.state = acquireClues(run.state, validClueIds(run, incoming));
}
function removeDestroyedLinks(run) {
  run.linked_pairs = removeEvidenceLinks(run.linked_pairs, run.state.destroyed_clue_ids);
  run.state.linked_core_pairs = run.linked_pairs.filter(pair => pair.valid).map(pair => pair.key);
}
function finish(run, status, now) {
  run.status = status;
  run.completed_at = timestamp(now);
  clearOffers(run);
}
function monitor(run) {
  run.state = applyCommandContingency(run.state).gameState;
  if (run.state.confusion_score >= 100 && !run.state.is_crashed) {
    run.bsod_count += 1;
    run.state.is_crashed = true;
    run.state.react_state = 'CRASHED';
  }
}
function completeTurn(run, lang, investigativeAction = false) {
  const result = settleRoundEvidence(run.state, { investigativeAction });
  run.state = result.state;
  removeDestroyedLinks(run);
  acquire(run, getHiddenCluesDue(run.case_data, run.state).map(clue => clue.clue_id));
  if (!run.pending_crisis && run.state.turn_count >= run.next_crisis_turn) {
    run.pending_crisis = createRunCrisis(run, lang);
    run.next_crisis_turn = nextRunCrisisTurn(run);
  }
  return { evidence_outcome: result.outcome, evidence: result.evidence || null };
}

export function createRun({ id, caseData, teamConfig, effects = {}, now }) {
  if (!identifier(id) || !caseData?.case_id || !Array.isArray(caseData.clue_dictionary)
    || !Array.isArray(teamConfig?.team) || teamConfig.team.length < 1 || teamConfig.team.length > 3
    || !ids(teamConfig.team.map(agent => agent.agent_id), 1, 3)) fail('INVALID_RUN');
  const initialZone = getInitialZone(caseData);
  const strategy = clone(teamConfig);
  strategy.skill_effects = { ...(strategy.skill_effects || {}) };
  for (const [key, value] of Object.entries(effects.skill_effects || {})) {
    strategy.skill_effects[key] = typeof value === 'number'
      ? (Number(strategy.skill_effects[key]) || 0) + value : value || strategy.skill_effects[key];
  }
  const initialApBonus = Math.max(0, Number(effects.initial_ap_bonus) || 0)
    + Math.max(0, Number(strategy.support_effects?.initial_ap_bonus) || 0);
  const run = {
    id, revision: 0, case_id: caseData.case_id, status: 'active',
    created_at: timestamp(now), updated_at: timestamp(now), completed_at: null,
    case_data: clone(caseData), team_config: strategy, effects: clone(effects),
    linked_pairs: [], attempted_link_keys: [], truth_fragments: 0, bsod_count: 0,
    judge_result: null, report_attempts: 0, recovery_count: 0,
    npc_emotions: {}, asked_question_ids: {}, decision_options: null, interrogation_options: {},
    pending_crisis: null,
    state: {
      run_id: id, case_id: caseData.case_id, case_title: caseData.title,
      current_hp: 100, action_points_left: 20 + initialApBonus,
      ap_discount_credit: 0, command_ap_credit: 0,
      command_state: createCommandState(teamConfig.command_plan, teamConfig.primary_agent_id),
      agent_stamina: normalizeAgentStamina(null, teamConfig.team.map(agent => agent.agent_id)),
      unlocked_clues: [], destroyed_clue_ids: [], linked_core_pairs: [],
      current_zone: initialZone, visited_zones: initialZone ? [initialZone] : [],
      turn_count: 0, react_state: 'IDLE', confusion_score: 0, vision_penalty: 0,
      action_ban_list: [], chat_history: [], thought_log: [], narrative_template_history: [],
      last_observation: '', last_action: null, last_action_context: null, is_crashed: false,
      trap_shield_charges: effects.ignore_first_trap ? 1 : 0, traps_triggered: 0,
      evidence_crisis: null, reputation: 100, checkpoint_stack: [],
    },
  };
  if (strategy.skill_effects.auto_unlock_first) {
    const first = caseData.zone_clue_map?.[initialZone]?.[0] || caseData.clue_dictionary[0]?.clue_id;
    if (first) acquire(run, [first]);
  }
  acquire(run, getHiddenCluesDue(caseData, run.state).map(clue => clue.clue_id));
  delete run.state.unlocked_clues_set;
  run.next_crisis_turn = nextRunCrisisTurn(run);
  return run;
}

export function publicRun(run) {
  const state = Object.fromEntries(PUBLIC_STATE_FIELDS.filter(key => Object.hasOwn(run.state, key))
    .map(key => [key, run.state[key]]));
  const revealed = new Set(run.state.unlocked_clues);
  state.revealed_clues = run.case_data.clue_dictionary.filter(clue => revealed.has(clue.clue_id)).map(clue => {
    const english = run.case_data.en?.clue_dictionary?.find(item => item.clue_id === clue.clue_id) || clue;
    return {
      clue_id: clue.clue_id, keyword: clue.keyword, description: clue.description,
      visual_icon: clue.visual_icon,
      en: { keyword: english.keyword, description: english.description },
    };
  });
  state.checkpoint_count = run.state.checkpoint_stack.length;
  return clone({
    id: run.id, revision: run.revision, case_id: run.case_id, status: run.status,
    created_at: run.created_at, updated_at: run.updated_at, completed_at: run.completed_at,
    state, team_config: run.team_config, agent_strategy: run.team_config,
    linked_pairs: run.linked_pairs, bsod_count: run.bsod_count,
    truth_fragments: run.truth_fragments, judge_result: run.judge_result,
    pending_crisis: run.pending_crisis, npc_emotions: run.npc_emotions,
    asked_question_ids: run.asked_question_ids, decision_options: run.decision_options,
    interrogation_options: run.interrogation_options,
  });
}

function round(run, command, lang) {
  if (run.state.action_points_left <= 0) fail('INSUFFICIENT_AP');
  const generated = buildDecisionPacks(rulePayload(run, lang, true));
  let executorId;
  let card;
  for (const [id, pack] of Object.entries(generated.packs)) {
    const found = pack.cards.find(item => item.optionId === command.option_id);
    if (found && run.decision_options?.packs?.[id]?.cards.some(item => item.optionId === command.option_id)) {
      executorId = id; card = found; break;
    }
  }
  if (!card) fail('STALE_OPTIONS');
  const team = runtimeTeam(run, true);
  const executor = team.find(agent => agent.agent_id === executorId);
  const assistant = team.find(agent => agent.agent_id === command.assist_agent_id);
  const commandIds = command.command_ids || [];
  if (!canAgentInvestigate(executor.stamina)) fail('INSUFFICIENT_AGENT_STAMINA');
  if (Boolean(command.assist_agent_id) !== commandIds.includes('joint_action')
    || (command.assist_agent_id && (!assistant || assistant === executor))) fail('INVALID_ASSISTANT');
  if (assistant && !canAgentInvestigate(assistant.stamina)) fail('INSUFFICIENT_AGENT_STAMINA');
  const charged = applyDecisionCommandCost(run.state, commandIds);
  if (charged.error) fail(charged.error.toUpperCase());
  const previous = run.state;
  const strategy = buildExecutingStrategy({ ...run.team_config, team }, card.actionTag, executorId,
    command.assist_agent_id, commandIds.includes('joint_action'));
  const settled = settleRunAction(previous, run.case_data, strategy, card, lang);
  run.state = { ...settled.newState, last_action: card.actionTag, lastAction: card.actionTag,
    command_state: { ...charged.gameState.command_state, active_agent_id: executorId } };
  const branchSeed = `${run.id}:${run.state.turn_count}:${executorId}:${card.actionTag}`;
  if (card.risk_level === 'high' && runRoll(branchSeed, 'hidden-branch') < 35) {
    const locked = run.case_data.clue_dictionary.map(clue => clue.clue_id).filter(id =>
      !run.state.unlocked_clues.includes(id) && !run.state.destroyed_clue_ids.includes(id));
    if (locked.length) acquire(run, [locked[runRoll(`${run.id}:${run.state.turn_count}:${card.actionTag}`, 'hidden-clue', locked.length)]]);
  }
  if (checkConflictClues(run.state.unlocked_clues, run.case_data.conflict_dictionary)) {
    run.state.confusion_score = Math.min(100, run.state.confusion_score + 15);
  }
  const actualTrapTriggered = run.state.traps_triggered > previous.traps_triggered;
  run.state.last_action_context = buildLastActionContext(previous, run.state, settled.settlement, run.case_data, {
    actionTag: card.actionTag, executorAgentId: executorId, assistAgentId: command.assist_agent_id,
    actualTrapTriggered,
  });
  if (run.state.current_zone !== previous.current_zone && run.case_data.checkpoints?.includes(run.state.current_zone)) {
    run.state.command_state = awardCommandMilestone(run.state.command_state, `checkpoint:${run.state.current_zone}`).state;
    const snapshot = clone({ ...run.state, checkpoint_stack: [], unlocked_clues_set: undefined });
    run.state.checkpoint_stack = [...run.state.checkpoint_stack, snapshot].slice(-3);
  }
  run.state.chat_history = [...previous.chat_history,
    { actionTag: card.actionTag }, { actionTag: card.actionTag }].slice(-12);
  clearOffers(run);
  const evidence = completeTurn(run, lang, true);
  return { action_tag: card.actionTag, executor_agent_id: executorId,
    assist_agent_id: strategy.assisting_agent_id, narration: settled.settlement.action_narration,
    is_trap: actualTrapTriggered, settlement: settled.settlement,
    confusion_delta: run.state.confusion_score - previous.confusion_score,
    new_clue_ids: run.state.unlocked_clues.filter(id => !previous.unlocked_clues.includes(id)), ...evidence };
}

function question(run, command, lang) {
  requireNpc(run, command.npc_id);
  const payload = { ...rulePayload(run, lang), npcId: command.npc_id,
    emotionLevel: run.npc_emotions[command.npc_id]?.level || 'calm',
    askedQuestionIds: run.asked_question_ids[command.npc_id] || [] };
  const current = buildInterrogationPacks(payload);
  const offered = run.interrogation_options[command.npc_id];
  const possible = runtimeTeam(run).filter(agent => canAgentInvestigate(agent.stamina)
    && current.packs[agent.agent_id]?.questions.some(item => item.questionId === command.question_id)
    && offered?.packs?.[agent.agent_id]?.questions.some(item => item.questionId === command.question_id));
  const executor = command.executor_agent_id ? possible.find(agent => agent.agent_id === command.executor_agent_id)
    : possible.find(agent => agent.agent_id === run.state.command_state.active_agent_id) || possible[0];
  if (!executor) fail('STALE_OPTIONS');
  const result = resolveInterrogation({ ...payload, executorAgentId: executor.agent_id, questionId: command.question_id });
  const spent = spendAgentStamina(run.state.agent_stamina, executor.agent_id, agentIds(run));
  if (!spent.spent) fail('INSUFFICIENT_AGENT_STAMINA');
  run.state.agent_stamina = spent.stamina;
  const old = run.npc_emotions[command.npc_id] || {};
  run.npc_emotions[command.npc_id] = {
    ...old, level: result.nextEmotion, history_count: (old.history_count || 0) + 1,
    cooperation: (old.cooperation || 0) + result.cooperationChange,
  };
  run.asked_question_ids[command.npc_id] = [...new Set([...payload.askedQuestionIds, command.question_id])];
  run.state.confusion_score = Math.min(100, run.state.confusion_score + (result.consequence?.confusionIncrease || 0));
  const before = run.state.unlocked_clues;
  acquire(run, result.revealedClueIds || []);
  clearOffers(run);
  run.interrogation_options[command.npc_id] = buildInterrogationPacks({
    ...rulePayload(run, lang), npcId: command.npc_id, emotionLevel: result.nextEmotion,
    askedQuestionIds: run.asked_question_ids[command.npc_id],
  });
  return { ...result, executor_agent_id: executor.agent_id,
    revealedClueIds: run.state.unlocked_clues.filter(id => !before.includes(id)),
    packs: run.interrogation_options[command.npc_id].packs };
}

function link(run, command, lang) {
  const [a, b] = [...command.clue_ids].sort();
  if (!run.state.unlocked_clues.includes(a) || !run.state.unlocked_clues.includes(b)) fail('INVALID_CLUES');
  const key = `${a}:${b}`;
  if (run.attempted_link_keys.includes(key)) fail('LINK_ALREADY_ATTEMPTED');
  const result = checkLink({ caseId: run.case_id, clueAId: a, clueBId: b, lang,
    synergyActive: run.team_config.synergy_skills?.includes('cross_validation'), fragmentsFound: run.truth_fragments });
  run.attempted_link_keys.push(key);
  run.linked_pairs.push({ a, b, key, valid: result.is_valid });
  let bonus = null;
  if (result.is_valid) {
    run.truth_fragments += 1;
    if (run.state.command_state.doctrine_id === 'evidence_control') {
      run.state.command_state = awardCommandMilestone(run.state.command_state, 'doctrine:first-valid-link').state;
    }
    const locked = getAvailableClueIds(run.case_data, run.state.current_zone, run.state.unlocked_clues,
      run.state.turn_count, run.state.destroyed_clue_ids);
    bonus = locked.length ? locked[runRoll(`${run.id}:${key}`, 'link-bonus', locked.length)] : null;
    if (bonus) acquire(run, [bonus]);
  } else {
    run.state.confusion_score = Math.min(100, run.state.confusion_score + 8);
    const seed = `${run.id}:${key}`;
    if (runRoll(seed, 'counterstrike') < 50 && run.state.unlocked_clues.length) {
      const lost = run.state.unlocked_clues[runRoll(seed, 'counterstrike-clue', run.state.unlocked_clues.length)];
      run.state = destroyClues(run.state, [lost]);
    } else if (run.case_data.npcs?.length) {
      const npc = run.case_data.npcs[runRoll(seed, 'counterstrike-npc', run.case_data.npcs.length)];
      const topicClue = run.case_data.clue_dictionary.find(clue => clue.clue_id === run.state.unlocked_clues[0]);
      run.npc_emotions[npc.npc_id] = { ...(run.npc_emotions[npc.npc_id] || {}), level: 'calm',
        refuses_topic: topicClue?.keyword || (lang === 'zh' ? '案发当晚的行踪' : 'their whereabouts that night') };
    }
  }
  removeDestroyedLinks(run);
  clearOffers(run);
  return { ...result, new_clue_ids: bonus ? [bonus] : [] };
}

function report(run, command, lang, now) {
  if (command.evidence_ids.some(id => !run.state.unlocked_clues.includes(id))) fail('INVALID_EVIDENCE');
  const result = normalizeJudgeResult(judgeReport({
    ...rulePayload(run, lang), conclusionId: command.conclusion_id, methodId: command.method_id,
    motiveId: command.motive_id, timelineId: command.timeline_id, evidenceIds: command.evidence_ids,
  }));
  run.judge_result = result;
  run.report_attempts += 1;
  clearOffers(run);
  if (result.is_passed) {
    run.final_report = { conclusion_id: command.conclusion_id, method_id: command.method_id,
      motive_id: command.motive_id, timeline_id: command.timeline_id, evidence_ids: [...command.evidence_ids] };
    finish(run, 'completed', now);
  } else {
    const penalty = getRejectedReportPenalty(run.state);
    run.state.action_points_left = Math.max(0, run.state.action_points_left - penalty.apLoss);
    run.state.reputation = Math.max(0, run.state.reputation - penalty.reputationLoss);
    run.state.confusion_score = Math.min(100, run.state.confusion_score + penalty.confusionIncrease);
    if (run.state.action_points_left <= 0) finish(run, 'failed', now);
    return { ...result, penalty };
  }
  return result;
}

export function applyRunCommand(input, command, now) {
  validateRunCommand(command);
  timestamp(now);
  if (input.status !== 'active') fail(input.status === 'settled' ? 'RUN_SETTLED' : 'RUN_NOT_ACTIVE');
  if (input.pending_crisis && !['crisis', 'recover', 'abandon'].includes(command.type)) fail('CRISIS_PENDING');
  if (input.state.is_crashed && !['recover', 'abandon'].includes(command.type)) fail('RUN_CRASHED');
  const run = clone(input);
  const lang = command.lang || 'zh';
  let result;
  try {
    switch (command.type) {
      case 'priority':
        run.team_config.priority_list = [...command.priority_list];
        run.team_config.team = run.team_config.team.map(agent => agent.agent_id === run.team_config.primary_agent_id
          ? { ...agent, priority_list: [...command.priority_list] } : agent);
        clearOffers(run);
        result = { priority_list: [...command.priority_list] };
        break;
      case 'decision_options':
        if (run.state.action_points_left <= 0) fail('INSUFFICIENT_AP');
        result = buildDecisionPacks(rulePayload(run, lang, true));
        run.decision_options = result;
        break;
      case 'round': result = round(run, command, lang); break;
      case 'rest':
        if (run.state.action_points_left <= 0) fail('INSUFFICIENT_AP');
        run.state = applyRecoveryTurn(run.state, agentIds(run));
        run.state.chat_history = [...run.state.chat_history, { actionTag: 'recover_team' }].slice(-12);
        clearOffers(run);
        result = { rested: true, ...completeTurn(run, lang) };
        break;
      case 'interrogation_options': {
        requireNpc(run, command.npc_id);
        result = buildInterrogationPacks({ ...rulePayload(run, lang), npcId: command.npc_id,
          emotionLevel: run.npc_emotions[command.npc_id]?.level || 'calm',
          askedQuestionIds: run.asked_question_ids[command.npc_id] || [] });
        run.interrogation_options[command.npc_id] = result;
        break;
      }
      case 'question': result = question(run, command, lang); break;
      case 'link': result = link(run, command, lang); break;
      case 'report_options': result = buildReportOptions(rulePayload(run, lang)); break;
      case 'report': result = report(run, command, lang, now); break;
      case 'command': {
        if (command.command_id !== 'emergency_stabilize') fail('INVALID_COMMAND');
        const stabilized = applyEmergencyStabilize(run.state);
        if (stabilized.error) fail(stabilized.error.toUpperCase());
        run.state = stabilized.gameState;
        clearOffers(run);
        result = { command_id: command.command_id, cost: stabilized.cost };
        break;
      }
      case 'recover':
        if (!run.state.is_crashed) fail('RUN_NOT_CRASHED');
        run.state.confusion_score = 0;
        run.state.is_crashed = false;
        run.state.react_state = 'IDLE';
        run.state.action_points_left = Math.max(0, run.state.action_points_left - (run.team_config.skill_effects?.bsod_immunity ? 0 : 5));
        run.recovery_count += 1;
        clearOffers(run);
        result = { recovered: true };
        break;
      case 'crisis': {
        if (!run.pending_crisis) fail('NO_PENDING_CRISIS');
        const resolution = resolveRunCrisis(run, command.option_id, lang);
        if (resolution.error) fail(resolution.error.toUpperCase());
        const changes = resolution.changes;
        run.state.confusion_score = Math.max(0, Math.min(100, run.state.confusion_score + (changes.confusion_delta || 0)));
        run.state.action_points_left = Math.max(0, run.state.action_points_left + (changes.ap_delta || 0));
        run.state.reputation = Math.max(0, run.state.reputation + (changes.reputation_delta || 0));
        if (changes.defer_evidence) run.state.evidence_crisis = changes.defer_evidence;
        run.pending_crisis = null;
        clearOffers(run);
        result = resolution;
        break;
      }
      case 'abandon':
        run.judge_result = normalizeJudgeResult({ score: 'D', critique: lang === 'en' ? 'Investigation abandoned.' : '调查已放弃。' });
        finish(run, 'abandoned', now);
        result = { abandoned: true };
        break;
      default: fail();
    }
  } catch (error) {
    if (error?.code && !error.status) error.status = 400;
    throw error;
  }
  if (run.status === 'active') monitor(run);
  run.revision += 1;
  run.updated_at = timestamp(now);
  // Strip transient Set helpers before persistence; the reducer always rebuilds them.
  delete run.state.unlocked_clues_set;
  return { run: clone(run), result: clone(result) };
}

export function deriveRunSummary(run) {
  if (!['completed', 'failed', 'abandoned', 'settled'].includes(run.status) || !run.completed_at) fail('RUN_NOT_COMPLETE');
  const state = run.state;
  const clues = validClueIds(run, [...new Set(state.unlocked_clues)]).filter(id => !state.destroyed_clue_ids.includes(id));
  let judge = normalizeJudgeResult({ score: 'D' });
  if (run.status === 'completed' || (run.status === 'settled' && run.final_report)) {
    if (!run.final_report) fail('RUN_NOT_COMPLETE');
    const selection = run.final_report;
    validateRunCommand({ type: 'report', ...selection });
    if (selection.evidence_ids.some(id => !clues.includes(id))) fail('INVALID_EVIDENCE');
    judge = normalizeJudgeResult(judgeReport({ ...rulePayload(run, 'en'), unlockedClueIds: clues,
      conclusionId: selection.conclusion_id, methodId: selection.method_id,
      motiveId: selection.motive_id, timelineId: selection.timeline_id, evidenceIds: selection.evidence_ids }));
    if (!judge.is_passed) fail('RUN_NOT_COMPLETE');
  }
  const validLinks = run.linked_pairs.filter(pair => pair.valid && clues.includes(pair.a) && clues.includes(pair.b));
  const xp = calculateCaseXP(judge, { ...state, unlocked_clues: clues }, run.case_data, true);
  return clone({
    run_id: run.id, case_id: run.case_id, difficulty: run.case_data.difficulty,
    score: judge.score, is_passed: judge.is_passed, is_failed: !judge.is_passed,
    clues, valid_links: validLinks.map(pair => [pair.a, pair.b]), valid_link_count: validLinks.length,
    invalid_link_count: run.attempted_link_keys.length - run.truth_fragments,
    turns: state.turn_count, ap_left: state.action_points_left, confusion: state.confusion_score,
    bsod_count: run.bsod_count, traps_triggered: state.traps_triggered,
    clue_ratio: clues.length / Math.max(1, run.case_data.clue_dictionary.length),
    all_hidden_clues: (run.case_data.hidden_clues || []).every(clue => clues.includes(clue.clue_id)),
    xp_gain: xp.total, xp_breakdown: xp,
  });
}
