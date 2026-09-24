// Tactical rehearsal is a local, public-information-only simulation.
// It intentionally has no connection to player profile, stamina, rewards, or
// case conclusions. The lobby can rebuild it whenever the formation changes.

import { ATTR_MAX } from './specialtySystem.js';
import { CASE_NEON_BLOOD, buildCaseMatchReadout, calcCaseMatchScore, getCaseMatchConfig } from './casePresets.js';

const MAX_ATTRIBUTE = 40;
const ATTRIBUTE_LABELS = Object.freeze({
  logic_power: { zh: '逻辑推演', en: 'logic reasoning' },
  observation_focus: { zh: '现场观察', en: 'scene observation' },
  confusion_resistance: { zh: '抗干扰', en: 'disruption resistance' },
  hack_level: { zh: '黑客渗透', en: 'technical intrusion' },
  ap_cost_discount: { zh: '行动效率', en: 'action efficiency' },
});

const ATTRIBUTE_ACTIONS = Object.freeze({
  logic_power: { zh: '逻辑复原', en: 'logic reconstruction' },
  observation_focus: { zh: '现场重建', en: 'scene reconstruction' },
  confusion_resistance: { zh: '冲突降噪', en: 'conflict stabilization' },
  hack_level: { zh: '终端封锁', en: 'terminal lockdown' },
  ap_cost_discount: { zh: '快速调度', en: 'rapid dispatch' },
});

const ACTION_LABELS = Object.freeze({
  reconstruct_timeline: { zh: '逻辑复原', en: 'LOGIC RECONSTRUCTION' },
  observe_scene: { zh: '现场观察', en: 'SCENE OBSERVATION' },
  restore_surveillance: { zh: '技术入侵', en: 'TECHNICAL INTRUSION' },
  cross_examine: { zh: '逻辑交叉', en: 'LOGIC CROSS-CHECK' },
  capture_detail: { zh: '细节捕捉', en: 'DETAIL CAPTURE' },
  stabilize_interview: { zh: '抗干扰审讯', en: 'NOISE-RESISTANT INTERVIEW' },
  isolate_anomaly: { zh: '异常隔离', en: 'ANOMALY ISOLATION' },
  forensic_screen: { zh: '法证筛选', en: 'FORENSIC SCREENING' },
  lock_terminal: { zh: '黑客封锁', en: 'HACKER LOCKDOWN' },
});

const FIT_LABELS = Object.freeze({
  strong: { zh: '优势处理', en: 'STRONG FIT' },
  balanced: { zh: '可控处理', en: 'CONTROLLED FIT' },
  strained: { zh: '高压处理', en: 'STRAINED FIT' },
});

