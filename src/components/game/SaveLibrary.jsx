import React, { useId, useRef, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon';
import { groupLibrarySaves } from '@/game/saveLibrary';
import './saveLibrary.css';

const COPY = {
  zh: {
    eyebrow: '皇家侦探署 / 调查档案', title: '进度保存库',
    description: '每段调查都有自己的位置。从上次确认的进度，继续追寻真相。',
    newGame: '新建调查', refresh: '刷新存档', back: '返回首页',
    resumes: '可继续', history: '已结束', current: '当前调查',
    slot: '份可继续调查', capacity: '保存库',
    cost: '继续存档不会再次收取开案费用。新建调查按案件所示消耗开案。',
    cloud: '调查进度自动保存到当前账号。离开前请等待正在执行的行动完成；尚未确认的行动需先同步。',
    readOnly: '当前为只读状态，可以查看保存库；恢复调查或新建调查前，请先连接可操作的账号会话。',
    unsupported: '保存库暂不可用。请稍后刷新；已有调查进度不会被覆盖。',
    search: '搜索案件或区域', noMatches: '没有找到匹配的存档', clearSearch: '清除搜索',
    emptyTitle: '你的第一份调查档案，等待开启',
    emptyBody: '从首页或这里新建调查。离开现场后，进度会在这里等你回来。',
    loading: '正在读取调查存档…', retry: '重试',
    failed: '操作未完成，请稍后重试。', updating: '正在处理…',
    clues: '已获证据', turns: '回合', location: '当前区域', saved: '最近保存',
    grade: '结案评级', finishedHint: '结案历史仅供查看。重新调查请新建案件。',
    noActive: '暂无可继续的调查', noActiveHint: '新建一段调查，或在下方查看已结束的记录。',
  },
  en: {
    eyebrow: 'ROYAL DETECTIVE BUREAU / CASE FILES', title: 'Save Library',
    description: 'Every investigation has its place. Follow the truth from your last confirmed progress.',
    newGame: 'New investigation', refresh: 'Refresh saves', back: 'Back to Home',
    resumes: 'Continue playing', history: 'Finished', current: 'Current investigation',
    slot: 'resumable investigations', capacity: 'LIBRARY',
    cost: 'Resuming a save never charges the case entry cost again. New investigations use the displayed case cost.',
    cloud: 'Investigation progress saves automatically to this account. Wait for your action to finish before leaving; unconfirmed actions need to sync first.',
    readOnly: 'This session is read-only. You can browse saves; connect an active account session before resuming or starting an investigation.',
    unsupported: 'The save library is temporarily unavailable. Refresh later; your existing progress will not be overwritten.',
    search: 'Search cases or locations', noMatches: 'No saves match your search', clearSearch: 'Clear search',
    emptyTitle: 'Your first case file is waiting',
    emptyBody: 'Start an investigation here or from Home. Your progress will be waiting when you return.',
    loading: 'Loading saved investigations…', retry: 'Retry',
    failed: 'The action did not finish. Please retry.', updating: 'Working…',
    clues: 'Evidence found', turns: 'Turns', location: 'Current location', saved: 'Last saved',
    grade: 'Case grade', finishedHint: 'Finished records are read-only. Start a new investigation to replay a case.',
    noActive: 'No investigation to resume', noActiveHint: 'Start a new investigation, or review your finished records below.',
  },
};

function SaveCard({ entry, copy, disabled, onResume }) {
  const { save, view } = entry;
  const headingId = useId();
  return <li className={`td-save-card${view.current ? ' is-current' : ''}${view.resumable ? '' : ' is-finished'}`}>
    <article aria-labelledby={headingId}>
      <div className="td-save-cover" aria-hidden="true"><Icon name={view.resumable ? 'file' : 'archive'} size={32} /><span>CASE FILE</span></div>
      <div className="td-save-body">
        <div className="td-save-card-heading">
          <div><div className="td-save-badges"><span className={`td-save-status${view.active ? ' is-active' : ''}`}>{view.statusLabel}</span>{view.current && <span className="td-save-current"><Icon name="pin" />{copy.current}</span>}</div><h3 id={headingId}>{view.title}</h3></div>
          {view.grade && <span className="td-save-grade" aria-label={`${copy.grade} ${view.grade}`}>{view.grade}</span>}
        </div>
        <dl className="td-save-facts">
          <div className="td-save-location"><dt><Icon name="pin" />{copy.location}</dt><dd>{view.zone}</dd></div>
          <div><dt>{copy.turns}</dt><dd>{view.turns}</dd></div>
          <div><dt>AP</dt><dd>{view.ap}</dd></div>
        </dl>
        <div className="td-save-evidence"><div><span>{copy.clues}</span><strong>{view.clueCount}<span> / {view.clueTotal || '—'}</span></strong></div><progress max={100} value={view.cluePercent} aria-label={`${view.title} · ${copy.clues}: ${view.clueCount}${view.clueTotal ? ` / ${view.clueTotal}` : ''}`} /></div>
        <div className="td-save-card-footer"><div className="td-save-date"><Icon name="clock" /><span>{copy.saved}<time dateTime={view.savedIso}>{view.savedDate}</time></span></div>{view.resumable && <button type="button" className="td-save-button is-resume" disabled={disabled} onClick={() => onResume(save)} aria-label={`${view.actionLabel} · ${view.title}`}><Icon name="play" />{view.actionLabel}</button>}</div>
      </div>
    </article>
  </li>;
}

export default function SaveLibrary({ saves = [], currentRunId = null, loading = false, busy = false, error = '', readOnly = false, supported = true, limit = 20, onResume, onNewGame, onRefresh, onBack }) {
  const { lang } = useLang();
  const copy = COPY[lang === 'zh' ? 'zh' : 'en'];
  const [query, setQuery] = useState('');
  const [acting, setActing] = useState(false);
  const [localError, setLocalError] = useState('');
  const actionRef = useRef(false);
  const searchId = useId();
  const groups = groupLibrarySaves(saves, lang, currentRunId, query);
  const allGroups = groupLibrarySaves(saves, lang, currentRunId);
  const total = allGroups.resumable.length + allGroups.finished.length;
  const locked = busy || acting || loading;
  const capacity = Number.isSafeInteger(limit) && limit > 0 ? limit : 20;
  const cannotStart = locked || readOnly || !supported || allGroups.resumable.length >= capacity || !onNewGame;
  const cannotResume = locked || readOnly || !supported || !onResume;
  const visibleError = error || localError;
  const invoke = async (callback, value) => {
    if (actionRef.current || locked || typeof callback !== 'function') return;
    actionRef.current = true;
    setActing(true);
    setLocalError('');
    try { await callback(value); }
    catch { setLocalError(copy.failed); }
    finally { actionRef.current = false; setActing(false); }
  };
  const resume = save => {
    if (!cannotResume) void invoke(onResume, save);
  };
  return <main className="td-save-library" aria-labelledby="td-save-library-title" aria-busy={locked}>
    <div className="td-save-library-inner">
      <nav className="td-save-navigation" aria-label={copy.title}><button type="button" className="td-save-button is-back" onClick={() => void invoke(onBack)} disabled={locked || !onBack}>← {copy.back}</button><span><Icon name="disk" />{copy.capacity} · {allGroups.resumable.length}/{capacity}</span></nav>
      <header className="td-save-header"><div><p className="td-save-eyebrow">{copy.eyebrow}</p><h1 id="td-save-library-title">{copy.title}</h1><p className="td-save-intro">{copy.description}</p></div><div className="td-save-header-actions"><button type="button" className="td-save-button is-primary" disabled={cannotStart} onClick={() => void invoke(onNewGame)}><Icon name="search" />{copy.newGame}</button><button type="button" className="td-save-button" disabled={locked || !onRefresh} onClick={() => void invoke(onRefresh)}><Icon name="refresh" />{copy.refresh}</button></div></header>
      <div className="td-save-guidance"><Icon name="shield" size={20} /><div><p>{copy.cost}</p><small>{copy.cloud}</small></div></div>
      {readOnly && <p className="td-save-notice" role="status"><Icon name="lock" />{copy.readOnly}</p>}
      {!supported && <p className="td-save-notice" role="status"><Icon name="warning" />{copy.unsupported}</p>}
      {visibleError && <div className="td-save-error" role="alert"><span>{visibleError}</span><button type="button" className="td-save-button" disabled={locked || !onRefresh} onClick={() => void invoke(onRefresh)}>{copy.retry}</button></div>}
      {loading && <p className="td-save-loading" role="status">{copy.loading}</p>}
      {acting && <p className="td-save-sr-only" role="status">{copy.updating}</p>}
      {total > 0 && <div className="td-save-search"><Icon name="search" /><label className="td-save-sr-only" htmlFor={searchId}>{copy.search}</label><input id={searchId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={copy.search} /><span>{allGroups.resumable.length} {copy.slot}</span></div>}
      {total === 0 && !loading && supported && !visibleError && <section className="td-save-empty"><Icon name="archive" size={52} /><h2>{copy.emptyTitle}</h2><p>{copy.emptyBody}</p><button type="button" className="td-save-button is-primary" disabled={cannotStart} onClick={() => void invoke(onNewGame)}><Icon name="play" />{copy.newGame}</button></section>}
      {total > 0 && groups.resumable.length === 0 && groups.finished.length === 0 ? <section className="td-save-empty is-search-empty"><h2>{copy.noMatches}</h2><button type="button" className="td-save-button" onClick={() => setQuery('')}>{copy.clearSearch}</button></section> : <>
        {total > 0 && <section className="td-save-section" aria-labelledby="td-save-resumable-title"><div className="td-save-section-heading"><h2 id="td-save-resumable-title"><Icon name="play" />{copy.resumes}</h2><span>{groups.resumable.length.toString().padStart(2, '0')}</span></div>{groups.resumable.length > 0 ? <ul className="td-save-list">{groups.resumable.map(entry => <SaveCard key={entry.view.id} entry={entry} copy={copy} disabled={cannotResume} onResume={resume} />)}</ul> : <div className="td-save-empty-active"><strong>{copy.noActive}</strong><p>{copy.noActiveHint}</p></div>}</section>}
        {groups.finished.length > 0 && <section className="td-save-section is-history" aria-labelledby="td-save-history-title"><div className="td-save-section-heading"><h2 id="td-save-history-title"><Icon name="archive" />{copy.history}</h2><span>{groups.finished.length.toString().padStart(2, '0')}</span></div><p className="td-save-history-hint">{copy.finishedHint}</p><ul className="td-save-list">{groups.finished.map((entry, index) => <SaveCard key={entry.view.id || `history-${index}`} entry={entry} copy={copy} disabled onResume={resume} />)}</ul></section>}
      </>}
    </div>
  </main>;
}
