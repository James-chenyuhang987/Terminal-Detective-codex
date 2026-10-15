import React, { useId, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import EvidenceReference, { evidenceReferenceText } from './EvidenceReference.jsx';
import './evidenceArchive.css';

function searchText(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase().trim();
}

/** Search known records only, without changing their order or contents. */
export function filterEvidence(clues = [], query = '', lang = 'zh', sources = {}, expertNotes = {}) {
  const terms = searchText(query).split(/\s+/u).filter(Boolean);
  const seen = new Set();
  return clues.filter(clue => {
    if (!clue?.clue_id || seen.has(clue.clue_id)) return false;
    seen.add(clue.clue_id);
    const fields = evidenceReferenceText(clue, lang, sources[clue.clue_id], expertNotes[clue.clue_id]);
    const searchable = searchText(Object.values(fields).join('\n'));
    return terms.every(term => searchable.includes(term));
  });
}

export default function EvidenceLibrary({ clues = [], newClueIds = [], sources = {}, expertNotes = {} }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const searchId = useId();
  const [query, setQuery] = useState('');
  const known = filterEvidence(clues);
  const visible = filterEvidence(known, query, lang, sources, expertNotes);
  const newIds = new Set(newClueIds);

  return <section className="td-evidence-library" aria-label={zh ? '已发现证据档案' : 'Discovered evidence archive'}>
    <div className="td-evidence-library-search" role="search" aria-label={zh ? '搜索已发现证据' : 'Search discovered evidence'}>
      <label htmlFor={searchId}>{zh ? '搜索证据' : 'Search evidence'}</label>
      <div className="td-evidence-library-search-controls">
        <input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)}
          placeholder={zh ? '名称、完整记录或来源' : 'Name, full record, or source'} />
        {query && <button type="button" onClick={() => setQuery('')}>{zh ? '清除搜索' : 'Clear search'}</button>}
      </div>
    </div>
    <p className="td-evidence-library-count" role="status" aria-live="polite" aria-atomic="true">
      {zh ? `显示 ${visible.length} / ${known.length} 条已发现证据` : `Showing ${visible.length} of ${known.length} discovered records`}
    </p>
    {visible.length > 0 ? <ul className="td-evidence-library-records">
      {visible.map(clue => <li key={clue.clue_id}>
        {newIds.has(clue.clue_id) && <span className="td-evidence-library-new">{zh ? '新取得' : 'Newly secured'}</span>}
        <EvidenceReference clue={clue} sourceLabel={sources[clue.clue_id]} expertNote={expertNotes[clue.clue_id]} />
      </li>)}
    </ul> : <p className="td-evidence-library-empty">{known.length === 0
      ? (zh ? '尚未取得证据。发现后的完整记录会保存在这里。' : 'No evidence secured yet. Discovered records will be kept here.')
      : (zh ? '没有匹配的已发现证据。试试其他关键词，或清除搜索。' : 'No discovered evidence matches. Try another term or clear the search.')}</p>}
  </section>;
}
