import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon, { IconText } from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';

export default function CrisisAlert({ event, onChoose, actionPoints = 0, error = null }) {
  const { lang } = useLang();

  return (
    <div className="td-crisis-alert" role="dialog" aria-modal="true" aria-labelledby="td-crisis-title" style={{
      position: 'fixed', inset: 0, zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,18,28,0.96)',
      fontFamily: 'monospace',
      padding: 16,
    }}>
      <div style={{
        position: 'relative', width: 580, maxWidth: '92vw', maxHeight: '90dvh', overflowY: 'auto',
        padding: 24, borderRadius: 12, border: '1px solid #c77c7860',
        background: '#101e2a', boxShadow: '0 18px 60px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ color: '#c77c78', marginBottom: 12 }}><Icon name={event.icon || 'warning'} size={36} /></div>
          <div id="td-crisis-title" style={{
            fontSize: '1.15rem', fontWeight: 900, color: '#dda29a',
            letterSpacing: '0.12em',
          }}>
            <IconText text={event.title} />
          </div>
          <div style={{ fontSize: '0.58rem', color: '#c5a66f', letterSpacing: '0.16em', marginTop: 8 }}>
            {lang === 'zh' ? '危机事件 · 需要立即响应' : 'CRISIS EVENT · IMMEDIATE RESPONSE REQUIRED'}
          </div>
        </div>

        {/* Description */}
        <div style={{
          padding: '14px 18px', borderRadius: 10, marginBottom: 18,
          border: '1px solid #c19a6350', background: 'rgba(193, 154, 99,0.07)',
          color: '#e1d0ac', fontSize: '0.66rem', lineHeight: 1.9,
        }}>
          <IconText text={event.desc} />
        </div>

        {error && (
          <div role="alert" style={{
            color: '#e1d0ac', border: '1px solid #c19a6360', borderRadius: 8,
            background: 'rgba(193, 154, 99,0.1)', padding: '9px 12px', marginBottom: 12,
            fontSize: '0.58rem', lineHeight: 1.6,
          }}>
            <Icon name="warning" /> {error}
          </div>
        )}

        {/* Choices */}
        <div style={{ display: 'flex', gap: 10 }}>
          {event.choices.map(c => {
            const disabled = (Number(c.ap_cost) || 0) > actionPoints;
            const riskColor = noirColor(c.riskColor);
            return (
            <button type="button" key={c.id} onClick={() => onChoose(c.id)} disabled={disabled} style={{
              flex: 1, minWidth: 0, padding: '14px 12px', borderRadius: 10, cursor: disabled ? 'not-allowed' : 'pointer',
              border: `1px solid ${riskColor}55`,
              background: `${riskColor}0c`,
              fontFamily: 'monospace', textAlign: 'center',
              transition: 'background-color 0.15s, border-color 0.15s',
              opacity: disabled ? 0.45 : 1,
            }}
              onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = `${riskColor}22`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${riskColor}0c`; }}
            >
              <div style={{
                display: 'inline-block', fontSize: '0.52rem', fontWeight: 900, color: riskColor,
                border: `1px solid ${riskColor}60`, borderRadius: 4, padding: '1px 7px',
                marginBottom: 6, background: `${riskColor}15`,
              }}><IconText text={c.risk} /></div>
              <div style={{ color: '#e6dfcf', fontSize: '0.72rem', fontWeight: 900, marginBottom: 5 }}><IconText text={c.label} /></div>
              <div style={{ color: c.ap_cost ? '#e1d0ac' : '#8aaa91', fontSize: '0.46rem', marginBottom: 5 }}>
                {c.ap_cost ? `AP -${c.ap_cost}` : (lang === 'zh' ? '无 AP 消耗' : 'NO AP COST')}
              </div>
              <div style={{ color: '#9caaa9', fontSize: '0.6rem', lineHeight: 1.6 }}><IconText text={c.desc} /></div>
            </button>
          )})}
        </div>
      </div>
    </div>
  );
}
