import { getInvestigationContent } from './content.js';
import { getConnectedZones } from '../../src/game/caseRuntime.js';
import { acquireClues } from '../../src/game/clueState.js';
import { recoverAgentStaminaTurn, spendAgentStamina,
  AGENT_STAMINA_INVESTIGATION_COST } from '../../src/game/agentStamina.js';
import { getRejectedReportPenalty, normalizeJudgeResult } from '../../src/game/caseEvaluation.js';
import { applyEmergencyStabilize, awardCommandMilestone } from '../../src/game/commandSystem.js';
import { PRIORITY_ACTIONS } from '../../src/game/teamConfig.js';
import { INVESTIGATION_PREPARATION_REVISION, getInvestigationAbilityPercent,
  getInvestigationAgentPreparation } from '../../src/game/investigationPreparation.js';
import { createRunCrisis, nextRunCrisisTurn, resolveRunCrisis } from '../gameAuthority/runCrisis.js';
import { runRoll } from '../gameAuthority/runSettlement.js';
import { INVESTIGATION_BALANCE_REVISION, INVESTIGATION_COST_RULES, investigationBalanceRevision,
  investigationReportPolicy } from './balance.js';
import { INVESTIGATION_RAW_MATERIALS_REVISION } from './rawMaterials.js';
import { CASE_DESIGN_REVISION, publicInvestigationStory } from './caseDesign.js';
import { getInterviewStrategyContent } from './interviewContent.js';
import { REPORT_EXPLANATION_REVISION, publicReportEvidenceRoles, explainSubmittedReport } from './reportExplanation.js';
import { INVESTIGATION_SKILLS_REVISION, quoteInvestigationSkills, consumeInvestigationSkills, professionalObservationThreshold,
  applyInvestigationSkillSuccess, mitigateInvestigationSkillConfusion, publicInvestigationSkills,
  sourceHintInvestigationSkill } from './skills.js';

