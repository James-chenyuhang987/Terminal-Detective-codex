import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { ReAct_Enum, Legal_Actions_List, Phase_Color_Map, Case_Data_Lvl_01, localizeCase } from '@/game/caseData';
import { useLang } from '@/lib/lang.jsx';
import MiniMap from '@/components/game/MiniMap';
import { createInitialGameState, generateObservation, applySettlementResult, pushCheckpoint, checkConflictClues } from '@/game/gameState';
import { getAvailableClueIds, getInitialZone } from '@/game/caseRuntime';
import { streamThinkSSE, getAction, settleAction, getNPCDialogue, judgeReport, branchCheck, parseActionTag, linkCheck, setLLMLang, generateDecisionCards, linkCinematic } from '@/game/llmClient';
import DecisionCards from '@/components/game/DecisionCards';
import LinkCinematic from '@/components/game/LinkCinematic';
import InterrogationHints, { EmotionBadge } from '@/components/game/InterrogationHints';
import { buildHints, getEmotion, shiftEmotion } from '@/game/npcEmotion';
import { nextCrisisIn, rollCrisis, applyCrisisChoice } from '@/game/crisisEvents';
import CrisisAlert from '@/components/game/CrisisAlert';
import InsightFlashFX from '@/components/game/InsightFlashFX';
import LinkBoard from '@/components/game/LinkBoard';
import AIProcessingIndicator from '@/components/game/AIProcessingIndicator';
import ClueCard from '@/components/game/ClueCard';
import EvidenceBoard from '@/components/game/EvidenceBoard';
import GlitchOverlay from '@/components/game/GlitchOverlay';
import BSoD from '@/components/game/BSoD';
import AgentSynergyFX from '@/components/game/AgentSynergyFX';
import DecisionLog from '@/components/game/DecisionLog';
import CaseFlowMap from '@/components/game/CaseFlowMap';
import GameOverScreen from '@/components/game/GameOverScreen';
import OnboardingGuide from '@/components/game/OnboardingGuide';
import ToolPanelTabs from '@/components/game/ToolPanelTabs';
import SettingsDrawer from '@/components/game/settings/SettingsDrawer';
import { useSettings, panelSkin } from '@/lib/settings.jsx';

const ONBOARD_KEY = 'td_onboarding_seen_v1';

const PHASE_COLORS = Phase_Color_Map;

