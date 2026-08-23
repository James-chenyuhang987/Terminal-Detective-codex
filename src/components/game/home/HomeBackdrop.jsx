import React from 'react';

const BG = 'https://media.base44.com/images/public/6a841dff26d5042e4adf890e/5ff1397bd_generated_image.png';

// 侦探办公室实景底图 + 影调分层 + 光斑粒子
export default function HomeBackdrop() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `url(${BG})`, backgroundSize: 'cover', backgroundPosition: 'center',
        filter: 'saturate(1.05) contrast(1.05)',
        animation: 'bg-drift 40s ease-in-out infinite alternate',
      }} />
      {/* 影调压暗 + 中央留白 */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at 50% 45%, rgba(2,8,16,0.35) 0%, rgba(2,6,12,0.78) 60%, rgba(0,0,0,0.94) 100%)',
      }} />
      {/* 冷调统一 */}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,40,70,0.22), rgba(0,0,0,0.55))', mixBlendMode: 'multiply' }} />
      {/* 浮尘光点 */}
      {Array.from({ length: 26 }).map((_, i) => (
        <span key={i} style={{
          position: 'absolute', width: 2, height: 2, borderRadius: '50%',
          background: 'rgba(150,230,255,0.7)', boxShadow: '0 0 6px rgba(0,229,255,0.8)',
          left: `${(i * 37) % 100}%`, top: `${(i * 61) % 100}%`,
          animation: `dust-float ${9 + (i % 7) * 2}s ease-in-out ${i * 0.4}s infinite alternate`,
          opacity: 0.5,
        }} />
      ))}
      {/* 扫描线 */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.28,
        background: 'repeating-linear-gradient(0deg, transparent 0 3px, rgba(0,0,0,0.35) 3px 4px)',
      }} />
      <style>{`
        @keyframes bg-drift{from{transform:scale(1.04) translateX(-6px)}to{transform:scale(1.09) translateX(6px)}}
        @keyframes dust-float{from{transform:translateY(0)}to{transform:translateY(-40px)}}
      `}</style>
    </div>
  );
}