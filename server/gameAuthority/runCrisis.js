import { applyCrisisChoice } from '../../src/game/crisisEvents.js';
import { runRoll } from './runSettlement.js';
import { usesBalancedInvestigation } from '../investigationV2/balance.js';

export function nextRunCrisisTurn(run) {
  return run.state.turn_count + (usesBalancedInvestigation(run) ? 6 : 4)
    + runRoll(`${run.id}:${run.state.turn_count}`, 'crisis-interval', 3);
}

export function createRunCrisis(run, lang) {
  const state = run.state;
  const caseData = run.case_data;
  const seed = `${run.id}:${state.turn_count}`;
  const types = [
    ...(state.unlocked_clues.length ? ['evidence'] : []),
    ...(caseData.npcs?.length ? ['npc_recant'] : []), 'tracker',
  ];
  const type = types[runRoll(seed, 'crisis-type', types.length)];
  const zh = lang === 'zh';
  const choice = (id, ap_cost, en, chinese) => ({ id, ap_cost, label: zh ? chinese : en });
  if (type === 'evidence') {
    const clueId = state.unlocked_clues[runRoll(seed, 'crisis-clue', state.unlocked_clues.length)];
    const clue = caseData.clue_dictionary.find(item => item.clue_id === clueId);
    return { type, icon: '🔥', title: zh ? '证据危机' : 'EVIDENCE PURGE',
      payload: { clue_id: clueId, keyword: clue.keyword },
      choices: [choice('secure_now', usesBalancedInvestigation(run) ? 2 : 3, 'SECURE NOW', '紧急保全'), choice('defer', 0, 'DEFER', '稍后处理')] };
  }
  if (type === 'npc_recant') {
    const npc = caseData.npcs[runRoll(seed, 'crisis-npc', caseData.npcs.length)];
    return { type, icon: '🎭', title: zh ? 'NPC 翻供' : 'TESTIMONY RETRACTED',
      payload: { npc_id: npc.npc_id, npc_name: npc.name },
      choices: [choice('reinterrogate', 0, 'REINTERROGATE', '立即重新审讯'), choice('ignore', 0, 'SET ASIDE', '暂时搁置')] };
  }
  return { type, icon: '👁️', title: zh ? '追踪者逼近' : 'HOSTILE TRACE', payload: {},
    choices: [choice('evade', usesBalancedInvestigation(run) ? 1 : 2, 'EVADE', '甩脱'), choice('confront', 0, 'CONFRONT', '对峙'), choice('hide', 0, 'HIDE', '隐匿')] };
}

export function resolveRunCrisis(run, optionId, lang) {
  const event = run.pending_crisis;
  if (event.type !== 'tracker' || optionId !== 'confront' || !event.choices?.some(choice => choice.id === optionId)) {
    const result = applyCrisisChoice(event, optionId, run.state, run.team_config, lang);
    if (!result.error && usesBalancedInvestigation(run)) {
      const cost = event.choices.find(choice => choice.id === optionId).ap_cost;
      if (event.type === 'evidence' && optionId === 'secure_now') {
        result.resultText = lang === 'zh'
          ? `✅ 证据「${event.payload.keyword}」已紧急加密封存，威胁解除。（AP -${cost}）`
          : `✅ Evidence “${event.payload.keyword}” encrypted and secured. Threat cleared. (AP -${cost})`;
      } else if (event.type === 'tracker' && optionId === 'evade') {
        result.resultText = lang === 'zh'
          ? `🛰️ 信道已切换，追踪者失去目标。混乱冲击被完全抵消。（AP -${cost}）`
          : `🛰️ Channel switched. The tracker lost your signal and the confusion impact was negated. (AP -${cost})`;
      }
    }
    return result;
  }
  // Only the confrontation roll in the shared resolver is nondeterministic.
  const win = runRoll(`${run.id}:${run.state.turn_count}`, 'crisis-confront') < 50;
  let scale = 1;
  if (run.team_config.specialty_match >= 0.66) scale *= 0.8;
  if (run.team_config.synergy_skills?.includes('ghost_protocol')) scale *= 0.8;
  return { changes: win ? { confusion_delta: -10 }
    : { confusion_delta: Math.round(15 * scale), reputation_delta: -10 },
  resultText: lang === 'zh' ? (win ? '反制成功，混乱 -10。' : '对峙失败，追踪者突破了防火墙。')
    : (win ? 'Counter successful. Confusion -10.' : 'Confrontation failed; the tracker breached the firewall.') };
}