export default function InvestigationTerminal({ agentStrategy, selectedCase, onGameEnd, onBackToLobby }) {
  const { lang, t } = useLang();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const skin = panelSkin(settings.panelLight);
  const caseDataResolved = selectedCase || Case_Data_Lvl_01;

  const caseData = useMemo(
    () => localizeCase(caseDataResolved, lang),
    [caseDataResolved, lang],
  );
  // AI 叙事输出语言跟随界面语言
  useEffect(() => { setLLMLang(lang); }, [lang]);

  const [gameState, setGameState] = useState(() => createInitialGameState(caseDataResolved));
  const [reactState, setReactState] = useState(ReAct_Enum.IDLE);
  const [terminalLines, setTerminalLines] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [stressLevel, setStressLevel] = useState(0);
  const [newClueIds, setNewClueIds] = useState([]);
  const [showBSoD, setShowBSoD] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [reportText, setReportText] = useState('');
  const [judgeResult, setJudgeResult] = useState(null);
  const [selectedNPC, setSelectedNPC] = useState(null);
  const [npcDialogue, setNpcDialogue] = useState([]);
  const [toolTab, setToolTab] = useState('evidence');
  const [decisionLog, setDecisionLog] = useState([]);
  const [agentPath, setAgentPath] = useState(() => [getInitialZone(caseDataResolved)].filter(Boolean));
  const [zoneFeedback, setZoneFeedback] = useState({});
  const [thoughtText, setThoughtText] = useState('');
  const [synergyEvent, setSynergyEvent] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try { return !localStorage.getItem(ONBOARD_KEY); } catch { return true; }
  });
  const [finalJudgeResult, setFinalJudgeResult] = useState(null);
  // ── 关键决策 / 危机事件 / 推理连线 ──
  const [decisionCards, setDecisionCards] = useState(null);
  const [decisionStory, setDecisionStory] = useState(null);
  const [cinematic, setCinematic] = useState(null);
  const [npcEmotionState, setNpcEmotionState] = useState({});
  const [truthFragments, setTruthFragments] = useState(0);
  const [redFlash, setRedFlash] = useState(0);
  const [crisis, setCrisis] = useState(null);
  const [insightEvent, setInsightEvent] = useState(null);
  const [linkedPairs, setLinkedPairs] = useState([]);
  const [isLinkChecking, setIsLinkChecking] = useState(false);
  const decisionResolveRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const activeRunRef = useRef(0);
  const nextCrisisTurnRef = useRef(nextCrisisIn());

  const triggerSynergy = useCallback((type, clue) => {
    setSynergyEvent({
      type,
      clueIcon: clue?.visual_icon || '🔍',
      clueKeyword: clue?.keyword || '未知线索',
      id: Date.now(),
    });
  }, []);

  const terminalRef = useRef(null);
  const stressTimerRef = useRef(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  useEffect(() => () => {
    activeRunRef.current += 1;
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    decisionResolveRef.current?.(null);
    decisionResolveRef.current = null;
    clearInterval(stressTimerRef.current);
  }, []);

  // Apply the opening passive once; the state guard prevents language changes
  // or React development remounts from awarding the clue twice.
  useEffect(() => {
    if (!agentStrategy?.skill_effects?.auto_unlock_first) return;
    setGameState(prev => {
      if (prev.unlocked_clues.length > 0) return prev;
      const firstClue = caseData.zone_clue_map?.[prev.current_zone]?.[0]
        || caseData.clue_dictionary?.[0]?.clue_id;
      if (!firstClue) return prev;
      return {
        ...prev,
        unlocked_clues: [firstClue],
        unlocked_clues_set: new Set([firstClue]),
      };
    });
  }, [agentStrategy, caseData]);

  const phaseColor = PHASE_COLORS[reactState] || PHASE_COLORS.IDLE;

  const scrollToBottom = useCallback(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, []);

  const addLine = useCallback((text, type = 'default', prefix = '') => {
    setTerminalLines(prev => [...prev, { text, type, prefix, id: Date.now() + Math.random() }]);
    setTimeout(scrollToBottom, 50);
  }, [scrollToBottom]);

  // Check for auto-released hidden clues on turn change
  useEffect(() => {
    const hidden = caseData.hidden_clues || [];
    hidden.forEach(hc => {
      if (gameState.turn_count >= hc.unlock_turn && !gameState.unlocked_clues.includes(hc.clue_id)) {
        addLine(`\n${t.encryptedMessage} "${hc.text}"`, 'system');
        addLine(`${t.newEvidenceSecured} ${hc.clue_id}`, 'success');
        setGameState(prev => ({
          ...prev,
          unlocked_clues: [...prev.unlocked_clues, hc.clue_id],
          unlocked_clues_set: new Set([...prev.unlocked_clues, hc.clue_id]),
        }));
        setNewClueIds(prev => [...prev, hc.clue_id]);
        setTimeout(() => setNewClueIds(prev => prev.filter(id => id !== hc.clue_id)), 3000);
      }
    });
  }, [gameState.turn_count]);

  // Confusion / crash monitoring
  useEffect(() => {
    if (gameState.confusion_score >= 100 && !showBSoD) {
      setShowBSoD(true);
    }
  }, [gameState.confusion_score]);

  const startStressTimer = () => {
    clearInterval(stressTimerRef.current);
    setStressLevel(0);
    stressTimerRef.current = setInterval(() => {
      setStressLevel(prev => Math.min(100, prev + 5));
    }, 500);
  };

  const stopStressTimer = () => {
    clearInterval(stressTimerRef.current);
    stressTimerRef.current = null;
    setTimeout(() => setStressLevel(0), 500);
  };

  const beginAbortableOperation = () => {
    const ctrl = new AbortController();
    const operationId = activeRunRef.current + 1;
    activeRunRef.current = operationId;
    abortCtrlRef.current = ctrl;
    return { ctrl, operationId };
  };

  const isOperationCurrent = (ctrl, operationId) =>
    !ctrl.signal.aborted && activeRunRef.current === operationId;

  // ── Main ReAct Loop ───────────────────────────────────────────────────────
  const runReActCycle = async () => {
    if (isProcessing || abortCtrlRef.current) return;
    const gs = gameStateRef.current;
    if (gs.action_points_left <= 0) {
      addLine(`\n${t.apDepleted}`, 'error');
      return;
    }

    const { ctrl, operationId: runId } = beginAbortableOperation();
    setIsProcessing(true);
    const isCancelled = () => ctrl.signal.aborted || activeRunRef.current !== runId;

    try {
      // ── Phase 1: OBSERVE ──────────────────────────────────────────────
      setReactState(ReAct_Enum.OBSERVE);
      const observation = generateObservation(gs, caseData);
      addLine('\n' + '═'.repeat(50), 'divider');
      addLine(`◈ ${t.turnLabel} ${gs.turn_count + 1} — ${t.observationPhase}`, 'phase');
      addLine(observation, 'observe');
      await sleep(800);
      if (isCancelled()) return;

      // ── Phase 2: THINK ────────────────────────────────────────────────
      setReactState(ReAct_Enum.THINK);
      addLine('\n' + t.neuralProcessing, 'phase');
      setThoughtText('');

      startStressTimer();
      let fullThought = '';

      await streamThinkSSE({
        gameState: gs,
        agentStrategy,
        chatHistory: gs.chat_history.slice(-6),
        banList: gs.action_ban_list,
        observation,
        signal: ctrl.signal,
        onChunk: (char) => {
          fullThought += char;
          setThoughtText(prev => prev + char);
          scrollToBottom();
        },
        onDone: (text) => { fullThought = text; }
      });

      stopStressTimer();
      if (isCancelled()) return;

      addLine(fullThought, 'thought');
      setThoughtText('');

      // ── Phase 3: ACT ──────────────────────────────────────────────────
      setReactState(ReAct_Enum.ACT);
      addLine('\n' + t.actionSynthesis, 'phase');
      startStressTimer();

      const actionText = await getAction({
        thoughtProcess: fullThought,
        gameState: gs,
        agentStrategy,
        signal: ctrl.signal,
      });

      stopStressTimer();
      if (isCancelled()) return;

      let actionTag = parseActionTag(actionText);
      let playerOverride = null;
      let cardStyle = null;
      let hiddenBranch = false;

      // ── 关键决策节点：挂起自动执行，玩家 30 秒内选择 ──────────────────
      // 每一轮都交由架构师决策 —— 玩家始终掌握剧情走向
      const isKeyNode = true;
      if (isKeyNode) {
        const fallbackTag = actionTag && Legal_Actions_List.includes(actionTag) ? actionTag : 'search_area';
        addLine(`\n${t.keyDecisionNode}`, 'warning');
        const cards = await generateDecisionCards({
          gameState: gs,
          caseData,
          thoughtProcess: fullThought,
          signal: ctrl.signal,
        })
          || [
            { style: 'steady', label: fallbackTag, risk_level: 'low', benefit_desc: t.riskSteadyDesc, risk_desc: '—', action_tag: fallbackTag },
            { style: 'aggressive', label: 'present_evidence', risk_level: 'high', benefit_desc: t.riskAggressiveDesc, risk_desc: '—', action_tag: 'present_evidence' },
            { style: 'deceptive', label: 'bribe_informant', risk_level: 'medium', benefit_desc: t.riskHighDesc, risk_desc: '—', action_tag: 'bribe_informant' },
          ];
        const zoneId = gs.current_zone || 'zone_datacenter';
        const zoneList = Array.isArray(caseData.zone_layout)
          ? caseData.zone_layout
          : Object.values(caseData.zone_layout || {});
        const zoneName = zoneList.find(z => z?.zone_id === zoneId)?.name || zoneId;
        setDecisionStory({
          zone: zoneId,
          actionTag: fallbackTag,
          locationName: zoneName,
          contacts: (caseData.npcs || []).length,
          evidence: `${gs.unlocked_clues.length}/${caseData.clue_dictionary.length}`,
          turn: gs.turn_count + 1,
          thought: fullThought,
        });
        setDecisionCards(cards);
        const choice = await new Promise(resolve => { decisionResolveRef.current = resolve; });
        setDecisionCards(null);
        setDecisionStory(null);
        decisionResolveRef.current = null;
        if (!choice || isCancelled()) return;

        if (choice.freeform) {
          addLine(`\n${lang === 'zh' ? '🎙 架构师自由指令：' : '🎙 ARCHITECT FREE ORDER: '}"${choice.freeform}"`, 'action');
          const overrideText = await getAction({
            thoughtProcess: `${fullThought}\n\n[ARCHITECT OVERRIDE ORDER — player_override=true] ${choice.freeform}`,
            gameState: gs,
            agentStrategy,
            signal: ctrl.signal,
          });
          if (isCancelled()) return;
          actionTag = parseActionTag(overrideText) || fallbackTag;
          playerOverride = choice.freeform;
        } else {
          const card = choice.card;
          actionTag = card.action_tag;
          cardStyle = card.style;
          // 高风险卡：概率触发隐藏分支线索
          if (card.risk_level === 'high' && Math.random() < 0.35) hiddenBranch = true;
          addLine(`\n${t.architectConfirm}[${String(actionTag).toUpperCase()}] · ${card.label}`, 'action');
        }
      }

      const isLegal = actionTag && Legal_Actions_List.includes(actionTag);

      if (actionTag) {
        const actionMsg = lang === 'zh' ? `▶ 行动已下达：[${actionTag.toUpperCase()}]` : `▶ ACTION ISSUED: [${actionTag.toUpperCase()}]`;
        addLine(`\n${actionMsg}`, isLegal ? 'action' : 'error');
      }

      // ── Settlement ────────────────────────────────────────────────────
      addLine(t.resolvingAction, 'system');
      const settlement = await settleAction({
        actionName: playerOverride
          ? `${actionTag || 'search_area'} — architect custom order: "${playerOverride}"`
          : cardStyle
          ? `${actionTag} (${cardStyle} approach)`
          : actionTag || 'search_area',
        gameState: gs,
        caseData,
        agentStrategy,
        actionTag: actionTag || 'search_area',
        isIllegal: !isLegal,
        signal: ctrl.signal,
      });
      if (isCancelled()) return;

      // Apply results — pass agentStrategy for resistance/discount/skill modifiers
      settlement.action_name = actionTag || 'search_area';
      const { newState, newClues } = applySettlementResult(gs, settlement, agentStrategy, caseData);
      newState.lastAction = actionTag;
      newState.last_action = actionTag;

      // 高风险策略卡：撬开隐藏分支，额外保全一条线索
      if (hiddenBranch) {
        const locked = (caseData.clue_dictionary || [])
          .map(c => c.clue_id)
          .filter(id => !newState.unlocked_clues.includes(id));
        if (locked.length) {
          const bonus = locked[Math.floor(Math.random() * locked.length)];
          newState.unlocked_clues = [...newState.unlocked_clues, bonus];
          newState.unlocked_clues_set = new Set(newState.unlocked_clues);
          newClues.push(bonus);
          addLine(`\n${lang === 'zh' ? '🩸 高风险策略撬开了隐藏分支 — 一条本不该出现的证据浮出水面。' : '🩸 THE HIGH-RISK PLAY CRACKED A HIDDEN BRANCH — evidence surfaces that never should have.'}`, 'trap');
        }
      }

      // Conflict dictionary check — extra confusion for mutually exclusive clues
      if (checkConflictClues(newState.unlocked_clues, caseData.conflict_dictionary)) {
        newState.confusion_score = Math.min(100, newState.confusion_score + 15);
        addLine(`\n${t.logicConflict}`, 'warning');
      }

      // Push checkpoint at key zones
      if (caseData.checkpoints?.includes(newState.current_zone)) {
        newState.checkpoint_stack = pushCheckpoint(newState);
      }
      newState.chat_history = [
        ...gs.chat_history,
        { role: 'assistant', content: `[THINK] ${fullThought}\n[ACTION] ${actionTag}` },
        { role: 'user', content: `[RESULT] ${settlement.action_narration}` }
      ].slice(-12);

      // ── 证据危机延期结算：行动有 50% 概率顺带保全，超时永久丢失 ──────
      if (newState.evidence_crisis) {
        const ec = newState.evidence_crisis;
        if (newState.unlocked_clues.includes(ec.clue_id) === false) {
          newState.evidence_crisis = null;
        } else if (Math.random() < 0.5) {
          addLine(`\n🛡️ 本轮行动的余波顺带加密封存了证据「${ec.keyword}」！威胁解除。`, 'success');
          newState.evidence_crisis = null;
        } else if (newState.turn_count > ec.deadline) {
          newState.unlocked_clues = newState.unlocked_clues.filter(id => id !== ec.clue_id);
          newState.unlocked_clues_set = new Set(newState.unlocked_clues);
          setLinkedPairs(prev => prev.filter(p => p.a !== ec.clue_id && p.b !== ec.clue_id));
          addLine(`\n💀 证据「${ec.keyword}」已被销毁，永久丢失！`, 'error');
          newState.evidence_crisis = null;
        } else {
          addLine(`\n⏳ 证据「${ec.keyword}」仍处于销毁倒计时（第 ${ec.deadline} 轮前需保全）`, 'warning');
        }
      }

      // ── 危机事件引擎：每 4-6 轮随机触发 ──────────────────────────────
      if (newState.turn_count >= nextCrisisTurnRef.current) {
        nextCrisisTurnRef.current = newState.turn_count + nextCrisisIn();
        const evt = rollCrisis(newState, caseData);
        setTimeout(() => setCrisis(evt), 900);
      }

      setGameState(newState);

      // ── Build decision log entry ──────────────────────────────────────
      const isKeyDecision = newClues.length > 0
        || settlement.confusion_increase > 10
        || settlement.is_trap
        || (actionTag && ['present_evidence', 'analyze_forensics', 'check_alibi'].includes(actionTag));

      // ── Update flow map from the validated game-state location ─────────
      if (newState.current_zone) {
        setAgentPath(prev => [...prev, newState.current_zone]);
        if (settlement.action_narration) {
          const shortFeedback = settlement.action_narration.replace(/[^\u0000-\u007E\u4e00-\u9fa5]/g, '').slice(0, 28);
          setZoneFeedback(prev => ({ ...prev, [newState.current_zone]: shortFeedback }));
        }
      }

      setDecisionLog(prev => [...prev, {
        id: Date.now(),
        turn: gs.turn_count + 1,
        thought: fullThought,
        action: actionTag,
        observation: settlement.action_narration,
        newClues: newClues.map(id => {
          const c = caseData.clue_dictionary.find(x => x.clue_id === id);
          return c ? `${c.visual_icon} ${c.keyword}` : id;
        }),
        isTrap: !!settlement.is_trap,
        isKeyDecision,
        keyReason: settlement.is_trap
          ? '⚠ 陷阱事件触发'
          : newClues.length > 0
          ? `发现 ${newClues.length} 条新线索`
          : settlement.confusion_increase > 10
          ? '混乱值大幅上升'
          : isKeyDecision
          ? '关键逻辑节点'
          : '',
        timestamp: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      }]);

      // Show narration
      if (settlement.is_trap) {
        addLine(`\n${t.adversarialEvent} ${settlement.trap_narration || settlement.action_narration}`, 'trap');
      } else {
        addLine(`\n📋 ${settlement.action_narration}`, 'narration');
      }

      // Show new clues with parabola effect
      if (newClues.length > 0) {
        newClues.forEach(clueId => {
          const clue = caseData.clue_dictionary.find(c => c.clue_id === clueId);
          if (clue) {
            addLine(`\n${t.newEvidenceFound}${clue.visual_icon} ${clue.keyword}`, 'success');
            addLine(`   └─ ${clue.description}`, 'clue-desc');
            // Trigger multi-agent convergence FX
            triggerSynergy('clue_converge', clue);
          }
        });
        setNewClueIds(prev => [...prev, ...newClues]);
        setTimeout(() => setNewClueIds(prev => prev.filter(id => !newClues.includes(id))), 3000);
      }

      // Cross-validate synergy: trigger when action involves presenting evidence or examining
      const crossValidateActions = ['present_evidence', 'examine_clue', 'analyze_forensics', 'check_alibi'];
      if (actionTag && crossValidateActions.includes(actionTag) && newState.unlocked_clues.length >= 2) {
        const lastClue = caseData.clue_dictionary.find(c => newState.unlocked_clues.includes(c.clue_id));
        setTimeout(() => triggerSynergy('cross_validate', lastClue), 600);
      }

      if (settlement.confusion_increase > 0) {
       const confusionMsg = lang === 'zh' ? `⚠ 混乱值增加 ${settlement.confusion_increase}。[${newState.confusion_score}/100]` : `⚠ Confusion increased by ${settlement.confusion_increase}. [${newState.confusion_score}/100]`;
       addLine(`\n${confusionMsg}`, 'warning');
      }

      setReactState(ReAct_Enum.IDLE);
    } catch (err) {
      stopStressTimer();
      if (err?.name !== 'AbortError' && !isCancelled()) {
        addLine(`\n${t.systemError}${err.message}`, 'error');
      }
      if (activeRunRef.current === runId) setReactState(ReAct_Enum.IDLE);
    } finally {
      if (activeRunRef.current === runId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
        setReactState(ReAct_Enum.IDLE);
      }
    }
  };

  const handleAbort = () => {
    if (abortCtrlRef.current) {
      activeRunRef.current += 1;
      abortCtrlRef.current.abort();
      abortCtrlRef.current = null;
      decisionResolveRef.current?.(null);
      decisionResolveRef.current = null;
      setDecisionCards(null);
      setDecisionStory(null);
      setIsLinkChecking(false);
      addLine('\n🛑 AGENT ACTION ABORTED BY ARCHITECT', 'warning');
      stopStressTimer();
      setIsProcessing(false);
      setReactState(ReAct_Enum.IDLE);
      setThoughtText('');
    }
  };

  const handleNPCTalk = async (npc) => {
    setSelectedNPC(npc);
    setNpcDialogue([{ role: 'system', text: `— ${npc.name} ${t.npcEnters} —\n"${npc.initial_statement}"` }]);
  };

  const handleNPCSend = async (msg) => {
    if (!selectedNPC || !msg.trim() || isProcessing || abortCtrlRef.current) return;
    const npc = selectedNPC;
    const state = gameStateRef.current;
    const { ctrl, operationId } = beginAbortableOperation();
    setNpcDialogue(prev => [...prev, { role: 'agent', text: msg }]);
    setIsProcessing(true);
    const emo = getEmotion(npcEmotionState, npc.npc_id);
    try {
      const result = await getNPCDialogue({
        npcId: npc.npc_id,
        agentStatement: msg,
        gameState: state,
        caseData,
        agentStrategy,
        emotionLevel: emo.level,
        refusesTopic: emo.refuses_topic,
        signal: ctrl.signal,
      });
      if (!isOperationCurrent(ctrl, operationId)) return;
      setNpcDialogue(prev => [...prev, { role: 'npc', text: result.response, name: result.npc_name }]);

      // ── 情绪状态演进 ──
      const shift = result.emotion_shift || 0;
      const nextLevel = shiftEmotion(emo.level, shift);
      const hostileStreak = shift > 0 ? (emo.hostile_streak || 0) + 1 : 0;
      setNpcEmotionState(prev => ({
        ...prev,
        [npc.npc_id]: {
          ...emo, level: nextLevel,
          history_count: (emo.history_count || 0) + 1,
          hostile_streak: hostileStreak,
        },
      }));
      if (nextLevel !== emo.level) {
        setNpcDialogue(prev => [...prev, {
          role: 'system',
          text: lang === 'zh'
            ? `◈ ${npc.name} 的情绪状态变化：${nextLevel === 'broken' ? '崩溃' : nextLevel === 'shaken' ? '动摇' : '警惕'}`
            : `◈ ${npc.name}'s emotional state shifts: ${nextLevel.toUpperCase()}`,
        }]);
      }
      if (nextLevel === 'broken') {
        const reduction = Math.min(0.8, agentStrategy?.skill_effects?.npc_confusion_reduce || 0);
        const confusionIncrease = Math.round(6 * (1 - reduction));
        setGameState(prev => ({
          ...prev,
          confusion_score: Math.min(100, prev.confusion_score + confusionIncrease),
        }));
      }
      // 激怒未安抚 → 证人撤回证词，移除一条线索
      if (nextLevel === 'broken' && hostileStreak >= 3) {
        const owned = gameStateRef.current.unlocked_clues;
        if (owned.length) {
          const lost = owned[Math.floor(Math.random() * owned.length)];
          const lostClue = caseData.clue_dictionary.find(c => c.clue_id === lost);
          setGameState(prev => {
            const clues = prev.unlocked_clues.filter(id => id !== lost);
            return { ...prev, unlocked_clues: clues, unlocked_clues_set: new Set(clues) };
          });
          setLinkedPairs(prev => prev.filter(p => p.a !== lost && p.b !== lost));
          setNpcEmotionState(prev => ({
            ...prev,
            [npc.npc_id]: { ...prev[npc.npc_id], refuses_topic: lostClue?.keyword || 'the case' },
          }));
          addLine(`\n${lang === 'zh'
            ? `💀 证人撤回证词：${npc.name} 被彻底激怒，拒绝再配合。证据「${lostClue?.keyword || lost}」失效。`
            : `💀 WITNESS RETRACTS TESTIMONY: ${npc.name} is done cooperating. Evidence "${lostClue?.keyword || lost}" is void.`}`, 'error');
        }
      }
      // 破防审讯技能：自动追问 + 概率揭示新线索
      if (result.followup) {
        setNpcDialogue(prev => [...prev,
          { role: 'system', text: '💥 技能「破防审讯」发动 — 探员抓住破绽步步紧逼…' },
          { role: 'npc', text: result.followup, name: result.npc_name },
        ]);
        if (result.bonus_clue && !gameStateRef.current.unlocked_clues.includes(result.bonus_clue)) {
          const clue = caseData.clue_dictionary.find(c => c.clue_id === result.bonus_clue);
          setGameState(prev => {
            const clues = [...prev.unlocked_clues, result.bonus_clue];
            return { ...prev, unlocked_clues: clues, unlocked_clues_set: new Set(clues) };
          });
          setNewClueIds(prev => [...prev, result.bonus_clue]);
          setTimeout(() => setNewClueIds(prev => prev.filter(id => id !== result.bonus_clue)), 3000);
          addLine(`\n🔍 破防审讯揭示新线索：${clue?.visual_icon || '🔍'} ${clue?.keyword || result.bonus_clue}`, 'success');
          if (clue) triggerSynergy('clue_converge', clue);
        }
      }
    } catch (err) {
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        addLine(`\n${t.systemError}${err.message}`, 'error');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
      }
    }
  };

  // ── 危机事件应对 ──────────────────────────────────────────────────────────
  const handleCrisisChoice = (choiceId) => {
    const evt = crisis;
    setCrisis(null);
    if (!evt) return;
    const { changes, resultText } = applyCrisisChoice(evt, choiceId, gameStateRef.current, agentStrategy);
    addLine(`\n🚨 ${resultText}`, changes.confusion_delta > 0 ? 'warning' : 'success');
    setGameState(prev => {
      const next = { ...prev };
      if (changes.confusion_delta) next.confusion_score = Math.max(0, Math.min(100, next.confusion_score + changes.confusion_delta));
      if (changes.ap_delta) next.action_points_left = Math.max(0, next.action_points_left + changes.ap_delta);
      if (changes.reputation_delta) next.reputation = Math.max(0, next.reputation + changes.reputation_delta);
      if (changes.defer_evidence) next.evidence_crisis = changes.defer_evidence;
      return next;
    });
    if (changes.reopen_npc) {
      const npc = caseData.npcs.find(n => n.npc_id === changes.reopen_npc);
      if (npc) handleNPCTalk(npc);
    }
  };

  // ── 流程 D：错误连线 → 凶手反制事件 ───────────────────────────────────────
  const triggerVillainCounter = () => {
    const zh = lang === 'zh';
    const gs = gameStateRef.current;
    setGameState(prev => ({ ...prev, confusion_score: Math.min(100, prev.confusion_score + 8) }));

    if (Math.random() < 0.5 && gs.unlocked_clues.length > 0) {
      const lost = gs.unlocked_clues[Math.floor(Math.random() * gs.unlocked_clues.length)];
      const lostClue = caseData.clue_dictionary.find(c => c.clue_id === lost);
      setGameState(prev => {
        const clues = prev.unlocked_clues.filter(id => id !== lost);
        return { ...prev, unlocked_clues: clues, unlocked_clues_set: new Set(clues) };
      });
      setLinkedPairs(prev => prev.filter(p => p.a !== lost && p.b !== lost));
      setRedFlash(Date.now());
      addLine(`\n${zh
        ? `🔥 凶手反制：你的错误推演暴露了调查方向。证据「${lostClue?.keyword || lost}」已被彻底销毁。`
        : `🔥 KILLER'S COUNTERSTRIKE: your flawed deduction exposed the trail. Evidence "${lostClue?.keyword || lost}" has been destroyed.`}`, 'trap');
    } else {
      const npcs = caseData.npcs || [];
      const npc = npcs[Math.floor(Math.random() * npcs.length)];
      const topicClue = gs.unlocked_clues.length
        ? caseData.clue_dictionary.find(c => c.clue_id === gs.unlocked_clues[0])
        : null;
      if (npc) {
        setNpcEmotionState(prev => ({
          ...prev,
          [npc.npc_id]: {
            ...getEmotion(prev, npc.npc_id),
            level: 'calm',
            refuses_topic: topicClue?.keyword || (zh ? '案发当晚的行踪' : 'their whereabouts that night'),
          },
        }));
        setRedFlash(Date.now());
        addLine(`\n${zh
          ? `📵 凶手反制：${npc.name} 接到一条神秘警告 — 下次审讯将拒绝谈论「${topicClue?.keyword || '案发当晚'}」。`
          : `📵 KILLER'S COUNTERSTRIKE: ${npc.name} received a mysterious warning — they will refuse to discuss "${topicClue?.keyword || 'that night'}".`}`, 'trap');
      }
    }
  };

  // ── 流程 C：过场结束 → 注入不可逆状态 ────────────────────────────────────
  const handleCinematicDone = () => {
    const c = cinematic;
    setCinematic(null);
    if (!c) return;
    const zh = lang === 'zh';
    setTruthFragments(c.hidden_ending_progress || truthFragments + 1);
    addLine(`   └─ ${c.narrative}`, 'narration');
    if (c.villain_memory) addLine(`\n▚ ${zh ? '凶手视角回忆' : "KILLER'S MEMORY"}\n${c.villain_memory}`, 'thought');

    if (c.is_core_link) {
      const gs = gameStateRef.current;
      const locked = getAvailableClueIds(caseData, gs.current_zone, gs.unlocked_clues);
      const bonus = locked.length ? locked[Math.floor(Math.random() * locked.length)] : null;
      setGameState(prev => {
        const clues = bonus ? [...prev.unlocked_clues, bonus] : prev.unlocked_clues;
        return {
          ...prev,
          unlocked_clues: clues,
          unlocked_clues_set: new Set(clues),
          linked_core_pairs: [...(prev.linked_core_pairs || []), c.pairKey],
        };
      });
      if (bonus) {
        const bc = caseData.clue_dictionary.find(x => x.clue_id === bonus);
        setNewClueIds(ids => [...ids, bonus]);
        setTimeout(() => setNewClueIds(ids => ids.filter(id => id !== bonus)), 3000);
        addLine(`\n${zh ? '🧩 不可逆线索已写入证物库：' : '🧩 IRREVERSIBLE CLUE FILED: '}${bc?.visual_icon || '🔍'} ${bc?.keyword || c.new_clue_hint || bonus}`, 'success');
      }
    }
  };

  // ── 推理连线：AI 判定推理有效性 ───────────────────────────────────────────
  const handleLink = async (aId, bId) => {
    const clueA = caseData.clue_dictionary.find(c => c.clue_id === aId);
    const clueB = caseData.clue_dictionary.find(c => c.clue_id === bId);
    if (!clueA || !clueB || isLinkChecking || isProcessing || abortCtrlRef.current) return;
    const { ctrl, operationId } = beginAbortableOperation();
    setIsLinkChecking(true);
    setIsProcessing(true);
    try {
      const synergyActive = (agentStrategy?.synergy_skills || []).includes('cross_validation');
      const result = await linkCheck({ clueA, clueB, caseData, synergyActive, signal: ctrl.signal });
      if (!isOperationCurrent(ctrl, operationId)) return;
      setLinkedPairs(prev => [...prev, { a: aId, b: bId, valid: result.is_valid }]);
      if (result.is_valid) {
        addLine(`\n${t.insightBreak}${clueA.visual_icon} ${clueA.keyword} ⟺ ${clueB.visual_icon} ${clueB.keyword}`, 'success');
        // ── 推理重演过场：暂停主流程，全屏播放 ──
        const cine = await linkCinematic({
          clueA,
          clueB,
          caseData,
          fragmentsFound: truthFragments,
          signal: ctrl.signal,
        });
        if (!isOperationCurrent(ctrl, operationId)) return;
        const data = cine || {
          narrative: result.reveal, is_core_link: false,
          hidden_ending_progress: truthFragments + 1,
        };
        setCinematic({
          ...data,
          clueA, clueB,
          fragmentsBefore: truthFragments,
          fragmentsTotal: 7,
          pairKey: `${clueA.keyword} ⟺ ${clueB.keyword}`,
        });
      } else {
        addLine(`\n${t.logicInvalid}${clueA.keyword} ⟷ ${clueB.keyword}`, 'error');
        addLine(`   └─ ${result.reveal}`, 'clue-desc');
        triggerVillainCounter();
      }
    } catch (err) {
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        addLine(`\n${t.linkFailed}${err.message}`, 'error');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsLinkChecking(false);
        setIsProcessing(false);
      }
    }
  };

  const handleSubmitReport = async () => {
    if (!reportText.trim() || isProcessing || abortCtrlRef.current) return;
    const report = reportText.trim();
    const { ctrl, operationId } = beginAbortableOperation();
    setIsProcessing(true);
    setReactState(ReAct_Enum.REPORTING);
    try {
      // First: check for absurd branch (wrong accusation)
      const branch = await branchCheck({ playerReport: report, caseData, signal: ctrl.signal });
      if (!isOperationCurrent(ctrl, operationId)) return;
      if (branch?.is_absurd && branch?.branch_id) {
        const branchData = branch;
        if (branchData) {
          addLine(`\n${t.narrativeCollapse}${branchData.narrative}`, 'trap');
          addLine(`\n${t.apPenalty}-${branchData.impact?.ap_loss || 30}`, 'error');
          setGameState(prev => ({
            ...prev,
            action_points_left: Math.max(0, prev.action_points_left - (branchData.impact?.ap_loss || 30)),
            reputation: Math.max(0, prev.reputation - 25),
          }));
          return;
        }
      }

      // Standard judge evaluation
      const result = await judgeReport({ playerReport: report, caseData, signal: ctrl.signal });
      if (!isOperationCurrent(ctrl, operationId)) return;
      setJudgeResult(result);
      if (result.is_passed) {
        addLine(`\n${t.caseSolved}`, 'success');
        addLine(`\n${t.judgeVerdict} [${result.score}]: ${result.critique}`, 'success');
        setFinalJudgeResult(result);
        setTimeout(() => setShowGameOver(true), 1800);
      } else {
        const apLoss = result.score === 'D' ? Math.floor(gameStateRef.current.action_points_left * 0.5) : 3;
        setGameState(prev => ({
          ...prev,
          action_points_left: Math.max(0, prev.action_points_left - apLoss),
          reputation: Math.max(0, prev.reputation - 20),
          confusion_score: Math.min(100, prev.confusion_score + 10),
        }));
        addLine(`\n${t.reportRejected} [${result.score}]. AP -${apLoss}. Reputation -20.`, 'error');
        addLine(`\n${t.judgeLabel}${result.critique}`, 'warning');
      }
    } catch (err) {
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        addLine(`\n${t.systemError}${err.message}`, 'error');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
        setReactState(ReAct_Enum.IDLE);
        setReportMode(false);
      }
    }
  };

  const bgColor = phaseColor.bg;
  const accentColor = phaseColor.accent;

  if (showGameOver) {
    return (
      <GameOverScreen
        judgeResult={finalJudgeResult}
        gameState={gameState}
        caseData={caseData}
        rewardEligible={finalJudgeResult?.is_passed === true}
        onReturnToLobby={onBackToLobby}
        onReturnToLanding={onGameEnd}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col"
      style={{
        background: `radial-gradient(ellipse at top, ${bgColor} 0%, #040810 70%)`,
        fontFamily: "'Courier New', monospace",
        transition: 'background 1s ease',
      }}>

      <GlitchOverlay intensity={gameState.confusion_score} type={gameState.confusion_score > 75 ? 'red' : 'default'} />
      {showBSoD && (
        <BSoD agentId={agentStrategy?.agent_id || 'AXIOM'} onDismiss={() => {
          const immune = agentStrategy?.skill_effects?.bsod_immunity === true;
          setShowBSoD(false);
          setGameState(prev => ({
            ...prev,
            confusion_score: 0,
            action_points_left: immune ? prev.action_points_left : Math.max(0, prev.action_points_left - 5),
          }));
          addLine(`\n${t.agentRebooted}`, 'system');
        }} />
      )}

      {showOnboarding && (
        <OnboardingGuide
          accentColor={accentColor}
          onClose={() => {
            setShowOnboarding(false);
            try { localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ }
          }}
        />
      )}

      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}

      {/* 关键决策 · 行动策略卡 */}
      {decisionCards && (
        <DecisionCards
          cards={decisionCards}
          story={decisionStory}
          onChoose={(choice) => decisionResolveRef.current?.(choice)}
        />
      )}

      {/* 推理重演过场 */}
      {cinematic && <LinkCinematic data={cinematic} onDone={handleCinematicDone} />}

      {/* 凶手反制红色闪光 */}
      {redFlash > 0 && (
        <div key={redFlash} onAnimationEnd={() => setRedFlash(0)}
          style={{
            position: 'fixed', inset: 0, zIndex: 150, pointerEvents: 'none',
            background: 'radial-gradient(ellipse at center, rgba(255,0,32,0.35) 0%, rgba(140,0,16,0.6) 100%)',
            animation: 'red-strike 0.9s ease-out forwards',
          }}>
          <style>{`@keyframes red-strike{0%{opacity:0}15%{opacity:1}100%{opacity:0}}`}</style>
        </div>
      )}

      {/* 危机事件警报 */}
      {crisis && <CrisisAlert event={crisis} onChoose={handleCrisisChoice} />}

      {/* 推理突破高潮特效 */}
      <InsightFlashFX event={insightEvent} onDone={() => setInsightEvent(null)} />

      {/* Top HUD */}
      <div className="flex items-center justify-between px-4 py-2 border-b sticky top-0 z-50"
        style={{
          borderColor: `${accentColor}30`,
          background: `linear-gradient(180deg, rgba(10,18,32,0.55) 0%, rgba(2,6,14,0.35) 100%)`,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 ${accentColor}25, 0 8px 32px rgba(0,0,0,0.45)`,
          borderRadius: '0 0 16px 16px',
        }}>
        <div className="flex items-center gap-4">
          <button onClick={onBackToLobby} className="text-xs opacity-40 hover:opacity-80 transition-opacity"
            style={{ color: accentColor }}>{t.lobbyBtn}</button>
          <div className="text-xs font-bold tracking-widest" style={{ color: accentColor, textShadow: `0 0 10px ${accentColor}` }}>
            {caseData.title} · {caseData.subtitle}
          </div>
        </div>
        <div className="flex items-center gap-6 text-xs">
          {[
            { label: lang === 'zh' ? '阶段' : 'PHASE', val: phaseColor.label },
            { label: lang === 'zh' ? 'HP' : 'HP', val: `${gameState.current_hp}%` },
            { label: lang === 'zh' ? 'AP' : 'AP', val: `${gameState.action_points_left}/20` },
            { label: lang === 'zh' ? '线索' : 'CLUES', val: `${gameState.unlocked_clues.length}/${caseData.clue_dictionary.length}` },
            { label: lang === 'zh' ? '混乱' : 'CONFUSION', val: `${gameState.confusion_score}%` },
          ].map(s => (
            <div key={s.label} className="text-center">
              <div className="opacity-40" style={{ color: accentColor }}>{s.label}</div>
              <div className="font-bold" style={{
                color: (s.label === t.hudConfusion) && gameState.confusion_score > 60 ? '#ff3860' :
                  (s.label === t.hudHp) && gameState.current_hp < 30 ? '#ff3860' : accentColor
              }}>{s.val}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(true)}
            title={lang === 'zh' ? '设置' : 'Settings'}
            className="text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            ⚙️
          </button>
          <button onClick={() => setShowOnboarding(true)}
            title={lang === 'zh' ? '新手指引' : 'Field Briefing'}
            className="text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            ?
          </button>
          <button onClick={() => setReportMode(r => !r)}
            className="text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#00ff8850', color: '#00ff88', backgroundColor: reportMode ? '#00ff8820' : 'transparent' }}>
            {t.btnReport}
          </button>
          <button onClick={() => { setFinalJudgeResult(judgeResult); setShowGameOver(true); }}
            className="text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#ff386050', color: '#ff3860', backgroundColor: 'transparent' }}>
            {t.btnEnd}
          </button>
        </div>
      </div>

      {/* MiniMap — floating bottom-right */}
      <div style={{ position: 'fixed', bottom: 12, right: 12, zIndex: 30, pointerEvents: 'auto' }}>
        <MiniMap
          gameState={gameState}
          caseData={caseData}
          agentPath={agentPath}
          accentColor={accentColor}
        />
      </div>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden relative">

        {/* Agent Synergy FX overlay */}
        <AgentSynergyFX event={synergyEvent} />

        {/* Left: Terminal */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Terminal output */}
          <div ref={terminalRef} className="flex-1 overflow-y-auto p-4 space-y-1"
            style={{ scrollBehavior: 'smooth' }}>
            <div className="text-xs opacity-30 mb-4" style={{ color: accentColor }}>
              ═══ TERMINAL DETECTIVE SYSTEM · CASE: {caseData.case_id} · AGENT: {agentStrategy?.agent_id} ═══
            </div>
            {terminalLines.map(line => (
              <TerminalLine key={line.id} line={line} accentColor={accentColor} />
            ))}
            {thoughtText && (
              <div className="text-xs leading-relaxed" style={{ color: '#bf5fff', whiteSpace: 'pre-wrap' }}>
                {thoughtText}
                <span className="animate-pulse" style={{ color: '#bf5fff' }}>▊</span>
              </div>
            )}
            {isProcessing && !thoughtText && (
              <AIProcessingIndicator phase={reactState} stressLevel={stressLevel} />
            )}
          </div>

          {/* NPC Dialogue Box */}
          {selectedNPC && !reportMode && (
            <NPCDialogBox
              npc={selectedNPC}
              dialogue={npcDialogue}
              onSend={handleNPCSend}
              onClose={() => { handleAbort(); setSelectedNPC(null); setNpcDialogue([]); }}
              isProcessing={isProcessing}
              accentColor={accentColor}
              emotion={getEmotion(npcEmotionState, selectedNPC.npc_id)}
              hints={buildHints({
                npc: selectedNPC,
                clues: caseData.clue_dictionary,
                unlockedIds: gameState.unlocked_clues,
                emotionLevel: getEmotion(npcEmotionState, selectedNPC.npc_id).level,
                lang,
              })}
            />
          )}

          {/* Report Mode */}
          {reportMode && (
            <div className="p-4 border-t" style={{
              borderColor: '#00ff8830',
              backgroundColor: settings.panelLight ? skin.bg : 'transparent',
            }}>
              <div className="text-xs mb-2" style={{ color: settings.panelLight ? skin.text : '#00ff88' }}>{t.reportTitle}</div>
              <textarea
                className="w-full bg-transparent border rounded p-3 text-xs outline-none resize-none"
                style={{
                  borderColor: settings.panelLight ? skin.border : '#00ff8850',
                  color: settings.panelLight ? skin.text : '#00ff88',
                  height: 100,
                }}
                placeholder={t.reportPlaceholder}
                value={reportText}
                onChange={e => setReportText(e.target.value)}
                disabled={isProcessing}
              />
              <div className="flex gap-2 mt-2">
                <button onClick={handleSubmitReport} disabled={isProcessing}
                  className="flex-1 py-2 text-xs rounded border transition-all"
                  style={{ borderColor: '#00ff88', color: '#00ff88', backgroundColor: '#00ff8815' }}>
                  {t.reportSubmit}
                </button>
                <button onClick={() => setReportMode(false)}
                  className="px-4 py-2 text-xs rounded border opacity-50 hover:opacity-80"
                  style={{ borderColor: '#ffffff30', color: '#fff' }}>
                  {t.reportCancel}
                </button>
              </div>
              {judgeResult && <JudgeResult result={judgeResult} />}
            </div>
          )}

          {/* Action Bar */}
          <div className="p-4 border-t flex items-center gap-3 flex-wrap"
            style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <button onClick={runReActCycle} disabled={isProcessing || gameState.action_points_left <= 0}
              className="px-6 py-2 text-xs font-bold tracking-widest rounded border transition-all hover:scale-105 active:scale-95 disabled:opacity-30"
              style={{
                borderColor: accentColor, color: accentColor,
                backgroundColor: `${accentColor}15`,
                boxShadow: `0 0 15px ${accentColor}30`,
                textShadow: `0 0 8px ${accentColor}`,
              }}>
              {t.executeCycle}
            </button>
            {isProcessing && (
              <button onClick={handleAbort}
                className="px-4 py-2 text-xs rounded border transition-all"
                style={{ borderColor: '#ff386060', color: '#ff3860', backgroundColor: '#ff386015' }}>
                {t.abortBtn}
              </button>
            )}
            <div className="flex gap-2 flex-wrap">
              {caseData.npcs.map(npc => (
                <button key={npc.npc_id} onClick={() => handleNPCTalk(npc)}
                  disabled={isProcessing}
                  className="px-3 py-1 text-xs rounded border transition-all hover:opacity-80 disabled:opacity-30 inline-flex items-center gap-2"
                  style={{ borderColor: `${accentColor}40`, color: `${accentColor}cc`, backgroundColor: `${accentColor}08` }}>
                  <span>{npc.avatar} {npc.name}</span>
                  <EmotionBadge level={getEmotion(npcEmotionState, npc.npc_id).level} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-72 border-l flex flex-col overflow-hidden"
          style={{
            borderColor: settings.panelLight ? skin.border : `${accentColor}20`,
            backgroundColor: settings.panelLight ? skin.bg : 'rgba(0,0,0,0.4)',
            color: settings.panelLight ? skin.text : undefined,
          }}>
          <ToolPanelTabs
            active={toolTab}
            onChange={setToolTab}
            accentColor={accentColor}
            badges={{
              evidence: gameState.unlocked_clues.length,
              link: linkedPairs.filter(p => p.valid).length,
              log: decisionLog.filter(e => e.isKeyDecision || e.isTrap).length,
            }}
          />
          {toolTab === 'link' ? (
            <LinkBoard
              clues={caseData.clue_dictionary}
              unlockedIds={gameState.unlocked_clues}
              linkedPairs={linkedPairs}
              onLink={handleLink}
              isChecking={isLinkChecking}
              accentColor={accentColor}
            />
          ) : toolTab === 'map' ? (
            <CaseFlowMap
              gameState={gameState}
              caseData={caseData}
              agentPath={agentPath}
              zoneFeedback={zoneFeedback}
              accentColor={accentColor}
              agentStrategy={agentStrategy}
              onPriorityChange={() => {}}
            />
          ) : toolTab === 'log' ? (
            <DecisionLog entries={decisionLog} accentColor={accentColor} />
          ) : toolTab === 'board' ? (
            <div className="flex-1 p-2">
              <div className="text-xs mb-2 tracking-widest text-center" style={{ color: accentColor }}>{t.btnBoard}</div>
              <div style={{ height: 'calc(100% - 30px)' }}>
                <EvidenceBoard
                  clues={caseData.clue_dictionary}
                  unlockedIds={gameState.unlocked_clues}
                  validEdges={linkedPairs.filter(pair => pair.valid).map(pair => [pair.a, pair.b])}
                  caseData={caseData}
                />
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              <div className="text-xs tracking-widest mb-3" style={{ color: accentColor }}>
                {t.evidenceLocker} ({gameState.unlocked_clues.length})
              </div>
              {gameState.unlocked_clues.length === 0 ? (
                <div className="text-xs opacity-30 text-center mt-8" style={{ color: accentColor }}>
                  {t.noEvidence}
                </div>
              ) : (
                gameState.unlocked_clues.map(id => {
                  const clue = caseData.clue_dictionary.find(c => c.clue_id === id);
                  return clue ? <ClueCard key={id} clue={clue} isNew={newClueIds.includes(id)} compact /> : null;
                })
              )}
            </div>
          )}

          {/* Confusion Meter */}
          <div className="p-3 border-t" style={{ borderColor: `${accentColor}20` }}>
            <div className="flex justify-between text-xs mb-1">
              <span style={{ color: accentColor }}>{t.confusionLabel}</span>
              <span style={{ color: gameState.confusion_score > 60 ? '#ff3860' : accentColor }}>
                {gameState.confusion_score}%
              </span>
            </div>
            <div className="h-2 rounded overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
              <div className="h-full transition-all duration-500 rounded"
                style={{
                  width: `${gameState.confusion_score}%`,
                  background: gameState.confusion_score > 75
                    ? 'linear-gradient(to right, #ff3860, #ff0020)'
                    : gameState.confusion_score > 40
                    ? 'linear-gradient(to right, #ffaa00, #ff5500)'
                    : `linear-gradient(to right, ${accentColor}, ${accentColor}80)`,
                  boxShadow: `0 0 8px ${gameState.confusion_score > 75 ? '#ff3860' : accentColor}`,
                }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TerminalLine({ line, accentColor }) {
  const colors = {
    default: '#c0c0d0',
    phase: accentColor,
    observe: '#00e5ff',
    thought: '#bf5fff',
    action: '#00ff88',
    narration: '#e0e0f0',
    clue_desc: '#8888aa',
    success: '#00ff88',
    error: '#ff3860',
    warning: '#ffaa00',
    trap: '#ff6600',
    system: '#8888aa',
    divider: '#ffffff15',
  };
  const color = colors[line.type] || colors.default;
  return (
    <div className="text-xs leading-relaxed whitespace-pre-wrap"
      style={{ color, fontFamily: 'monospace' }}>
      {line.text}
    </div>
  );
}

function NPCDialogBox({ npc, dialogue, onSend, onClose, isProcessing, accentColor, emotion, hints }) {
  const { t } = useLang();
  const [msg, setMsg] = useState('');
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [dialogue]);

  return (
    <div className="border-t p-3" style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-bold flex items-center gap-2" style={{ color: accentColor }}>
          <span>{npc.avatar} {t.interrogating}: {npc.name} · {npc.role}</span>
          <EmotionBadge level={emotion?.level} />
        </div>
        <button onClick={onClose} className="text-xs opacity-40 hover:opacity-80" style={{ color: accentColor }}>✕</button>
      </div>
      <div ref={ref} className="max-h-32 overflow-y-auto space-y-1 mb-2">
        {dialogue.map((d, i) => (
          <div key={i} className="text-xs" style={{
            color: d.role === 'agent' ? '#00ff88' : d.role === 'npc' ? '#ffaa00' : '#8888aa',
            fontStyle: d.role === 'system' ? 'italic' : 'normal'
          }}>
            {d.role === 'agent' ? '> AGENT: ' : d.role === 'npc' ? `${npc.avatar} ${d.name}: ` : ''}{d.text}
          </div>
        ))}
      </div>
      <InterrogationHints hints={hints} onPick={(text) => setMsg(text)} />
      <div className="flex gap-2">
        <input
          className="flex-1 bg-transparent border rounded px-2 py-1 text-xs outline-none"
          style={{ borderColor: `${accentColor}40`, color: accentColor }}
          placeholder={`${t.interrogating}: ${npc.name}...`}
          value={msg}
          onChange={e => setMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !isProcessing) { onSend(msg); setMsg(''); } }}
          disabled={isProcessing}
        />
        <button onClick={() => { onSend(msg); setMsg(''); }} disabled={isProcessing || !msg.trim()}
          className="px-3 text-xs rounded border disabled:opacity-30"
          style={{ borderColor: `${accentColor}50`, color: accentColor }}>
          {t.sendBtn}
        </button>
      </div>
    </div>
  );
}

function JudgeResult({ result }) {
  const { t } = useLang();
  const scoreColors = { S: '#00ff88', A: '#00ffff', B: '#ffaa00', C: '#ff6600', D: '#ff3860' };
  const color = scoreColors[result.score] || '#ffffff';
  return (
    <div className="mt-3 p-3 rounded border" style={{ borderColor: `${color}50`, backgroundColor: `${color}10` }}>
      <div className="flex items-center gap-3 mb-2">
        <div className="text-3xl font-bold" style={{ color, textShadow: `0 0 20px ${color}` }}>{result.score}</div>
        <div className="text-xs" style={{ color }}>
          {result.is_passed ? t.caseClosedTag : t.reportRejectedTag}
        </div>
      </div>
      <div className="text-xs" style={{ color: `${color}cc` }}>{result.critique}</div>
    </div>
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