const SCENE_DEFINITIONS = [
  {
    id: 'surveillance_gap',
    title: '监控缺失',
    titleEn: 'SURVEILLANCE GAP',
    brief: '案发时段的监控信号被切断。先决定由谁建立一条可用的现场视角。',
    briefEn: 'The surveillance feed drops during the incident window. Choose who establishes a usable view of the scene.',
    durationSeconds: 15,
    options: [
      {
        id: 'reconstruct_timeline',
        agentSlot: 0,
        actionId: 'check_alibi',
        focus: { logic_power: 0.72, confusion_resistance: 0.28 },
        effect: '按时间顺序复原监控断点，缩小事件的解释空间。',
        effectEn: 'Reconstructs the missing timeline and narrows the space of plausible explanations.',
        risk: '时间线仍依赖现场记录，遇到噪声时需要二次核对。',
        riskEn: 'The timeline still depends on scene records and needs a second check under noisy conditions.',
      },
      {
        id: 'observe_scene',
        agentSlot: 1,
        actionId: 'search_area',
        focus: { observation_focus: 0.78, logic_power: 0.22 },
        effect: '从现场残留建立观察锚点，补回被监控遗漏的细节。',
        effectEn: 'Builds observation anchors from scene residue and recovers details missed by the feed.',
        risk: '现场信息量较大，若判断过快会增加筛选成本。',
        riskEn: 'The scene is information-dense; moving too quickly increases filtering cost.',
      },
      {
        id: 'restore_surveillance',
        agentSlot: 2,
        actionId: 'hack_terminal',
        focus: { hack_level: 0.82, logic_power: 0.18 },
        effect: '从终端残片重建信号路径，快速恢复一段可读记录。',
        effectEn: 'Rebuilds the signal path from terminal fragments and quickly restores a readable segment.',
        risk: '残留协议可能继续反制，处理失败会暴露更多系统噪声。',
        riskEn: 'Residual protocols may push back; a failed attempt exposes more system noise.',
      },
    ],
  },
  {
    id: 'testimony_conflict',
    title: '证人口供冲突',
    titleEn: 'TESTIMONY CONFLICT',
    brief: '两份口供在关键时间点互相冲突。选择先稳定情绪、核对细节，还是直接拆解逻辑链。',
    briefEn: 'Two statements conflict on a critical time point. Stabilize, verify details, or break down the logic chain first.',
    durationSeconds: 15,
    options: [
      {
        id: 'cross_examine',
        agentSlot: 0,
        actionId: 'interrogate_suspect',
        focus: { logic_power: 0.62, confusion_resistance: 0.38 },
        effect: '把矛盾拆成可验证的前提，减少口供之间的跳跃。',
        effectEn: 'Breaks the contradiction into verifiable premises and reduces jumps between statements.',
        risk: '追问压力较高，证人可能转入防御状态。',
        riskEn: 'The questioning pressure is high and the witness may become defensive.',
      },
      {
        id: 'capture_detail',
        agentSlot: 1,
        actionId: 'examine_clue',
        focus: { observation_focus: 0.52, confusion_resistance: 0.48 },
        effect: '捕捉措辞和细节差异，把模糊口供转成可比记录。',
        effectEn: 'Captures wording and detail differences, turning vague statements into comparable records.',
        risk: '需要较多交叉记录，推进速度会慢一些。',
        riskEn: 'More cross-referencing is required, so the pace is slower.',
      },
      {
        id: 'stabilize_interview',
        agentSlot: 2,
        actionId: 'interrogate_suspect',
        focus: { confusion_resistance: 0.72, hack_level: 0.28 },
        effect: '先压低对话噪声，再提取一致的回答模式。',
        effectEn: 'Lowers conversational noise before extracting a consistent response pattern.',
        risk: '稳定优先会牺牲部分即时细节，需要后续逻辑交叉。',
        riskEn: 'Stability comes first at the cost of immediate detail; logic cross-checking follows.',
      },
    ],
  },
  {
    id: 'terminal_anomaly',
    title: '终端异常',
    titleEn: 'TERMINAL ANOMALY',
    brief: '终端出现异常回写，处理顺序会改变信息清晰度与系统稳定性。',
    briefEn: 'The terminal shows an anomalous write-back. The order of operations changes clarity and system stability.',
    durationSeconds: 15,
    options: [
      {
        id: 'isolate_anomaly',
        agentSlot: 0,
        actionId: 'check_alibi',
        focus: { logic_power: 0.55, confusion_resistance: 0.45 },
        effect: '先隔离异常分支，保留可回溯的判断路径。',
        effectEn: 'Isolates the anomalous branch first and keeps the reasoning path traceable.',
        risk: '隔离动作较稳但较慢，可能错过短暂的终端窗口。',
        riskEn: 'Isolation is steady but slower and may miss a short terminal window.',
      },
      {
        id: 'forensic_screen',
        agentSlot: 1,
        actionId: 'analyze_forensics',
        focus: { observation_focus: 0.65, logic_power: 0.35 },
        effect: '筛选回写痕迹，区分稳定记录与需要复核的噪声。',
        effectEn: 'Screens write-back traces and separates stable records from noise requiring review.',
        risk: '筛选过程会占用行动窗口，终端压力不会立即下降。',
        riskEn: 'Screening uses the action window, so terminal pressure does not fall immediately.',
      },
      {
        id: 'lock_terminal',
        agentSlot: 2,
        actionId: 'hack_terminal',
        focus: { hack_level: 0.8, confusion_resistance: 0.2 },
        effect: '封锁异常端口，快速冻结回写并保护当前记录。',
        effectEn: 'Locks the anomalous port, freezes the write-back, and protects the current record.',
        risk: '强制封锁会牺牲一部分后续可读性，需要其他探员补做筛选。',
        riskEn: 'A hard lock sacrifices some later readability and needs another agent to screen the residue.',
      },
    ],
  },
];

