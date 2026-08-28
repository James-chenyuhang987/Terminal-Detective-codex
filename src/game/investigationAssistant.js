const safeArray = value => Array.isArray(value) ? value : [];

function discoveredPublicClues(caseData, unlockedIds) {
  const unlocked = new Set(safeArray(unlockedIds));
  const hidden = new Set(safeArray(caseData?.hidden_clues).map(clue => clue?.clue_id));
  return safeArray(caseData?.clue_dictionary)
    .filter(clue => unlocked.has(clue.clue_id) && !hidden.has(clue.clue_id));
}

function latestClueNames(clues, limit = 3) {
  return clues.slice(-limit).reverse().map(clue => clue.keyword).filter(Boolean);
}

function quotedList(names, lang) {
  if (!names.length) return lang === 'zh' ? '已发现的公开证据' : 'the visible evidence';
  if (lang === 'zh') return names.map(name => `「${name}」`).join('、');
  return names.map(name => `“${name}”`).join(', ');
}

function makeBrief(lang, key, tone, message) {
  return { messageKey: `${lang}:${key}`, tone, message };
}

/**
 * Builds one local, spoiler-safe sentence for NOVA from visible run state.
 * @param {{
 *   gameState?: Record<string, any>,
 *   caseData?: Record<string, any>,
 *   lang?: string,
 *   isProcessing?: boolean,
 *   decisionPending?: boolean,
 *   reportMode?: boolean,
 *   hasNewEvidence?: boolean,
 *   linkedPairs?: Array<Record<string, any>>,
 *   selectedNpcId?: string | null,
 * }} [options]
 */
export function buildInvestigationBrief({
  gameState = {},
  caseData = {},
  lang = 'zh',
  isProcessing = false,
  decisionPending = false,
  reportMode = false,
  hasNewEvidence = false,
  linkedPairs = [],
  selectedNpcId = null,
} = {}) {
  const zh = lang === 'zh';
  const unlockedIds = safeArray(gameState?.unlocked_clues);
  const clues = discoveredPublicClues(caseData, unlockedIds);
  const names = latestClueNames(clues);
  const evidence = quotedList(names, lang);
  const newestVisibleClue = clues.find(clue => clue.clue_id === unlockedIds.at(-1));
  const validLinkCount = safeArray(linkedPairs).filter(pair => pair?.valid).length;
  const clueTotal = Math.max(1, safeArray(caseData?.clue_dictionary).length);
  const ratio = unlockedIds.length / clueTotal;
  const ap = Math.max(0, Number(gameState?.action_points_left) || 0);
  const confusion = Math.max(0, Number(gameState?.confusion_score) || 0);
  const turn = Math.max(0, Number(gameState?.turn_count) || 0);

  if (confusion >= 60) {
    return makeBrief(lang, 'warning:confusion', 'red', zh
      ? '混乱值已经过高，先暂停冒险行动并在指挥台考虑使用「紧急稳态」。'
      : 'Confusion is too high, so pause risky actions and consider Emergency Stabilize in Command.');
  }

  if (ap <= 5 && unlockedIds.length > 0) {
    return makeBrief(lang, 'warning:ap', 'red', zh
      ? '行动点即将耗尽，不要继续盲目探索，先复核证据链并准备报告。'
      : 'Action points are nearly depleted, so stop blind exploration and review the evidence chain before reporting.');
  }

  if (decisionPending) {
    return makeBrief(lang, `decision:${turn}`, 'gold', zh
      ? '先仔细阅读终端中白色的「证据及发现」，再比较决策卡并选择执行探员。'
      : 'Read the white EVIDENCE & FINDINGS text first, then compare the cards and assign an executing agent.');
  }

  if (isProcessing) {
    return makeBrief(lang, `processing:${turn}`, 'cyan', zh
      ? '探员正在执行本轮指令，等待白色证据描述出现后再决定下一步。'
      : 'The agents are executing this order, so wait for the white evidence description before deciding what comes next.');
  }

  if (reportMode) {
    return makeBrief(lang, `report:${unlockedIds.length}:${validLinkCount}`, 'green', zh
      ? '报告要依次说明结论、作案方式、时间与权限、动机，并引用至少两条相互印证的证据。'
      : 'Structure the report around the conclusion, method, timing and access, motive, and at least two supporting clues.');
  }

  if (hasNewEvidence) {
    if (!newestVisibleClue) {
      return makeBrief(lang, `evidence:protected:${unlockedIds.at(-1) || unlockedIds.length}`, 'gold', zh
        ? `一条受保护的新证据已封存，继续根据 ${evidence} 核查时间、权限或工具关系。`
        : `A protected new trace is secured, so continue testing the timing, access, or tool relationships around ${evidence}.`);
    }
    return makeBrief(lang, `evidence:${unlockedIds.at(-1) || unlockedIds.length}`, 'gold', zh
      ? `新证据 ${evidence} 已记录，先读完白色「证据及发现」，再从时间、权限或工具中寻找对应关系。`
      : `New evidence ${evidence} is secured, so read the white EVIDENCE & FINDINGS text and test its timing, access, or tool connection.`);
  }

  if (clues.length >= 2 && validLinkCount === 0) {
    return makeBrief(lang, `link:${clues.map(clue => clue.clue_id).join(',')}`, 'gold', zh
      ? `现有证据包括 ${evidence}，尝试连接指向同一时间、工具、权限或动机的两条线索。`
      : `Visible evidence includes ${evidence}, so connect two clues that share a timing, tool, access path, or motive.`);
  }

  if (ratio >= 0.67 && validLinkCount >= 2) {
    return makeBrief(lang, `report-ready:${unlockedIds.length}:${validLinkCount}`, 'green', zh
      ? '证据链已接近完整，你可以继续寻找遗漏线索提高评分，或开始整理完整因果报告。'
      : 'The evidence chain is nearly complete, so either search for missed clues to improve the rank or draft the causal report.');
  }

  if (selectedNpcId) {
    const npcName = safeArray(caseData?.npcs).find(npc => npc.npc_id === selectedNpcId)?.name;
    return makeBrief(lang, `interview:${selectedNpcId}:${unlockedIds.length}`, 'cyan', zh
      ? `询问${npcName ? ` ${npcName}` : '这名证人'}时，围绕时间、权限和已发现证据提出一个明确问题。`
      : `When questioning${npcName ? ` ${npcName}` : ' this witness'}, ask one precise question about timing, access, or discovered evidence.`);
  }

  if (unlockedIds.length === 0) {
    return makeBrief(lang, 'start', 'cyan', zh
      ? '点击下方「执行循环」，让探员完成第一次现场观察并生成可选行动。'
      : 'Select EXECUTE CYCLE below to begin the first field observation and generate possible actions.');
  }

  return makeBrief(lang, `continue:${turn}:${validLinkCount}`, 'cyan', zh
    ? `当前证据包括 ${evidence}，继续执行循环并优先验证尚未确认的区域、时间线或证词。`
    : `Current evidence includes ${evidence}, so run another cycle and test an unverified area, timeline, or statement.`);
}
