import { useState } from 'react';
import { ALL_CASES, localizeCase } from '@/game/caseData';
import Icon, { IconText } from '@/components/ui/Icon.jsx';

const CASE_ICON = { Lvl_01: '🏙️', Lvl_02: '🔬', Lvl_03: '🦋', Lvl_04: '🧊', Lvl_05: '🛰️', Lvl_06: '🏛️', Lvl_07: '🌊', Lvl_08: '♾️' };

function Button({ children, onClick, active }) {
  return <button type="button" className="td-ui-button td-button-secondary" aria-pressed={active} onClick={onClick} style={{ minHeight: 38, border: `1px solid ${active ? '#709f9a' : '#9caaa980'}`, borderRadius: 8, padding: '6px 10px', background: active ? '#709f9a18' : 'transparent', color: active ? '#a5c8c0' : '#8aa2ad', font: '10px monospace', cursor: 'pointer' }}>{children}</button>;
}

export default function GraphModule({ profile, lang }) {
  const [caseId, setCaseId] = useState(ALL_CASES[0].case_id);
  const caseData = localizeCase(ALL_CASES.find(item => item.case_id === caseId), lang);
  const record = profile.case_records.find(item => item.case_id === caseId);
  const discovered = new Set(record?.discovered_clues || []);
  return <>
    <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 12 }}>{ALL_CASES.map(item => <Button key={item.case_id} active={caseId === item.case_id} onClick={() => setCaseId(item.case_id)}><Icon name={CASE_ICON[item.case_id]} size={16} /> {item.case_id}</Button>)}</div>
    <div style={{ border: '1px solid #709f9a35', borderRadius: 13, padding: 14, background: '#709f9a08' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 9 }}>{caseData.clue_dictionary.map(clue => {
        const visible = discovered.has(clue.clue_id);
        return <div key={clue.clue_id} title={visible ? clue.description : ''} style={{ minHeight: 74, borderRadius: 10, padding: 10, border: `1px solid ${visible ? '#709f9a59' : '#ffffff14'}`, background: visible ? '#709f9a12' : '#ffffff05', opacity: visible ? 1 : .45 }}><div style={{ fontSize: 20 }}><Icon name={visible ? clue.visual_icon : 'lock'} size={23} /></div><div style={{ fontSize: '.58rem', marginTop: 5 }}>{visible ? <IconText text={clue.keyword} /> : (lang === 'zh' ? '未知证据' : 'UNKNOWN EVIDENCE')}</div></div>;
      })}</div>
      <div style={{ marginTop: 14, fontSize: '.58rem', color: '#9b9aae' }}>{lang === 'zh' ? '有效连线' : 'VALID LINKS'} · {record?.valid_links.length || 0}</div>
      {(record?.valid_links || []).map(link => <div key={link} style={{ fontSize: '.55rem', color: 'rgba(255,255,255,.45)', marginTop: 6 }}><Icon name="link" size={14} /> {link.replace('|', ' ⟺ ')}</div>)}
    </div>
  </>;
}
