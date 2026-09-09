import React, { useRef, useEffect, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon, { IconText } from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';

// Entry shape: { id, turn, thought, action, observation, isKeyDecision, keyReason, newClues, isTrap, timestamp }

const ACTION_COLORS = {
  search_area:        '#709f9a',
  examine_clue:       '#709f9a',
  analyze_forensics:  '#709f9a',
  interrogate_npc:    '#c19a63',
  interrogate_suspect:'#c19a63',
  check_alibi:        '#c19a63',
  present_evidence:   '#8aaa91',
  hack_system:        '#9b9aae',
  hack_terminal:      '#9b9aae',
  decrypt_file:       '#9b9aae',
  access_records:     '#9b9aae',
  set_trap:           '#c19a63',
  default:            '#c0c0d0',
};

function getActionColor(action) {
  return noirColor(ACTION_COLORS[action] || ACTION_COLORS.default);
}

function EntryCard({ entry, accentColor, isLatest }) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(isLatest);
  const color = getActionColor(entry.action);

  // Determine highlight tier
  const isKey = entry.isKeyDecision;
  const isTrap = entry.isTrap;

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${isTrap ? '#c19a6350' : isKey ? '#c19a6350' : `${accentColor}20`}`,
        background: isTrap
          ? 'rgba(193, 154, 99,0.06)'
          : isKey
          ? 'rgba(193, 154, 99,0.05)'
          : 'rgba(255,255,255,0.02)',
        marginBottom: 6,
        overflow: 'hidden',
        boxShadow: isLatest ? `inset 2px 0 0 ${accentColor}90` : 'none',
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* Header row */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'transparent', border: 'none' }}
      >
        {/* Turn badge */}
        <div style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${isKey ? '#c19a63' : accentColor}50`,
          background: isKey ? 'rgba(193, 154, 99,0.12)' : `${accentColor}10`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.55rem', fontFamily: 'monospace', fontWeight: 900,
          color: isKey ? '#c19a63' : accentColor,
        }}>
          {entry.turn}
        </div>

        <div className="flex-1 min-w-0">
          {/* Action tag */}
          <div style={{
            fontSize: '0.62rem', fontFamily: 'monospace', fontWeight: 700,
            color, letterSpacing: '0.04em',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            {isTrap && <Icon name="mask" style={{ color: '#c19a63' }} />}
            {isKey && !isTrap && <Icon name="star" style={{ color: '#c19a63' }} />}
            [{entry.action?.toUpperCase() || 'UNKNOWN'}]
          </div>
          {/* Key reason pill */}
          {(isKey || isTrap) && (
            <div style={{
              fontSize: '0.5rem', fontFamily: 'monospace',
              color: isTrap ? '#c19a63' : '#c19a63',
              opacity: 0.8,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              <IconText text={entry.keyReason} />
            </div>
          )}
        </div>

        {/* Clue count badge */}
        {entry.newClues?.length > 0 && (
          <div style={{
            fontSize: '0.5rem', fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 5px', borderRadius: 4,
            background: '#8aaa9120', border: '1px solid #8aaa9140',
            color: '#8aaa91', whiteSpace: 'nowrap',
          }}>
            +{entry.newClues.length} {lang === 'zh' ? '线索' : 'CLUES'}
          </div>
        )}

        <span style={{ color: `${accentColor}50`, fontSize: '0.6rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: `1px solid rgba(255,255,255,0.05)` }}>
          {/* THOUGHT */}
          <Section label={lang === 'zh' ? '思路' : 'THOUGHT'} color="#9b9aae" icon="brain">
            <div style={{
              fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(155, 154, 174,0.85)',
              lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 100,
              overflowY: 'auto',
            }}>
              <IconText text={entry.thought || '—'} />
            </div>
          </Section>

          {/* ACTION */}
          <Section label={lang === 'zh' ? '行动' : 'ACTION'} color={color} icon="play">
            <div style={{
              fontSize: '0.62rem', fontFamily: 'monospace', color,
              fontWeight: 700, letterSpacing: '0.04em',
            }}>
              [{entry.action?.toUpperCase() || '?'}]
            </div>
          </Section>

          {/* OBSERVATION */}
          <Section label={lang === 'zh' ? '观察' : 'OBSERVATION'} color="#709f9a" icon="eye">
            <div style={{
              fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(112, 159, 154,0.8)',
              lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 80,
              overflowY: 'auto',
            }}>
              <IconText text={entry.observation || '—'} />
            </div>
          </Section>

          {/* New clues */}
          {entry.newClues?.length > 0 && (
            <div style={{
              marginTop: 5, padding: '4px 8px', borderRadius: 6,
              background: 'rgba(138, 170, 145,0.06)', border: '1px solid rgba(138, 170, 145,0.15)',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#8aaa91', fontFamily: 'monospace', marginBottom: 2 }}>
                <Icon name="search" /> {lang === 'zh' ? '新获线索' : 'NEW CLUES'}
              </div>
              {entry.newClues.map((c, i) => (
                <div key={i} style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(138, 170, 145,0.7)' }}>
                  · <IconText text={c} />
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 5, fontSize: '0.5rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.18)', textAlign: 'right' }}>
            {entry.timestamp}
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ label, color, icon, children }) {
  return (
    <div style={{ marginTop: 7 }}>
      <div style={{
        fontSize: '0.52rem', fontFamily: 'monospace', fontWeight: 700,
        color, letterSpacing: '0.12em', marginBottom: 3,
        display: 'flex', alignItems: 'center', gap: 4,
        opacity: 0.8,
      }}>
        <Icon name={icon} /> {label}
      </div>
      {children}
    </div>
  );
}

export default function DecisionLog({ entries, accentColor: legacyAccentColor }) {
  const { lang } = useLang();
  const accentColor = noirColor(legacyAccentColor);
  const zh = lang === 'zh';
  const bottomRef = useRef(null);

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [entries.length]);

  const keyCount = entries.filter(e => e.isKeyDecision || e.isTrap).length;

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div style={{
        padding: '8px 12px 6px',
        borderBottom: `1px solid ${accentColor}20`,
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: '0.6rem', fontFamily: 'monospace', fontWeight: 700,
          color: accentColor, letterSpacing: '0.1em', marginBottom: 2,
        }}>
          <Icon name="book" /> {zh ? '决策日志' : 'DECISION LOG'}
        </div>
        <div className="flex gap-3" style={{ fontSize: '0.52rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
          <span>{entries.length} {zh ? '轮次' : 'TURNS'}</span>
          <span style={{ color: '#c19a63' }}><Icon name="star" /> {keyCount} {zh ? '关键决策' : 'KEY DECISIONS'}</span>
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '8px 10px' }}>
        {entries.length === 0 ? (
          <div style={{
            textAlign: 'center', marginTop: 40,
            fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.2)',
            lineHeight: 1.8,
          }}>
            {zh ? '执行首次循环后' : 'RUN THE FIRST CYCLE'}<br />{zh ? '决策记录将显示在此' : 'DECISIONS WILL APPEAR HERE'}
          </div>
        ) : (
          entries.map((entry, i) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              accentColor={accentColor}
              isLatest={i === entries.length - 1}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
