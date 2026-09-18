import React, { useEffect, useRef, useState } from 'react';
import { noirColor } from '@/components/ui/palette';
import Icon, { IconText } from '@/components/ui/Icon';
import { useLang } from '@/lib/lang.jsx';
import { getAgentById, getCoreAgentsForSlot, getOwnedAgentIds } from '@/game/agentMarket';
import { useModalFocusTrap } from './useModalFocusTrap';

const CORE_ATTRIBUTE_LABELS = Object.freeze({
  logic_power: ['逻辑', 'LOGIC'], observation_focus: ['观察', 'OBSERVATION'],
  confusion_resistance: ['抗干扰', 'ANTI-CHAOS'], ap_cost_discount: ['AP 折扣', 'AP DISCOUNT'],
  hack_level: ['黑客', 'HACK'],
});

export default function CoreAgentMarket({ profile, slot, currentId, busy, onConfirm, onClose, restoreRef }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const dialogRef = useRef(null);
  const [pendingId, setPendingId] = useState(null);
  const owned = new Set(getOwnedAgentIds(profile));
  const candidates = getCoreAgentsForSlot(slot);
  const currentAgent = getAgentById(currentId) || candidates[0];
  const pendingAgent = candidates.find(agent => agent.id === pendingId) || null;
  const slotNames = zh ? ['调查核心席', '法证核心席', '技术核心席'] : ['INVESTIGATION CORE', 'FORENSIC CORE', 'TECHNICAL CORE'];

  useModalFocusTrap(true, dialogRef, onClose, restoreRef);
  useEffect(() => { setPendingId(null); }, [currentId, slot]);

  const bonusTags = agent => Object.entries(agent?.attribute_bonus || {}).map(([key, value]) => {
    const label = CORE_ATTRIBUTE_LABELS[key]?.[zh ? 0 : 1] || key;
    return `${label} +${value}${key === 'ap_cost_discount' ? '%' : ''}`;
  });
  const pendingOwned = pendingAgent ? owned.has(pendingAgent.id) : false;
  const diamonds = Math.max(0, Number(profile?.diamonds) || 0);
  const affordable = !pendingAgent || pendingOwned || diamonds >= pendingAgent.cost;

  return <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={slotNames[slot]} tabIndex={-1} onClick={onClose} style={{
    position: 'fixed', inset: 0, zIndex: 120, display: 'grid', placeItems: 'center', padding: 18,
    background: 'rgba(0,3,10,.84)', backdropFilter: 'blur(10px)',
  }}>
    <section onClick={event => event.stopPropagation()} style={{
      width: 'min(920px, 96vw)', maxHeight: '88dvh', overflow: 'auto', padding: 18, borderRadius: 18,
      border: '1px solid rgba(197, 166, 111,.48)', background: 'linear-gradient(145deg,rgba(8,18,34,.98),rgba(2,7,18,.98))',
      boxShadow: '0 28px 80px rgba(0,0,0,.65),0 0 38px rgba(197, 166, 111,.12)',
    }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div><small style={{ color: '#e1d0ac', letterSpacing: '.14em' }}>♛ CORE CONTRACT VAULT</small><h2 style={{ margin: '5px 0 0', color: '#e1d0ac', fontSize: '1rem' }}>{slotNames[slot]}</h2></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}><span style={{ color: '#a5c8c0', font: '800 .62rem monospace' }}><IconText text={'💎 '} />{diamonds.toLocaleString('en-US')}</span><button type="button" disabled={busy} onClick={onClose} aria-label={zh ? '关闭核心探员契约库' : 'Close core contract vault'} title={zh ? '关闭' : 'Close'} style={{ width: 44, height: 44, borderRadius: 10, border: '1px solid rgba(112, 159, 154,.35)', background: 'rgba(112, 159, 154,.08)', color: '#a5c8c0', cursor: busy ? 'wait' : 'pointer', opacity: busy ? .45 : 1 }}>×</button></div>
      </header>
      <p style={{ margin: '0 0 15px', color: 'rgba(235,247,255,.5)', fontSize: '.58rem', lineHeight: 1.7 }}>{zh
        ? '核心探员价格高于普通支援。签约后永久拥有，可替换当前席位；原核心不会消失，经验、技能树与专长进度继续由该职业席位继承。'
        : 'Core operatives cost more than support recruits. Once owned, they can replace this slot at any time; its role XP, skill tree and specialties are preserved.'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: 10 }}>
        {candidates.map(agent => {
          const copy = agent[lang] || agent.zh;
          const isOwned = owned.has(agent.id);
          const selected = currentId === agent.id;
          const isPending = pendingId === agent.id;
          return <article key={agent.id} style={{ position: 'relative', padding: 13, borderRadius: 13, border: `1px solid ${selected || isPending ? noirColor(agent.color) : noirColor(agent.color) + '45'}`, background: selected ? `${noirColor(agent.color)}18` : isPending ? `${noirColor(agent.color)}12` : `${noirColor(agent.color)}09`, boxShadow: selected || isPending ? `0 0 22px ${noirColor(agent.color)}22` : 'none', transition: 'border-color .18s, background .18s, transform .18s', transform: isPending ? 'translateY(-2px)' : 'none' }}>
            <span style={{ position: 'absolute', top: 9, right: 9, padding: '2px 6px', borderRadius: 999, border: `1px solid ${selected ? noirColor(agent.color) + '75' : 'rgba(255,255,255,.12)'}`, color: selected ? noirColor(agent.color) : isOwned ? '#8aaa91' : '#e1d0ac', background: 'rgba(0,5,13,.72)', font: '800 .4rem monospace' }}>{selected ? (zh ? '当前席位' : 'ACTIVE') : isOwned ? (zh ? '已拥有' : 'OWNED') : (zh ? '待签约' : 'CONTRACT')}</span>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ width: 48, height: 48, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 24, border: `1px solid ${noirColor(agent.color)}80`, background: `${noirColor(agent.color)}18` }}><Icon name={agent.icon} /></span><div><strong style={{ display: 'block', color: noirColor(agent.color) }}>{agent.id}</strong><small style={{ color: 'rgba(255,255,255,.45)' }}>{copy.role} · {agent.tier}</small></div></div>
            <div style={{ marginTop: 10, color: 'rgba(240,248,255,.62)', fontSize: '.55rem', lineHeight: 1.6 }}>{copy.ability}</div>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 9 }}>{bonusTags(agent).map(tag => <span key={tag} style={{ padding: '3px 6px', borderRadius: 5, border: `1px solid ${noirColor(agent.color)}35`, background: `${noirColor(agent.color)}0b`, color: `${noirColor(agent.color)}dd`, font: '700 .42rem monospace' }}>{tag}</span>)}</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}><span style={{ color: '#e1d0ac', fontSize: '.58rem', fontWeight: 900 }}>POWER {agent.power}</span>{!isOwned && <span style={{ color: '#a5c8c0', font: '800 .5rem monospace' }}><IconText text={'💎 '} />{agent.cost}</span>}<button type="button" disabled={busy || selected} onClick={() => setPendingId(agent.id)} style={{ marginLeft: 'auto', minHeight: 38, padding: '7px 11px', borderRadius: 8, border: `1px solid ${noirColor(agent.color)}90`, background: `${noirColor(agent.color)}18`, color: noirColor(agent.color), fontFamily: 'monospace', fontSize: '.52rem', fontWeight: 900, cursor: busy ? 'wait' : 'pointer', opacity: busy || selected ? .48 : 1 }}>
              {selected ? (zh ? '当前出战' : 'ACTIVE') : isPending ? (zh ? '已选中' : 'SELECTED') : (zh ? '预览替换' : 'PREVIEW')}
            </button></div>
          </article>;
        })}
      </div>
      {pendingAgent && <div aria-live="polite" style={{ marginTop: 14, padding: 14, borderRadius: 13, border: `1px solid ${noirColor(pendingAgent.color)}55`, background: `linear-gradient(135deg,${noirColor(pendingAgent.color)}10,rgba(255,255,255,.02))` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 12 }}>
          <div><small style={{ color: 'rgba(255,255,255,.38)' }}>{zh ? '当前核心' : 'CURRENT CORE'}</small><strong style={{ display: 'block', color: noirColor(currentAgent.color), marginTop: 3 }}><Icon name={currentAgent.icon} /> {currentAgent.id}</strong><span style={{ color: 'rgba(255,255,255,.35)', font: '.48rem monospace' }}>POWER {currentAgent.power}</span></div>
          <span style={{ color: '#e1d0ac', fontSize: '1.2rem', textShadow: 'none' }}>→</span>
          <div style={{ textAlign: 'right' }}><small style={{ color: 'rgba(255,255,255,.38)' }}>{zh ? '替换目标' : 'REPLACEMENT'}</small><strong style={{ display: 'block', color: noirColor(pendingAgent.color), marginTop: 3 }}><Icon name={pendingAgent.icon} /> {pendingAgent.id}</strong><span style={{ color: '#8aaa91', font: '.48rem monospace' }}>POWER {pendingAgent.power} · {pendingAgent.power >= currentAgent.power ? '+' : ''}{pendingAgent.power - currentAgent.power}</span></div>
        </div>
        <p style={{ margin: '11px 0', color: 'rgba(240,248,255,.56)', font: '.52rem/1.65 monospace' }}>{zh
          ? '确认后才会写入云端。原核心探员不会消失；该席位的等级、技能树、专长与行动优先级全部保留。'
          : 'The replacement is saved to the cloud only after confirmation. The previous core remains owned, and this slot keeps its level, skills, specialties and priorities.'}</p>
        {!affordable && <div style={{ marginBottom: 9, color: '#dda29a', font: '800 .52rem monospace' }}><IconText text={'⚠ '} />{zh ? `钻石不足，还差 ${pendingAgent.cost - diamonds}` : `NOT ENOUGH DIAMONDS · ${pendingAgent.cost - diamonds} MORE REQUIRED`}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><button type="button" disabled={busy} onClick={() => setPendingId(null)} style={{ minHeight: 42, padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.18)', background: 'rgba(255,255,255,.04)', color: 'rgba(255,255,255,.58)', cursor: busy ? 'wait' : 'pointer' }}>{zh ? '取消' : 'CANCEL'}</button><button type="button" disabled={busy || !affordable} onClick={() => onConfirm(pendingAgent, !pendingOwned)} style={{ minHeight: 42, minWidth: 150, padding: '8px 14px', borderRadius: 8, border: `1px solid ${noirColor(pendingAgent.color)}90`, background: `${noirColor(pendingAgent.color)}18`, color: noirColor(pendingAgent.color), font: '900 .56rem monospace', cursor: busy ? 'wait' : !affordable ? 'not-allowed' : 'pointer', opacity: busy || !affordable ? .48 : 1 }}><IconText text={busy ? (zh ? '正在同步…' : 'SYNCING…') : pendingOwned ? (zh ? '确认替换并保存' : 'CONFIRM & SAVE') : (zh ? `💎 ${pendingAgent.cost} · 签约并替换` : `💎 ${pendingAgent.cost} · RECRUIT & REPLACE`)} /></button></div>
      </div>}
    </section>
  </div>;
}
