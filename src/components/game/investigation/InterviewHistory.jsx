import React from 'react';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import './interviewHistory.css';

export default function InterviewHistory({ records = [], testimonies = [], stage = 0, lang = 'zh', clueLabels = {} }) {
  const zh = lang === 'zh';
  const earned = records.filter(item => Number.isInteger(item?.stage) && item.stage >= 0
    && item.stage < 2 && item.stage <= stage && ['background', 'claim'].includes(item.kind) && text(item.response, lang));
  const comparisons = testimonies.filter(item => item?.stage > 0 && item.stage <= stage && item.stage <= 2
    && text(item.prior_claim, lang) && text(item.response, lang));
  if (!earned.length && !comparisons.length) return null;
  return <details className="td-interview-history">
    <summary>{zh ? '回看人物背景与固定说法' : 'Review background and recorded accounts'}</summary>
    <p>{zh ? '以下是人物说法。出示证据后的补充仍需结合原始材料判断。'
      : 'These are personal accounts. Follow-up testimony still needs to be assessed against the source evidence.'}</p>
    {earned.map(item => <article key={`${item.stage}:${item.kind}`}>
      <h4>{zh ? `第 ${item.stage + 1} 段 · ${item.kind === 'background' ? '背景陈述' : '对峙前固定说法'}`
        : `Stage ${item.stage + 1} · ${item.kind === 'background' ? 'Background account' : 'Account recorded before confrontation'}`}</h4>
      <blockquote>{text(item.response, lang)}</blockquote>
    </article>)}
    {comparisons.map(item => <article key={`comparison:${item.stage}`}>
      <h4>{zh ? `第 ${item.stage} 段 · 核对证据后的补充` : `Stage ${item.stage} · Follow-up after checking evidence`}</h4>
      <blockquote>{text(item.response, lang)}</blockquote>
      <p className="td-interview-evidence">{(item.evidence_ids || []).filter(id => clueLabels[id])
        .map(id => clueLabels[id]).join(zh ? '、' : '; ')}</p>
    </article>)}
  </details>;
}
