import Icon, { IconText } from '@/components/ui/Icon';
import React, { useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion';
import { useSettings } from '@/lib/settings.jsx';

// 推理突破高潮特效 — 全息闪光 + WebAudio 音效
function playBreakthroughChord() {
  try {
    const ctx = new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.07);
      gain.gain.linearRampToValueAtTime(0.12, now + i * 0.07 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.07);
      osc.stop(now + i * 0.07 + 1.5);
    });
    const timer = setTimeout(() => { void ctx.close().catch(() => {}); }, 2500);
    return () => { clearTimeout(timer); if (ctx.state !== 'closed') void ctx.close().catch(() => {}); };
  } catch {}
}

export default function InsightFlashFX({ event, onDone }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const doneRef = useRef(false);
  const callbackRef = useRef(onDone);
  callbackRef.current = onDone;
  const { motionEnabled, foreground } = usePresentationMotion();
  const { settings } = useSettings();
  const playedEvent = useRef(null);

  useEffect(() => {
    if (!event || !foreground || !settings.sfxEnabled || playedEvent.current === event) return;
    playedEvent.current = event;
    return playBreakthroughChord();
  }, [event, foreground, settings.sfxEnabled]);

  useEffect(() => {
    if (!event) return;
    doneRef.current = false;
    const t = setTimeout(() => {
      if (!doneRef.current) { doneRef.current = true; callbackRef.current?.(); }
    }, 4200);
    return () => clearTimeout(t);
  }, [event]);

  if (!event) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 70, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace',
    }}>
      {/* Holo flash layers */}
      {motionEnabled && <div style={{ position: 'absolute', inset: 0, background: '#709f9a', animation: 'if-flash 0.5s ease-out both' }} />}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(circle at 50% 50%, rgba(112, 159, 154,0.25) 0%, transparent 60%)',
        animation: motionEnabled ? 'if-glow 4s ease-out both' : 'none', opacity: .12,
      }} />
      {/* Scan sweep */}
      <div style={{
        position: 'absolute', left: 0, right: 0, height: 3,
        background: 'linear-gradient(to right, transparent, #709f9a, transparent)',
        boxShadow: '0 0 30px #709f9a',
        display: 'none',
      }} />

      {/* Card */}
      <div style={{
        position: 'relative', width: 560, maxWidth: '90vw',
        border: '1px solid #709f9aaa', borderRadius: 14,
        background: 'rgba(2,10,24,0.95)',
        boxShadow: '0 24px 60px #0006',
        padding: '24px 26px', textAlign: 'center',
        animation: motionEnabled ? 'if-card 0.5s 0.25s cubic-bezier(.22,1,.36,1) both' : 'none',
      }}>
        <div style={{
          fontSize: '1.4rem', fontWeight: 900, color: '#709f9a',
          letterSpacing: '0.12em',
          animation: 'none',
        }}><IconText text={" ⚡ "} />{zh ? '推理突破！' : 'DEDUCTION BREAKTHROUGH!'}
        </div>
        <div style={{ fontSize: '0.5rem', color: 'rgba(112, 159, 154,0.5)', letterSpacing: '0.3em', marginTop: 4, marginBottom: 14 }}>
          {zh ? '关键逻辑链已确认' : 'KEY LOGIC CHAIN CONFIRMED'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 }}>
          <ClueChip icon={event.iconA} label={event.keywordA} />
          <div style={{ color: '#709f9a', fontSize: '1.1rem', animation: 'none' }}>⟺</div>
          <ClueChip icon={event.iconB} label={event.keywordB} />
        </div>
        <div style={{
          color: '#e6dfcf', fontSize: '0.68rem', lineHeight: 1.8,
          padding: '12px 14px', borderRadius: 10,
          border: '1px solid rgba(112, 159, 154,0.25)', background: 'rgba(112, 159, 154,0.05)',
        }}>
          {event.reveal}
        </div>
        {event.synergy && (
          <div style={{ marginTop: 10, fontSize: '0.5rem', color: '#8aaa91' }}>
            <IconText text={zh ? '🔗 协同技能「交叉验证」已生效 — 推理难度降低' : '🔗 CROSS VALIDATION ACTIVE — DEDUCTION DIFFICULTY REDUCED'} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes if-flash { 0%{opacity:0.06} 100%{opacity:0} }
        @keyframes if-glow { 0%{opacity:1} 100%{opacity:0} }
        @keyframes if-sweep { 0%{top:0;opacity:1} 100%{top:100%;opacity:0} }
        @keyframes if-card { from{opacity:0;transform:scale(0.8)} to{opacity:1;transform:scale(1)} }
        @keyframes if-title { from{text-shadow:0 0 16px #709f9a} to{text-shadow:0 0 40px #709f9a,0 0 80px #709f9a60} }
        @keyframes if-link { from{transform:scale(1)} to{transform:scale(1.3)} }
      `}</style>
    </div>
  );
}

function ClueChip({ icon, label }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      border: '1px solid rgba(112, 159, 154,0.4)', borderRadius: 8,
      padding: '6px 12px', background: 'rgba(112, 159, 154,0.08)',
      color: '#709f9a', fontSize: '0.6rem', fontWeight: 700,
    }}>
      <span><Icon name={icon} /></span>{label}
    </div>
  );
}
