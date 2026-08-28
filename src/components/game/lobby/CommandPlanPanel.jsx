import React from 'react';
import { useLang } from '@/lib/lang.jsx';
import {
  COMMAND_CONTINGENCIES,
  COMMAND_DOCTRINES,
  normalizeCommandPlan,
} from '@/game/commandSystem';

function PlanOption({ item, selected, onClick, lang }) {
  const zh = lang === 'zh';
  return (
    <button
      type="button"
      className={`td-command-option ${selected ? 'is-selected' : ''}`}
      onClick={onClick}
      style={/** @type {React.CSSProperties & {'--command-color': string}} */ ({ '--command-color': item.color })}
      aria-pressed={selected}
    >
      <span>{item.icon}</span>
      <strong>{zh ? item.name : item.nameEn}</strong>
      <small>{zh ? item.desc : item.descEn}</small>
      {selected && <i>✓</i>}
    </button>
  );
}

export default function CommandPlanPanel({ value, onChange, targetCase = null, mobileActive = false, className = '' }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const plan = normalizeCommandPlan(value);
  const set = (patch) => onChange?.(normalizeCommandPlan({ ...plan, ...patch }));

  return (
    <section className={`td-command-plan ${mobileActive ? 'td-mobile-active' : ''} ${className}`}>
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
              />
            ))}
          </div>
        </div>
        <div>
          <label>{zh ? '一次性应急预案' : 'ONE-SHOT CONTINGENCY'}</label>
          <div className="td-command-options">
            {COMMAND_CONTINGENCIES.map(item => (
              <PlanOption
                key={item.id}
                item={item}
                selected={plan.contingency_id === item.id}
                onClick={() => set({ contingency_id: item.id })}
                lang={lang}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
