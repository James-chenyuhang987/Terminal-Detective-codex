import { useEffect } from 'react';
import { ITEM_CATALOG } from '@/game/playerProfile';

function rewardParts(reward, lang) {
  const parts = [];
  if (reward?.gold) parts.push({ icon: '🪙', value: `+${reward.gold}`, label: lang === 'zh' ? '金币' : 'GOLD' });
  if (reward?.diamonds) parts.push({ icon: '💎', value: `+${reward.diamonds}`, label: lang === 'zh' ? '钻石' : 'DIAMONDS' });
  if (reward?.energy) parts.push({ icon: '⚡', value: `+${reward.energy}`, label: lang === 'zh' ? '体力' : 'ENERGY' });
  Object.entries(reward?.items || {}).forEach(([id, count]) => {
    const item = ITEM_CATALOG.find(entry => entry.id === id);
    parts.push({ icon: item?.icon || '🎁', value: `×${count}`, label: item?.[lang]?.name || item?.zh?.name || id });
  });
  return parts;
}

export default function CheckinCelebration({ reward, day, lang = 'zh', onDone }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 3200);
    return () => window.clearTimeout(timer);
  }, [onDone]);

  const parts = rewardParts(reward, lang);
  return (
    <div className="td-checkin-celebration" role="status" aria-live="assertive" onClick={onDone}>
      <div className="td-checkin-rays" aria-hidden="true" />
      <div className="td-checkin-particles" aria-hidden="true">
        {Array.from({ length: 24 }, (_, index) => (
          <i key={index} style={/** @type {import('react').CSSProperties & Record<string, string>} */ ({
            '--particle-angle': `${index * 15}deg`,
            '--particle-distance': `${-150 - (index % 5) * 24}px`,
            '--particle-delay': `${(index % 6) * 35}ms`,
          })} />
        ))}
      </div>
      <section className="td-checkin-reward-card">
        <span className="td-checkin-seal">✓</span>
        <small>DAILY ARCHIVE · DAY {day}</small>
        <h2>{lang === 'zh' ? '签到完成' : 'CHECK-IN COMPLETE'}</h2>
        <p>{lang === 'zh' ? '今日补给已安全写入侦探档案' : 'Today’s supplies are secured in your detective profile'}</p>
        <div className="td-checkin-reward-list">
          {parts.map(part => <div key={`${part.label}-${part.value}`}><span>{part.icon}</span><strong>{part.value}</strong><small>{part.label}</small></div>)}
        </div>
        <em>{lang === 'zh' ? '点击任意位置继续' : 'CLICK ANYWHERE TO CONTINUE'}</em>
      </section>
    </div>
  );
}
