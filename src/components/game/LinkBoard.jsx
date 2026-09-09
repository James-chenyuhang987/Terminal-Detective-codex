import React, { useState, useRef, useCallback } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';

// 推理连线板 — 拖拽两条已解锁线索，由受保护的确定性规则判定有效性。
const WEIGHT_COLORS = { CRITICAL: '#c77c78', HIGH: '#c19a63', MEDIUM: '#709f9a', LOW: '#9b9aae' };

export default function LinkBoard({ clues, unlockedIds, linkedPairs, onLink, isChecking, accentColor: _accentColor }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const unlocked = clues.filter(c => unlockedIds.includes(c.clue_id));
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const [dragFrom, setDragFrom] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);

  const getCenter = useCallback((clueId) => {
    const el = nodeRefs.current[clueId];
    const box = containerRef.current;
    if (!el || !box) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height / 2 };
  }, []);

  const handlePointerDown = (e, clueId) => {
    if (isChecking) return;
    e.preventDefault();
    setDragFrom(clueId);
    const b = containerRef.current.getBoundingClientRect();
    setDragPos({ x: e.clientX - b.left, y: e.clientY - b.top });
  };

  const handlePointerMove = (e) => {
    if (!dragFrom) return;
    const b = containerRef.current.getBoundingClientRect();
    setDragPos({ x: e.clientX - b.left, y: e.clientY - b.top });
    // detect hover target
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const node = el?.closest?.('[data-clue-id]');
    const id = node?.getAttribute('data-clue-id');
    setHoverTarget(id && id !== dragFrom ? id : null);
  };

  const handlePointerUp = () => {
    if (dragFrom && hoverTarget && hoverTarget !== dragFrom) {
      const already = linkedPairs.some(p =>
        (p.a === dragFrom && p.b === hoverTarget) || (p.a === hoverTarget && p.b === dragFrom));
      if (!already) onLink(dragFrom, hoverTarget);
    }
    setDragFrom(null);
    setDragPos(null);
    setHoverTarget(null);
  };

  const fromCenter = dragFrom ? getCenter(dragFrom) : null;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ fontFamily: 'monospace' }}>
      <div style={{ padding: '8px 10px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#709f9a', fontWeight: 700, letterSpacing: '0.15em' }}>
          <Icon name="link" /> {zh ? '推理连线' : 'LINK BOARD'}
        </div>
        <div style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.35)', marginTop: 3, lineHeight: 1.6 }}>
          {zh ? '按住一条线索拖向另一条线索建立推理连接' : 'Drag one clue onto another to create a deduction link'}<br/>{zh ? 'AI 将判定逻辑是否成立' : 'The AI will validate the logical relationship'}
        </div>
      </div>

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{ flex: 1, position: 'relative', overflowY: 'auto', padding: '8px 10px', touchAction: 'none' }}
      >
        {/* SVG overlay: existing links + drag line */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
          {linkedPairs.map((p, i) => {
            const a = getCenter(p.a), b = getCenter(p.b);
            const color = p.valid ? '#8aaa91' : '#c77c78';
            return (
              <g key={i}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={color} strokeWidth={p.valid ? 2 : 1} strokeDasharray={p.valid ? 'none' : '4 4'}
                  opacity={0.7} />
                <circle cx={(a.x + b.x) / 2} cy={(a.y + b.y) / 2} r={5}
                  fill="rgba(2,8,20,0.9)" stroke={color} strokeWidth={1} />
                <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 + 2.5} textAnchor="middle" fontSize={6} fill={color}>
                  {p.valid ? '✓' : '✕'}
                </text>
              </g>
            );
          })}
          {dragFrom && fromCenter && dragPos && (
            <line x1={fromCenter.x} y1={fromCenter.y} x2={dragPos.x} y2={dragPos.y}
              stroke="#709f9a" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.9} />
          )}
        </svg>

        {unlocked.length < 2 ? (
          <div style={{ textAlign: 'center', marginTop: 40, fontSize: '0.52rem', color: 'rgba(255,255,255,0.25)' }}>
            {zh ? '至少需要 2 条已解锁线索' : 'AT LEAST 2 UNLOCKED CLUES ARE REQUIRED'}<br/>{zh ? '才能开始推理连线' : 'TO CREATE A DEDUCTION LINK'}
          </div>
        ) : (
          unlocked.map(clue => {
            const isSource = dragFrom === clue.clue_id;
            const isTarget = hoverTarget === clue.clue_id;
            const wColor = noirColor(WEIGHT_COLORS[clue.weight] || '#709f9a');
            return (
              <div
                key={clue.clue_id}
                data-clue-id={clue.clue_id}
                ref={el => { nodeRefs.current[clue.clue_id] = el; }}
                onPointerDown={e => handlePointerDown(e, clue.clue_id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', marginBottom: 6, borderRadius: 8,
                  border: `1px solid ${isTarget ? '#709f9a' : isSource ? wColor : wColor + '35'}`,
                  background: isTarget ? 'rgba(112, 159, 154,0.15)' : isSource ? `${wColor}18` : 'rgba(255,255,255,0.03)',
                  cursor: isChecking ? 'wait' : 'grab',
                  userSelect: 'none', position: 'relative', zIndex: 2,
                  boxShadow: isTarget || isSource ? `inset 2px 0 0 ${wColor}` : 'none',
                  transition: 'border-color 0.15s, background 0.15s, box-shadow 0.15s',
                }}
              >
                <Icon name={clue.visual_icon} size={18} style={{ color: wColor }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.56rem', fontWeight: 700, color: wColor }}>{clue.keyword}</div>
                  <div style={{
                    fontSize: '0.42rem', color: 'rgba(255,255,255,0.35)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{clue.description}</div>
                </div>
                <span style={{ fontSize: '0.4rem', color: 'rgba(255,255,255,0.2)' }}>⠿</span>
              </div>
            );
          })
        )}
      </div>

      {isChecking && (
        <div role="status" style={{
          padding: '8px', textAlign: 'center', fontSize: '0.5rem', color: '#709f9a',
          borderTop: '1px solid rgba(112, 159, 154,0.2)',
        }}>
          <Icon name="refresh" /> {zh ? '规则正在验证推理链…' : 'RULES ARE VALIDATING THE DEDUCTION…'}
        </div>
      )}
    </div>
  );
}
