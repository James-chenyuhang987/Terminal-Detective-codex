import { noirColor } from '@/components/ui/palette';
import ScreenTabs from '@/components/ui/ScreenTabs.jsx';
import Icon, { IconText } from '@/components/ui/Icon';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { useSettings } from '@/lib/settings.jsx';
import SettingsDrawer from '@/components/game/settings/SettingsDrawer';
import { getLevelFromXP, getXPToNextLevel } from '@/game/agentProgression';
import SkillTreePanel from '@/components/game/SkillTreePanel';
import AgentRadarChart from '@/components/game/AgentRadarChart';
import SpecialtyAttrPanel from '@/components/game/SpecialtyAttrPanel';
import SynergyUnlockFX from '@/components/game/SynergyUnlockFX';
import { calcTeamSynergy } from '@/game/specialtySystem';
import AgentLoreTooltip from '@/components/game/AgentLoreTooltip';
import AgentDossierPanel from '@/components/game/AgentDossierPanel';
import PresetChips from '@/components/game/PresetChips';
import DeploySequence from '@/components/game/DeploySequence';
import { getLore } from '@/game/agentLore';
import { calcCaseMatchScore, getCaseMatchConfig } from '@/game/casePresets';
import { AGENT_DEFS, PRIORITY_ACTIONS, buildTeamConfig } from '@/game/teamConfig';
import {
  getActiveSupportAgent, getOwnedAgents, prepareCoreAgentReplacement,
} from '@/game/agentMarket';
import { getLobbyLighting } from '@/game/lobbyLighting';
import { useTeamBuilder } from '@/components/game/lobby/useTeamBuilder';
import CommandPlanPanel from '@/components/game/lobby/CommandPlanPanel';
import ParticleCanvas from '@/components/game/lobby/ParticleCanvas';
import CoreAgentMarket from '@/components/game/lobby/CoreAgentMarket';
import LobbyGuideModal from '@/components/game/lobby/LobbyGuideModal';
import { CASE_ENERGY_COST } from '@/game/playerProfile';

function getDisplayLore(agentDef, slot, lang) {
  const starter = AGENT_DEFS[slot];
  if (!agentDef || agentDef.id === starter?.id) return getLore(slot, lang);
  const zh = lang === 'zh';
  const copy = agentDef[lang] || agentDef.zh || {};
  const bonus = Object.entries(agentDef.attribute_bonus || {})
    .map(([key, value]) => `${key.replaceAll('_', ' ').toUpperCase()} +${value}`)
    .join(' · ');
  return {
    id: agentDef.id,
    personality: agentDef.traitEn || (zh ? '精英核心' : 'ELITE CORE'),
    quote: zh
      ? `「${copy.name || agentDef.id}已接入核心席位。更强的能力，也意味着更高的战术责任。」`
      : `“${copy.name || agentDef.id} is online. Greater capability carries greater tactical responsibility.”`,
    summary: zh ? agentDef.desc : agentDef.descEn,
    psych: zh
      ? `核心评估：${copy.role || agentDef.roleZh} · 永久签约 · 可随时替换回原探员`
      : `Core assessment: ${copy.role || agentDef.role} · permanent contract · starter can be restored at any time`,
    timeline: zh ? [
      { year: '档案', title: '核心候选认证', text: '通过全息探员大厅的高阶席位兼容性审查。' },
      { year: '签约', title: '永久编入核心储备', text: '签约后永久保留，并继承对应职业席位的经验、技能与专长进度。' },
      { year: '当前', title: '战术链路在线', text: `${bonus || '核心能力矩阵已同步'}。` },
    ] : [
      { year: 'FILE', title: 'Core Candidate Certified', text: 'Cleared the holographic hall compatibility review for this elite slot.' },
      { year: 'PACT', title: 'Permanently Recruited', text: 'Keeps the slot’s XP, skills and specialty progress while assigned.' },
      { year: 'NOW', title: 'Tactical Link Online', text: `${bonus || 'Core capability matrix synchronized'}.` },
    ],
    record: zh ? [
      { label: '战力', value: String(agentDef.power || '—') },
      { label: '等级', value: agentDef.tier || 'CORE' },
      { label: '状态', value: '在线' },
    ] : [
      { label: 'POWER', value: String(agentDef.power || '—') },
      { label: 'TIER', value: agentDef.tier || 'CORE' },
      { label: 'STATUS', value: 'ONLINE' },
    ],
  };
}

function LobbyAtmosphere() {
  return <div className="td-lobby-atmosphere" aria-hidden="true">
    <i className="td-lobby-aurora td-lobby-aurora-a" />
    <i className="td-lobby-aurora td-lobby-aurora-b" />
    <i className="td-lobby-orbit td-lobby-orbit-a" />
    <i className="td-lobby-orbit td-lobby-orbit-b" />
    <i className="td-lobby-vignette" />
  </div>;
}

