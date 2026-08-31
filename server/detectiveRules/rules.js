import {
  getBranchOutcome,
  getCaseSecret,
  getClueLabel,
  getNpcSecret,
  isKnownValidEdge,
} from './caseSecrets.js';

const LEGAL_ACTIONS = Object.freeze([
  'talk_to_npc', 'search_area', 'examine_clue', 'check_alibi',
  'present_evidence', 'interrogate_suspect', 'access_database',
  'analyze_forensics', 'tail_suspect', 'bribe_informant',
  'hack_terminal', 'check_cctv',
]);

const ACTION_FOCUS = Object.freeze({
  search_area: ['observation_focus'], examine_clue: ['observation_focus'],
  analyze_forensics: ['observation_focus'], check_cctv: ['observation_focus'],
  access_database: ['hack_level'], hack_terminal: ['hack_level'],
  interrogate_suspect: ['logic_power', 'confusion_resistance'],
  check_alibi: ['logic_power', 'confusion_resistance'],
  present_evidence: ['logic_power', 'confusion_resistance'],
  talk_to_npc: ['logic_power', 'confusion_resistance'],
  tail_suspect: ['observation_focus', 'confusion_resistance'],
  bribe_informant: ['confusion_resistance', 'logic_power'],
});

const CASE_PRIORITIES = Object.freeze({
  Lvl_01: ['analyze_forensics', 'check_cctv', 'access_database', 'check_alibi', 'present_evidence'],
  Lvl_02: ['access_database', 'check_cctv', 'search_area', 'check_alibi', 'examine_clue'],
  Lvl_03: ['access_database', 'interrogate_suspect', 'analyze_forensics', 'check_alibi', 'search_area'],
  Lvl_04: ['analyze_forensics', 'access_database', 'check_cctv', 'examine_clue', 'check_alibi'],
  Lvl_05: ['access_database', 'analyze_forensics', 'check_cctv', 'present_evidence', 'check_alibi'],
  Lvl_06: ['analyze_forensics', 'examine_clue', 'access_database', 'present_evidence', 'check_alibi'],
  Lvl_07: ['access_database', 'analyze_forensics', 'check_cctv', 'present_evidence', 'interrogate_suspect'],
  Lvl_08: ['access_database', 'analyze_forensics', 'check_cctv', 'present_evidence', 'check_alibi'],
});

const ACTION_COPY = Object.freeze({
  talk_to_npc: ['核对公开说法', 'CHECK PUBLIC ACCOUNT'],
  search_area: ['扫描当前区域', 'SCAN CURRENT ZONE'],
  examine_clue: ['复核证物细节', 'RE-EXAMINE EVIDENCE'],
  check_alibi: ['核查不在场证明', 'VERIFY ALIBI'],
  present_evidence: ['展示证据施压', 'PRESENT EVIDENCE'],
  interrogate_suspect: ['追问证词矛盾', 'PRESS CONTRADICTION'],
  access_database: ['检索权限数据库', 'QUERY ACCESS DATABASE'],
  analyze_forensics: ['运行法证分析', 'RUN FORENSIC ANALYSIS'],
  tail_suspect: ['追踪嫌疑人', 'TAIL SUSPECT'],
  bribe_informant: ['接触地下线人', 'CONTACT INFORMANT'],
  hack_terminal: ['突破受限终端', 'BREACH TERMINAL'],
  check_cctv: ['校验监控记录', 'VERIFY CCTV'],
});

const TOPIC_COPY = Object.freeze({
  timeline: ['还原案发时间线', 'Reconstruct the incident timeline'],
  access: ['核查区域与系统权限', 'Verify zone and system access'],
  relationship: ['追问与受害者的关系', 'Question the relationship with the victim'],
  motive: ['核查可能动机', 'Test a possible motive'],
  scene: ['询问现场所见', 'Ask what was seen at the scene'],
  alibi: ['逐段核对不在场证明', 'Check the alibi step by step'],
  evidence: ['出示已发现证据', 'Present discovered evidence'],
  contradiction: ['对峙证词矛盾', 'Confront a testimony contradiction'],
  pressure: ['要求解释关键缺口', 'Demand an explanation for the key gap'],
});

