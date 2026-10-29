import React from 'react';

export default function InvestigationContacts({ leads = [], followedId, onFollow, disabled, lang }) {
  if (!leads.length) return null;
  const zh = lang === 'zh';
  return <details className="td-field-contacts">
    <summary>{zh ? '人物线索 · 自选追查方向' : 'People · Choose a lead'} · {leads.length}</summary>
    <p>{zh ? '可以先从人物说法入手，再回到现场查证。阅读与选择方向免费；人物说法不等于已证实事实。'
      : 'Start with an account and return to the scene to test it. Reading and choosing a lead are free; an account is not a proven fact.'}</p>
    <div className="td-field-contact-grid">{leads.map(lead => <article key={lead.id} className={followedId === lead.id ? 'is-followed' : ''}>
      <h4>{lead.name}</h4><p>{lead.role} · {lead.zoneLabel}</p>
      <small>{zh ? `已核对证词 ${lead.stage}/2` : `Testimony checked ${lead.stage}/2`}</small>
      <p><strong>{zh ? '初始说法' : 'Initial account'}</strong></p><blockquote>{lead.statement}</blockquote>
      {lead.latestTestimony && <><p><strong>{zh ? '最新补充' : 'Latest follow-up'}</strong></p><blockquote>{lead.latestTestimony}</blockquote></>}
      <p>{lead.route === null ? (zh ? '通路待解锁，可先记录追查方向。' : 'The route is locked; you can still choose this lead.')
        : lead.route.length ? (zh ? `途经 ${lead.route.length} 段通道` : `${lead.route.length} room transitions away`)
          : (zh ? '人物在当前区域' : 'In the current area')}</p>
      <button type="button" disabled={disabled || !onFollow} aria-pressed={followedId === lead.id} onClick={() => onFollow(lead.id)}>
        {zh ? `追查 ${lead.name} 的说法` : `Follow ${lead.name}'s account`}
      </button>
    </article>)}</div>
  </details>;
}
