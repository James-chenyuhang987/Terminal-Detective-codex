import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import SceneIllustration from '@/components/game/SceneIllustration';

// 决策卡上方的剧情面板：抽象插图 + 本轮推理 + 观察摘要
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

      <div style={{ padding: '14px 18px 16px' }}>
        <div style={{
          fontSize: '0.55rem', letterSpacing: '0.26em', color: '#00e5ff99', marginBottom: 10,
        }}>
          {zh ? '前 文 剧 情 · 本轮推演' : 'STORY SO FAR · THIS TURN'}
        </div>

        {story.thought && (
          <div style={{
            fontSize: '0.75rem', lineHeight: 1.85, color: '#d8d8e8',
            maxHeight: 118, overflowY: 'auto', whiteSpace: 'pre-wrap',
            paddingRight: 6,
          }}>
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