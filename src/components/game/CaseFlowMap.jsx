import React, { useState, useRef, useCallback, useEffect } from 'react';
import { PRIORITY_ACTIONS, normalizePriorityList } from '@/game/teamConfig';
import { useLang } from '@/lib/lang.jsx';

// ── Static zone layout positions (% of container) ────────────────────────────
const ZONE_LAYOUT = {
  zone_datacenter: { x: 50, y: 20, label: '数据中心', labelEn: 'DATA CENTER', sublabel: '案发现场', sublabelEn: 'CRIME SCENE', icon: '💻', color: '#ff3860' },
  zone_lobby:      { x: 20, y: 60, label: '大堂', labelEn: 'LOBBY', sublabel: '监控中心', sublabelEn: 'SECURITY HUB', icon: '📹', color: '#00e5ff' },
  zone_lab:        { x: 80, y: 60, label: '私人实验室', labelEn: 'PRIVATE LAB', sublabel: '黑客入口', sublabelEn: 'HACK ENTRY', icon: '🔬', color: '#a78bfa' },
  zone_balcony:    { x: 50, y: 85, label: '天台阳台', labelEn: 'ROOFTOP', sublabel: '逃离路线', sublabelEn: 'ESCAPE ROUTE', icon: '🌃', color: '#ffaa00' },
};

const ZONE_CONNECTIONS = [
  ['zone_datacenter', 'zone_lobby'],
  ['zone_datacenter', 'zone_lab'],
  ['zone_datacenter', 'zone_balcony'],
  ['zone_lobby',      'zone_balcony'],
  ['zone_lab',        'zone_balcony'],
];

const VISIT_COLORS = {
  unvisited:  { border: 'rgba(255,255,255,0.15)', bg: 'rgba(255,255,255,0.03)', text: 'rgba(255,255,255,0.35)' },
  current:    { border: '#00ff88', bg: 'rgba(0,255,136,0.12)', text: '#00ff88' },
  visited:    { border: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.06)', text: 'rgba(255,255,255,0.7)' },
  key:        { border: '#ffaa00', bg: 'rgba(255,170,0,0.12)', text: '#ffaa00' },
};

// ── Edge line between two zones ───────────────────────────────────────────────
function EdgeLine({ fromKey, toKey, positions, traveled, accentColor }) {
  const from = positions[fromKey];
  const to   = positions[toKey];
  if (!from || !to) return null;

  const isTraveled = traveled.some(
    ([a, b]) => (a === fromKey && b === toKey) || (a === toKey && b === fromKey)
  );

  return (
    <line
      x1={`${from.x}%`} y1={`${from.y}%`}
      x2={`${to.x}%`}   y2={`${to.y}%`}
      stroke={isTraveled ? accentColor : 'rgba(255,255,255,0.08)'}
      strokeWidth={isTraveled ? 2 : 1}
      strokeDasharray={isTraveled ? '6 3' : '4 6'}
      style={{ filter: isTraveled ? `drop-shadow(0 0 4px ${accentColor})` : 'none', transition: 'all 0.5s' }}
    />
  );
}