const DIMENSIONS = ['opportunity', 'method', 'motive', 'timeline'];
const INTERVIEW_REVISION = 1;
const DIMENSION_GUIDANCE = {
  opportunity: { zh: '机会：证明责任人在相关窗口能够到达现场或控制设备；姓名或权限标签不能替代实际在场或控制证据。',
    en: 'Opportunity: establish access to the scene or control of equipment during the relevant window. A name or permission label does not replace evidence of actual presence or control.' },
  method: { zh: '手段：证明伤害如何造成以及操作如何执行，完整连接物件、异常和伤害；只说明设备可疑还不够。',
    en: 'Method: establish how the harm occurred and how the operation was carried out, connecting the object, anomaly and injury. Suspicious equipment alone is insufficient.' },
  motive: { zh: '动机：用记录说明与行为直接相关的利害冲突、损失或收益；泛泛的嫌疑不能替代具体联系。',
    en: 'Motive: use records to establish a directly relevant conflict, loss or benefit. General suspicion does not replace a concrete connection.' },
  timeline: { zh: '时间线：核对原始时钟，区分准备、执行、发现及事后活动，说明明确的先后或重叠；循环画面和回收时间不能直接当作执行时间。',
    en: 'Timeline: check original clocks and distinguish preparation, execution, discovery and later activity. Establish ordering or overlap; looped footage and recovery times are not execution times.' },
};
function fail(code) { throw Object.assign(new Error(code), { code, status: 400 }); }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function text(value, lang) { return value?.[lang] || value?.zh || value || ''; }
function known(run, list = []) { return list.every(id => run.state.unlocked_clues.includes(id)); }
function content(run) {
  const value = getInvestigationContent(run.case_id, run.investigation?.case_design_revision || 0);
  if (!value) fail('UNKNOWN_CASE');
  return value;
}
function agentIds(run) { return run.team_config.team.map(agent => agent.agent_id); }
function preparedInvestigation(run) {
  return run.investigation.preparation_revision === INVESTIGATION_PREPARATION_REVISION;
}
function usesRawMaterials(run) {
  return run.investigation.raw_materials_revision === INVESTIGATION_RAW_MATERIALS_REVISION;
}
function usesInterviewStrategies(run) {
  return run.investigation_version === 2 && run.investigation?.interview_revision === INTERVIEW_REVISION
    && run.investigation.case_design_revision === CASE_DESIGN_REVISION;
}
function interviewRecord(run, npcId, stage, kind) {
  return run.investigation.interview_records?.[npcId]?.find(item => item.stage === stage && item.kind === kind);
}
function publicWorkbench(run, puzzle) {
  return usesRawMaterials(run) && known(run, puzzle.required_clues) && puzzle.workbench
    ? copy({ revision: INVESTIGATION_RAW_MATERIALS_REVISION, ...puzzle.workbench }) : null;
}
function puzzleItemLabel(run, puzzle, item) {
  return usesRawMaterials(run) ? puzzle.workbench?.records?.[item.id]?.label || item.label : item.label;
}
function confirmedPuzzleSelection(run, puzzle) {
  return usesRawMaterials(run) && run.investigation.puzzle_completed
    ? { confirmed_answer_ids: [...puzzle.answer] } : {};
}
function actionQuote(run, baseCost = 1) {
  const commandCredit = preparedInvestigation(run) ? Math.max(0, Math.floor(Number(run.state.command_ap_credit) || 0)) : 0;
  const used = Math.min(baseCost, commandCredit);
  return { ap_cost: baseCost - used, command_ap_credit_used: used };
}
function puzzleQuote(run) {
  if (run.investigation.puzzle_completed) return { ap_cost: 0, stamina_cost: 0, executor_agent_id: null };
  if (preparedInvestigation(run) && run.puzzle_offer_revision === run.revision && run.puzzle_offer_quote) {
    return run.puzzle_offer_quote;
  }
  const base = actionQuote(run);
  const quote = quoteInvestigationSkills(run, { kind: 'puzzle', apCost: base.ap_cost,
    staminaCost: AGENT_STAMINA_INVESTIGATION_COST });
  return { ...base, ...quote,
    executor_agent_id: agentIds(run).find(id => canPerformInvestigation(run, id, quote.stamina_cost)) || null };
}
function zoneLabel(run, zoneId) {
  const zh = run.case_data.scene.zones[zoneId]?.label || zoneId;
  return { zh, en: run.case_data.en?.scene?.zones?.[zoneId]?.label || zh };
}
function ordered(run, items, group) {
  return [...items].sort((a, b) => runRoll(`${run.id}:${group}`, a.id, 0x7fffffff)
    - runRoll(`${run.id}:${group}`, b.id, 0x7fffffff) || a.id.localeCompare(b.id));
}
function clearOffers(run) {
  run.inspect_options = null;
  run.interrogation_options = {};
  run.puzzle_offer_revision = null;
  run.puzzle_offer_quote = null;
  run.decision_options = null;
}
function allTargets(run, spec = content(run)) {
  const targets = [...spec.targets];
  if (spec.hidden && !targets.some(target => target.target_id === spec.hidden.target_id)) {
    const hiddenClue = spec.hidden.clue_id;
    const zone = Object.entries(run.case_data.zone_clue_map || {}).find(([, ids]) => ids.includes(hiddenClue))?.[0]
      || run.case_data.initial_zone;
    targets.push({ ...spec.hidden, zone_id: spec.hidden.zone_id || zone, kind: 'terminal', hidden: true,
      method_id: spec.hidden.method_id || 'verify_source', action_tag: 'access_database',
      methods: spec.hidden.methods || [{ id: 'verify_source', label: { zh: '核验独立来源', en: 'Verify independent source' } }],
    });
  }
  return targets;
}
function targetVisible(run, target) {
  if (!target.hidden) return true;
  return run.state.turn_count >= (target.unlock_turn || content(run).hidden?.unlock_turn || 1)
    && known(run, target.required_clues || content(run).hidden?.required_clues);
}
function completed(run, targetId) {
  return run.investigation.completed_checks.find(check => check.target_id === targetId);
}
function requireTarget(run, targetId) {
  const target = allTargets(run).find(item => item.target_id === targetId);
  if (!target || !targetVisible(run, target)) fail('TARGET_LOCKED');
  if (run.state.current_zone !== target.zone_id) fail('WRONG_ZONE');
  if (!known(run, target.required_clues)) fail('TARGET_LOCKED');
  return target;
}
function entryAvailable(run, zoneId) {
  if (run.state.visited_zones.includes(zoneId)) return true;
  const requirement = run.case_data.scene?.zones?.[zoneId]?.entry_requirement;
  if (!requirement || requirement === 'search_area') return true;
  const checked = new Set(run.investigation.completed_checks.map(item => item.target_id));
  return allTargets(run).some(target => checked.has(target.target_id) && target.action_tag === requirement);
}
function reachableZones(run) {
  const reachable = new Set([run.state.current_zone]);
  const queue = [run.state.current_zone];
  while (queue.length) {
    for (const next of getConnectedZones(run.case_data, queue.shift())) {
      if (!reachable.has(next) && entryAvailable(run, next)) {
        reachable.add(next);
        queue.push(next);
      }
    }
  }
  return reachable;
}
function canPerformInvestigation(run, executorId, staminaCost = AGENT_STAMINA_INVESTIGATION_COST) {
  return recoverAgentStaminaTurn(run.state.agent_stamina, agentIds(run))[executorId] >= staminaCost;
}
function chargeTurn(run, executorId, apCost = 1, commandCreditUsed = 0, staminaCost = AGENT_STAMINA_INVESTIGATION_COST) {
  if (run.state.action_points_left < apCost) fail('INSUFFICIENT_AP');
  if (commandCreditUsed > (run.state.command_ap_credit || 0)) fail('STALE_OPTIONS');
  const recovered = recoverAgentStaminaTurn(run.state.agent_stamina, agentIds(run));
  const spent = staminaCost === AGENT_STAMINA_INVESTIGATION_COST
    ? spendAgentStamina(recovered, executorId, agentIds(run))
    : { spent: Object.hasOwn(recovered, executorId) && recovered[executorId] >= staminaCost,
      stamina: { ...recovered, [executorId]: recovered[executorId] - staminaCost } };
  if (!spent.spent) fail('INSUFFICIENT_AGENT_STAMINA');
  run.state.agent_stamina = spent.stamina;
  run.state.action_points_left -= apCost;
  if (preparedInvestigation(run) && commandCreditUsed > 0) run.state.command_ap_credit -= commandCreditUsed;
  run.state.turn_count += 1;
  run.state.command_state.active_agent_id = executorId;
}
function describeCrisis(run, event, lang) {
  const zh = lang === 'zh';
  let scale = 1;
  if (run.team_config.specialty_match >= 0.66) scale *= 0.8;
  if (run.team_config.synergy_skills?.includes('ghost_protocol')) scale *= 0.8;
  const penalty = value => mitigateInvestigationSkillConfusion(run, Math.round(value * scale),
    { kind: 'crisis', consume: false }).confusion_increase;
  const copy = (chinese, english) => zh ? chinese : english;
  let descriptions;
  if (event.type === 'evidence') {
    const secureCost = event.choices.find(choice => choice.id === 'secure_now').ap_cost;
    const clueId = event.payload.clue_id;
    const earned = run.state.unlocked_clues.includes(clueId);
    const clue = (lang === 'en' ? run.case_data.en : run.case_data)?.clue_dictionary?.find(item => item.clue_id === clueId);
    event.payload.keyword = earned && clue?.keyword ? clue.keyword : copy('已核验记录', 'Verified record');
    event.desc = copy(`「${event.payload.keyword}」的来源校验受到干扰，原始证据仍然保留。选择现在保全，或承担延误的信誉风险。`,
      `Source verification for “${event.payload.keyword}” is being disrupted; the original remains retained. Secure it now or accept a credibility risk from delay.`);
    descriptions = {
      secure_now: [copy('稳健', 'STEADY'), '#00ff88', copy(`消耗 ${secureCost} AP 立即保全，解除来源校验威胁。`, `Spend ${secureCost} AP to secure the record immediately and clear the verification threat.`)],
      defer: [copy('有风险', 'RISKY'), '#ffaa00', copy('消耗 0 AP，保留原件；超过后续 2 回合期限时，信誉 -5、混乱 +5。免费复查不会取消延期后果。', 'Costs 0 AP and retains the original. Beyond the next two-turn deadline, reputation falls by 5 and confusion rises by 5. Free review does not cancel the deferral consequence.')],
    };
  } else if (event.type === 'npc_recant') {
    const asked = Boolean(run.asked_question_ids[event.payload.npc_id]?.length);
    if (!asked) event.title = copy('公开陈述待核验', 'PUBLIC ACCOUNT NEEDS CHECK');
    event.desc = asked
      ? copy(`${event.payload.npc_name} 要求重新核对先前陈述。已保存的笔录和证据仍可复查，请判断如何回应。`,
        `${event.payload.npc_name} requests another check of an earlier account. Saved statements and evidence remain available; decide how to respond.`)
      : copy(`${event.payload.npc_name} 的公开陈述需再确认，你还没有正式询问此人。可前往其所在区域核对，或暂时搁置。`,
        `${event.payload.npc_name}'s public account needs confirmation; you have not formally questioned this person. Visit their area to check it, or set it aside.`);
    descriptions = {
      reinterrogate: [copy('稳健', 'STEADY'), '#00ff88', copy(`消耗 0 AP，混乱 +${penalty(5)}；重新核对该人物陈述，保留已记录的证据。`,
        `Costs 0 AP; confusion rises by ${penalty(5)}. Recheck this person's account while retaining recorded evidence.`)],
      ignore: [copy('有风险', 'RISKY'), '#ffaa00', copy(`消耗 0 AP，混乱 +${penalty(10)}、信誉 -5；继续其他调查。`,
        `Costs 0 AP; confusion rises by ${penalty(10)} and reputation falls by 5. Continue other investigation.`)],
    };
  } else {
    const evadeCost = event.choices.find(choice => choice.id === 'evade').ap_cost;
    event.desc = copy('敌对进程追踪调查信号，干扰你的判断。选择切换信道、反制，或静默躲避。',
      'A hostile process is tracing the investigation signal and disrupting your judgment. Switch channels, counter it, or hide.');
    descriptions = {
      evade: [copy('稳健', 'STEADY'), '#00ff88', copy(`消耗 ${evadeCost} AP 切换信道，不增加混乱或信誉损失。`, `Spend ${evadeCost} AP to switch channels without added confusion or reputation loss.`)],
      confront: [copy('高风险', 'HIGH RISK'), '#ff3860', copy(`消耗 0 AP；50% 概率混乱 -10，失败则混乱 +${penalty(15)}、信誉 -10。`,
        `Costs 0 AP. A 50% counter chance reduces confusion by 10; failure adds ${penalty(15)} confusion and costs 10 reputation.`)],
      hide: [copy('有风险', 'RISKY'), '#ffaa00', copy(`消耗 0 AP，混乱 +${penalty(8)}；静默躲避追踪。`,
        `Costs 0 AP; confusion rises by ${penalty(8)}. Hide silently from the trace.`)],
    };
  }
  event.choices = event.choices.map(choice => ({ ...choice, risk: descriptions[choice.id][0],
    riskColor: descriptions[choice.id][1], desc: descriptions[choice.id][2] }));
  return event;
}
function completeTurn(run, lang) {
  // Originals are preserved. A delayed evidence attack damages credibility, not the only route to the answer.
  if (run.state.evidence_crisis && run.state.turn_count > run.state.evidence_crisis.deadline) {
    run.state.reputation = Math.max(0, run.state.reputation - 5);
    run.state.confusion_score = Math.min(100, run.state.confusion_score + 5);
    run.state.evidence_crisis = null;
  }
  if (!run.pending_crisis && run.state.turn_count >= run.next_crisis_turn) {
    run.pending_crisis = describeCrisis(run, createRunCrisis(run, lang), lang);
    run.next_crisis_turn = nextRunCrisisTurn(run);
  }
}
function finish(run, status, now) {
  run.status = status;
  run.completed_at = new Date(now).toISOString();
  clearOffers(run);
}

