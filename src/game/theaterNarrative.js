import { getCaseNarrativeProfile } from './caseNarrativeLibrary.js';
import { localizeCase } from './caseData.js';

const WORLD = {
  zh: {
    title: '序章 · 尚未写下的记录',
    text: '夜色降下，城市并没有安静。霓虹沿着玻璃流动，终端在窗后亮起，每一条讯息都像在抢先讲述自己的版本。\n\n你的工作不是相信最响亮的声音。你与探员们走进记录的空白，把口供、时间和留下的痕迹放在一起，允许疑问存在，直到证据足够。\n\n桌上的案卷还没有打开。先选择要接手的调查，再决定从哪里开始倾听。',
  },
  en: {
    title: 'Prologue · The unwritten record',
    text: 'Night settles, but the city does not quiet down. Neon runs along the glass. Terminals glow behind windows, each message racing to tell its own version of events.\n\nYour work is not to believe the loudest voice. With your investigators, you enter the gaps in the record, bringing statements, times and traces together. Questions may remain questions until the evidence is enough.\n\nThe files on your desk are still closed. Choose the investigation you will take, then decide where to begin listening.',
  },
};

const CHAPTERS = {
  opening: {
    zh: { title: '第一幕 · 记录声音', text: '对话暂时停下，终端留下了一份新的回答。有人愿意继续说下去，不代表说法已经得到证明。\n\n把这段口供留在记录里。下一步，寻找能够独立核验它的痕迹，而不是急着替沉默补上答案。' },
    en: { title: 'Act I · A voice on record', text: 'The conversation pauses. A new answer remains on the terminal. A willingness to speak is not proof that an account is true.\n\nKeep this testimony in the record. Next, look for a trace that can test it independently, rather than rushing to fill the silence with an answer.' },
  },
  pursuit: {
    zh: { title: '第二幕 · 两份记录之间', text: '又一段有效的问答结束了。回到现场，已记录的口供与手中的证据仍是不同的东西。\n\n先检查它们能否对上同一段时间，再看还有什么没有得到解释。追问给出了方向；核验才决定这条路能走多远。' },
    en: { title: 'Act II · Between two records', text: 'Another productive exchange ends. Back at the scene, recorded testimony and secured evidence are still different things.\n\nTest whether they fit the same stretch of time, then look for what remains unexplained. A question offers a direction; verification decides how far that path can go.' },
  },
  convergence: {
    zh: { title: '第三幕 · 留给核验的空白', text: '回答已经记下，调查也积累了更多材料。此刻最需要的不是一个更动听的故事，而是一次更严格的复核。\n\n逐项检查时间、行动与证据之间的连接。无法解释的空白可以继续保留；结论不该比已经证实的事实走得更远。' },
    en: { title: 'Act III · Room for verification', text: 'The answer is recorded, and the investigation has gathered more material. What matters now is not a more persuasive story, but a stricter check.\n\nReview the connections between times, actions and evidence. An unexplained gap may remain open; a conclusion should never reach further than the facts that support it.' },
  },
};

export function worldNarrative(lang = 'zh') {
  return WORLD[lang === 'en' ? 'en' : 'zh'];
}

export function caseBriefingNarrative(caseData, lang = 'zh') {
  const language = lang === 'en' ? 'en' : 'zh';
  const publicCase = localizeCase(caseData, language);
  const profile = getCaseNarrativeProfile(caseData.case_id, language);
  const controls = language === 'en'
    ? 'In the scene: WASD / arrows move, drag to orbit, E or Contacts to talk. Movement is free; investigations and questions keep their usual resource costs. Statements are claims, not proof. Continue or Skip confirms case entry and its normal energy cost; Back home cancels without starting.'
    : '进入现场后：WASD / 方向键移动，拖动视角，E 或联络人列表交谈。移动不消耗资源；调查与提问仍按原规则消耗。口供不是已证实的事实。继续或跳过即确认开始案件并支付原有体力费用；返回主页则取消，不开始案件。';
  const staging = caseData.case_id !== 'Lvl_01' && (language === 'en'
    ? 'This case uses generic scene staging; its characters, evidence and rules remain case-specific.'
    : '本案件使用通用场景布置；案件人物、证据与规则仍来自原案。');
  return {
    title: `${language === 'en' ? 'Case briefing' : '案件简报'} · ${publicCase.title}`,
    text: [profile.prologue, publicCase.scene?.description, profile.question, staging, controls].filter(Boolean).join('\n\n'),
  };
}

// Match the existing public observation chapters; never infer a stage from hidden truth.
export function theaterNarrativeStage(state, caseData) {
  const count = state.unlocked_clues?.length || 0;
  if ((Number(state.turn_count) || 0) <= 1 || count === 0) return 'opening';
  return count / Math.max(1, caseData.clue_dictionary?.length || 0) >= 0.55 ? 'convergence' : 'pursuit';
}

export function createTheaterNarrativeState(runId) {
  return { runId, seen: [], queue: [] };
}

export function successfulInterviewEvent({ runId, dialogueId, theaterAtQuestion, result, stage }) {
  if (!theaterAtQuestion || !result || result.repeated === true || result.error
    || typeof result.response !== 'string' || !result.response.trim()
    || !(Number(result.cooperationChange) > 0)
    || Number(result.consequence?.confusionIncrease) > 0 || !CHAPTERS[stage]) return null;
  return { type: 'answer', runId, dialogueId, stage };
}

/**
 * @param {{runId: string, seen: string[], queue: Array<{id: string, stage: string, dialogueId: number, released: boolean}>}} state
 * @param {{type: string, runId: string, stage?: string, dialogueId?: number, id?: string} | null} event
 */
export function theaterNarrativeReducer(state, event) {
  if (!event || event.runId !== state.runId) return state;
  if (event.type === 'answer') {
    if (!CHAPTERS[event.stage] || state.seen.includes(event.stage)) return state;
    return {
      ...state,
      seen: [...state.seen, event.stage],
      queue: [...state.queue, { id: `${state.runId}:${event.stage}`, stage: event.stage, dialogueId: event.dialogueId, released: false }],
    };
  }
  if (event.type === 'close') {
    return { ...state, queue: state.queue.map(item => item.dialogueId === event.dialogueId ? { ...item, released: true } : item) };
  }
  if (event.type === 'complete' && state.queue[0]?.id === event.id) {
    return { ...state, queue: state.queue.slice(1) };
  }
  return state;
}

export function currentTheaterNarrative(state, lang = 'zh') {
  const entry = state.queue[0];
  if (!entry?.released) return null;
  return { ...entry, ...CHAPTERS[entry.stage][lang === 'en' ? 'en' : 'zh'] };
}

export function canPresentTheaterNarrative({ theaterMode, presentationActive, selectedNPC, reportMode, isProcessing,
  isFinalizing, crisisPending, crisis, decisionCards, actionCinematic, cinematic, showBSoD, showGameOver,
  showSettings, showOnboarding, showCommandConsole, mobileToolsOpen, isLinkChecking }) {
  return Boolean(theaterMode && presentationActive && !selectedNPC && !reportMode && !isProcessing
    && !isFinalizing && !crisisPending && !crisis && !decisionCards && !actionCinematic && !cinematic
    && !showBSoD && !showGameOver && !showSettings && !showOnboarding && !showCommandConsole
    && !mobileToolsOpen && !isLinkChecking);
}
