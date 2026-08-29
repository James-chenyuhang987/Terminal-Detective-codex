import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { ReAct_Enum, Legal_Actions_List, Phase_Color_Map, Case_Data_Lvl_01, localizeCase } from '@/game/caseData';
import { useLang } from '@/lib/lang.jsx';
import MiniMap from '@/components/game/MiniMap';
import { createInitialGameState, generateObservation, applySettlementResult, pushCheckpoint, checkConflictClues } from '@/game/gameState';
import { getAvailableClueIds, getInitialZone } from '@/game/caseRuntime';
import { streamThinkSSE, getAction, settleAction, getNPCDialogue, judgeReport, branchCheck, parseActionTag, linkCheck, setLLMLang, generateDecisionCards, linkCinematic } from '@/game/llmClient';
import DecisionCards from '@/components/game/DecisionCards';
import LinkCinematic from '@/components/game/LinkCinematic';
import { EmotionBadge } from '@/components/game/InterrogationHints';
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
import { JudgeResult, NPCDialogBox, TerminalLine } from '@/components/game/investigation/TerminalPanels';
import { useManagedTimers } from '@/components/game/investigation/useManagedTimers';
import CommandConsole from '@/components/game/CommandConsole';
import InvestigationAssistant from '@/components/game/InvestigationAssistant';
import { buildInvestigationBrief } from '@/game/investigationAssistant';
import ActionCinematicFallback from '@/components/game/cinematics/ActionCinematicFallback';
import CinematicErrorBoundary from '@/components/game/cinematics/CinematicErrorBoundary';
import { loadActionCinematic, preloadActionCinematic } from '@/components/game/cinematics/actionCinematicLoader';
import {
  buildCinematicEvent,
  detectCinematicPlayback,
  shouldPlayActionCinematic,
} from '@/game/actionCinematic';
import {
  applyCommandContingency,
  applyDecisionCommandCost,
  applyEmergencyStabilize,
  awardCommandMilestone,
  buildExecutingStrategy,
  recommendExecutor,
} from '@/game/commandSystem';
import {
  getTerminalLinesForTurn,
  getTerminalTurns,
  stepTerminalTurn,
} from '@/game/turnArchive';
import { getRejectedReportPenalty } from '@/game/caseEvaluation';

const LazyActionCinematic = React.lazy(loadActionCinematic);

const PHASE_COLORS = Phase_Color_Map;

