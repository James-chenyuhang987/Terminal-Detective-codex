const TEMPLATE_BY_ACTION = Object.freeze({
  search_area: 'investigation',
  examine_clue: 'investigation',
  analyze_forensics: 'investigation',
  access_database: 'digital',
  hack_terminal: 'digital',
  check_cctv: 'digital',
  talk_to_npc: 'interview',
  interrogate_suspect: 'interview',
  check_alibi: 'interview',
  present_evidence: 'confrontation',
  tail_suspect: 'pursuit',
  bribe_informant: 'covert',
});

export const ACTION_CINEMATIC_ANIMATIONS = Object.freeze({
  search_area: Object.freeze({ animationId: 'scan-sweep', cameraProfile: 'survey', motionProfile: 'sweep' }),
  examine_clue: Object.freeze({ animationId: 'evidence-orbit', cameraProfile: 'macro', motionProfile: 'orbit' }),
  analyze_forensics: Object.freeze({ animationId: 'spectral-rebuild', cameraProfile: 'laboratory', motionProfile: 'assemble' }),
  access_database: Object.freeze({ animationId: 'data-tunnel', cameraProfile: 'tunnel', motionProfile: 'stream' }),
  hack_terminal: Object.freeze({ animationId: 'firewall-breach', cameraProfile: 'breach', motionProfile: 'impact' }),
  check_cctv: Object.freeze({ animationId: 'camera-matrix', cameraProfile: 'wall', motionProfile: 'scan' }),
  talk_to_npc: Object.freeze({ animationId: 'dialogue-pulse', cameraProfile: 'portrait', motionProfile: 'pulse' }),
  interrogate_suspect: Object.freeze({ animationId: 'pressure-focus', cameraProfile: 'close', motionProfile: 'pressure' }),
  check_alibi: Object.freeze({ animationId: 'timeline-split', cameraProfile: 'timeline', motionProfile: 'split' }),
  present_evidence: Object.freeze({ animationId: 'evidence-impact', cameraProfile: 'table', motionProfile: 'reveal' }),
  tail_suspect: Object.freeze({ animationId: 'lane-chase', cameraProfile: 'pursuit', motionProfile: 'chase' }),
  bribe_informant: Object.freeze({ animationId: 'dead-drop', cameraProfile: 'covert', motionProfile: 'exchange' }),
});

export const CINEMATIC_ANIMATION_IDS = Object.freeze(
  Object.values(ACTION_CINEMATIC_ANIMATIONS).map(profile => profile.animationId),
);

const OUTCOME_ACCENTS = Object.freeze({
  trap: '#ff3860',
  clue: '#45ffc0',
  progress: '#00e5ff',
  no_yield: '#f2b84b',
});

export const CINEMATIC_OUTCOME_EFFECTS = Object.freeze({
  trap: 'hazard-collapse',
  clue: 'evidence-lock',
  progress: 'signal-advance',
  no_yield: 'trace-dissolve',
});

const ACTION_LABELS = Object.freeze({
  search_area: { zh: '区域搜索', en: 'AREA SEARCH' },
  examine_clue: { zh: '线索检验', en: 'CLUE EXAMINATION' },
  analyze_forensics: { zh: '法证分析', en: 'FORENSIC ANALYSIS' },
  access_database: { zh: '访问数据库', en: 'DATABASE ACCESS' },
  hack_terminal: { zh: '终端入侵', en: 'TERMINAL BREACH' },
  check_cctv: { zh: '监控检索', en: 'CCTV REVIEW' },
  talk_to_npc: { zh: '现场问询', en: 'FIELD INTERVIEW' },
  interrogate_suspect: { zh: '嫌疑人审讯', en: 'SUSPECT INTERROGATION' },
  check_alibi: { zh: '不在场核查', en: 'ALIBI CHECK' },
  present_evidence: { zh: '证据对峙', en: 'EVIDENCE CONFRONTATION' },
  tail_suspect: { zh: '跟踪嫌疑人', en: 'SUSPECT PURSUIT' },
  bribe_informant: { zh: '隐秘交易', en: 'COVERT EXCHANGE' },
});

function asText(value, maxLength = 280) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .trim()
    .slice(0, maxLength);
}

function hiddenClueIds(caseData) {
  return new Set((caseData?.hidden_clues || []).map(clue => clue?.clue_id).filter(Boolean));
}

export function getPublicRevealedClues(previousState, nextState, caseData) {
  const before = new Set(previousState?.unlocked_clues || []);
  const hidden = hiddenClueIds(caseData);
  const dictionary = new Map((caseData?.clue_dictionary || []).map(clue => [clue.clue_id, clue]));

  return (nextState?.unlocked_clues || [])
    .filter(id => !before.has(id) && !hidden.has(id))
    .map(id => dictionary.get(id))
    .filter(Boolean)
    .map(clue => ({
      clueId: asText(clue.clue_id, 80),
      keyword: asText(clue.keyword, 96),
      icon: asText(clue.visual_icon || '🔍', 12),
      weight: asText(clue.weight || '', 16).toUpperCase(),
    }));
}

export function resolveCinematicTemplate(actionTag) {
  return TEMPLATE_BY_ACTION[actionTag] || 'investigation';
}

