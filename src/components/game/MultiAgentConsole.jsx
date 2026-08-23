import React, { useState, useRef } from 'react';
import { LocalStorage } from '@/game/gameState';
import { DEFAULT_AGENT_CONFIG } from '@/game/caseData';
import { loadProgression, saveProgression, getLevelFromXP } from '@/game/agentProgression';
import DataFlowCanvas from '@/components/game/DataFlowCanvas';
import AgentSlotCard from '@/components/game/AgentSlotCard';
import TeamSynergyBar from '@/components/game/TeamSynergyBar';
import PresetManager from '@/components/game/PresetManager';
import PromptCalibration from '@/components/game/PromptCalibration';

// ── Default team factory ────────────────────────────────────────────────────
const DEFAULT_NAMES   = ['隼目', '破心', '幽灵'];
const DEFAULT_ROLES   = ['观察型', '审讯型', '黑客型'];
const DEFAULT_STANCES = ['analytical', 'aggressive', 'cautious'];

function makeDefaultTeam() {
  return [
    { agent_id: DEFAULT_NAMES[0], role: DEFAULT_ROLES[0], base_stance: DEFAULT_STANCES[0], logic_power: 30, observation_focus: 55, hack_level: 15 },
    { agent_id: DEFAULT_NAMES[1], role: DEFAULT_ROLES[1], base_stance: DEFAULT_STANCES[1], logic_power: 55, observation_focus: 25, hack_level: 20 },
    { agent_id: DEFAULT_NAMES[2], role: DEFAULT_ROLES[2], base_stance: DEFAULT_STANCES[2], logic_power: 25, observation_focus: 20, hack_level: 55 },
  ];
}

// ── Floating star particles ─────────────────────────────────────────────────
function StarField() {
  const stars = useRef(
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100, y: Math.random() * 100,
      r: 1.2 + Math.random() * 2.8,
      color: ['#ff3aff','#00e5ff','#a3ff47','#ffe600','#ff3860','#fff'][Math.floor(Math.random() * 6)],
      dur: 3 + Math.random() * 5,
      delay: Math.random() * 6,
    }))
  );
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
      {stars.current.map(p => (
        <div key={p.id} className="absolute rounded-full" style={{
          left: `${p.x}%`, top: `${p.y}%`,
          width: p.r, height: p.r,
          backgroundColor: p.color, boxShadow: `0 0 ${p.r * 3}px ${p.color}`,
          animation: `star-twinkle ${p.dur}s ${p.delay}s ease-in-out infinite alternate`,
        }} />
      ))}
      <style>{`@keyframes star-twinkle{from{opacity:.1;transform:scale(.7)}to{opacity:.85;transform:scale(1.3)}}`}</style>
    </div>
  );
}

// ── Neon title ───────────────────────────────────────────────────────────────
function NeonTitle() {
  return (
    <div style={{ textAlign: 'center', marginBottom: 28 }}>
      {/* Magnifying glass */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}>
        <div style={{ position: 'relative', width: 90, height: 90, animation: 'mag-float 4s ease-in-out infinite' }}>
          <svg width="90" height="90" viewBox="0 0 90 90" overflow="visible">
            <defs>
              <filter id="mg-glow2"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
            </defs>
            <circle cx="36" cy="36" r="22" fill="none" stroke="#00e5ff" strokeWidth="2.5" filter="url(#mg-glow2)" style={{animation:'mg-pulse 2.5s ease-in-out infinite'}}/>
            <circle cx="36" cy="36" r="17" fill="none" stroke="#00e5ff" strokeWidth="0.6" opacity="0.3"/>
            <line x1="16" y1="36" x2="56" y2="36" stroke="#00e5ff" strokeWidth="1.2" opacity="0.6" clipPath="url(#lclip)" style={{animation:'mg-scan 2s ease-in-out infinite',transformOrigin:'36px 36px'}}/>
            <clipPath id="lclip"><circle cx="36" cy="36" r="22"/></clipPath>
            <text x="36" y="43" textAnchor="middle" fontSize="16" fontWeight="900" fill="#00e5ff" filter="url(#mg-glow2)" fontFamily="monospace">?</text>
            <line x1="52" y1="52" x2="76" y2="78" stroke="#00e5ff" strokeWidth="5" strokeLinecap="round" filter="url(#mg-glow2)"/>
            <circle r="2.5" fill="#ff3aff">
              <animateMotion dur="2.8s" repeatCount="indefinite" path="M 36 14 A 22 22 0 1 1 35.9 14"/>
            </circle>
          </svg>
          <style>{`@keyframes mag-float{0%,100%{transform:translateY(0) rotate(-3deg)}50%{transform:translateY(-8px) rotate(3deg)}}@keyframes mg-pulse{0%,100%{opacity:.8}50%{opacity:1}}@keyframes mg-scan{0%{transform:rotate(-50deg);opacity:0}20%{opacity:.8}80%{opacity:.6}100%{transform:rotate(50deg);opacity:0}}`}</style>
        </div>
      </div>

      {'TERMINAL'.split('').map((ch, i) => (
        <span key={i} style={{
          display: 'inline-block',
          fontSize: 'clamp(1.8rem,5vw,3rem)',
          fontWeight: 900, fontFamily: 'monospace',
          color: '#ff3aff',
          textShadow: '0 0 8px #ff3aff,0 0 24px #ff3aff80',
          letterSpacing: '0.18em',
          animation: `tl-in .5s ${i*.05}s cubic-bezier(.22,1,.36,1) both`,
        }}>{ch}</span>
      ))}
      <br />
      {'DETECTIVE'.split('').map((ch, i) => (
        <span key={i} style={{
          display: 'inline-block',
          fontSize: 'clamp(1.8rem,5vw,3rem)',
          fontWeight: 900, fontFamily: 'monospace',
          color: '#ff3aff',
          textShadow: '0 0 8px #ff3aff,0 0 24px #ff3aff80',
          letterSpacing: '0.18em',
          animation: `tl-in .5s ${(i+8)*.05}s cubic-bezier(.22,1,.36,1) both`,
        }}>{ch}</span>
      ))}

      <div style={{ height:2, margin:'8px auto 10px', width:'65%', background:'linear-gradient(to right,transparent,#ff3aff,#00e5ff,#ff3aff,transparent)', borderRadius:2, boxShadow:'0 0 10px #ff3aff80' }} />
      <div style={{ color:'rgba(200,230,255,0.45)', letterSpacing:'0.5em', fontSize:'0.65rem', fontFamily:'monospace', marginBottom:8 }}>
        MULTI·AGENT·DISPATCH·CONSOLE
      </div>

      <style>{`@keyframes tl-in{from{opacity:0;transform:translateY(-18px) scaleY(1.4);filter:blur(5px)}to{opacity:1;transform:none;filter:none}}`}</style>
    </div>
  );
}

