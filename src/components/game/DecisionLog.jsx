import React, { useRef, useEffect, useState } from 'react';

// Entry shape: { id, turn, thought, action, observation, isKeyDecision, keyReason, newClues, isTrap, timestamp }

const ACTION_COLORS = {
  search_area:        '#00e5ff',
  examine_clue:       '#00e5ff',
  analyze_forensics:  '#00e5ff',
  interrogate_npc:    '#ffaa00',
  interrogate_suspect:'#ffaa00',
  check_alibi:        '#ffaa00',
  present_evidence:   '#a3ff47',
  hack_system:        '#a78bfa',
  hack_terminal:      '#a78bfa',
  decrypt_file:       '#a78bfa',
  access_records:     '#a78bfa',
  set_trap:           '#ff9d00',
  default:            '#c0c0d0',
};

function getActionColor(action) {
  return ACTION_COLORS[action] || ACTION_COLORS.default;
}

function EntryCard({ entry, accentColor, isLatest }) {
  const [expanded, setExpanded] = useState(isLatest);
  const color = getActionColor(entry.action);

  // Determine highlight tier
  const isKey = entry.isKeyDecision;
  const isTrap = entry.isTrap;

  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${isTrap ? '#ff660050' : isKey ? '#ffaa0050' : `${accentColor}20`}`,
        background: isTrap
          ? 'rgba(255,102,0,0.06)'
          : isKey
          ? 'rgba(255,170,0,0.05)'
          : 'rgba(255,255,255,0.02)',
        marginBottom: 6,
        overflow: 'hidden',
        boxShadow: isLatest ? `0 0 12px ${accentColor}20` : 'none',
        transition: 'box-shadow 0.3s',
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        style={{ background: 'transparent', border: 'none' }}
      >
        {/* Turn badge */}
        <div style={{
          width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
          border: `1.5px solid ${isKey ? '#ffaa00' : accentColor}50`,
          background: isKey ? 'rgba(255,170,0,0.12)' : `${accentColor}10`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.55rem', fontFamily: 'monospace', fontWeight: 900,
          color: isKey ? '#ffaa00' : accentColor,
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
            {isTrap && <span style={{ color: '#ff6600' }}>🎭 </span>}
            {isKey && !isTrap && <span style={{ color: '#ffaa00' }}>⭐ </span>}
            [{entry.action?.toUpperCase() || 'UNKNOWN'}]
          </div>
          {/* Key reason pill */}
          {(isKey || isTrap) && (
            <div style={{
              fontSize: '0.5rem', fontFamily: 'monospace',
              color: isTrap ? '#ff9d00' : '#ffaa00',
              opacity: 0.8,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {entry.keyReason}
            </div>
          )}
        </div>

        {/* Clue count badge */}
        {entry.newClues?.length > 0 && (
          <div style={{
            fontSize: '0.5rem', fontFamily: 'monospace', fontWeight: 700,
            padding: '1px 5px', borderRadius: 4,
            background: '#00ff8820', border: '1px solid #00ff8840',
            color: '#00ff88', whiteSpace: 'nowrap',
          }}>
            +{entry.newClues.length} 线索
          </div>
        )}

        <span style={{ color: `${accentColor}50`, fontSize: '0.6rem' }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ padding: '0 12px 10px', borderTop: `1px solid rgba(255,255,255,0.05)` }}>
          {/* THOUGHT */}
          <Section label="THOUGHT" color="#bf5fff" icon="🧠">
            <div style={{
              fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(191,95,255,0.85)',
              lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 100,
              overflowY: 'auto',
            }}>
              {entry.thought || '—'}
            </div>
          </Section>

          {/* ACTION */}
          <Section label="ACTION" color={color} icon="▶">
            <div style={{
              fontSize: '0.62rem', fontFamily: 'monospace', color,
              fontWeight: 700, letterSpacing: '0.04em',
            }}>
              [{entry.action?.toUpperCase() || '?'}]
            </div>
          </Section>

          {/* OBSERVATION */}
          <Section label="OBSERVATION" color="#00e5ff" icon="👁️">
            <div style={{
              fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(0,229,255,0.8)',
              lineHeight: 1.55, whiteSpace: 'pre-wrap', maxHeight: 80,
              overflowY: 'auto',
            }}>
              {entry.observation || '—'}
            </div>
          </Section>

          {/* New clues */}
          {entry.newClues?.length > 0 && (
            <div style={{
              marginTop: 5, padding: '4px 8px', borderRadius: 6,
              background: 'rgba(0,255,136,0.06)', border: '1px solid rgba(0,255,136,0.15)',
            }}>
              <div style={{ fontSize: '0.55rem', color: '#00ff88', fontFamily: 'monospace', marginBottom: 2 }}>
                🔍 新获线索
              </div>
              {entry.newClues.map((c, i) => (
                <div key={i} style={{ fontSize: '0.6rem', fontFamily: 'monospace', color: 'rgba(0,255,136,0.7)' }}>
                  · {c}
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
        {icon} {label}
      </div>
      {children}
    </div>
  );
}

export default function DecisionLog({ entries, accentColor }) {
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
          ◈ 决策日志 · DECISION LOG
        </div>
        <div className="flex gap-3" style={{ fontSize: '0.52rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
          <span>{entries.length} 轮次</span>
          <span style={{ color: '#ffaa00' }}>⭐ {keyCount} 关键决策</span>
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
            执行首次循环后<br />决策记录将显示在此
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
