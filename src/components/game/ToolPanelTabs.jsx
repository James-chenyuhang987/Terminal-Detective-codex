import React from 'react';
import { useLang } from '@/lib/lang.jsx';

// 右侧工具面板分类标签 —— 调查工具统一收纳，玩家一目了然
export const TOOL_TABS = [
  { id: 'evidence', icon: '🗄', zh: '证据库', en: 'EVIDENCE' },
  { id: 'link',     icon: '🔗', zh: '推理连线', en: 'LINK' },
  { id: 'board',    icon: '🧩', zh: '关系板', en: 'BOARD' },
  { id: 'map',      icon: '🗺', zh: '流程图', en: 'MAP' },
  { id: 'log',      icon: '📜', zh: '决策日志', en: 'LOG' },
];

export default function ToolPanelTabs({ active, onChange, accentColor, badges = {} }) {
  const { lang } = useLang();
  const zh = lang === 'zh';

  return (
    <div style={{ borderBottom: `1px solid ${accentColor}20` }}>
      <div style={{
        fontSize: '0.5rem', letterSpacing: '0.26em', color: `${accentColor}80`,
        padding: '10px 12px 6px',
      }}>
        {zh ? '调 查 工 具' : 'INVESTIGATION TOOLS'}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 10px 10px' }}>
        {TOOL_TABS.map(tab => {
          const on = active === tab.id;
          const badge = badges[tab.id];
          return (
            <button key={tab.id} onClick={() => onChange(tab.id)}
              style={{
                position: 'relative', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 9px', borderRadius: 8,
                fontFamily: 'monospace', fontSize: '0.6rem', letterSpacing: '0.04em',
                border: `1px solid ${on ? accentColor : `${accentColor}25`}`,
                background: on ? `${accentColor}1f` : 'rgba(255,255,255,0.02)',
                color: on ? accentColor : `${accentColor}99`,
                transition: 'all 0.2s',
              }}>
              <span>{tab.icon}</span>
              <span>{zh ? tab.zh : tab.en}</span>
              {badge > 0 && (
                <span style={{
                  position: 'absolute', top: -5, right: -5,
                  width: 14, height: 14, borderRadius: '50%',
                  background: accentColor, color: '#000',
                  fontSize: '0.45rem', fontWeight: 900,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>{badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}