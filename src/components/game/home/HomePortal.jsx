import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon.jsx';

export default function HomePortal({ onEnter }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  return (
    <div className="td-ui-card td-home-portal" style={{
      position: 'relative', width: '100%', maxWidth: 350, padding: '22px 20px 18px',
      border: '1px solid rgba(112, 159, 154,0.45)', borderRadius: 20, textAlign: 'center',
      background: 'linear-gradient(180deg, rgba(23,41,54,.84), rgba(8,18,28,.94))',
      backdropFilter: 'blur(12px)',
      boxShadow: '0 18px 40px rgba(0,0,0,.35), inset 0 1px 0 rgba(197,166,111,.15)',
      fontFamily: 'monospace', overflow: 'hidden',
    }}>
      <div aria-hidden="true" style={{
        position: 'absolute', top: 0, left: 24, right: 24, height: 1,
        background: 'linear-gradient(to right, transparent, #c5a66f, transparent)',
      }} />

      <div style={{
        fontSize: '1.2rem', fontWeight: 900, letterSpacing: '0.14em',
        color: '#e1d0ac',
      }}>
        <Icon name="detective" size={22} /> {zh ? '探员事务所' : 'AGENT BUREAU'}
      </div>
      <div style={{ fontSize: '0.62rem', color: 'rgba(200,235,255,0.5)', marginTop: 8, letterSpacing: '0.05em' }}>
        {zh ? '查阅探员档案，签约支援成员并管理编队' : 'Review agent dossiers, recruit support, and manage your investigation squad'}
      </div>

      <div aria-hidden="true" style={{ position: 'relative', height: 180, margin: '18px 0 14px', display: 'grid', placeItems: 'center' }}>
        <div style={{
          position: 'absolute', width: 164, height: 164, borderRadius: '50% 50% 8px 8px',
          border: '1px solid rgba(197,166,111,.26)',
          background: 'linear-gradient(135deg, rgba(197,166,111,.08), rgba(8,18,28,.65))',
        }} />
        <Icon name="detective" size={90} style={{ position: 'relative', color: '#c5a66f', strokeWidth: 1 }} />
        <span style={{ position: 'absolute', bottom: 17, color: '#9caaa9', fontSize: '.48rem', letterSpacing: '.22em' }}>PERSONNEL / 03</span>
      </div>

      <button className="td-ui-button td-button-primary td-home-portal-button" onClick={onEnter}
        style={{
          width: '100%', padding: '13px', cursor: 'pointer', borderRadius: 12,
          border: '1px solid rgba(165, 200, 192,0.75)',
          background: 'linear-gradient(180deg, rgba(112,159,154,.18), rgba(23,41,54,.6))',
          color: '#e6dfcf', fontFamily: 'monospace', fontWeight: 900,
          letterSpacing: '0.16em', fontSize: '0.88rem',
          boxShadow: 'inset 0 1px 0 rgba(230,223,207,.08)', transition: 'background .2s, border-color .2s',
        }}>
        {zh ? '进入探员市场' : 'ENTER AGENT MARKET'} <Icon name="door" />
      </button>
      <div style={{ fontSize: '0.5rem', color: 'rgba(200,235,255,0.3)', marginTop: 9, letterSpacing: '0.24em' }}>
        — {zh ? '探员交换站' : 'AGENT EXCHANGE'} —
      </div>
    </div>
  );
}
