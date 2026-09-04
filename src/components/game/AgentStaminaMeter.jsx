import { staminaEffectivePercent } from '@/game/agentStamina';

export default function AgentStaminaMeter({ stamina = 50, language = 'zh', compact = false }) {
  const zh = language !== 'en';
  const value = Math.max(0, Math.min(100, Math.round(Number(stamina) || 0)));
  const effective = staminaEffectivePercent(value);
  const state = value < 10
    ? (zh ? '力竭' : 'DEPLETED')
    : value < 40
      ? (zh ? '疲劳' : 'FATIGUED')
      : value < 75
        ? (zh ? '稳定' : 'STABLE')
        : (zh ? '充沛' : 'READY');

  return (
    <span
      className={`td-agent-stamina ${compact ? 'is-compact' : ''} ${value < 10 ? 'is-depleted' : value < 40 ? 'is-fatigued' : ''}`}
      aria-label={zh ? `体力 ${value}%，有效能力 ${effective}%` : `Stamina ${value}%, effective ability ${effective}%`}
    >
      <span><b>{zh ? '体力' : 'STA'}</b><strong>{value}%</strong><em>{state}</em></span>
      <i><b style={{ width: `${value}%` }} /></i>
      {!compact && <small>{zh ? `当前智力与行动能力 ${effective}%` : `INTELLECT AND ACTION ABILITY ${effective}%`}</small>}
    </span>
  );
}
