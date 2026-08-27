import React, { useEffect, useRef, useState } from 'react';
import { SYNERGY_SKILLS } from '@/game/specialtySystem';
import { useLang } from '@/lib/lang.jsx';

// 组队协同技能面板 — 发光卡片，触发时点亮 + 粒子爆发
function ParticleBurst({ color }) {
  const particles = Array.from({ length: 10 }, (_, i) => ({
    angle: (i / 10) * Math.PI * 2,
    dist: 26 + Math.random() * 20,
    delay: Math.random() * 0.1,
  }));
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}>
      {particles.map((p, i) => (
        <div key={i} style={/** @type {any} */ ({
          position: 'absolute', left: '50%', top: '50%',
          width: 4, height: 4, borderRadius: '50%',
          background: color, boxShadow: `0 0 8px ${color}`,
          '--tx': `${Math.cos(p.angle) * p.dist}px`,
          '--ty': `${Math.sin(p.angle) * p.dist}px`,
          animation: `syn-burst 0.7s ${p.delay}s ease-out both`,
        })} />
      ))}
      <style>{`
        @keyframes syn-burst {
          0% { transform: translate(-50%,-50%); opacity: 1; }
          100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

function SynergyCard({ skill, isActive }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [justActivated, setJustActivated] = useState(false);
  const prevActive = useRef(isActive);

  useEffect(() => {
    if (isActive && !prevActive.current) {
      setJustActivated(true);
      const t = setTimeout(() => setJustActivated(false), 900);
      return () => clearTimeout(t);
    }
    prevActive.current = isActive;
  }, [isActive]);

  const c = skill.color;
  return (
    <div style={{
      position: 'relative', width: 168, borderRadius: 10, padding: '9px 11px',
      border: `1px solid ${isActive ? c : 'rgba(255,255,255,0.1)'}`,
      background: isActive ? `${c}12` : 'rgba(255,255,255,0.02)',
      opacity: isActive ? 1 : 0.55,
      boxShadow: isActive ? `0 0 18px ${c}35, inset 0 0 14px ${c}0a` : 'none',
      transition: 'all 0.4s ease',
      fontFamily: 'monospace',
      transform: justActivated ? 'scale(1.06)' : 'scale(1)',
    }}>
      {justActivated && <ParticleBurst color={c} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: 15, filter: isActive ? `drop-shadow(0 0 6px ${c})` : 'grayscale(1)' }}>{skill.icon}</span>
        <span style={{ fontSize: '0.58rem', fontWeight: 900, color: isActive ? c : 'rgba(255,255,255,0.4)' }}>
          {zh ? skill.name : skill.nameEn}
        </span>
        <span style={{
          marginLeft: 'auto', fontSize: '0.38rem', fontWeight: 700,
          color: isActive ? '#00ff88' : 'rgba(255,255,255,0.25)',
          border: `1px solid ${isActive ? '#00ff8850' : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 3, padding: '0 4px',
        }}>{isActive ? (zh ? '已激活' : 'ACTIVE') : (zh ? '未触发' : 'INACTIVE')}</span>
      </div>
      <div style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.55 }}>{zh ? skill.desc : skill.descEn}</div>
      <div style={{ fontSize: '0.38rem', color: isActive ? c + 'aa' : 'rgba(255,255,255,0.22)', marginTop: 4 }}>
        {zh ? '条件：' : 'REQUIRES: '}{zh ? skill.condition : skill.conditionEn}
      </div>
    </div>
  );
}

export default function SynergyPanel({ synergy }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'monospace' }}>
        <span style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em' }}>
          ◈ {zh ? '组队协同效果' : 'TEAM SYNERGY'}
        </span>
        <span style={{ fontSize: '0.44rem', color: synergy.matchScore >= 0.66 ? '#00ff88' : '#ffaa00' }}>
          {zh ? '专长匹配度' : 'SPECIALTY MATCH'} {Math.round(synergy.matchScore * 100)}%
          {synergy.matchScore >= 0.66 && (zh ? ' · 危机惩罚 -20%' : ' · CRISIS PENALTY -20%')}
        </span>
        {synergy.overload && (
          <span style={{
            fontSize: '0.42rem', color: '#ff3860', fontFamily: 'monospace',
            border: '1px solid #ff386060', borderRadius: 4, padding: '1px 6px',
            background: '#ff386015', animation: 'syn-warn 0.9s ease-in-out infinite',
          }}>
            {zh ? '⚠ 专长过载 — 三人专长雷同，混乱增长 +15%' : '⚠ SPECIALTY OVERLOAD — CONFUSION GAIN +15%'}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {SYNERGY_SKILLS.map(skill => (
          <SynergyCard key={skill.id} skill={skill} isActive={synergy.active.some(s => s.id === skill.id)} />
        ))}
      </div>
      <style>{`@keyframes syn-warn { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  );
}
