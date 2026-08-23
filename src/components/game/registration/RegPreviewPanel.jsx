import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';

export default function RegPreviewPanel({ name, avatar, signature, badge, tags }) {
  const shown = name || 'XXX';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <GlassPanel accent="#00e5ff" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.2em', color: 'rgba(0,229,255,0.6)', marginBottom: 12 }}>
          侦探之家预览
        </div>
        <div style={{
          borderRadius: 10, padding: '16px 12px', textAlign: 'center',
          background: 'radial-gradient(ellipse at top, rgba(0,90,140,0.35), rgba(0,0,0,0.7))',
          border: '1px solid rgba(0,229,255,0.18)',
        }}>
          <div style={{ fontSize: 34 }}>{avatar}</div>
          <div style={{
            marginTop: 8, fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.05em',
            background: 'linear-gradient(180deg, #ffffff, #38b9ff)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>侦探{shown}的家</div>
          <div style={{ fontSize: '0.55rem', color: '#e8c98a', marginTop: 6 }}>{badge}</div>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginTop: 8, minHeight: 14 }}>
            {signature || '（尚未写下个性签名）'}
          </div>
          {!!tags?.length && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
              {tags.map(t => (
                <span key={t} style={{
                  fontSize: '0.5rem', padding: '2px 7px', borderRadius: 99,
                  border: '1px solid rgba(0,229,255,0.4)', color: 'rgba(0,229,255,0.8)',
                }}>{t}</span>
              ))}
            </div>
          )}
        </div>
      </GlassPanel>

      <GlassPanel accent="#a78bfa" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.2em', color: 'rgba(167,139,250,0.75)', marginBottom: 12 }}>
          全息大厅缩略图
        </div>
        <div style={{
          height: 92, borderRadius: 10, position: 'relative', overflow: 'hidden',
          border: '1px solid rgba(167,139,250,0.2)',
          background: 'radial-gradient(ellipse at center, rgba(70,40,140,0.5), rgba(0,0,0,0.85))',
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', top: 30, left: `${18 + i * 28}%`,
              width: 26, height: 34, borderRadius: 6,
              border: '1px solid rgba(0,229,255,0.5)',
              background: 'rgba(0,229,255,0.1)',
              boxShadow: '0 0 12px rgba(0,229,255,0.35)',
            }} />
          ))}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 4px)',
          }} />
        </div>
        <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', marginTop: 10, lineHeight: 1.7 }}>
          注册完成后即可在全息探员大厅中编队部署，开启首桩案件。
        </div>
      </GlassPanel>
    </div>
  );
}