export function initializeInvestigation(run) {
  run.investigation = { case_design_revision: CASE_DESIGN_REVISION };
  const spec = content(run);
  // Content corrections belong to this paid version, never to a persisted legacy investigation.
  for (const clue of run.case_data.clue_dictionary) {
    const override = spec.clue_overrides?.[clue.clue_id]
      || (clue.clue_id === spec.hidden?.clue_id ? { label: spec.hidden.label, description: spec.hidden.result } : null);
    if (override) {
      if (override.keyword || override.label) clue.keyword = text(override.keyword || override.label, 'zh');
      if (override.description) clue.description = text(override.description, 'zh');
      const english = run.case_data.en?.clue_dictionary?.find(item => item.clue_id === clue.clue_id);
      if (english) {
        if (override.keyword || override.label) english.keyword = text(override.keyword || override.label, 'en');
        if (override.description) english.description = text(override.description, 'en');
        if (override.en) Object.assign(english, override.en);
      }
    }
  }
  run.case_data.zone_clue_map = Object.fromEntries(Object.keys(run.case_data.scene.zones).map(zone => [zone,
    allTargets(run, spec).filter(target => target.zone_id === zone).map(target => target.clue_id)]));
  run.investigation_version = 2;
  run.investigation = { balance_revision: INVESTIGATION_BALANCE_REVISION,
    case_design_revision: CASE_DESIGN_REVISION,
    interview_revision: INTERVIEW_REVISION, interview_records: {},
    report_explanation_revision: REPORT_EXPLANATION_REVISION,
    skills_revision: INVESTIGATION_SKILLS_REVISION, skill_usage: {}, skill_hints: [],
    preparation_revision: INVESTIGATION_PREPARATION_REVISION, evidence_correction_used: false,
    raw_materials_revision: INVESTIGATION_RAW_MATERIALS_REVISION,
    completed_checks: [], testimony_stages: {}, testimony_records: {},
    propositions: [], puzzle_completed: false, attempted_relations: [], wrong_accusations: [], discounted_agent_ids: [] };
  // Scanner bonuses waive the first check instead of silently bypassing the player's observation.
  if (run.team_config.skill_effects?.auto_unlock_first) run.state.ap_discount_credit = 1;
  clearOffers(run);
}

export function publicInvestigation(run) {
  const spec = content(run);
  const reachable = reachableZones(run);
  const targets = allTargets(run, spec).filter(target => targetVisible(run, target)).map(target => ({
    target_id: target.target_id, zone_id: target.zone_id, zone_label: zoneLabel(run, target.zone_id), label: target.label, observation: target.observation,
    kind: target.kind, methods: ordered(run, target.methods, target.target_id).map(method => ({ id: method.id, label: method.label })),
    available: known(run, target.required_clues), completed: Boolean(completed(run, target.target_id)),
    hidden: Boolean(target.hidden),
  }));
  const coreTargets = targets.filter(target => !target.hidden);
  const next = coreTargets.find(target => !target.completed && target.available && target.zone_id === run.state.current_zone)
    || coreTargets.find(target => !target.completed && target.available && reachable.has(target.zone_id));
  const goal = next ? { zh: `${next.zone_id === run.state.current_zone ? '在' : '前往'}「${next.zone_label.zh}」观察「${next.label.zh}」，选择核验方式与执行探员。`,
    en: `${next.zone_id === run.state.current_zone ? 'In' : 'Go to'} “${next.zone_label.en}”${next.zone_id === run.state.current_zone ? ',' : ' and'} observe “${next.label.en}”, then choose a verification method and investigator.` }
    : { zh: '核对人物证词、完成专属核验、建立关系命题，并为报告四个环节附上证据。',
      en: 'Check testimony, complete the special verification, establish relationships, and attach evidence to the four report dimensions.' };
  const puzzleAvailable = known(run, spec.puzzle.required_clues);
  const workbench = publicWorkbench(run, spec.puzzle);
  const reportPolicy = investigationReportPolicy(run);
  return copy({ balance_revision: investigationBalanceRevision(run),
    ...(run.investigation.case_design_revision === CASE_DESIGN_REVISION
      ? { case_design_revision: CASE_DESIGN_REVISION, story: publicInvestigationStory(run, spec) } : {}),
    ...(run.investigation.skills_revision === INVESTIGATION_SKILLS_REVISION ? { skills: publicInvestigationSkills(run) } : {}),
    ...(usesInterviewStrategies(run) ? { interview_revision: INTERVIEW_REVISION,
      interview_records: run.investigation.interview_records || {} } : {}),
    preparation_revision: preparedInvestigation(run) ? INVESTIGATION_PREPARATION_REVISION : 1,
    cost_rules: INVESTIGATION_COST_RULES,
    ...(reportPolicy ? { report_policy: reportPolicy } : {}),
    targets, npc_zones: spec.npc_zones,
    initial_statements: Object.fromEntries(run.case_data.npcs.map(npc => [npc.npc_id,
      spec.initial_statements?.[npc.npc_id] || { zh: npc.initial_statement,
        en: run.case_data.en?.npcs?.find(item => item.npc_id === npc.npc_id)?.initial_statement || npc.initial_statement }])),
    clue_zones: Object.fromEntries(allTargets(run, spec).filter(target => run.state.unlocked_clues.includes(target.clue_id))
      .map(target => [target.clue_id, target.zone_id])),
    completed_checks: run.investigation.completed_checks,
    testimony_stages: run.investigation.testimony_stages, testimony_records: run.investigation.testimony_records,
    propositions: run.investigation.propositions,
    zone_access: Object.fromEntries(Object.keys(run.case_data.scene.zones).map(zone => {
      const action = run.case_data.scene.zones[zone].entry_requirement;
      const actionTargets = allTargets(run, spec).filter(target => targetVisible(run, target) && known(run, target.required_clues)
        && target.action_tag === action);
      const prerequisite = actionTargets.find(target => completed(run, target.target_id))
        || actionTargets.find(target => target.zone_id === run.state.current_zone)
        || actionTargets.find(target => reachable.has(target.zone_id));
      const requirement = !action || action === 'search_area' ? null : prerequisite
        ? { zh: `先在「${zoneLabel(run, prerequisite.zone_id).zh}」核验「${prerequisite.label.zh}」以取得入口权限。`,
          en: `Verify “${prerequisite.label.en}” in “${zoneLabel(run, prerequisite.zone_id).en}” to obtain access.` }
        : { zh: '先完成可达区域的核验，逐步开放相关入口。', en: 'Complete checks in reachable areas to progressively open the relevant access route.' };
      return [zone, { available: entryAvailable(run, zone), requirement }];
    })),
    puzzle: { id: spec.puzzle.id, type: spec.puzzle.type, label: spec.puzzle.label, prompt: spec.puzzle.prompt,
      available: puzzleAvailable, completed: run.investigation.puzzle_completed, ...puzzleQuote(run),
      items: puzzleAvailable ? ordered(run, spec.puzzle.items, spec.puzzle.id).map(item => ({ id: item.id, label: puzzleItemLabel(run, spec.puzzle, item) })) : [],
      ...confirmedPuzzleSelection(run, spec.puzzle),
      ...(workbench ? { workbench } : {}) },
    current_goal: goal,
    current_goal_target: next ? { target_id: next.target_id, zone_id: next.zone_id, zone_label: next.zone_label } : null,
    hint: { direction: goal,
      verification: { zh: `${next ? `「${next.label.zh}」位于「${next.zone_label.zh}」。` : ''}比较物件的可见记录与测量结果；先取原始材料，再核对人物说法。`,
        en: `${next ? `“${next.label.en}” is in “${next.zone_label.en}”. ` : ''}Compare visible records and measurements; obtain original material before checking accounts.` },
      facts: run.investigation.completed_checks.map(item => item.result),
    },
  });
}

