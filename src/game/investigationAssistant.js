const safeArray = value => Array.isArray(value) ? value : [];

function discoveredClues(caseData, unlockedIds) {
  const unlocked = new Set(safeArray(unlockedIds));
  return safeArray(caseData?.clue_dictionary).filter(clue => unlocked.has(clue.clue_id));
}

function evidenceSummary(clues, lang) {
  const visible = clues.slice(-3).reverse();
  if (!visible.length) return [];
  return visible.map(clue => ({
    id: clue.clue_id,
    icon: clue.visual_icon || '🔎',
    text: clue.keyword,
    weight: lang === 'zh'
      ? ({ CRITICAL: '关键', HIGH: '重要', MEDIUM: '辅助', LOW: '背景' }[clue.weight] || '证据')
      : (clue.weight || 'EVIDENCE'),
  }));
}

function reasoningHint(clues, validLinkCount, lang) {
  const critical = clues.filter(clue => ['CRITICAL', 'HIGH'].includes(clue.weight)).length;
  if (!clues.length) {
    return lang === 'zh'
      ? '先建立第一条事实：现场发生了什么、谁能接触现场、记录中哪里不自然。'
      : 'Establish the first fact: what happened, who had access, and which record looks unnatural.';
  }
  if (clues.length === 1) {
    return lang === 'zh'
      ? '单条证据只能说明现象。下一步寻找能解释其来源、时间或操作者的独立证据。'
      : 'One clue shows a symptom. Find an independent trace that explains its source, timing, or operator.';
  }
  if (validLinkCount <= 0) {
    return lang === 'zh'
      ? `现有 ${clues.length} 条证据中有 ${critical} 条重要证据。尝试把“物理痕迹”与“权限、时间或动机记录”连接，而不是直接猜测嫌疑人。`
      : `${critical} of ${clues.length} clues are high-value. Link a physical trace to access, timing, or motive instead of guessing a suspect.`;
  }
  return lang === 'zh'
    ? `已确认 ${validLinkCount} 条有效联系。继续寻找能同时回答“如何发生”和“谁有机会”的证据，形成可提交的闭环。`
    : `${validLinkCount} valid connection${validLinkCount === 1 ? '' : 's'} confirmed. Build a chain that answers both how it happened and who had the opportunity.`;
}

