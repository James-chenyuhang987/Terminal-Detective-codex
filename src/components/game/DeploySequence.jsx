import React, { useEffect, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

// 部署过场动画 — 三段式：探员召唤 → 任务简报 → 出发倒计时
const AGENTS = [
  { id: 'NEXUS-01', roleZh: '首席调查员', roleEn: 'Lead Investigator', color: '#00e5ff', icon: '👁️' },
  { id: 'AURORA-09', roleZh: '法证分析师', roleEn: 'Forensic Analyst', color: '#a78bfa', icon: '🔬' },
  { id: 'CIPHER-47', roleZh: '技术专家', roleEn: 'Tech Specialist', color: '#ff6b35', icon: '💻' },
];

function HoloBody({ color, index }) {
  const { lang } = useLang();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      animation: `ds-fly-in 0.75s ${index * 0.32}s cubic-bezier(.2,.9,.25,1) both`,
    }}>
      <div style={{ width: 90, height: 150, filter: `drop-shadow(0 0 22px ${color})` }}>
        <svg viewBox="0 0 64 110" width="100%" height="100%">
          <defs>
            <linearGradient id={`ds-g${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={color} stopOpacity="0.08" />
            </linearGradient>
          </defs>
          <ellipse cx="32" cy="12" rx="9" ry="10" fill={`url(#ds-g${index})`} opacity="0.9" />
          <path d="M18 24 L46 24 L52 70 L42 70 L40 90 L24 90 L22 70 L12 70Z" fill={`url(#ds-g${index})`} opacity="0.8" />
          <path d="M18 28 L6 55 L10 57 L20 34" fill={`url(#ds-g${index})`} opacity="0.6" />
          <path d="M46 28 L58 55 L54 57 L44 34" fill={`url(#ds-g${index})`} opacity="0.6" />
          <path d="M22 90 L18 108 L26 108 L30 90" fill={`url(#ds-g${index})`} opacity="0.65" />
          <path d="M42 90 L46 108 L38 108 L34 90" fill={`url(#ds-g${index})`} opacity="0.65" />
          {[18, 32, 46, 60, 74, 88].map((y, i) => (
            <line key={i} x1="6" y1={y} x2="58" y2={y} stroke={color} strokeWidth="0.5" opacity="0.2" />
          ))}
        </svg>
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'monospace', marginTop: 4 }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 900, color, textShadow: `0 0 12px ${color}` }}>{AGENTS[index].icon} {AGENTS[index].id}</div>
        <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>{lang === 'zh' ? AGENTS[index].roleZh : AGENTS[index].roleEn}</div>
      </div>
      {/* 平台光环 */}
      <div style={{
        marginTop: 6, width: 110, height: 14, borderRadius: '50%',
        border: `1px solid ${color}90`,
        background: `radial-gradient(ellipse, ${color}45, transparent 70%)`,
        boxShadow: `0 0 20px ${color}70`,
      }} />
    </div>
  );
}

function DataParticles() {
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {Array.from({ length: 26 }).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: `${(i * 3.9) % 100}%`,
          width: 1.5, height: 40 + (i % 5) * 18,
          background: 'linear-gradient(to bottom, transparent, #00e5ff)',
          animation: `ds-rain ${1.4 + (i % 6) * 0.25}s ${(i % 9) * 0.13}s linear infinite`,
          opacity: 0.35,
        }} />
      ))}
    </div>
  );
}

