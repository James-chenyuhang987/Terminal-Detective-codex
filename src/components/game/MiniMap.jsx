import React, { useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon, { IconText } from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';

const DEFAULT_ZONE_LAYOUT = {
  zone_datacenter: { x: 50, y: 18, label: '数据中心', labelEn: 'Data Center', sublabel: '案发现场', sublabelEn: 'Crime Scene', icon: '💻', color: '#c77c78' },
  zone_lobby:      { x: 20, y: 60, label: '大堂', labelEn: 'Lobby', sublabel: '监控中心', sublabelEn: 'Surveillance', icon: '📹', color: '#709f9a' },
  zone_lab:        { x: 80, y: 60, label: '私人实验室', labelEn: 'Private Lab', sublabel: '黑客入口', sublabelEn: 'Hack Entry', icon: '🔬', color: '#9b9aae' },
  zone_balcony:    { x: 50, y: 85, label: '天台阳台', labelEn: 'Roof Balcony', sublabel: '逃离路线', sublabelEn: 'Escape Route', icon: '🌃', color: '#c19a63' },
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
const WEIGHT_COLOR = { CRITICAL: '#c77c78', HIGH: '#c19a63', MEDIUM: '#c19a63', LOW: '#709f9a', HIDDEN: '#9b9aae' };

export default function MiniMap({ gameState, caseData, agentPath, accentColor: legacyAccentColor }) {
  const { t, lang } = useLang();
  const accentColor = noirColor(legacyAccentColor);
  const zh = lang !== 'en';
  const [tab, setTab] = useState('map'); // 'map' | 'clues' | 'plot'
  const [expanded, setExpanded] = useState(false);

  const zoneLayout = Object.fromEntries(Object.entries(caseData?.zone_layout || DEFAULT_ZONE_LAYOUT)
    .map(([id, zone]) => [id, { ...zone, color: noirColor(zone.color) }]));
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
        caseData?.victim ? `◎ ${zh ? '被害人' : 'Victim'}: ${caseData.victim}` : '',
        caseData?.location ? `◎ ${zh ? '地点' : 'Location'}: ${caseData.location}` : '',
      ].filter(Boolean);

  return (
    <div style={{
      width: W, fontFamily: 'monospace',
      background: 'rgba(2,6,18,0.94)',
      border: `1px solid ${accentColor}35`,
      borderRadius: 12, overflow: 'hidden',
      backdropFilter: 'blur(10px)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
      transition: 'width 0.2s ease, border-color 0.2s ease',
    }}>
      {/* ── Header ── */}
      <button
        type="button"
        className="flex items-center justify-between w-full px-2 py-1 cursor-pointer select-none"
        style={{ border: 0, borderBottom: `1px solid ${accentColor}20`, background: `${accentColor}0a`, fontFamily: 'inherit' }}
        onClick={() => setExpanded(e => !e)}
        aria-expanded={expanded}
      >
        <span style={{ fontSize: '0.55rem', color: accentColor, fontWeight: 700, letterSpacing: '0.1em' }}>
          <IconText text={t.minimap} />
        </span>
        <span aria-hidden="true" style={{ fontSize: '0.6rem', color: `${accentColor}60` }}>
          {expanded ? '−' : '+'}
        </span>
      </button>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${accentColor}15` }}>
        {[
          { key: 'map', icon: 'map', label: zh ? '地图' : 'Map' },
          { key: 'clues', icon: 'search', label: zh ? '线索' : 'Clues' },
          { key: 'plot', icon: 'clipboard', label: zh ? '案情' : 'Case' },
        ].map(tb => (
          <button
            type="button"
            key={tb.key}
            onClick={() => setTab(tb.key)}
            aria-pressed={tab === tb.key}
            title={tb.label}
            style={{
              flex: 1, padding: '3px 0', fontSize: '0.65rem',
              fontFamily: 'monospace', cursor: 'pointer', border: 'none',
              background: tab === tb.key ? `${accentColor}18` : 'transparent',
              color: tab === tb.key ? accentColor : `${accentColor}50`,
              borderBottom: tab === tb.key ? `2px solid ${accentColor}` : '2px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <Icon name={tb.icon} size={13} /> <span style={{ fontSize: '0.5rem' }}>{tb.label}</span>
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
                  color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: isCurrent ? 11 : 8, transition: 'border-color 0.2s, background-color 0.2s',
                }}>
                  <Icon name={zd.icon} size={isCurrent ? 13 : 10} label={expanded ? undefined : (zh ? zd.label : (zd.labelEn || zd.label))} />
                </div>
                {clueCount > 0 && (
                  <div style={{
                    position: 'absolute', top: -4, right: -4,
                    width: 12, height: 12, borderRadius: '50%',
                    background: '#c19a63', color: '#000',
                    fontSize: '0.4rem', fontWeight: 900,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{clueCount}</div>
                )}
                {expanded && (
                  <div style={{
                    marginTop: 3, fontSize: '0.42rem', color,
                    whiteSpace: 'nowrap', fontWeight: isCurrent ? 700 : 400,
                    maxWidth: 55, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    <IconText text={zh ? zd.label : (zd.labelEn || zd.label)} />
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
                { color: '#c19a63', label: t.clueLabel },
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
            <IconText text={t.clueDetails} /> ({unlockedClueObjs.length})
          </div>
          {unlockedClueObjs.length === 0 ? (
            <div style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.25)', textAlign: 'center', paddingTop: 16 }}>
              <IconText text={t.noClues} />
            </div>
          ) : (
            unlockedClueObjs.map(clue => {
              const wc = noirColor(WEIGHT_COLOR[clue.weight] || '#fff');
              return (
                <div key={clue.clue_id} style={{
                  marginBottom: 6, padding: '5px 7px',
                  border: `1px solid ${wc}25`,
                  borderLeft: `2px solid ${wc}`,
                  borderRadius: 6,
                  background: `${wc}08`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                    <Icon name={clue.visual_icon} size={14} style={{ color: wc }} />
                    <span style={{ fontSize: '0.55rem', fontWeight: 700, color: wc }}>{clue.keyword}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.38rem', color: `${wc}70`, border: `1px solid ${wc}30`, borderRadius: 3, padding: '0 3px' }}>{clue.weight}</span>
                  </div>
                  <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>
                    {clue.description}
                  </div>
                  {/* Zone badge */}
                  {clueZoneMap[clue.clue_id] && zoneLayout[clueZoneMap[clue.clue_id]] && (
                    <div style={{ marginTop: 3, fontSize: '0.38rem', color: zoneLayout[clueZoneMap[clue.clue_id]].color, opacity: 0.7 }}>
                      <Icon name={zoneLayout[clueZoneMap[clue.clue_id]].icon} />{' '}
                      <IconText text={zh
                        ? zoneLayout[clueZoneMap[clue.clue_id]].label
                        : (zoneLayout[clueZoneMap[clue.clue_id]].labelEn || zoneLayout[clueZoneMap[clue.clue_id]].label)} />
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
            <IconText text={t.plotSummary} />
          </div>
          {/* Case header */}
          <div style={{
            padding: '6px 8px', marginBottom: 6,
            border: `1px solid ${accentColor}20`, borderRadius: 6,
            background: `${accentColor}08`,
          }}>
            <div style={{ fontSize: '0.6rem', fontWeight: 700, color: accentColor, marginBottom: 2 }}>
              <IconText text={caseData?.title || (zh ? '未知案件' : 'Unknown Case')} />
            </div>
            <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.4)' }}>
              <IconText text={caseData?.subtitle || ''} />
            </div>
          </div>
          {/* Plot lines */}
          {plotLines.map((line, i) => (
            <div key={i} style={{ fontSize: '0.48rem', color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, marginBottom: 4, paddingLeft: 6, borderLeft: `1px solid ${accentColor}20` }}>
              <IconText text={line} />
            </div>
          ))}
          {/* NPC list */}
          {caseData?.npcs?.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: '0.42rem', color: `${accentColor}60`, marginBottom: 4, letterSpacing: '0.08em' }}>
                <Icon name="users" /> {zh ? '相关人员' : 'PERSONS OF INTEREST'}
              </div>
              {caseData.npcs.map(npc => (
                <div key={npc.npc_id} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                  <Icon name={npc.avatar} size={14} />
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
        <span><Icon name="map" /> {visitedZones.size}/{Object.keys(zoneLayout).length} {t.zonesLabel}</span>
        <span><Icon name="search" label={zh ? '线索' : 'Clues'} /> {gameState?.unlocked_clues?.length || 0}</span>
        <span><Icon name="bolt" /> {t.apLabel} {gameState?.action_points_left || 0}</span>
      </div>
    </div>
  );
}