// ── Holographic Agent Figure ──────────────────────────────────────────────────
function HoloFigure({ agentDef, isSelected, onClick, index, level, onHover }) {
  const { lang } = useLang();
  return (
    <div className={`td-holo-figure ${isSelected ? 'td-holo-selected' : ''}`} onClick={onClick}
      role="button" tabIndex={0} aria-pressed={isSelected}
      aria-label={`${agentDef.id} · ${lang === 'zh' ? agentDef.roleZh : agentDef.role}`}
      onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onClick(); } }}
      onFocus={event => { const box = event.currentTarget.getBoundingClientRect(); onHover?.(index, box.x + box.width / 2, box.y); }}
      onBlur={() => onHover?.(null)}
      onMouseEnter={e => onHover?.(index, e.clientX, e.clientY)}
      onMouseMove={e => onHover?.(index, e.clientX, e.clientY)}
      onMouseLeave={() => onHover?.(null)}
      style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      cursor: 'pointer', position: 'relative', zIndex: 3,
      transform: isSelected ? 'translateY(-4px)' : 'none',
      transition: 'transform 0.35s cubic-bezier(.22,1,.36,1)',
    }}>
      {/* Selected glow aura */}
      {isSelected && (
        <div style={{
          position: 'absolute', inset: -18,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${noirColor(agentDef.color)}25 0%, transparent 70%)`,
          animation: 'none',
          pointerEvents: 'none',
        }}/>
      )}

      {/* SVG figure */}
      <div className="td-holo-avatar" style={{
        width: 76, height: 124,
        opacity: isSelected ? 1 : 0.72,
        transition: 'opacity 0.25s ease', position: 'relative', overflow: 'hidden',
      }}>
        <svg viewBox="0 0 64 110" width="100%" height="100%">
          <defs>
            <linearGradient id={`hg-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={noirColor(agentDef.color)} stopOpacity="0.95"/>
              <stop offset="100%" stopColor={noirColor(agentDef.color)} stopOpacity="0.08"/>
            </linearGradient>
            <clipPath id={`clip-${index}`}><rect x="0" y="0" width="64" height="110"/></clipPath>
          </defs>
          {/* Body parts */}
          <ellipse cx="32" cy="12" rx="9" ry="10" fill={`url(#hg-${index})`} opacity="0.88"/>
          <path d="M18 24 L46 24 L52 70 L42 70 L40 90 L24 90 L22 70 L12 70Z" fill={`url(#hg-${index})`} opacity="0.78"/>
          <path d="M18 28 L6 55 L10 57 L20 34" fill={`url(#hg-${index})`} opacity="0.6"/>
          <path d="M46 28 L58 55 L54 57 L44 34" fill={`url(#hg-${index})`} opacity="0.6"/>
          <path d="M22 90 L18 108 L26 108 L30 90" fill={`url(#hg-${index})`} opacity="0.65"/>
          <path d="M42 90 L46 108 L38 108 L34 90" fill={`url(#hg-${index})`} opacity="0.65"/>
          {/* Static scan lines */}
          {[18, 32, 46, 60, 74, 88].map((y, i) => (
            <line key={i} x1="6" y1={y} x2="58" y2={y}
              stroke={noirColor(agentDef.color)} strokeWidth="0.5" opacity="0.18"/>
          ))}
          {/* Grid overlay */}
          <path d="M0 0 L64 0 M0 55 L64 55 M32 0 L32 110" stroke={noirColor(agentDef.color)} strokeWidth="0.3" opacity="0.12"/>
        </svg>
      </div>

      {/* Name plate */}
      <div className="td-holo-nameplate" style={{ marginTop: 8, textAlign: 'center', fontFamily: 'monospace' }}>
        <div style={{
          fontSize: '0.62rem', fontWeight: 900, color: noirColor(agentDef.color),
          letterSpacing: '0.08em', textShadow: 'none',
        }}>{agentDef.id}</div>
        <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.45)', marginTop: 1 }}>{lang === 'zh' ? agentDef.roleZh : agentDef.role}</div>
        <div style={{
          display: 'inline-block', marginTop: 4,
          fontSize: '0.42rem', color: noirColor(agentDef.color),
          border: `1px solid ${noirColor(agentDef.color)}50`, borderRadius: 3,
          padding: '1px 7px', background: `${noirColor(agentDef.color)}12`,
        }}>Lv.{level} · {agentDef.traitEn}</div>
      </div>

      <style>{`
        @keyframes aura-pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.08)} }
      `}</style>
    </div>
  );
}

// ── Draggable Priority List ───────────────────────────────────────────────────
function PriorityList({ priorityList, onChange }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [dragging, setDragging] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const getAction = (id) => PRIORITY_ACTIONS.find(a => a.id === id);

  const handleDrop = (targetId) => {
    if (!dragging || dragging === targetId) return;
    const next = [...priorityList];
    const from = next.indexOf(dragging);
    const to = next.indexOf(targetId);
    next.splice(from, 1);
    next.splice(to, 0, dragging);
    onChange(next);
    setDragging(null);
    setDragOver(null);
  };

  const move = (id, offset) => {
    const from = priorityList.indexOf(id);
    const to = Math.max(0, Math.min(priorityList.length - 1, from + offset));
    if (from === to) return;
    const next = [...priorityList];
    next.splice(from, 1);
    next.splice(to, 0, id);
    onChange(next);
  };

  const visiblePriorities = expanded ? priorityList : priorityList.slice(0, 3);

  return (
    <div>
      <div style={{
        fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace',
        letterSpacing: '0.12em', marginBottom: 8,
      }}>
        ◈ {zh ? '行动优先级' : 'ACTION PRIORITY'} <span style={{ opacity: 0.5 }}>{zh ? '优先执行前 3 项' : 'TOP 3 EXECUTE FIRST'}</span>
      </div>
      {visiblePriorities.map((id, idx) => {
        const action = getAction(id);
        if (!action) return null;
        const isOver = dragOver === id;
        return (
          <div className="td-priority-row"
            key={id}
            draggable
            onDragStart={() => setDragging(id)}
            onDragOver={e => { e.preventDefault(); setDragOver(id); }}
            onDragLeave={() => setDragOver(null)}
            onDrop={() => handleDrop(id)}
            onDragEnd={() => { setDragging(null); setDragOver(null); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 10px', marginBottom: 4, borderRadius: 8,
              border: `1px solid ${isOver ? noirColor(action.color) : noirColor(action.color) + '25'}`,
              background: isOver ? `${noirColor(action.color)}20` : dragging === id ? `${noirColor(action.color)}10` : 'rgba(255,255,255,0.03)',
              cursor: 'grab', transition: 'all 0.15s',
              transform: isOver ? 'translateX(4px)' : 'none',
              boxShadow: isOver ? `0 0 10px ${noirColor(action.color)}40` : 'none',
              opacity: dragging === id ? 0.5 : 1,
            }}
          >
            <div style={{
              fontSize: '0.48rem', color: 'rgba(255,255,255,0.25)',
              fontFamily: 'monospace', width: 16, textAlign: 'center',
            }}>#{idx + 1}</div>
            <span style={{ fontSize: 14 }}><Icon name={action.icon} /></span>
            <span style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: noirColor(action.color), fontWeight: 700, flex: 1 }}>
              {zh ? action.label : action.labelEn}
            </span>
            <span style={{ fontSize: '0.4rem', color: 'rgba(255,255,255,0.2)' }}>⠿⠿</span>
            <span className="td-mobile-only td-priority-mobile-buttons">
              <button type="button" aria-label={zh ? '上移' : 'Move up'} disabled={idx === 0} onClick={event => { event.stopPropagation(); move(id, -1); }}>↑</button>
              <button type="button" aria-label={zh ? '下移' : 'Move down'} disabled={priorityList.indexOf(id) === priorityList.length - 1} onClick={event => { event.stopPropagation(); move(id, 1); }}>↓</button>
            </span>
          </div>
        );
      })}
      <button className="td-priority-expand" type="button" onClick={() => setExpanded(value => !value)}>
        {expanded
          ? (zh ? '收起次要行动 ↑' : 'HIDE SECONDARY ACTIONS ↑')
          : (zh ? `查看其余 ${Math.max(0, priorityList.length - 3)} 项 ↓` : `SHOW ${Math.max(0, priorityList.length - 3)} MORE ↓`)}
      </button>
    </div>
  );
}

