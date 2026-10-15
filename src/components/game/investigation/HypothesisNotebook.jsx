import React from 'react';
import { hypothesisKey } from '@/game/hypothesisNotebook';
import './hypothesisNotebook.css';

export default function HypothesisNotebook({ items = [], clues = [], onSelect, onRemove, disabled, status, lang }) {
  const zh = lang === 'zh';
  const relations = zh ? { supports: '支持', contradicts: '矛盾', precedes: '先于' }
    : { supports: 'Supports', contradicts: 'Contradicts', precedes: 'Precedes' };
  const label = id => clues.find(clue => clue.clue_id === id)?.keyword || '';
  return <details className="td-hypothesis-notebook">
    <summary>{zh ? '待核实假说' : 'Unverified hypotheses'} · {items.length}</summary>
    <p>{zh ? '个人笔记，免费保存，不增加混乱。系统确认后才计入正式命题与结案评价。最多保留20条。'
      : 'Personal notes are free and add no confusion. Only system-confirmed deductions count toward closure and grades. Up to 20 notes.'}</p>
    <p role="status">{status === 'memory'
      ? (zh ? '当前仅在内存保留，刷新可能丢失。' : 'Kept in memory only; refreshing may discard these notes.')
      : (zh ? '保存在本标签页，刷新可恢复。' : 'Saved in this tab and restored after refreshing.')}</p>
    {!items.length && <p>{zh ? '选择两份证据，可先记下联系，再请系统核验。' : 'Select two clues to note a possible connection before asking the system to verify it.'}</p>}
    <ul>{items.map(item => <li key={hypothesisKey(item)}>
      <strong>{label(item.a)} · {relations[item.relation]} · {label(item.b)}</strong>
      {item.note && <p>{item.note}</p>}
      <div><button type="button" disabled={disabled} onClick={() => onSelect(item)}>{zh ? '载入对照' : 'Compare clues'}</button>
        <button type="button" disabled={disabled} aria-label={`${zh ? '移除假说' : 'Remove hypothesis'} · ${label(item.a)} · ${label(item.b)}`} onClick={() => onRemove(item)}>{zh ? '移除' : 'Remove'}</button></div>
    </li>)}</ul>
  </details>;
}