// ── Agent path trail ──────────────────────────────────────────────────────────
function PathTrail({ path, positions, accentColor }) {
  if (path.length < 2) return null;
  const pts = path.map(z => positions[z]).filter(Boolean);
  if (pts.length < 2) return null;
  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x}% ${p.y}%`).join(' ');
  return (
    <path
      d={d}
      fill="none"
      stroke={accentColor}
      strokeWidth="2.5"
      strokeDasharray="8 4"
      opacity="0.6"
      style={{ filter: `drop-shadow(0 0 6px ${accentColor})` }}
    />
  );
}

// ── Zone node card ────────────────────────────────────────────────────────────
function ZoneNode({
  definition, pos, visitCount, isCurrentZone, clues, feedback, isDragging,
  onPointerDown,
}) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const zDef  = definition || {};
  const color = zDef.color || '#00e5ff';
  const hasKey = visitCount > 0 && clues.length > 0;

  let state = 'unvisited';
  if (isCurrentZone) state = 'current';
  else if (hasKey) state = 'key';
  else if (visitCount > 0) state = 'visited';

  const c = VISIT_COLORS[state];

  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'absolute',
        left: `${pos.x}%`,
        top:  `${pos.y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: isDragging ? 20 : 5,
        cursor: 'grab',
        userSelect: 'none',
        touchAction: 'none',
        minWidth: 110,
      }}
    >
      {/* Pulse ring for current zone */}
      {isCurrentZone && (
        <div style={{
          position: 'absolute', inset: -12,
          borderRadius: '50%',
          border: `2px solid ${color}`,
          animation: 'zone-pulse 1.8s ease-in-out infinite',
          pointerEvents: 'none',
        }} />
      )}

      {/* Main card */}
      <div style={{
        border: `1.5px solid ${isCurrentZone ? color : c.border}`,
        background: isCurrentZone ? `rgba(0,255,136,0.10)` : c.bg,
        borderRadius: 12,
        padding: '8px 12px',
        boxShadow: isCurrentZone
          ? `0 0 20px ${color}60, 0 0 40px ${color}20`
          : hasKey
          ? `0 0 12px ${color}30`
          : 'none',
        transition: 'all 0.3s',
        backdropFilter: 'blur(4px)',
      }}>
        {/* Icon + label */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{ fontSize: 16 }}>{zDef.icon}</span>
          <div>
            <div style={{
              fontSize: '0.65rem', fontWeight: 900, fontFamily: 'monospace',
              color: isCurrentZone ? color : c.text,
              textShadow: isCurrentZone ? `0 0 8px ${color}` : 'none',
              letterSpacing: '0.04em',
            }}>
              {zh ? zDef.label : (zDef.labelEn || zDef.label)}
            </div>
            <div style={{ fontSize: '0.5rem', fontFamily: 'monospace', color: 'rgba(255,255,255,0.3)' }}>
              {zh ? zDef.sublabel : (zDef.sublabelEn || zDef.sublabel)}
            </div>
          </div>
        </div>

        {/* Visit count + clue badge */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {visitCount > 0 && (
            <span style={{
              fontSize: '0.5rem', fontFamily: 'monospace',
              color: isCurrentZone ? color : 'rgba(255,255,255,0.45)',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 4, padding: '1px 5px',
            }}>
              ×{visitCount} {zh ? '调查' : 'VISITS'}
            </span>
          )}
          {clues.length > 0 && (
            <span style={{
              fontSize: '0.5rem', fontFamily: 'monospace',
              color: '#ffaa00', fontWeight: 700,
              background: 'rgba(255,170,0,0.12)',
              borderRadius: 4, padding: '1px 5px',
              boxShadow: '0 0 6px #ffaa0050',
            }}>
              🔍 {clues.length} {zh ? '线索' : 'CLUES'}
            </span>
          )}
        </div>

        {/* Agent feedback tooltip */}
        {feedback && (
          <div style={{
            marginTop: 6,
            fontSize: '0.5rem', fontFamily: 'monospace',
            color: '#00ff88',
            borderTop: '1px solid rgba(0,255,136,0.2)',
            paddingTop: 4,
            lineHeight: 1.4,
            maxWidth: 130,
            wordBreak: 'break-all',
          }}>
            ▶ {feedback}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Agent avatar following current zone ───────────────────────────────────────
function AgentAvatar({ pos, agentStrategy, accentColor }) {
  const icon = agentStrategy?.team?.[0] ? '👁️' : '🕵️';
  return (
    <div style={{
      position: 'absolute',
      left: `${pos.x}%`,
      top:  `${pos.y}%`,
      transform: 'translate(-50%, -160%)',
      zIndex: 10,
      pointerEvents: 'none',
      animation: 'agent-float 2.5s ease-in-out infinite',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: `2px solid ${accentColor}`,
        background: `radial-gradient(circle, ${accentColor}30 0%, transparent 70%)`,
        boxShadow: `0 0 16px ${accentColor}80`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16,
      }}>
        {icon}
      </div>
      <div style={{
        width: 2, height: 12,
        background: `linear-gradient(to bottom, ${accentColor}, transparent)`,
        margin: '0 auto',
      }} />
    </div>
  );
}

// ── Main CaseFlowMap component ────────────────────────────────────────────────
export default function CaseFlowMap({
  gameState,
  caseData,
  agentPath,        // string[] of zone keys in visit order
  zoneFeedback,     // { [zoneKey]: string } agent stop feedback
  accentColor,
  agentStrategy,
  onPriorityChange, // callback(reorderedPriorityList)
}) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const containerRef = useRef(null);
  const zoneLayout = caseData?.zone_layout || ZONE_LAYOUT;
  const zoneConnections = caseData?.zone_connections || ZONE_CONNECTIONS;

  const makePositions = useCallback(() => Object.fromEntries(
    Object.entries(zoneLayout).map(([key, value]) => [key, { x: value.x, y: value.y }]),
  ), [zoneLayout]);

  // Node positions start from the selected case and remain draggable.
  const [positions, setPositions] = useState(makePositions);

  const [dragging, setDragging]   = useState(null); // { key, ox, oy }
  const [priority, setPriority] = useState(() => normalizePriorityList(agentStrategy?.priority_list));

  useEffect(() => {
    setPositions(makePositions());
    setPriority(normalizePriorityList(agentStrategy?.priority_list));
    setDragging(null);
  }, [agentStrategy?.priority_list, caseData?.case_id, makePositions, zoneLayout]);

  // ── Build derived data ────────────────────────────────────────────────────
  const visitCounts = {};
  const traveledEdges = [];
  agentPath.forEach((z, i) => {
    visitCounts[z] = (visitCounts[z] || 0) + 1;
    if (i > 0) traveledEdges.push([agentPath[i - 1], z]);
  });

  const currentZone = agentPath[agentPath.length - 1] || null;

  // Clues per zone (map clue zones from current_zone metadata or fallback heuristics)
  const zoneClues = {};
  Object.keys(zoneLayout).forEach(zk => { zoneClues[zk] = []; });
  const clueZoneMap = {};
  Object.entries(caseData?.zone_clue_map || {}).forEach(([zone, clueIds]) => {
    (clueIds || []).forEach(id => { clueZoneMap[id] = zone; });
  });
  (gameState.unlocked_clues || []).forEach(id => {
    const z = clueZoneMap[id];
    if (z && zoneClues[z]) zoneClues[z].push(id);
  });

  // ── Drag handling ─────────────────────────────────────────────────────────
  const onPointerDown = useCallback((key, e) => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    setDragging({
      key,
      ox: ((clientX - rect.left) / rect.width) * 100 - positions[key].x,
      oy: ((clientY - rect.top) / rect.height) * 100 - positions[key].y,
    });
  }, [positions]);

  useEffect(() => {
    if (!dragging) return;
    const move = (e) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const nx = Math.max(8, Math.min(92, ((clientX - rect.left) / rect.width) * 100 - dragging.ox));
      const ny = Math.max(8, Math.min(92, ((clientY - rect.top) / rect.height) * 100 - dragging.oy));
      setPositions(p => ({ ...p, [dragging.key]: { x: nx, y: ny } }));
    };
    const up = () => setDragging(null);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [dragging]);

  // ── Priority list drag-to-reorder ─────────────────────────────────────────
  const [dragPri, setDragPri] = useState(null);
  const [dragOverPri, setDragOverPri] = useState(null);

  const handlePriDrop = (targetKey) => {
    if (!dragPri || dragPri === targetKey) return;
    const next = [...priority];
    const from = next.indexOf(dragPri);
    const to   = next.indexOf(targetKey);
    next.splice(from, 1);
    next.splice(to, 0, dragPri);
    setPriority(next);
    onPriorityChange?.(next);
    setDragPri(null);
    setDragOverPri(null);
  };

  const movePriority = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= priority.length) return;
    const next = [...priority];
    [next[index], next[target]] = [next[target], next[index]];
    setPriority(next);
    onPriorityChange?.(next);
  };

  const currentPos = currentZone ? positions[currentZone] : null;

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'monospace' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b"
        style={{ borderColor: `${accentColor}20`, background: 'rgba(0,0,0,0.5)' }}>
        <div style={{ fontSize: '0.6rem', color: accentColor, fontWeight: 700, letterSpacing: '0.12em' }}>
          ◈ {zh ? '案件流程图 · 拖拽节点调整优先级' : 'CASE FLOW MAP · DRAG NODES TO REARRANGE'}
        </div>
        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.3)' }}>
          {agentPath.length} {zh ? '步移动' : 'MOVES'} · {Object.keys(visitCounts).filter(k => visitCounts[k]).length} {zh ? '区域勘察' : 'ZONES VISITED'}
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1" style={{ minHeight: 320, overflow: 'hidden' }}>
        {/* Grid bg */}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 0, opacity: 0.12 }}>
          <defs>
            <pattern id="cfm-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke={accentColor} strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#cfm-grid)" />
        </svg>

        {/* SVG edges + path */}
        <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1, pointerEvents: 'none' }}>
          {zoneConnections.map(([a, b]) => (
            <EdgeLine key={`${a}-${b}`} fromKey={a} toKey={b}
              positions={positions} traveled={traveledEdges} accentColor={accentColor} />
          ))}
          <PathTrail path={agentPath} positions={positions} accentColor={accentColor} />
        </svg>

        {/* Zone nodes */}
        {Object.keys(zoneLayout).map(zk => (
          <ZoneNode
            key={zk}
            definition={zoneLayout[zk]}
            pos={positions[zk]}
            visitCount={visitCounts[zk] || 0}
            isCurrentZone={zk === currentZone}
            clues={zoneClues[zk]}
            feedback={zoneFeedback?.[zk] || null}
            isDragging={dragging?.key === zk}
            onPointerDown={(e) => onPointerDown(zk, e)}
          />
        ))}

        {/* Agent avatar */}
        {currentPos && (
          <AgentAvatar pos={currentPos} agentStrategy={agentStrategy} accentColor={accentColor} />
        )}
      </div>

      {/* Priority list */}
      <div className="border-t px-3 py-2" style={{ borderColor: `${accentColor}20`, background: 'rgba(0,0,0,0.4)' }}>
        <div style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.35)', marginBottom: 4, letterSpacing: '0.08em' }}>
          ◎ {zh ? '调查优先级（拖拽排序）' : 'INVESTIGATION PRIORITY (DRAG TO SORT)'}
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {priority.map((actionId, idx) => {
            const action = PRIORITY_ACTIONS.find(item => item.id === actionId);
            if (!action) return null;
            const isOver = dragOverPri === actionId;
            return (
              <div
                key={actionId}
                draggable
                onDragStart={() => setDragPri(actionId)}
                onDragOver={e => { e.preventDefault(); setDragOverPri(actionId); }}
                onDragLeave={() => setDragOverPri(null)}
                onDrop={() => handlePriDrop(actionId)}
                onDragEnd={() => { setDragPri(null); setDragOverPri(null); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '3px 8px', borderRadius: 6,
                  border: `1px solid ${isOver ? action.color : 'rgba(255,255,255,0.1)'}`,
                  background: isOver ? `${action.color}20` : 'rgba(255,255,255,0.04)',
                  cursor: 'grab',
                  fontSize: '0.55rem', color: 'rgba(255,255,255,0.55)',
                  transition: 'all 0.15s',
                  boxShadow: isOver ? `0 0 8px ${action.color}50` : 'none',
                }}
              >
                <span style={{ opacity: 0.4 }}>#{idx + 1}</span>
                <span>{action.icon}</span>
                <span style={{ color: action.color }}>{zh ? action.label : action.labelEn}</span>
                <span className="td-priority-mobile-buttons" style={{ display: 'none', gap: 2 }}>
                  <button type="button" aria-label={zh ? '上移' : 'Move up'} disabled={idx === 0} onClick={() => movePriority(idx, -1)}>↑</button>
                  <button type="button" aria-label={zh ? '下移' : 'Move down'} disabled={idx === priority.length - 1} onClick={() => movePriority(idx, 1)}>↓</button>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @keyframes zone-pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50%       { transform: scale(1.3); opacity: 0.15; }
        }
        @keyframes agent-float {
          0%, 100% { transform: translate(-50%, -160%); }
          50%       { transform: translate(-50%, -175%); }
        }
      `}</style>
    </div>
  );
}