const REPORT_SPECS = Object.freeze({
  Lvl_01: reportSpec('mei', 'emp', 'revenge', '2317', 'b_wrong_kenji', {
    conclusion: ['梅林杀害了 Victor', 'Mei Lin killed Victor'], method: ['EMP 过载神经植入体', 'EMP overload of the neural implants'],
    motive: ['阻止交易并为妹妹复仇', 'Stop the deal and avenge her sister'], timeline: ['23:17 袭击，23:19 经维修井离开', 'Attack at 23:17; exit through the maintenance shaft at 23:19'],
  }),
  Lvl_02: reportSpec('aria_staged', 'phase_shift', 'expose_harlan', '0234', 'b_blame_zoe', {
    conclusion: ['Aria 自导失踪，并非谋杀', 'Aria staged her disappearance; there was no murder'], method: ['使用相位转移原型并布置诱饵', 'Use the phase-shift prototype and plant decoys'],
    motive: ['携证据逃离并揭露 Harlan', 'Escape with evidence and expose Harlan'], timeline: ['02:34 从紧急屋顶通道离开', 'Exit through the emergency roof shaft at 02:34'],
  }),
  Lvl_03: reportSpec('sable', 'overload_script', 'silence_blackmail', '0120', 'b_blame_ren', {
    conclusion: ['Sable 杀害了 Riku', 'Sable killed Riku'], method: ['用定制过载脚本绕过安全锁', 'Bypass the safety lock with a custom overload script'],
    motive: ['掩盖神经芯片走私和勒索', 'Hide the neural-chip smuggling and blackmail'], timeline: ['01:20 进入后室实施行动', 'Enter the back room and act at 01:20'],
  }),
  Lvl_04: reportSpec('elias', 'drone_nitrogen', 'model_sale', 'dawn_audit', 'b_blame_mira', {
    conclusion: ['Elias Venn 杀害了 Noor', 'Elias Venn killed Noor'], method: ['操控 D-4 无人机与液氮旁路', 'Use the D-4 drone and liquid-nitrogen bypass'],
    motive: ['掩盖极地预测模型交易', 'Conceal the polar prediction-model sale'], timeline: ['在黎明审计前制造事故假象', 'Stage the accident before the dawn audit'],
  }),
  Lvl_05: reportSpec('rook', 'depressurization', 'weapons_route', 'camera_loop', 'b_blame_ivo', {
    conclusion: ['Cassian Rook 杀害了 Jonah', 'Cassian Rook killed Jonah'], method: ['远程开启救生舱诊断阀并伪造命令', 'Open the lifeboat diagnostic valve and forge the order'],
    motive: ['保护武器级货物走私路线', 'Protect the weapons-grade cargo route'], timeline: ['利用循环监控掩护货柜转移', 'Use looped footage to hide the container transfer'],
  }),
  Lvl_06: reportSpec('tessa', 'pedestal_poison', 'forgery_sale', 'maintenance_window', 'b_blame_pavel', {
    conclusion: ['Tessa Vale 杀害了 Mara', 'Tessa Vale killed Mara'], method: ['用展台机械臂和毒性纳米纤维', 'Use the pedestal arm and toxic nanofibers'],
    motive: ['掩盖赝品并出售真品', 'Hide the forgery and sell the original'], timeline: ['在展台维护窗口完成调包和投毒', 'Swap the work and poison Mara during the maintenance window'],
  }),
  Lvl_07: reportSpec('neris', 'remote_pressure', 'illegal_sampling', 'sonar_loop', 'b_blame_sana', {
    conclusion: ['Neris Quill 杀害了 Oren', 'Neris Quill killed Oren'], method: ['远程提高潜水钟压力并循环声呐', 'Remotely raise bell pressure and loop the sonar'],
    motive: ['掩盖保护生物非法采样', 'Conceal illegal sampling of protected organisms'], timeline: ['先伪造声呐时间线，再清除上行日志', 'Forge the sonar timeline, then erase the uplink log'],
  }),
  Lvl_08: reportSpec('lucan', 'inert_gas', 'protect_trial', 'silent_mode', 'b_blame_tomas', {
    conclusion: ['Lucan Veil 杀害了 Amara', 'Lucan Veil killed Amara'], method: ['静默演示模式下注入惰性气体', 'Inject inert gas during silent presentation mode'],
    motive: ['保护秘密情绪引导试验和咨询收益', 'Protect the covert guidance trial and consultancy profit'], timeline: ['复制徽章后关闭空气警报并删除风险路径', 'Copy the badge, disable the air alarm, and delete risk paths'],
  }),
});

