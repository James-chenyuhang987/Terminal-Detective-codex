import React, { useId, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import EvidenceLibrary from './EvidenceLibrary.jsx';
import InterviewHistory from './InterviewHistory.jsx';
import './investigationJournal.css';

// This journal reads only already-public records. It never derives a future
// testimony, missing deduction, or report attachment from the case catalog.
export default function InvestigationJournal({ clues = [], newClueIds = [], sources = {}, expertNotes = {}, investigation, npcs = [] }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [activeTab, setActiveTab] = useState('evidence');
  const journalId = useId();
  const tabRefs = useRef([]);
  const knownClues = new Map(clues.filter(clue => clue?.clue_id).map(clue => [clue.clue_id, clue]));
  const clueLabel = id => {
    const clue = knownClues.get(id);
    return text((lang === 'en' && clue?.keyword_en) || clue?.keyword, lang);
  };
  const evidenceLabels = ids => [...new Set(Array.isArray(ids) ? ids : [])]
    .filter(id => knownClues.has(id))
    .map(clueLabel).filter(Boolean);
  const testimonies = npcs.map(npc => {
    const stage = Math.max(0, Math.min(2, Math.floor(Number(investigation?.testimony_stages?.[npc.npc_id]) || 0)));
    const recorded = investigation?.testimony_records?.[npc.npc_id];
    const records = [...new Map((Array.isArray(recorded) ? recorded : [])
      .filter(record => record && Number.isInteger(record.stage) && record.stage > 0 && record.stage <= stage)
      .filter(record => text(record.response, lang))
      .map(record => [record.stage, record])).values()]
      .sort((a, b) => a.stage - b.stage)
      .map(record => ({ ...record, evidenceLabels: evidenceLabels(record.evidence_ids) }));
    return { npc, records,
      initial: text(investigation?.initial_statements?.[npc.npc_id], lang) || text(npc.initial_statement, lang) };
  });
  const propositions = (investigation?.propositions || []).filter(item =>
    knownClues.has(item.a) && knownClues.has(item.b) && text(item.label, lang));
  const tabs = [
    { id: 'evidence', label: zh ? '证据' : 'Evidence', count: knownClues.size },
    { id: 'testimony', label: zh ? '证词记录' : 'Testimony', count: testimonies.reduce((sum, item) => sum + item.records.length + (item.initial ? 1 : 0), 0) },
    { id: 'deductions', label: zh ? '已确认命题' : 'Confirmed deductions', count: propositions.length },
  ];
  const relationLabel = relation => ({
    supports: zh ? '支持' : 'Supports',
    contradicts: zh ? '矛盾' : 'Contradicts',
    precedes: zh ? '先于' : 'Precedes',
  })[relation] || (zh ? '已确认关系' : 'Confirmed relation');
  const moveTab = (event, index) => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setActiveTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  };
  return <section className="td-investigation-journal" aria-label={zh ? '调查档案' : 'Investigation journal'}>
    <header className="td-journal-heading"><h3>{zh ? '调查档案' : 'Investigation journal'}</h3>
      <p>{zh ? '免费回看已发现材料。人物陈述需结合证据判断，不等同于已确认的事实。' : 'Review discovered material for free. Personal accounts must be checked against evidence; they are not confirmed facts.'}</p>
    </header>
    <div className="td-journal-tabs" role="tablist" aria-label={zh ? '档案类别' : 'Journal categories'}>
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" id={`${journalId}-tab-${tab.id}`}
        aria-selected={activeTab === tab.id} aria-controls={`${journalId}-panel-${tab.id}`} tabIndex={activeTab === tab.id ? 0 : -1}
        ref={element => { tabRefs.current[index] = element; }} onClick={() => setActiveTab(tab.id)} onKeyDown={event => moveTab(event, index)}>
        {tab.label}<span>{tab.count}</span>
      </button>)}
    </div>
    <div id={`${journalId}-panel-evidence`} role="tabpanel" aria-labelledby={`${journalId}-tab-evidence`} hidden={activeTab !== 'evidence'} className="td-journal-panel" tabIndex={0}>
      <EvidenceLibrary clues={clues} newClueIds={newClueIds} sources={sources} expertNotes={expertNotes} />
    </div>
    <div id={`${journalId}-panel-testimony`} role="tabpanel" aria-labelledby={`${journalId}-tab-testimony`} hidden={activeTab !== 'testimony'} className="td-journal-panel" tabIndex={0}>
      {!testimonies.length && <p className="td-journal-empty">{zh ? '暂无可回看的证词记录。' : 'No testimony records to review yet.'}</p>}
      {testimonies.map(({ npc, initial, records }) => <article className="td-journal-record" key={npc.npc_id}>
        <h4>{text(npc.name, lang)}{npc.role && <small>{text(npc.role, lang)}</small>}</h4>
        {initial && <details open className="td-journal-statement"><summary>{zh ? '初始陈述 · 人物说法' : 'Initial account · personal statement'}</summary><p>{initial}</p></details>}
        {investigation?.interview_revision === 1 && <InterviewHistory records={investigation.interview_records?.[npc.npc_id]}
          testimonies={records} stage={investigation.testimony_stages?.[npc.npc_id] || 0} lang={lang}
          clueLabels={Object.fromEntries([...knownClues.keys()].map(id => [id, clueLabel(id)]))} />}
        {records.map(record => <details open className="td-journal-statement" key={record.stage}>
          <summary>{zh ? `已取得的补充证词 · 第 ${record.stage} 次` : `Recorded follow-up · ${record.stage}`}</summary>
          <p>{text(record.response, lang)}</p>
          {record.evidenceLabels.length > 0 && <p className="td-journal-references"><strong>{zh ? '对照证据：' : 'Referenced evidence: '}</strong>{record.evidenceLabels.join(zh ? '、' : '; ')}</p>}
        </details>)}
        {!records.length && <p className="td-journal-empty">{zh ? '尚未取得补充证词。取得后可在此免费回看。' : 'No follow-up testimony recorded yet. Acquired testimony will remain available here for free.'}</p>}
      </article>)}
    </div>
    <div id={`${journalId}-panel-deductions`} role="tabpanel" aria-labelledby={`${journalId}-tab-deductions`} hidden={activeTab !== 'deductions'} className="td-journal-panel" tabIndex={0}>
      <p className="td-journal-explanation">{zh ? '这里只记录已确认的证据关系；单个命题成立不代表整案结论已经成立。' : 'These are confirmed relationships between evidence. A valid deduction alone does not establish the whole case.'}</p>
      {!propositions.length && <p className="td-journal-empty">{zh ? '尚无已确认命题。在推理连线中核对两份已发现的证据及其关系。' : 'No confirmed deductions yet. Check the relation between two discovered pieces of evidence on the link board.'}</p>}
      {propositions.map(item => <article key={item.id} className="td-journal-record td-journal-deduction">
        <small>{zh ? '已确认' : 'Confirmed'} · {relationLabel(item.relation)}</small><p>{text(item.label, lang)}</p>
        <p className="td-journal-references">{clueLabel(item.a)}<span aria-hidden="true"> {item.relation === 'precedes' ? '→' : '·'} </span>
          <span className="td-journal-relation-text">{relationLabel(item.relation)} </span>{clueLabel(item.b)}</p>
      </article>)}
    </div>
  </section>;
}
