import React, { useState } from 'react';
import { useLang } from '@/lib/lang.jsx';

const STEPS = [
  {
    icon: '⚙️',
    zh: { t: '执行循环', d: '核心按钮。每次点击，AI 探员会完成一轮「观察 → 思考 → 行动」，并消耗 1 点行动力（AP）。每轮你都会收到 3 张策略卡，由你决定行动方向。' },
    en: { t: 'EXECUTE CYCLE', d: 'The core button. Each click runs one Observe → Think → Act loop and costs 1 AP. Every round you pick from 3 strategy cards.' },
  },
  {
    icon: '🗃️',
    zh: { t: '证据库', d: '右侧面板存放已发现的线索。线索有权重等级，越关键的线索越接近真相。' },
    en: { t: 'EVIDENCE LOCKER', d: 'The right panel holds discovered clues. Higher-weight clues sit closer to the truth.' },
  },
  {
    icon: '🔗',
    zh: { t: '推理连线 LINK', d: '打开 LINK 面板，把两条线索连起来。逻辑成立会触发「推理重演」过场并拼合真相碎片；连错则会招来凶手反制。' },
    en: { t: 'LINK BOARD', d: 'Open LINK and connect two clues. Valid logic triggers a Deduction Replay; a wrong link invites the killer\'s counterstrike.' },
  },
  {
    icon: '🗣️',
    zh: { t: '审讯嫌疑人', d: '底部行动栏的角色按钮可直接审讯。注意情绪徽章：激怒证人可能让其撤回证词。' },
    en: { t: 'INTERROGATION', d: 'Use the character buttons in the action bar. Watch the emotion badge — enraged witnesses retract testimony.' },
  },
  {
    icon: '⚠️',
    zh: { t: '混乱值', d: '错误行动会累积混乱值。达到 100% 时探员逻辑崩溃（蓝屏），需要重启并损失 AP。' },
    en: { t: 'CONFUSION', d: 'Bad moves raise confusion. At 100% the agent crashes (BSoD), costing you a reboot and AP.' },
  },
  {
    icon: '📮',
    zh: { t: '结案报告', d: '掌握足够线索后点击「报告」提交你的结论。评级 B 以上结案，错误指控会重罚 AP 与声望。' },
    en: { t: 'CASE REPORT', d: 'Submit your conclusion via REPORT. Grade B or above closes the case; false accusations cost AP and reputation.' },
  },
];

export default function OnboardingGuide({ onClose, accentColor = '#00e5ff' }) {
  const { lang } = useLang();
  const zh = lang === 'zh';
  const [i, setI] = useState(0);
  const step = STEPS[i];
  const c = zh ? step.zh : step.en;
  const isLast = i === STEPS.length - 1;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 300, fontFamily: 'monospace',
      background: 'radial-gradient(ellipse at center, rgba(4,10,26,0.88) 0%, rgba(0,0,0,0.95) 100%)',
      backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: '100%', maxWidth: 520, padding: '28px 26px 22px',
        border: `1px solid ${accentColor}45`, borderRadius: 18,
        background: 'linear-gradient(160deg, rgba(12,22,40,0.75) 0%, rgba(2,6,14,0.85) 100%)',
        boxShadow: `0 0 40px ${accentColor}22, inset 0 1px 0 rgba(255,255,255,0.12)`,
        animation: 'onb-in 0.35s cubic-bezier(.22,1,.36,1) both',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: '0.6rem', letterSpacing: '0.24em', color: `${accentColor}99` }}>
            {zh ? '新 手 指 引' : 'FIELD BRIEFING'} · {i + 1}/{STEPS.length}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: 'rgba(255,255,255,0.4)', fontSize: '0.62rem', letterSpacing: '0.14em',
          }}>{zh ? '跳过 ✕' : 'SKIP ✕'}</button>
        </div>

        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 46, lineHeight: 1, filter: `drop-shadow(0 0 14px ${accentColor})` }}>{step.icon}</div>
          <div style={{
            marginTop: 12, fontSize: '1.05rem', fontWeight: 900, color: accentColor,
            letterSpacing: '0.1em', textShadow: `0 0 14px ${accentColor}80`,
          }}>{c.t}</div>
        </div>

        <div style={{ fontSize: '0.78rem', lineHeight: 1.9, color: 'rgba(235,240,255,0.85)', minHeight: 90 }}>
          {c.d}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, margin: '20px 0 18px' }}>
          {STEPS.map((_, idx) => (
            <div key={idx} onClick={() => setI(idx)} style={{
              width: idx === i ? 18 : 7, height: 7, borderRadius: 4, cursor: 'pointer',
              background: idx === i ? accentColor : 'rgba(255,255,255,0.18)',
              boxShadow: idx === i ? `0 0 10px ${accentColor}` : 'none',
              transition: 'all 0.25s',
            }}/>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          {i > 0 && (
            <button onClick={() => setI(i - 1)} style={{
              padding: '11px 18px', borderRadius: 10, cursor: 'pointer',
              border: '1px solid rgba(255,255,255,0.2)', background: 'transparent',
              color: 'rgba(255,255,255,0.6)', fontFamily: 'monospace', fontSize: '0.72rem',
            }}>{zh ? '◀ 上一步' : '◀ BACK'}</button>
          )}
          <button onClick={() => (isLast ? onClose() : setI(i + 1))} style={{
            flex: 1, padding: '11px 18px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${accentColor}80`, background: `${accentColor}1e`,
            color: accentColor, fontFamily: 'monospace', fontSize: '0.75rem',
            fontWeight: 700, letterSpacing: '0.14em',
          }}>
            {isLast ? (zh ? '▶ 开始调查' : '▶ START INVESTIGATION') : (zh ? '下一步 ▶' : 'NEXT ▶')}
          </button>
        </div>
      </div>
      <style>{`@keyframes onb-in{from{opacity:0;transform:translateY(20px) scale(.96)}to{opacity:1;transform:none}}`}</style>
    </div>
  );
}