function inspectOptions(run, command, lang) {
  const target = requireTarget(run, command.target_id);
  const check = completed(run, target.target_id);
  const packs = {};
  for (const agent of run.team_config.team) {
    const expert = (preparedInvestigation(run) ? getInvestigationAgentPreparation(agent).specialist_efficiency
      : Math.max(agent.base_observation_focus || 0, agent.base_logic_power || 0, agent.base_hack_level || 0) >= 75)
      && !(run.investigation.discounted_agent_ids || []).includes(agent.agent_id);
    const methods = check ? target.methods.filter(method => method.id === check.method_id) : target.methods;
    packs[agent.agent_id] = { cards: ordered(run, methods, target.target_id).map(method => {
      const reviewed = check?.method_id === method.id;
      const discountSource = reviewed ? 'review' : run.state.ap_discount_credit > 0 ? 'scanner' : expert ? 'specialist' : null;
      const base = actionQuote(run, discountSource ? 0 : 1);
      const quote = reviewed ? { ...base, stamina_cost: 0 } : { ...base,
        ...quoteInvestigationSkills(run, { kind: 'inspect', actionTag: target.action_tag,
          apCost: base.ap_cost, staminaCost: AGENT_STAMINA_INVESTIGATION_COST }) };
      return { option_id: `inspect:${run.id}:${run.revision + 1}:${target.target_id}:${method.id}:${agent.agent_id}`,
        target_id: target.target_id, method_id: method.id, executor_agent_id: agent.agent_id,
        label: text(method.label, lang), ...quote,
        ...(preparedInvestigation(run) ? { ap_discount_source: discountSource } : {}),
        risk_level: 'low',
        available: reviewed || (canPerformInvestigation(run, agent.agent_id, quote.stamina_cost)
          && run.state.action_points_left >= quote.ap_cost), review: Boolean(reviewed) };
    }) };
  }
  clearOffers(run);
  run.inspect_options = { target_id: target.target_id, revision: run.revision + 1, packs };
  return { target_id: target.target_id, packs };
}
function professionalObservation(run, target, executorId) {
  const note = target.expert_note;
  const agent = run.team_config.team.find(item => item.agent_id === executorId);
  if (!note || !['base_observation_focus', 'base_logic_power', 'base_hack_level'].includes(note.ability)) return null;
  const qualifies = preparedInvestigation(run)
    ? getInvestigationAbilityPercent(agent, note.ability.slice(5)) >= professionalObservationThreshold(run, note.ability)
    : agent?.[note.ability] >= 60;
  if (!qualifies) return null;
  // These are interpretations of this confirmed result, never another reward
  // or an answer hint. Preserve both languages for refresh and free review.
  return copy(note.text);
}
function inspect(run, command, lang) {
  const offer = run.inspect_options;
  if (!offer || offer.revision !== run.revision) fail('STALE_OPTIONS');
  const card = Object.values(offer.packs).flatMap(pack => pack.cards).find(item => item.option_id === command.option_id);
  if (!card) fail('STALE_OPTIONS');
  const target = requireTarget(run, card.target_id);
  const prior = completed(run, target.target_id);
  if (prior) {
    clearOffers(run);
    return { target_id: target.target_id, completed: true, review: true, narration: text(prior.result, lang),
      executor_agent_id: card.executor_agent_id, ap_cost: 0, new_clue_ids: [],
      ...(prior.expert_note ? { expert_note: text(prior.expert_note, lang) } : {}) };
  }
  chargeTurn(run, card.executor_agent_id, card.ap_cost, card.command_ap_credit_used || 0, card.stamina_cost ?? AGENT_STAMINA_INVESTIGATION_COST);
  consumeInvestigationSkills(run, card);
  if (preparedInvestigation(run) ? card.ap_discount_source === 'scanner' : run.state.ap_discount_credit > 0) run.state.ap_discount_credit -= 1;
  else if (preparedInvestigation(run) ? card.ap_discount_source === 'specialist' : card.ap_cost === 0) run.investigation.discounted_agent_ids = [
    ...(run.investigation.discounted_agent_ids || []), card.executor_agent_id,
  ];
  run.state.last_action = target.action_tag;
  const correct = card.method_id === target.method_id;
  const before = run.state.unlocked_clues;
  const expertNote = correct ? professionalObservation(run, target, card.executor_agent_id) : null;
  if (correct) {
    run.state = acquireClues(run.state, [target.clue_id]);
    run.investigation.completed_checks.push({ target_id: target.target_id, method_id: card.method_id,
      clue_ids: [target.clue_id], result: target.result, executor_agent_id: card.executor_agent_id,
      ...(expertNote ? { expert_note: expertNote } : {}) });
    applyInvestigationSkillSuccess(run, { kind: 'inspect' });
  } else run.state.confusion_score = Math.min(100,
    run.state.confusion_score + INVESTIGATION_COST_RULES.unsuccessful_inspection_confusion);
  const sourceHint = correct ? sourceHintInvestigationSkill(run, allTargets(run).filter(item =>
    !item.hidden && item.target_id !== target.target_id && !completed(run, item.target_id)
      && known(run, item.required_clues) && reachableZones(run).has(item.zone_id))
    .map(item => ({ target_id: item.target_id, zone_id: item.zone_id, label: item.label,
      zone_label: zoneLabel(run, item.zone_id), available: true, reachable: true }))) : null;
  const narration = correct ? text(target.result, lang) : target.failure_explanation ? text(target.failure_explanation, lang) : (lang === 'en'
    ? 'This method does not verify the visible discrepancy. Try another measurement or original record.'
    : '此方法未能核验可见异常，请改用其他测量或原始记录。');
  clearOffers(run);
  completeTurn(run, lang);
  return { target_id: target.target_id, completed: correct, narration,
    executor_agent_id: card.executor_agent_id, ap_cost: card.ap_cost,
    new_clue_ids: run.state.unlocked_clues.filter(id => !before.includes(id)),
    ...(expertNote ? { expert_note: text(expertNote, lang) } : {}),
    ...(sourceHint ? { source_hint: sourceHint } : {}),
    detail: card.skill_ap_discount || card.skill_stamina_discount
      ? (lang === 'en' ? `Investigator skills saved ${card.skill_ap_discount || 0} AP and ${card.skill_stamina_discount || 0} stamina; the displayed price includes these savings.`
        : `探员专长减免 ${card.skill_ap_discount || 0} AP、${card.skill_stamina_discount || 0} 点体力；已计入确认前的报价。`)
      : card.command_ap_credit_used > 0
      ? (lang === 'en' ? 'Emergency Throttle credit avoided AP cost.' : '紧急节流额度免除了行动点费用。')
      : card.ap_cost === 0 ? (lang === 'en' ? 'Specialist efficiency avoided AP cost.' : '专业效率免除了行动点费用。') : '' };
}

