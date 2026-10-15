import React from 'react';
import { REPORT_DIMENSIONS, localizedInvestigationText as text } from '@/game/investigationChoices.js';
import EvidenceReference from './EvidenceReference.jsx';
import './evidenceReportExplanation.css';

const labels = lang => lang === 'zh'
  ? { opportunity: '机会', method: '手段', motive: '动机', timeline: '时间线' }
  : { opportunity: 'Opportunity', method: 'Method', motive: 'Motive', timeline: 'Timeline' };

export function EvidenceRoleDisclosure({ entry = null, dimension, label, lang = 'zh' }) {
  if (!entry || !REPORT_DIMENSIONS.includes(dimension) || !Array.isArray(entry.roles)) return null;
  const zh = lang === 'zh';
  const roles = entry.roles.filter(role => role.dimension === dimension && text(role.explanation, lang));
  return <details className="td-evidence-role">
    <summary>{zh ? '材料作用' : 'Material role'} · {label}</summary>
    {roles.length ? roles.map((role, index) => <p key={index}>{text(role.explanation, lang)}</p>)
      : <p>{zh ? '本组可保留这份材料作为背景；系统尚未确认它对这一环节的具体支持作用。' : 'This material may remain as context in this group; the system has not identified a specific supporting role for this dimension.'}</p>}
  </details>;
}

/** Explain only the submitted, authority-reviewed attachments and already-known records. */
export default function EvidenceReportReview({ review = null, knownClues = [], lang = 'zh', isPassed = false,
  sources = {}, expertNotes = {} }) {
  if (!Array.isArray(review?.dimensions) || !review.dimensions.length) return null;
  const zh = lang === 'zh';
  const dimensions = review.dimensions.filter(item => REPORT_DIMENSIONS.includes(item.dimension));
  if (!dimensions.length) return null;
  const dimensionLabels = labels(lang);
  const byId = new Map(knownClues.map(clue => [clue.clue_id, clue]));
  const references = ids => [...new Set(ids || [])].map(id => byId.get(id)).filter(Boolean);
  const reference = clue => <EvidenceReference key={clue.clue_id} clue={clue}
    sourceLabel={sources[clue.clue_id]} expertNote={expertNotes[clue.clue_id]} />;
  return <details className="td-evidence-report-review">
    <summary>{zh ? '查看本次附件判定' : 'Review this submission’s attachments'}</summary>
    <p className="td-evidence-review-scope">{isPassed
      ? (zh ? '以下是系统在本次报告中采用的支持依据和保留的背景材料。多附材料不会因此受罚。' : 'These are the supporting records used and context retained in this accepted report. Extra attachments carry no penalty.')
      : (zh ? '这里只说明已提交材料的覆盖范围，不代表所选结论已经成立。可保留背景材料，按反馈补充或调整后再提交。' : 'This explains the scope of the submitted material; it does not establish that the selected conclusions are correct. Context can remain while you revise or add support and resubmit.')}</p>
    <div className="td-evidence-review-dimensions">{dimensions.map(item => {
      const used = references(item.used_evidence_ids);
      const usedIds = new Set(used.map(clue => clue.clue_id));
      const context = references(item.context_evidence_ids).filter(clue => !usedIds.has(clue.clue_id));
      return <article key={item.dimension}>
        <h4>{dimensionLabels[item.dimension]}</h4>
        {text(item.explanation, lang) && <p>{text(item.explanation, lang)}</p>}
        <h5>{zh ? '系统采用的支持依据' : 'Supporting records used'}</h5>
        {used.length ? used.map(reference)
          : <p>{zh ? '本组附件尚未形成完整支持链。' : 'These attachments do not yet form a complete support chain.'}</p>}
        {context.length > 0 && <><h5>{zh ? '保留的背景材料' : 'Context retained'}</h5>{context.map(reference)}</>}
      </article>;
    })}</div>
  </details>;
}
