import Icon, { IconText } from '@/components/ui/Icon';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import SlicedTitle from '@/components/ui/SlicedTitle';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import { useSettings } from '@/lib/settings.jsx';

// 部署过场动画 — 三段式：探员召唤 → 任务简报 → 出发倒计时
const AGENTS = [
  { id: 'NEXUS-01', roleZh: '首席调查员', roleEn: 'Lead Investigator', color: '#709f9a', icon: '👁️' },
  { id: 'AURORA-09', roleZh: '法证分析师', roleEn: 'Forensic Analyst', color: '#9b9aae', icon: '🔬' },
  { id: 'CIPHER-47', roleZh: '技术专家', roleEn: 'Tech Specialist', color: '#c19a63', icon: '💻' },
];

function HoloBody({ color, index }) {
  const { lang } = useLang();
  const { motionEnabled } = usePresentationMotion();
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 0, flex: '1 1 0',
      animation: motionEnabled ? `ds-fly-in 0.75s ${index * 0.32}s cubic-bezier(.2,.9,.25,1) both` : 'none',
    }}>
      <div style={{ width: 'min(90px, 23vw)', height: 150 }}>
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
        <div style={{ fontSize: '0.7rem', fontWeight: 900, color, textShadow: 'none' }}><Icon name={AGENTS[index].icon} /> {AGENTS[index].id}</div>
        <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.4)' }}>{lang === 'zh' ? AGENTS[index].roleZh : AGENTS[index].roleEn}</div>
      </div>
      {/* 平台光环 */}
      <div style={{
        marginTop: 6, width: 'min(110px, 25vw)', height: 14, borderRadius: '50%',
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
          background: 'linear-gradient(to bottom, transparent, #709f9a)',
          animation: `ds-rain ${1.4 + (i % 6) * 0.25}s ${(i % 9) * 0.13}s linear infinite`,
          opacity: 0.35,
        }} />
      ))}
    </div>
  );
}

