import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, useReducer } from 'react';
import RunPresentationControls from '@/components/game/theater/RunPresentationControls';
import NarrativeOverlay from '@/components/game/theater/NarrativeOverlay';
import {
  canPresentTheaterNarrative, createTheaterNarrativeState, currentTheaterNarrative,
  successfulInterviewEvent, theaterNarrativeReducer, theaterNarrativeStage,
} from '@/game/theaterNarrative';
import { ReAct_Enum, Phase_Color_Map, Case_Data_Lvl_01, localizeCase } from '@/game/caseData';
import { useProfile } from '@/lib/ProfileContext.jsx';
import { cloudflareApi } from '@/api/cloudflareClient';
import { createPlayerRunClient, isAuthoritativeRun, runRecoveryMessage } from '@/game/playerRun';
import { useLang } from '@/lib/lang.jsx';
import { publicErrorMessage } from '@/lib/publicError';
import MiniMap from '@/components/game/MiniMap';
import TheaterPresentation from '@/components/game/theater/TheaterPresentation';
import '@/components/game/theater/theater.css';
import { generateObservationSections } from '@/game/gameState';
import { getInitialZone } from '@/game/caseRuntime';
import { streamInvestigationThought, streamTerminalText, setInvestigationLang } from '@/game/investigationEngine';
import DecisionCards from '@/components/game/DecisionCards';
import LinkCinematic from '@/components/game/LinkCinematic';
import { EmotionBadge } from '@/components/game/InterrogationHints';
import { getEmotion } from '@/game/npcEmotion';
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
import { NPCDialogBox, StructuredReportPanel, TerminalLine } from '@/components/game/investigation/TerminalPanels';
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
  getTerminalLinesForTurn,
  getTerminalTurns,
  stepTerminalTurn,
} from '@/game/turnArchive';
import { applyStaminaToTeam, canAgentInvestigate } from '@/game/agentStamina';

const LazyActionCinematic = React.lazy(loadActionCinematic);

const PHASE_COLORS = Phase_Color_Map;

