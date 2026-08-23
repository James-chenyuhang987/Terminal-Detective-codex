import React, { useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

const DEFAULT_ZONE_LAYOUT = {
  zone_datacenter: { x: 50, y: 18, label: '数据中心', sublabel: '案发现场', icon: '💻', color: '#ff3860' },
  zone_lobby:      { x: 20, y: 60, label: '大堂',     sublabel: '监控中心', icon: '📹', color: '#00e5ff' },
  zone_lab:        { x: 80, y: 60, label: '私人实验室', sublabel: '黑客入口', icon: '🔬', color: '#a78bfa' },
  zone_balcony:    { x: 50, y: 85, label: '天台阳台', sublabel: '逃离路线', icon: '🌃', color: '#ffaa00' },
};

const DEFAULT_CONNECTIONS = [
  ['zone_datacenter','zone_lobby'],['zone_datacenter','zone_lab'],
  ['zone_datacenter','zone_balcony'],['zone_lobby','zone_balcony'],['zone_lab','zone_balcony'],
];

const DEFAULT_CLUE_ZONE_MAP = {
  c_01: 'zone_datacenter', c_02: 'zone_datacenter', c_07: 'zone_datacenter',
  c_03: 'zone_lobby', c_08: 'zone_lobby',
  c_04: 'zone_lab', c_05: 'zone_lab', c_secret_99: 'zone_lab',
  c_06: 'zone_balcony',
};

// Clue weight → color
const WEIGHT_COLOR = { CRITICAL: '#ff3860', HIGH: '#ff6b35', MEDIUM: '#ffaa00', LOW: '#00e5ff', HIDDEN: '#a78bfa' };

export default function MiniMap({ gameState, caseData, agentPath, accentColor }) {
  const { t } = useLang();
  const [tab, setTab] = useState('map'); // 'map' | 'clues' | 'plot'
  const [expanded, setExpanded] = useState(false);

  const zoneLayout  = caseData?.zone_layout    || DEFAULT_ZONE_LAYOUT;
  const connections = caseData?.zone_connections || DEFAULT_CONNECTIONS;
  const clueZoneMap = caseData?.zone_clue_map   || DEFAULT_CLUE_ZONE_MAP;

  const currentZone  = agentPath?.[agentPath.length - 1] || Object.keys(zoneLayout)[0];
  const visitedZones = new Set(agentPath || []);

  // Clues per zone
  const zoneClues = {};
  Object.keys(zoneLayout).forEach(z => { zoneClues[z] = []; });
  (gameState?.unlocked_clues || []).forEach(id => {
    const z = clueZoneMap[id];
    if (z && zoneClues[z]) zoneClues[z].push(id);
  });

  // All unlocked clue objects
  const unlockedClueObjs = (gameState?.unlocked_clues || []).map(id =>
    caseData?.clue_dictionary?.find(c => c.clue_id === id)
  ).filter(Boolean);

  const W = expanded ? 300 : 200;
  const mapH = expanded ? 210 : 140;

  // Plot summary from caseData
  const plotLines = caseData?.plot_summary
    ? (Array.isArray(caseData.plot_summary) ? caseData.plot_summary : [caseData.plot_summary])
    : [
        caseData?.description || '',
        caseData?.victim ? `◎ 被害人: ${caseData.victim}` : '',
        caseData?.location ? `◎ 地点: ${caseData.location}` : '',
      ].filter(Boolean);

  return (
    <div style={{
      width: W, fontFamily: 'monospace',
      background: 'rgba(2,6,18,0.94)',
      border: `1px solid ${accentColor}35`,
      borderRadius: 12, overflow: 'hidden',
      backdropFilter: 'blur(10px)',
      boxShadow: `0 0 24px ${accentColor}18`,
      transition: 'all 0.3s ease',
    }}>
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-2 py-1 cursor-pointer select-none"
        style={{ borderBottom: `1px solid ${accentColor}20`, background: `${accentColor}0a` }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: '0.55rem', color: accentColor, fontWeight: 700, letterSpacing: '0.1em' }}>
          {t.minimap}
        </span>
        <span style={{ fontSize: '0.6rem', color: `${accentColor}60`, cursor: 'pointer' }}>
          {expanded ? '−' : '+'}
        </span>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${accentColor}15` }}>
        {[
          { key: 'map',   label: '🗺' },
          { key: 'clues', label: '🔍' },
          { key: 'plot',  label: '📋' },
        ].map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            style={{
              flex: 1, padding: '3px 0', fontSize: '0.65rem',
              fontFamily: 'monospace', cursor: 'pointer', border: 'none',
              background: tab === tb.key ? `${accentColor}18` : 'transparent',
              color: tab === tb.key ? accentColor : `${accentColor}50`,
              borderBottom: tab === tb.key ? `2px solid ${accentColor}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* ── MAP tab ── */}
      {tab === 'map' && (
        <div style={{ position: 'relative', height: mapH, transition: 'height 0.3s ease' }}>
          {/* Grid bg */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.07 }}>
            <defs>
              <pattern id="mm-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke={accentColor} strokeWidth="0.5" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#mm-grid)" />
          </svg>

          {/* Connection lines */}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            {connections.map(([a, b]) => {
              const zA = zoneLayout[a], zB = zoneLayout[b];
              if (!zA || !zB) return null;
              const bothVisited = visitedZones.has(a) && visitedZones.has(b);
              return (
                <line key={`${a}-${b}`}
                  x1={`${zA.x}%`} y1={`${zA.y}%`} x2={`${zB.x}%`} y2={`${zB.y}%`}
                  stroke={bothVisited ? accentColor : 'rgba(255,255,255,0.1)'}
                  strokeWidth={bothVisited ? 1.5 : 0.8}
                  strokeDasharray={bothVisited ? '5 3' : '3 5'}
                  style={{ filter: bothVisited ? `drop-shadow(0 0 3px ${accentColor})` : 'none' }}
                />
              );
            })}
          </svg>

          {/* Zone nodes */}
          {Object.entries(zoneLayout).map(([zk, zd]) => {
            const isCurrent = zk === currentZone;
            const isVisited = visitedZones.has(zk);
            const clueCount = zoneClues[zk]?.length || 0;
            const color = isCurrent ? zd.color : isVisited ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)';
            return (
              <div key={zk} style={{
                position: 'absolute', left: `${zd.x}%`, top: `${zd.y}%`,
                transform: 'translate(-50%,-50%)',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                pointerEvents: 'none', zIndex: 5,
              }}>
                <div style={{
                  width: isCurrent ? 22 : 16, height: isCurrent ? 22 : 16,
                  borderRadius: '50%',
                  border: `${isCurrent ? 2 : 1}px solid ${color}`,
                  background: isCurrent ? `${zd.color}30` : isVisited ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.02)',
                  boxShadow: isCurrent ? `0 0 12px ${zd.color}80` : 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isCurrent ? 11 : 8, transition: 'all 0.3s',
                  animation: isCurrent ? 'mm-pulse 1.8s ease-in-out infinite' : 'none',
                }}>
                  {zd.icon}
                </div>
                {clueCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 12, height: 12, borderRadius: '50%',
                    background: '#ffaa00', color: '#000',
                    fontSize: '0.4rem', fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 6px #ffaa0080',
                  }}>{clueCount}</div>
                )}
                {expanded && (
                  <div style={{
                    marginTop: 3, fontSize: '0.42rem', color,
                    textShadow: isCurrent ? `0 0 6px ${zd.color}` : 'none',
                    whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400,
                    maxWidth: 55, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {zd.label}
                  </div>
                )}
              </div>
            );
          })}

          {/* Legend (expanded only) */}
          {expanded && (
            <div style={{ position: 'absolute', bottom: 6, left: 6, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {[
                { color: accentColor, label: t.currentPos },
                { color: 'rgba(255,255,255,0.6)', label: t.investigated },
                { color: 'rgba(255,255,255,0.2)', label: t.unexplored },
                { color: '#ffaa00', label: t.clueLabel },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: item.color }} />
                  <span style={{ fontSize: '0.38rem', color: 'rgba(255,255,255,0.3)' }}>{item.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CLUES tab ── */}
      {tab === 'clues' && (
        <div style={{ maxHeight: mapH + 30, overflowY: 'auto', padding: '6px 8px' }}>
          <div style={{ fontSize: '0.48rem', color: `${accentColor}80`, marginBottom: 6, letterSpacing: '0.08em' }}>
            {t.clueDetails} ({unlockedClueObjs.length})
          </div>
          {unlockedClueObjs.length === 0 ? (
            <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 16 }}>
              {t.noClues}
            </div>
          ) : (
            unlockedClueObjs.map(clue => {
              const wc = WEIGHT_COLOR[clue.weight] || '#fff';
              return (
                <div key={clue.clue_id} style={{
                  marginBottom: 6, padding: '5px 7px',
                  border: `1px solid ${wc}25`,
                  borderLeft: `2px solid ${wc}`,
                  borderRadius: 6,
                  background: `${wc}08`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <span style={{ fontSize: 12 }}>{clue.visual_icon}</span>
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: wc }}>{clue.keyword}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.38rem', color: `${wc}70`, border: `1px solid ${wc}30`, borderRadius: 3, padding: '0 3px' }}>{clue.weight}</span>
                  </div>
                  <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                    {clue.description}
                  </div>
                  {/* Zone badge */}
                  {clueZoneMap[clue.clue_id] && zoneLayout[clueZoneMap[clue.clue_id]] && (
                    <div style={{ marginTop: 3, fontSize: '0.38rem', color: zoneLayout[clueZoneMap[clue.clue_id]].color, opacity: 0.7 }}>
                      {zoneLayout[clueZoneMap[clue.clue_id]].icon} {zoneLayout[clueZoneMap[clue.clue_id]].label}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── PLOT tab ── */}
      {tab === 'plot' && (
        <div style={{ maxHeight: mapH + 30, overflowY: 'auto', padding: '6px 8px' }}>
          <div style={{ fontSize: '0.48rem', color: `${accentColor}80`, marginBottom: 6, letterSpacing: '0.08em' }}>
            {t.plotSummary}
          </div>
          {/* Case header */}
          <div style={{
            padding: '6px 8px', marginBottom: 6,
            border: `1px solid ${accentColor}20`, borderRadius: 6,
            background: `${accentColor}08`,
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: accentColor, marginBottom: 2 }}>
              {caseData?.title || 'Unknown Case'}
            </div>
            <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.4)' }}>
              {caseData?.subtitle || ''}
            </div>
          </div>
          {/* Plot lines */}
          {plotLines.map((line, i) => (
            <div key={i} style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 4, paddingLeft: 6, borderLeft: `1px solid ${accentColor}20` }}>
              {line}
            </div>
          ))}
          {/* NPC list */}
          {caseData?.npcs?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.42rem', color: `${accentColor}60`, marginBottom: 4, letterSpacing: '0.08em' }}>◎ SUSPECTS</div>
              {caseData.npcs.map(npc => (
                <div key={npc.npc_id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <span style={{ fontSize: 12 }}>{npc.avatar}</span>
                  <div>
                    <span style={{ fontSize: '0.52rem', fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{npc.name}</span>
                    <span style={{ fontSize: '0.42rem', color: 'rgba(255,255,255,0.3)', marginLeft: 4 }}>· {npc.role}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Bottom stats ── */}
      <div style={{
        padding: '3px 8px', borderTop: `1px solid ${accentColor}15`,
        display: 'flex', justifyContent: 'space-between',
        fontSize: '0.42rem', color: `${accentColor}60`,
      }}>
        <span>🗺 {visitedZones.size}/{Object.keys(zoneLayout).length} {t.zonesLabel}</span>
        <span>🔍 {gameState?.unlocked_clues?.length || 0}</span>
        <span>⚡ {t.apLabel} {gameState?.action_points_left || 0}</span>
      </div>

      <style>{`
        @keyframes mm-pulse {
          0%,100% { box-shadow: 0 0 12px currentColor; transform: scale(1); }
          50%      { box-shadow: 0 0 20px currentColor; transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}