export default function DeploySequence({ matchScore = 0, caseBrief = null, onComplete }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const { reducedMotion, motionEnabled } = usePresentationMotion();
  const { settings } = useSettings();
  const [phase, setPhase] = useState(1); // 1 召唤 · 2 简报 · 3 倒计时
  const [count, setCount] = useState(3);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const complete = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    void onCompleteRef.current?.();
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      setPhase(2);
      const timer = setTimeout(complete, 1200);
      return () => clearTimeout(timer);
    }
    const t1 = setTimeout(() => setPhase(2), 1600);
    const t2 = setTimeout(() => setPhase(3), 3100);
    const t3 = setTimeout(complete, 4400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [complete, reducedMotion]);

  useEffect(() => {
    if (phase !== 3) return;
    const id = setInterval(() => setCount(c => Math.max(1, c - 1)), 380);
    return () => clearInterval(id);
  }, [phase]);

  const doctrineNames = {
    evidence_control: zh ? '精准取证' : 'EVIDENCE CONTROL',
    rapid_pursuit: zh ? '快速追击' : 'RAPID PURSUIT',
    steady_control: zh ? '稳态控制' : 'STEADY CONTROL',
  };
  const brief = [
    { label: zh ? '案件' : 'CASE', value: caseBrief?.title || (zh ? '部署后选择' : 'SELECT AFTER DEPLOYMENT'), color: '#c19a63' },
    { label: zh ? '威胁等级' : 'THREAT', value: caseBrief?.threat || (zh ? '待定' : 'PENDING'), color: '#c77c78' },
    { label: zh ? '预测成功率' : 'FORECAST', value: `${matchScore}%`, color: matchScore < 50 ? '#c77c78' : matchScore <= 75 ? '#c19a63' : '#8aaa91' },
    { label: zh ? '指挥学说' : 'DOCTRINE', value: doctrineNames[caseBrief?.doctrine] || (zh ? '通用方案' : 'GENERAL PLAN'), color: '#c5a66f' },
    { label: zh ? '编组' : 'SQUAD', value: 'NEXUS-01 + AURORA-09 + CIPHER-47', color: '#709f9a' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'radial-gradient(ellipse at 50% 45%, #101e2a 0%, #08121c 70%, #000 100%)',
      fontFamily: "'Courier New', monospace", color: 'white',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden',
    }}>
      {/* CRT 扫描线 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.16) 2px, rgba(0,0,0,0.16) 4px)',
      }} />
      {motionEnabled && settings.particles && <DataParticles />}

      {/* SKIP */}
      <button onClick={complete} style={{
        position: 'absolute', top: 18, right: 20, zIndex: 20,
        padding: '10px 14px', minHeight: 44, borderRadius: 8, cursor: 'pointer',
        border: '1px solid rgba(112, 159, 154,0.45)', background: 'rgba(112, 159, 154,0.08)',
        color: '#709f9a', fontFamily: 'monospace', fontSize: '0.55rem', letterSpacing: '0.14em',
      }}>{zh ? '跳过' : 'SKIP'}<IconText text={" ▶"} /></button>

      {/* Phase 1 — 探员召唤 */}
      {phase === 1 && (
        <div style={{ animation: motionEnabled ? 'ds-fade 0.3s ease both' : 'none', zIndex: 6 }}>
          <div style={{
            textAlign: 'center', fontSize: '0.6rem', letterSpacing: '0.4em',
            color: 'rgba(112, 159, 154,0.6)', marginBottom: 28,
          }}>{zh ? '正在召唤探员' : 'SUMMONING AGENTS'}</div>
          <div style={{ display: 'flex', gap: 'clamp(4px, 4vw, 46px)', alignItems: 'flex-end', maxWidth: '94vw' }}>
            {AGENTS.map((a, i) => <HoloBody key={a.id} color={a.color} index={i} />)}
          </div>
        </div>
      )}

      {/* Phase 2 — 任务简报 */}
      {phase === 2 && (
        <div style={{
          zIndex: 6, width: 520, maxWidth: '90vw',
          border: '1px solid rgba(112, 159, 154,0.4)', borderRadius: 14,
          background: 'rgba(2,10,22,0.9)', padding: '20px 24px',
          boxShadow: '0 20px 60px #0006',
          animation: motionEnabled ? 'ds-brief 0.4s ease both' : 'none',
        }}>
          <SlicedTitle style={{ fontSize: '1.25rem', color: '#e1d0ac', margin: '0 0 16px' }}>
            {zh ? '任务简报' : 'MISSION BRIEFING'}
          </SlicedTitle>
          {brief.map((b, i) => (
            <div key={b.label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 14,
              padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.06)',
              animation: motionEnabled ? `ds-row 0.32s ${i * 0.16}s ease both` : 'none',
            }}>
              <span style={{ fontSize: '0.6rem', color: '#9caaa9', letterSpacing: '0.05em', flexShrink: 0 }}>{b.label}</span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, color: b.color, minWidth: 0, overflowWrap: 'anywhere', textAlign: 'right' }}>{b.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Phase 3 — 倒计时 */}
      {phase === 3 && (
        <div style={{ zIndex: 6, textAlign: 'center' }}>
          <div style={{ fontSize: '0.62rem', letterSpacing: '0.4em', color: 'rgba(112, 159, 154,0.6)', marginBottom: 14 }}>
            {zh ? '即将部署' : 'DEPLOYING IN'}
          </div>
          <div key={count} style={{
            fontSize: '6rem', fontWeight: 900, lineHeight: 1, color: '#709f9a',
            animation: motionEnabled ? 'ds-count 0.36s ease both' : 'none',
          }}>{count}</div>
        </div>
      )}

      {/* 黑幕压入 */}
      <div style={{
        position: 'absolute', inset: 0, background: '#000', zIndex: 10,
        pointerEvents: 'none', opacity: 0,
        animation: motionEnabled ? 'ds-blackout 0.5s 3.95s ease-in both' : 'none',
      }} />

      <style>{`
        @keyframes ds-fly-in { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes ds-fade { from{opacity:0} to{opacity:1} }
        @keyframes ds-brief { from{opacity:0;transform:scale(0.94)} to{opacity:1;transform:none} }
        @keyframes ds-row { from{opacity:0;transform:translateX(-10px)} to{opacity:1;transform:none} }
        @keyframes ds-count { from{opacity:.5;transform:translateY(8px)} to{opacity:1;transform:none} }
        @keyframes ds-rain { from{transform:translateY(-120px)} to{transform:translateY(105vh)} }
        @keyframes ds-blackout { from{opacity:0} to{opacity:1} }
      `}</style>
    </div>
  );
}
