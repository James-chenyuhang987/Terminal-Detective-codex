import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import SceneIllustration from '@/components/game/SceneIllustration';

// 决策卡上方的剧情面板：案件开场/前情推进 + 当前目标 + 本轮推理。
export default function StoryBriefing({ story }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  if (!story) return null;

  const stats = [
    { label: zh ? '地点' : 'LOCATION', val: story.locationName },
    { label: zh ? '接触人' : 'CONTACTS', val: story.contacts },
    { label: zh ? '证据' : 'EVIDENCE', val: story.evidence },
    { label: zh ? '回合' : 'TURN', val: story.turn },
  ].filter(s => s.val !== undefined && s.val !== null && s.val !== '');

  return (
    <div style={{
      width: '100%', maxWidth: 830, marginBottom: 18,
      border: '1px solid rgba(0,229,255,0.22)', borderRadius: 16, overflow: 'hidden',
      background: 'linear-gradient(180deg, rgba(10,18,32,0.55) 0%, rgba(2,6,14,0.4) 100%)',
      backdropFilter: 'blur(18px) saturate(180%)',
      WebkitBackdropFilter: 'blur(18px) saturate(180%)',
      boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.12), 0 8px 32px rgba(0,0,0,0.5)',
      animation: 'story-in 0.5s cubic-bezier(.22,1,.36,1) both',
    }}>
      <SceneIllustration zone={story.zone} actionTag={story.actionTag} />

      <div style={{ padding: '16px 20px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <div style={{
              fontSize: '0.53rem', letterSpacing: '0.26em', color: '#00e5ff99', marginBottom: 6,
            }}>
              {story.isOpening
                ? (zh ? '案 件 开 场 · CASE OPENING' : 'CASE OPENING · INCIDENT BRIEF')
                : (zh ? '前 情 推 进 · CASE PROGRESS' : 'CASE PROGRESS · THIS TURN')}
            </div>
            <h2 style={{ margin: 0, color: '#e9fbff', fontSize: '1.05rem', letterSpacing: '0.08em' }}>
              {story.caseTitle || (zh ? '当前案件' : 'ACTIVE CASE')}
            </h2>
          </div>
          <span style={{
            flex: '0 0 auto', border: '1px solid rgba(0,229,255,.24)', borderRadius: 999,
            padding: '5px 9px', color: '#82edf8', fontSize: '0.58rem', letterSpacing: '.12em',
          }}>
            {zh ? `回合 ${story.turn}` : `TURN ${story.turn}`}
          </span>
        </div>

        {story.narrative && (
          <p style={{
            margin: 0, color: '#d8dce8', fontSize: '0.76rem', lineHeight: 1.85,
            whiteSpace: 'pre-wrap',
          }}>
            {story.narrative}
          </p>
        )}

        {story.isOpening && story.npcs?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
            {story.npcs.map((npc, index) => (
              <span key={`${npc.name}-${index}`} style={{
                border: '1px solid rgba(255,255,255,.09)', borderRadius: 8,
                background: 'rgba(255,255,255,.035)', padding: '6px 8px',
                color: '#b9c7d4', fontSize: '0.62rem', lineHeight: 1.4,
              }}>
                {npc.avatar} <strong style={{ color: '#e6f9fb' }}>{npc.name}</strong> · {npc.role}
              </span>
            ))}
          </div>
        )}

        {story.objective && (
          <div style={{
            marginTop: 13, padding: '10px 12px', borderLeft: '3px solid #d8aa54',
            background: 'linear-gradient(90deg, rgba(216,170,84,.11), rgba(216,170,84,.025))',
            color: '#f0dcad', fontSize: '0.68rem', lineHeight: 1.65,
          }}>
            <small style={{ display: 'block', color: '#c99f51', letterSpacing: '.18em', marginBottom: 3 }}>
              {zh ? '本轮调查目标' : 'CURRENT OBJECTIVE'}
            </small>
            {story.objective}
          </div>
        )}

        {story.thought && (
          <div style={{
            marginTop: 13, paddingTop: 11, borderTop: '1px solid rgba(255,255,255,.08)',
            fontSize: '0.7rem', lineHeight: 1.8, color: '#cbb5f5', whiteSpace: 'pre-wrap',
          }}>
            <small style={{ display: 'block', color: '#a786e8', letterSpacing: '.18em', marginBottom: 3 }}>
              {zh ? '探员战术推演' : 'AGENT TACTICAL READING'}
            </small>
            {story.thought}
          </div>
        )}

        {stats.length > 0 && (
          <div style={{
            display: 'flex', gap: 20, flexWrap: 'wrap', marginTop: 12, paddingTop: 10,
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}>
            {stats.map(s => (
              <div key={s.label} style={{ fontSize: '0.62rem' }}>
                <span style={{ color: 'rgba(255,255,255,0.35)', letterSpacing: '0.14em' }}>{s.label} </span>
                <span style={{ color: '#00e5ff', fontWeight: 700 }}>{s.val}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <style>{`@keyframes story-in{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}