export default function InvestigationTerminal({ agentStrategy, authoritativeRun = null, selectedCase, onGameEnd, onBackToLobby, onSettlement, onOpenHome, presentationActive = true, narrativeBriefed = false }) {
  const { lang, t } = useLang();
  const { sessionId } = useProfile();
  const [serverRun, setServerRun] = useState(authoritativeRun);
  const [authorityReady, setAuthorityReady] = useState(false);
  const [authorityError, setAuthorityError] = useState(null);
  const [authorityLoading, setAuthorityLoading] = useState(false);
  const commandInFlightRef = useRef(false);
  const runClient = useMemo(() => createPlayerRunClient({
    runId: authoritativeRun?.id, sessionId, invoke: cloudflareApi.functions.invoke,
  }), [authoritativeRun?.id, sessionId]);
  const runViewRef = useRef(null);
  useLayoutEffect(() => {
    const view = { client: runClient, active: true };
    runViewRef.current = view;
    commandInFlightRef.current = false;
    return () => { view.active = false; };
  }, [runClient]);
  const { settings, setSetting } = useSettings();
  const theaterMode = settings.storyMode === 'theater';
  const theaterSpatialRef = useRef({ arrived: narrativeBriefed });
  const dialogueSequenceRef = useRef(0);
  const closedDialogueRef = useRef(0);
  const recoveryPresentationRef = useRef(null);
  const pendingQuestionPresentationRef = useRef(null);
  const [showSettings, setShowSettings] = useState(false);
  const skin = panelSkin(settings.panelLight);
  const { schedule, wait } = useManagedTimers();
  const caseDataResolved = selectedCase || Case_Data_Lvl_01;
  const configuredAgentStrategy = serverRun?.agent_strategy || agentStrategy || { team: [] };

  const caseData = useMemo(() => {
    const localized = localizeCase(caseDataResolved, lang);
    const revealed = new Map((serverRun?.state?.revealed_clues || []).map(clue => [clue.clue_id, clue]));
    return {
      ...localized,
      clue_dictionary: localized.clue_dictionary.map(clue => {
        const confirmed = revealed.get(clue.clue_id);
        if (!confirmed) return clue;
        return {
          ...clue,
          keyword: lang === 'en' ? confirmed.en?.keyword || confirmed.keyword : confirmed.keyword,
          description: lang === 'en' ? confirmed.en?.description || confirmed.description : confirmed.description,
          visual_icon: confirmed.visual_icon,
        };
      }),
    };
  }, [caseDataResolved, lang, serverRun]);
  // 本地表达库与确定性规则的语言跟随界面语言。
  useEffect(() => { setInvestigationLang(lang); }, [lang]);

  // This inert shell only lets an invalid/legacy save render recovery controls.
  // It is never playable, uploaded, or used to create a run.
  const [gameState, setGameState] = useState(() => isAuthoritativeRun(authoritativeRun)
    ? authoritativeRun.state
    : { run_id: '', action_points_left: 0, turn_count: 0, unlocked_clues: [], destroyed_clue_ids: [],
      agent_stamina: {}, confusion_score: 0, chat_history: [], visited_zones: [], current_zone: getInitialZone(caseDataResolved) });
  const [narrativeState, dispatchNarrative] = useReducer(theaterNarrativeReducer, gameState.run_id, createTheaterNarrativeState);
  const activeNarrative = currentTheaterNarrative(narrativeState, lang);
  const activeAgentStrategy = useMemo(() => ({
    ...configuredAgentStrategy,
    team: applyStaminaToTeam(configuredAgentStrategy.team, gameState.agent_stamina),
  }), [configuredAgentStrategy, gameState.agent_stamina]);
  const [reactState, setReactState] = useState(ReAct_Enum.IDLE);
  const [terminalLines, setTerminalLines] = useState([]);
  const [activeTerminalTurn, setActiveTerminalTurn] = useState(() => Math.max(0, Number(gameState.turn_count) || 0));
  const [viewedTerminalTurn, setViewedTerminalTurn] = useState(() => Math.max(0, Number(gameState.turn_count) || 0));
  const [isProcessing, setIsProcessing] = useState(false);
  const [stressLevel, setStressLevel] = useState(0);
  const [newClueIds, setNewClueIds] = useState([]);
  const [showBSoD, setShowBSoD] = useState(false);
  const [reportMode, setReportMode] = useState(false);
  const [reportOptions, setReportOptions] = useState(null);
  const [structuredReport, setStructuredReport] = useState({ conclusionId: '', methodId: '', motiveId: '', timelineId: '', evidenceIds: [] });
  const [reportError, setReportError] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const [selectedNPC, setSelectedNPC] = useState(null);
  const [npcDialogue, setNpcDialogue] = useState([]);
  const [npcQuestionPacks, setNpcQuestionPacks] = useState(null);
  const [npcQuestionError, setNpcQuestionError] = useState(null);
  const [npcExecutorId, setNpcExecutorId] = useState(() => agentStrategy?.primary_agent_id || agentStrategy?.team?.[0]?.agent_id || '');
  const [toolTab, setToolTab] = useState('evidence');
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [showMiniMap, setShowMiniMap] = useState(true);
  const [decisionLog, setDecisionLog] = useState([]);
  const [agentPath, setAgentPath] = useState(() => [getInitialZone(caseDataResolved)].filter(Boolean));
  const [zoneFeedback, setZoneFeedback] = useState({});
  const [streamingTerminal, setStreamingTerminal] = useState(null);
  const [synergyEvent, setSynergyEvent] = useState(null);
  const [showGameOver, setShowGameOver] = useState(false);
  const [showCommandConsole, setShowCommandConsole] = useState(false);
  const [commandNotice, setCommandNotice] = useState(null);
  const [showOnboarding, setShowOnboarding] = useState(() => settings.investigationTutorialEnabled !== false);
  const [finalJudgeResult, setFinalJudgeResult] = useState(null);
  const [isFinalizing, setIsFinalizing] = useState(false);
  // ── 关键决策 / 危机事件 / 推理连线 ──
  const [decisionCards, setDecisionCards] = useState(null);
  const [decisionStory, setDecisionStory] = useState(null);
  const [cinematic, setCinematic] = useState(null);
  const [actionCinematic, setActionCinematic] = useState(null);
  const [npcEmotionState, setNpcEmotionState] = useState({});
  const [truthFragments, setTruthFragments] = useState(0);
  const [redFlash, setRedFlash] = useState(0);
  const [crisis, setCrisis] = useState(null);
  const [crisisPending, setCrisisPending] = useState(false);
  const [crisisError, setCrisisError] = useState(null);
  const [insightEvent, setInsightEvent] = useState(null);
  const [linkedPairs, setLinkedPairs] = useState([]);
  const [isLinkChecking, setIsLinkChecking] = useState(false);
  const decisionResolveRef = useRef(null);
  const abortCtrlRef = useRef(null);
  const activeRunRef = useRef(0);
  const bsodCountRef = useRef(0);
  const commandNoticeTimerRef = useRef(null);
  const actionCinematicResolveRef = useRef(null);
  const actionCinematicTimerRef = useRef(null);
  const playedActionCinematicsRef = useRef(new Set());
  const finalizingRef = useRef(false);
  const crisisPendingRef = useRef(false);
  const finalSettlementRef = useRef(null);

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
  const narrativeVisible = Boolean(activeNarrative && canPresentTheaterNarrative({
    theaterMode, presentationActive, selectedNPC, reportMode, isProcessing, isFinalizing, crisisPending,
    crisis, decisionCards, actionCinematic, cinematic, showBSoD, showGameOver, showSettings,
    showOnboarding, showCommandConsole, mobileToolsOpen, isLinkChecking,
  }));
  const interactionLocked = !authorityReady || authorityLoading || isProcessing || isFinalizing || crisisPending || showBSoD || narrativeVisible;

  const commitServerRun = useCallback((run) => {
    setServerRun(run);
    gameStateRef.current = run.state;
    setGameState(run.state);
    setLinkedPairs(run.linked_pairs);
    bsodCountRef.current = run.bsod_count || 0;
    setNpcEmotionState(run.npc_emotions || {});
    setTruthFragments(run.truth_fragments || 0);
    setJudgeResult(run.judge_result || null);
    setShowBSoD(run.state.is_crashed === true);
    crisisPendingRef.current = Boolean(run.pending_crisis);
    setCrisisPending(Boolean(run.pending_crisis));
    setCrisis(run.pending_crisis || null);
    if (['completed', 'failed', 'abandoned', 'settled'].includes(run.status)) {
      finalSettlementRef.current = { gameState: run.state, linkedPairs: run.linked_pairs, bsodCount: run.bsod_count };
      finalizingRef.current = true;
      setIsFinalizing(true);
      setFinalJudgeResult(run.judge_result || null);
      setShowGameOver(true);
    }
  }, []);

  const executeRunCommand = useCallback(async (command) => {
    const view = runViewRef.current;
    const isCurrent = () => view?.active && view.client === runClient && runViewRef.current === view;
    if (!isCurrent()) throw new DOMException('Run view changed', 'AbortError');
    if (commandInFlightRef.current) throw Object.assign(new Error('RUN_REQUEST_BUSY'), { code: 'RUN_REQUEST_BUSY' });
    commandInFlightRef.current = true;
    try {
      const response = await runClient.command({ lang, ...command });
      if (!isCurrent()) throw new DOMException('Run view changed', 'AbortError');
      commitServerRun(response.run);
      if (response.result?.error) throw Object.assign(new Error(response.result.error), { code: response.result.error, confirmed: true });
      return response;
    } catch (error) {
      if (isCurrent() && !error.confirmed) {
        setAuthorityReady(false);
        setAuthorityError(error);
      }
      throw error;
    } finally {
      if (isCurrent()) commandInFlightRef.current = false;
    }
  }, [commitServerRun, lang, runClient]);

  const resumeRun = useCallback(async () => {
    const view = runViewRef.current;
    const isCurrent = () => view?.active && view.client === runClient && runViewRef.current === view;
    setAuthorityLoading(true);
    setAuthorityReady(false);
    setAuthorityError(null);
    try {
      const response = await runClient.resume();
      if (!isCurrent()) return;
      commitServerRun(response.run);
      await recoveryPresentationRef.current?.(response);
      if (isCurrent()) setAuthorityReady(true);
    } catch (error) {
      if (isCurrent()) setAuthorityError(error);
    } finally {
      if (isCurrent()) setAuthorityLoading(false);
    }
  }, [commitServerRun, runClient]);

  useEffect(() => { void resumeRun(); }, [resumeRun]);

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

  useEffect(() => {
    if (!reportMode || !authorityReady || authorityLoading || isFinalizing) return undefined;
    let cancelled = false;
    setReportOptions(null);
    setReportError(null);
    executeRunCommand({ type: 'report_options' })
      .then(response => response.result)
      .then(options => {
        if (!cancelled) setReportOptions(options);
      })
      .catch(error => {
        if (!cancelled && error?.name !== 'AbortError') {
          setReportError(lang === 'zh'
            ? '暂时无法读取合法报告选项，请关闭报告后重试。'
            : 'REPORT OPTIONS ARE TEMPORARILY UNAVAILABLE. CLOSE AND RETRY.');
        }
      });
    return () => { cancelled = true; };
  }, [authorityLoading, authorityReady, executeRunCommand, isFinalizing, lang, reportMode]);

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
  }, [visibleTerminalLines.length, streamingTerminal?.text, isProcessing, isViewingActiveTerminalTurn, scrollToBottom]);

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
    if (reason === 'renderer_lost') {
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
    const playback = detectCinematicPlayback({
      enabled: settings.cinematicsEnabled !== false,
      quality: settings.cinematicQuality,
    });

    return new Promise(resolve => {
      if (actionCinematicResolveRef.current) finishActionCinematic('replaced');
      actionCinematicResolveRef.current = resolve;
      setActionCinematic({ event, ...playback });
      actionCinematicTimerRef.current = window.setTimeout(() => {
        finishActionCinematic('timeout');
      }, 8000);
    });
  }, [finishActionCinematic, settings.cinematicQuality, settings.cinematicsEnabled]);

  const handleEmergencyStabilize = useCallback(async () => {
    if (!authorityReady || isProcessing || finalizingRef.current || crisisPendingRef.current) return;
    setIsProcessing(true);
    try {
      await executeRunCommand({ type: 'command', command_id: 'emergency_stabilize' });
      const message = lang === 'zh' ? '紧急稳态已由云端确认' : 'EMERGENCY STABILIZE CONFIRMED BY CLOUD';
      notifyCommand(message);
      addLine(`\n◇ ${message}`, 'success');
    } catch (error) {
      notifyCommand(error.confirmed ? publicErrorMessage(error, lang) : runRecoveryMessage(error, lang), 'error');
    } finally {
      setIsProcessing(false);
    }
  }, [addLine, authorityReady, executeRunCommand, isProcessing, lang, notifyCommand]);

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
    if (!authorityReady || isProcessing || abortCtrlRef.current || finalizingRef.current || crisisPendingRef.current || showBSoD) return;
    const runLang = lang === 'en' ? 'en' : 'zh';
    const gs = gameStateRef.current;
    if (gs.action_points_left <= 0) {
      addLine(`\n${t.apDepleted}`, 'error');
      return;
    }
    const roundAgentStrategy = activeAgentStrategy;

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
      const {
        story: publicStory,
        observation,
        observationTerminalText,
      } = generateObservationSections(gs, caseData, runLang);
      const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
      const optionPacksPromise = executeRunCommand({ type: 'decision_options', lang: runLang }).then(response => response.result).then(
        value => ({ ok: true, value, error: null }),
        error => ({ ok: false, value: null, error }),
      );

      addLine('\n' + '═'.repeat(50), 'divider');
      setStreamingTerminal({ type: 'observe', text: '', fullText: observationTerminalText });
      await streamTerminalText({
        text: observationTerminalText,
        intervalMs: 18,
        instant: false,
        signal: ctrl.signal,
        onChunk: char => {
          setStreamingTerminal(current => current?.type === 'observe'
            ? { ...current, text: current.text + char }
            : current);
          if (viewedTerminalTurnRef.current === activeTerminalTurnRef.current) scrollToBottom();
        },
      });
      if (isCancelled()) return;
      addLine(observationTerminalText, 'observe');
      setStreamingTerminal(null);
      if (!reduceMotion) await wait(300);
      if (isCancelled()) return;

      // ── Phase 2: THINK ────────────────────────────────────────────────
      setReactState(ReAct_Enum.THINK);
      addLine('\n' + t.neuralProcessing, 'phase');

      startStressTimer();
      let fullThought = '';

      await streamInvestigationThought({
        gameState: gs,
        caseData,
        agentStrategy: roundAgentStrategy,
        observation,
        lang: runLang,
        instant: reduceMotion,
        signal: ctrl.signal,
        onStart: text => setStreamingTerminal({ type: 'thought', text: '', fullText: text }),
        onChunk: (char) => {
          fullThought += char;
          setStreamingTerminal(current => current?.type === 'thought'
            ? { ...current, text: current.text + char }
            : current);
          if (viewedTerminalTurnRef.current === activeTerminalTurnRef.current) scrollToBottom();
        },
        onDone: (text) => { fullThought = text; }
      });

      stopStressTimer();
      if (isCancelled()) return;

      addLine(fullThought, 'thought');
      setStreamingTerminal(null);

      // ── Phase 3: ACT ──────────────────────────────────────────────────
      setReactState(ReAct_Enum.ACT);
      addLine('\n' + t.actionSynthesis, 'phase');
      let actionTag = null;
      let chosenResponse = null;
      let chosenExecutorId = null;
      let chosenAssistId = null;
      // ── 关键决策节点：挂起自动执行，玩家 30 秒内选择 ──────────────────
      // 每一轮都交由架构师决策 —— 玩家始终掌握剧情走向
      const isKeyNode = true;
      if (isKeyNode) {
        const fallbackTag = 'search_area';
        addLine(`\n${t.keyDecisionNode}`, 'warning');
        const optionLoad = await optionPacksPromise;
        if (!optionLoad.ok) throw optionLoad.error;
        const optionResult = optionLoad.value;
        if (isCancelled()) return;
        const packs = optionResult?.packs || {};
        setDecisionStory({
          ...publicStory,
          zone: publicStory.zoneId,
          actionTag: fallbackTag,
          locationName: publicStory.zoneName,
          contacts: publicStory.npcs.length,
          evidence: `${publicStory.clueCount}/${publicStory.clueTotal}`,
          thought: fullThought,
          transcript: observationTerminalText,
          language: runLang,
        });
        if (settings.cinematicsEnabled !== false) {
          const playback = detectCinematicPlayback({
            enabled: true,
            quality: settings.cinematicQuality,
          });
          if (playback.mode === '3d') void preloadActionCinematic();
        }
        setDecisionCards(packs);
        const choice = await new Promise(resolve => { decisionResolveRef.current = resolve; });
        setDecisionCards(null);
        setDecisionStory(null);
        decisionResolveRef.current = null;
        if (!choice || isCancelled()) return;
        if (choice.rest) {
          await executeRunCommand({ type: 'rest', lang: runLang });
          addLine(runLang === 'zh'
            ? '\n↻ 小队整备已由云端确认'
            : '\n↻ RECOVERY TURN CONFIRMED BY CLOUD', 'success');
          return;
        }
        actionTag = choice.card.actionTag || choice.card.action_tag;
        chosenExecutorId = choice.executorAgentId;
        chosenAssistId = choice.assistAgentId || null;
        addLine(`\n${t.architectConfirm}[${String(actionTag).toUpperCase()}] · ${choice.card.label}`, 'action');
        chosenResponse = await executeRunCommand({
          type: 'round', option_id: choice.card.option_id || choice.card.optionId || choice.card.id,
          ...(chosenAssistId ? { assist_agent_id: chosenAssistId } : {}),
          command_ids: choice.commandIds || [], lang: runLang,
        });
      }
      if (!chosenResponse || isCancelled()) return;
      const newState = chosenResponse.run.state;
      actionTag = chosenResponse.result.action_tag || actionTag;
      chosenExecutorId = chosenResponse.result.executor_agent_id || chosenExecutorId;
      chosenAssistId = chosenResponse.result.assist_agent_id || null;
      const settlement = chosenResponse.result.settlement || {
        action_narration: chosenResponse.result.narration,
        is_trap: chosenResponse.result.is_trap,
      };
      const newClues = newState.unlocked_clues.filter(id => !gs.unlocked_clues.includes(id));

      const actualTrapTriggered = (Number(newState.traps_triggered) || 0) > (Number(gs.traps_triggered) || 0);
      const cinematicSettlement = { ...settlement, is_trap: actualTrapTriggered };
      if (shouldPlayActionCinematic(gs, newState, cinematicSettlement, caseData)) {
        const event = buildCinematicEvent({
          previousState: gs,
          nextState: newState,
          settlement: cinematicSettlement,
          caseData,
          actionTag: actionTag || 'search_area',
          executorAgentId: chosenExecutorId,
          assistAgentId: chosenAssistId,
        });
        await playActionCinematic(event);
        if (isCancelled()) return;
      }

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
        addLine(`\n${t.systemError}${publicErrorMessage(err, lang)}`, 'error');
      }
      if (activeRunRef.current === runId) setReactState(ReAct_Enum.IDLE);
    } finally {
      if (activeRunRef.current === runId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
        setReactState(ReAct_Enum.IDLE);
        setStreamingTerminal(null);
      }
    }
  };

  const handleAbort = () => {
    if (finalizingRef.current || commandInFlightRef.current) return;
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
      setStreamingTerminal(null);
    }
  };

  const handleNPCTalk = async (npc) => {
    if (!authorityReady || finalizingRef.current || crisisPendingRef.current || isProcessing || abortCtrlRef.current || showBSoD) return;
    const state = gameStateRef.current;
    const runtimeTeam = applyStaminaToTeam(configuredAgentStrategy.team, state.agent_stamina);
    const primary = runtimeTeam.find(agent => agent.agent_id === configuredAgentStrategy.primary_agent_id);
    const executor = (primary && canAgentInvestigate(primary.stamina, false) ? primary : null)
      || runtimeTeam.find(agent => canAgentInvestigate(agent.stamina, false));
    if (selectedNPC) handleNPCDialogueClose();
    dialogueSequenceRef.current += 1;
    setSelectedNPC(npc);
    setNpcDialogue([{ role: 'system', text: `— ${npc.name} ${t.npcEnters} —\n"${npc.initial_statement}"` }]);
    setNpcQuestionPacks(null);
    setNpcQuestionError(executor
      ? null
      : (lang === 'zh' ? '所有探员体力均不足 10%，请返回行动界面整备。' : 'ALL AGENTS HAVE LESS THAN 10% STAMINA. RETURN TO THE ACTION SCREEN TO RECOVER.'));
    setNpcExecutorId(executor?.agent_id || runtimeTeam[0]?.agent_id || '');
    const { ctrl, operationId } = beginAbortableOperation();
    setIsProcessing(true);
    try {
      const { result } = await executeRunCommand({ type: 'interrogation_options', npc_id: npc.npc_id });
      if (!isOperationCurrent(ctrl, operationId)) return;
      setNpcQuestionPacks(result.packs || {});
    } catch (error) {
      if (error?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        setNpcQuestionError(lang === 'zh' ? '审讯规则暂时不可用，请稍后重试。' : 'INTERROGATION RULES ARE TEMPORARILY UNAVAILABLE.');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
      }
    }
  };

  const handleNPCQuestion = async (question) => {
    if (!authorityReady || !selectedNPC || !question?.questionId || isProcessing || abortCtrlRef.current
      || finalizingRef.current || crisisPendingRef.current) return;
    const npc = selectedNPC;
    const dialogueId = dialogueSequenceRef.current;
    const theaterAtQuestion = theaterMode;
    const state = gameStateRef.current;
    const staminaAgent = configuredAgentStrategy.team.find(agent => agent.agent_id === npcExecutorId);
    if (!staminaAgent || !canAgentInvestigate(state.agent_stamina?.[npcExecutorId], false)) {
      setNpcQuestionError(lang === 'zh'
        ? '该探员体力不足 10%，请更换探员或返回行动界面整备。'
        : 'THIS AGENT HAS LESS THAN 10% STAMINA. SWITCH AGENTS OR RECOVER FROM THE ACTION SCREEN.');
      return;
    }
    setNpcQuestionError(null);
    const { ctrl, operationId } = beginAbortableOperation();
    setNpcDialogue(prev => [...prev, { role: 'agent', text: question.text }]);
    pendingQuestionPresentationRef.current = { dialogueId, theaterAtQuestion };
    setIsProcessing(true);
    try {
      const response = await executeRunCommand({
        type: 'question', question_id: question.questionId,
        executor_agent_id: npcExecutorId, npc_id: npc.npc_id,
      });
      if (!isOperationCurrent(ctrl, operationId)) return;
      const { result, run } = response;
      pendingQuestionPresentationRef.current = null;
      const nextGameState = run.state;
      if (closedDialogueRef.current < dialogueId) {
        setNpcDialogue(prev => [...prev, { role: 'npc', text: result.response, name: result.npc_name }]);
      } else {
        addLine(`\n${result.npc_name || npc.name}: ${result.response}`, 'narration');
      }
      for (const clueId of nextGameState.unlocked_clues.filter(id => !state.unlocked_clues.includes(id))) {
        const clue = caseData.clue_dictionary.find(c => c.clue_id === clueId);
        if (!clue) continue;
        setNewClueIds(prev => [...prev, clueId]);
        schedule(() => setNewClueIds(prev => prev.filter(id => id !== clueId)), 3000);
        addLine(lang === 'zh'
          ? `\n🔍 审讯揭示新线索：${clue.visual_icon || '🔍'} ${clue.keyword}`
          : `\n🔍 INTERROGATION REVEALED: ${clue.visual_icon || '🔍'} ${clue.keyword}`, 'success');
        triggerSynergy('clue_converge', clue);
      }
      // Capture eligibility at submission, commit after the existing operation check, before option refresh.
      dispatchNarrative(successfulInterviewEvent({
        runId: state.run_id, dialogueId, theaterAtQuestion, result,
        stage: theaterNarrativeStage(nextGameState, caseData),
      }));
      if (closedDialogueRef.current >= dialogueId) {
        dispatchNarrative({ type: 'close', runId: state.run_id, dialogueId });
        return;
      }
      if (result.packs) {
        setNpcQuestionPacks(result.packs);
        return;
      }
      try {
        const { result: refreshed } = await executeRunCommand({ type: 'interrogation_options', npc_id: npc.npc_id });
        if (isOperationCurrent(ctrl, operationId) && closedDialogueRef.current < dialogueId) setNpcQuestionPacks(refreshed.packs || {});
      } catch (refreshError) {
        if (refreshError?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
          setNpcQuestionPacks({});
          setNpcQuestionError(lang === 'zh'
            ? '本次提问结果和体力消耗已保存，但下一组选项刷新失败。请关闭对话后重新打开。'
            : 'THE RESULT AND STAMINA COST WERE SAVED, BUT NEW OPTIONS COULD NOT LOAD. CLOSE AND REOPEN THE DIALOGUE.');
        }
      }
    } catch (err) {
      if (err.confirmed || err.status === 400 || ['STALE_RUN', 'RUN_SETTLED'].includes(err.code)) {
        pendingQuestionPresentationRef.current = null;
      }
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        setNpcQuestionError(lang === 'zh' ? '问题选项已过期或规则服务不可用，请关闭后重试。' : 'QUESTION OPTIONS EXPIRED OR RULE SERVICE UNAVAILABLE.');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
      }
    }
  };

  const handleNPCDialogueClose = () => {
    closedDialogueRef.current = dialogueSequenceRef.current;
    handleAbort();
    dispatchNarrative({ type: 'close', runId: gameStateRef.current.run_id, dialogueId: dialogueSequenceRef.current });
    setSelectedNPC(null);
    setNpcDialogue([]);
    setNpcQuestionPacks(null);
    setNpcQuestionError(null);
  };

  const presentRecoveredResponse = async (response) => {
    const command = response.recovered_command;
    if (!command) return;
    const result = response.result || {};
    setNpcQuestionPacks(null);
    setNpcQuestionError(null);
    if (result.error) {
      if (command.type === 'question') pendingQuestionPresentationRef.current = null;
      addLine(publicErrorMessage({ code: result.error }, lang), 'error');
      return;
    }
    if (command.type === 'question') {
      const npc = caseData.npcs.find(item => item.npc_id === command.npc_id);
      if (!npc) return;
      const pending = pendingQuestionPresentationRef.current;
      pendingQuestionPresentationRef.current = null;
      const wasClosed = pending && closedDialogueRef.current >= pending.dialogueId;
      const sameDialogue = selectedNPC?.npc_id === npc.npc_id && !wasClosed;
      if (!pending && !sameDialogue) dialogueSequenceRef.current += 1;
      const dialogueId = pending?.dialogueId || dialogueSequenceRef.current;
      if (wasClosed) {
        addLine(`\n${result.npc_name || npc.name}: ${result.response}`, 'narration');
      } else {
        setSelectedNPC(npc);
        setNpcExecutorId(command.executor_agent_id);
        setNpcDialogue(previous => [...(sameDialogue ? previous : []), { role: 'npc', text: result.response, name: result.npc_name }]);
      }
      dispatchNarrative(successfulInterviewEvent({
        runId: response.run.id, dialogueId, theaterAtQuestion: pending?.theaterAtQuestion === true, result,
        stage: theaterNarrativeStage(response.run.state, caseData),
      }));
      if (wasClosed) {
        dispatchNarrative({ type: 'close', runId: response.run.id, dialogueId });
        return;
      }
      if (result.packs) {
        setNpcQuestionPacks(result.packs);
        return;
      }
      const refreshed = await executeRunCommand({ type: 'interrogation_options', npc_id: npc.npc_id });
      if (closedDialogueRef.current < dialogueId) setNpcQuestionPacks(refreshed.result.packs || {});
    } else if (command.type === 'interrogation_options') {
      if (selectedNPC?.npc_id === command.npc_id) setNpcQuestionPacks(result.packs || {});
    } else if (command.type === 'report_options') {
      if (reportMode) setReportOptions(result);
    } else {
      const text = result.settlement?.action_narration || result.reveal || result.resultText;
      if (text) addLine(text, 'narration');
    }
  };
  useLayoutEffect(() => { recoveryPresentationRef.current = presentRecoveredResponse; });

  const handleCrisisChoice = async (choiceId) => {
    if (!authorityReady || !crisis || !crisisPendingRef.current || commandInFlightRef.current) return;
    setCrisisError(null);
    try {
      const { result } = await executeRunCommand({ type: 'crisis', option_id: choiceId });
      if (result.resultText) addLine(`\n🚨 ${result.resultText}`, 'system');
      if (result.changes?.reopen_npc) {
        const npc = caseData.npcs.find(n => n.npc_id === result.changes.reopen_npc);
        if (npc) await handleNPCTalk(npc);
      }
    } catch (error) {
      setCrisisError(error.confirmed ? publicErrorMessage(error, lang) : runRecoveryMessage(error, lang));
    }
  };

  // A cinematic acknowledges an already committed outcome; it never awards clues.
  const handleCinematicDone = () => {
    const c = cinematic;
    setCinematic(null);
    if (!c) return;
    addLine(`   └─ ${c.narrative}`, 'narration');
    if (c.villain_memory) addLine(`\n▚ ${lang === 'zh' ? '凶手视角回忆' : "KILLER'S MEMORY"}\n${c.villain_memory}`, 'thought');
  };

  // ── 推理连线：受保护的确定性规则判定 ─────────────────────────────────────
  const handleLink = async (aId, bId) => {
    const clueA = caseData.clue_dictionary.find(c => c.clue_id === aId);
    const clueB = caseData.clue_dictionary.find(c => c.clue_id === bId);
    if (!authorityReady || !clueA || !clueB || isLinkChecking || isProcessing || abortCtrlRef.current
      || finalizingRef.current || crisisPendingRef.current) return;
    const { ctrl, operationId } = beginAbortableOperation();
    setIsLinkChecking(true);
    setIsProcessing(true);
    try {
      const { result, run } = await executeRunCommand({ type: 'link', clue_ids: [aId, bId] });
      if (!isOperationCurrent(ctrl, operationId)) return;
      if (result.is_valid) {
        addLine(`\n${t.insightBreak}${clueA.visual_icon} ${clueA.keyword} ⟺ ${clueB.visual_icon} ${clueB.keyword}`, 'success');
        // 规则响应已经包含安全的双语过场，不再发起第二次重复请求。
        const data = {
          ...(result.cinematic || {}),
          narrative: result.cinematic?.narrative || result.reveal,
          is_core_link: result.is_core_link === true || result.isCoreLink === true,
          hidden_ending_progress: result.hidden_ending_progress
            ?? result.hiddenEndingProgress
            ?? run.truth_fragments
            ?? truthFragments,
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
        setRedFlash(Date.now());
      }
    } catch (err) {
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        addLine(`\n${t.linkFailed}${publicErrorMessage(err, lang)}`, 'error');
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
    const evidenceCount = structuredReport.evidenceIds?.length || 0;
    const isComplete = structuredReport.conclusionId
      && structuredReport.methodId
      && structuredReport.motiveId
      && structuredReport.timelineId
      && evidenceCount >= 1;
    if (!authorityReady || !isComplete || isProcessing || abortCtrlRef.current
      || finalizingRef.current || crisisPendingRef.current) return;
    const { ctrl, operationId } = beginAbortableOperation();
    setIsProcessing(true);
    setReportError(null);
    setReactState(ReAct_Enum.REPORTING);
    try {
      const { result, run } = await executeRunCommand({
        type: 'report', conclusion_id: structuredReport.conclusionId,
        method_id: structuredReport.methodId, motive_id: structuredReport.motiveId,
        timeline_id: structuredReport.timelineId, evidence_ids: structuredReport.evidenceIds,
      });
      if (!isOperationCurrent(ctrl, operationId)) return;
      const judgment = run.judge_result || result;
      setJudgeResult(judgment);
      addLine(`\n${t.judgeVerdict} [${judgment.score}]: ${judgment.critique}`, judgment.is_passed ? 'success' : 'warning');
      if (judgment.branch?.narrative) addLine(`\n${t.narrativeCollapse}${judgment.branch.narrative}`, 'trap');
    } catch (err) {
      if (err?.name !== 'AbortError' && isOperationCurrent(ctrl, operationId)) {
        setReportError(err.confirmed ? publicErrorMessage(err, lang) : runRecoveryMessage(err, lang));
        addLine(`\n${t.systemError}${publicErrorMessage(err, lang)}`, 'error');
      }
    } finally {
      if (activeRunRef.current === operationId) {
        abortCtrlRef.current = null;
        setIsProcessing(false);
        setReactState(ReAct_Enum.IDLE);
      }
    }
  };

  const handleRunIntent = async (command) => {
    if (!authorityReady || isProcessing || commandInFlightRef.current || finalizingRef.current) return;
    setIsProcessing(true);
    try { await executeRunCommand(command); }
    catch (error) { notifyCommand(error.confirmed ? publicErrorMessage(error, lang) : runRecoveryMessage(error, lang), 'error'); }
    finally { setIsProcessing(false); }
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

  const dialoguePanel = selectedNPC && !reportMode && (
            <NPCDialogBox
              npc={selectedNPC}
              dialogue={npcDialogue}
              packs={npcQuestionPacks}
              executorId={npcExecutorId}
              onExecutorChange={agentId => {
                setNpcExecutorId(agentId);
                setNpcQuestionError(null);
              }}
              onQuestion={handleNPCQuestion}
              onClose={handleNPCDialogueClose}
              isProcessing={interactionLocked}
              accentColor={accentColor}
              emotion={getEmotion(npcEmotionState, selectedNPC.npc_id)}
              team={activeAgentStrategy.team}
              error={npcQuestionError}
            />
          );

  const reportPanel = reportMode && (
            <StructuredReportPanel
              options={reportOptions}
              value={structuredReport}
              onChange={value => {
                setStructuredReport(value);
                setJudgeResult(null);
                setReportError(null);
              }}
              onSubmit={handleSubmitReport}
              onCancel={() => setReportMode(false)}
              isProcessing={interactionLocked}
              judgeResult={judgeResult}
              error={reportError}
            />
          );

  const toolsPanel = (
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
              isChecking={isLinkChecking || interactionLocked}
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
              onPriorityChange={priority_list => void handleRunIntent({ type: 'priority', priority_list })}
              priorityDisabled={interactionLocked}
            />
          ) : toolTab === 'log' ? (
            <DecisionLog entries={decisionLog} accentColor={accentColor} />
          ) : toolTab === 'board' ? (
            <div className="flex-1 p-2">
              <div className="text-xs mb-2 tracking-widest text-center" style={{ color: accentColor }}>{t.btnBoard}</div>
              <div style={{ height: theaterMode ? 420 : 'calc(100% - 30px)' }}>
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
  );

  const presentationControls = <RunPresentationControls
    active={presentationActive}
    theaterMode={theaterMode}
    onHome={onOpenHome || (() => setShowSettings(true))}
    onSwitch={() => setSetting('storyMode', theaterMode ? 'terminal' : 'theater')}
    onSettings={() => setShowSettings(value => !value)}
  />;

  if (showGameOver) {
    const finalSettlement = finalSettlementRef.current || {
      gameState,
      linkedPairs,
      bsodCount: bsodCountRef.current,
    };
    const finalGameState = finalSettlement.gameState;
    return (
      <>
      {presentationControls}
      {showSettings && presentationActive && <SettingsDrawer onClose={() => setShowSettings(false)} />}
      <GameOverScreen
        judgeResult={finalJudgeResult}
        gameState={finalGameState}
        caseData={caseData}
        onSettlement={() => onSettlement?.({ run_id: finalGameState.run_id })}
        onReturnToLobby={onBackToLobby}
        onReturnToLanding={onGameEnd}
      />
      </>
    );
  }

  return (
    <div className={`td-investigation td-page-shell min-h-screen flex flex-col ${theaterMode ? 'td-theater-mode' : ''}`}
      style={{
        background: `radial-gradient(ellipse at top, ${bgColor} 0%, #040810 70%)`,
        fontFamily: "'Courier New', monospace",
        transition: 'background 1s ease',
      }}>

      {(!authorityReady || authorityError) && <div role="alert" className="td-ui-card" style={{ position: 'fixed', top: 58, left: '5%', right: '5%', zIndex: 10001, background: '#091321', color: '#ffd18a', padding: 16 }}>
        <p>{authorityLoading
          ? (lang === 'zh' ? '正在核对云端调查记录…' : 'CHECKING CLOUD INVESTIGATION…')
          : runRecoveryMessage(authorityError, lang)}</p>
        <button type="button" className="td-ui-button" disabled={authorityLoading} onClick={() => void resumeRun()}>{lang === 'zh' ? '云端重试' : 'RETRY CLOUD'}</button>
        <button type="button" className="td-ui-button" onClick={onOpenHome || onBackToLobby}>{lang === 'zh' ? '返回主页' : 'HOME'}</button>
      </div>}
      {activeNarrative && <NarrativeOverlay
        key={activeNarrative.id} title={activeNarrative.title} text={activeNarrative.text} lang={lang} active={narrativeVisible}
        onComplete={() => dispatchNarrative({ type: 'complete', runId: gameState.run_id, id: activeNarrative.id })}
        restoreFocusSelector=".td-run-presentation-controls button"
        onHome={onOpenHome} onSettings={() => setShowSettings(true)}
        onSwitchMode={() => setSetting('storyMode', 'terminal')}
      />}
      {!theaterMode && <GlitchOverlay intensity={gameState.confusion_score} type={gameState.confusion_score > 75 ? 'red' : 'default'} />}
      {showBSoD && (
        <BSoD agentId={agentStrategy?.agent_id || 'AXIOM'} onDismiss={() => void handleRunIntent({ type: 'recover' })} />
      )}

      {showOnboarding && presentationActive && !showSettings && (
        <OnboardingGuide
          accentColor={accentColor}
          onClose={() => {
            setShowOnboarding(false);
          }}
        />
      )}

      {showSettings && presentationActive && <SettingsDrawer onClose={() => setShowSettings(false)} />}

      {commandNotice && <div role="status" aria-live="polite" className={`td-lobby-notice is-${commandNotice.type}`}>
        <span>{commandNotice.type === 'error' ? '!' : '◆'}</span><strong>{commandNotice.message}</strong>
      </div>}

      {showCommandConsole && presentationActive && <CommandConsole
        commandState={gameState.command_state}
        busy={interactionLocked}
        onStabilize={handleEmergencyStabilize}
        onClose={() => setShowCommandConsole(false)}
      />}

      {/* 关键决策 · 行动策略卡 */}
      {decisionCards && (
        <DecisionCards
          packs={decisionCards}
          presentationActive={presentationActive && !showSettings}
          story={decisionStory}
          language={decisionStory?.language}
          team={activeAgentStrategy.team}
          commandState={gameState.command_state}
          onCommandError={(code) => notifyCommand(
            code === 'insufficient_agent_stamina'
              ? (decisionStory?.language === 'en' ? 'AGENT STAMINA IS TOO LOW' : '探员体力不足')
              : (decisionStory?.language === 'en' ? 'INSUFFICIENT COMMAND POINTS' : '指挥点不足'),
            'error',
          )}
          onChoose={(choice) => decisionResolveRef.current?.(choice)}
        />
      )}

      {/* 行动结算后的 3D / 2D 现场重演；独立懒加载，不增加调查终端初始包。 */}
      {actionCinematic && presentationActive && !showSettings && (
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
      {cinematic && presentationActive && !showSettings && <LinkCinematic data={cinematic} onDone={handleCinematicDone} />}

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
      {crisis && (
        <CrisisAlert
          event={crisis}
          actionPoints={gameState.action_points_left}
          error={crisisError}
          onChoose={handleCrisisChoice}
        />
      )}

      {/* 推理突破高潮特效 */}
      <InsightFlashFX event={insightEvent} onDone={() => setInsightEvent(null)} />

      {presentationControls}

      {/* Top HUD */}
      {!theaterMode && <div className="td-investigation-hud flex items-center justify-between px-4 py-2 border-b sticky top-0 z-50"
        style={{
          borderColor: `${accentColor}30`,
          background: `linear-gradient(180deg, rgba(10,18,32,0.55) 0%, rgba(2,6,14,0.35) 100%)`,
          backdropFilter: 'blur(18px) saturate(180%)',
          WebkitBackdropFilter: 'blur(18px) saturate(180%)',
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -1px 0 ${accentColor}25, 0 8px 32px rgba(0,0,0,0.45)`,
          borderRadius: '0 0 16px 16px',
        }}>
        <div className="flex items-center gap-4">
          <button onClick={onOpenHome || onBackToLobby} className="td-ui-button td-button-ghost td-button-compact text-xs opacity-60 hover:opacity-100 transition-opacity disabled:opacity-30"
            style={{ color: accentColor }}>{onOpenHome ? (lang === 'zh' ? '⌂ 主页 / 暂存' : '⌂ HOME / SUSPEND') : t.lobbyBtn}</button>
          <div className="text-xs font-bold tracking-widest" style={{ color: accentColor, textShadow: `0 0 10px ${accentColor}` }}>
            {caseData.title} · {caseData.subtitle}
          </div>
        </div>
        <div className="td-investigation-hud-stats flex items-center gap-6 text-xs">
          {[
            { label: lang === 'zh' ? '阶段' : 'PHASE', val: phaseColor.label },
            { label: lang === 'zh' ? 'HP' : 'HP', val: `${gameState.current_hp}%` },
            { label: lang === 'zh' ? 'AP' : 'AP', val: `${gameState.action_points_left}/20` },
            { label: lang === 'zh' ? '线索' : 'CLUES', val: `${gameState.unlocked_clues.length}/${caseData.clue_dictionary.length}` },
            { label: lang === 'zh' ? '混乱' : 'CONFUSION', val: `${gameState.confusion_score}%` },
            { label: lang === 'zh' ? '体力' : 'STAMINA', val: activeAgentStrategy.team.map(agent => Math.round(agent.stamina)).join('/') },
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
        <div className="td-investigation-hud-actions flex gap-2">
          <button type="button" onClick={() => setShowCommandConsole(true)}
            aria-label={lang === 'zh' ? '打开全息指挥台' : 'Open holographic command'}
            title={lang === 'zh' ? '打开全息指挥台' : 'Open Holographic Command'}
            className="td-ui-button td-command-hud-button td-hud-tool-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: '#e8c98a80', color: '#f4d99f', backgroundColor: 'rgba(232,201,138,.08)' }}>
            ◆ {lang === 'zh' ? '指挥台' : 'COMMAND'}
          </button>
          <button type="button" onClick={() => setShowSettings(true)}
            aria-label={lang === 'zh' ? '打开设置' : 'Open settings'}
            title={lang === 'zh' ? '设置' : 'Settings'}
            className="td-ui-button td-hud-tool-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            <span aria-hidden="true">⚙️</span><span>{lang === 'zh' ? '设置' : 'SETTINGS'}</span>
          </button>
          <button type="button" onClick={() => setShowOnboarding(true)}
            aria-label={lang === 'zh' ? '打开调查指引' : 'Open investigation guide'}
            title={lang === 'zh' ? '新手指引' : 'Field Briefing'}
            className="td-ui-button td-hud-tool-button text-xs px-3 py-1 rounded border transition-all"
            style={{ borderColor: `${accentColor}50`, color: accentColor, backgroundColor: 'transparent' }}>
            <span aria-hidden="true">?</span><span>{lang === 'zh' ? '指引' : 'GUIDE'}</span>
          </button>
          <button type="button" onClick={() => setShowMiniMap(value => !value)}
            className="td-ui-button td-hud-tool-button td-mobile-only text-xs px-3 py-1 rounded border"
            aria-label={lang === 'zh' ? `${showMiniMap ? '隐藏' : '显示'}小地图` : `${showMiniMap ? 'Hide' : 'Show'} minimap`}
            aria-pressed={showMiniMap}
            title={lang === 'zh' ? `${showMiniMap ? '隐藏' : '显示'}小地图` : `${showMiniMap ? 'Hide' : 'Show'} minimap`}
            style={{ borderColor: `${accentColor}50`, color: accentColor }}>
            <span aria-hidden="true">🗺</span><span>{lang === 'zh' ? '地图' : 'MAP'}</span>
          </button>
          <button type="button" data-onboarding-target="report" onClick={() => {
            if (selectedNPC) handleNPCDialogueClose();
            setJudgeResult(null);
            setReportMode(value => !value);
          }}
            disabled={interactionLocked}
            className="td-ui-button td-button-secondary text-xs px-3 py-1 rounded border transition-all disabled:opacity-30"
            style={{ borderColor: '#00ff8850', color: '#00ff88', backgroundColor: reportMode ? '#00ff8820' : 'transparent' }}>
            {t.btnReport}
          </button>
          <button type="button" onClick={() => void handleRunIntent({ type: 'abandon' })}
            disabled={interactionLocked}
            className="td-ui-button td-button-danger text-xs px-3 py-1 rounded border transition-all disabled:opacity-30"
            style={{ borderColor: '#ff386050', color: '#ff3860', backgroundColor: 'transparent' }}>
            {t.btnEnd}
          </button>
        </div>
      </div>}

      {/* MiniMap — floating bottom-right */}
      {!theaterMode && showMiniMap && <div className="td-investigation-minimap" style={{ zIndex: 30, pointerEvents: 'auto' }}>
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

        {theaterMode && <TheaterPresentation
          caseData={caseData}
          gameState={gameState}
          team={activeAgentStrategy.team}
          active={presentationActive}
          busy={interactionLocked}
          paused={Boolean(narrativeVisible || showSettings || showOnboarding || showCommandConsole || decisionCards || actionCinematic || cinematic || crisis || showBSoD || isFinalizing)}
          selectedNpcId={selectedNPC?.npc_id}
          quality={settings.cinematicQuality}
          spatialRef={theaterSpatialRef}
          dialoguePanel={dialoguePanel}
          reportPanel={reportPanel}
          toolsPanel={toolsPanel}
          brief={assistantBrief}
          lines={terminalLines}
          streamingText={streamingTerminal?.fullText}
          phase={phaseColor.label}
          canAbort={isProcessing && !isFinalizing && !crisisPending}
          onAbort={handleAbort}
          onExecute={() => { if (interactionLocked) return; if (selectedNPC) handleNPCDialogueClose(); setReportMode(false); runReActCycle(); }}
          onTalk={npc => { if (interactionLocked) return; setReportMode(false); handleNPCTalk(npc); }}
          onOpenTools={tab => { setToolTab(tab); setMobileToolsOpen(true); }}
          onCloseTools={() => setMobileToolsOpen(false)}
          onReport={() => { setReportMode(value => !value); setJudgeResult(null); }}
          onCommand={() => setShowCommandConsole(true)}
          onGuide={() => setShowOnboarding(true)}
          onEnd={() => void handleRunIntent({ type: 'abandon' })}
          onTextMode={() => setSetting('storyMode', 'terminal')}
        />}

        {/* Left: Terminal */}
        {!theaterMode && <div className="td-investigation-terminal flex flex-col flex-1 min-w-0">
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
            {isViewingActiveTerminalTurn && streamingTerminal && (
              <div className={`td-terminal-stream is-${streamingTerminal.type}`}>
                <span aria-hidden="true">
                  {streamingTerminal.text}
                  <span className="animate-pulse">▊</span>
                </span>
                <span className="td-sr-only">{streamingTerminal.fullText}</span>
              </div>
            )}
            {isViewingActiveTerminalTurn && isProcessing && !streamingTerminal && (
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

          {dialoguePanel}
          {reportPanel}

          {/* Action Bar */}
          <div className="td-investigation-actions td-action-dock p-4 border-t flex items-center gap-3 flex-wrap"
            style={{ borderColor: `${accentColor}30`, backgroundColor: 'rgba(0,0,0,0.5)' }}>
            <button data-onboarding-target="execute" onClick={runReActCycle} disabled={interactionLocked || gameState.action_points_left <= 0}
              className="td-ui-button td-button-primary px-6 py-2 text-xs font-bold tracking-widest rounded border transition-all disabled:opacity-30"
              style={{
                borderColor: accentColor, color: accentColor,
                backgroundColor: `${accentColor}15`,
                boxShadow: `0 0 15px ${accentColor}30`,
                textShadow: `0 0 8px ${accentColor}`,
              }}>
              {t.executeCycle}
            </button>
            {isProcessing && !isFinalizing && (
              <button onClick={handleAbort} disabled={crisisPending}
                className="td-ui-button td-button-danger px-4 py-2 text-xs rounded border transition-all"
                style={{ borderColor: '#ff386060', color: '#ff3860', backgroundColor: '#ff386015' }}>
                {t.abortBtn}
              </button>
            )}
            <button type="button" className="td-ui-button td-button-secondary td-mobile-only px-4 py-2 text-xs rounded border" onClick={() => setMobileToolsOpen(true)} style={{ borderColor: `${accentColor}60`, color: accentColor }}>🧰 {lang === 'zh' ? '工具' : 'TOOLS'}</button>
            <div data-onboarding-target="interrogate" className="td-investigation-npc-list flex gap-2 flex-wrap">
              {caseData.npcs.map(npc => (
                <button key={npc.npc_id} onClick={() => handleNPCTalk(npc)}
                  disabled={interactionLocked}
                  className="td-ui-button td-npc-chip px-3 py-1 text-xs rounded border transition-all disabled:opacity-30 inline-flex items-center gap-2"
                  style={{ borderColor: `${accentColor}40`, color: `${accentColor}cc`, backgroundColor: `${accentColor}08` }}>
                  <span>{npc.avatar} {npc.name}</span>
                  <EmotionBadge level={getEmotion(npcEmotionState, npc.npc_id).level} />
                </button>
              ))}
            </div>
            <InvestigationAssistant brief={assistantBrief} />
          </div>
        </div>}

        {!theaterMode && toolsPanel}
      </div>
    </div>
  );
}
