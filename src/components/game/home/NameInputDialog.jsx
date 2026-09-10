import React, { useState } from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon.jsx';

export default function NameInputDialog({ initialName = '', onConfirm, busy }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [name, setName] = useState(initialName);
  const ok = !!name.trim();
  return (
    <GlassPanel accent="#709f9a" glow={0.08} style={{ width: 310, padding: '24px 22px', textAlign: 'center', fontFamily: 'monospace' }}>
      <div style={{
        width: 40, height: 40, margin: '0 auto 10px', borderRadius: '50%', display: 'grid', placeItems: 'center',
        border: '1px solid rgba(112, 159, 154,0.5)', background: 'rgba(112, 159, 154,0.1)', fontSize: 18,
        color: '#c5a66f',
      }}><Icon name="search" size={22} /></div>
      <div style={{
        fontWeight: 900, letterSpacing: '0.18em', fontSize: '1rem',
        color: '#e6dfcf',
      }}>{zh ? '开始调查' : 'START INVESTIGATION'}</div>
      <div style={{ color: 'rgba(210,238,255,0.5)', fontSize: '0.68rem', margin: '10px 0 12px' }}>{zh ? '请输入你的名字' : 'ENTER YOUR NAME'}</div>

      <div style={{ position: 'relative' }}>
        <input
          value={name}
          className="td-ui-input"
          aria-label={zh ? '侦探代号' : 'Detective codename'}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && ok) onConfirm(name.trim()); }}
          placeholder={zh ? '玩家名' : 'PLAYER NAME'}
          maxLength={12}
          style={{
            width: '100%', background: 'rgba(0,0,0,0.65)', border: '1px solid rgba(112, 159, 154,0.35)',
            borderRadius: 9, padding: '11px 34px 11px 14px', color: '#a5c8c0',
            fontFamily: 'monospace', fontSize: '0.88rem', outline: 'none',
            boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.6)',
          }}
        />
        <span style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', color: 'rgba(112, 159, 154,0.5)', fontSize: '0.7rem' }}><Icon name="edit" size={15} /></span>
      </div>

      <div style={{ color: 'rgba(255,255,255,0.28)', fontSize: '0.6rem', margin: '11px 0 15px' }}>
        {zh ? '你的名字将出现在侦探之家中' : 'Your name will appear in your Detective Home'}
      </div>
      <button
        className="td-ui-button td-button-gold"
        onClick={() => ok && onConfirm(name.trim())}
        disabled={!ok || busy}
        style={{
          width: '100%', padding: '12px', borderRadius: 11, cursor: ok ? 'pointer' : 'not-allowed',
          border: '1px solid rgba(197, 166, 111,0.85)',
          background: ok ? 'linear-gradient(180deg, rgba(197, 166, 111,0.34), rgba(120,90,35,0.18))' : 'transparent',
          color: '#e1d0ac', fontFamily: 'monospace', fontWeight: 900, letterSpacing: '0.2em',
          fontSize: '0.82rem', opacity: ok ? 1 : 0.38,
          boxShadow: ok ? 'inset 0 1px 0 rgba(197,166,111,.16)' : 'none', transition: 'background .2s, border-color .2s',
        }}>
        {busy ? (zh ? '写入档案…' : 'SAVING PROFILE…') : (zh ? '确认进入' : 'CONFIRM')}
      </button>
    </GlassPanel>
  );
}
