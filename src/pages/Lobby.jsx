import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LocalStorage } from '@/game/gameState';
import { DEFAULT_AGENT_CONFIG, Case_Data_Lvl_01 } from '@/game/caseData';
import AgentConfigPanel from '@/components/game/AgentConfigPanel';

const MATRIX_CHARS = '01アイウエオカキクケコ∑∆∇∫≈≠∞ΩΨΦ';

function MatrixRain() {
  const [drops, setDrops] = useState([]);
  useEffect(() => {
    setDrops(Array.from({ length: 25 }, (_, i) => ({
      id: i,
      x: (i / 25) * 100,
      chars: Array.from({ length: 12 }, () => MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]),
      speed: 1 + Math.random() * 2,
      offset: Math.random() * 100,
    })));
    const interval = setInterval(() => {
      setDrops(prev => prev.map(d => ({
        ...d,
        chars: d.chars.map(c => Math.random() < 0.05 ? MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)] : c),
      })));
    }, 150);
    return () => clearInterval(interval);
  }, []);
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-10">
      {drops.map(d => (
        <div
          key={d.id}
          className="absolute top-0 text-green-400 text-xs leading-5"
          style={{ left: `${d.x}%`, fontFamily: 'monospace', color: '#00ffff' }}
        >
          {d.chars.map((c, i) => (
            <div key={i} style={{ opacity: 1 - i / d.chars.length }}>{c}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Lobby() {
  const [agentConfig, setAgentConfig] = useState(() => LocalStorage.loadStrategy() || DEFAULT_AGENT_CONFIG);
  const [saved, setSaved] = useState(false);

  const handleSave = (config) => {
    setAgentConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleStartGame = () => {
    // Clear any stale save data when starting fresh
    LocalStorage.saveCheckpoints([]);
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        backgroundColor: '#050a14',
        color: '#ffffff',
        fontFamily: 'monospace',
      }}
    >
      <MatrixRain />

      {/* Header */}
      <header
        className="relative z-10 border-b px-6 py-4 flex items-center gap-4"
        style={{ borderColor: 'rgba(0,255,255,0.2)', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <div
          className="text-xl font-black tracking-widest"
          style={{ color: '#00ffff', textShadow: '0 0 20px #00ffff' }}
        >
          TERMINAL_DETECTIVE
        </div>
        <div className="text-xs opacity-40">v2.7.1 · LOGIC ARCHITECT EDITION</div>
        <div className="ml-auto flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" style={{ boxShadow: '0 0 6px #00ff88' }} />
          <span className="text-xs" style={{ color: '#00ff88' }}>SYSTEMS ONLINE</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row relative z-10">
        {/* Left: Case Briefing */}
        <div className="flex-1 flex flex-col p-6 lg:p-8">
          {/* Case title card */}
          <div
            className="rounded-xl border p-6 mb-6"
            style={{
              borderColor: 'rgba(255,56,96,0.4)',
              background: 'linear-gradient(135deg, rgba(74,14,14,0.4) 0%, rgba(5,10,20,0.9) 100%)',
              boxShadow: '0 0 40px rgba(255,56,96,0.15)',
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="text-5xl p-3 rounded-lg"
                style={{ backgroundColor: 'rgba(255,56,96,0.1)', border: '1px solid rgba(255,56,96,0.3)' }}
              >
                🔍
              </div>
              <div className="flex-1">
                <div className="text-xs font-bold tracking-widest mb-1" style={{ color: '#ff3860' }}>
                  ACTIVE CASE FILE — {Case_Data_Lvl_01.case_id}
                </div>
                <div className="text-2xl font-black mb-1" style={{ textShadow: '0 0 20px rgba(255,255,255,0.5)' }}>
                  {Case_Data_Lvl_01.title}
                </div>
                <div className="text-sm opacity-50 italic mb-3">{Case_Data_Lvl_01.subtitle}</div>
                <div
                  className="inline-flex items-center gap-2 px-3 py-1 rounded text-xs font-bold"
                  style={{
                    backgroundColor: 'rgba(255,56,96,0.15)',
                    border: '1px solid rgba(255,56,96,0.4)',
                    color: '#ff3860',
                  }}
                >
                  ⚠ DIFFICULTY: {Case_Data_Lvl_01.difficulty}
                </div>
              </div>
            </div>
          </div>

          {/* Scene description */}
          <div
            className="rounded-lg border p-5 mb-6"
            style={{ borderColor: 'rgba(0,255,255,0.15)', backgroundColor: 'rgba(0,255,255,0.03)' }}
          >
            <div className="text-xs font-bold tracking-widest mb-3" style={{ color: '#00ffff' }}>
              ◈ SCENE BRIEFING
            </div>
            <p className="text-sm leading-relaxed opacity-80">{Case_Data_Lvl_01.scene.description}</p>
          </div>

          {/* NPC list */}
          <div className="mb-6">
            <div className="text-xs font-bold tracking-widest mb-3 opacity-50">PERSONS OF INTEREST</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {Case_Data_Lvl_01.npcs.map(npc => (
                <div
                  key={npc.npc_id}
                  className="p-4 rounded-lg border"
                  style={{
                    borderColor: 'rgba(255,170,0,0.2)',
                    backgroundColor: 'rgba(255,170,0,0.03)',
                  }}
                >
                  <div className="text-2xl mb-2">{npc.avatar}</div>
                  <div className="text-sm font-bold mb-1" style={{ color: '#ffaa00' }}>{npc.name}</div>
                  <div className="text-xs opacity-50">{npc.role}</div>
                  <div className="text-xs mt-2 opacity-70 italic">"{npc.initial_statement.slice(0, 60)}..."</div>
                </div>
              ))}
            </div>
          </div>

          {/* Clue count */}
          <div
            className="rounded-lg border p-4 mb-6"
            style={{ borderColor: 'rgba(0,255,136,0.2)', backgroundColor: 'rgba(0,255,136,0.03)' }}
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold tracking-widest" style={{ color: '#00ff88' }}>◈ EVIDENCE DATABASE</div>
                <div className="text-sm opacity-60 mt-1">{Case_Data_Lvl_01.clue_dictionary.length} clues to discover · {Case_Data_Lvl_01.npcs.length} suspects to interrogate</div>
              </div>
              <div className="text-3xl font-black" style={{ color: '#00ff88' }}>
                {Case_Data_Lvl_01.clue_dictionary.filter(c => c.weight === 'CRITICAL').length}
                <span className="text-xs font-normal opacity-50 ml-1">CRITICAL</span>
              </div>
            </div>
          </div>

          {/* Start button */}
          <div className="mt-auto">
            {saved && (
              <div className="text-xs text-center mb-3" style={{ color: '#00ff88' }}>
                ✓ Configuration saved successfully
              </div>
            )}
            <Link to="/game" onClick={handleStartGame}>
              <button
                className="w-full py-4 rounded-xl text-lg font-black tracking-widest border-2 transition-all duration-300 hover:scale-105"
                style={{
                  borderColor: '#00ffff',
                  color: '#00ffff',
                  backgroundColor: 'rgba(0,255,255,0.1)',
                  boxShadow: '0 0 30px rgba(0,255,255,0.4), inset 0 0 30px rgba(0,255,255,0.05)',
                  textShadow: '0 0 15px #00ffff',
                }}
              >
                ◈ BEGIN INVESTIGATION
              </button>
            </Link>
          </div>
        </div>

        {/* Right: Agent Configuration Panel */}
        <div
          className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l flex flex-col"
          style={{
            borderColor: 'rgba(0,255,255,0.15)',
            backgroundColor: 'rgba(0,5,15,0.8)',
          }}
        >
          <div
            className="px-4 py-3 border-b flex items-center gap-2"
            style={{ borderColor: 'rgba(0,255,255,0.15)' }}
          >
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#00ffff', boxShadow: '0 0 6px #00ffff' }} />
            <span className="text-xs font-bold tracking-widest" style={{ color: '#00ffff' }}>
              AGENT CONFIGURATION CONSOLE
            </span>
          </div>
          <div className="flex-1 overflow-hidden p-4">
            <AgentConfigPanel onSave={handleSave} initialConfig={agentConfig} />
          </div>
        </div>
      </div>
    </div>
  );
}