// ── Left: Team Roster + Priority ──────────────────────────────────────────────
function TeamRosterPanel({ agents, agentDefs, selectedIdx, onSelect, progression, onPriorityChange, onHover, onOpenCoreMarket, mobileActive }) {
  const { lang } = useLang();
  const lvls = agentDefs.map((_, i) => getLevelFromXP(progression[i]?.xp || 0));
  return (
    <div id="lobby-panel-formation" role="tabpanel" aria-labelledby="lobby-tab-formation" tabIndex={0} className={`td-lobby-roster td-scroll-region ${mobileActive ? 'td-mobile-active' : ''}`} style={{
      width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10,
      padding: '12px 0 12px 12px',
    }}>
      {/* Roster card */}
      <div className="td-lobby-panel td-lobby-roster-card" style={{
        border: '1px solid rgba(112, 159, 154,0.2)', borderRadius: 12, overflow: 'hidden',
        background: 'rgba(0,8,24,0.85)', backdropFilter: 'blur(10px)',
      }}>
        <div style={{
          padding: '7px 12px', borderBottom: '1px solid rgba(112, 159, 154,0.12)',
          background: 'rgba(112, 159, 154,0.05)',
          fontSize: '0.52rem', color: '#709f9a', fontWeight: 700,
          letterSpacing: '0.12em', fontFamily: 'monospace',
        }}>
          {lang === 'zh' ? '探员编组' : 'TEAM ROSTER'}
        </div>
        {agentDefs.map((def, i) => {
          const isSelected = selectedIdx === i;
          const xpInfo = getXPToNextLevel(progression[i]?.xp || 0);
          return (
            <button type="button" aria-pressed={isSelected} className={`td-roster-agent ${isSelected ? 'td-roster-agent-selected' : ''}`} key={i} onClick={() => onSelect(i)}
              onMouseEnter={e => onHover?.(i, e.clientX, e.clientY)}
              onMouseMove={e => onHover?.(i, e.clientX, e.clientY)}
              onMouseLeave={() => onHover?.(null)}
              style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left', border: 0,
              padding: '10px 12px', cursor: 'pointer',
              borderLeft: `3px solid ${isSelected ? noirColor(def.color) : 'transparent'}`,
              background: isSelected ? `${noirColor(def.color)}12` : 'transparent',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              transition: 'all 0.2s',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${noirColor(def.color)}70`,
                background: isSelected ? `${noirColor(def.color)}30` : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.52rem', color: noirColor(def.color), fontWeight: 900, fontFamily: 'monospace',
                boxShadow: isSelected ? `0 0 10px ${noirColor(def.color)}80` : 'none',
              }}>{lvls[i]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontSize: 11 }}><Icon name={def.icon} /></span>
                  <span style={{ fontSize: '0.58rem', fontWeight: 700, color: noirColor(def.color), fontFamily: 'monospace', letterSpacing: '0.04em' }}>{def.id}</span>
                </div>
                <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{lang === 'zh' ? def.roleZh : def.role}</div>
                {/* XP mini bar */}
                <div style={{ marginTop: 3, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                  <div style={{ width: `${xpInfo.pct}%`, height: '100%', background: noirColor(def.color), borderRadius: 1, transition: 'width 0.5s ease' }}/>
                </div>
              </div>
            </button>
          );
        })}
        <button type="button" onClick={event => onOpenCoreMarket?.(selectedIdx, event.currentTarget)} style={{
          width: 'calc(100% - 20px)', margin: '8px 10px 10px', minHeight: 34, borderRadius: 8,
          border: '1px solid rgba(197, 166, 111,.48)', background: 'rgba(197, 166, 111,.08)',
          color: '#e1d0ac', fontFamily: 'monospace', fontSize: '.5rem', fontWeight: 900, cursor: 'pointer',
        }}>♛ {lang === 'zh' ? '核心签约 / 替换' : 'CORE RECRUIT / REPLACE'}</button>
      </div>

      {/* Priority list card */}
      <div className="td-lobby-panel td-lobby-priority-card" style={{
        border: '1px solid rgba(155, 154, 174,0.2)', borderRadius: 12,
        background: 'rgba(0,4,20,0.85)', backdropFilter: 'blur(10px)',
        padding: '10px 12px', flex: 1,
      }}>
        <PriorityList
          priorityList={agents[selectedIdx]?.priority_list || PRIORITY_ACTIONS.map(p => p.id)}
          onChange={(list) => onPriorityChange(selectedIdx, list)}
        />
      </div>
    </div>
  );
}

// ── Center: Holographic Stage ─────────────────────────────────────────────────
function HoloStage({ agents, agentDefs, selectedIdx, onSelect, accentColor, progression, synergy, onHover, mobileActive, targetCase, activeSupport, supportCount, commanderName }) {
  const { lang } = useLang();
  const activeIdx = agentDefs[selectedIdx] ? selectedIdx : 0;
  const activeDef = agentDefs[activeIdx];
  const lvls = agentDefs.map((_, i) => getLevelFromXP(progression[i]?.xp || 0));

  return (
    <div id="lobby-panel-briefing" role="tabpanel" aria-labelledby="lobby-tab-briefing" tabIndex={0} className={`td-lobby-stage td-lobby-panel td-scroll-region ${mobileActive ? 'td-mobile-active' : ''}`}>
      <div className="td-lobby-stage-scene">
      {/* Grid bg */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: `linear-gradient(${accentColor}12 1px, transparent 1px), linear-gradient(90deg, ${accentColor}12 1px, transparent 1px)`,
        backgroundSize: '32px 32px',
        maskImage: 'radial-gradient(ellipse 85% 85% at 50% 50%, black 30%, transparent 100%)',
      }}/>

      {/* Particle network canvas */}
      <ParticleCanvas agentDefs={agentDefs} selectedIdx={activeIdx} hasTarget={Boolean(targetCase)} />

      <div className="td-stage-focus">
        <span>{targetCase ? 'MISSION COMMAND UPLINK' : 'AGENT CONFIGURATION'}</span>
        <strong style={{ color: noirColor(activeDef.color) }}><Icon name={activeDef.icon} /> {activeDef.id}</strong>
        <small>{synergy.active.length
          ? (lang === 'zh' ? `${synergy.active.length} 项协同已激活` : `${synergy.active.length} SYNERGIES ACTIVE`)
          : (lang === 'zh' ? '选择探员并调整专长' : 'SELECT AN AGENT AND TUNE SPECIALTIES')}</small>
      </div>

      <div className={`td-mission-target ${targetCase ? 'is-targeted' : ''}`}>
        <span>{targetCase ? '◆' : '◇'}</span>
        <strong>{targetCase ? (lang === 'zh' ? targetCase.title : targetCase.en?.title || targetCase.title) : (lang === 'zh' ? '等待案件指派' : 'AWAITING CASE')}</strong>
        <small>{targetCase ? targetCase.difficulty : (lang === 'zh' ? '通用编组模式' : 'GENERAL FORMATION')}</small>
      </div>

      {activeSupport && (
        <div className="td-support-node" style={/** @type {React.CSSProperties & {'--support-color': string}} */ ({ '--support-color': activeSupport.color || '#c5a66f' })}>
          <span><Icon name={activeSupport.icon} /></span><div><small>{lang === 'zh' ? `支援链路 · 后备 ${Math.max(0, supportCount - 1)}` : `SUPPORT LINK · ${Math.max(0, supportCount - 1)} RESERVE`}</small><strong>{activeSupport.id}</strong></div>
        </div>
      )}

      {/* Agents on stage */}
      <div className="td-stage-agents" style={{
        position: 'absolute', bottom: 118, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end',
        padding: '0 30px', zIndex: 3,
      }}>
        {agentDefs.map((def, i) => (
          <HoloFigure
            key={i} agentDef={def} isSelected={selectedIdx === i}
            index={i} level={lvls[i]} onClick={() => onSelect(i)} onHover={onHover}
          />
        ))}
      </div>

      {/* Platform ellipse */}
      <div className="td-holo-platform" style={{ position: 'absolute', bottom: 58, left: '10%', right: '10%', zIndex: 2 }}>
        <svg viewBox="0 0 400 50" width="100%" style={{ overflow: 'visible' }}>
          <defs>
            <linearGradient id="plat-g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={accentColor} stopOpacity="0.7"/>
              <stop offset="100%" stopColor={accentColor} stopOpacity="0.05"/>
            </linearGradient>
          </defs>
          <ellipse cx="200" cy="14" rx="198" ry="16" fill="url(#plat-g)" opacity="0.85"/>
          <ellipse cx="200" cy="14" rx="198" ry="16" fill="none" stroke={accentColor} strokeWidth="1.2" opacity="0.6"/>
          <ellipse cx="200" cy="14" rx="148" ry="12" fill="none" stroke={accentColor} strokeWidth="0.6" strokeDasharray="6 5" opacity="0.3"
            style={{ animation: 'none', transformOrigin: '200px 14px' }}/>
          {[0, 72, 144, 216, 288].map((angle, i) => {
            const r = (angle * Math.PI) / 180;
            return <circle key={i} cx={200 + 180 * Math.cos(r)} cy={14 + 14 * Math.sin(r)} r="3"
              fill={accentColor} opacity="0.8" style={{ animation: 'none' }}/>;
          })}
          <text x="200" y="38" textAnchor="middle" fill={accentColor} fontSize="6"
            fontFamily="monospace" opacity="0.4" letterSpacing="4">
            AGENT DISPATCH CENTER · AI INVESTIGATION UNIT
          </text>
        </svg>
      </div>

      <div className="td-commander-node">
        <span>⌁</span>
        <div><small>COMMAND</small><strong>{commanderName || (lang === 'zh' ? '侦探指挥席' : 'DETECTIVE')}</strong></div>
      </div>

      </div>
      <style>{`
        @keyframes spin-ring { from{stroke-dashoffset:0} to{stroke-dashoffset:100} }
        @keyframes plat-dot { 0%,100%{opacity:0.3} 50%{opacity:1} }
      `}</style>
    </div>
  );
}

// ── Right: Attribute Config + Skill Tree ─────────────────────────────────────
function AttributePanel({ agent, agentDef, agentIdx, spec, onSpecChange, allAgents, progression, skillLoadout, onSkillLoadout, mobileActive }) {
  const { lang } = useLang();
  const [tab, setTab] = useState('attrs'); // 'attrs' | 'skills' | 'dossier'

  const tabs = [
    { key: 'attrs', label: lang === 'zh' ? '属性配置' : 'ATTRIBUTES', icon: '⚙️' },
    { key: 'skills', label: lang === 'zh' ? '技能树' : 'SKILLS', icon: '🌐' },
    { key: 'dossier', label: lang === 'zh' ? '档案' : 'DOSSIER', icon: '📁' },
  ];

  return (
    <div id="lobby-panel-agent" role="tabpanel" aria-labelledby="lobby-tab-agent" className={`td-lobby-attributes ${mobileActive ? 'td-mobile-active' : ''}`} style={{
      width: 300, flexShrink: 0, padding: '12px 12px 12px 0',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div className="td-lobby-panel td-lobby-attribute-card" style={{
        border: `1px solid ${noirColor(agentDef.color)}35`, borderRadius: 12, overflow: 'hidden',
        background: 'rgba(0,8,24,0.85)', backdropFilter: 'blur(10px)',
        flex: 1, display: 'flex', flexDirection: 'column',
      }}>
        {/* Agent identity header */}
        <div style={{ padding: '7px 12px', borderBottom: `1px solid ${noirColor(agentDef.color)}20`, background: `${noirColor(agentDef.color)}07` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <span style={{ fontSize: 16 }}><Icon name={agentDef.icon} /></span>
            <div>
              <div style={{ fontSize: '0.6rem', color: noirColor(agentDef.color), fontWeight: 900, fontFamily: 'monospace' }}>{agentDef.id}</div>
              <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>{lang === 'zh' ? agentDef.roleZh : agentDef.role}</div>
            </div>
          </div>
          {/* Tab bar */}
          <div style={{ display: 'flex', gap: 4 }}>
            {tabs.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none', cursor: 'pointer',
                fontFamily: 'monospace', fontSize: '0.5rem', fontWeight: 700,
                background: tab === t.key ? noirColor(agentDef.color) + '22' : 'rgba(255,255,255,0.04)',
                color: tab === t.key ? noirColor(agentDef.color) : 'rgba(255,255,255,0.35)',
                borderBottom: `2px solid ${tab === t.key ? noirColor(agentDef.color) : 'transparent'}`,
                transition: 'all 0.2s',
              }}>
                <Icon name={t.icon} /> <IconText text={t.label} />
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="td-scroll-region" tabIndex={0} role="region" aria-label={tabs.find(item => item.key === tab).label} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '12px' }}>
          {tab === 'attrs' && (
            <>
              {/* Radar chart */}
              <div style={{
                display: 'flex', justifyContent: 'center',
                padding: '8px 0 4px', marginBottom: 6,
                borderBottom: `1px solid ${noirColor(agentDef.color)}20`,
              }}>
                <AgentRadarChart
                  agent={agent}
                  agentColor={noirColor(agentDef.color)}
                  allAgents={allAgents}
                  size={150}
                />
              </div>
              <SpecialtyAttrPanel
                agentIdx={agentIdx}
                spec={spec}
                onSpecChange={onSpecChange}
                agentColor={noirColor(agentDef.color)}
                attributeBonus={agentDef.attribute_bonus}
              />
              <div style={{ marginTop: 8, padding: '8px 10px', border: `1px solid ${noirColor(agentDef.color)}25`, borderRadius: 8, background: `${noirColor(agentDef.color)}07` }}>
                <div style={{ fontSize: '0.48rem', color: noirColor(agentDef.color), fontWeight: 700, fontFamily: 'monospace', marginBottom: 4 }}>◎ AGENT TRAIT</div>
                <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.45)', fontFamily: 'monospace', lineHeight: 1.55 }}>{lang === 'zh' ? agentDef.desc : agentDef.descEn}</div>
              </div>
            </>
          )}
          {tab === 'skills' && (
            <SkillTreePanel agentIdx={agentIdx} progression={progression} loadout={skillLoadout} onChange={onSkillLoadout} />
          )}
          {tab === 'dossier' && (
            <AgentDossierPanel
              agentIdx={agentIdx}
              color={noirColor(agentDef.color)}
              icon={agentDef.icon}
              roleZh={agentDef.roleZh}
              lore={getDisplayLore(agentDef, agentIdx, lang)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Status Bar ────────────────────────────────────────────────────────────────
function StatusBar({ onBack, onOpenSettings, profile, readOnly, lighting }) {
  const [time, setTime] = useState(new Date());
  const { lang } = useLang();
  useEffect(() => { const id = setInterval(() => setTime(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="td-lobby-status" style={{
      height: 32, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', borderBottom: '1px solid rgba(112, 159, 154,0.15)',
      background: 'rgba(0,0,0,0.65)', fontFamily: 'monospace', fontSize: '0.5rem', flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{
            padding: '3px 9px', borderRadius: 6, cursor: 'pointer',
            border: '1px solid rgba(112, 159, 154,0.45)', background: 'rgba(112, 159, 154,0.1)',
            color: '#709f9a', fontFamily: 'monospace', fontSize: '0.5rem', letterSpacing: '0.12em',
            whiteSpace: 'nowrap',
          }}>◄ {lang === 'zh' ? '侦探之家' : 'HOME'}</button>
        )}
        <span className="td-lobby-brand">TD<span>//</span>07</span>
        <span className="td-lobby-user">
          <Icon name={profile?.avatar || '🕵️'} /> <strong>{profile?.detective_name || (lang === 'zh' ? '未命名侦探' : 'UNNAMED')}</strong>
          <em>LV.{profile?.level || 1}</em>
        </span>
      </div>
      <div className="td-lobby-status-right" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <span className="td-lobby-light-state" title={lang === 'zh' ? `大厅亮度会随本地时间自动变化 · 当前 ${Math.round(lighting.brightness * 100)}%` : `Lobby lighting follows local time · ${Math.round(lighting.brightness * 100)}%`}>
          <IconText text={lighting.phase === 'day' ? '☀' : lighting.phase === 'dawn' ? '🌤' : lighting.phase === 'evening' ? '🌆' : '🌙'} />
          <b>{lang === 'zh' ? ({ dawn: '清晨', day: '日间', evening: '傍晚', night: '夜间' }[lighting.phase]) : lighting.phase.toUpperCase()}</b>
        </span>
        <span className="td-lobby-wallet-pill td-lobby-wallet-energy"><IconText text={"⚡ "} /><b>{profile?.energy || 0}</b></span>
        <span className="td-lobby-wallet-pill td-lobby-wallet-diamonds"><IconText text={"💎 "} /><b>{(profile?.diamonds || 0).toLocaleString('en-US')}</b></span>
        <span className="td-lobby-wallet-pill td-lobby-wallet-gold"><IconText text={"🪙 "} /><b>{(profile?.gold || 0).toLocaleString('en-US')}</b></span>
        <span className={`td-lobby-link-state ${readOnly ? 'is-readonly' : ''}`}>● {readOnly ? (lang === 'zh' ? '只读' : 'READ ONLY') : (lang === 'zh' ? '云端在线' : 'CLOUD ONLINE')}</span>
        <span style={{ color: '#709f9a', fontWeight: 700 }}>
          {time.toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <button type="button" className="td-lobby-settings-button" onClick={onOpenSettings}
          aria-label={lang === 'zh' ? '打开设置' : 'Open settings'}
          title={lang === 'zh' ? '设置' : 'Settings'} style={{
          padding: '3px 8px', borderRadius: 6, cursor: 'pointer',
          border: '1px solid rgba(112, 159, 154,0.4)', background: 'rgba(112, 159, 154,0.1)', color: '#709f9a',
        }}><span aria-hidden="true"><IconText text={"⚙️"} /></span><span>{lang === 'zh' ? '设置' : 'SETTINGS'}</span></button>
      </div>
    </div>
  );
}

// ── Deploy Controls ───────────────────────────────────────────────────────────
function DeployControls({ onDeploy, onSave, onLoad, onTutorial, tutorialTriggerRef, synergyOver, synergy, onApplyPreset, disabled = false }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [deploying, setDeploying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const prevSynergy = useRef(synergy);
  const toolsToggleRef = useRef(null);
  const setToolsToggleRef = useCallback(node => {
    toolsToggleRef.current = node;
    if (tutorialTriggerRef) tutorialTriggerRef.current = node;
  }, [tutorialTriggerRef]);

  // Flash animation whenever synergy changes
  useEffect(() => {
    if (prevSynergy.current !== synergy) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 350);
      prevSynergy.current = synergy;
      return () => clearTimeout(t);
    }
  }, [synergy]);

  const handleDeploy = async () => {
    if (disabled || deploying) return;
    setDeploying(true);
    try { await onDeploy(); } catch { /* parent displays the sync failure */ } finally { setDeploying(false); }
  };

  const handleSave = async () => {
    if (saving || disabled) return;
    setSaving(true);
    try { await onSave(); } catch { /* parent displays the sync failure */ } finally { setSaving(false); }
  };

  const c = synergyOver ? '#c77c78' : '#709f9a';
  const barPct = Math.min(synergy, 100);

  const btns = [
    { label: saving ? (zh ? '同步中' : 'SYNCING') : (zh ? '保存编队' : 'SAVE SQUAD'), icon: '💾', onClick: async () => { await handleSave(); setToolsOpen(false); }, color: '#709f9a', disabled: saving || disabled },
    { label: zh ? '加载预设' : 'LOAD PRESET', icon: '📂', onClick: () => { onLoad(); setToolsOpen(false); }, color: '#9b9aae' },
    { label: zh ? '大厅教程' : 'HALL GUIDE', icon: '❓', onClick: () => { onTutorial(); setToolsOpen(false); }, color: 'rgba(255,255,255,0.58)' },
  ];

  return (
    <div className="td-lobby-controls" style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px',
      borderTop: `1px solid ${synergyOver ? '#c77c7840' : 'rgba(112, 159, 154,0.15)'}`,
      background: synergyOver ? 'rgba(30,0,8,0.85)' : 'rgba(0,0,0,0.75)',
      flexShrink: 0, transition: 'background 0.4s, border-color 0.4s',
    }}>
      <div className="td-lobby-tools-wrap">
        <button ref={setToolsToggleRef} className="td-lobby-tools-toggle" type="button" aria-label={zh ? '编队工具' : 'Squad tools'} aria-controls="lobby-tools" aria-expanded={toolsOpen} onClick={() => setToolsOpen(value => !value)}>
          <span>☰</span><span>{zh ? '编队工具' : 'SQUAD TOOLS'}</span><small>{toolsOpen ? (zh ? '收起' : 'CLOSE') : (zh ? '预设 / 保存' : 'PRESETS / SAVE')}</small>
        </button>
        {toolsOpen && <div id="lobby-tools" className="td-lobby-tools-popover td-scroll-region" onKeyDown={event => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setToolsOpen(false);
            toolsToggleRef.current?.focus();
          }
        }}>
          <div className="td-lobby-tool-actions">{btns.map((button) => <button key={button.label} type="button" onClick={button.onClick} disabled={button.disabled} style={{ color: noirColor(button.color), borderColor: `${noirColor(button.color)}45`, background: `${noirColor(button.color)}0d` }}><span><Icon name={button.icon} /></span>{button.label}</button>)}</div>
          <PresetChips onApply={preset => { onApplyPreset(preset); setToolsOpen(false); }} />
        </div>}
      </div>

      <div className="td-lobby-synergy-compact" style={/** @type {React.CSSProperties & {'--synergy-color': string}} */ ({ '--synergy-color': c })}>
        <span><IconText text={synergyOver ? (zh ? '⚠ 专长过载' : '⚠ SPECIALTY OVERLOAD') : (zh ? '队伍协同' : 'TEAM SYNERGY')} /></span>
        <strong style={{ transform: flash ? 'scale(1.08)' : 'scale(1)' }}>{synergy}<small>%</small></strong>
        <i><b style={{ width: `${barPct}%` }} /></i>
      </div>

      {/* Main deploy */}
      <button
        onClick={handleDeploy}
        disabled={deploying || disabled}
        title={disabled
          ? (zh ? '当前设备为只读，请先接管此设备' : 'This device is read-only. Take over this session first.')
          : synergyOver
            ? (zh ? '专长过载：三人专长雷同，部署后将承受协同惩罚（混乱增长 +15%）' : 'Specialty overload: overlapping specialties will increase confusion gain by 15%.')
            : ''}
        style={{
          flex: 1, maxWidth: 330, marginLeft: 'auto',
          padding: '11px 24px', borderRadius: 10,
          border: `2px solid ${synergyOver ? '#c77c7870' : deploying ? 'rgba(112, 159, 154,0.3)' : '#709f9aaa'}`,
          background: synergyOver
            ? 'rgba(199, 124, 120,0.12)'
            : deploying
            ? 'rgba(112, 159, 154,0.15)'
            : 'linear-gradient(135deg, rgba(0,80,160,0.7) 0%, rgba(112, 159, 154,0.45) 100%)',
          color: synergyOver ? '#c77c78' : '#fff',
          cursor: disabled ? 'not-allowed' : deploying ? 'wait' : 'pointer',
          fontFamily: 'monospace', fontWeight: 900, fontSize: '0.78rem', letterSpacing: '0.2em',
          textShadow: 'none',
          boxShadow: synergyOver
            ? '0 0 24px rgba(199, 124, 120,0.3)'
            : '0 0 24px rgba(112, 159, 154,0.35), 0 0 50px rgba(112, 159, 154,0.1)',
          transition: 'all 0.3s', position: 'relative', overflow: 'hidden',
          opacity: disabled ? .42 : synergyOver ? 0.85 : 1,
        }}>
        {!synergyOver && (
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(to right, transparent, rgba(112, 159, 154,0.12), transparent)',
            animation: 'none',
          }}/>
        )}
        <span style={{ position: 'relative', zIndex: 1 }}>
          <IconText text={synergyOver
            ? (zh ? '⚠ 专长过载 · 仍可部署' : '⚠ OVERLOAD · DEPLOY ANYWAY')
            : deploying ? (zh ? '⟳ 正在部署…' : '⟳ DEPLOYING...') : (zh ? '▶ 部署探员' : '▶ DEPLOY AGENTS')} />
        </span>
      </button>
      <style>{`
        @keyframes btn-shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
        @keyframes synergy-warn{0%,100%{opacity:1}50%{opacity:0.35}}
      `}</style>
    </div>
  );
}

// ── Main HolographicLobby ─────────────────────────────────────────────────────
export default function HolographicLobby({ profile, readOnly = false, targetCase = null, onDeploy, onBack, onTeamSave, onSkillLoadout, onAgentPurchase }) {
  const { lang } = useLang();
  const { settings } = useSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const noticeTimerRef = useRef(null);
  const {
    agents, agentDefs, coreAgentIds, replaceCoreAgent, specs, selectedIdx, setSelectedIdx, skillLoadout, setSkillLoadout,
    commandPlan, setCommandPlan, updateSpec, updatePriority, applyPreset, currentConfig, loadSaved,
  } = useTeamBuilder(profile);
  const progression = profile?.agent_progression || [];
  const activeSupport = getActiveSupportAgent(profile);
  const supportCount = getOwnedAgents(profile).filter(agent => !agent.core).length;
  const [mobileTab, setMobileTab] = useState('briefing');
  const [coreMarketSlot, setCoreMarketSlot] = useState(null);
  const [corePurchaseBusy, setCorePurchaseBusy] = useState(false);
  const corePurchaseBusyRef = useRef(false);
  const coreMarketTriggerRef = useRef(null);
  const tutorialTriggerRef = useRef(null);
  const [lightingNow, setLightingNow] = useState(() => new Date());
  const lighting = getLobbyLighting(lightingNow);

  useEffect(() => {
    const updateLighting = () => setLightingNow(new Date());
    const timer = window.setInterval(updateLighting, 30 * 60_000);
    window.addEventListener('focus', updateLighting);
    document.addEventListener('visibilitychange', updateLighting);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', updateLighting);
      document.removeEventListener('visibilitychange', updateLighting);
    };
  }, []);

  const accentColor = '#709f9a';

  const showNotice = useCallback((message, duration = 1800, type = 'success') => {
    window.clearTimeout(noticeTimerRef.current);
    setSaveNotice({ message, type });
    noticeTimerRef.current = window.setTimeout(() => setSaveNotice(null), duration);
  }, []);

  useEffect(() => () => window.clearTimeout(noticeTimerRef.current), []);

  const synergy = calcTeamSynergy(specs, agentDefs.map(agent => agent.attribute_bonus));

  // ── 协同技能解锁：检测新激活的技能并播放全屏特效 ──
  const [unlockQueue, setUnlockQueue] = useState([]);
  const prevActiveRef = useRef([]);
  useEffect(() => {
    const ids = synergy.active.map(s => s.id);
    const fresh = synergy.active.filter(s => !prevActiveRef.current.includes(s.id));
    prevActiveRef.current = ids;
    if (fresh.length) setUnlockQueue(q => [...q, ...fresh]);
  }, [synergy.active.map(s => s.id).join(',')]);

  const [hover, setHover] = useState(null); // { idx, x, y }
  const handleHover = useCallback((idx, x, y) => {
    setHover(idx === null || idx === undefined ? null : { idx, x, y });
  }, []);

  const [showSequence, setShowSequence] = useState(false);
  const matchConfig = getCaseMatchConfig(targetCase?.case_id);
  const matchDetails = calcCaseMatchScore(agents, matchConfig, lang);
  const matchForecast = matchDetails.score;
  const caseTitle = targetCase
    ? (lang === 'zh' ? targetCase.title : targetCase.en?.title || targetCase.title)
    : (lang === 'zh' ? '通用编组' : 'GENERAL FORMATION');
  const threats = targetCase ? (lang === 'zh' ? matchConfig.threats : matchConfig.threatsEn) : [];

  const openCoreMarket = useCallback((slot, trigger) => {
    if (readOnly) return;
    coreMarketTriggerRef.current = trigger || document.activeElement;
    setCoreMarketSlot(slot);
  }, [readOnly]);

  const closeCoreMarket = useCallback(() => {
    if (!corePurchaseBusyRef.current) setCoreMarketSlot(null);
  }, []);

  const closeTutorial = useCallback(() => setShowTutorial(false), []);

  const prepareDeploy = async () => {
    const config = currentConfig();
    try {
      await onTeamSave?.(config);
      setShowSequence(true);
    } catch (cause) {
      showNotice(lang === 'zh' ? '⚠ 编队同步失败，请重试' : '⚠ SQUAD SYNC FAILED. PLEASE RETRY.', 2400, 'error');
      throw cause;
    }
  };

  const commitCoreReplacement = async (agent, requiresPurchase) => {
    if (corePurchaseBusyRef.current || readOnly || coreMarketSlot === null) return;
    corePurchaseBusyRef.current = true;
    setCorePurchaseBusy(true);
    const slot = coreMarketSlot;
    let purchasedNow = false;
    let workingProfile = profile;
    try {
      if (requiresPurchase) {
        const purchase = await onAgentPurchase?.(agent.id);
        if (purchase?.error) {
          const message = purchase.error === 'insufficient_funds'
            ? (lang === 'zh' ? '⚠ 钻石不足，无法签约核心探员' : '⚠ NOT ENOUGH DIAMONDS FOR THIS CORE OPERATIVE')
            : purchase.error === 'already_owned'
              ? (lang === 'zh' ? '⚠ 探员已在储备中，请重新选择后替换' : '⚠ THIS OPERATIVE IS ALREADY IN RESERVE. SELECT IT AGAIN.')
              : (lang === 'zh' ? '⚠ 核心签约失败，请重试' : '⚠ CORE RECRUITMENT FAILED. PLEASE RETRY.');
          showNotice(message, 2800, 'error');
          return;
        }
        if (!purchase?.profile) throw new Error('Core purchase did not return a saved profile.');
        workingProfile = purchase.profile;
        purchasedNow = true;
      }

      const planned = prepareCoreAgentReplacement(workingProfile, currentConfig(), slot, agent.id);
      if (planned.error) {
        showNotice(lang === 'zh' ? '⚠ 核心席位校验失败，请重新打开签约界面' : '⚠ CORE SLOT VALIDATION FAILED. REOPEN THE CONTRACT VAULT.', 2800, 'error');
        return;
      }
      await onTeamSave?.(planned.config);
      if (!replaceCoreAgent(slot, agent.id, workingProfile)) {
        throw new Error('Saved core replacement could not be applied locally.');
      }
      setCoreMarketSlot(null);
      showNotice(purchasedNow
        ? (lang === 'zh' ? `✓ ${agent.zh.name} 签约成功，核心席位已同步` : `✓ ${agent.en.name} recruited and synced to the core slot`)
        : (lang === 'zh' ? `✓ ${agent.zh.name} 已替换上阵并保存` : `✓ ${agent.en.name} assigned and saved`), 2600);
    } catch {
      showNotice(purchasedNow
        ? (lang === 'zh' ? '⚠ 签约已完成，但席位保存失败；探员已进入储备，请重试替换' : '⚠ RECRUITMENT SUCCEEDED, BUT SLOT SYNC FAILED. THE OPERATIVE IS SAFE IN RESERVE—RETRY ASSIGNMENT.')
        : (lang === 'zh' ? '⚠ 核心替换未保存，当前阵容保持不变' : '⚠ CORE REPLACEMENT WAS NOT SAVED. THE CURRENT SQUAD IS UNCHANGED.'), 3600, 'error');
    } finally {
      corePurchaseBusyRef.current = false;
      setCorePurchaseBusy(false);
    }
  };

  return (
    <div className={`td-lobby td-lobby-light-${lighting.phase}`} style={/** @type {React.CSSProperties & Record<string, string | number>} */ ({
      height: '100dvh', display: 'flex', flexDirection: 'column',
      background: 'radial-gradient(ellipse at 30% 15%, #08121c 0%, #08121c 55%, #08121c 100%)',
      fontFamily: "'Courier New', monospace", color: 'white',
      overflow: 'hidden', position: 'relative',
      '--td-lobby-day-glow': lighting.dayGlow,
      '--td-lobby-night-veil': lighting.nightVeil,
    })}>
      <LobbyAtmosphere />
      <div className="td-lobby-time-light" aria-hidden="true" />
      {/* Scanlines */}
      {settings.scanlines && (
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 4px)',
        }}/>
      )}

      {/* Corner brackets */}
      {[
        { top: 0, left: 0, borderTop: '2px solid #709f9a40', borderLeft: '2px solid #709f9a40' },
        { top: 0, right: 0, borderTop: '2px solid #9b9aae40', borderRight: '2px solid #9b9aae40' },
        { bottom: 54, left: 0, borderBottom: '2px solid #709f9a40', borderLeft: '2px solid #709f9a40' },
        { bottom: 54, right: 0, borderBottom: '2px solid #9b9aae40', borderRight: '2px solid #9b9aae40' },
      ].map((s, i) => (
        <div key={i} style={{ position: 'absolute', width: 36, height: 36, pointerEvents: 'none', zIndex: 10, ...s }}/>
      ))}

      <StatusBar profile={profile} readOnly={readOnly} lighting={lighting} onBack={onBack} onOpenSettings={() => setShowSettings(true)} />

      {showSettings && <SettingsDrawer onClose={() => setShowSettings(false)} />}

      {showTutorial && <LobbyGuideModal targetCase={targetCase} onClose={closeTutorial} restoreRef={tutorialTriggerRef} />}

      {saveNotice && <div role="status" aria-live="polite" className={`td-lobby-notice is-${saveNotice.type}`}>
        <span>{saveNotice.type === 'error' ? '!' : '✓'}</span>
        <strong><IconText text={saveNotice.message.replace(/^[✓⚠]\s*/, '')} /></strong>
      </div>}

      {/* 协同技能解锁特效 */}
      <SynergyUnlockFX
        skill={unlockQueue[0] || null}
        onDone={() => setUnlockQueue(q => q.slice(1))}
      />

      {/* Title */}
      <div className="td-lobby-title" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 20px', borderBottom: '1px solid rgba(112, 159, 154,0.1)',
        background: 'rgba(0,0,0,0.35)', flexShrink: 0, zIndex: 1,
      }}>
      <div className="td-lobby-title-copy">
          <span className="td-lobby-eyebrow">{targetCase ? (lang === 'zh' ? '◆ 目标案件战术简报' : '◆ TARGET-CASE BRIEFING') : (lang === 'zh' ? '◇ 全息指挥中心' : '◇ HOLOGRAPHIC COMMAND')}</span>
          <span className="td-lobby-heading" style={{ fontSize: '1.05rem', fontWeight: 900, color: '#709f9a', textShadow: 'none', fontFamily: 'monospace', letterSpacing: '0.06em' }}>{caseTitle}</span>
          <small><IconText text={targetCase
            ? `${targetCase.difficulty} · ⚡ ${CASE_ENERGY_COST[targetCase.difficulty] || 10} · ${threats.join(' / ')} · ${matchDetails.advice}`
            : activeSupport
              ? (lang === 'zh' ? `支援 ${activeSupport.icon} ${activeSupport.id} 已接入 · 部署后进入案件簿` : `SUPPORT ${activeSupport.icon} ${activeSupport.id} ONLINE · DEPLOY TO CASE ARCHIVE`)
              : (lang === 'zh' ? '配置通用编组，部署后进入案件簿' : 'CONFIGURE A GENERAL SQUAD, THEN OPEN THE CASE ARCHIVE')} /></small>
        </div>
        <div className="td-lobby-readiness">
          <div title={matchDetails.advice}><small>{targetCase ? 'CASE MATCH' : 'READINESS'}</small><strong style={{ color: noirColor(matchDetails.color) }}>{matchForecast}<em>%</em></strong></div>
          <i />
          <div className="td-lobby-primary"><small>PRIMARY AGENT</small><strong style={{ color: noirColor(agentDefs[selectedIdx].color) }}><Icon name={agentDefs[selectedIdx].icon} /> {agentDefs[selectedIdx].id}</strong></div>
        </div>
      </div>

      <ScreenTabs id="lobby" className="td-lobby-mobile-tabs" label={lang === 'zh' ? '大厅栏目' : 'Hall sections'}
        tabs={[
          { key: 'briefing', label: lang === 'zh' ? '简报' : 'BRIEF' },
          { key: 'formation', label: lang === 'zh' ? '编组' : 'SQUAD' },
          { key: 'agent', label: lang === 'zh' ? '探员' : 'AGENT' },
          { key: 'command', label: lang === 'zh' ? '指挥' : 'COMMAND' },
        ]} value={mobileTab} onChange={setMobileTab} />

      {/* Main */}
      <div className="td-lobby-main" style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative', zIndex: 1 }}>
        <TeamRosterPanel
          agents={agents} agentDefs={agentDefs} selectedIdx={selectedIdx}
          onSelect={setSelectedIdx} progression={progression}
          onPriorityChange={updatePriority}
          onHover={handleHover}
          onOpenCoreMarket={openCoreMarket}
          mobileActive={mobileTab === 'formation'}
        />
        <HoloStage
          agents={agents} agentDefs={agentDefs} selectedIdx={selectedIdx}
          onSelect={setSelectedIdx} accentColor={accentColor}
          progression={progression}
          synergy={synergy}
          onHover={handleHover}
          mobileActive={mobileTab === 'briefing'}
          targetCase={targetCase}
          activeSupport={activeSupport}
          supportCount={supportCount}
          commanderName={profile?.detective_name}
        />
        <AttributePanel
          agent={agents[selectedIdx]}
          agentDef={agentDefs[selectedIdx]}
          agentIdx={selectedIdx}
          spec={specs[selectedIdx]}
          onSpecChange={updateSpec}
          allAgents={agents}
          progression={progression}
          skillLoadout={skillLoadout}
          onSkillLoadout={async next => {
            if (readOnly) return;
            try {
              const result = await onSkillLoadout?.(next);
              setSkillLoadout(result.profile.skill_loadout || []);
            } catch {
              showNotice(lang === 'zh' ? '⚠ 技能配置尚未确认，请重试' : '⚠ SKILL LOADOUT NOT CONFIRMED. PLEASE RETRY.', 2400, 'error');
            }
          }}
          mobileActive={mobileTab === 'agent'}
        />
        <CommandPlanPanel
          className="td-command-plan-mobile td-scroll-region"
          id="lobby-panel-command" labelledBy="lobby-tab-command"
          value={commandPlan}
          onChange={setCommandPlan}
          targetCase={targetCase}
          mobileActive={mobileTab === 'command'}
        />
      </div>

      <CommandPlanPanel
        className="td-command-plan-desktop"
        value={commandPlan}
        onChange={setCommandPlan}
        targetCase={targetCase}
      />

      {/* 探员档案悬浮预览 */}
      {hover && (
        <AgentLoreTooltip
          lore={getDisplayLore(agentDefs[hover.idx], hover.idx, lang)}
          color={noirColor(agentDefs[hover.idx].color)}
          icon={agentDefs[hover.idx].icon}
          roleZh={lang === 'zh' ? agentDefs[hover.idx].roleZh : agentDefs[hover.idx].role}
          x={hover.x} y={hover.y}
        />
      )}

      {coreMarketSlot !== null && (
        <CoreAgentMarket
          profile={profile}
          slot={coreMarketSlot}
          currentId={coreAgentIds[coreMarketSlot]}
          busy={corePurchaseBusy}
          onClose={closeCoreMarket}
          restoreRef={coreMarketTriggerRef}
          onConfirm={commitCoreReplacement}
        />
      )}

      {/* 部署过场动画 */}
      {showSequence && (
        <DeploySequence
          matchScore={matchForecast}
          caseBrief={targetCase ? {
            title: caseTitle,
            threat: targetCase.difficulty,
            doctrine: commandPlan.doctrine_id,
          } : null}
          onComplete={async () => {
            try {
              const result = await onDeploy(buildTeamConfig(currentConfig(), selectedIdx, skillLoadout, activeSupport?.id, targetCase?.case_id), currentConfig());
              if (result?.error) {
                setShowSequence(false);
                const message = result.error === 'insufficient_energy'
                  ? (lang === 'zh' ? `体力不足，需要 ${result.cost} 点体力` : `Not enough energy. ${result.cost} required.`)
                  : (lang === 'zh' ? '案件启动失败，请重试' : 'Unable to start case. Please retry.');
                showNotice(`⚠ ${message}`, 2800, 'error');
              }
            } catch {
              setShowSequence(false);
              showNotice(lang === 'zh' ? '⚠ 案件启动失败，请检查网络' : '⚠ CASE START FAILED. CHECK YOUR CONNECTION.', 2800, 'error');
            }
          }}
        />
      )}

      <DeployControls
        onApplyPreset={applyPreset}
        onDeploy={prepareDeploy}
        onSave={async () => {
          const config = currentConfig();
          try {
            await onTeamSave?.(config);
            showNotice(lang === 'zh' ? '✓ 编队预设已保存' : '✓ SQUAD PRESET SAVED');
          } catch (cause) {
            showNotice(lang === 'zh' ? '⚠ 编队同步失败，请重试' : '⚠ SQUAD SYNC FAILED. PLEASE RETRY.', 2400, 'error');
            throw cause;
          }
        }}
        onLoad={loadSaved}
        synergy={Math.round(synergy.matchScore * 100)}
        synergyOver={synergy.overload}
        onTutorial={() => setShowTutorial(true)}
        tutorialTriggerRef={tutorialTriggerRef}
        disabled={readOnly}
      />
    </div>
  );
}
