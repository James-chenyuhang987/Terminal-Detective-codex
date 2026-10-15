import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';
import Icon from '@/components/ui/Icon.jsx';
import { noirColor } from '@/components/ui/palette.js';
import { usePresentationMotion } from '@/components/ui/usePresentationMotion.js';

const STEPS = [
  {
    icon: '🤖',
    target: '[data-onboarding-target="nova"]',
    zh: {
      t: '认识 NOVA 战术助理',
      d: '留意下方标记的 NOVA 头像与对话气泡：它会根据调查进度告诉你下一步，并总结已经发现的证据、提供不剧透的推理提示。',
      hint: 'NOVA 的提示会随调查状态自动更新，不需要额外点击。',
    },
    en: {
      t: 'MEET NOVA, YOUR TACTICAL ASSISTANT',
      d: 'Watch the marked NOVA portrait and message below. NOVA tracks the investigation, recommends your next step, and summarizes only the evidence you have already discovered.',
      hint: 'NOVA updates automatically as the investigation changes — no extra click is needed.',
    },
  },
  {
    icon: '⚙️',
    target: '[data-onboarding-target="execute"]',
    label: 'EXECUTE',
    zh: { t: '执行循环', d: '核心按钮。每次点击都会完成一轮「观察 → 本地战术分析 → 决策 → 行动」，并消耗行动力（AP）。每轮你都会收到三张合法策略卡，由你决定行动方向。' },
    en: { t: 'EXECUTE CYCLE', d: 'The core button. Each click runs one Observe → Local Tactical Analysis → Decision → Action loop and costs AP. Every round you choose from three legal strategy cards.' },
  },
  {
    icon: '🎯',
    label: 'ABILITY / ALIGNMENT',
    abilityDemo: true,
    zh: {
      t: '探员能力与事实贴近度',
      d: '探员的能力会决定每一次提问是否贴近事实哦。不同问题依赖不同能力；强探员更容易提出高价值问题，并能给出误差更小的预估。',
      hint: '事实贴近度是探员预估，并不是系统公布的正确答案；置信度越高，评分误差通常越小。',
    },
    en: {
      t: 'AGENT ABILITY & FACT ALIGNMENT',
      d: 'An agent’s ability determines how closely each question aligns with the facts. Different questions rely on different attributes; stronger agents offer higher-value questions and more accurate estimates.',
      hint: 'Fact alignment is an agent estimate, not a revealed correct answer. Higher confidence usually means a smaller scoring error.',
    },
  },
  {
    icon: '🔗',
    target: '[data-onboarding-target="evidence"]',
    label: 'EVIDENCE / LINK',
    zh: { t: '证据库与推理连线', d: '右侧证据库存放已发现的线索；打开 LINK 面板可把两条线索连接起来。逻辑成立会拼合真相碎片，错误连线则会增加风险。' },
    en: { t: 'EVIDENCE & LINK BOARD', d: 'The evidence locker stores discovered clues. Open LINK to connect two clues: valid logic assembles the truth, while a bad link raises the risk.' },
  },
  {
    icon: '🗣️',
    target: '[data-onboarding-target="interrogate"]',
    label: 'NPC',
    zh: { t: '选项式审讯嫌疑人', d: '先从底部选择嫌疑人，再选择负责审讯的核心探员。比较三个问题的事实贴近度、置信度与风险；已发现证据会解锁证据对峙和矛盾追问。' },
    en: { t: 'OPTION-BASED INTERROGATION', d: 'Choose a suspect, assign a core agent, then compare three questions by estimated alignment, confidence, and risk. Discovered evidence unlocks confrontations and contradiction checks.' },
  },
  {
    icon: '⚠️',
    target: '[data-onboarding-target="confusion"]',
    label: 'CONFUSION',
    zh: { t: '混乱值', d: '错误行动会累积混乱值。达到 100% 时探员逻辑崩溃（蓝屏），需要重启并损失 AP。' },
    en: { t: 'CONFUSION', d: 'Bad moves raise confusion. At 100% the agent crashes (BSoD), costing you a reboot and AP.' },
  },
  {
    icon: '📮',
    target: '[data-onboarding-target="report"]',
    label: 'REPORT',
    zh: { t: '结构化结案报告', d: '掌握关键线索后，从选项中选择核心结论、方式、动机与时间线，并提交 2–4 条支持证据。评级 C 以上即可结案；失败报告只受到温和惩罚。' },
    en: { t: 'STRUCTURED CASE REPORT', d: 'After securing key clues, select the core conclusion, method, motive, and timeline, then attach 2–4 supporting evidence items. Grade C or above closes the case; failed reports receive only a mild penalty.' },
  },
];

