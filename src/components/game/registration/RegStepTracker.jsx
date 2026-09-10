import React from 'react';
import GlassPanel from '@/components/game/home/GlassPanel';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon.jsx';

const STEPS = [
  { id: '01', zh: ['输入名字', '设定你的侦探代号'], en: ['ENTER NAME', 'Set your detective codename'] },
  { id: '02', zh: ['创建身份', '头像 · 徽章 · 签名'], en: ['CREATE IDENTITY', 'Avatar · badge · signature'] },
  { id: '03', zh: ['进入大厅', '开启第一桩案件'], en: ['ENTER HALL', 'Begin your first case'] },
];

export default function RegStepTracker({ current = 0 }) {
  const { lang } = useLang();
  return (
    <GlassPanel accent="#709f9a" style={{ padding: '20px 18px' }}>
      <div style={{ fontSize: '0.6rem', letterSpacing: '0.24em', color: 'rgba(112, 159, 154,0.65)', marginBottom: 18 }}>
        {lang === 'zh' ? '注册流程' : 'REGISTRATION FLOW'}
      </div>
      {STEPS.map((s, i) => {
        const active = i === current;
        const done = i < current;
        const color = done ? '#8aaa91' : active ? '#c5a66f' : 'rgba(255,255,255,0.28)';
        return (
          <div key={s.id} aria-current={active ? 'step' : undefined} style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <div style={{
                width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
                border: `1px solid ${color}`, color, fontSize: '0.6rem', fontWeight: 900,
                background: active ? 'rgba(197, 166, 111,0.14)' : 'transparent',
                boxShadow: active ? 'inset 0 1px 0 rgba(197,166,111,.14)' : 'none',
              }}>{done ? <Icon name="check" size={16} label={lang === 'zh' ? '已完成' : 'Complete'} /> : s.id}</div>
              {i < STEPS.length - 1 && (
                <div style={{ width: 1, flex: 1, minHeight: 40, background: `linear-gradient(180deg, ${color}, rgba(255,255,255,0.08))` }} />
              )}
            </div>
            <div style={{ paddingBottom: 22 }}>
              <div style={{ color, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em' }}>{s[lang][0]}</div>
              <div style={{ color: 'rgba(255,255,255,0.32)', fontSize: '0.56rem', marginTop: 4 }}>{s[lang][1]}</div>
            </div>
          </div>
        );
      })}
    </GlassPanel>
  );
}
