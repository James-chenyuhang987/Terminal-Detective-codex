import React, { useState, useEffect, useRef } from 'react';
import { useLang } from '@/lib/lang.jsx';
import FusionForgeFX from '@/components/game/FusionForgeFX';

// 推理重演过场：图标飞入碰撞 → 闪光 → 打字机真相碎片 → 进度条计数
export default function LinkCinematic({ data, onDone }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [phase, setPhase] = useState('forge'); // forge → fly → flash → type → progress
  const [typed, setTyped] = useState('');
  const [showSkip, setShowSkip] = useState(false);
  const [progressVal, setProgressVal] = useState(data.fragmentsBefore || 0);
  const timers = useRef([]);

  const total = data.fragmentsTotal || 7;
  const fullText = (data.narrative || '') + (data.villain_memory ? `\n\n${zh ? '▚ 凶手视角回忆' : '▚ KILLER\'S MEMORY'}\n${data.villain_memory}` : '');

  // 熔炼视效结束后才进入重演过场
  useEffect(() => {
    if (phase !== 'fly') return;
    const push = (fn, ms) => timers.current.push(setTimeout(fn, ms));
    push(() => setPhase('flash'), 420);
    push(() => setPhase('type'), 900);
    push(() => setShowSkip(true), 5000);
    return () => timers.current.forEach(clearTimeout);
  }, [phase]);


  // typewriter
  useEffect(() => {
    if (phase !== 'type') return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setTyped(fullText.slice(0, i));
      if (i >= fullText.length) {
        clearInterval(id);
        setPhase('progress');
      }
    }, 26);
    return () => clearInterval(id);
  }, [phase]);

  // progress counter
  useEffect(() => {
    if (phase !== 'progress') return;
    const target = data.hidden_ending_progress || (data.fragmentsBefore || 0) + 1;
    const id = setInterval(() => {
      setProgressVal(v => {
        if (v >= target) { clearInterval(id); return target; }
        return v + 1;
      });
    }, 320);
    return () => clearInterval(id);
  }, [phase]);

  const flying = phase === 'fly';
  const flashing = phase === 'flash';

  if (phase === 'forge') {
    return (
      <FusionForgeFX
        clueA={data.clueA}
        clueB={data.clueB}
        isCore={!!data.is_core_link}
        onDone={() => setPhase('fly')}
      />
    );
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200, background: '#000',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'monospace', padding: 20,
      animation: 'cine-in 0.3s ease both',
    }}>
      {/* 破碎感扫描纹理 */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.5,
        backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(255,255,255,0.045) 3px 4px)',
      }}/>
      {flashing && (
        <div style={{ position: 'absolute', inset: 0, background: '#fff', animation: 'cine-flash 0.5s ease-out both' }}/>
      )}

      <div style={{
        position: 'relative', width: '100%', maxWidth: 620,
        border: '1px solid rgba(255,255,255,0.5)', padding: '26px 24px',
        background: 'rgba(4,4,6,0.92)',
        boxShadow: flashing ? '0 0 90px #fff' : '0 0 40px rgba(255,255,255,0.12)',
        transition: 'box-shadow 0.5s',
      }}>
        <div style={{
          fontSize: '0.5rem', letterSpacing: '0.3em', color: 'rgba(255,255,255,0.4)',
          textAlign: 'center', marginBottom: 18,
        }}>
          {zh ? '推 理 重 演 · DEDUCTION REPLAY' : 'D E D U C T I O N   R E P L A Y'}
        </div>

        {/* 两条线索碰撞 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          {[{ ...data.clueA, dir: -1 }, { ...data.clueB, dir: 1 }].map((c, i) => (
            <React.Fragment key={i}>
              {i === 1 && (
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  background: flashing ? '#fff' : 'transparent',
                  border: '1px solid rgba(255,255,255,0.4)',
                  boxShadow: flashing ? '0 0 40px #fff' : 'none',
                  transition: 'all 0.3s',
                }}/>
              )}
              <div style={{
                textAlign: 'center', minWidth: 90,
                transform: flying ? `translateX(${c.dir * 320}px)` : 'none',
                opacity: flying ? 0 : 1,
                transition: 'transform 0.4s cubic-bezier(.22,1,.36,1), opacity 0.4s',
              }}>
                <div style={{
                  fontSize: 28,
                  filter: `drop-shadow(0 0 ${flashing ? 22 : 8}px #fff)`,
                  transition: 'filter 0.4s',
                }}>{c.visual_icon || '🔍'}</div>
                <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>{c.keyword}</div>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* 真相碎片字幕 */}
        <div style={{
          minHeight: 128, fontSize: '0.62rem', lineHeight: 1.9,
          color: '#f2f2f2', whiteSpace: 'pre-wrap',
          borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 16,
        }}>
          {typed}
          {phase === 'type' && <span style={{ opacity: 0.8 }}>▊</span>}
        </div>

        {/* 隐藏结局进度 */}
        <div style={{ marginTop: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.48rem', color: 'rgba(255,255,255,0.45)', marginBottom: 5 }}>
            <span>{zh ? '真相拼图 · TRUTH FRAGMENTS' : 'TRUTH FRAGMENTS'}</span>
            <span style={{ color: '#fff', fontWeight: 900 }}>{progressVal}/{total}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.12)' }}>
            <div style={{
              width: `${(progressVal / total) * 100}%`, height: '100%',
              background: '#fff', boxShadow: '0 0 12px #fff',
              transition: 'width 0.4s ease',
            }}/>
          </div>
          {data.is_core_link && (
            <div style={{ marginTop: 10, fontSize: '0.5rem', color: '#ff3860', letterSpacing: '0.14em' }}>
              ▚ {zh ? '核心逻辑链被击穿 — 凶手行为模式已永久改变' : 'CORE CHAIN BREACHED — THE KILLER HAS CHANGED'}
            </div>
          )}
        </div>

        {(phase === 'progress') && (
          <button onClick={onDone} style={{
            marginTop: 20, width: '100%', padding: '10px', cursor: 'pointer',
            border: '1px solid rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.08)',
            color: '#fff', fontFamily: 'monospace', fontSize: '0.58rem', letterSpacing: '0.2em',
          }}>
            {zh ? '▶ 返回调查' : '▶ RESUME INVESTIGATION'}
          </button>
        )}
      </div>

      {showSkip && phase !== 'progress' && (
        <button onClick={onDone} style={{
          position: 'absolute', bottom: 22, right: 22, cursor: 'pointer',
          border: '1px solid rgba(255,255,255,0.3)', background: 'transparent',
          color: 'rgba(255,255,255,0.55)', padding: '6px 14px',
          fontFamily: 'monospace', fontSize: '0.5rem', letterSpacing: '0.15em',
        }}>
          {zh ? '跳过过场 ▶▶' : 'SKIP ▶▶'}
        </button>
      )}

      <style>{`
        @keyframes cine-in{from{opacity:0}to{opacity:1}}
        @keyframes cine-flash{0%{opacity:1}100%{opacity:0}}
      `}</style>
    </div>
  );
}
