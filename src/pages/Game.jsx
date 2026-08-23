import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useReActEngine } from '@/hooks/useReActEngine';
import { LocalStorage } from '@/game/gameState';
import { Case_Data_Lvl_01, Phase_Color_Map } from '@/game/caseData';
import GlitchOverlay from '@/components/game/GlitchOverlay';
import BSoD from '@/components/game/BSoD';
import EvidenceBoard from '@/components/game/EvidenceBoard';
import TerminalLog from '@/components/game/TerminalLog';
import ClueCard from '@/components/game/ClueCard';
import StatBar from '@/components/game/StatBar';
import JudgeModal from '@/components/game/JudgeModal';
import BranchModal from '@/components/game/BranchModal';

export default function Game() {
  const [agentStrategy] = useState(() => LocalStorage.loadStrategy());
  const [activeTab, setActiveTab] = useState('terminal'); // 'terminal' | 'evidence' | 'clues'

  const {
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
  } = useReActEngine(agentStrategy);

  const phaseConfig = Phase_Color_Map[reactState] || Phase_Color_Map.IDLE;
  const glitchIntensity = Math.round(gameState.confusion_score * 0.7);

  // Unlock evidence board clues
  const unlockedClueFull = gameState.unlocked_clues.map(id =>
    Case_Data_Lvl_01.clue_dictionary.find(c => c.clue_id === id)
  ).filter(Boolean);

  const bgStyle = {
    background: `radial-gradient(ellipse at 50% 0%, ${phaseConfig.bg}cc 0%, #050a14 60%)`,
    transition: 'background 1s ease',
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ ...bgStyle, color: '#fff', fontFamily: 'monospace' }}>
      <GlitchOverlay intensity={glitchIntensity} type={reactState === 'ACT' ? 'red' : 'default'} />
      {isBSOD && <BSoD agentId={agentStrategy?.agent_id || 'AGENT'} onDismiss={dismissBSOD} />}
      {branchData && (
        <BranchModal
          branch={branchData}
          onRollback={() => { rollback(); setBranchData(null); }}
          onRestart={() => { resetGame(); setBranchData(null); }}
        />
      )}
      {judgeResult && (
        <JudgeModal
          result={judgeResult}
          onClose={() => setJudgeResult(null)}
          onRetry={() => setJudgeResult(null)}
        />
      )}

      {/* ── TOP NAV BAR ─────────────────────────────────────────────── */}
      <header
        className="flex items-center gap-3 px-4 py-2 border-b flex-shrink-0 z-10"
        style={{ borderColor: `${phaseConfig.accent}30`, backgroundColor: 'rgba(0,0,0,0.7)' }}
      >
        <Link to="/" className="text-xs opacity-40 hover:opacity-80 transition-opacity">← LOBBY</Link>
        <div className="w-px h-4 opacity-20" style={{ backgroundColor: phaseConfig.accent }} />
        <div
          className="text-sm font-black tracking-widest"
          style={{ color: phaseConfig.accent, textShadow: `0 0 10px ${phaseConfig.accent}` }}
        >
          TERMINAL_DETECTIVE
        </div>
        <div className="text-xs opacity-30">/ {Case_Data_Lvl_01.title}</div>

        {/* Phase badge */}
        <div
          className="ml-auto flex items-center gap-2 px-3 py-1 rounded"
          style={{
            backgroundColor: `${phaseConfig.accent}15`,
            border: `1px solid ${phaseConfig.accent}40`,
          }}
        >
          <div
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: phaseConfig.accent,
              boxShadow: `0 0 6px ${phaseConfig.accent}`,
              animation: isRunning ? 'pulse 0.5s ease-in-out infinite' : 'none',
            }}
          />
          <span className="text-xs font-bold" style={{ color: phaseConfig.accent }}>
            {phaseConfig.label}
          </span>
        </div>

        {/* Agent tag */}
        <div className="text-xs opacity-50">
          [{agentStrategy?.agent_id || 'AGENT'}]
        </div>
      </header>

      {/* ── MAIN LAYOUT ──────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* ── LEFT SIDEBAR: Stats ────────────────────────────────────── */}
        <aside
          className="w-52 flex-shrink-0 border-r flex flex-col p-3 overflow-y-auto"
          style={{ borderColor: 'rgba(0,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="text-xs font-bold tracking-widest mb-3 opacity-40">AGENT STATUS</div>

          <StatBar label="INTEGRITY" value={gameState.current_hp} max={100} color="#00ff88" />
          <StatBar label="ACTION POINTS" value={gameState.action_points_left} max={20} color="#00ffff" />
          <StatBar label="CONFUSION" value={gameState.confusion_score} max={100} color="#ffaa00" warning />

          <div className="my-3 h-px opacity-10 bg-white" />

          <div className="text-xs font-bold tracking-widest mb-2 opacity-40">CASE STATS</div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="opacity-50">Turn</span>
              <span style={{ color: '#00ffff' }}>{gameState.turn_count}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-50">Clues</span>
              <span style={{ color: '#00ff88' }}>{gameState.unlocked_clues.length}/{Case_Data_Lvl_01.clue_dictionary.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-50">Zone</span>
              <span style={{ color: '#bf5fff' }} className="text-right">
                {Case_Data_Lvl_01.scene.zones[gameState.current_zone]?.label?.split(' · ')[0] || gameState.current_zone}
              </span>
            </div>
          </div>

          {/* Confusion visual feedback */}
          {gameState.confusion_score > 0 && (
            <div
              className="mt-3 p-2 rounded text-xs"
              style={{
                backgroundColor: `rgba(255,170,0,${gameState.confusion_score / 400})`,
                border: `1px solid rgba(255,170,0,${gameState.confusion_score / 200})`,
                color: '#ffaa00',
              }}
            >
              ⚡ CONFUSION: {gameState.confusion_score}%
              {gameState.confusion_score > 75 && ' — CRITICAL'}
            </div>
          )}

          <div className="my-3 h-px opacity-10 bg-white" />

          {/* Action Buttons */}
          <div className="space-y-2 mt-auto">
            <button
              onClick={runTurn}
              disabled={isRunning || gameState.action_points_left <= 0}
              className="w-full py-2 rounded font-bold text-xs border transition-all duration-200 hover:scale-105 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: phaseConfig.accent,
                color: phaseConfig.accent,
                backgroundColor: `${phaseConfig.accent}15`,
                boxShadow: isRunning ? `0 0 15px ${phaseConfig.accent}40` : 'none',
              }}
            >
              {isRunning ? '⊙ RUNNING...' : '▶ RUN TURN'}
            </button>

            {isRunning && (
              <button
                onClick={abortTurn}
                className="w-full py-2 rounded font-bold text-xs border transition-all"
                style={{ borderColor: '#ff3860', color: '#ff3860', backgroundColor: 'rgba(255,56,96,0.1)' }}
              >
                ⊘ ABORT
              </button>
            )}

            <button
              onClick={resetGame}
              className="w-full py-1.5 rounded text-xs border opacity-40 hover:opacity-80 transition-opacity"
              style={{ borderColor: '#ffffff30', color: '#ffffff80' }}
            >
              ↺ RESET
            </button>
          </div>
        </aside>

        {/* ── CENTER: Terminal + Evidence ────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div
            className="flex border-b flex-shrink-0"
            style={{ borderColor: 'rgba(0,255,255,0.1)' }}
          >
            {[
              { key: 'terminal', label: '◈ TERMINAL' },
              { key: 'evidence', label: '◈ EVIDENCE BOARD' },
              { key: 'clues', label: `◈ CLUES (${gameState.unlocked_clues.length})` },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="px-4 py-2 text-xs font-bold tracking-widest border-b-2 transition-all"
                style={{
                  borderColor: activeTab === tab.key ? phaseConfig.accent : 'transparent',
                  color: activeTab === tab.key ? phaseConfig.accent : 'rgba(255,255,255,0.3)',
                  backgroundColor: activeTab === tab.key ? `${phaseConfig.accent}08` : 'transparent',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === 'terminal' && (
              <TerminalLog
                logs={logs}
                streamingText={streamingText}
                reactState={reactState}
                stressLevel={stressLevel}
                inputDisabled={isRunning}
                onSubmitReport={submitReport}
              />
            )}

            {activeTab === 'evidence' && (
              <div
                className="h-full"
                style={{ backgroundColor: 'rgba(5,10,20,0.95)' }}
              >
                <EvidenceBoard
                  unlockedClues={gameState.unlocked_clues}
                  clueDictionary={Case_Data_Lvl_01.clue_dictionary}
                  validEdges={[]}
                />
              </div>
            )}

            {activeTab === 'clues' && (
              <div
                className="h-full overflow-y-auto p-4"
                style={{ backgroundColor: 'rgba(5,10,20,0.95)' }}
              >
                {unlockedClueFull.length === 0 ? (
                  <div className="flex items-center justify-center h-full opacity-30 text-center">
                    <div>
                      <div className="text-4xl mb-3">🔍</div>
                      <div className="text-sm">No evidence secured yet.</div>
                      <div className="text-xs mt-1">Run investigation turns to discover clues.</div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {unlockedClueFull.map(clue => (
                      <ClueCard
                        key={clue.clue_id}
                        clue={clue}
                        isNew={newClueIds.includes(clue.clue_id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        {/* ── RIGHT SIDEBAR: NPC & Clue quick view ─────────────────── */}
        <aside
          className="w-56 flex-shrink-0 border-l flex flex-col overflow-hidden"
          style={{ borderColor: 'rgba(0,255,255,0.1)', backgroundColor: 'rgba(0,0,0,0.5)' }}
        >
          <div className="p-3 border-b" style={{ borderColor: 'rgba(0,255,255,0.1)' }}>
            <div className="text-xs font-bold tracking-widest opacity-40 mb-3">SUSPECTS</div>
            <div className="space-y-2">
              {Case_Data_Lvl_01.npcs.map(npc => (
                <div
                  key={npc.npc_id}
                  className="flex items-center gap-2 p-2 rounded text-xs"
                  style={{ backgroundColor: 'rgba(255,170,0,0.05)', border: '1px solid rgba(255,170,0,0.1)' }}
                >
                  <span className="text-lg">{npc.avatar}</span>
                  <div>
                    <div className="font-bold" style={{ color: '#ffaa00' }}>{npc.name}</div>
                    <div className="opacity-40 text-xs">{npc.role.split(' ').slice(0, 2).join(' ')}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex-1 p-3 overflow-y-auto">
            <div className="text-xs font-bold tracking-widest opacity-40 mb-3">EVIDENCE TRAIL</div>
            {gameState.unlocked_clues.length === 0 ? (
              <div className="text-xs opacity-20 text-center mt-4">No clues yet</div>
            ) : (
              <div className="space-y-2">
                {unlockedClueFull.map(clue => (
                  <ClueCard
                    key={clue.clue_id}
                    clue={clue}
                    compact
                    isNew={newClueIds.includes(clue.clue_id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Ban list */}
          {gameState.action_ban_list?.length > 0 && (
            <div
              className="p-3 border-t"
              style={{ borderColor: 'rgba(255,56,96,0.2)' }}
            >
              <div className="text-xs font-bold mb-2" style={{ color: '#ff3860' }}>⛔ BANNED ACTIONS</div>
              {gameState.action_ban_list.map((action, i) => (
                <div key={i} className="text-xs opacity-50 line-through">{action}</div>
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
