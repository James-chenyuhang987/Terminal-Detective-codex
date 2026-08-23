// NPC 情绪状态 + 审讯策略提示（纯前端逻辑）

export const EMOTION_META = {
  calm:   { zh: '警惕', en: 'GUARDED', color: '#00e5ff', icon: '😐' },
  shaken: { zh: '动摇', en: 'SHAKEN',  color: '#ffaa00', icon: '😰' },
  broken: { zh: '崩溃', en: 'BROKEN',  color: '#ff3860', icon: '😡' },
};

const ORDER = ['calm', 'shaken', 'broken'];

export function shiftEmotion(level = 'calm', shift = 0) {
  const i = Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(level) + (shift > 0 ? 1 : shift < 0 ? -1 : 0)));
  return ORDER[i];
}

export function getEmotion(state, npcId) {
  return state?.[npcId] || { level: 'calm', history_count: 0, hostile_streak: 0, refuses_topic: null };
}

// 根据已解锁线索动态生成 2-3 个推荐追问方向
export function buildHints({ npc, clues, unlockedIds, emotionLevel, lang = 'zh' }) {
  const known = (unlockedIds || [])
    .map(id => clues?.find(c => c.clue_id === id))
    .filter(Boolean);

  const hints = [];
  const zh = lang === 'zh';

  hints.push({
    id: 'alibi',
    label: zh ? '逼问不在场证明' : 'Press on the alibi',
    intensity: 'shaken',
    text: zh
      ? `${npc.name}，案发那段时间你到底在哪里？逐分钟说清楚，别让我从监控里替你回答。`
      : `${npc.name}, where exactly were you at the time of death? Minute by minute — don't make me pull it from the footage.`,
  });

  if (known.length > 0) {
    const c = known[known.length - 1];
    hints.push({
      id: 'evidence',
      label: zh ? `暗示已掌握「${c.keyword}」` : `Hint we hold "${c.keyword}"`,
      intensity: 'shaken',
      text: zh
        ? `我们已经取得了${c.visual_icon || ''}「${c.keyword}」。在我把它交给检方之前，你想先解释一下吗？`
        : `We already secured ${c.visual_icon || ''}"${c.keyword}". Care to explain before I hand it to the prosecutor?`,
    });
  }

  if (emotionLevel === 'broken') {
    hints.push({
      id: 'confess',
      label: zh ? '趁其崩溃索要真相' : 'Take the confession',
      intensity: 'calm',
      text: zh
        ? '你已经撑不住了。现在说出全部真相，我可以在报告里写明你主动配合。'
        : "You're done holding this. Give me the whole truth now and I'll log you as cooperating.",
    });
  } else {
    hints.push({
      id: 'pressure',
      label: zh ? '高压指控施压' : 'Accuse under pressure',
      intensity: 'hostile',
      text: zh
        ? '够了。我认为是你动的手，而你唯一的机会就是现在开口。'
        : "Enough. I think you did it, and your only window to talk is right now.",
    });
  }

  return hints.slice(0, 3);
}

export const INTENSITY_META = {
  calm:    { icon: '😐', color: '#00ff88' },
  shaken:  { icon: '😰', color: '#ffaa00' },
  hostile: { icon: '😡', color: '#ff3860' },
};