import React, { useState } from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import HomeBackdrop from '@/components/game/home/HomeBackdrop';
import RegStepTracker from '@/components/game/registration/RegStepTracker';
import RegPreviewPanel from '@/components/game/registration/RegPreviewPanel';
import { useLang } from '@/lib/lang.jsx';
import { DETECTIVE_TAGS, IDENTITY_BADGES, identityBadgeLabel } from '@/game/identityOptions';

const AVATARS = ['🕵️', '🕵️‍♀️', '👁️', '🦉', '🐺', '🎩', '🦅', '🐍'];
const RANDOM_NAMES = {
  zh: ['夜鸦', '灰隼', '零号', '雨村', '白桦', '暗弦', '玄影', '晨钟'],
  en: ['NIGHT RAVEN', 'GREY FALCON', 'ZERO', 'RAINWATCH', 'BIRCH', 'DARK CHORD', 'SHADOW', 'DAWNBELL'],
};
const MAX_SIG = 30;

export default function DetectiveRegistration({ onConfirm, onBack, busy, error = '' }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [name, setName] = useState('');
  const [avatarIdx, setAvatarIdx] = useState(0);
  const [badge, setBadge] = useState('private');
  const [tags, setTags] = useState([]);
  const [signature, setSignature] = useState('');

  const avatar = AVATARS[avatarIdx];
  const badgeLabel = identityBadgeLabel(badge, lang);
  const step = !name.trim() ? 0 : 1;
  const rollName = () => {
    const names = RANDOM_NAMES[lang] || RANDOM_NAMES.zh;
    setName(names[Math.floor(Math.random() * names.length)]);
  };
  const toggleTag = (t) =>
    setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : prev.length >= 3 ? prev : [...prev, t]);

  return (
    <div className="td-registration td-page-shell" style={{ minHeight: '100dvh', position: 'relative', background: '#07090e', fontFamily: 'monospace', overflowX: 'hidden' }}>
      <HomeBackdrop />

      <div style={{ position: 'relative', zIndex: 2, padding: '24px 22px 40px', maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <button className="td-ui-button td-button-ghost td-button-compact" onClick={onBack} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'monospace',
            color: 'rgba(0,229,255,0.6)', fontSize: '0.62rem', letterSpacing: '0.16em',
          }}>◄ {zh ? '返回' : 'BACK'}</button>
          <div style={{ textAlign: 'center', flex: 1 }}>
            <h1 style={{
              margin: 0, fontSize: 'clamp(1.5rem, 3.6vw, 2.3rem)', fontWeight: 900, letterSpacing: '0.12em',
              background: 'linear-gradient(180deg, #ffffff, #cfefff 45%, #38b9ff)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              filter: 'drop-shadow(0 0 24px rgba(0,180,255,0.5))',
            }}>{zh ? '新探员注册' : 'NEW AGENT REGISTRATION'}</h1>
            <div style={{ fontSize: '0.58rem', color: 'rgba(255,255,255,0.35)', letterSpacing: '0.2em', marginTop: 6 }}>
              {zh ? '建立你的侦探身份' : 'CREATE YOUR DETECTIVE IDENTITY'}
            </div>
          </div>
          <span style={{ width: 40 }} />
        </div>

        <div className="td-registration-grid" style={{ display: 'grid', gap: 18, gridTemplateColumns: 'minmax(180px,210px) 1fr minmax(210px,250px)', alignItems: 'start' }}>
          <RegStepTracker current={step} />

          {/* Form */}
          <GlassPanel accent="#00e5ff" className="td-registration-form" style={{ padding: '22px 24px' }}>
            {/* 代号 */}
            <Field label={zh ? '侦探代号' : 'DETECTIVE CODENAME'} hint={zh ? '2–10 个字符' : '2–10 CHARACTERS'}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="td-ui-input" value={name} maxLength={10} onChange={e => setName(e.target.value)}
                  placeholder={zh ? '输入你的侦探代号…' : 'Enter your detective codename…'}
                  style={{
                    flex: 1, background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,229,255,0.35)',
                    borderRadius: 9, padding: '11px 13px', color: '#00e5ff',
                    fontFamily: 'monospace', fontSize: '0.82rem', outline: 'none',
                  }} />
                <button type="button" className="td-ui-button td-registration-random" onClick={rollName}
                  aria-label={zh ? '生成随机代号' : 'Generate random codename'}
                  title={zh ? '随机代号' : 'Random codename'} style={{
                  padding: '0 14px', borderRadius: 9, cursor: 'pointer',
                  border: '1px solid rgba(0,229,255,0.35)', background: 'rgba(0,229,255,0.1)',
                  color: '#00e5ff',
                }}><span aria-hidden="true">🎲</span><span>{zh ? '随机' : 'RANDOM'}</span></button>
              </div>
            </Field>

            {/* 头像 */}
            <Field label={zh ? '侦探头像' : 'DETECTIVE AVATAR'} hint={zh ? '左右滑动选择' : 'SWIPE TO SELECT'}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Arrow dir="◄" label={zh ? '上一个头像' : 'Previous avatar'} onClick={() => setAvatarIdx(i => (i - 1 + AVATARS.length) % AVATARS.length)} />
                <div style={{ flex: 1, display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 2px' }}>
                  {AVATARS.map((a, i) => (
                    <button className={`td-ui-button td-select-tile ${i === avatarIdx ? 'is-active' : ''}`} key={a + i} onClick={() => setAvatarIdx(i)} style={{
                      width: 52, height: 52, flexShrink: 0, borderRadius: 12, cursor: 'pointer', fontSize: 25,
                      border: `1px solid ${i === avatarIdx ? '#e8c98a' : 'rgba(255,255,255,0.14)'}`,
                      background: i === avatarIdx ? 'rgba(232,201,138,0.16)' : 'rgba(0,0,0,0.5)',
                      boxShadow: i === avatarIdx ? '0 0 20px rgba(232,201,138,0.4)' : 'none',
                      transition: 'all 0.2s',
                    }}>{a}</button>
                  ))}
                </div>
                <Arrow dir="►" label={zh ? '下一个头像' : 'Next avatar'} onClick={() => setAvatarIdx(i => (i + 1) % AVATARS.length)} />
              </div>
            </Field>

            {/* 徽章 */}
            <Field label={zh ? '身份徽章' : 'IDENTITY BADGE'}>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {IDENTITY_BADGES.map(b => (
                  <button className={`td-ui-button td-choice-chip ${badge === b.key ? 'is-active' : ''}`} key={b.key} onClick={() => setBadge(b.key)} style={{
                    padding: '10px 14px', borderRadius: 10, cursor: 'pointer', fontFamily: 'monospace',
                    border: `1px solid ${badge === b.key ? '#00e5ff' : 'rgba(255,255,255,0.14)'}`,
                    background: badge === b.key ? 'rgba(0,229,255,0.14)' : 'rgba(0,0,0,0.5)',
                    color: badge === b.key ? '#00e5ff' : 'rgba(255,255,255,0.5)', fontSize: '0.66rem',
                  }}>{b.icon} {b[lang]}</button>
                ))}
              </div>
            </Field>

            {/* 标签 */}
            <Field label={zh ? '初始标签' : 'STARTING TAGS'} hint={zh ? `最多 3 个 · 已选 ${tags.length}` : `MAX 3 · ${tags.length} SELECTED`}>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                {DETECTIVE_TAGS.map(t => {
                  const on = tags.includes(t.key);
                  return (
                    <button className={`td-ui-button td-choice-pill ${on ? 'is-active' : ''}`} key={t.key} onClick={() => toggleTag(t.key)} style={{
                      padding: '6px 12px', borderRadius: 99, cursor: 'pointer', fontFamily: 'monospace',
                      border: `1px solid ${on ? '#a78bfa' : 'rgba(255,255,255,0.14)'}`,
                      background: on ? 'rgba(167,139,250,0.18)' : 'transparent',
                      color: on ? '#c9b6ff' : 'rgba(255,255,255,0.42)', fontSize: '0.6rem',
                    }}>{t[lang]}</button>
                  );
                })}
              </div>
            </Field>

            {/* 签名 */}
            <Field label={zh ? '个性签名' : 'SIGNATURE'} hint={`${signature.length}/${MAX_SIG}`}>
              <textarea className="td-ui-input" value={signature} maxLength={MAX_SIG} onChange={e => setSignature(e.target.value)}
                placeholder={zh ? '写下属于你的侦探信条…' : 'Write your detective creed…'}
                style={{
                  width: '100%', height: 62, resize: 'none',
                  background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(0,229,255,0.28)',
                  borderRadius: 9, padding: '10px 12px', color: '#cfefff',
                  fontFamily: 'monospace', fontSize: '0.72rem', outline: 'none',
                }} />
            </Field>

            <button
              className="td-ui-button td-button-gold td-button-wide"
              onClick={() => onConfirm({
                detective_name: name.trim(), avatar, signature: signature.trim(),
                identity_badge: badge, detective_tags: tags,
              })}
              disabled={busy || name.trim().length < 2}
              style={{
                width: '100%', marginTop: 6, padding: '14px', borderRadius: 12,
                cursor: busy || name.trim().length < 2 ? 'not-allowed' : 'pointer',
                border: '1px solid #c5a059',
                background: 'linear-gradient(180deg, rgba(232,201,138,0.3), rgba(120,88,30,0.4))',
                color: '#f6e3b8', fontFamily: 'monospace', fontWeight: 900,
                letterSpacing: '0.2em', fontSize: '0.82rem',
                opacity: busy || name.trim().length < 2 ? 0.35 : 1,
                boxShadow: '0 0 26px rgba(197,160,89,0.35)',
              }}>
              🔒 {busy ? (zh ? '登记中…' : 'REGISTERING…') : (zh ? '确认注册' : 'CONFIRM REGISTRATION')}
            </button>
            {error && <div role="alert" style={{ marginTop: 10, padding: 9, borderRadius: 8, border: '1px solid rgba(255,56,96,.45)', background: 'rgba(255,56,96,.08)', color: '#ff7890', textAlign: 'center', fontSize: '.58rem' }}>{error}</div>}
            <div style={{ textAlign: 'center', fontSize: '0.54rem', color: 'rgba(255,255,255,0.28)', marginTop: 10 }}>
              ⚠ {zh ? '侦探代号仅可修改 1 次，请谨慎确认' : 'Your codename can only be changed once. Confirm carefully.'}
            </div>
          </GlassPanel>

          <RegPreviewPanel name={name.trim()} avatar={avatar} signature={signature.trim()} badge={badgeLabel} tags={tags} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint = '', children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: '0.62rem', color: '#e8c98a', letterSpacing: '0.16em' }}>◈ {label}</span>
        {hint && <span style={{ fontSize: '0.54rem', color: 'rgba(255,255,255,0.3)' }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Arrow({ dir, label, onClick }) {
  return (
    <button type="button" className="td-ui-button td-icon-button td-registration-arrow" onClick={onClick}
      aria-label={label} title={label} style={{
      background: 'transparent', border: 'none', cursor: 'pointer',
      color: 'rgba(0,229,255,0.55)', fontSize: '0.8rem', padding: 4,
    }}>{dir}</button>
  );
}