export default function DeploySequence({ matchScore = 0, onComplete }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [phase, setPhase] = useState(1); // 1 召唤 · 2 简报 · 3 倒计时
  const [count, setCount] = useState(3);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 1600);
    const t2 = setTimeout(() => setPhase(3), 3100);
    const t3 = setTimeout(() => onComplete(), 4400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  useEffect(() => {
    if (phase !== 3) return;
    const id = setInterval(() => setCount(c => Math.max(1, c - 1)), 380);
    return () => clearInterval(id);
  }, [phase]);

  const brief = [
    { label: zh ? '案件' : 'CASE', value: zh ? '霓虹血迹' : 'NEON BLOOD', color: '#ff6b35' },
    { label: zh ? '威胁等级' : 'THREAT', value: 'HIGH', color: '#ff3860' },
    { label: zh ? '预测成功率' : 'FORECAST', value: `${matchScore}%`, color: matchScore < 50 ? '#ff3860' : matchScore <= 75 ? '#ffaa00' : '#00ff88' },
    { label: zh ? '编组' : 'SQUAD', value: 'NEXUS-01 + AURORA-09 + CIPHER-47', color: '#00e5ff' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'radial-gradient(ellipse at 50% 45%, #04121f 0%, #010509 70%, #000 100%)',
      fontFamily: "'Courier New', monospace", color: 'white',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* CRT 扫描线 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 4px)',
      }} />
      <DataParticles />

      {/* SKIP */}
      <button onClick={onComplete} style={{
        position: 'absolute', top: 18, right: 20, zIndex: 20,
        padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
        border: '1px solid rgba(0,229,255,0.45)', background: 'rgba(0,229,255,0.08)',
        color: '#00e5ff', fontFamily: 'monospace', fontSize: '0.55rem', letterSpacing: '0.14em',
      }}>{zh ? '跳过' : 'SKIP'} ▶</button>

      {/* Phase 1 — 探员召唤 */}
      {phase === 1 && (
        <div style={{ animation: 'ds-fade 0.3s ease both', zIndex: 6 }}>
          <div style={{
            textAlign: 'center', fontSize: '0.6rem', letterSpacing: '0.4em',
            color: 'rgba(0,229,255,0.6)', marginBottom: 28,
          }}>{zh ? '正在召唤探员' : 'SUMMONING AGENTS'}</div>
          <div style={{ display: 'flex', gap: 46, alignItems: 'flex-end' }}>
            {AGENTS.map((a, i) => <HoloBody key={a.id} color={a.color} index={i} />)}
          </div>
        </div>
      )}

      {/* Phase 2 — 任务简报 */}
      {phase === 2 && (
        <div style={{
          zIndex: 6, width: 520, maxWidth: '90vw',
          border: '1px solid rgba(0,229,255,0.4)', borderRadius: 14,
          background: 'rgba(2,10,22,0.9)', padding: '20px 24px',
          boxShadow: '0 0 50px rgba(0,229,255,0.2)',
          animation: 'ds-brief 0.4s ease both',
        }}>
          <div style={{ fontSize: '0.55rem', letterSpacing: '0.3em', color: 'rgba(0,229,255,0.65)', marginBottom: 16 }}>
            {zh ? '任务简报' : 'MISSION BRIEFING'}
          </div>
          {brief.map((b, i) => (
            <div key={b.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
              animation: `ds-row 0.32s ${i * 0.16}s ease both`,
            }}>
              <span style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>{b.label}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 900, color: b.color, textShadow: `0 0 12px ${b.color}70` }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Phase 3 — 倒计时 */}
      {phase === 3 && (
        <div style={{ zIndex: 6, textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: 'rgba(0,229,255,0.6)', marginBottom: 14 }}>
            {zh ? '即将部署' : 'DEPLOYING IN'}
          </div>
          <div key={count} style={{
            fontSize: '6rem', fontWeight: 900, lineHeight: 1, color: '#00e5ff',
            textShadow: '0 0 40px #00e5ff', animation: 'ds-count 0.36s ease both',
          }}>{count}</div>
        </div>
      )}

      {/* 黑幕压入 */}
      <div style={{
        position: 'absolute', inset: 0, background: '#000', zIndex: 10,
        pointerEvents: 'none', opacity: 0,
        animation: 'ds-blackout 0.5s 3.95s ease-in both',
      }} />

      <style>{`
        @keyframes ds-fly-in { from{opacity:0;transform:translateX(-52vw) scale(0.8)} to{opacity:1;transform:none} }
        @keyframes ds-fade { from{opacity:0} to{opacity:1} }
        @keyframes ds-brief { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:none} }
        @keyframes ds-row { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:none} }
        @keyframes ds-count { from{opacity:0;transform:scale(1.7)} to{opacity:1;transform:scale(1)} }
        @keyframes ds-rain { from{transform:translateY(-120px)} to{transform:translateY(105vh)} }
        @keyframes ds-blackout { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}
