import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLang } from '@/lib/lang.jsx';

const STEPS = [
  {
    icon: '🤖',
    target: '[data-onboarding-target="nova"]',
    zh: {
      t: '认识 NOVA 战术助理',
      d: '留意下方发光的 NOVA 头像与对话气泡：它会根据调查进度告诉你下一步，并总结已经发现的证据、提供不剧透的推理提示。',
      hint: 'NOVA 的提示会随调查状态自动更新，不需要额外点击。',
    },
    en: {
      t: 'MEET NOVA, YOUR TACTICAL ASSISTANT',
      d: 'Watch the glowing NOVA portrait and message below. NOVA tracks the investigation, recommends your next step, and summarizes only the evidence you have already discovered.',
      hint: 'NOVA updates automatically as the investigation changes — no extra click is needed.',
    },
  },
  {
    icon: '⚙️',
    target: '[data-onboarding-target="execute"]',
    label: 'EXECUTE',
    zh: { t: '执行循环', d: '核心按钮。每次点击，AI 探员会完成一轮「观察 → 思考 → 行动」，并消耗 1 点行动力（AP）。每轮你都会收到 3 张策略卡，由你决定行动方向。' },
    en: { t: 'EXECUTE CYCLE', d: 'The core button. Each click runs one Observe → Think → Act loop and costs 1 AP. Every round you pick from 3 strategy cards.' },
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
    zh: { t: '审讯嫌疑人', d: '底部行动栏的角色按钮可直接审讯。注意情绪徽章：激怒证人可能让其撤回证词。' },
    en: { t: 'INTERROGATION', d: 'Use the character buttons in the action bar. Watch the emotion badge — enraged witnesses retract testimony.' },
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
    zh: { t: '结案报告', d: '掌握足够线索后点击「报告」提交你的结论。评级 B 以上结案，错误指控会重罚 AP 与声望。' },
    en: { t: 'CASE REPORT', d: 'Submit your conclusion via REPORT. Grade B or above closes the case; false accusations cost AP and reputation.' },
  },
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export default function OnboardingGuide({ onClose, accentColor = '#00e5ff' }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [i, setI] = useState(0);
  const [targetRect, setTargetRect] = useState(null);
  const dialogRef = useRef(null);
  const step = STEPS[i];
  const c = zh ? step.zh : step.en;
  const isLast = i === STEPS.length - 1;

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
      if (event.key === 'ArrowRight') setI(current => Math.min(STEPS.length - 1, current + 1));
      if (event.key === 'ArrowLeft') setI(current => Math.max(0, current - 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

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
      style={/** @type {React.CSSProperties & {'--onboarding-accent': string}} */ ({ '--onboarding-accent': accentColor })}
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
          <div>{zh ? '新 手 指 引' : 'FIELD BRIEFING'} · {i + 1}/{STEPS.length}</div>
          <button type="button" onClick={onClose}>{zh ? '跳过 ✕' : 'SKIP ✕'}</button>
        </header>

        <div className="td-onboarding-title-block">
          <span>{step.icon}</span>
          <h2 id="td-onboarding-title">{c.t}</h2>
        </div>

        <p id="td-onboarding-description" className="td-onboarding-description">{c.d}</p>
        {c.hint && <p className="td-onboarding-hint"><span>◆</span>{c.hint}</p>}

        <nav className="td-onboarding-progress" aria-label={zh ? '引导步骤' : 'Tutorial steps'}>
          {STEPS.map((item, idx) => (
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
          {i > 0 && <button type="button" className="is-back" onClick={() => setI(i - 1)}>{zh ? '◀ 上一步' : '◀ BACK'}</button>}
          <button type="button" className="is-next" onClick={() => (isLast ? onClose() : setI(i + 1))}>
            {isLast
              ? (zh ? '▶ 开始调查' : '▶ START INVESTIGATION')
              : (i === 0 ? (zh ? '明白，继续 ▶' : 'GOT IT, CONTINUE ▶') : (zh ? '下一步 ▶' : 'NEXT ▶'))}
          </button>
        </footer>

        {targetRect && <div className="td-onboarding-target-label" aria-hidden="true">↓ {step.label || 'NOVA'}</div>}
      </section>
    </div>
  );

  return typeof document === 'undefined' ? guide : createPortal(guide, document.body);
}
