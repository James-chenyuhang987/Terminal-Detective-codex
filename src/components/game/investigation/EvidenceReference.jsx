import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import { localizedInvestigationText } from '@/game/investigationChoices.js';
import './evidenceArchive.css';

/** Read only the supplied, already discovered evidence and earned observations. */
export function evidenceReferenceText(clue = {}, lang = 'zh', sourceLabel, expertNote) {
  return {
    title: localizedInvestigationText((lang === 'en' && clue.keyword_en) || clue.keyword || clue.label, lang),
    description: localizedInvestigationText((lang === 'en' && clue.description_en) || clue.description, lang),
    source: localizedInvestigationText(sourceLabel, lang),
    expertNote: localizedInvestigationText(expertNote, lang),
  };
}

export default function EvidenceReference({ clue, sourceLabel, expertNote }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  if (!clue) return null;
  const text = evidenceReferenceText(clue, lang, sourceLabel, expertNote);
  const title = text.title || (zh ? '证据记录' : 'Evidence record');

  return <details className="td-evidence-reference">
    <summary>
      <span className="td-evidence-reference-title">{title}</span>
      <span className="td-evidence-reference-hint">{zh ? '查看全文' : 'Read record'}</span>
    </summary>
    <div className="td-evidence-reference-body">
      <p>{text.description || (zh ? '暂无详细记录。' : 'No detailed record available.')}</p>
      {(text.source || text.expertNote) && <dl>
        {text.source && <><dt>{zh ? '取得来源' : 'Source'}</dt><dd>{text.source}</dd></>}
        {text.expertNote && <><dt>{zh ? '已取得的专业观察' : 'Earned professional observation'}</dt><dd>{text.expertNote}</dd></>}
      </dl>}
    </div>
  </details>;
}