const FIELD_STEPS = [
  { icon: 'map', target: '[data-onboarding-target="field-objective"]', label: 'EXPLORE',
    zh: { t: '走进现场，免费观察', d: 'WASD / 方向键移动，按住 R 疾跑，靠近物件或人物按 E 交互；触屏也有方向按钮。当前目标会随已发现事实更新。', hint: '打开现场调查台也可选择物件。观察、放大、旋转和往返探索不消耗 AP。' },
    en: { t: 'EXPLORE AND OBSERVE', d: 'Move with WASD or arrows, hold R to sprint, and press E near an object or contact. Touch direction buttons are also available. Your objective follows discovered facts.', hint: 'The investigation desk also lists objects. Observation, zoom, rotation and return travel are free.' } },
  { icon: 'search', target: '[data-onboarding-target="field-inspect"]', label: 'VERIFY',
    zh: { t: '选择首次核验', d: '先读物件观察，再选择探员和核验方式。确认前核对 AP、体力和风险；正确方式稳定保全关键证据，已完成核验可免费复查。' },
    en: { t: 'CHOOSE AN INSPECTION', d: 'Read the observation, select an agent and choose a method. Review AP, stamina and risk before confirming. Correct methods secure core evidence; completed checks are free to review.' } },
  { icon: 'chat', target: '[data-onboarding-target="interrogate"]', label: 'TESTIMONY',
    zh: { t: '用证据推进证词', d: '人物分布在各自的区域。交谈后选择温和询问、明确追问或证据对峙；匹配已保全证据可稳定获得两次补充证词。无辜者也能澄清事实。' },
    en: { t: 'TEST ACCOUNTS WITH EVIDENCE', d: 'Contacts occupy their own areas. Choose gentle questioning, firm follow-up or evidence confrontation. Matching secured evidence unlocks two testimony advances, including clarifications from innocent people.' } },
  { icon: 'link', target: '[data-onboarding-target="field-deduction"]', label: 'DEDUCTION',
    zh: { t: '核验关系与重建过程', d: '用证据连线选择支持、矛盾或先后关系，形成具体命题。材料齐备后完成案件专属核验；排序、比对和路径均可用按钮、键盘或触屏完成。', hint: '错误关系可以修正；关键证据不会因试错永久销毁。' },
    en: { t: 'VERIFY RELATIONS AND RECONSTRUCT', d: 'Connect evidence using support, contradiction or sequence to establish a proposition. Once materials are collected, complete the case reconstruction using keyboard, touch or buttons.', hint: 'Incorrect relations can be revised. Core evidence survives experimentation.' } },
  { icon: 'file', target: '[data-onboarding-target="report"]', label: 'REPORT',
    zh: { t: '提交可说明的证据链', d: '分别选择结论、方式、动机和时间线，为机会、手段、动机、时间线附上证据。报告不足可修正；错误指控会造成案件对应后果。专属核验、排除替代解释和隐藏旁证提高评级。' },
    en: { t: 'SUBMIT AN EXPLAINABLE REPORT', d: 'Select the conclusion, method, motive and timeline, then attach evidence to opportunity, method, motive and timeline. Incomplete reports can be revised; false accusations have consequences. Reconstruction, alternative exclusions and hidden corroboration improve grades.' } },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function OnboardingGuide({ onClose, accentColor = '#709f9a', investigationVersion = 1, theaterMode = false }) {
  const { lang } = useLang();
  const { motionEnabled } = usePresentationMotion();
  const zh = lang === 'zh';
  const [i, setI] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const dialogRef = useRef(null);
  const steps = investigationVersion === 2 ? FIELD_STEPS : STEPS;
  const step = steps[i];
  const c = zh ? step.zh : step.en;
  const isLast = i === steps.length - 1;

  useLayoutEffect(() => {
    if (!step.target) {
      setTargetRect(null);
      return undefined;
    }

    const target = document.querySelector(step.target);
    if (!target) {
      setTargetRect(null);
      return undefined;
    }

    const updateRect = () => {
      const rect = target.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        setTargetRect(null);
        return;
      }
      const safeEdge = 4;
      const spotlightPadding = 7;
      const left = clamp(rect.left - spotlightPadding, safeEdge, window.innerWidth - safeEdge);
      const top = clamp(rect.top - spotlightPadding, safeEdge, window.innerHeight - safeEdge);
      const right = clamp(rect.right + spotlightPadding, safeEdge, window.innerWidth - safeEdge);
      const bottom = clamp(rect.bottom + spotlightPadding, safeEdge, window.innerHeight - safeEdge);
      setTargetRect({
        top,
        left,
        right,
        bottom,
        width: Math.max(1, right - left),
        height: Math.max(1, bottom - top),
      });
    };

    updateRect();
    window.addEventListener('resize', updateRect);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(updateRect) : null;
    observer?.observe(target);

    return () => {
      window.removeEventListener('resize', updateRect);
      observer?.disconnect();
    };
  }, [step.target]);

  useEffect(() => {
    dialogRef.current?.focus();
  }, [i]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setI(current => Math.min(steps.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setI(current => Math.max(0, current - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, steps.length]);

  const cardStyle = useMemo(() => {
    if (!targetRect || typeof window === 'undefined') return undefined;
    const gutter = 14;
    const width = Math.min(460, window.innerWidth - (gutter * 2));
    const horizontal = {
      width,
      left: clamp(targetRect.left + (targetRect.width / 2) - (width / 2), gutter, window.innerWidth - width - gutter),
    };
    const estimatedCardHeight = Math.min(360, window.innerHeight - (gutter * 2));
    if (targetRect.top >= estimatedCardHeight + 36) {
      return { ...horizontal, bottom: Math.max(gutter, window.innerHeight - targetRect.top + 16) };
    }
    return { ...horizontal, top: clamp(targetRect.bottom + 16, gutter, window.innerHeight - estimatedCardHeight - gutter) };
  }, [targetRect]);

  const guide = (
    <div
      className={`td-onboarding-overlay ${targetRect ? 'has-target' : ''}`}
      data-td-motion={motionEnabled ? 'active' : 'paused'}
      style={/** @type {React.CSSProperties & {'--onboarding-accent': string}} */ ({ '--onboarding-accent': noirColor(accentColor) })}
    >
      {targetRect && (
        <div
          className="td-onboarding-spotlight"
          aria-hidden="true"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
          }}
        />
      )}

      <section
        ref={dialogRef}
        className={`td-onboarding-card ${targetRect ? 'is-anchored' : ''}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby="td-onboarding-title"
        aria-describedby="td-onboarding-description"
        tabIndex={-1}
      >
        <header className="td-onboarding-header">
          <div>{zh ? '新 手 指 引' : 'FIELD BRIEFING'} · {i + 1}/{steps.length}</div>
          <button type="button" onClick={onClose}>{zh ? '跳过' : 'SKIP'} <Icon name="close" size={14} /></button>
        </header>

        <div className="td-onboarding-title-block">
          <span><Icon name={step.icon} size={30} /></span>
          <h2 id="td-onboarding-title">{c.t}</h2>
        </div>

        <p id="td-onboarding-description" className="td-onboarding-description">{investigationVersion === 2 && i === 0 && !theaterMode ? (zh ? '文字模式与 3D 模式共用同一调查进度。打开现场调查台，选择当前区域的物件；区域通道可免费往返。' : 'Text and 3D modes share investigation progress. Open the field desk to select objects in your current area and travel through available routes for free.') : c.d}</p>
        {c.hint && <p className="td-onboarding-hint"><Icon name="help" size={14} style={{ color: 'var(--onboarding-accent)' }} />{c.hint}</p>}
        {step.abilityDemo && (
          <div className="td-onboarding-ability-demo" aria-label={zh ? '机制示例' : 'Mechanic example'}>
            <small>{zh ? '机制示例 · 不读取当前案件数据' : 'MECHANIC EXAMPLE · NO CURRENT CASE DATA'}</small>
            <div><span>{zh ? '普通探员' : 'STANDARD AGENT'}</span><i><b style={{ width: '58%' }} /></i><strong>58%</strong><em>{zh ? '低置信' : 'LOW'}</em></div>
            <div><span>{zh ? '专业探员' : 'SPECIALIST AGENT'}</span><i><b style={{ width: '84%' }} /></i><strong>84%</strong><em>{zh ? '高置信' : 'HIGH'}</em></div>
          </div>
        )}

        <nav className="td-onboarding-progress" aria-label={zh ? '引导步骤' : 'Tutorial steps'}>
          {steps.map((item, idx) => (
            <button
              type="button"
              key={item.en.t}
              onClick={() => setI(idx)}
              className={idx === i ? 'is-active' : ''}
              aria-label={`${zh ? '步骤' : 'Step'} ${idx + 1}`}
              aria-current={idx === i ? 'step' : undefined}
            />
          ))}
        </nav>

        <footer className="td-onboarding-actions">
          {i > 0 && <button type="button" className="is-back" onClick={() => setI(i - 1)}><Icon name="play" size={12} style={{ transform: 'rotate(180deg)' }} /> {zh ? '上一步' : 'BACK'}</button>}
          <button type="button" className="is-next" onClick={() => (isLast ? onClose() : setI(i + 1))}>
            {isLast
              ? (zh ? '开始调查' : 'START INVESTIGATION')
              : (i === 0 ? (zh ? '明白，继续' : 'GOT IT, CONTINUE') : (zh ? '下一步' : 'NEXT'))} <Icon name="play" size={12} />
          </button>
        </footer>

        {targetRect && <div className="td-onboarding-target-label" aria-hidden="true"><Icon name="play" size={11} style={{ transform: 'rotate(90deg)' }} /> {step.label || 'NOVA'}</div>}
      </section>
    </div>
  );

  return typeof document === 'undefined' ? guide : createPortal(guide, document.body);
}
