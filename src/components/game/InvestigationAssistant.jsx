import { useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

export default function InvestigationAssistant({ brief, busy = false, onAction }) {
  const { lang } = useLang();
  const [expanded, setExpanded] = useState(true);
  if (!brief) return null;

  return (
    <aside className={`td-investigation-assistant is-${brief.tone || 'cyan'} ${expanded ? 'is-expanded' : 'is-collapsed'}`} aria-live="polite">
      <button type="button" className="td-assistant-identity" onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
        <span className="td-assistant-avatar" aria-hidden="true"><i /><b>🤖</b></span>
        <span><small>TACTICAL ASSISTANT</small><strong>NOVA</strong></span>
        <em>{expanded ? '⌄' : '⌃'}</em>
      </button>

      {expanded && <div className="td-assistant-body">
        <div className="td-assistant-guidance">
          <small>{lang === 'zh' ? '当前建议' : 'CURRENT GUIDANCE'}</small>
          <strong>{brief.title}</strong>
          <p>{brief.instruction}</p>
          {brief.action && <button type="button" className="td-ui-button td-assistant-action" disabled={busy} onClick={() => onAction?.(brief.action)}>
            <span>▶</span>{brief.actionLabel}
          </button>}
        </div>

        <div className="td-assistant-evidence">
          <header><span>{lang === 'zh' ? '现有证据摘要' : 'EVIDENCE SUMMARY'}</span><b>{brief.clueCount}/{brief.clueTotal}</b></header>
          {brief.summary.length ? <div className="td-assistant-clue-list">{brief.summary.map(item => <div key={item.id}>
            <span>{item.icon}</span><strong>{item.text}</strong><small>{item.weight}</small>
          </div>)}</div> : <p>{lang === 'zh' ? '尚未发现证据。先执行第一次现场观察。' : 'No evidence yet. Begin with the first field observation.'}</p>}
        </div>

        <div className="td-assistant-reasoning">
          <small>{lang === 'zh' ? '推理提示' : 'REASONING HINT'}</small>
          <p>{brief.reasoning}</p>
          <span>{lang === 'zh' ? '只分析已发现证据，不会提前泄露真相。' : 'Uses discovered evidence only. No solution spoilers.'}</span>
        </div>
      </div>}
    </aside>
  );
}