export default function InvestigationTerminal({ agentStrategy, selectedCase, onGameEnd, onBackToLobby, onSettlement }) {
  const { lang, t } = useLang();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const skin = panelSkin(settings.panelLight);
  const { schedule, wait } = useManagedTimers();
  const caseDataResolved = selectedCase || Case_Data_Lvl_01;
  const [runtimePriority, setRuntimePriority] = useState(() => agentStrategy?.priority_list || []);
  const activeAgentStrategy = useMemo(() => ({
    ...(agentStrategy || {}),
    priority_list: runtimePriority,
    team: (agentStrategy?.team || []).map(agent => agent.agent_id === agentStrategy?.primary_agent_id
      ? { ...agent, priority_list: runtimePriority }
      : agent),
  }), [agentStrategy, runtimePriority]);

  const caseData = useMemo(
    () => localizeCase(caseDataResolved, lang),
    [caseDataResolved, lang],
  );
  // AI 叙事输出语言跟随界面语言
  useEffect(() => { setLLMLang(lang); }, [lang]);

  const [gameState, setGameState] = useState(() => createInitialGameState(
    caseDataResolved,
    agentStrategy?.home_effects,
    agentStrategy?.command_plan,
    agentStrategy?.primary_agent_id,
  ));
  const [reactState, setReactState] = useState(ReAct_Enum.IDLE);
  const [terminalLines, setTerminalLines] = useState([]);
  const [activeTerminalTurn, setActiveTerminalTurn] = useState(() => Math.max(0, Number(gameState.turn_count) || 0));
  const [viewedTerminalTurn, setViewedTerminalTurn] = useState(() => Math.max(0, Number(gameState.turn_count) || 0));
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
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [decisionLog, setDecisionLog] = useState([]);
  const [agentPath, setAgentPath] = useState(() => [getInitialZone(caseDataResolved)].filter(Boolean));
  const [zoneFeedback, setZoneFeedback] = useState({});
  const [thoughtText, setThoughtText] = useState('');
  const [synergyEvent, setSynergyEvent] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showCommandConsole, setShowCommandConsole] = useState(false);
  const [commandNotice, setCommandNotice] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => settings.investigationTutorialEnabled !== false);
  const [finalJudgeResult, setFinalJudgeResult] = useState(null);
  // ── 关键决策 / 危机事件 / 推理连线 ──
  const [decisionCards, setDecisionCards] = useState(null);
  const [decisionStory, setDecisionStory] = useState(null);
  const [cinematic, setCinematic] = useState(null);
  const [actionCinematic, setActionCinematic] = useState(null);
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
  const bsodCountRef = useRef(0);
  const commandNoticeTimerRef = useRef(null);
  const actionCinematicResolveRef = useRef(null);
  const actionCinematicTimerRef = useRef(null);
  const playedActionCinematicsRef = useRef(new Set());

  const triggerSynergy = useCallback((type, clue) => {
    setSynergyEvent({
      type,
      clueIcon: clue?.visual_icon || '🔍',
      clueKeyword: clue?.keyword || (lang === 'zh' ? '未知线索' : 'UNKNOWN CLUE'),
      id: Date.now(),
    });
  }, []);

  const terminalRef = useRef(null);
  const terminalScrollFrameRef = useRef(null);
  const stressTimerRef = useRef(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;
  const activeTerminalTurnRef = useRef(activeTerminalTurn);
  activeTerminalTurnRef.current = activeTerminalTurn;
  const viewedTerminalTurnRef = useRef(viewedTerminalTurn);
  viewedTerminalTurnRef.current = viewedTerminalTurn;

  useEffect(() => () => {
    activeRunRef.current += 1;
    abortCtrlRef.current?.abort();
    abortCtrlRef.current = null;
    decisionResolveRef.current?.(null);
    decisionResolveRef.current = null;
    window.clearTimeout(actionCinematicTimerRef.current);
    actionCinematicTimerRef.current = null;
    actionCinematicResolveRef.current?.('unmounted');
    actionCinematicResolveRef.current = null;
    clearInterval(stressTimerRef.current);
    clearTimeout(commandNoticeTimerRef.current);
    window.cancelAnimationFrame(terminalScrollFrameRef.current);
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
  const terminalTurns = useMemo(
    () => getTerminalTurns(terminalLines, activeTerminalTurn),
    [activeTerminalTurn, terminalLines],
  );
  const visibleTerminalLines = useMemo(
    () => getTerminalLinesForTurn(terminalLines, viewedTerminalTurn),
    [terminalLines, viewedTerminalTurn],
  );
  const latestTerminalTurn = terminalTurns[terminalTurns.length - 1] || 0;
  const viewedTerminalTurnIndex = Math.max(0, terminalTurns.indexOf(viewedTerminalTurn));
  const isViewingActiveTerminalTurn = viewedTerminalTurn === activeTerminalTurn;

  const scrollToBottom = useCallback(() => {
    window.cancelAnimationFrame(terminalScrollFrameRef.current);
    terminalScrollFrameRef.current = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (terminal) terminal.scrollTop = terminal.scrollHeight;
    });
  }, []);

  useLayoutEffect(() => {
    if (isViewingActiveTerminalTurn) scrollToBottom();
  }, [visibleTerminalLines.length, thoughtText, isProcessing, isViewingActiveTerminalTurn, scrollToBottom]);

  useLayoutEffect(() => {
    window.cancelAnimationFrame(terminalScrollFrameRef.current);
    terminalScrollFrameRef.current = window.requestAnimationFrame(() => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      terminal.scrollTop = isViewingActiveTerminalTurn ? terminal.scrollHeight : 0;
    });
  }, [isViewingActiveTerminalTurn, viewedTerminalTurn]);

  const addLine = useCallback((text, type = 'default', prefix = '') => {
    const turn = activeTerminalTurnRef.current;
    setTerminalLines(prev => [...prev, { text, type, prefix, turn, id: Date.now() + Math.random() }]);
    if (viewedTerminalTurnRef.current === turn) schedule(scrollToBottom, 50);
  }, [schedule, scrollToBottom]);

  const notifyCommand = useCallback((message, type = 'success') => {
    window.clearTimeout(commandNoticeTimerRef.current);
    setCommandNotice({ message, type });
    commandNoticeTimerRef.current = window.setTimeout(() => setCommandNotice(null), 2600);
  }, []);

  const finishActionCinematic = useCallback((reason = 'completed') => {
    const resolve = actionCinematicResolveRef.current;
    if (!resolve) return;
    actionCinematicResolveRef.current = null;
    window.clearTimeout(actionCinematicTimerRef.current);
    actionCinematicTimerRef.current = null;
    setActionCinematic(null);
    resolve(reason);
  }, []);

  const handleActionCinematicComplete = useCallback((reason = 'completed') => {
    if (reason === 'fallback') {
      setActionCinematic(current => current?.mode === '3d'
        ? { ...current, mode: '2d', fallbackReason: 'renderer_lost' }
        : current);
      return;
    }
    finishActionCinematic(reason);
  }, [finishActionCinematic]);

  const playActionCinematic = useCallback((event) => {
    if (!event || playedActionCinematicsRef.current.has(event.eventId)) {
      return Promise.resolve('duplicate');
    }
    playedActionCinematicsRef.current.add(event.eventId);
    const playback = detectCinematicPlayback({ enabled: settings.cinematicsEnabled !== false });

    return new Promise(resolve => {
      if (actionCinematicResolveRef.current) finishActionCinematic('replaced');
      actionCinematicResolveRef.current = resolve;
      setActionCinematic({ event, ...playback });
      actionCinematicTimerRef.current = window.setTimeout(() => {
        finishActionCinematic('timeout');
      }, 8000);
    });
  }, [finishActionCinematic, settings.cinematicsEnabled]);

  useEffect(() => {
    const result = applyCommandContingency(gameState);
    if (!result.event || result.gameState === gameState) return;
    setGameState(result.gameState);
    if (result.event.type === 'error') {
      const message = lang === 'zh' ? '应急预案未执行：指挥点不足' : 'CONTINGENCY MISSED: INSUFFICIENT COMMAND POINTS';
      notifyCommand(message, 'error');
      addLine(`\n⚠ ${message}`, 'error');
      return;
    }
    const messages = {
      cognitive_stabilizer: lang === 'zh' ? '认知稳压已执行 · 混乱 -12' : 'COGNITIVE STABILIZER EXECUTED · CONFUSION -12',
      emergency_throttle: lang === 'zh' ? '紧急节流已待命 · 下一行动 AP -2' : 'EMERGENCY THROTTLE ARMED · NEXT ACTION AP -2',
      evidence_lockdown: lang === 'zh' ? '证据封存已执行 · 销毁期限 +1 回合' : 'EVIDENCE LOCKDOWN EXECUTED · DEADLINE +1 TURN',
    };
    const message = messages[result.event.id] || (lang === 'zh' ? '应急预案已执行' : 'CONTINGENCY EXECUTED');
    notifyCommand(message);
    addLine(`\n◆ ${message}`, 'success');
  }, [addLine, gameState, lang, notifyCommand]);

  const handleEmergencyStabilize = useCallback(() => {
    if (isProcessing) return;
    const result = applyEmergencyStabilize(gameStateRef.current);
    if (result.error) {
      const message = result.error === 'insufficient_command_points'
        ? (lang === 'zh' ? '指挥点不足' : 'INSUFFICIENT COMMAND POINTS')
        : (lang === 'zh' ? '紧急稳态本案已使用' : 'EMERGENCY STABILIZE ALREADY USED');
      notifyCommand(message, 'error');
      return;
    }
    setGameState(result.gameState);
    const message = lang === 'zh' ? '紧急稳态执行成功 · 混乱 -12' : 'EMERGENCY STABILIZE EXECUTED · CONFUSION -12';
    notifyCommand(message);
    addLine(`\n◇ ${message}`, 'success');
  }, [addLine, isProcessing, lang, notifyCommand]);

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
        schedule(() => setNewClueIds(prev => prev.filter(id => id !== hc.clue_id)), 3000);
      }
    });
  }, [gameState.turn_count]);

  // Confusion / crash monitoring
  useEffect(() => {
    if (gameState.confusion_score >= 100 && !showBSoD) {
      bsodCountRef.current += 1;
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
    schedule(() => setStressLevel(0), 500);
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

    const nextTurn = Math.max(1, (Number(gs.turn_count) || 0) + 1);
    activeTerminalTurnRef.current = nextTurn;
    viewedTerminalTurnRef.current = nextTurn;
    setActiveTerminalTurn(nextTurn);
    setViewedTerminalTurn(nextTurn);

    const { ctrl, operationId: runId } = beginAbortableOperation();
    setIsProcessing(true);
    const isCancelled = () => ctrl.signal.aborted || activeRunRef.current !== runId;

    try {
      // ── Phase 1: OBSERVE ──────────────────────────────────────────────
      setReactState(ReAct_Enum.OBSERVE);
      const observation = generateObservation(gs, caseData, lang);
      addLine('\n' + '═'.repeat(50), 'divider');
      addLine(`◈ ${t.turnLabel} ${gs.turn_count + 1} — ${t.observationPhase}`, 'phase');
      addLine(observation, 'observe');
      await wait(800);
      if (isCancelled()) return;

      // ── Phase 2: THINK ────────────────────────────────────────────────
      setReactState(ReAct_Enum.THINK);
      addLine('\n' + t.neuralProcessing, 'phase');
      setThoughtText('');

      startStressTimer();
      let fullThought = '';

      await streamThinkSSE({
        gameState: gs,
        agentStrategy: activeAgentStrategy,
        chatHistory: gs.chat_history.slice(-6),
        banList: gs.action_ban_list,
        observation,
        signal: ctrl.signal,
        onChunk: (char) => {
          fullThought += char;
          setThoughtText(prev => prev + char);
          if (viewedTerminalTurnRef.current === activeTerminalTurnRef.current) scrollToBottom();
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
        agentStrategy: activeAgentStrategy,
        signal: ctrl.signal,
      });

      stopStressTimer();
      if (isCancelled()) return;

      let actionTag = parseActionTag(actionText);
      let playerOverride = null;
      let cardStyle = null;
      let hiddenBranch = false;
      let executorAgentId = gameStateRef.current.command_state?.active_agent_id
        || activeAgentStrategy?.primary_agent_id
        || recommendExecutor(activeAgentStrategy?.team, actionTag || 'search_area');
      let assistAgentId = null;
      let commandIds = [];

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
        if (settings.cinematicsEnabled !== false) {
          void preloadActionCinematic();
        }
        setDecisionCards(cards);
        const choice = await new Promise(resolve => { decisionResolveRef.current = resolve; });
        setDecisionCards(null);
        setDecisionStory(null);
        decisionResolveRef.current = null;
        if (!choice || isCancelled()) return;

        executorAgentId = choice.executorAgentId || executorAgentId;
        assistAgentId = choice.assistAgentId || null;
        commandIds = Array.isArray(choice.commandIds) ? choice.commandIds : [];

        if (choice.freeform) {
          addLine(`\n${lang === 'zh' ? '🎙 架构师自由指令：' : '🎙 ARCHITECT FREE ORDER: '}"${choice.freeform}"`, 'action');
          const overrideStrategy = buildExecutingStrategy(
            activeAgentStrategy,
            fallbackTag,
            executorAgentId,
            assistAgentId,
            commandIds.includes('joint_action'),
          );
          const overrideText = await getAction({
            thoughtProcess: `${fullThought}\n\n[ARCHITECT OVERRIDE ORDER — player_override=true] ${choice.freeform}`,
            gameState: gs,
            agentStrategy: overrideStrategy,
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
      const executingStrategy = buildExecutingStrategy(
        activeAgentStrategy,
        actionTag || 'search_area',
        executorAgentId,
        assistAgentId,
        commandIds.includes('joint_action'),
      );

      if (actionTag) {
        const actionMsg = lang === 'zh' ? `▶ 行动已下达：[${actionTag.toUpperCase()}]` : `▶ ACTION ISSUED: [${actionTag.toUpperCase()}]`;
        addLine(`\n${actionMsg}`, isLegal ? 'action' : 'error');
        const executorMessage = lang === 'zh'
          ? `执行探员 ${executingStrategy.executing_agent_id}${executingStrategy.assisting_agent_id ? ` · 协助 ${executingStrategy.assisting_agent_id}` : ''}`
          : `EXECUTOR ${executingStrategy.executing_agent_id}${executingStrategy.assisting_agent_id ? ` · ASSIST ${executingStrategy.assisting_agent_id}` : ''}`;
        addLine(`   └─ ${executorMessage}`, 'system');
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
        agentStrategy: executingStrategy,
        actionTag: actionTag || 'search_area',
        isIllegal: !isLegal,
        signal: ctrl.signal,
      });
      if (isCancelled()) return;

      // Apply results — pass agentStrategy for resistance/discount/skill modifiers
      settlement.action_name = actionTag || 'search_area';
      let { newState, newClues } = applySettlementResult(gs, settlement, executingStrategy, caseData);
      const deferredOutcomeLines = [];
      const deferredNotices = [];
      let removedCrisisClueId = null;
      newState.lastAction = actionTag;
      newState.last_action = actionTag;
      const committedCommand = applyDecisionCommandCost(newState, commandIds);
      if (committedCommand.error) {
        throw new Error(lang === 'zh' ? '指挥命令结算失败：指挥点不足。' : 'COMMAND SETTLEMENT FAILED: INSUFFICIENT COMMAND POINTS.');
      }
      newState = {
        ...committedCommand.gameState,
        command_state: {
          ...committedCommand.gameState.command_state,
          active_agent_id: executingStrategy.executing_agent_id,
        },
      };
      if (commandIds.length) {
        const commandMessage = lang === 'zh'
          ? `指挥命令生效 · 消耗 ${committedCommand.cost} 点`
          : `COMMANDS COMMITTED · ${committedCommand.cost} POINTS SPENT`;
        addLine(`\n◆ ${commandMessage}`, 'success');
        notifyCommand(commandMessage);
      }

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
          deferredOutcomeLines.push([`\n${lang === 'zh' ? '🩸 高风险策略撬开了隐藏分支 — 一条本不该出现的证据浮出水面。' : '🩸 THE HIGH-RISK PLAY CRACKED A HIDDEN BRANCH — evidence surfaces that never should have.'}`, 'trap']);
        }
      }

      // Conflict dictionary check — extra confusion for mutually exclusive clues
      if (checkConflictClues(newState.unlocked_clues, caseData.conflict_dictionary)) {
        newState.confusion_score = Math.min(100, newState.confusion_score + 15);
        deferredOutcomeLines.push([`\n${t.logicConflict}`, 'warning']);
      }

      // Push checkpoint at key zones
      if (newState.current_zone !== gs.current_zone && caseData.checkpoints?.includes(newState.current_zone)) {
        const milestone = awardCommandMilestone(newState.command_state, `checkpoint:${newState.current_zone}`);
        newState.command_state = milestone.state;
        if (milestone.awarded) {
          const message = lang === 'zh' ? `检查点抵达 · 指挥点 +${milestone.awarded}` : `CHECKPOINT REACHED · COMMAND +${milestone.awarded}`;
          deferredOutcomeLines.push([`\n◇ ${message}`, 'success']);
          deferredNotices.push(message);
        }
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
          deferredOutcomeLines.push([lang === 'zh'
            ? `\n🛡️ 本轮行动的余波顺带加密封存了证据「${ec.keyword}」！威胁解除。`
            : `\n🛡️ This action also encrypted and secured “${ec.keyword}”. Threat cleared.`, 'success']);
          newState.evidence_crisis = null;
        } else if (newState.turn_count > ec.deadline) {
          newState.unlocked_clues = newState.unlocked_clues.filter(id => id !== ec.clue_id);
          newState.unlocked_clues_set = new Set(newState.unlocked_clues);
          removedCrisisClueId = ec.clue_id;
          deferredOutcomeLines.push([lang === 'zh' ? `\n💀 证据「${ec.keyword}」已被销毁，永久丢失！` : `\n💀 Evidence “${ec.keyword}” was destroyed and is permanently lost.`, 'error']);
          newState.evidence_crisis = null;
        } else {
          deferredOutcomeLines.push([lang === 'zh' ? `\n⏳ 证据「${ec.keyword}」仍处于销毁倒计时（第 ${ec.deadline} 轮前需保全）` : `\n⏳ Evidence “${ec.keyword}” remains on a purge timer (secure it before turn ${ec.deadline}).`, 'warning']);
        }
      }

      const actualTrapTriggered = (Number(newState.traps_triggered) || 0) > (Number(gs.traps_triggered) || 0);
      const cinematicSettlement = { ...settlement, is_trap: actualTrapTriggered };
      if (shouldPlayActionCinematic(gs, newState, cinematicSettlement, caseData)) {
        const event = buildCinematicEvent({
          previousState: gs,
          nextState: newState,
          settlement: cinematicSettlement,
          caseData,
          actionTag: actionTag || 'search_area',
          executorAgentId: executingStrategy.executing_agent_id,
          assistAgentId: executingStrategy.assisting_agent_id,
        });
        await playActionCinematic(event);
        if (isCancelled()) return;
      }

      // ── 危机事件引擎：每 4-6 轮随机触发 ──────────────────────────────
      if (newState.turn_count >= nextCrisisTurnRef.current) {
        nextCrisisTurnRef.current = newState.turn_count + nextCrisisIn();
        const evt = rollCrisis(newState, caseData, lang);
        schedule(() => setCrisis(evt), 900);
      }

      setGameState(newState);
      if (removedCrisisClueId) {
        setLinkedPairs(prev => prev.filter(pair => pair.a !== removedCrisisClueId && pair.b !== removedCrisisClueId));
      }
      deferredOutcomeLines.forEach(([message, type]) => addLine(message, type));
      deferredNotices.forEach(message => notifyCommand(message));

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
          ? (lang === 'zh' ? '⚠ 陷阱事件触发' : '⚠ TRAP EVENT TRIGGERED')
          : newClues.length > 0
          ? (lang === 'zh' ? `发现 ${newClues.length} 条新线索` : `${newClues.length} NEW CLUES FOUND`)
          : settlement.confusion_increase > 10
          ? (lang === 'zh' ? '混乱值大幅上升' : 'CONFUSION SPIKED')
          : isKeyDecision
          ? (lang === 'zh' ? '关键逻辑节点' : 'KEY LOGIC NODE')
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
        schedule(() => setNewClueIds(prev => prev.filter(id => !newClues.includes(id))), 3000);
      }

      // Cross-validate synergy: trigger when action involves presenting evidence or examining
      const crossValidateActions = ['present_evidence', 'examine_clue', 'analyze_forensics', 'check_alibi'];
      if (actionTag && crossValidateActions.includes(actionTag) && newState.unlocked_clues.length >= 2) {
        const lastClue = caseData.clue_dictionary.find(c => newState.unlocked_clues.includes(c.clue_id));
        schedule(() => triggerSynergy('cross_validate', lastClue), 600);
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
        agentStrategy: activeAgentStrategy,
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
          { role: 'system', text: lang === 'zh' ? '💥 技能「破防审讯」发动 — 探员抓住破绽步步紧逼…' : '💥 BREAKTHROUGH INTERROGATION activated — the agent presses the opening…' },
          { role: 'npc', text: result.followup, name: result.npc_name },
        ]);
        if (result.bonus_clue && !gameStateRef.current.unlocked_clues.includes(result.bonus_clue)) {
          const clue = caseData.clue_dictionary.find(c => c.clue_id === result.bonus_clue);
          setGameState(prev => {
            const clues = [...prev.unlocked_clues, result.bonus_clue];
            return { ...prev, unlocked_clues: clues, unlocked_clues_set: new Set(clues) };
          });
          setNewClueIds(prev => [...prev, result.bonus_clue]);
          schedule(() => setNewClueIds(prev => prev.filter(id => id !== result.bonus_clue)), 3000);
          addLine(lang === 'zh'
            ? `\n🔍 破防审讯揭示新线索：${clue?.visual_icon || '🔍'} ${clue?.keyword || result.bonus_clue}`
            : `\n🔍 BREAKTHROUGH INTERROGATION revealed a new clue: ${clue?.visual_icon || '🔍'} ${clue?.keyword || result.bonus_clue}`, 'success');
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
    const { changes, resultText } = applyCrisisChoice(evt, choiceId, gameStateRef.current, activeAgentStrategy, lang);
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
        schedule(() => setNewClueIds(ids => ids.filter(id => id !== bonus)), 3000);
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
        if (gameStateRef.current.command_state?.doctrine_id === 'evidence_control') {
          const milestone = awardCommandMilestone(gameStateRef.current.command_state, 'doctrine:first-valid-link');
          if (milestone.awarded) {
            setGameState(prev => ({ ...prev, command_state: milestone.state }));
            const message = lang === 'zh' ? '精准取证触发 · 指挥点 +1' : 'EVIDENCE CONTROL TRIGGERED · COMMAND +1';
            addLine(`\n◇ ${message}`, 'success');
            notifyCommand(message);
          }
        }
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
        schedule(() => setShowGameOver(true), 1800);
      } else {
        const penalty = getRejectedReportPenalty(gameStateRef.current);
        setGameState(prev => ({
          ...prev,
          action_points_left: Math.max(0, prev.action_points_left - penalty.apLoss),
          reputation: Math.max(0, prev.reputation - penalty.reputationLoss),
          confusion_score: Math.min(100, prev.confusion_score + penalty.confusionIncrease),
        }));
        addLine(`\n${t.reportRejected} [${result.score}]. AP -${penalty.apLoss}. ${lang === 'zh' ? `声望 -${penalty.reputationLoss}，混乱 +${penalty.confusionIncrease}。` : `Reputation -${penalty.reputationLoss}, confusion +${penalty.confusionIncrease}.`}`, 'error');
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

  const assistantBrief = useMemo(() => buildInvestigationBrief({
    gameState,
    caseData,
    lang,
    isProcessing,
    decisionPending: Boolean(decisionCards),
    reportMode,
    hasNewEvidence: newClueIds.length > 0,
    linkedPairs,
    selectedNpcId: selectedNPC?.npc_id || null,
  }), [caseData, decisionCards, gameState, isProcessing, lang, linkedPairs, newClueIds.length, reportMode, selectedNPC?.npc_id]);

  const bgColor = phaseColor.bg;
  const accentColor = phaseColor.accent;

  if (showGameOver) {
    return (
      <GameOverScreen
        judgeResult={finalJudgeResult}
        gameState={gameState}
        caseData={caseData}
        rewardEligible={Boolean(finalJudgeResult?.score)}
        onSettlement={({ xpGain }) => onSettlement?.({
          run_id: gameState.run_id,
          case_id: caseDataResolved.case_id,
          difficulty: caseDataResolved.difficulty,
          score: finalJudgeResult?.score || 'D',
          is_passed: finalJudgeResult?.is_passed === true,
          clues: gameState.unlocked_clues,
          valid_links: linkedPairs.filter(pair => pair.valid).map(pair => [pair.a, pair.b]),
          valid_link_count: linkedPairs.filter(pair => pair.valid).length,
          invalid_link_count: linkedPairs.filter(pair => !pair.valid).length,
          turns: gameState.turn_count,
          ap_left: gameState.action_points_left,
          confusion: gameState.confusion_score,
          bsod_count: bsodCountRef.current,
          traps_triggered: gameState.traps_triggered || 0,
          clue_ratio: gameState.unlocked_clues.length / Math.max(1, caseDataResolved.clue_dictionary.length),
          all_hidden_clues: (caseDataResolved.hidden_clues || []).every(clue => gameState.unlocked_clues.includes(clue.clue_id)),
          xp_gain: xpGain,
        })}
        onReturnToLobby={onBackToLobby}
        onReturnToLanding={onGameEnd}
      />
    );
  }

  return (
    <div className="td-investigation td-page-shell min-h-screen flex flex-col"
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
          }}
        />
      )}

      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}

      {commandNotice && <div role="status" aria-live="polite" className={`td-lobby-notice is-${commandNotice.type}`}>
        <span>{commandNotice.type === 'error' ? '!' : '◆'}</span><strong>{commandNotice.message}</strong>
      </div>}

      {showCommandConsole && <CommandConsole
        commandState={gameState.command_state}
        busy={isProcessing}
        onStabilize={handleEmergencyStabilize}
        onClose={() => setShowCommandConsole(false)}
      />}

      {/* 关键决策 · 行动策略卡 */}
      {decisionCards && (
        <DecisionCards
          cards={decisionCards}
          story={decisionStory}
          team={activeAgentStrategy.team}
          commandState={gameState.command_state}
          onCommandError={() => notifyCommand(lang === 'zh' ? '指挥点不足' : 'INSUFFICIENT COMMAND POINTS', 'error')}
          onChoose={(choice) => decisionResolveRef.current?.(choice)}
        />
      )}

      {/* 行动结算后的 3D / 2D 现场重演；独立懒加载，不增加调查终端初始包。 */}
      {actionCinematic && (
        <CinematicErrorBoundary
          event={actionCinematic.event}
          onComplete={handleActionCinematicComplete}
        >
          {actionCinematic.mode === '3d' ? (
            <React.Suspense
              fallback={<ActionCinematicFallback event={actionCinematic.event} onComplete={handleActionCinematicComplete} loading />}
            >
              <LazyActionCinematic
                event={actionCinematic.event}
                quality={actionCinematic.quality}
                onComplete={handleActionCinematicComplete}
              />
            </React.Suspense>
          ) : (
            <ActionCinematicFallback event={actionCinematic.event} onComplete={handleActionCinematicComplete} />
          )}
        </CinematicErrorBoundary>
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
      <div className="td-investigation-hud flex items-center justify-between px-4 py-2 border-b sticky top-0 z-50"
        style={{
          borderColor: `${accentColor}30`,
          background: `linear-gradient(180deg, rgba(10,18,32,0.55) 0%, rgba(2,6,14,0.35) 100%)`,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 ${accentColor}25, 0 8px 32px rgba(0,0,0,0.45)`,
          borderRadius: '0 0 16px 16px',
        }}>
        <div className="flex items-center gap-4">
          <button onClick={onBackToLobby} className="td-ui-button td-button-ghost td-button-compact text-xs opacity-60 hover:opacity-100 transition-opacity"
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
            { label: lang === 'zh' ? '指挥' : 'COMMAND', val: `◆ ${gameState.command_state?.points || 0}/${gameState.command_state?.max_points || 5}` },
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
          <button onClick={() => setShowCommandConsole(true)}
            title={lang === 'zh' ? '打开全息指挥台' : 'Open Holographic Command'}
            className="td-ui-button td-command-hud-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#e8c98a80', color: '#f4d99f', backgroundColor: 'rgba(232,201,138,.08)' }}>
            ◆ {lang === 'zh' ? '指挥台' : 'COMMAND'}
          </button>
          <button onClick={() => setShowSettings(true)}
            title={lang === 'zh' ? '设置' : 'Settings'}
            className="td-ui-button td-icon-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            ⚙️
          </button>
          <button onClick={() => setShowOnboarding(true)}
            title={lang === 'zh' ? '新手指引' : 'Field Briefing'}
            className="td-ui-button td-icon-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            ?
          </button>
          <button onClick={() => setShowMiniMap(value => !value)} className="td-ui-button td-icon-button td-mobile-only text-xs px-3 py-1 rounded border" style={{ borderColor: `${accentColor}50`, color: accentColor }}>🗺</button>
          <button data-onboarding-target="report" onClick={() => setReportMode(r => !r)}
            className="td-ui-button td-button-secondary text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#00ff8850', color: '#00ff88', backgroundColor: reportMode ? '#00ff8820' : 'transparent' }}>
            {t.btnReport}
          </button>
          <button onClick={() => { setFinalJudgeResult(judgeResult); setShowGameOver(true); }}
            className="td-ui-button td-button-danger text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#ff386050', color: '#ff3860', backgroundColor: 'transparent' }}>
            {t.btnEnd}
          </button>
        </div>
      </div>

      {/* MiniMap — floating bottom-right */}
      {showMiniMap && <div className="td-investigation-minimap" style={{ zIndex: 30, pointerEvents: 'auto' }}>
        <MiniMap
          gameState={gameState}
          caseData={caseData}
          agentPath={agentPath}
          accentColor={accentColor}
        />
      </div>}

      {/* Main area */}
      <div className="td-investigation-main flex flex-1 overflow-hidden relative">

        {/* Agent Synergy FX overlay */}
        <AgentSynergyFX event={synergyEvent} />

        {/* Left: Terminal */}
        <div className="td-investigation-terminal flex flex-col flex-1 min-w-0">
          {/* Terminal output */}
          <div ref={terminalRef} className="td-terminal-surface flex-1 overflow-y-auto p-4 space-y-1"
            style={{ scrollBehavior: isProcessing ? 'auto' : 'smooth' }}>
            <div className="td-turn-page-heading" style={/** @type {React.CSSProperties & {'--turn-accent': string}} */ ({ '--turn-accent': accentColor })}>
              <div>
                <small>{viewedTerminalTurn === 0 ? (lang === 'zh' ? '任务准备页' : 'MISSION BRIEFING') : `${lang === 'zh' ? '调查回合' : 'INVESTIGATION TURN'} ${viewedTerminalTurn}`}</small>
                <strong>{viewedTerminalTurn === latestTerminalTurn ? (lang === 'zh' ? '● 当前' : '● LIVE') : (lang === 'zh' ? '历史记录' : 'ARCHIVED')}</strong>
              </div>
              <span>{caseData.case_id} · {agentStrategy?.agent_id || activeAgentStrategy?.primary_agent_id || 'AGENT TEAM'}</span>
            </div>
            {visibleTerminalLines.length === 0 && (
              <div className="td-turn-page-empty" style={{ color: accentColor }}>
                {viewedTerminalTurn === 0
                  ? (lang === 'zh' ? '系统准备完成。点击下方“执行循环”开始第一回合。' : 'SYSTEM READY. USE EXECUTE CYCLE TO BEGIN TURN ONE.')
                  : (lang === 'zh' ? '本回合正在建立记录…' : 'BUILDING THIS TURN RECORD…')}
              </div>
            )}
            {visibleTerminalLines.map(line => (
              <TerminalLine key={line.id} line={line} accentColor={accentColor} />
            ))}
            {isViewingActiveTerminalTurn && thoughtText && (
              <div className="text-xs leading-relaxed" style={{ color: '#bf5fff', whiteSpace: 'pre-wrap' }}>
                {thoughtText}
                <span className="animate-pulse" style={{ color: '#bf5fff' }}>▊</span>
              </div>
            )}
            {isViewingActiveTerminalTurn && isProcessing && !thoughtText && (
              <AIProcessingIndicator phase={reactState} stressLevel={stressLevel} />
            )}
          </div>

          <nav className="td-turn-navigator" aria-label={lang === 'zh' ? '调查回合导航' : 'Investigation turn navigation'}>
            <button
              type="button"
              disabled={viewedTerminalTurnIndex <= 0}
              onClick={() => setViewedTerminalTurn(stepTerminalTurn(terminalTurns, viewedTerminalTurn, -1))}
              aria-label={lang === 'zh' ? '上一回合' : 'Previous turn'}
            >‹</button>
            <label>
              <span>{lang === 'zh' ? '查看回合' : 'VIEW TURN'}</span>
              <select value={viewedTerminalTurn} onChange={event => setViewedTerminalTurn(Number(event.target.value))}>
                {terminalTurns.map(turn => (
                  <option key={turn} value={turn}>{turn === 0 ? (lang === 'zh' ? '准备阶段' : 'BRIEFING') : `${lang === 'zh' ? '回合' : 'TURN'} ${turn}`}</option>
                ))}
              </select>
            </label>
            <span>{viewedTerminalTurnIndex + 1} / {terminalTurns.length}</span>
            <button
              type="button"
              disabled={viewedTerminalTurnIndex >= terminalTurns.length - 1}
              onClick={() => setViewedTerminalTurn(stepTerminalTurn(terminalTurns, viewedTerminalTurn, 1))}
              aria-label={lang === 'zh' ? '下一回合' : 'Next turn'}
            >›</button>
          </nav>

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
                className="td-ui-input w-full bg-transparent border rounded p-3 text-xs outline-none resize-none"
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
                  className="td-ui-button td-button-success flex-1 py-2 text-xs rounded border transition-all"
                  style={{ borderColor: '#00ff88', color: '#00ff88', backgroundColor: '#00ff8815' }}>
                  {t.reportSubmit}
                </button>
                <button onClick={() => setReportMode(false)}
                  className="td-ui-button td-button-ghost px-4 py-2 text-xs rounded border opacity-60 hover:opacity-100"
                  style={{ borderColor: '#ffffff30', color: '#fff' }}>
                  {t.reportCancel}
                </button>
              </div>
              {judgeResult && <JudgeResult result={judgeResult} />}
            </div>
          )}

          {/* Action Bar */}
          <div className="td-investigation-actions td-action-dock p-4 border-t flex items-center gap-3 flex-wrap"
            style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <button data-onboarding-target="execute" onClick={runReActCycle} disabled={isProcessing || gameState.action_points_left <= 0}
              className="td-ui-button td-button-primary px-6 py-2 text-xs font-bold tracking-widest rounded border transition-all disabled:opacity-30"
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
                className="td-ui-button td-button-danger px-4 py-2 text-xs rounded border transition-all"
                style={{ borderColor: '#ff386060', color: '#ff3860', backgroundColor: '#ff386015' }}>
                {t.abortBtn}
              </button>
            )}
            <button type="button" className="td-ui-button td-button-secondary td-mobile-only px-4 py-2 text-xs rounded border" onClick={() => setMobileToolsOpen(true)} style={{ borderColor: `${accentColor}60`, color: accentColor }}>🧰 {lang === 'zh' ? '工具' : 'TOOLS'}</button>
            <div data-onboarding-target="interrogate" className="td-investigation-npc-list flex gap-2 flex-wrap">
              {caseData.npcs.map(npc => (
                <button key={npc.npc_id} onClick={() => handleNPCTalk(npc)}
                  disabled={isProcessing}
                  className="td-ui-button td-npc-chip px-3 py-1 text-xs rounded border transition-all disabled:opacity-30 inline-flex items-center gap-2"
                  style={{ borderColor: `${accentColor}40`, color: `${accentColor}cc`, backgroundColor: `${accentColor}08` }}>
                  <span>{npc.avatar} {npc.name}</span>
                  <EmotionBadge level={getEmotion(npcEmotionState, npc.npc_id).level} />
                </button>
              ))}
            </div>
            <InvestigationAssistant brief={assistantBrief} />
          </div>
        </div>

        {/* Right Sidebar */}
        <div className={`td-investigation-tools ${mobileToolsOpen ? 'td-tools-open' : ''} w-72 border-l flex flex-col overflow-hidden`}
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
          <button type="button" className="td-ui-button td-mobile-only td-tools-close" onClick={() => setMobileToolsOpen(false)}>↓ {lang === 'zh' ? '收起工具' : 'CLOSE TOOLS'}</button>
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
              agentStrategy={activeAgentStrategy}
              onPriorityChange={setRuntimePriority}
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
          <div data-onboarding-target="confusion" className="p-3 border-t" style={{ borderColor: `${accentColor}20` }}>
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