export const TACTICAL_SCENES = Object.freeze(SCENE_DEFINITIONS.map(scene => Object.freeze({
  ...scene,
  options: Object.freeze(scene.options.map(option => Object.freeze({
    ...option,
    focus: Object.freeze({ ...option.focus }),
  }))),
})));
export const TACTICAL_REHEARSAL_SCENES = TACTICAL_SCENES;
export const TACTICAL_EVENTS = TACTICAL_SCENES;

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, finite(value)));
}

function round(value) {
  return Math.round(finite(value));
}

function normalizeSynergySkills(value) {
  const list = Array.isArray(value) ? value : [];
  return [...new Set(list.map(item => typeof item === 'string' ? item : item?.id).filter(Boolean))];
}

function normalizeAgent(agent, index) {
  const source = agent && typeof agent === 'object' ? agent : {};
  const attrs = source.attrs && typeof source.attrs === 'object' ? source.attrs
    : source.attributes && typeof source.attributes === 'object' ? source.attributes
      : source;
  const text = (value, fallback = '') => typeof value === 'string' ? value : fallback;
  return {
    agent_id: text(source.agent_id || source.id, `SLOT-${index + 1}`),
    name: text(source.name || source.agent_id || source.id, `SLOT-${index + 1}`),
    icon: text(source.icon, '◇'),
    color: text(source.color, '#00e5ff'),
    role: text(source.role || source.roleZh),
    roleZh: text(source.roleZh || source.role),
    logic_power: clamp(attrs.logic_power, 0, ATTR_MAX.logic_power || MAX_ATTRIBUTE),
    observation_focus: clamp(attrs.observation_focus, 0, ATTR_MAX.observation_focus || MAX_ATTRIBUTE),
    confusion_resistance: clamp(attrs.confusion_resistance, 0, ATTR_MAX.confusion_resistance || MAX_ATTRIBUTE),
    hack_level: clamp(attrs.hack_level, 0, ATTR_MAX.hack_level || MAX_ATTRIBUTE),
    ap_cost_discount: clamp(attrs.ap_cost_discount, 0, ATTR_MAX.ap_cost_discount || 30),
    priority_list: Array.isArray(source.priority_list)
      ? source.priority_list.filter(value => typeof value === 'string').slice(0, 12)
      : [],
  };
}

function normalizeInput(input = {}) {
  const source = Array.isArray(input) ? { agents: input } : (input || {});
  const strategy = source.strategy && typeof source.strategy === 'object' ? source.strategy : {};
  const rawAgents = source.agents || source.team || strategy.agents || strategy.team || [];
  const agents = [0, 1, 2].map(index => normalizeAgent(rawAgents[index], index));
  const caseCandidate = source.caseConfig || strategy.caseConfig || source.caseId || strategy.target_case_id
    || source.targetCase?.case_id || strategy.targetCase?.case_id;
  const caseConfig = typeof caseCandidate === 'string'
    ? getCaseMatchConfig(caseCandidate)
    : caseCandidate && typeof caseCandidate === 'object' && caseCandidate.weights
      ? caseCandidate
      : CASE_NEON_BLOOD;
  const synergySkills = normalizeSynergySkills(
    source.synergySkills || source.synergy_skills || strategy.synergySkills || strategy.synergy_skills,
  );
  const rawCommandPlan = source.commandPlan || source.command_plan || strategy.commandPlan || strategy.command_plan || {};
  const commandPlan = {
    doctrine_id: typeof rawCommandPlan?.doctrine_id === 'string' ? rawCommandPlan.doctrine_id : null,
    contingency_id: typeof rawCommandPlan?.contingency_id === 'string' ? rawCommandPlan.contingency_id : null,
  };
  const skillEffects = source.skillEffects || source.skill_effects || strategy.skillEffects || strategy.skill_effects || {};
  return { agents, caseConfig, synergySkills, commandPlan, skillEffects };
}