function reportSpec(conclusion, method, motive, timeline, wrongBranch, copy) {
  return { conclusion, method, motive, timeline, wrongBranch, copy };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

export function stableRuleHash(value) {
  let hash = 2166136261;
  for (const char of String(value ?? '')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function language(payload) {
  return payload?.lang === 'en' ? 'en' : 'zh';
}

function uniqueStrings(value, max = 64) {
  return [...new Set((Array.isArray(value) ? value : []).filter(item => typeof item === 'string').map(item => item.slice(0, 80)))].slice(0, max);
}

function stableShuffle(items, seed) {
  return [...items]
    .map((item, index) => ({ item, order: stableRuleHash(`${seed}:${index}:${item?.id || item?.optionId || item?.questionId || ''}`) }))
    .sort((a, b) => a.order - b.order)
    .map(entry => entry.item);
}

function safeTeam(value) {
  return (Array.isArray(value) ? value : []).slice(0, 3).map((agent, index) => ({
    agentId: String(agent?.agentId || agent?.agent_id || `AGENT-${index + 1}`).slice(0, 64),
    logic_power: clamp(agent?.logicPower ?? agent?.logic_power, 0, 40),
    observation_focus: clamp(agent?.observationFocus ?? agent?.observation_focus, 0, 40),
    hack_level: clamp(agent?.hackLevel ?? agent?.hack_level, 0, 40),
    confusion_resistance: clamp(agent?.confusionResistance ?? agent?.confusion_resistance, 0, 40),
    interrogation_bonus: clamp(agent?.interrogationBonus ?? agent?.interrogation_bonus, 0, 0.8),
  })).filter(agent => agent.agentId);
}

function focusFor(actionTag) {
  return ACTION_FOCUS[actionTag] || ['logic_power'];
}

export function calculateExpertise(agent, actionTag) {
  const keys = focusFor(actionTag);
  const raw = keys.reduce((sum, key, index) => sum + clamp(agent?.[key], 0, 40) * (index === 0 ? 0.72 : 0.28), 0);
  return clamp(Math.round((raw / 40) * 100), 0, 100);
}

function confidence(expertise) {
  return expertise >= 75 ? 'high' : expertise >= 45 ? 'medium' : 'low';
}

function estimateAlignment(actualAlignment, expertise, seed, errorReduction = 0) {
  const maxError = Math.max(0, Math.round((100 - expertise) * 0.20 * (1 - clamp(errorReduction, 0, 0.8))));
  if (!maxError) return clamp(actualAlignment, 5, 95);
  const span = (maxError * 2) + 1;
  const error = (stableRuleHash(seed) % span) - maxError;
  return clamp(Math.round(actualAlignment + error), 5, 95);
}

function actualActionAlignment(caseId, actionTag, payload) {
  const priorities = CASE_PRIORITIES[caseId] || CASE_PRIORITIES.Lvl_01;
  const priorityIndex = priorities.indexOf(actionTag);
  let value = priorityIndex >= 0 ? 92 - (priorityIndex * 9) : 42 + (stableRuleHash(`${caseId}:${actionTag}`) % 17);
  const recent = uniqueStrings(payload?.recentActionTags, 8);
  const repetitions = recent.filter(item => item === actionTag).length;
  value -= repetitions * 14;
  if ((Number(payload?.actionPoints) || 0) <= 5 && ['hack_terminal', 'interrogate_suspect'].includes(actionTag)) value -= 8;
  if ((Number(payload?.confusion) || 0) >= 60 && ['bribe_informant', 'interrogate_suspect'].includes(actionTag)) value -= 10;
  return clamp(value, 15, 96);
}

function pickActionSet(caseId, agent, payload) {
  const candidates = LEGAL_ACTIONS.map(actionTag => ({
    actionTag,
    actual: actualActionAlignment(caseId, actionTag, payload),
    expertise: calculateExpertise(agent, actionTag),
  })).sort((a, b) => (b.actual + (b.expertise * 0.18)) - (a.actual + (a.expertise * 0.18)));
  const broadExpertise = Math.max(...candidates.map(item => item.expertise));
  if (broadExpertise >= 90) return candidates.slice(0, 3);
  if (broadExpertise >= 70) return [candidates[0], candidates[1], candidates[Math.min(5, candidates.length - 1)]];
  if (broadExpertise >= 40) return [candidates[0], candidates[3], candidates[5]];
  return [candidates[0], candidates[Math.floor(candidates.length / 2)], candidates[candidates.length - 2]];
}

// Server-module diagnostic used by automated tests. This is never exposed by
// runDetectiveRule, so actual alignment values cannot enter a client response.
export function inspectDecisionCandidates(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const team = safeTeam(payload.team);
  return team.map(agent => ({
    agentId: agent.agentId,
    candidates: pickActionSet(caseId, agent, payload).map(item => ({
      actionTag: item.actionTag,
      actualAlignment: item.actual,
      expertise: item.expertise,
    })),
  }));
}

export function buildDecisionPacks(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  if (!getCaseSecret(caseId)) throw ruleError('UNKNOWN_CASE');
  const lang = language(payload);
  const team = safeTeam(payload.team);
  if (!team.length) throw ruleError('INVALID_TEAM');
  const packs = {};
  team.forEach(agent => {
    const selected = stableShuffle(
      pickActionSet(caseId, agent, payload),
      `${payload.runId || payload.run_id}:${caseId}:${payload.turn}:${agent.agentId}:decision-order`,
    );
    const cards = selected.map((candidate, index) => {
      const expertise = calculateExpertise(agent, candidate.actionTag);
      const estimatedAlignment = estimateAlignment(
        candidate.actual,
        expertise,
        `${payload.runId || payload.run_id}:${caseId}:${payload.turn}:${agent.agentId}:${candidate.actionTag}`,
      );
      const risk = candidate.actual >= 78 ? 'low' : candidate.actual >= 52 ? 'medium' : 'high';
      const style = risk === 'low' ? 'steady' : risk === 'high' ? 'aggressive' : 'deceptive';
      const focusAttribute = focusFor(candidate.actionTag).join('+');
      return {
        optionId: `decision:${caseId}:${payload.turn || 0}:${agent.agentId}:${candidate.actionTag}`,
        actionTag: candidate.actionTag,
        action_tag: candidate.actionTag,
        style,
        risk_level: risk,
        label: ACTION_COPY[candidate.actionTag][lang === 'en' ? 1 : 0],
        benefit: lang === 'en' ? 'Tests a public lead using a legal investigation path.' : '通过合法调查路径验证一条公开线索。',
        benefit_desc: lang === 'en' ? 'Tests a public lead using a legal investigation path.' : '通过合法调查路径验证一条公开线索。',
        risk: lang === 'en' ? 'A weak match may consume AP without producing evidence.' : '能力匹配较弱时可能消耗 AP 而没有新证据。',
        risk_desc: lang === 'en' ? 'A weak match may consume AP without producing evidence.' : '能力匹配较弱时可能消耗 AP 而没有新证据。',
        estimatedAlignment,
        confidence: confidence(expertise),
        focusAttribute,
      };
    });
    const packExpertise = Math.round(cards.reduce((sum, card) => sum + calculateExpertise(agent, card.actionTag), 0) / cards.length);
    packs[agent.agentId] = { expertise: packExpertise, confidence: confidence(packExpertise), cards, source: 'rules' };
  });
  return { packs, source: 'rules' };
}

function interrogationExpertise(agent) {
  const base = calculateExpertise(agent, 'interrogate_suspect');
  return clamp(base + Math.round((agent.interrogation_bonus || 0) * 12), 0, 100);
}

function buildQuestionCandidates(caseId, npcId, unlockedClueIds, askedQuestionIds) {
  const known = new Set(unlockedClueIds);
  const asked = new Set(askedQuestionIds);
  const topics = ['timeline', 'access', 'relationship', 'motive', 'scene', 'alibi'];
  const candidates = topics.map((topic, index) => ({
    questionId: `question:${caseId}:${npcId}:${topic}`,
    topicId: topic,
    actual: 82 - (index * 7) + (stableRuleHash(`${caseId}:${npcId}:${topic}`) % 9),
    requiredClueIds: [],
    tone: topic === 'motive' ? 'firm' : 'calm',
  }));
  [...known].slice(-3).forEach((clueId, index) => candidates.push({
    questionId: `question:${caseId}:${npcId}:evidence:${clueId}`,
    topicId: index === 0 ? 'contradiction' : 'evidence',
    actual: 91 - index,
    requiredClueIds: [clueId],
    tone: 'evidence',
  }));
  return candidates.map(item => ({ ...item, actual: item.actual - (asked.has(item.questionId) ? 24 : 0) }));
}

export function buildInterrogationPacks(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const npcId = String(payload.npcId || payload.npc_id || '').slice(0, 64);
  const npc = getNpcSecret(caseId, npcId);
  if (!npc) throw ruleError('UNKNOWN_NPC');
  const lang = language(payload);
  const team = safeTeam(payload.team);
  if (!team.length) throw ruleError('INVALID_TEAM');
  const unlocked = uniqueStrings(payload.unlockedClueIds || payload.known_clue_ids);
  const asked = uniqueStrings(payload.askedQuestionIds || payload.asked_question_ids);
  const all = buildQuestionCandidates(caseId, npcId, unlocked, asked).sort((a, b) => b.actual - a.actual);
  const packs = {};
  team.forEach(agent => {
    const expertise = interrogationExpertise(agent);
    const selectedByQuality = expertise >= 90 ? all.slice(0, 3)
      : expertise >= 70 ? [all[0], all[1], all[4]]
      : expertise >= 40 ? [all[0], all[3], all[5]]
      : [all[0], all[Math.floor(all.length / 2)], all[all.length - 1]];
    const selected = stableShuffle(
      selectedByQuality.filter(Boolean),
      `${payload.runId || payload.run_id}:${caseId}:${payload.turn}:${npcId}:${agent.agentId}:question-order`,
    );
    packs[agent.agentId] = {
      expertise,
      confidence: confidence(expertise),
      questions: selected.map(item => ({
        questionId: item.questionId,
        topicId: item.topicId,
        text: questionText(item, npc, lang),
        tone: item.tone,
        estimatedAlignment: estimateAlignment(item.actual, expertise, `${payload.runId || payload.run_id}:${item.questionId}:${agent.agentId}`, agent.interrogation_bonus),
        confidence: confidence(expertise),
        focusAttribute: 'logic_power+confusion_resistance',
        requiredClueIds: item.requiredClueIds,
        repeated: asked.includes(item.questionId),
      })),
      source: 'rules',
    };
  });
  return { npc: { npcId, name: npc.name, role: npc.role }, packs, source: 'rules' };
}

function questionText(question, npc, lang) {
  const base = TOPIC_COPY[question.topicId] || TOPIC_COPY.scene;
  const clueLabel = question.requiredClueIds?.[0] ? getClueLabel(question.questionId.split(':')[1], question.requiredClueIds[0]) : '';
  if (lang === 'en') return `${npc.name}: ${base[1]}${clueLabel ? ` — explain “${clueLabel}”.` : '.'}`;
  return `${npc.name}：${base[0]}${clueLabel ? `——请解释「${clueLabel}」。` : '。'}`;
}

export function resolveInterrogation(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const npcId = String(payload.npcId || payload.npc_id || '').slice(0, 64);
  const questionId = String(payload.questionId || payload.question_id || '').slice(0, 180);
  const secret = getCaseSecret(caseId);
  const npc = getNpcSecret(caseId, npcId);
  if (!npc || !questionId.startsWith(`question:${caseId}:${npcId}:`)) throw ruleError('INVALID_QUESTION');
  const team = safeTeam(payload.team);
  const executorAgentId = String(payload.executorAgentId || payload.executor_agent_id || '').slice(0, 64);
  if (!team.length || !team.some(agent => agent.agentId === executorAgentId)) throw ruleError('INVALID_TEAM');
  const lang = language(payload);
  const unlocked = uniqueStrings(payload.unlockedClueIds || payload.known_clue_ids);
  const asked = uniqueStrings(payload.askedQuestionIds || payload.asked_question_ids);
  const candidate = buildQuestionCandidates(caseId, npcId, unlocked, asked).find(item => item.questionId === questionId);
  if (!candidate) throw ruleError('STALE_OPTIONS');
  if (candidate.requiredClueIds.some(id => !unlocked.includes(id))) throw ruleError('QUESTION_LOCKED');
  const repeated = asked.includes(questionId);
  const emotion = ['calm', 'shaken', 'broken'].includes(payload.emotionLevel || payload.emotion_level)
    ? (payload.emotionLevel || payload.emotion_level)
    : 'calm';
  const effective = candidate.actual - (repeated ? 24 : 0);
  const strong = effective >= 72;
  const evidencePressure = candidate.requiredClueIds.length > 0;
  const nextEmotion = strong && (evidencePressure || emotion === 'shaken') ? 'broken' : strong ? 'shaken' : emotion;
  const response = interrogationResponse(npc, candidate.topicId, emotion, nextEmotion, repeated, lang);
  const revealCandidates = [...new Set((secret?.validEdges || []).flat())]
    .filter(clueId => !unlocked.includes(clueId) && !clueId.includes('_secret_'));
  const revealedClueIds = nextEmotion === 'broken' && evidencePressure && !repeated && revealCandidates.length
    ? [revealCandidates[stableRuleHash(`${caseId}:${npcId}:${questionId}:testimony`) % revealCandidates.length]]
    : [];
  return {
    response,
    npc_name: npc.name,
    emotionShift: nextEmotion === emotion ? 0 : 1,
    emotion_shift: nextEmotion === emotion ? 0 : 1,
    nextEmotion,
    revealedClueIds,
    cooperationChange: repeated ? -1 : strong ? 1 : 0,
    repeated,
    consequence: !strong && candidate.tone === 'firm' ? { confusionIncrease: 2 } : null,
  };
}

function interrogationResponse(npc, topic, previousEmotion, nextEmotion, repeated, lang) {
  if (repeated) return lang === 'en' ? `“I already answered that. Repeating it does not change the record.”` : '“我已经回答过了。重复提问不会改变记录。”';
  if (nextEmotion === 'broken') {
    return lang === 'en'
      ? `The composure breaks. ${npc.motive}`
      : `对方的镇定终于崩解。${translateMotive(npc.motive)}`;
  }
  if (nextEmotion === 'shaken') {
    return lang === 'en'
      ? `“That record is incomplete.” ${npc.name} hesitates, then admits the ${topic} account contains a gap that needs verification.`
      : `“那份记录并不完整。”${npc.name}短暂停顿，承认关于${TOPIC_COPY[topic]?.[0] || '该问题'}的说法存在需要核验的缺口。`;
  }
  return lang === 'en'
    ? `“My public statement stands.” ${npc.publicPersona}`
    : `“我的公开说法没有改变。”${npc.name}仍维持原有陈述，并要求你先拿出可验证的证据。`;
}

function translateMotive(motive) {
  const first = String(motive || '').split(/[.!?]/)[0];
  return first ? `其承认先前隐瞒的动机与案件核心利益有关，但仍需用证据链写入报告。` : '其承认先前隐瞒了关键动机。';
}

export function checkLink(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const clueAId = String(payload.clueAId || payload.clue_a_id || '').slice(0, 80);
  const clueBId = String(payload.clueBId || payload.clue_b_id || '').slice(0, 80);
  if (!getClueLabel(caseId, clueAId) || !getClueLabel(caseId, clueBId) || clueAId === clueBId) throw ruleError('INVALID_CLUES');
  const lang = language(payload);
  const isValid = isKnownValidEdge(caseId, clueAId, clueBId, payload.synergyActive === true || payload.synergy_active === true);
  const a = getClueLabel(caseId, clueAId);
  const b = getClueLabel(caseId, clueBId);
  const reveal = isValid
    ? (lang === 'en' ? `“${a}” and “${b}” reinforce the same access, time, or physical-causality chain.` : `「${a}」与「${b}」共同指向同一条权限、时间或物理因果链。`)
    : (lang === 'en' ? 'The two records do not yet share a verifiable causal link.' : '这两份记录目前没有可验证的共同因果关系。');
  return {
    isValid, is_valid: isValid, reveal,
    isCoreLink: isValid,
    is_core_link: isValid,
    cinematic: isValid ? { narrative: reveal, villain_memory: '', new_clue_hint: '' } : null,
    hiddenEndingProgress: isValid ? Math.max(1, Number(payload.fragmentsFound || payload.fragments_found) + 1) : Number(payload.fragmentsFound || payload.fragments_found) || 0,
    hidden_ending_progress: isValid ? Math.max(1, Number(payload.fragmentsFound || payload.fragments_found) + 1) : Number(payload.fragmentsFound || payload.fragments_found) || 0,
  };
}

function publicOption(id, label, lang) {
  return { id, label: Array.isArray(label) ? label[lang === 'en' ? 1 : 0] : label };
}

export function buildReportOptions(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const secret = getCaseSecret(caseId);
  const spec = REPORT_SPECS[caseId];
  if (!secret || !spec) throw ruleError('UNKNOWN_CASE');
  const lang = language(payload);
  const npcOptions = Object.entries(secret.npcs).map(([npcId, npc]) => publicOption(`suspect:${npcId}`, [
    `${npc.name} 是主要责任人`, `${npc.name} is the principal culprit`,
  ], lang));
  const conclusions = [publicOption(`conclusion:${spec.conclusion}`, spec.copy.conclusion, lang), ...npcOptions,
    publicOption('conclusion:accident', ['纯粹事故或系统故障', 'A pure accident or system failure'], lang),
  ].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
  const seed = `${payload.runId || payload.run_id}:${caseId}:report`;
  return {
    conclusions: stableShuffle(conclusions, `${seed}:conclusion`),
    methods: stableShuffle([
      publicOption(`method:${spec.method}`, spec.copy.method, lang),
      publicOption('method:physical_assault', ['直接物理袭击', 'Direct physical assault'], lang),
      publicOption('method:network_only', ['纯网络入侵', 'Network intrusion alone'], lang),
    ], `${seed}:method`),
    motives: stableShuffle([
      publicOption(`motive:${spec.motive}`, spec.copy.motive, lang),
      publicOption('motive:personal_dispute', ['普通私人争执', 'An ordinary personal dispute'], lang),
      publicOption('motive:random', ['无明确动机', 'No clear motive'], lang),
    ], `${seed}:motive`),
    timelines: stableShuffle([
      publicOption(`timeline:${spec.timeline}`, spec.copy.timeline, lang),
      publicOption('timeline:public_record', ['完全按照公开记录发生', 'Exactly as the public record states'], lang),
      publicOption('timeline:unknown', ['时间线仍无法确定', 'The timeline remains unresolved'], lang),
    ], `${seed}:timeline`),
    availableEvidence: uniqueStrings(payload.unlockedClueIds || payload.unlocked_clue_ids)
      .filter(id => getClueLabel(caseId, id))
      .map(id => ({ id, label: getClueLabel(caseId, id) })),
  };
}

export function judgeReport(payload = {}) {
  const caseId = String(payload.caseId || payload.case_id || '').slice(0, 64);
  const secret = getCaseSecret(caseId);
  const spec = REPORT_SPECS[caseId];
  if (!secret || !spec) throw ruleError('UNKNOWN_CASE');
  const lang = language(payload);
  const conclusionId = String(payload.conclusionId || payload.conclusion_id || '');
  const methodId = String(payload.methodId || payload.method_id || '');
  const motiveId = String(payload.motiveId || payload.motive_id || '');
  const timelineId = String(payload.timelineId || payload.timeline_id || '');
  const evidenceIds = uniqueStrings(payload.evidenceIds || payload.evidence_ids, 4).filter(id => getClueLabel(caseId, id));
  const knownEvidence = new Set(uniqueStrings(payload.unlockedClueIds || payload.unlocked_clue_ids));
  if (evidenceIds.some(id => !knownEvidence.has(id))) throw ruleError('INVALID_EVIDENCE');
  const legalOptions = buildReportOptions(payload);
  const legalChoice = (collection, id) => collection.some(item => item.id === id);
  if (!legalChoice(legalOptions.conclusions, conclusionId)
    || !legalChoice(legalOptions.methods, methodId)
    || !legalChoice(legalOptions.motives, motiveId)
    || !legalChoice(legalOptions.timelines, timelineId)) {
    throw ruleError('INVALID_REPORT_OPTION');
  }
  const validEvidence = new Set(secret.validEdges.flat());
  const evidenceScore = evidenceIds.filter(id => validEvidence.has(id)).length;
  const conclusionCorrect = conclusionId === `conclusion:${spec.conclusion}`;
  const methodCorrect = methodId === `method:${spec.method}`;
  const motiveCorrect = motiveId === `motive:${spec.motive}`;
  const timelineCorrect = timelineId === `timeline:${spec.timeline}`;
  let score = 'D';
  if (conclusionCorrect && methodCorrect && motiveCorrect && timelineCorrect && evidenceScore >= 3) score = 'S';
  else if (conclusionCorrect && (methodCorrect || motiveCorrect) && evidenceScore >= 2) score = 'A';
  else if (conclusionCorrect && evidenceScore >= 2) score = 'B';
  else if (conclusionCorrect && evidenceScore >= 1) score = 'C';
  const isPassed = score !== 'D';
  const critique = isPassed
    ? (lang === 'en' ? `The central conclusion is supported by ${evidenceScore} valid evidence item${evidenceScore === 1 ? '' : 's'}.` : `核心结论成立，并获得 ${evidenceScore} 条有效证据支持。`)
    : (lang === 'en' ? 'The central conclusion does not match the protected case record; preserve more evidence and revise the report.' : '核心结论与受保护的案件记录不符，请保全更多证据后重新提交。');
  const branch = !isPassed ? getBranchOutcome(caseId, spec.wrongBranch, lang) : null;
  return {
    score, isPassed, is_passed: isPassed, critique,
    branch: branch ? { is_absurd: true, ...branch } : { is_absurd: false, branch_id: null },
  };
}

function ruleError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export function runDetectiveRule(task, payload = {}) {
  switch (task) {
    case 'decision_options': return buildDecisionPacks(payload);
    case 'interrogation_options': return buildInterrogationPacks(payload);
    case 'interrogation_resolve': return resolveInterrogation(payload);
    case 'link_check': return checkLink(payload);
    case 'link_cinematic': {
      const result = checkLink(payload);
      return { ...(result.cinematic || {}), ...result };
    }
    case 'report_options': return buildReportOptions(payload);
    case 'report_judge': return judgeReport(payload);
    default: throw ruleError('UNKNOWN_TASK');
  }
}
