// ═══════════════════════════════════════════════════════════════════════════
// react_engine.js — The ReAct Orchestrator Hook
// Manages the full Observe → Think → Act loop
// ═══════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback } from 'react';
import { ReAct_Enum, Legal_Actions_List, Case_Data_Lvl_01 } from '@/game/caseData';
import { createInitialGameState, applySettlementResult, generateObservation } from '@/game/gameState';
import { streamThink, getAction, settleAction, parseActionTag } from '@/game/llmClient';

export function useReActEngine(agentStrategy) {
  const [gameState, setGameState] = useState(() => createInitialGameState(Case_Data_Lvl_01));
  const [reactState, setReactState] = useState(ReAct_Enum.IDLE);
  const [logs, setLogs] = useState([]);
  const [streamingText, setStreamingText] = useState('');
  const [stressLevel, setStressLevel] = useState(0);
  const [newClueIds, setNewClueIds] = useState([]);
  const [isBSOD, setIsBSOD] = useState(false);
  const [branchData, setBranchData] = useState(null);
  const [judgeResult, setJudgeResult] = useState(null);
  const [isRunning, setIsRunning] = useState(false);
  const [checkpointStack, setCheckpointStack] = useState([]);

  const abortRef = useRef(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  const addLog = useCallback((text, type = 'SYSTEM', prefix = '') => {
    setLogs(prev => [...prev, { text, type, prefix, ts: Date.now() }]);
  }, []);

  // ── Push Checkpoint ──────────────────────────────────────────────────────
  const pushCheckpoint = useCallback((state) => {
    setCheckpointStack(prev => [JSON.parse(JSON.stringify(state)), ...prev].slice(0, 10));
  }, []);

  // ── Rollback ─────────────────────────────────────────────────────────────
  const rollback = useCallback(() => {
    setCheckpointStack(prev => {
      if (prev.length === 0) return prev;
      const [snapshot, ...rest] = prev;
      setGameState(snapshot);
      gameStateRef.current = snapshot;
      setBranchData(null);
      addLog('⟳ TIME-SPACE ROLLBACK EXECUTED. Restoring previous checkpoint...', 'SYSTEM');
      setReactState(ReAct_Enum.IDLE);
      return rest;
    });
  }, [addLog]);

  // ── Run one full ReAct Turn ───────────────────────────────────────────────
  const runTurn = useCallback(async () => {
    if (isRunning) return;
    const state = gameStateRef.current;

    if (state.action_points_left <= 0) {
      addLog('⚠ Action Points exhausted. Submit your final report.', 'SYSTEM');
      return;
    }
    if (state.current_hp <= 0) {
      addLog('☠ System integrity critical. Agent offline.', 'ERROR');
      return;
    }

    // Push checkpoint at zone entry
    pushCheckpoint(state);

    setIsRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      // ── PHASE 1: OBSERVE ────────────────────────────────────────────────
      setReactState(ReAct_Enum.OBSERVE);
      const observation = generateObservation(state, Case_Data_Lvl_01);
      addLog(observation, 'OBSERVE', 'SCAN');

      // Check hidden clue unlock by turn
      const currentTurn = state.turn_count;
      const hiddenToUnlock = Case_Data_Lvl_01.hidden_clues.filter(h =>
        h.unlock_turn <= currentTurn && !state.unlocked_clues.includes(h.clue_id)
      );
      if (hiddenToUnlock.length > 0) {
        hiddenToUnlock.forEach(h => {
          addLog(`📡 ${h.text}`, 'SYSTEM');
        });
        setGameState(prev => ({
          ...prev,
          unlocked_clues: [...prev.unlocked_clues, ...hiddenToUnlock.map(h => h.clue_id)],
          unlocked_clues_set: new Set([...prev.unlocked_clues, ...hiddenToUnlock.map(h => h.clue_id)]),
        }));
        setNewClueIds(hiddenToUnlock.map(h => h.clue_id));
        setTimeout(() => setNewClueIds([]), 3000);
      }

      await new Promise(r => setTimeout(r, 600));
      if (ctrl.signal.aborted) return;

      // ── PHASE 2: THINK ──────────────────────────────────────────────────
      setReactState(ReAct_Enum.THINK);
      setStressLevel(0);
      addLog('Initiating neural reasoning process...', 'THINK', agentStrategy?.agent_id || 'AGENT');

      // Stress timer for overload visualization
      const stressTimer = setInterval(() => {
        setStressLevel(prev => Math.min(100, prev + 5));
      }, 500);

      let thoughtProcess = '';
      setStreamingText('');

      await streamThink({
        gameState: { ...state, case_title: Case_Data_Lvl_01.title },
        agentStrategy: agentStrategy || {},
        chatHistory: state.chat_history?.slice(-6) || [],
        banList: state.action_ban_list || [],
        observation,
        onChunk: (char) => {
          thoughtProcess += char;
          setStreamingText(prev => prev + char);
          setStressLevel(0); // Reset stress on first token
        },
        onDone: (full) => {
          thoughtProcess = full;
          clearInterval(stressTimer);
          setStressLevel(0);
          setStreamingText('');
        },
        signal: ctrl.signal,
      });

      clearInterval(stressTimer);
      setStressLevel(0);
      setStreamingText('');

      if (ctrl.signal.aborted) {
        setIsRunning(false);
        setReactState(ReAct_Enum.IDLE);
        return;
      }

      addLog(thoughtProcess, 'THINK', agentStrategy?.agent_id || 'AGENT');

      // ── PHASE 3: ACT ────────────────────────────────────────────────────
      setReactState(ReAct_Enum.ACT);
      addLog('Synthesizing action directive...', 'ACT');

      const actionText = await getAction({
        thoughtProcess,
        gameState: state,
        agentStrategy: agentStrategy || {},
        signal: ctrl.signal,
      });

      const actionName = parseActionTag(actionText);
      const isLegal = actionName && Legal_Actions_List.includes(actionName);

      addLog(`⚡ ACTION DIRECTIVE: [${actionName || 'unknown'}]`, 'ACT', 'EXEC');

      if (!isLegal) {
        addLog(`⛔ ILLEGAL ACTION DETECTED: "${actionName}". Engaging GM override...`, 'ERROR');
      }

      // ── SETTLEMENT ──────────────────────────────────────────────────────
      const settlement = await settleAction({
        actionName: actionName || 'search_area',
        actionTag: actionName,
        gameState: state,
        caseData: Case_Data_Lvl_01,
        agentStrategy: agentStrategy || {},
        isIllegal: !isLegal,
        signal: ctrl.signal,
      });

      addLog(settlement.action_narration, 'ACT', 'RESULT');

      if (settlement.is_trap && settlement.trap_narration) {
        addLog(`⚠ [ADVERSARIAL INTEL]: ${settlement.trap_narration}`, 'ERROR', 'TRAP');
      }

      // Apply settlement
      const { newState, newClues } = applySettlementResult(state, settlement, agentStrategy, Case_Data_Lvl_01);
      newState.last_action = actionName;
      newState.chat_history = [
        ...(state.chat_history || []),
        { role: 'assistant', content: thoughtProcess },
        { role: 'user', content: `Result: ${settlement.action_narration}` }
      ].slice(-12);

      setGameState(newState);
      gameStateRef.current = newState;

      // Animate new clues
      if (newClues.length > 0) {
        newClues.forEach(id => {
          const clue = Case_Data_Lvl_01.clue_dictionary.find(c => c.clue_id === id);
          if (clue) addLog(`🔍 NEW CLUE SECURED: ${clue.visual_icon} ${clue.keyword} — ${clue.description}`, 'CLUE', 'INTEL');
        });
        setNewClueIds(newClues);
        setTimeout(() => setNewClueIds([]), 3000);
      }

      // Check BSOD
      if (newState.confusion_score >= 100) {
        addLog('⚠ CRITICAL: Confusion threshold exceeded. Agent logic corrupted.', 'ERROR');
        setIsBSOD(true);
        setReactState(ReAct_Enum.CRASHED);
        setIsRunning(false);
        return;
      }

      setReactState(ReAct_Enum.IDLE);
      addLog(`— Turn ${newState.turn_count} complete. AP remaining: ${newState.action_points_left} ⚡`, 'SYSTEM');

    } catch (err) {
      if (!abortRef.current?.signal.aborted) {
        addLog(`ERROR: ${err.message}`, 'ERROR');
      }
      setReactState(ReAct_Enum.IDLE);
    } finally {
      setStreamingText('');
      setStressLevel(0);
      setIsRunning(false);
    }
  }, [isRunning, agentStrategy, addLog, pushCheckpoint]);

  // ── Abort current turn ────────────────────────────────────────────────────
  const abortTurn = useCallback(() => {
    abortRef.current?.abort();
    setIsRunning(false);
    setStreamingText('');
    setStressLevel(0);
    setReactState(ReAct_Enum.IDLE);
    addLog('⊘ Turn aborted by operator.', 'SYSTEM');
  }, [addLog]);

  // ── Dismiss BSOD ─────────────────────────────────────────────────────────
  const dismissBSOD = useCallback(() => {
    setIsBSOD(false);
    setGameState(prev => ({ ...prev, confusion_score: 0 }));
    setReactState(ReAct_Enum.IDLE);
    addLog('⟳ Agent module rebooted. Confusion score reset.', 'SYSTEM');
  }, [addLog]);

  // ── Submit Report ─────────────────────────────────────────────────────────
  const submitReport = useCallback(async (reportText) => {
    setReactState(ReAct_Enum.REPORTING);
    addLog('Transmitting case report to Chief Inspector...', 'REPORTING');
    const { judgeReport } = await import('@/game/llmClient');
    const result = await judgeReport({ playerReport: reportText, caseData: Case_Data_Lvl_01 });
    setJudgeResult(result);
    addLog(`JUDGE VERDICT: Score ${result.score} — ${result.critique}`, 'REPORTING');
    setReactState(ReAct_Enum.IDLE);
  }, [addLog]);

  // ── Reset game ────────────────────────────────────────────────────────────
  const resetGame = useCallback(() => {
    setGameState(createInitialGameState(Case_Data_Lvl_01));
    setLogs([]);
    setReactState(ReAct_Enum.IDLE);
    setStreamingText('');
    setBranchData(null);
    setJudgeResult(null);
    setIsBSOD(false);
    setCheckpointStack([]);
    addLog('⟳ Case data reloaded. Investigation reset.', 'SYSTEM');
  }, [addLog]);

  return {
    gameState,
    reactState,
    logs,
    streamingText,
    stressLevel,
    newClueIds,
    isBSOD,
    branchData,
    judgeResult,
    isRunning,
    runTurn,
    abortTurn,
    dismissBSOD,
    setBranchData,
    setJudgeResult,
    submitReport,
    resetGame,
    rollback,
    addLog,
  };
}