function requireNpc(run, npcId) {
  if (!run.case_data.npcs.some(npc => npc.npc_id === npcId)) fail('UNKNOWN_NPC');
  if (content(run).npc_zones[npcId] !== run.state.current_zone) fail('WRONG_ZONE');
}
function strategyQuestionPacks(run, npcId, stage, lang) {
  const testimony = content(run).testimonies[npcId][stage];
  const strategy = getInterviewStrategyContent(run.case_id, npcId, stage);
  if (!strategy) fail('UNKNOWN_INTERVIEW');
  const supported = known(run, testimony.required_clues);
  const npc = (lang === 'en' ? run.case_data.en?.npcs : run.case_data.npcs)?.find(item => item.npc_id === npcId)
    || run.case_data.npcs.find(item => item.npc_id === npcId);
  const claim = interviewRecord(run, npcId, stage, 'claim');
  const labels = lang === 'en' ? ['Understand the background', 'Record a specific account', 'Compare matching evidence']
    : ['了解背景', '固定具体说法', '出示证据并核对'];
  return { npc: { npcId, name: npc.name, role: npc.role }, source: 'investigation-v2',
    packs: Object.fromEntries(run.team_config.team.map(agent => [agent.agent_id, {
      questions: ['gentle', 'firm', 'evidence'].map((tone, index) => {
        const previous = interviewRecord(run, npcId, stage, tone === 'gentle' ? 'background' : tone === 'firm' ? 'claim' : null);
        const free = tone === 'gentle' || Boolean(previous);
        const base = free ? { ap_cost: 0, command_ap_credit_used: 0 }
          : tone === 'evidence' ? actionQuote(run, claim ? 0 : 1) : { ap_cost: 1, command_ap_credit_used: 0 };
        const quote = free ? { ...base, stamina_cost: 0 } : { ...base,
          ...quoteInvestigationSkills(run, { kind: 'question', tone, apCost: base.ap_cost,
            staminaCost: AGENT_STAMINA_INVESTIGATION_COST }) };
        const explanation = tone === 'gentle'
          ? { zh: '免费了解人物背景；不推进回合，也不恢复体力。人物说法仍待核验。', en: 'Learn personal background for free, without advancing time or restoring stamina. The account remains unverified.' }
          : tone === 'firm' ? previous
            ? { zh: '免费复查已固定的说法，不重复收费或增加混乱。', en: 'Review the recorded account for free, without another charge or confusion increase.' }
            : { zh: '固定这段可核验的说法；已付的 1 AP 抵扣同阶段证据对峙，仍需取得对应证据。', en: 'Record a checkable account. Its paid 1 AP covers the evidence confrontation at this stage; matching evidence is still required.' }
          : claim ? { zh: '已固定说法，本次对峙免 1 AP；仍按报价消耗体力并推进回合。', en: 'The recorded account covers 1 AP. This confrontation still pays the quoted stamina and advances one turn.' }
            : { zh: '系统匹配已发现材料，核对人物说法并保存补充证词。', en: 'The system matches acquired material, checks the account and saves the follow-up testimony.' };
        return { questionId: `question:${run.id}:${run.revision + 1}:${npcId}:${stage}:${tone}`,
          text: `${labels[index]}${tone === 'firm' ? `：${text(strategy.prompt, lang)}`
            : tone === 'evidence' && supported ? `：${text(testimony.topic, lang)}` : ''}`,
          tone, topicId: `testimony:${stage}`, requiredClueIds: tone === 'evidence' && supported ? testimony.required_clues : [],
          available: (tone !== 'evidence' || supported) && (free
            || (run.state.action_points_left >= quote.ap_cost && canPerformInvestigation(run, agent.agent_id, quote.stamina_cost))),
          repeated: Boolean(previous), ...quote, turn_cost: free ? 0 : 1,
          claim_credit_ap: tone === 'evidence' && claim ? 1 : 0,
          confusion_cost: tone === 'firm' && !previous
            ? mitigateInvestigationSkillConfusion(run, 2, { kind: 'question', tone, consume: false }).confusion_increase : 0,
          effect: text(explanation, lang) };
      }),
    }])) };
}
function strategyQuestion(run, command, lang) {
  const npcId = command.npc_id;
  const offer = run.interrogation_options[npcId];
  if (!offer || offer.revision !== run.revision) fail('STALE_OPTIONS');
  const executorId = command.executor_agent_id || run.state.command_state.active_agent_id || agentIds(run)[0];
  const selected = offer.packs[executorId]?.questions.find(item => item.questionId === command.question_id);
  if (!selected) fail('QUESTION_LOCKED');
  const stage = run.investigation.testimony_stages[npcId] || 0;
  const testimony = content(run).testimonies[npcId][stage];
  const strategy = getInterviewStrategyContent(run.case_id, npcId, stage);
  const progresses = selected.tone === 'evidence';
  if (progresses && !known(run, testimony.required_clues)) fail('QUESTION_LOCKED');
  const kind = selected.tone === 'gentle' ? 'background' : 'claim';
  const previous = !progresses && interviewRecord(run, npcId, stage, kind);
  const claim = interviewRecord(run, npcId, stage, 'claim');
  const paid = selected.turn_cost > 0;
  if (paid) {
    chargeTurn(run, executorId, selected.ap_cost, selected.command_ap_credit_used || 0, selected.stamina_cost);
    consumeInvestigationSkills(run, selected);
  }
  const response = progresses ? testimony.response : previous?.response || (kind === 'background' ? strategy.background : strategy.claim);
  if (progresses) {
    run.investigation.testimony_stages[npcId] = stage + 1;
    run.investigation.testimony_records[npcId] = [...(run.investigation.testimony_records[npcId] || []),
      { stage: stage + 1, response, evidence_ids: testimony.required_clues,
        ...(claim ? { prior_claim: copy(claim.response) } : {}) }];
  } else if (!previous) {
    run.investigation.interview_records[npcId] = [...(run.investigation.interview_records[npcId] || []),
      { stage, kind, response: copy(response) }];
  }
  const nextEmotion = progresses ? 'shaken' : run.npc_emotions[npcId]?.level || 'calm';
  const cooperationChange = paid ? progresses ? 1 : -1 : 0;
  if (paid) {
    run.npc_emotions[npcId] = { level: nextEmotion, history_count: (run.npc_emotions[npcId]?.history_count || 0) + 1,
      cooperation: (run.npc_emotions[npcId]?.cooperation || 0) + cooperationChange };
    if (selected.tone === 'firm') run.state.confusion_score = Math.min(100, run.state.confusion_score
      + mitigateInvestigationSkillConfusion(run, 2, { kind: 'question', tone: 'firm' }).confusion_increase);
    run.asked_question_ids[npcId] = [...new Set([...(run.asked_question_ids[npcId] || []), command.question_id])].slice(-12);
  }
  const npc = (lang === 'en' ? run.case_data.en?.npcs : run.case_data.npcs)?.find(item => item.npc_id === npcId)
    || run.case_data.npcs.find(item => item.npc_id === npcId);
  clearOffers(run);
  if (paid) completeTurn(run, lang);
  return { response: text(response, lang), npc_name: npc.name, executor_agent_id: executorId, nextEmotion,
    emotionShift: progresses ? 1 : 0, emotion_shift: progresses ? 1 : 0, revealedClueIds: [],
    cooperationChange, repeated: Boolean(previous), testimony_stage: progresses ? stage + 1 : stage,
    progressed: progresses, packs: {}, ap_cost: selected.ap_cost, stamina_cost: selected.stamina_cost,
    turn_cost: selected.turn_cost, record_kind: progresses ? 'verified_testimony' : kind,
    ...(progresses && claim ? { prior_claim: text(claim.response, lang), evidence_ids: testimony.required_clues } : {}) };
}
function questionPacks(run, npcId, lang) {
  requireNpc(run, npcId);
  const stage = run.investigation.testimony_stages[npcId] || 0;
  if (usesInterviewStrategies(run) && stage < 2) return strategyQuestionPacks(run, npcId, stage, lang);
  const testimony = content(run).testimonies[npcId]?.[Math.min(stage, 1)];
  const publicNpc = (lang === 'en' ? run.case_data.en?.npcs : run.case_data.npcs)?.find(item => item.npc_id === npcId)
    || run.case_data.npcs.find(item => item.npc_id === npcId);
  const required = testimony?.required_clues || [];
  const supported = known(run, required);
  const labels = lang === 'en' ? ['Ask gently', 'Ask directly', 'Present matching evidence'] : ['温和询问', '明确追问', '出示对应证据'];
  return { npc: { npcId, name: publicNpc.name, role: publicNpc.role }, source: 'investigation-v2',
    packs: Object.fromEntries(run.team_config.team.map(agent => [agent.agent_id, {
      questions: ['gentle', 'firm', 'evidence'].map((tone, index) => {
        const base = tone === 'evidence' ? actionQuote(run, stage >= 2 ? 0 : 1)
          : { ap_cost: stage >= 2 ? 0 : 1, command_ap_credit_used: 0 };
        const quote = stage >= 2 ? { ...base, stamina_cost: 0 } : { ...base,
          ...quoteInvestigationSkills(run, { kind: 'question', tone, apCost: base.ap_cost,
            staminaCost: AGENT_STAMINA_INVESTIGATION_COST }) };
        return {
        questionId: `question:${run.id}:${run.revision + 1}:${npcId}:${stage}:${tone}`,
        text: `${labels[index]}${testimony && (tone !== 'evidence' || supported) ? `：${text(testimony.topic, lang)}` : ''}`,
        tone, topicId: `testimony:${stage}`, requiredClueIds: tone === 'evidence' && supported ? required : [],
        available: (tone !== 'evidence' || supported) && (stage >= 2
          || (run.state.action_points_left >= quote.ap_cost && canPerformInvestigation(run, agent.agent_id, quote.stamina_cost))),
        repeated: stage >= 2, ...quote,
      }; }),
    }])) };
}
function interrogationOptions(run, command, lang) {
  const result = questionPacks(run, command.npc_id, lang);
  clearOffers(run);
  run.interrogation_options[command.npc_id] = { ...result, revision: run.revision + 1 };
  return result;
}
function question(run, command, lang) {
  requireNpc(run, command.npc_id);
  if (usesInterviewStrategies(run) && (run.investigation.testimony_stages[command.npc_id] || 0) < 2) {
    return strategyQuestion(run, command, lang);
  }
  const offer = run.interrogation_options[command.npc_id];
  if (!offer || offer.revision !== run.revision) fail('STALE_OPTIONS');
  const executorId = command.executor_agent_id || run.state.command_state.active_agent_id || agentIds(run)[0];
  const selected = offer.packs[executorId]?.questions.find(item => item.questionId === command.question_id);
  if (!selected) fail('QUESTION_LOCKED');
  const stage = run.investigation.testimony_stages[command.npc_id] || 0;
  const testimony = content(run).testimonies[command.npc_id][Math.min(stage, 1)];
  if (selected.tone === 'evidence' && !known(run, testimony.required_clues)) fail('QUESTION_LOCKED');
  if (stage < 2) chargeTurn(run, executorId, preparedInvestigation(run) ? selected.ap_cost : 1,
    preparedInvestigation(run) ? selected.command_ap_credit_used || 0 : 0,
    selected.stamina_cost ?? AGENT_STAMINA_INVESTIGATION_COST);
  if (stage < 2) consumeInvestigationSkills(run, selected);
  const progresses = stage < 2 && selected.tone === 'evidence' && known(run, testimony.required_clues);
  const localizedNpc = (lang === 'en' ? run.case_data.en?.npcs : run.case_data.npcs)?.find(item => item.npc_id === command.npc_id)
    || run.case_data.npcs.find(item => item.npc_id === command.npc_id);
  const response = stage >= 2 ? text(run.investigation.testimony_records[command.npc_id]?.[1]?.response, lang)
    : progresses ? text(testimony.response, lang)
      : text(selected.tone === 'firm' ? testimony.firm_response : testimony.gentle_response, lang) || localizedNpc.initial_statement;
  if (progresses) {
    run.investigation.testimony_stages[command.npc_id] = stage + 1;
    run.investigation.testimony_records[command.npc_id] = [...(run.investigation.testimony_records[command.npc_id] || []),
      { stage: stage + 1, response: testimony.response, evidence_ids: testimony.required_clues }];
  }
  const nextEmotion = progresses ? 'shaken' : run.npc_emotions[command.npc_id]?.level || 'calm';
  const cooperationChange = stage >= 2 ? 0 : progresses ? 1 : selected.tone === 'firm' ? -1 : 0;
  if (stage < 2) {
    // Completed testimony is a read-only replay: reviewing the saved account
    // cannot change cooperation, inflate interview counts or evict paid questions.
    run.npc_emotions[command.npc_id] = { level: nextEmotion,
      history_count: (run.npc_emotions[command.npc_id]?.history_count || 0) + 1,
      cooperation: (run.npc_emotions[command.npc_id]?.cooperation || 0) + cooperationChange };
    if (selected.tone === 'firm' && !progresses) run.state.confusion_score = Math.min(100, run.state.confusion_score
      + mitigateInvestigationSkillConfusion(run, 2, { kind: 'question', tone: 'firm' }).confusion_increase);
    run.asked_question_ids[command.npc_id] = [...new Set([...(run.asked_question_ids[command.npc_id] || []), command.question_id])].slice(-12);
  }
  clearOffers(run);
  if (stage < 2) completeTurn(run, lang);
  return { response, npc_name: localizedNpc.name, executor_agent_id: executorId, nextEmotion,
    emotionShift: progresses ? 1 : 0, emotion_shift: progresses ? 1 : 0, revealedClueIds: [],
    cooperationChange, repeated: stage >= 2, testimony_stage: progresses ? stage + 1 : stage,
    progressed: progresses, packs: {} };
}

