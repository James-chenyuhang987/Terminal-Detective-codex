import React, { useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { investigationTutorialStage } from '@/game/investigationTutorial.js';
import './progressiveInvestigationGuide.css';

const LESSONS = {
  move: {
    zh: ['走近一处调查点', 'WASD / 方向键移动，按住 R 疾跑；触屏可用方向按钮。实际移动后再学习观察。'],
    en: ['Approach an investigation point', 'Move with WASD or arrows; hold R to sprint. Touch direction buttons work too. Observation comes after your first movement.'],
  },
  observe: {
    zh: ['先观察，再决定核验', '靠近物件按 E，或在现场调查中选择物件。阅读观察、放大和旋转均免费。'],
    en: ['Observe before choosing a check', 'Press E near a prop, or select an object in Field investigation. Reading, zooming and rotating are free.'],
  },
  verify: {
    zh: ['完成一次证据核验', '根据物件观察选择方法和探员，确认 AP、体力与风险后执行。已完成核验可免费复查。'],
    en: ['Complete an evidence check', 'Choose a method and agent based on the observation. Review AP, stamina and risk before confirming. Completed checks are free to review.'],
  },
  testimony: {
    zh: ['让证据检验证词', '与现场人物交谈，选择询问方式。用已取得的证据对峙，可推进补充证词；陈述仍需与材料核对。'],
    en: ['Test an account with evidence', 'Talk to a contact and choose your approach. Confrontations using secured evidence can advance testimony. Accounts still need to be checked against the record.'],
  },
  deduction: {
    zh: ['把材料连成可检验的关系', '在调查工具箱中比较两份证据，选择支持、矛盾或先后关系。专属核验可用按钮、键盘或触屏完成。'],
    en: ['Connect material into a testable relation', 'Compare two records in the toolkit and choose support, contradiction or sequence. Case verification supports buttons, keyboard and touch.'],
  },
  report: {
    zh: ['用证据解释你的结论', '准备好后打开结案报告，为四个维度选择结论和支持材料。证据不足时可继续调查并修正报告。'],
    en: ['Explain your conclusion with evidence', 'When ready, open the report and attach supporting material to its four dimensions. If evidence is insufficient, continue investigating and revise it.'],
  },
};

// Deliberately nonmodal: no focus capture, keyboard listener or movement pause.
export default function ProgressiveInvestigationGuide({ gameState, investigation, progress = {}, investigationVersion = 2, theaterMode = false, active = true, onOpenGuide, onDismiss = null }) {
  const { lang } = useLang();
  const [dismissed, setDismissed] = useState({});
  const stage = investigationTutorialStage({ state: gameState, investigation, progress, theaterMode, investigationVersion });
  const runId = gameState?.run_id || '';
  const key = `${runId}:${stage}`;
  if (!active || !stage || dismissed[key]) return null;
  const zh = lang === 'zh';
  const [title, description] = LESSONS[stage][zh ? 'zh' : 'en'];
  return <aside className={`td-progress-guide ${theaterMode ? 'is-theater' : ''}`} aria-label={zh ? '当前操作指引' : 'Current action guide'} data-tutorial-stage={stage}>
    <details key={key}>
      <summary><small>{zh ? '操作提示' : 'ACTION GUIDE'}</small><strong>{title}</strong></summary>
      <p>{description}</p>
      {onOpenGuide && <button type="button" onClick={onOpenGuide}>{zh ? '查看完整指南' : 'Read the full guide'}</button>}
    </details>
    <button type="button" className="td-progress-guide-dismiss" aria-label={zh ? '收起当前提示' : 'Dismiss this hint'} onClick={() => {
      setDismissed(previous => ({ ...previous, [key]: true }));
      onDismiss?.(stage);
    }}>×</button>
  </aside>;
}