export function stableCinematicHash(value) {
  let hash = 2166136261;
  const text = String(value ?? '');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function resolveCinematicAnimation(actionTag, eventId = '') {
  const profile = ACTION_CINEMATIC_ANIMATIONS[actionTag] || ACTION_CINEMATIC_ANIMATIONS.search_area;
  return {
    ...profile,
    animationSeed: stableCinematicHash(`${eventId}:${profile.animationId}`),
  };
}

export function getCinematicActionLabel(actionTag, lang = 'zh') {
  const labels = ACTION_LABELS[actionTag] || {
    zh: String(actionTag || '调查行动').replaceAll('_', ' '),
    en: String(actionTag || 'INVESTIGATION').replaceAll('_', ' ').toUpperCase(),
  };
  return lang === 'en' ? labels.en : labels.zh;
}

export function shouldPlayActionCinematic(previousState, nextState, settlement, caseData) {
  const previousTurn = Math.max(0, Number(previousState?.turn_count) || 0);
  const nextTurn = Math.max(0, Number(nextState?.turn_count) || 0);
  if (nextTurn !== previousTurn + 1) return false;
  if (nextTurn % 2 === 0) return true;
  if (settlement?.is_trap === true) return true;
  return getPublicRevealedClues(previousState, nextState, caseData)
    .some(clue => clue.weight === 'CRITICAL');
}

export function buildCinematicEvent({
  previousState,
  nextState,
  settlement,
  caseData,
  actionTag,
  executorAgentId,
  assistAgentId = null,
}) {
  const revealedClues = getPublicRevealedClues(previousState, nextState, caseData);
  const trap = settlement?.is_trap === true;
  const zoneChanged = Boolean(
    previousState?.current_zone
    && nextState?.current_zone
    && previousState.current_zone !== nextState.current_zone,
  );
  const outcome = trap
    ? 'trap'
    : revealedClues.length > 0
      ? 'clue'
      : zoneChanged
        ? 'progress'
        : 'no_yield';
  const caseId = asText(caseData?.case_id || 'unknown-case', 80);
  const turn = Math.max(0, Number(nextState?.turn_count) || 0);
  const safeActionTag = asText(actionTag || settlement?.action_name || 'search_area', 80);
  const eventId = `${caseId}:${turn}:${safeActionTag}`;
  const animation = resolveCinematicAnimation(safeActionTag, eventId);

  return Object.freeze({
    eventId,
    turn,
    caseId,
    zoneId: asText(nextState?.current_zone || previousState?.current_zone || '', 80),
    actionTag: safeActionTag,
    template: resolveCinematicTemplate(safeActionTag),
    executorAgentId: asText(executorAgentId || '', 80),
    assistAgentId: assistAgentId ? asText(assistAgentId, 80) : null,
    outcome,
    outcomeEffect: CINEMATIC_OUTCOME_EFFECTS[outcome],
    revealedClues,
    narration: asText(
      trap
        ? (settlement?.trap_narration || settlement?.action_narration)
        : settlement?.action_narration,
    ),
    accentColor: OUTCOME_ACCENTS[outcome],
    ...animation,
  });
}

/**
 * @param {{
 *   enabled?: boolean,
 *   quality?: string,
 *   windowObject?: Window | Record<string, any> | null,
 *   navigatorObject?: Navigator | Record<string, any> | null,
 * }} options
 */
export function detectCinematicPlayback({
  enabled = true,
  quality = 'auto',
  windowObject,
  navigatorObject,
} = {}) {
  const win = windowObject || (typeof window !== 'undefined' ? window : null);
  const nav = navigatorObject || (typeof navigator !== 'undefined' ? navigator : null);
  if (!enabled || !win) return { mode: '2d', quality: 'low', reason: enabled ? 'no_window' : 'disabled' };

  if (win.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    return { mode: '2d', quality: 'low', reason: 'reduced_motion' };
  }

  try {
    const canvas = win.document?.createElement?.('canvas');
    const context = canvas?.getContext?.('webgl2', { failIfMajorPerformanceCaveat: true })
      || canvas?.getContext?.('webgl', { failIfMajorPerformanceCaveat: true });
    if (!context) return { mode: '2d', quality: 'low', reason: 'no_webgl' };
    context.getExtension?.('WEBGL_lose_context')?.loseContext?.();
  } catch {
    return { mode: '2d', quality: 'low', reason: 'webgl_error' };
  }

  const deviceMemory = Number(/** @type {any} */ (nav)?.deviceMemory);
  const lowMemory = deviceMemory > 0 && deviceMemory <= 4;
  const mobile = win.matchMedia?.('(max-width: 820px)').matches === true;
  const saveData = /** @type {any} */ (nav)?.connection?.saveData === true;
  const normalizedQuality = ['auto', 'low', 'high'].includes(quality) ? quality : 'auto';
  if (normalizedQuality === 'auto' && saveData) {
    return { mode: '2d', quality: 'low', reason: 'save_data' };
  }
  if (normalizedQuality === 'low') {
    return { mode: '3d', quality: 'low', reason: 'user_low' };
  }
  if (normalizedQuality === 'high') {
    return { mode: '3d', quality: 'high', reason: 'user_high' };
  }
  return {
    mode: '3d',
    quality: lowMemory || mobile ? 'low' : 'high',
    reason: lowMemory ? 'low_memory' : mobile ? 'mobile' : 'capable',
  };
}

export const CINEMATIC_ACTION_TAGS = Object.freeze(Object.keys(TEMPLATE_BY_ACTION));