function copySceneDefinitions() {
  return TACTICAL_SCENES.map(scene => ({
    ...scene,
    // Object forms keep the panel's language switch independent from the
    // caller while the plain brief fields remain convenient for tests/logs.
    eyebrow: { zh: '战术事件', en: 'TACTICAL EVENT' },
    prompt: { zh: scene.brief, en: scene.briefEn },
    description: { zh: scene.brief, en: scene.briefEn },
    options: scene.options.map(option => ({ ...option, focus: { ...option.focus } })),
  }));
}

function attributeLabel(key, lang = 'zh') {
  return ATTRIBUTE_LABELS[key]?.[lang === 'en' ? 'en' : 'zh'] || key;
}

function actionLabel(actionId, lang = 'zh') {
  return ACTION_LABELS[actionId]?.[lang === 'en' ? 'en' : 'zh'] || actionId;
}

function bestAttribute(agent, focus) {
  const contribution = key => {
    const cap = ATTR_MAX[key] || MAX_ATTRIBUTE;
    return (finite(agent?.[key]) / cap) * finite(focus?.[key]);
  };
  return Object.keys(focus).sort((a, b) => contribution(b) - contribution(a))[0] || 'logic_power';
}

function caseAlignment(focus, weights) {
  return Object.entries(focus).reduce((sum, [key, share]) => sum + finite(weights?.[key]) * finite(share), 0);
}

function synergyBonus(focus, synergySkills) {
  const skills = new Set(synergySkills);
  let value = 0;
  if (skills.has('cross_validation') && (focus.logic_power || focus.confusion_resistance)) value += 7;
  if (skills.has('digital_forensics') && (focus.hack_level || focus.observation_focus)) value += 7;
  if (skills.has('ghost_protocol') && focus.confusion_resistance) value += 6;
  return value;
}

function commandBonus(focus, commandPlan = {}) {
  const doctrine = commandPlan?.doctrine_id;
  const contingency = commandPlan?.contingency_id;
  let value = 0;
  if (doctrine === 'evidence_control' && (focus.observation_focus || focus.logic_power)) value += 4;
  if (doctrine === 'rapid_pursuit' && focus.hack_level) value += 4;
  if (doctrine === 'steady_control' && focus.confusion_resistance) value += 4;
  if (contingency === 'cognitive_stabilizer' && focus.confusion_resistance) value += 4;
  if (contingency === 'emergency_throttle' && focus.hack_level) value += 4;
  if (contingency === 'evidence_lockdown' && (focus.observation_focus || focus.logic_power)) value += 4;
  return value;
}

function priorityBonus(agent, actionId) {
  const index = agent?.priority_list?.indexOf(actionId);
  if (index === undefined || index < 0) return 0;
  return Math.max(0, 5 - index);
}

