import React from 'react';
import { getLore } from '@/game/agentLore';
import { useLang } from '@/lib/lang.jsx';

// 完整档案 Tab — 时间线布局 + 战绩 + 心理评估
export default function AgentDossierPanel({ agentIdx, color, icon, roleZh: _roleZh, lore: loreOverride = null }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const lore = loreOverride || getLore(agentIdx, lang);
  if (!lore) return null;

  return (
    <div style={{ fontFamily: 'monospace' }}>
      {/* Header quote */}
      <div style={{
        border: `1px solid ${color}30`, borderRadius: 10,
        background: `${color}08`, padding: '10px 12px', marginBottom: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 14 }}>{icon}</span>
          <span style={{ fontSize: '0.58rem', color, fontWeight: 900 }}>{lore.id}</span>
          <span style={{
            marginLeft: 'auto', fontSize: '0.4rem', color,
            border: `1px solid ${color}50`, borderRadius: 3, padding: '1px 5px',
          }}>{lore.personality}</span>
        </div>
        <div style={{ fontSize: '0.48rem', color: `${color}cc`, lineHeight: 1.7 }}>{lore.quote}</div>
      </div>

      {/* 战绩 */}
      <div style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', marginBottom: 6 }}>
        ◈ {zh ? '历史战绩' : 'SERVICE RECORD'}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {lore.record.map(r => (
          <div key={r.label} style={{
            flex: 1, textAlign: 'center', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.09)', padding: '6px 4px',
            background: 'rgba(255,255,255,0.02)',
          }}>
            <div style={{ fontSize: '0.38rem', color: 'rgba(255,255,255,0.3)' }}>{r.label}</div>
            <div style={{ fontSize: '0.75rem', fontWeight: 900, color, textShadow: `0 0 8px ${color}70` }}>{r.value}</div>
          </div>
        ))}
      </div>

      {/* 时间线 */}
      <div style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', marginBottom: 8 }}>
        ◈ {zh ? '出身经历' : 'ORIGIN TIMELINE'}
      </div>
      <div style={{ position: 'relative', paddingLeft: 16, marginBottom: 14 }}>
        <div style={{
          position: 'absolute', left: 4, top: 4, bottom: 4, width: 1,
          background: `linear-gradient(to bottom, ${color}80, ${color}10)`,
        }} />
        {lore.timeline.map((m, i) => (
          <div key={i} style={{ marginBottom: 12, position: 'relative', animation: `dos-in 0.3s ${i * 0.06}s ease both` }}>
            <div style={{
              position: 'absolute', left: -16, top: 3,
              width: 9, height: 9, borderRadius: '50%',
              background: color, boxShadow: `0 0 10px ${color}`,
              border: '2px solid #020810',
            }} />
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{ fontSize: '0.5rem', fontWeight: 900, color, letterSpacing: '0.06em' }}>{m.year}</span>
              <span style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.7)', fontWeight: 700 }}>{m.title}</span>
            </div>
            <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.65, marginTop: 3 }}>{m.text}</div>
          </div>
        ))}
      </div>

      {/* 性格侧写 */}
      <div style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.3)', letterSpacing: '0.14em', marginBottom: 6 }}>
        ◈ {zh ? '性格侧写' : 'PROFILE'}
      </div>
      <div style={{
        fontSize: '0.46rem', color: 'rgba(255,255,255,0.48)', lineHeight: 1.75,
        border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8,
        padding: '9px 11px', background: 'rgba(255,255,255,0.02)', marginBottom: 10,
      }}>
        {lore.summary}
      </div>
      <div style={{
        fontSize: '0.44rem', color: `${color}bb`, lineHeight: 1.6,
        border: `1px dashed ${color}40`, borderRadius: 8, padding: '7px 10px',
        background: `${color}06`,
      }}>
        {lore.psych}
      </div>

      <style>{`@keyframes dos-in{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