function link(run, command, lang) {
  const [a, b] = command.clue_ids;
  if (!known(run, [a, b])) fail('INVALID_CLUES');
  const key = [...command.clue_ids].sort().join(':');
  const relationKey = `${key}:${command.relation_type}${command.relation_type === 'precedes' ? `:${a}` : ''}`;
  const existing = run.linked_pairs.find(pair => pair.key === key && pair.valid
    && pair.relation_type === command.relation_type && (command.relation_type !== 'precedes' || pair.a === a));
  if (existing) {
    return { is_valid: true, isValid: true, repeated: true, reveal: text(existing.label, lang), new_clue_ids: [] };
  }
  const relation = content(run).relations.find(item => item.relation === command.relation_type
    && (item.relation === 'precedes' ? item.a === a && item.b === b : [item.a, item.b].sort().join(':') === key));
  const repeated = run.investigation.attempted_relations.includes(relationKey);
  if (!repeated) run.investigation.attempted_relations.push(relationKey);
  if (!relation) {
    if (!repeated) { run.state.confusion_score = Math.min(100, run.state.confusion_score + 3); run.attempted_link_keys.push(relationKey); }
    const feedback = {
      supports: { zh: '这两份记录尚未确认能共同支持同一个具体命题。请核对各自证明的事实，区分相互印证与仅仅提到同一人物或地点；也可先保存为待核实假说。',
        en: 'These records have not been confirmed to support the same specific proposition. Check what each establishes; corroboration requires more than mentioning the same person or place. You can retain the connection as an unverified hypothesis.' },
      contradicts: { zh: '这两份记录尚未确认存在具体矛盾。请分别核对它们的主张与条件；两份记录能够同时为真，或只是描述不同事件，不构成相互排斥。',
        en: 'These records have not been confirmed to contradict a specific claim. Compare their assertions and conditions; accounts that can both be true, or describe different events, are not mutually exclusive.' },
      precedes: { zh: '这两份记录尚未建立所选先后关系。请核对原始时钟，并按核验结果明确指出的具体事件，从较早事件连向较晚事件；同一材料可能包含多个事件，时间窗重叠不能直接当作严格先后。',
        en: 'These records do not establish the selected order. Check original clocks and use the specific events identified in the verification result, from earlier to later. One record may contain multiple events; overlapping windows do not establish strict order.' },
    };
    return { is_valid: false, isValid: false, repeated,
      reveal: run.investigation.case_design_revision === CASE_DESIGN_REVISION ? text(feedback[command.relation_type], lang) : lang === 'en'
        ? 'These records do not establish the selected relationship. Distinguish support, contradiction and ordering; check the original clocks. For ordering, select the earlier event first. Overlapping windows or different recorded events do not establish strict order.'
        : '这两份记录暂未建立所选关系。先区分支持、矛盾和先后，核对原始时钟；先后关系应从较早事件指向较晚事件。时间窗重叠或记录对象不同，不能直接当作严格先后。', new_clue_ids: [] };
  }
  if (run.investigation.propositions.some(item => item.id === relation.proposition_id)) {
    return { is_valid: true, isValid: true, repeated: true, reveal: text(relation.label, lang), new_clue_ids: [] };
  }
  run.investigation.propositions.push({ id: relation.proposition_id, label: relation.label,
    a, b, relation: relation.relation, alternative: Boolean(relation.alternative) });
  run.linked_pairs.push({ a, b, key, valid: true, relation_type: relation.relation, label: relation.label });
  run.state.linked_core_pairs = [...new Set(run.linked_pairs.map(pair => pair.key))];
  run.truth_fragments += 1;
  run.attempted_link_keys.push(relationKey);
  if (preparedInvestigation(run) && run.state.command_state.doctrine_id === 'evidence_control') {
    run.state.command_state = awardCommandMilestone(run.state.command_state, 'doctrine:first-valid-link').state;
  }
  clearOffers(run);
  return { is_valid: true, isValid: true, is_core_link: true, isCoreLink: true, reveal: text(relation.label, lang),
    cinematic: { narrative: text(relation.label, lang), villain_memory: '', new_clue_hint: '' }, new_clue_ids: [] };
}
function puzzleOptions(run, lang) {
  const puzzle = content(run).puzzle;
  if (!known(run, puzzle.required_clues)) fail('PUZZLE_LOCKED');
  clearOffers(run);
  run.puzzle_offer_revision = run.revision + 1;
  const quote = puzzleQuote(run);
  const workbench = publicWorkbench(run, puzzle);
  if (preparedInvestigation(run)) run.puzzle_offer_quote = quote;
  return { puzzle: { id: puzzle.id, type: puzzle.type, label: text(puzzle.label, lang),
    prompt: text(puzzle.prompt, lang), items: ordered(run, puzzle.items, puzzle.id).map(item => ({ id: item.id, label: text(puzzleItemLabel(run, puzzle, item), lang) })),
    completed: run.investigation.puzzle_completed, ...quote, ...confirmedPuzzleSelection(run, puzzle),
    ...(workbench ? { workbench } : {}) } };
}
function puzzle(run, command, lang) {
  const spec = content(run).puzzle;
  if (run.puzzle_offer_revision !== run.revision || !known(run, spec.required_clues)) fail('STALE_OPTIONS');
  if (command.answer_ids.some(id => !spec.items.some(item => item.id === id))) fail('INVALID_PUZZLE');
  if (run.investigation.puzzle_completed) { clearOffers(run); return { correct: true, completed: true, review: true }; }
  const quote = puzzleQuote(run);
  const executorId = quote.executor_agent_id;
  if (!executorId) fail('INSUFFICIENT_AGENT_STAMINA');
  chargeTurn(run, executorId, quote.ap_cost, quote.command_ap_credit_used || 0,
    quote.stamina_cost ?? AGENT_STAMINA_INVESTIGATION_COST);
  consumeInvestigationSkills(run, quote);
  const answer = spec.type === 'compare' ? [...spec.answer].sort() : spec.answer;
  const selected = spec.type === 'compare' ? [...command.answer_ids].sort() : command.answer_ids;
  const correct = JSON.stringify(answer) === JSON.stringify(selected);
  if (correct) run.investigation.puzzle_completed = true;
  else run.state.confusion_score = Math.min(100,
    run.state.confusion_score + INVESTIGATION_COST_RULES.unsuccessful_reconstruction_confusion);
  clearOffers(run);
  completeTurn(run, lang);
  return { correct, completed: correct, narration: correct
    ? text(spec.success || { zh: '核验成立，重建结果已记录。', en: 'Verified. The reconstruction is recorded.' }, lang)
    : lang === 'en' ? 'The reconstruction conflicts with an observed record. Review and revise it.' : '重建结果与已观察记录不符，请复查并修改。' };
}
function reportOptions(run, lang) {
  const investigation = content(run);
  const spec = investigation.report;
  const policy = investigationReportPolicy(run);
  return Object.fromEntries([
    ...['conclusions', 'methods', 'motives', 'timelines'].map(key => [key, ordered(run, spec[key], key).map(item => ({ id: item.id, label: text(item.label, lang) }))]),
    ['availableEvidence', run.case_data.clue_dictionary.filter(clue => run.state.unlocked_clues.includes(clue.clue_id)).map(clue => ({
      id: clue.clue_id, label: lang === 'en'
        ? run.case_data.en?.clue_dictionary?.find(item => item.clue_id === clue.clue_id)?.keyword || clue.keyword : clue.keyword,
    }))],
    ['dimensions', DIMENSIONS],
    ['dimension_guidance', Object.fromEntries(DIMENSIONS.map(key => [key, text(DIMENSION_GUIDANCE[key], lang)]))],
    ...(run.investigation.report_explanation_revision === REPORT_EXPLANATION_REVISION
      ? [['evidence_roles', publicReportEvidenceRoles(run, investigation, lang)]] : []),
    ...(policy ? [['report_policy', policy]] : []),
  ]);
}
function invalidReportConclusions(run, command) {
  const answers = content(run).report.answers;
  return ['conclusion', 'method', 'motive', 'timeline'].filter(field => {
    const accepted = answers[`${field}_id`];
    return !(Array.isArray(accepted) ? accepted : [accepted]).includes(command[`${field}_id`]);
  });
}
export function judgeInvestigationReport(run, command, lang) {
  const spec = content(run);
  const report = spec.report;
  const groups = command.evidence_by_dimension;
  if (!groups || DIMENSIONS.some(key => !Array.isArray(groups[key]))) fail('INVALID_EVIDENCE');
  const attached = [...new Set(Object.values(groups).flat())];
  if (!known(run, attached) || command.evidence_ids?.some(id => !run.state.unlocked_clues.includes(id))) fail('INVALID_EVIDENCE');
  const options = reportOptions(run, lang);
  const selected = { conclusion_id: command.conclusion_id, method_id: command.method_id,
    motive_id: command.motive_id, timeline_id: command.timeline_id };
  const fields = ['conclusion', 'method', 'motive', 'timeline'];
  for (const field of fields) {
    const key = `${field}_id`;
    const collection = field === 'conclusion' ? 'conclusions' : `${field}s`;
    const accepted = report.answers[key];
    if (!options[collection].some(item => item.id === selected[key])
      && !(Array.isArray(accepted) ? accepted : [accepted]).includes(selected[key])) fail('INVALID_REPORT_OPTION');
  }
  const invalid = invalidReportConclusions(run, command);
  const missing = DIMENSIONS.filter(key => {
    const routes = [report.support[key], ...(usesRawMaterials(run) ? report.support_alternatives?.[key] || [] : [])];
    return !routes.some(route => route?.length && route.every(id => groups[key].includes(id)));
  });
  const passed = !invalid.length && !missing.length;
  let score = passed ? 'C' : 'D';
  if (passed && run.investigation.puzzle_completed) {
    score = 'B';
    const alternatives = run.investigation.propositions.filter(item => item.alternative).length;
    if (alternatives >= 2) { score = 'A'; if (known(run, [spec.hidden.clue_id])) score = 'S'; }
  }
  const labels = lang === 'en' ? { opportunity: 'opportunity', method: 'method', motive: 'motive', timeline: 'timeline' }
    : { opportunity: '机会', method: '手段', motive: '动机', timeline: '时间线' };
  let critique = passed ? (lang === 'en' ? 'All four conclusions are supported by the submitted evidence.' : '四个结论环节均得到所附证据支持。')
    : invalid.length ? (lang === 'en' ? 'One or more conclusions conflict with the evidence. Recheck the established facts.' : '部分结论与证据不符，请重新核对已确认事实。')
      : (lang === 'en' ? `Missing support: ${missing.map(key => labels[key]).join(', ')}. You can revise the report.`
        : `缺少有效证据支持：${missing.map(key => labels[key]).join('、')}。可补充后重新提交。`);
  if (!passed) critique += ` ${[...(missing.length ? missing : DIMENSIONS)].map(key => text(DIMENSION_GUIDANCE[key], lang)).join(' ')}`;
  const wrongAccusation = !passed && Object.hasOwn(report.wrong_outcomes || {}, command.conclusion_id);
  const fullRecord = spec.targets.filter(target => !target.hidden).every(target => known(run, [target.clue_id]));
  const evidenceReview = explainSubmittedReport(run, spec, groups, lang);
  return normalizeJudgeResult({ score, critique, missing_dimensions: missing, evidence_coverage: 4 - missing.length,
    ...(evidenceReview ? { evidence_review: evidenceReview } : {}),
    wrong_outcome: wrongAccusation ? (fullRecord ? text(report.wrong_outcomes[command.conclusion_id], lang)
      : lang === 'en' ? 'An unsupported accusation damages credibility; investigate further before revising it.'
        : '未经充分核验的指控损害调查信誉，请进一步取证后修正。') : '' });
}
function report(run, command, lang, now) {
  const result = judgeInvestigationReport(run, command, lang);
  run.judge_result = result;
  run.report_attempts += 1;
  clearOffers(run);
  if (result.is_passed) {
    run.final_report = { conclusion_id: command.conclusion_id, method_id: command.method_id,
      motive_id: command.motive_id, timeline_id: command.timeline_id,
      evidence_ids: [...new Set(Object.values(command.evidence_by_dimension).flat())],
      evidence_by_dimension: copy(command.evidence_by_dimension) };
    finish(run, 'completed', now);
    return result;
  }
  const policy = investigationReportPolicy(run);
  const evidenceOnly = !invalidReportConclusions(run, command).length && result.missing_dimensions.length > 0;
  const penalty = policy && evidenceOnly ? policy.evidence_rejection_penalty : getRejectedReportPenalty(run.state);
  if (policy && evidenceOnly && policy.evidence_correction_available) run.investigation.evidence_correction_used = true;
  const wrongIndex = Object.keys(content(run).report.wrong_outcomes || {}).indexOf(command.conclusion_id);
  if (wrongIndex >= 0 && !run.investigation.wrong_accusations.includes(command.conclusion_id)) {
    // The two accusations have distinct, one-time consequences without blocking later testimony.
    if (wrongIndex === 0) penalty.reputationLoss += 4;
    else penalty.confusionIncrease += 3;
  }
  run.state.action_points_left = Math.max(0, run.state.action_points_left - penalty.apLoss);
  run.state.reputation = Math.max(0, run.state.reputation - penalty.reputationLoss);
  run.state.confusion_score = Math.min(100, run.state.confusion_score + penalty.confusionIncrease);
  if (result.wrong_outcome) run.investigation.wrong_accusations = [...new Set([...run.investigation.wrong_accusations, command.conclusion_id])];
  return { ...result, penalty };
}

