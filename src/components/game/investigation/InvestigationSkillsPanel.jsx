import React from 'react';
import { SKILL_TREES } from '@/game/agentProgression.js';
import { localizedInvestigationText as text } from '@/game/investigationChoices.js';
import './investigationSkills.css';

const CATALOG = new Map(SKILL_TREES.flat().map(skill => [skill.id, skill]));

export function InvestigationSourceHint({ hint = null, lang = 'zh' }) {
  if (!hint) return null;
  const zh = lang === 'zh';
  return <p className="td-investigation-source-hint">
    <strong>{zh ? '后续调查建议：' : 'Follow-up suggestion: '}</strong>
    {text(hint.zone_label, lang)} · {text(hint.label, lang)}
    <small>{zh ? '这是已公开对象的调查方向，仍需自行选择核验。' : 'This points to an already-public object; choose and perform its inspection yourself.'}</small>
  </p>;
}

export function InvestigationSkillQuote({ quote = null, lang = 'zh' }) {
  const ap = Number(quote?.skill_ap_discount) || 0;
  const stamina = Number(quote?.skill_stamina_discount) || 0;
  if (ap <= 0 && stamina <= 0) return null;
  const zh = lang === 'zh';
  return <small className="td-investigation-skill-quote">
    {zh ? '技能优惠已计入报价：' : 'Skill savings included in this quote: '}
    {[ap > 0 ? `AP −${ap}` : '', stamina > 0 ? `${zh ? '体力' : 'Stamina'} −${stamina}` : ''].filter(Boolean).join(' · ')}
  </small>;
}

/** The current authority snapshot owns both the effects and remaining allowances. */
export default function InvestigationSkillsPanel({ skills = null, lang = 'zh' }) {
  if (skills?.revision !== 1) return null;
  const zh = lang === 'zh';
  const active = skills.active || [];
  const budgets = Object.entries(skills.budgets || {}).filter(([, budget]) => budget.total > 0);
  return <details className="td-investigation-skills">
    <summary>{zh ? '本案探员专长' : 'Investigator specialties this case'} · {active.length}</summary>
    {active.length > 0 ? <ul className="td-investigation-active-skills">{active.map(skill => {
      const catalogSkill = CATALOG.get(skill.skill_id);
      return <li key={skill.skill_id}>
        {catalogSkill && <strong>{zh ? catalogSkill.name : catalogSkill.nameEn}</strong>}
        <p>{text(skill.description, lang)}</p>
      </li>;
    })}</ul> : <p>{zh ? '本案没有已生效的探员专长。' : 'No investigator specialties are active in this case.'}</p>}
    {budgets.length > 0 && <dl className="td-investigation-skill-budgets">{budgets.map(([key, budget]) => <div key={key}>
      <dt>{text(budget.label, lang) || (zh ? '专项额度' : 'Specialty allowance')}</dt>
      <dd>{zh ? `已用 ${budget.used} / ${budget.total} · 剩余 ${budget.remaining}` : `Used ${budget.used} / ${budget.total} · Remaining ${budget.remaining}`}</dd>
    </div>)}</dl>}
    {(skills.hints || []).map(hint => <InvestigationSourceHint key={hint.target_id} hint={hint} lang={lang} />)}
  </details>;
}
