import { cloudflareApi } from '@/api/cloudflareClient';
import { buildOfflineDecisionPacks } from '@/game/narrativeEngine';

const RULE_TIMEOUT_MS = 12_000;
let currentLang = 'zh';

export function setRulesLang(lang) {
  currentLang = lang === 'en' ? 'en' : 'zh';
}

function abortError(lang = currentLang) {
  const error = new Error(lang === 'en' ? 'The rule request was aborted.' : '规则请求已中止。');
  error.name = 'AbortError';
  return error;
}

function normalizeLang(lang) {
  return lang === 'en' ? 'en' : 'zh';
}

function withAbortAndTimeout(promise, signal, lang = currentLang) {
  const requestLang = normalizeLang(lang);
  if (signal?.aborted) return Promise.reject(abortError(requestLang));
  return new Promise((resolve, reject) => {
    let done = false;
    const finish = (callback, value) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      callback(value);
    };
    const onAbort = () => finish(reject, abortError(requestLang));
    const timer = window.setTimeout(() => {
      const error = Object.assign(
        new Error(requestLang === 'en' ? 'Rule service timed out.' : '规则服务响应超时。'),
        { code: 'RULE_TIMEOUT' },
      );
      finish(reject, error);
    }, RULE_TIMEOUT_MS);
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(value => finish(resolve, value), error => finish(reject, error));
  });
}

async function invokeRule(task, payload, signal, lang = currentLang) {
  const requestLang = normalizeLang(lang);
  const response = await withAbortAndTimeout(
    cloudflareApi.functions.invoke('detectiveRules', { task, payload: { ...payload, lang: requestLang } }),
    signal,
    requestLang,
  );
  if (response.data?.error) {
    const error = Object.assign(new Error(response.data.error), {
      code: response.data.code || response.data.error,
    });
    throw error;
  }
  if (!response.data?.data) throw new Error('EMPTY_RULE_RESULT');
  return response.data.data;
}

function teamPayload(team = []) {
  return team.slice(0, 3).map(agent => ({
    agentId: agent.agent_id,
    logicPower: agent.logic_power,
    observationFocus: agent.observation_focus,
    hackLevel: agent.hack_level,
    confusionResistance: agent.confusion_resistance,
    interrogationBonus: agent.skill_effects?.interrogation_bonus || agent.interrogation_bonus || 0,
  }));
}

export async function getDecisionOptionPacks({ gameState, caseData, team, signal, lang = currentLang }) {
  const requestLang = normalizeLang(lang);
  const payload = {
    caseId: caseData.case_id,
    zoneId: gameState.current_zone,
    turn: gameState.turn_count + 1,
    runId: gameState.run_id,
    unlockedClueIds: gameState.unlocked_clues || [],
    visitedZoneIds: gameState.visited_zones || [],
    recentActionTags: (gameState.chat_history || []).slice(-5).map(item => item?.actionTag || '').filter(Boolean),
    confusion: gameState.confusion_score || 0,
    actionPoints: gameState.action_points_left || 0,
    team: teamPayload(team),
  };
  try {
    return await invokeRule('decision_options', payload, signal, requestLang);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    return buildOfflineDecisionPacks({ team, turn: payload.turn, caseId: payload.caseId, lang: requestLang });
  }
}

export async function getInterrogationOptionPacks({ gameState, caseData, npcId, team, emotionLevel, askedQuestionIds, signal }) {
  return invokeRule('interrogation_options', {
    caseId: caseData.case_id,
    npcId,
    runId: gameState.run_id,
    turn: gameState.turn_count,
    emotionLevel,
    unlockedClueIds: gameState.unlocked_clues || [],
    askedQuestionIds,
    team: teamPayload(team),
  }, signal);
}

export async function resolveInterrogationOption({ gameState, caseData, npcId, questionId, executorAgentId, team, emotionLevel, askedQuestionIds, signal }) {
  return invokeRule('interrogation_resolve', {
    caseId: caseData.case_id,
    npcId,
    questionId,
    executorAgentId,
    runId: gameState.run_id,
    turn: gameState.turn_count,
    emotionLevel,
    unlockedClueIds: gameState.unlocked_clues || [],
    askedQuestionIds,
    team: teamPayload(team),
  }, signal);
}

export async function checkDeterministicLink({ caseData, clueAId, clueBId, synergyActive, fragmentsFound = 0, signal }) {
  return invokeRule('link_check', {
    caseId: caseData.case_id,
    clueAId,
    clueBId,
    synergyActive,
    fragmentsFound,
  }, signal);
}

export async function getStructuredReportOptions({ gameState, caseData, signal }) {
  return invokeRule('report_options', {
    caseId: caseData.case_id,
    runId: gameState.run_id,
    unlockedClueIds: gameState.unlocked_clues || [],
  }, signal);
}

export async function judgeStructuredReport({ gameState, caseData, report, signal }) {
  return invokeRule('report_judge', {
    caseId: caseData.case_id,
    runId: gameState.run_id,
    unlockedClueIds: gameState.unlocked_clues || [],
    conclusionId: report.conclusionId,
    methodId: report.methodId,
    motiveId: report.motiveId,
    timelineId: report.timelineId,
    evidenceIds: report.evidenceIds,
  }, signal);
}
