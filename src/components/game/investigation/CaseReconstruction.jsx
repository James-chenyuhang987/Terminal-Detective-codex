import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import { buildInvestigationReconstruction } from '@/game/investigationReconstruction.js';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import EvidenceReference from './EvidenceReference.jsx';
import CaseStoryPanel from './CaseStoryPanel.jsx';
import EvidenceReportReview from './EvidenceReportExplanation.jsx';
import './caseReconstruction.css';

export default function CaseReconstruction({ gameState, investigation = null, npcs = [], zones = {}, judgeResult = null }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const record = buildInvestigationReconstruction({ state: gameState, investigation, npcs, zones, lang });
  const reference = clue => <EvidenceReference key={clue.clue_id} clue={clue} sourceLabel={record.sources[clue.clue_id]} expertNote={record.expertNotes[clue.clue_id]} />;
  const relationLabel = relation => ({ supports: zh ? '支持' : 'Supports', contradicts: zh ? '矛盾' : 'Contradicts', precedes: zh ? '先于' : 'Precedes' })[relation];
  return <section className="td-case-reconstruction td-ui-card td-result-panel" aria-label={zh ? '本局证据链回顾' : 'Case evidence review'}>
    <h2>{zh ? '回看本局证据链' : 'Review your evidence chain'}</h2>
    <CaseStoryPanel story={investigation?.story} mode="resolution" lang={lang} knownClues={record.clues}
      sources={record.sources} expertNotes={record.expertNotes} />
    <EvidenceReportReview review={judgeResult?.evidence_review} knownClues={record.clues} lang={lang}
      isPassed={judgeResult?.is_passed === true} sources={record.sources} expertNotes={record.expertNotes} />
    <p className="td-reconstruction-note">{zh ? '按本局已取得的材料回顾。只有明确的“先于”关系表示事件顺序，人物陈述仍需与证据核对。' : 'Review the material acquired in this run. Only explicit “Precedes” relations establish event order; personal accounts still need to be checked against evidence.'}</p>
    {record.relations.length > 0 ? <div className="td-reconstruction-relations">
      {record.relations.map(item => <details className="td-reconstruction-event" key={item.id}>
        <summary><small>{zh ? '已确认关系' : 'Confirmed relation'} · {relationLabel(item.relation)}</small><strong>{item.label}</strong></summary>
        <p className="td-reconstruction-references">{text(item.clues[0].keyword, lang)} {item.relation === 'precedes' ? '→' : '·'} {text(item.clues[1].keyword, lang)}</p>
        {item.clues.map(reference)}
      </details>)}
    </div> : <p className="td-reconstruction-empty">{zh ? '本局尚未记录已确认的证据关系。已取得的原始材料仍可在下方回看。' : 'No confirmed evidence relations were recorded in this run. Acquired source records remain available below.'}</p>}
    <details className="td-reconstruction-group">
      <summary>{zh ? `已取得的证词 · ${record.testimonies.length}` : `Recorded testimony · ${record.testimonies.length}`}</summary>
      {record.testimonies.map(item => <article key={`${item.npcId}:${item.stage}`} className="td-reconstruction-testimony">
        <h3>{item.name} · {zh ? `第 ${item.stage} 次补充` : `Follow-up ${item.stage}`}</h3><small>{zh ? '人物陈述' : 'Personal account'}</small>
        {item.priorClaim && <div className="td-reconstruction-prior-claim"><strong>{zh ? '对峙前固定说法' : 'Position before confrontation'}</strong><p>{item.priorClaim}</p></div>}
        {item.priorClaim && <strong>{zh ? '核对证据后的补充' : 'Follow-up after checking evidence'}</strong>}<p>{item.response}</p>
        {item.clues.map(reference)}
      </article>)}
      {!record.testimonies.length && <p>{zh ? '尚无已取得的补充证词。' : 'No acquired follow-up testimony.'}</p>}
    </details>
    <details className="td-reconstruction-group">
      <summary>{zh ? `回看原始证据 · ${record.clues.length}` : `Review source evidence · ${record.clues.length}`}</summary>
      {record.clues.map(reference)}
      {!record.clues.length && <p>{zh ? '本局没有已保全的证据。' : 'No evidence was secured in this run.'}</p>}
    </details>
  </section>;
}
