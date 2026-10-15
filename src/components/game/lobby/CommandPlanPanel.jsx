import Icon from '@/components/ui/Icon';
import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import {
  COMMAND_CONTINGENCIES,
  COMMAND_DOCTRINES,
  normalizeCommandPlan,
} from '@/game/commandSystem';

function PlanOption({ item, selected, onClick, lang, disabled }) {
  const zh = lang === 'zh';
  return (
    <button
      type="button"
      className={`td-command-option ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      style={/** @type {React.CSSProperties & {'--command-color': string}} */ ({ '--command-color': item.color })}
      aria-pressed={selected}
      disabled={disabled}
    >
      <span><Icon name={item.icon} /></span>
      <strong>{zh ? item.name : item.nameEn}</strong>
      <small>{item.id === 'emergency_throttle'
        ? (zh ? 'AP 首次不高于 6 时获得 2 AP 额度，逐次抵扣后续收费核验、证据问询或专属核验。' : 'At 6 AP or less, gain 2 AP credit toward subsequent paid inspections, evidence questions or special verification.')
        : zh ? item.desc : item.descEn}</small>
      {selected && <i>✓</i>}
    </button>
  );
}

export default function CommandPlanPanel({ value, onChange, targetCase = null, mobileActive = false, className = '', id = undefined, labelledBy = undefined, disabled = false }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const plan = normalizeCommandPlan(value);
  const set = (patch) => !disabled && onChange?.(normalizeCommandPlan({ ...plan, ...patch }));

  return (
    <section id={id} role={labelledBy ? 'tabpanel' : undefined} aria-labelledby={labelledBy} tabIndex={labelledBy ? 0 : undefined} className={`td-command-plan ${mobileActive ? 'td-mobile-active' : ''} ${className}`}>
      <header>
        <div>
          <span>◇ COMMAND PROTOCOL</span>
          <strong>{zh ? '指挥方案台' : 'COMMAND PLAN'}</strong>
        </div>
        <p>{targetCase
          ? (zh ? `目标案件 ${targetCase.title} · 方案将随编队保存` : `TARGET ${targetCase.en?.title || targetCase.title} · PLAN SAVES WITH SQUAD`)
          : (zh ? '通用方案 · 选择案件后自动载入' : 'GENERAL PLAN · APPLIES AFTER CASE SELECTION')}</p>
      </header>
      <div className="td-command-plan-groups">
        <div>
          <label>{zh ? '指挥学说' : 'COMMAND DOCTRINE'}</label>
          <div className="td-command-options">
            {COMMAND_DOCTRINES.map(item => (
              <PlanOption
                key={item.id}
                item={item}
                selected={plan.doctrine_id === item.id}
                onClick={() => set({ doctrine_id: item.id })}
                lang={lang}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
        <div>
          <label>{zh ? '一次性应急预案 · 自动消耗 1 CP' : 'ONE-SHOT CONTINGENCY · COSTS 1 CP'}</label>
          <div className="td-command-options">
            {COMMAND_CONTINGENCIES.map(item => (
              <PlanOption
                key={item.id}
                item={item}
                selected={plan.contingency_id === item.id}
                onClick={() => set({ contingency_id: item.id })}
                lang={lang}
                disabled={disabled}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