export function applyInvestigationCommand(run, command, lang, now) {
  switch (command.type) {
    case 'inspect_options': return inspectOptions(run, command, lang);
    case 'inspect': return inspect(run, command, lang);
    case 'travel': {
      if (!Object.hasOwn(run.case_data.scene.zones, command.zone_id)) fail('UNKNOWN_ZONE');
      if (command.zone_id === run.state.current_zone) return { zone_id: command.zone_id, traveled: false };
      if (!getConnectedZones(run.case_data, run.state.current_zone).includes(command.zone_id)) fail('ZONE_NOT_ADJACENT');
      if (!entryAvailable(run, command.zone_id)) fail('ZONE_LOCKED');
      run.state.current_zone = command.zone_id;
      run.state.visited_zones = [...new Set([...run.state.visited_zones, command.zone_id])];
      clearOffers(run);
      return { zone_id: command.zone_id, traveled: true };
    }
    case 'puzzle_options': return puzzleOptions(run, lang);
    case 'puzzle': return puzzle(run, command, lang);
    case 'interrogation_options': return interrogationOptions(run, command, lang);
    case 'question': return question(run, command, lang);
    case 'link': return link(run, command, lang);
    case 'report_options': return reportOptions(run, lang);
    case 'report': return report(run, command, lang, now);
    case 'decision_options': case 'round': fail('MANUAL_INSPECTION_REQUIRED'); break;
    case 'rest': {
      if (run.state.action_points_left < 1) fail('INSUFFICIENT_AP');
      run.state.agent_stamina = recoverAgentStaminaTurn(run.state.agent_stamina, agentIds(run));
      run.state.action_points_left -= 1;
      run.state.turn_count += 1;
      run.state.confusion_score = Math.max(0, run.state.confusion_score - 6);
      clearOffers(run); completeTurn(run, lang);
      return { rested: true };
    }
    case 'crisis': {
      if (!run.pending_crisis) fail('NO_PENDING_CRISIS');
      run.pending_crisis = describeCrisis(run, run.pending_crisis, lang);
      const resolution = resolveRunCrisis(run, command.option_id, lang);
      if (resolution.error) fail(resolution.error.toUpperCase());
      const changes = resolution.changes;
      if (changes.confusion_delta > 0) {
        const protection = mitigateInvestigationSkillConfusion(run, changes.confusion_delta, { kind: 'crisis' });
        changes.confusion_delta = protection.confusion_increase;
        if (protection.reduction > 0) resolution.resultText += lang === 'en'
          ? ` Investigator protection reduced confusion by ${protection.reduction}; actual increase: ${protection.confusion_increase}.`
          : ` 探员防护减少 ${protection.reduction} 点混乱，本次实际增加 ${protection.confusion_increase} 点。`;
      }
      run.state.confusion_score = Math.max(0, Math.min(100, run.state.confusion_score + (changes.confusion_delta || 0)));
      run.state.action_points_left = Math.max(0, run.state.action_points_left + (changes.ap_delta || 0));
      run.state.reputation = Math.max(0, run.state.reputation + (changes.reputation_delta || 0));
      if (changes.defer_evidence) {
        run.state.evidence_crisis = changes.defer_evidence;
        const deadline = changes.defer_evidence.deadline;
        resolution.resultText = lang === 'en'
          ? `Original retained. The deferral deadline is turn ${deadline}; advancing beyond it costs 5 reputation and adds 5 confusion. Free review does not cancel this consequence.`
          : `原始证据已保留。延期至第 ${deadline} 回合；推进超过该回合后，信誉 -5、混乱 +5。免费复查不会取消这次延期后果。`;
      }
      run.pending_crisis = null; clearOffers(run);
      return resolution;
    }
    case 'priority':
      if (command.priority_list.some(id => !PRIORITY_ACTIONS.some(item => item.id === id))) fail('INVALID_PRIORITY');
      run.team_config.priority_list = [...command.priority_list]; clearOffers(run);
      return { priority_list: command.priority_list };
    case 'command': {
      if (command.command_id !== 'emergency_stabilize') fail('INVALID_COMMAND');
      const outcome = applyEmergencyStabilize(run.state);
      if (outcome.error) fail(outcome.error.toUpperCase());
      run.state = outcome.gameState; clearOffers(run);
      return { command_id: command.command_id, cost: outcome.cost };
    }
    case 'recover':
      if (!run.state.is_crashed) fail('RUN_NOT_CRASHED');
      run.state.confusion_score = 0; run.state.is_crashed = false; run.state.react_state = 'IDLE';
      run.state.action_points_left = Math.max(0, run.state.action_points_left - (run.team_config.skill_effects?.bsod_immunity ? 0 : 5));
      run.recovery_count += 1; clearOffers(run);
      return { recovered: true };
    case 'abandon':
      run.judge_result = normalizeJudgeResult({ score: 'D', critique: lang === 'en' ? 'Investigation abandoned.' : '调查已放弃。' });
      finish(run, 'abandoned', now); return { abandoned: true };
    default: fail('INVALID_COMMAND');
  }
}
