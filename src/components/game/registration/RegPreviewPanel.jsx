import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import { useLang } from '@/lib/lang.jsx';
import { detectiveTagLabel } from '@/game/identityOptions';
import Icon, { IconText } from '@/components/ui/Icon.jsx';

export default function RegPreviewPanel({ name, avatar, signature, badge, tags }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const shown = name || 'XXX';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <GlassPanel accent="#709f9a" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.2em', color: 'rgba(112, 159, 154,0.6)', marginBottom: 12 }}>
          {zh ? '侦探之家预览' : 'DETECTIVE HOME PREVIEW'}
        </div>
        <div style={{
          borderRadius: 10, padding: '16px 12px', textAlign: 'center',
          background: 'linear-gradient(150deg, rgba(23,41,54,.65), rgba(8,18,28,.84))',
          border: '1px solid rgba(112, 159, 154,0.18)',
        }}>
          <div style={{ color: '#c5a66f' }}><Icon name={avatar} size={38} /></div>
          <div style={{
            marginTop: 8, fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.05em',
            color: '#e6dfcf',
          }}>{zh ? `侦探${shown}的家` : `${shown}'S DETECTIVE HOME`}</div>
          <div style={{ fontSize: '0.55rem', color: '#c5a66f', marginTop: 6 }}><IconText text={badge} /></div>
          <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.45)', marginTop: 8, minHeight: 14 }}>
            {signature || (zh ? '（尚未写下个性签名）' : '(NO SIGNATURE YET)')}
          </div>
          {!!tags?.length && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', marginTop: 10 }}>
              {tags.map(t => (
                <span key={t} style={{
                  fontSize: '0.5rem', padding: '2px 7px', borderRadius: 99,
                  border: '1px solid rgba(112, 159, 154,0.4)', color: 'rgba(112, 159, 154,0.8)',
                }}>{detectiveTagLabel(t, lang)}</span>
              ))}
            </div>
          )}
        </div>
      </GlassPanel>

      <GlassPanel accent="#9b9aae" style={{ padding: 16 }}>
        <div style={{ fontSize: '0.58rem', letterSpacing: '0.2em', color: 'rgba(155, 154, 174,0.75)', marginBottom: 12 }}>
          {zh ? '探员编队预览' : 'SQUAD DOSSIER PREVIEW'}
        </div>
        <div aria-hidden="true" style={{
          height: 92, borderRadius: 10, position: 'relative', overflow: 'hidden',
          border: '1px solid rgba(197,166,111,.2)',
          background: 'linear-gradient(135deg, rgba(23,41,54,.9), rgba(8,18,28,.92))',
        }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', top: 30, left: `${18 + i * 28}%`,
              width: 26, height: 34, borderRadius: 6,
              border: '1px solid rgba(112, 159, 154,0.5)',
              background: 'rgba(112, 159, 154,0.1)',
              display: 'grid', placeItems: 'center', color: '#c5a66f',
            }}><Icon name={['eye', 'brain', 'terminal'][i]} size={18} /></div>
          ))}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, transparent, rgba(8,18,28,.45))',
          }} />
        </div>
        <div style={{ fontSize: '0.52rem', color: 'rgba(255,255,255,0.3)', marginTop: 10, lineHeight: 1.7 }}>
          {zh ? '注册完成后即可在探员大厅中编队部署，开启首桩案件。' : 'Complete registration to assemble your squad and begin your first case.'}
        </div>
      </GlassPanel>
    </div>
  );
}
