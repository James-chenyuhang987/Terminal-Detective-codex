import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import { ATTR_META } from '@/game/specialtySystem';
import { PRESET_CONFIGS } from '@/game/casePresets';
import { PRIORITY_ACTIONS } from '@/game/teamConfig';
import { buildLobbyPreparation, buildLobbyPresetPreview, describeLobbySynergy } from '@/game/lobbyPreparation';
import './lobbyPreparation.css';

export default function LobbyPreparationPanel({ agents, agentDefs, specs, primaryAgentIdx, commandPlan, activeSupport, profile,
  selectedPresetId, onPreviewPreset, onApplyPreset, canUndoPreset, onUndoPreset, onAdjustAgent, onPrimaryAgent, disabled = false }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const preparation = buildLobbyPreparation({ agents, specs, commandPlan, support: activeSupport, profile });
  const preview = buildLobbyPresetPreview({ preset: PRESET_CONFIGS.find(item => item.id === selectedPresetId), specs, agentDefs, agents });
  const label = key => {
    const meta = ATTR_META.find(item => item.key === key);
    return zh ? meta?.labelZh : meta?.label;
  };
  const name = preset => zh ? preset.name : preset.nameEn;
  const priorityNames = ids => ids.map(id => {
    const action = PRIORITY_ACTIONS.find(item => item.id === id);
    return (zh ? action?.label : action?.labelEn) || id;
  }).join(' / ');
  return <section className="td-preparation" aria-label={zh ? '出勤准备' : 'Deployment preparation'}>
    <header className="td-preparation-heading">
      <span>01 / FIELD READINESS</span>
      <h2>{zh ? '让每位探员都有分工' : 'Give every agent a role'}</h2>
      <p>{zh ? '三人共同出勤；主探员作为默认执行者。进入现场后，每次核验仍由你选择方法与探员。以下能力门槛适用于新建调查，进行中的案件沿用原规则。' : 'All three agents deploy. The primary agent is the default executor; you still choose each method and agent. These thresholds apply to new investigations; active cases keep their original rules.'}</p>
    </header>
    <div className="td-preparation-resources">
      <div><small>{zh ? '开局行动点' : 'STARTING AP'}</small><strong>{preparation.initialAP} <em>AP</em></strong></div>
      <div><small>{zh ? '开局指挥点' : 'STARTING CP'}</small><strong>{preparation.initialCP} <em>CP</em></strong></div>
      <p>{zh ? '应急预案自动触发时消耗 1 CP，记得保留额度。' : 'An automatic contingency costs 1 CP. Keep a point in reserve.'}</p>
    </div>
    <div className="td-preparation-agents">
      {preparation.agents.map(row => {
        const def = agentDefs[row.slot];
        const observed = Object.entries(row.professional_observation).filter(([, ready]) => ready).map(([key]) => label(key));
        const primary = primaryAgentIdx === row.slot;
        return <article key={def.id} className={`td-preparation-agent ${primary ? 'is-primary' : ''}`}>
          <div className="td-preparation-agent-title"><strong>{def.id}</strong><span>{primary ? (zh ? '主探员' : 'PRIMARY') : (zh ? def.roleZh : def.role)}</span></div>
          <p>{observed.length ? `${zh ? '专业观察' : 'Professional observations'} · ${observed.join(' / ')}` : (zh ? '专业观察未就绪：任一调查能力达到 24 点即可。' : 'Reach 24 in an investigation ability for professional observations.')}</p>
          <p className={row.specialist_efficiency ? 'is-ready' : ''}>{row.specialist_efficiency
            ? (zh ? '首检优惠已就绪 · 每案首次核验免 1 AP' : 'First-check benefit ready · save 1 AP once per case')
            : (zh ? '首检优惠：逻辑 / 观察 / 黑客任一达到 30 点' : 'First-check benefit: reach 30 in Logic, Observation or Hack')}</p>
          <div className="td-preparation-agent-actions">
            <button type="button" onClick={() => onAdjustAgent(row.slot)}>{zh ? `${disabled ? '查看' : '调整'}专长 · 余 ${row.remaining} 点` : `Specialties · ${row.remaining} unspent`}</button>
            <button type="button" aria-pressed={primary} disabled={disabled || primary} onClick={() => !disabled && !primary && onPrimaryAgent(row.slot)}>{primary ? (zh ? '当前主探员' : 'Current primary') : (zh ? '设为主探员' : 'Make primary')}</button>
          </div>
        </article>;
      })}
    </div>
    <section className="td-preparation-presets" aria-labelledby="td-preparation-presets-title">
      <header><h3 id="td-preparation-presets-title">{zh ? '比较编队预设' : 'Compare formations'}</h3><button type="button" disabled={disabled || !canUndoPreset} onClick={() => !disabled && canUndoPreset && onUndoPreset()}>{zh ? '撤回预设' : 'Undo preset'}</button></header>
      <p>{zh ? '先比较再应用。仅调整专长和行动偏好，保留主探员、核心席位与指挥方案。' : 'Preview before applying. Only specialties and action preferences change; your primary agent, cores and command plan stay selected.'}</p>
      <div className="td-preparation-preset-options">
        {PRESET_CONFIGS.map(preset => <button type="button" key={preset.id} aria-pressed={selectedPresetId === preset.id} onClick={() => onPreviewPreset(preset.id)}>{name(preset)}</button>)}
      </div>
      {preview && <div className="td-preparation-preview" aria-live="polite">
        <table><caption>{name(preview.preset)} · {zh ? '当前 → 应用后' : 'Current → Proposed'}</caption><thead><tr><th scope="col">{zh ? '探员' : 'Agent'}</th><th scope="col">{zh ? '能力变化' : 'Ability changes'}</th></tr></thead><tbody>
          {preview.rows.map(row => <tr key={row.slot}><th scope="row">{agentDefs[row.slot].id}</th><td>{row.changes.length ? row.changes.map(change => <span key={change.key} className={change.delta > 0 ? 'is-ready' : 'is-tradeoff'}>{label(change.key)} {change.before} → {change.after}</span>) : <span>{zh ? '能力不变' : 'No ability changes'}</span>}{row.remaining > 0 && <small>{zh ? `应用后余 ${row.remaining} 点，可自行分配` : `${row.remaining} points remain to allocate`}</small>}<details><summary>{zh ? '旧版行动偏好 · 前三项' : 'Legacy action preferences · top 3'}</summary><small>{zh ? '当前：' : 'Current: '}{priorityNames(row.beforePriorities)}</small><small>{zh ? '应用后：' : 'Proposed: '}{priorityNames(row.afterPriorities)}</small></details></td></tr>)}
        </tbody></table>
        {preview.refunded > 0 && <p>{zh ? `${preview.refunded} 点超过核心能力上限，已退回可分配余额。` : `${preview.refunded} points exceed core caps and return to your unspent balance.`}</p>}
        <details className="td-preparation-synergy-preview">
          <summary>{zh ? '预设协同收益' : 'Preset synergy benefits'}</summary>
          {preview.proposedSynergy.active.length ? preview.proposedSynergy.active.map(describeLobbySynergy).map(skill => <div key={skill.id}>
            <strong>{zh ? skill.name : skill.nameEn} · {preview.gainedSynergyIds.includes(skill.id)
              ? (zh ? '新增' : 'Added') : (zh ? '保留' : 'Kept')}</strong>
            <p>{zh ? skill.desc : skill.descEn}</p>
          </div>) : <p>{zh ? '此预设尚未激活协同，可继续调整专长。' : 'This preset activates no synergies yet. You can continue tuning specialties.'}</p>}
          {preview.lostSynergyIds.length > 0 && <p>{zh ? '应用后失去：' : 'Lost after applying: '}{preview.currentSynergy.active
            .filter(skill => preview.lostSynergyIds.includes(skill.id)).map(skill => zh ? skill.name : skill.nameEn).join(' / ')}</p>}
        </details>
        <button type="button" className="td-preparation-apply" disabled={disabled} onClick={() => !disabled && onApplyPreset(preview.preset)}>{zh ? `应用「${name(preview.preset)}」` : `Apply ${name(preview.preset)}`}</button>
      </div>}
    </section>
    <p className="td-preparation-note">{zh ? '专业观察会补充已发现物件的分析，不替你取得关键证据。普通队伍也能通关，无需签约高级探员。行动偏好与战术试演主要用于旧版自动调查；试演分数不代表案件胜率。' : 'Professional observations add analysis to discovered objects; they do not acquire key evidence for you. Starter agents can solve every case. Action preferences and rehearsals primarily model legacy automatic investigation; rehearsal scores are not case win rates.'}</p>
  </section>;
}
