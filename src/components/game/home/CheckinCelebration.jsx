import { useEffect } from 'react';
import { ITEM_CATALOG } from '@/game/playerProfile';
import Icon from '@/components/ui/Icon.jsx';

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
      <section className="td-checkin-reward-card">
        <span className="td-checkin-seal"><Icon name="check" size={26} /></span>
        <small>{lang === 'zh' ? `每日归档 · 第 ${day} 天` : `DAILY ARCHIVE · DAY ${day}`}</small>
        <h2>{lang === 'zh' ? '签到完成' : 'CHECK-IN COMPLETE'}</h2>
        <p>{lang === 'zh' ? '今日补给已安全写入侦探档案' : 'Today’s supplies are secured in your detective profile'}</p>
        <div className="td-checkin-reward-list">
          {parts.map(part => <div key={`${part.label}-${part.value}`}><span><Icon name={part.icon} size={24} /></span><strong>{part.value}</strong><small>{part.label}</small></div>)}
        </div>
        <button type="button" className="td-ui-button td-button-secondary" onClick={event => { event.stopPropagation(); onDone(); }}>{lang === 'zh' ? '继续调查' : 'CONTINUE'}</button>
      </section>
    </div>
  );
}
