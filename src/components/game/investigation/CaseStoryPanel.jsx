import React from 'react';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import EvidenceReference from './EvidenceReference.jsx';
import './caseStory.css';

const STAGES = {
  opening: { zh: '第一幕 · 现场疑问', en: 'Act I · Questions at the scene' },
  pursuit: { zh: '第二幕 · 追查矛盾', en: 'Act II · Following contradictions' },
  convergence: { zh: '第三幕 · 因果收束', en: 'Act III · Connecting the causes' },
};

/** Render only the story already projected by the authority, with earned references. */
export default function CaseStoryPanel({ story = null, mode = 'investigation', lang = 'zh', knownClues = [], sources = {}, expertNotes = {} }) {
  if (!story) return null;
  const zh = lang === 'zh';
  const cluesById = new Map(knownClues.map(clue => [clue.clue_id, clue]));
  const references = entry => [...new Set(entry.evidence_ids || [])].map(id => cluesById.get(id)).filter(Boolean).map(clue =>
    <EvidenceReference key={clue.clue_id} clue={clue} sourceLabel={sources[clue.clue_id]} expertNote={expertNotes[clue.clue_id]} />);
  const entry = (item, index) => <li key={item.id || index}>
    <h4>{text(item.title, lang)}</h4><p>{text(item.body, lang)}</p>{references(item)}
  </li>;
  if (mode === 'resolution') {
    const resolution = story.resolution;
    if (!resolution) return null;
    return <section className="td-case-story is-resolution" aria-label={zh ? '事件重建与案件后续' : 'Event reconstruction and aftermath'}>
      <h3>{text(resolution.title, lang)}</h3>
      {resolution.sequence?.length > 0 && <ol className="td-case-story-sequence">{resolution.sequence.map(entry)}</ol>}
      {resolution.aftermath?.length > 0 && <div className="td-case-story-aftermath">
        <h3>{zh ? '结案之后' : 'After the case'}</h3><ul>{resolution.aftermath.map(entry)}</ul>
      </div>}
    </section>;
  }
  const milestones = story.milestones || [];
  return <section className="td-case-story" aria-label={zh ? '调查脉络' : 'Investigation story'}>
    <small>{text(STAGES[story.stage] || STAGES.opening, lang)}</small>
    <h3>{zh ? '当前关注' : 'Current focus'}</h3><p className="td-case-story-focus">{text(story.focus, lang)}</p>
    {milestones.length > 0 && <details className="td-case-story-milestones">
      <summary>{zh ? `已确认的关键转折 · ${milestones.length}` : `Confirmed turning points · ${milestones.length}`}</summary>
      <ol>{milestones.map(entry)}</ol>
    </details>}
  </section>;
}