function skillEffectBonus(focus, skillEffects = {}, actionId = '') {
  // Skill-tree keys are deliberately mapped here instead of copied into the
  // rehearsal data.  This keeps the rehearsal public and lets equipped skills
  // change the handling signal without touching the formal case engine.
  const percent = key => Math.max(0, finite(skillEffects?.[key])) * 100;
  let value = 0;

  if (focus.hack_level) {
    value += percent('bonus_hack_chance');
    value += percent('hack_success_rate');
    value += percent('bonus_clue_chance') * 0.45;
    value += percent('passive_scan_chance') * 0.6;
    if (skillEffects?.free_decrypt && actionId === 'hack_terminal') value += 4;
    if (skillEffects?.zone_unlock_bonus && actionId === 'hack_terminal') value += 4;
  }
  if (focus.observation_focus) {
    value += percent('bonus_clue_chance');
    value += percent('passive_scan_chance');
  }
  if (focus.confusion_resistance) {
    value += percent('confusion_resistance');
    value += percent('npc_confusion_reduce');
    value += Math.min(8, Math.max(0, finite(skillEffects?.confusion_regen)) * 0.8);
  }
  if (actionId === 'interrogate_suspect') {
    value += percent('interrogation_bonus');
  }
  if (focus.logic_power) {
    value += percent('think_speed_boost') * 0.35;
  }

  // AP discounts apply to every simulated handling path.  No rehearsal scene
  // has a formal AP cost, so this is a small, visible tempo contribution.
  value += percent('ap_cost_discount') * 0.45;
  if (skillEffects?.trap_immunity) value += 2;
  if (skillEffects?.bsod_immunity && focus.confusion_resistance) value += 2;
  return Math.min(18, round(value));
}

function fitTier(score) {
  if (score >= 72) return 'strong';
  if (score >= 46) return 'balanced';
  return 'strained';
}

function buildOption(_scene, template, agent, index, input) {
  const focus = template.focus || {};
  const rawCapability = Object.entries(focus).reduce((sum, [key, share]) => {
    const normalized = finite(agent?.[key]) / (ATTR_MAX[key] || MAX_ATTRIBUTE);
    return sum + normalized * share;
  }, 0);
  const alignment = caseAlignment(focus, input.caseConfig.weights);
  const fitScore = clamp(round(
    rawCapability * 62
      + alignment * 15
      + synergyBonus(focus, input.synergySkills)
      + commandBonus(focus, input.commandPlan)
      + priorityBonus(agent, template.actionId)
      + skillEffectBonus(focus, input.skillEffects, template.actionId),
  ));
  const synergyContribution = synergyBonus(focus, input.synergySkills);
  const commandContribution = commandBonus(focus, input.commandPlan);
  const priorityContribution = priorityBonus(agent, template.actionId);
  const skillContribution = skillEffectBonus(focus, input.skillEffects, template.actionId);
  const tier = fitTier(fitScore);
  const primaryAttribute = bestAttribute(agent, focus);
  const primaryValue = finite(agent?.[primaryAttribute]);
  // Signed rehearsal signal: a strong public fit can reduce exposure while a
  // strained choice adds work. This never represents a formal case outcome.
  const riskDelta = round((50 - fitScore) * 0.16 + (tier === 'strained' ? 4 : tier === 'balanced' ? 1 : -2));
  const clarity = clamp(round(fitScore * 0.74 + primaryValue * 0.35));
  const stability = clamp(round((100 - riskDelta * 3) * 0.84));
  // The agent's public AP discount improves handling tempo only. At the
  // attribute cap it contributes 12 points; no AP is spent by the rehearsal.
  const efficiencyContribution = round(clamp(agent?.ap_cost_discount, 0, ATTR_MAX.ap_cost_discount)
    / ATTR_MAX.ap_cost_discount * 12);
  const tempo = clamp(round(fitScore * 0.62 + (focus.hack_level ? primaryValue * 0.4 : 0)) + efficiencyContribution);
  const action = ACTION_LABELS[template.id] || actionLabel(template.actionId);
  const capabilityAction = ATTRIBUTE_ACTIONS[primaryAttribute] || action;
  const reason = `以${attributeLabel(primaryAttribute)} ${round(primaryValue)} 的公开能力处理${capabilityAction.zh}。`
    + (efficiencyContribution ? `行动折扣 ${round(agent.ap_cost_discount)}% 提供处理节奏 +${efficiencyContribution}。` : '');
  const reasonEn = `Uses public ${attributeLabel(primaryAttribute, 'en')} ${round(primaryValue)} capability for ${capabilityAction.en}.`
    + (efficiencyContribution ? ` A ${round(agent.ap_cost_discount)}% action discount adds ${efficiencyContribution} handling tempo.` : '');
  const fit = FIT_LABELS[tier];
  return {
    id: template.id,
    optionId: template.id,
    agentSlot: index,
    agentId: agent.agent_id,
    agentName: agent.name,
    agentIcon: agent.icon,
    agentColor: agent.color,
    actionId: template.actionId,
    action: action.zh,
    actionEn: action.en,
    fitScore,
    fit: tier,
    fitLabel: fit.zh,
    fitLabelEn: fit.en,
    reason,
    reasonEn,
    effect: template.effect,
    effectEn: template.effectEn,
    risk: template.risk,
    riskEn: template.riskEn,
    riskDelta,
    impact: { clarity, stability, tempo },
    signals: {
      synergy: synergyContribution,
      command: commandContribution,
      priority: priorityContribution,
      skill: skillContribution,
      efficiency: efficiencyContribution,
    },
    primaryAttribute,
    primaryValue,
  };
}

