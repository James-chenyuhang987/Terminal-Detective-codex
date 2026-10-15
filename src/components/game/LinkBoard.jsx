import React, { useState, useRef, useLayoutEffect } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon';
import { noirColor } from '@/components/ui/palette';
import EvidenceReference from '@/components/game/investigation/EvidenceReference';
import { localizedInvestigationText } from '@/game/investigationChoices';
import HypothesisNotebook from '@/components/game/investigation/HypothesisNotebook';

// 推理连线板 — 拖拽两条已解锁线索，由受保护的确定性规则判定有效性。
const WEIGHT_COLORS = { CRITICAL: '#c77c78', HIGH: '#c19a63', MEDIUM: '#709f9a', LOW: '#9b9aae' };

export default function LinkBoard({ clues, unlockedIds, linkedPairs, onLink, isChecking, accentColor: _accentColor, relationsEnabled = false,
  draft, onDraftChange, feedback, sources = {}, expertNotes = {},
  hypotheses = [], onSaveHypothesis, onRemoveHypothesis, hypothesisStatus }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const unlocked = clues.filter(c => unlockedIds.includes(c.clue_id));
  const containerRef = useRef(null);
  const nodeRefs = useRef({});
  const dragRef = useRef(null);
  const [nodeCenters, setNodeCenters] = useState({});
  const [dragFrom, setDragFrom] = useState(null);
  const [dragPos, setDragPos] = useState(null);
  const [hoverTarget, setHoverTarget] = useState(null);
  const [localDraft, setLocalDraft] = useState({ relation: 'supports', firstClue: '', secondClue: '' });
  const [localFeedback, setLocalFeedback] = useState(null);
  const [hypothesisNote, setHypothesisNote] = useState('');
  const [hypothesisSaved, setHypothesisSaved] = useState(false);
  const { relation, firstClue, secondClue } = draft || localDraft;
  const changeDraft = updates => {
    const next = { ...(draft || localDraft), ...updates };
    if (onDraftChange) onDraftChange(next);
    else setLocalDraft(next);
    setLocalFeedback(null);
    setHypothesisNote('');
    setHypothesisSaved(false);
  };
  const resultFeedback = localFeedback || feedback;
  const feedbackText = localizedInvestigationText(resultFeedback?.text, lang);
  const knownId = id => unlocked.some(clue => clue.clue_id === id);

  const submitLink = (a, b) => {
    if (isChecking || !knownId(a) || !knownId(b) || a === b) return;
    changeDraft({ firstClue: a, secondClue: b });
    const already = linkedPairs.find(p =>
      (relationsEnabled ? p.valid && p.relation_type === relation && (relation === 'precedes'
        ? p.a === a && p.b === b : (p.a === a && p.b === b) || (p.a === b && p.b === a))
        : (p.a === a && p.b === b) || (p.a === b && p.b === a)));
    if (already) {
      setLocalFeedback({ valid: already.valid, text: already.label || {
        zh: '这条关系已有记录，可在调查档案中回看。',
        en: 'This relationship is already recorded. Review it in the case journal.',
      } });
    } else {
      setLocalFeedback(null);
      onLink(a, b, ...(relationsEnabled ? [relation] : []));
    }
  };

  useLayoutEffect(() => {
    const box = containerRef.current;
    if (!box) return;
    const measure = () => {
      const bounds = box.getBoundingClientRect();
      const next = {};
      for (const clue of clues) {
        if (!unlockedIds.includes(clue.clue_id)) continue;
        const element = nodeRefs.current[clue.clue_id];
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        next[clue.clue_id] = {
          x: rect.left - bounds.left + box.scrollLeft + rect.width / 2,
          y: rect.top - bounds.top + box.scrollTop + rect.height / 2,
        };
      }
      setNodeCenters(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next);
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(box);
    Object.values(nodeRefs.current).filter(Boolean).forEach(element => observer?.observe(element));
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [clues, unlockedIds]);

  const getCenter = clueId => nodeCenters[clueId];
  const pointerPosition = event => {
    const box = containerRef.current;
    const bounds = box.getBoundingClientRect();
    return { x: event.clientX - bounds.left + box.scrollLeft, y: event.clientY - bounds.top + box.scrollTop };
  };
  const pointerTarget = event => {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    const node = element?.closest?.('[data-clue-id]');
    const id = node?.getAttribute('data-clue-id');
    return node && containerRef.current?.contains(node) && knownId(id) ? id : null;
  };
  const clearDrag = event => {
    const active = dragRef.current;
    if (!active || (event?.pointerId != null && active.pointerId !== event.pointerId)) return;
    dragRef.current = null;
    if (active.element?.hasPointerCapture?.(active.pointerId)) active.element.releasePointerCapture(active.pointerId);
    setDragFrom(null);
    setDragPos(null);
    setHoverTarget(null);
  };

  const handlePointerDown = (e, clueId) => {
    if (isChecking || dragRef.current || e.isPrimary === false || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    dragRef.current = { clueId, pointerId: e.pointerId, element: e.currentTarget };
    e.currentTarget?.setPointerCapture?.(e.pointerId);
    setDragFrom(clueId);
    setHoverTarget(null);
    setDragPos(pointerPosition(e));
  };

  const handlePointerMove = (e) => {
    const active = dragRef.current;
    if (!active || active.pointerId !== e.pointerId) return;
    setDragPos(pointerPosition(e));
    const id = pointerTarget(e);
    setHoverTarget(id !== active.clueId ? id : null);
  };

  const handlePointerUp = event => {
    const active = dragRef.current;
    if (!active || active.pointerId !== event.pointerId) return;
    // Hit-test the release itself: the last move may have happened over a
    // different clue, outside this board, or before a cancelled touch gesture.
    const target = pointerTarget(event);
    clearDrag(event);
    if (target && target !== active.clueId) submitLink(active.clueId, target);
  };

  const fromCenter = dragFrom ? getCenter(dragFrom) : null;

  return (
    <div className="td-link-workspace flex-1 flex flex-col" style={{ fontFamily: 'monospace', overflowY: 'auto', minHeight: 0 }}>
      <div style={{ padding: '8px 10px 4px', textAlign: 'center' }}>
        <div style={{ fontSize: '0.6rem', color: '#709f9a', fontWeight: 700, letterSpacing: '0.15em' }}>
          <Icon name="link" /> {zh ? '推理连线' : 'LINK BOARD'}
        </div>
        <div style={{ fontSize: '0.44rem', color: 'rgba(255,255,255,0.35)', marginTop: 3, lineHeight: 1.6 }}>
          {zh ? '选择两条证据，或拖动建立推理连接' : 'Select two clues or drag one onto another'}<br/>{zh ? '案件规则核验关系；错误关系可以修正' : 'Case rules verify the relation; incorrect relations can be revised'}
        </div>
      </div>
      {relationsEnabled && <p role="note" style={{ padding: '4px 10px', fontSize: '.68rem', color: '#9b9aae', lineHeight: 1.6 }}>{zh
        ? '核验关系不消耗 AP。同一条错误关系仅首次增加 3% 混乱，可修正；“先于”按证据一到证据二的方向核验。同一材料可能包含多个事件，请以核验结果说明的具体事件为准。'
        : 'Relations cost no AP. A wrong relation adds 3% confusion only on its first attempt and can be corrected. Precedes checks the direction from the first clue to the second. A record may contain several events; use the specific event described by the verification result.'}</p>}
      <div className="td-link-relations" data-onboarding-target="field-deduction">
        {relationsEnabled && [['supports', zh ? '支持' : 'Supports'], ['contradicts', zh ? '矛盾' : 'Contradicts'], ['precedes', zh ? '先于' : 'Precedes']].map(([id, label]) => <button type="button" key={id} disabled={isChecking} aria-pressed={relation === id} onClick={() => changeDraft({ relation: id })}>{label}</button>)}
        <label>{zh ? '证据一' : 'First clue'}<select aria-label={zh ? '证据一' : 'First clue'} value={firstClue} disabled={isChecking} onChange={event => changeDraft({ firstClue: event.target.value })}><option value="">{zh ? '请选择' : 'Choose'}</option>{unlocked.map(clue => <option key={clue.clue_id} value={clue.clue_id}>{clue.keyword}</option>)}</select></label>
        <label>{zh ? '证据二' : 'Second clue'}<select aria-label={zh ? '证据二' : 'Second clue'} value={secondClue} disabled={isChecking} onChange={event => changeDraft({ secondClue: event.target.value })}><option value="">{zh ? '请选择' : 'Choose'}</option>{unlocked.map(clue => <option key={clue.clue_id} value={clue.clue_id}>{clue.keyword}</option>)}</select></label>
        <button type="button" disabled={isChecking || !knownId(firstClue) || !knownId(secondClue) || firstClue === secondClue} onClick={() => submitLink(firstClue, secondClue)}>{zh ? '核验关系' : 'Verify relation'}</button>
      </div>
      {relationsEnabled && onSaveHypothesis && <>
        <div className="td-hypothesis-entry">
          <label>{zh ? '假说备注（可选）' : 'Hypothesis note (optional)'}<textarea maxLength={280} value={hypothesisNote} disabled={isChecking}
            onChange={event => { setHypothesisNote(event.target.value); setHypothesisSaved(false); }} /></label>
          <button type="button" disabled={isChecking || !knownId(firstClue) || !knownId(secondClue) || firstClue === secondClue}
            onClick={() => { onSaveHypothesis({ a: firstClue, b: secondClue, relation, note: hypothesisNote }); setHypothesisSaved(true); }}>
            {zh ? '先保存为待核实假说 · 免费' : 'Save unverified hypothesis · Free'}</button>
          <p>{zh ? '保存假说不会提交核验。点击“核验关系”才会请系统判定，并按现有规则处理错误关系。'
            : 'Saving does not submit a verification. “Verify relation” asks the system to judge it and applies the existing rules for incorrect relations.'}</p>
          {hypothesisSaved && <p role="status">{zh ? '笔记已记录；已有系统确认的关系请在调查档案回看。' : 'Note recorded. Review already confirmed relationships in the case journal.'}</p>}
        </div>
        <HypothesisNotebook items={hypotheses} clues={unlocked} disabled={isChecking} status={hypothesisStatus} lang={lang}
          onSelect={item => { changeDraft({ firstClue: item.a, secondClue: item.b, relation: item.relation }); setHypothesisNote(item.note); }}
          onRemove={onRemoveHypothesis} />
      </>}
      {[...new Set([firstClue, secondClue])].filter(Boolean).map(id => <div className="td-link-source" key={id}><EvidenceReference
        clue={unlocked.find(clue => clue.clue_id === id)} sourceLabel={sources[id]} expertNote={expertNotes[id]} /></div>)}
      {feedbackText && <div role="status" className={`td-link-feedback${resultFeedback.valid ? ' is-valid' : ''}`}>
        <strong>{resultFeedback.valid ? (zh ? '关系已记录' : 'Relationship recorded') : (zh ? '关系尚未成立' : 'Relationship not established')}</strong>
        <p>{feedbackText}</p>
      </div>}

      <div
        ref={containerRef}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={clearDrag}
        onLostPointerCapture={clearDrag}
        onKeyDown={event => { if (event.key === 'Escape') clearDrag(); }}
        style={{ flex: 1, minHeight: 180, position: 'relative', overflowY: 'auto', padding: '8px 10px', touchAction: 'pan-y' }}
      >
        {/* SVG overlay: existing links + drag line */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 5, overflow: 'visible' }}>
          {linkedPairs.map((p, i) => {
            const a = getCenter(p.a), b = getCenter(p.b);
            if (!a || !b) return null;
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
                <button type="button" disabled={isChecking} aria-label={`${zh ? '拖动证据' : 'Drag clue'} · ${clue.keyword}`} onPointerDown={event => handlePointerDown(event, clue.clue_id)} style={{ minWidth: 44, minHeight: 44, touchAction: 'none' }}>⠿</button>
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
