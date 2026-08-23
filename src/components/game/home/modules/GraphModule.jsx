import { useState } from 'react';
import { ALL_CASES } from '@/game/caseData';

const CASE_ICON = { Lvl_01: '🏙️', Lvl_02: '🔬', Lvl_03: '🦋' };

function Button({ children, onClick, active }) {
  return <button type="button" onClick={onClick} style={{ minHeight: 38, border: `1px solid ${active ? '#00e5ff' : '#66889980'}`, borderRadius: 8, padding: '6px 10px', background: active ? '#00e5ff18' : 'transparent', color: active ? '#7df1ff' : '#8aa2ad', font: '10px monospace', cursor: 'pointer' }}>{children}</button>;
}

export default function GraphModule({ profile, lang }) {
  const [caseId, setCaseId] = useState(ALL_CASES[0].case_id);
  const caseData = ALL_CASES.find(item => item.case_id === caseId);
  const record = profile.case_records.find(item => item.case_id === caseId);
  const discovered = new Set(record?.discovered_clues || []);
  return <>
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>{ALL_CASES.map(item => <Button key={item.case_id} active={caseId === item.case_id} onClick={() => setCaseId(item.case_id)}>{CASE_ICON[item.case_id]} {item.case_id}</Button>)}</div>
    <div style={{ border: '1px solid #00e5ff35', borderRadius: 13, padding: 14, background: '#00e5ff08' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 9 }}>{caseData.clue_dictionary.map(clue => {
        const visible = discovered.has(clue.clue_id);
        return <div key={clue.clue_id} title={visible ? clue.description : ''} style={{ minHeight: 74, borderRadius: 10, padding: 10, border: `1px solid ${visible ? '#00e5ff59' : '#ffffff14'}`, background: visible ? '#00e5ff12' : '#ffffff05', opacity: visible ? 1 : .45 }}><div style={{ fontSize: 20 }}>{visible ? clue.visual_icon : '◌'}</div><div style={{ fontSize: '.58rem', marginTop: 5 }}>{visible ? clue.keyword : (lang === 'zh' ? '未知证据' : 'UNKNOWN EVIDENCE')}</div></div>;
      })}</div>
      <div style={{ marginTop: 14, fontSize: '.58rem', color: '#a78bfa' }}>{lang === 'zh' ? '有效连线' : 'VALID LINKS'} · {record?.valid_links.length || 0}</div>
      {(record?.valid_links || []).map(link => <div key={link} style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.45)', marginTop: 6 }}>◇ {link.replace('|', ' ⟺ ')}</div>)}
    </div>
  </>;
}