function normalizeRehearsalState(rehearsal) {
  if (rehearsal && Array.isArray(rehearsal.scenes)) return rehearsal;
  return buildTacticalRehearsal(rehearsal || {});
}

/**
 * Build a deterministic rehearsal from the current public team configuration.
 * Accepts either { agents/team, synergy_skills, command_plan } or a strategy
 * object nested under `strategy`.
 */
export function buildTacticalRehearsal(input = {}) {
  const normalized = normalizeInput(input);
  const match = calcCaseMatchScore(normalized.agents, normalized.caseConfig, 'zh');
  const readout = buildCaseMatchReadout(normalized.agents, normalized.caseConfig, 'zh');
  const scenes = copySceneDefinitions().map(scene => ({
    ...scene,
    options: scene.options.map(template => buildOption(
      scene,
      template,
      normalized.agents[template.agentSlot],
      template.agentSlot,
      normalized,
    )),
  }));
  return {
    id: 'tactical_rehearsal',
    durationSeconds: scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    caseId: normalized.caseConfig.id,
    caseWeights: { ...(normalized.caseConfig.weights || {}) },
    agents: normalized.agents.map(agent => ({ ...agent })),
    synergySkills: [...normalized.synergySkills],
    commandPlan: { ...normalized.commandPlan },
    match: { ...match },
    matchScore: match.score,
    strengths: readout.strengths,
    risks: readout.risks,
    tradeoffs: readout.tradeoffs,
    tradeoff: readout.tradeoffs[0] || null,
    coverage: readout.coverage,
    summary: readout,
    scenes,
    choices: [],
    completedSceneIds: [],
    activeSceneId: scenes[0]?.id || null,
    progress: { completedScenes: 0, totalScenes: scenes.length },
    metrics: { clarity: 0, stability: 0, tempo: 0, risk: 0 },
    completed: false,
  };
}

export const createTacticalRehearsal = buildTacticalRehearsal;
export const getTacticalRehearsal = buildTacticalRehearsal;

export function getTacticalScenes() {
  return copySceneDefinitions();
}

export function getTacticalSummary(rehearsalOrInput = {}) {
  const rehearsal = normalizeRehearsalState(rehearsalOrInput);
  return rehearsal.summary || {
    strengths: rehearsal.strengths || [],
    risks: rehearsal.risks || [],
    tradeoffs: rehearsal.tradeoffs || [],
    coverage: rehearsal.coverage || [],
  };
}