// ── Main Console ─────────────────────────────────────────────────────────────
export default function MultiAgentConsole({ onDeploy }) {
  const [agents, setAgents] = useState(() => {
    const saved = LocalStorage.loadTeamConfig();
    if (saved && Array.isArray(saved) && saved.length === 3) return saved;
    return makeDefaultTeam();
  });
  const [progression, setProgression] = useState(() => loadProgression());
  const [activeAgent, setActiveAgent] = useState(0);
  const [comboEvent, setComboEvent] = useState(null);

  const fireCombo = (pair) => {
    setComboEvent({ pair, id: Date.now() });
    setTimeout(() => setComboEvent(null), 100);
  };

  const updateAgent = (idx, updated) => {
    setAgents(prev => prev.map((a, i) => i === idx ? updated : a));
  };

  const handleCalibrationBonus = (bonuses) => {
    setAgents(prev => {
      const next = [...prev];
      bonuses.forEach(b => {
        if (next[b.agent_idx] && b.attr && b.points > 0) {
          next[b.agent_idx] = {
            ...next[b.agent_idx],
            [b.attr]: Math.min(100, (next[b.agent_idx][b.attr] || 0) + b.points),
          };
        }
      });
      return next;
    });
  };

  const handleDeploy = () => {
    saveProgression(progression);
    LocalStorage.saveTeamConfig(agents);

    const maxLogic = Math.max(...agents.map(a => a.logic_power || 0));
    const maxObs   = Math.max(...agents.map(a => a.observation_focus || 0));
    const maxHack  = Math.max(...agents.map(a => a.hack_level || 0));

    const teamConfig = {
      ...DEFAULT_AGENT_CONFIG,
      agent_id: agents.map(a => a.agent_id).join('+'),
      role: 'Multi_Agent_Team',
      base_stance: agents[activeAgent]?.base_stance || 'analytical',
      team: agents,
      combat_attributes: {
        logic_power: maxLogic,
        observation_focus: maxObs,
        hack_level: maxHack,
      },
      engine_modifiers: {
        confusion_resistance: (agents.reduce((s, a) => s + (a.logic_power || 0), 0)) / 300,
        ap_cost_discount:     (agents.reduce((s, a) => s + (a.observation_focus || 0), 0)) / 500,
      },
      custom_rules: [],
    };
    onDeploy(teamConfig);
  };

  const totalPoints = agents.reduce((s, a) => s + (a.logic_power || 0) + (a.observation_focus || 0) + (a.hack_level || 0), 0);

  return (
    <div
      className="min-h-screen relative flex flex-col items-center py-8 px-4 overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at 50% 0%, #0b1a30 0%, #070d1d 55%, #03060f 100%)',
        fontFamily: "'Courier New', monospace",
        color: 'white',
      }}
    >
      <StarField />

      <div className="relative z-10 w-full max-w-2xl">
        <NeonTitle />

        {/* ── Data flow visualization ── */}
        <div className="rounded-2xl border mb-4 overflow-hidden"
          style={{ borderColor: 'rgba(0,229,255,0.15)', background: 'rgba(10,20,40,0.6)' }}>
          <div className="flex items-center justify-between px-4 pt-3 pb-1 flex-wrap gap-2">
            <div className="text-xs font-bold tracking-widest" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>
              ◈ 智能体协同网络
            </div>
            {/* Combo trigger buttons */}
            <div className="flex gap-1 items-center">
              {[
                { pair: [0, 2], label: '情报↔解密', color: '#a3ff47' },
                { pair: [0, 1], label: '观察↔审讯', color: '#ffe600' },
                { pair: [1, 2], label: '审讯↔渗透', color: '#ff9d00' },
                { pair: [0, 1, 2], label: '三重连击', color: '#ff3aff' },
              ].map(c => (
                <button
                  key={c.pair.join('-')}
                  onClick={() => fireCombo(c.pair)}
                  className="text-xs px-2 py-0.5 rounded-lg border transition-all hover:opacity-90 active:scale-95"
                  style={{
                    borderColor: `${c.color}50`,
                    color: c.color,
                    background: `${c.color}10`,
                    fontFamily: 'monospace',
                    fontSize: '0.55rem',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {c.label}
                </button>
              ))}
              <div className="text-xs px-2 py-0.5 rounded-full border" style={{
                borderColor: 'rgba(0,229,255,0.3)',
                color: '#00e5ff',
                background: 'rgba(0,229,255,0.08)',
                fontFamily: 'monospace',
              }}>
                {totalPoints}pt
              </div>
            </div>
          </div>
          <DataFlowCanvas agents={agents} activeAgent={activeAgent} flowActivity={true} comboEvent={comboEvent} />
        </div>

        {/* ── XP / progression strip ── */}
        <div className="rounded-2xl border mb-3 px-4 py-3 flex items-center gap-4 flex-wrap"
          style={{ borderColor: 'rgba(255,170,0,0.2)', background: 'rgba(255,170,0,0.04)' }}>
          <div style={{ fontSize: '0.65rem', fontFamily: 'monospace', color: 'rgba(255,170,0,0.7)', fontWeight: 700, letterSpacing: '0.08em' }}>
            ◈ 探员养成档案
          </div>
          {progression.map((p, i) => {
            const lvl = getLevelFromXP(p.xp || 0);
            const colors = ['#00e5ff','#ff6b6b','#a78bfa'];
            const names = ['隼目','破心','幽灵'];
            return (
              <div key={i} className="flex items-center gap-1.5">
                <div style={{ width:18, height:18, borderRadius:'50%', border:`1.5px solid ${colors[i]}`, background:`${colors[i]}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10 }}>
                  {['👁️','🔥','💻'][i]}
                </div>
                <span style={{ color: colors[i], fontSize:'0.6rem', fontFamily:'monospace', fontWeight:700 }}>{names[i]}</span>
                <span style={{ color:'rgba(255,255,255,0.35)', fontSize:'0.6rem', fontFamily:'monospace' }}>Lv.{lvl} · {p.xp||0}XP</span>
              </div>
            );
          })}
          {/* Dev test button — grant 100 XP to all */}
          <button
            onClick={() => {
              const updated = progression.map(p => ({ ...p, xp: (p.xp || 0) + 100 }));
              setProgression(updated);
              saveProgression(updated);
            }}
            className="ml-auto text-xs px-2 py-0.5 rounded-lg border transition-all hover:opacity-80"
            style={{ borderColor:'rgba(255,170,0,0.3)', color:'rgba(255,170,0,0.6)', background:'rgba(255,170,0,0.06)', fontFamily:'monospace' }}
          >
            +100 XP [测试]
          </button>
        </div>

        {/* ── Preset strategy manager ── */}
        <PresetManager agents={agents} onLoad={loaded => setAgents(loaded)} />

        {/* ── Prompt calibration — user writes 3 directives, LLM awards bonus pts ── */}
        <PromptCalibration agents={agents} onBonusApplied={handleCalibrationBonus} />

        {/* ── Agent slot cards (3 columns on desktop, stacked on mobile) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {agents.map((agent, i) => (
            <AgentSlotCard
              key={i}
              agent={agent}
              idx={i}
              isActive={activeAgent === i}
              totalPool={300}
              onUpdate={updateAgent}
              onClick={() => setActiveAgent(i)}
              xp={progression[i]?.xp || 0}
            />
          ))}
        </div>

        {/* ── Team synergy analysis ── */}
        <div className="mb-4">
          <TeamSynergyBar agents={agents} />
        </div>

        {/* ── Deploy button ── */}
        <button
          onClick={handleDeploy}
          className="w-full py-4 rounded-2xl text-base font-black tracking-widest transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
          style={{
            background: 'linear-gradient(135deg, #00c8ff 0%, #ff3aff 100%)',
            boxShadow: '0 0 40px rgba(0,200,255,0.4), 0 0 80px rgba(255,58,255,0.2)',
            color: '#fff',
            textShadow: '0 0 12px rgba(255,255,255,0.5)',
            border: 'none',
            letterSpacing: '0.2em',
          }}
        >
          ▶ 部署侦查编队
        </button>
      </div>
    </div>
  );
}