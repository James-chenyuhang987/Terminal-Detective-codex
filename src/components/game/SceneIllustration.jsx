import React from 'react';

// 纯 CSS/SVG 抽象场景插图 —— 按区域/行动类型映射，无加载延迟
const SCENE_MAP = {
  zone_datacenter: { racks: true, rain: false, glow: '#00e5ff' },
  zone_lab:        { flask: true, rain: false, glow: '#a78bfa' },
  zone_lobby:      { figures: true, rain: false, glow: '#00ff88' },
  zone_balcony:    { figures: true, rain: true, glow: '#ffaa00' },
};

const ACTION_HINT = {
  hack_terminal: 'zone_lab',
  analyze_forensics: 'zone_lab',
  check_cctv: 'zone_lobby',
  check_alibi: 'zone_lobby',
  talk_to_npc: 'zone_lobby',
  interrogate_suspect: 'zone_lobby',
  tail_suspect: 'zone_balcony',
};

export default function SceneIllustration({ zone, actionTag, height = 110 }) {
  const key = SCENE_MAP[zone] ? zone : (SCENE_MAP[ACTION_HINT[actionTag]] ? ACTION_HINT[actionTag] : 'zone_datacenter');
  const s = SCENE_MAP[key];
  const c = s.glow;

  return (
    <div style={{
      position: 'relative', height, width: '100%', overflow: 'hidden',
      borderRadius: 12, border: `1px solid ${c}25`,
      background: `linear-gradient(180deg, ${c}12 0%, rgba(2,6,14,0.85) 100%)`,
    }}>
      <svg width="100%" height="100%" viewBox="0 0 320 110" preserveAspectRatio="xMidYMax slice">
        {/* 地平线网格 */}
        {[0, 1, 2, 3].map(i => (
          <line key={`h${i}`} x1="0" y1={70 + i * 12} x2="320" y2={70 + i * 12}
            stroke={c} strokeOpacity={0.12} strokeWidth="1" />
        ))}
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => (
          <line key={`v${i}`} x1={i * 40} y1="70" x2={i * 40 - 60} y2="110"
            stroke={c} strokeOpacity={0.1} strokeWidth="1" />
        ))}

        {/* 机柜阵列 */}
        {s.racks && [30, 62, 94, 210, 244, 278].map((x, i) => (
          <g key={x}>
            <rect x={x} y={26 + (i % 3) * 6} width="22" height={44 - (i % 3) * 6}
              fill="rgba(0,0,0,0.5)" stroke={c} strokeOpacity="0.45" />
            {[0, 1, 2, 3].map(j => (
              <rect key={j} x={x + 4} y={32 + (i % 3) * 6 + j * 8} width="14" height="3"
                fill={c} fillOpacity={j === (i % 4) ? 0.9 : 0.25} />
            ))}
          </g>
        ))}

        {/* 实验器皿 */}
        {s.flask && (
          <g stroke={c} strokeOpacity="0.6" fill="none">
            <path d="M148 28 L148 44 L136 68 L180 68 L168 44 L168 28 Z" />
            <path d="M139 60 L177 60" strokeOpacity="0.35" />
            <circle cx="158" cy="64" r="2.5" fill={c} fillOpacity="0.8" stroke="none" />
            <circle cx="152" cy="56" r="1.6" fill={c} fillOpacity="0.5" stroke="none" />
            <circle cx="165" cy="52" r="1.2" fill={c} fillOpacity="0.4" stroke="none" />
          </g>
        )}

        {/* 人物剪影 */}
        {s.figures && [120, 158, 196].map((x, i) => (
          <g key={x} opacity={0.55 - i * 0.12}>
            <circle cx={x} cy={38 + i * 3} r="6" fill={c} fillOpacity="0.7" />
            <path d={`M${x - 9} ${70 + i * 3} L${x - 6} ${48 + i * 3} Q${x} ${44 + i * 3} ${x + 6} ${48 + i * 3} L${x + 9} ${70 + i * 3} Z`}
              fill={c} fillOpacity="0.45" />
          </g>
        ))}

        {/* 数据流 */}
        {[0, 1, 2, 3, 4, 5].map(i => (
          <rect key={`d${i}`} x={14 + i * 52} y="0" width="1.5" height="18"
            fill={c} fillOpacity="0.5">
            <animate attributeName="y" values="-20;110" dur={`${1.8 + i * 0.4}s`} repeatCount="indefinite" />
          </rect>
        ))}

        {/* 雨线 */}
        {s.rain && [0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <line key={`r${i}`} x1={i * 42} y1="0" x2={i * 42 - 10} y2="24"
            stroke={c} strokeOpacity="0.3" strokeWidth="1">
            <animate attributeName="y1" values="-24;110" dur={`${0.7 + i * 0.09}s`} repeatCount="indefinite" />
            <animate attributeName="y2" values="0;134" dur={`${0.7 + i * 0.09}s`} repeatCount="indefinite" />
          </line>
        ))}

        {/* 扫描光带 */}
        <rect x="0" y="0" width="320" height="2" fill={c} fillOpacity="0.5">
          <animate attributeName="y" values="0;110;0" dur="6s" repeatCount="indefinite" />
        </rect>
      </svg>
    </div>
  );
}