/**
 * Builds local, spoiler-safe guidance from the player's visible run state.
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
  const clues = discoveredClues(caseData, gameState?.unlocked_clues);
  const validLinkCount = safeArray(linkedPairs).filter(pair => pair?.valid).length;
  const clueTotal = Math.max(1, safeArray(caseData?.clue_dictionary).length);
  const ratio = clues.length / clueTotal;
  const ap = Math.max(0, Number(gameState?.action_points_left) || 0);
  const confusion = Math.max(0, Number(gameState?.confusion_score) || 0);
  const base = {
    assistant: 'NOVA',
    summary: evidenceSummary(clues, lang),
    reasoning: reasoningHint(clues, validLinkCount, lang),
    clueCount: clues.length,
    clueTotal,
    action: null,
  };

  if (decisionPending) return {
    ...base, mode: 'decision', tone: 'gold',
    title: zh ? '先阅读，再下令' : 'READ BEFORE YOU COMMAND',
    instruction: zh
      ? '先仔细阅读「证据及发现」的白色文字，再比较三张决策卡的收益与风险，最后选择执行探员。'
      : 'Read the white EVIDENCE & FINDINGS text first, compare the benefit and risk on all three cards, then assign an executing agent.',
  };

  if (isProcessing) return {
    ...base, mode: 'processing', tone: 'cyan',
    title: zh ? '探员正在执行指令' : 'AGENTS EXECUTING ORDER',
    instruction: zh ? '等待本轮结果。白色文字出现后先读证据描述，再决定下一步。' : 'Wait for the result. When white evidence text appears, read it before choosing the next move.',
  };

  if (reportMode) return {
    ...base, mode: 'report', tone: 'green',
    title: zh ? '组织最终报告' : 'STRUCTURE THE FINAL REPORT',
    instruction: zh
      ? '报告应依次说明：结论、作案方式、时间与权限、动机，以及至少两条相互印证的证据。'
      : 'State the conclusion, method, timing and access, motive, and at least two mutually supporting clues.',
  };

  if (confusion >= 60) return {
    ...base, mode: 'warning', tone: 'red', action: 'open_command',
    title: zh ? '混乱值过高' : 'CONFUSION IS HIGH',
    instruction: zh ? '暂停冒险行动，打开指挥台并考虑使用「紧急稳态」。' : 'Pause risky actions. Open Command and consider Emergency Stabilize.',
    actionLabel: zh ? '打开指挥台' : 'OPEN COMMAND',
  };

  if (ap <= 5 && clues.length > 0) return {
    ...base, mode: 'warning', tone: 'red', action: 'open_report',
    title: zh ? '行动点即将耗尽' : 'ACTION POINTS CRITICAL',
    instruction: zh ? '不要再盲目探索。复核证据链并准备提交报告。' : 'Stop blind exploration. Review the evidence chain and prepare your report.',
    actionLabel: zh ? '准备报告' : 'PREPARE REPORT',
  };

  if (!clues.length) return {
    ...base, mode: 'start', tone: 'cyan', action: 'execute_cycle',
    title: zh ? '从第一次观察开始' : 'BEGIN WITH THE FIRST OBSERVATION',
    instruction: zh ? '点击下方「执行循环」，探员会观察现场、分析情况并生成三种可选行动。' : 'Select EXECUTE CYCLE below. The agents will observe, analyze, and produce three possible actions.',
    actionLabel: zh ? '执行第一次循环' : 'RUN FIRST CYCLE',
  };

  if (hasNewEvidence || clues.length === 1) return {
    ...base, mode: 'evidence', tone: 'gold', action: 'review_evidence',
    title: zh ? '先阅读证据及发现' : 'READ EVIDENCE & FINDINGS',
    instruction: zh ? '先查看终端中的白色证据描述，再在证物库核对关键词、来源和重要度。' : 'Read the white evidence description in the terminal, then verify its keyword, source, and weight in Evidence.',
    actionLabel: zh ? '查看证物库' : 'OPEN EVIDENCE',
  };

  if (clues.length >= 2 && validLinkCount === 0) return {
    ...base, mode: 'link', tone: 'gold', action: 'open_link',
    title: zh ? '尝试建立第一条证据链' : 'BUILD THE FIRST EVIDENCE LINK',
    instruction: zh ? '你已经有多条证据。寻找能够解释同一时间、工具、权限或动机的两条线索。' : 'You have multiple clues. Connect two that explain the same timing, tool, access path, or motive.',
    actionLabel: zh ? '打开推理连线' : 'OPEN LINK BOARD',
  };

  if (ratio >= 0.67 && validLinkCount >= 2) return {
    ...base, mode: 'report-ready', tone: 'green', action: 'open_report',
    title: zh ? '证据链已接近完整' : 'THE EVIDENCE CHAIN IS NEARLY COMPLETE',
    instruction: zh ? '可以继续寻找隐藏线索提高评分，也可以开始整理报告。不要只写嫌疑人姓名，要写出完整因果链。' : 'You may hunt hidden evidence for a better rank or start the report. State the causal chain, not only a suspect name.',
    actionLabel: zh ? '整理案件报告' : 'DRAFT REPORT',
  };

  if (selectedNpcId) return {
    ...base, mode: 'interview', tone: 'cyan',
    title: zh ? '用证据约束证词' : 'ANCHOR TESTIMONY TO EVIDENCE',
    instruction: zh ? '围绕时间、权限和已发现证据提问。避免一次提出多个无关问题。' : 'Ask about timing, access, and a discovered clue. Avoid combining unrelated questions.',
  };

  return {
    ...base, mode: 'continue', tone: 'cyan', action: 'execute_cycle',
    title: zh ? '继续验证当前推理' : 'CONTINUE TESTING THE THEORY',
    instruction: zh ? '现有推理仍需独立证据支撑。执行下一轮，并优先探索尚未验证的区域或证词。' : 'The current theory still needs independent support. Run another cycle and test an unexplored area or statement.',
    actionLabel: zh ? '执行下一轮' : 'RUN NEXT CYCLE',
  };
}