function findChoice(rehearsal, sceneId, agentId) {
  const scene = rehearsal.scenes.find(item => item.id === sceneId);
  if (!scene) return { scene: null, option: null };
  const option = scene.options.find(item => item.agentId === agentId || item.id === agentId || item.optionId === agentId);
  return { scene, option: option || null };
}

function aggregateMetrics(choices) {
  if (!choices.length) return { clarity: 0, stability: 0, tempo: 0, risk: 0 };
  const total = choices.reduce((result, choice) => ({
    clarity: result.clarity + finite(choice.impact?.clarity),
    stability: result.stability + finite(choice.impact?.stability),
    tempo: result.tempo + finite(choice.impact?.tempo),
    risk: result.risk + finite(choice.riskDelta),
  }), { clarity: 0, stability: 0, tempo: 0, risk: 0 });
  return {
    clarity: round(total.clarity / choices.length),
    stability: round(total.stability / choices.length),
    tempo: round(total.tempo / choices.length),
    risk: round(total.risk),
  };
}

/**
 * Apply one local choice and return a new rehearsal state. Existing choices
 * for the same scene are replaced, which makes free retries predictable.
 */
export function advanceTacticalRehearsal(rehearsalOrInput, sceneId, agentId) {
  const rehearsal = normalizeRehearsalState(rehearsalOrInput);
  const { scene, option } = findChoice(rehearsal, sceneId, agentId);
  if (!scene || !option) {
    return { rehearsal, error: 'invalid_tactical_choice' };
  }
  const choice = {
    sceneId: scene.id,
    sceneTitle: scene.title,
    optionId: option.id,
    agentId: option.agentId,
    actionId: option.actionId,
    fit: option.fit,
    fitScore: option.fitScore,
    impact: { ...option.impact },
    riskDelta: option.riskDelta,
    message: option.effect,
    messageEn: option.effectEn,
    risk: option.risk,
    riskEn: option.riskEn,
    signals: { ...(option.signals || {}) },
  };
  const choices = [
    ...(Array.isArray(rehearsal.choices) ? rehearsal.choices : []).filter(item => item.sceneId !== scene.id),
    choice,
  ];
  const completedSceneIds = rehearsal.scenes
    .map(item => item.id)
    .filter(id => choices.some(item => item.sceneId === id));
  const nextScene = rehearsal.scenes.find(item => !completedSceneIds.includes(item.id));
  const completed = completedSceneIds.length === rehearsal.scenes.length;
  const metrics = aggregateMetrics(choices);
  return {
    ...rehearsal,
    choices,
    completedSceneIds,
    activeSceneId: nextScene?.id || null,
    progress: { completedScenes: completedSceneIds.length, totalScenes: rehearsal.scenes.length },
    metrics,
    completed,
    lastChoice: choice,
    outcome: completed ? {
      label: '战术试演完成',
      labelEn: 'TACTICAL REHEARSAL COMPLETE',
      summary: `清晰度 ${metrics.clarity} · 稳定度 ${metrics.stability} · 风险 ${metrics.risk}`,
      summaryEn: `Clarity ${metrics.clarity} · Stability ${metrics.stability} · Risk ${metrics.risk}`,
    } : null,
  };
}

export const applyTacticalChoice = advanceTacticalRehearsal;
export const rehearseTacticalChoice = advanceTacticalRehearsal;
export const runTacticalChoice = advanceTacticalRehearsal;

/** Resolve one option without requiring the caller to inspect the whole state. */
export function resolveTacticalChoice(rehearsalOrInput, sceneId, agentId) {
  const state = advanceTacticalRehearsal(rehearsalOrInput, sceneId, agentId);
  if (state.error) return state;
  return {
    ...state.lastChoice,
    sceneId,
    nextSceneId: state.activeSceneId,
    completed: state.completed,
    progress: state.progress,
    metrics: state.metrics,
    rehearsal: state,
  };
}
