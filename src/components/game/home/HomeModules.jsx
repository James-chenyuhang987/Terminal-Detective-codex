import { lazy, Suspense, useEffect, useState } from 'react';
import { useLang } from '@/lib/lang.jsx';
import { CASE_SUMMARIES } from '@/game/caseSummaries';
import { getLevelFromXP } from '@/game/agentProgression';
import {
  ACHIEVEMENTS, CASE_ENERGY_COST, ENERGY_MAX, ENERGY_OVERFLOW_MAX, ITEM_CATALOG,
  SEVEN_DAY_TASKS, TECH_CATALOG, TUTORIAL_TASKS,
  DETECTIVE_LEVEL_CAP, LEVEL_REWARDS, XP_PER_LEVEL,
  achievementProgress, canCheckin, claimAchievement, claimTask, claimWeeklyReward,
  claimLevelReward, claimableLevelRewardCount,
  dailyIntelCaseId, daysBetween, editIdentity, energyCountdown, purchaseItem,
  consumeEnergyCell, buyAndUseEnergyCell, getEconomySnapshot, quotePurchase,
  sevenDayTaskDone, toggleEquipItem, tutorialTaskDone, unlockTech,
  weeklyChallenge, knownAchievementCount, KNOWN_CASE_IDS,
} from '@/game/playerProfile';
import {
  AGENT_MARKET_CATALOG, activateSupportAgent, getActiveSupportAgentId,
  getOwnedAgentIds, getOwnedAgents, purchaseAgent,
} from '@/game/agentMarket';
import { DETECTIVE_TAGS, IDENTITY_BADGES, detectiveTagLabel, identityBadgeLabel, rankTitleLabel } from '@/game/identityOptions';
import { purchaseSuccessMessage } from '@/game/transactionFeedback';

const GraphModule = lazy(() => import('./modules/GraphModule.jsx'));

const CASE_ICON = { Lvl_01: '🏙️', Lvl_02: '🔬', Lvl_03: '🦋', Lvl_04: '🧊', Lvl_05: '🛰️' };
const DIFF_COLOR = { NORMAL: '#00ff88', HARD: '#ffaa00', OMEGA: '#ff3860' };
const GROUP_LABEL = {
  investigation: ['调查', 'INVESTIGATION'], evidence: ['证据', 'EVIDENCE'], reasoning: ['推理', 'REASONING'],
  efficiency: ['效率', 'EFFICIENCY'], growth: ['成长', 'GROWTH'], activity: ['活跃', 'ACTIVITY'],
};

const TEXT = {
  zh: {
    profile: ['🪪 侦探档案', '身份、等级与调查统计'], supply: ['⚡ 补给中心', '体力每 5 分钟恢复 1 点'],
    diamonds: ['💎 钻石来源', '仅通过游戏进度获得，不含真实付费'], warehouse: ['🎒 物品仓库', '道具、商店与下一局装备'],
    graph: ['🕸 线索图谱', '只显示你真实发现的证据'], tech: ['⚙️ 科技研发', '永久能力将叠加到探员技能'],
    comms: ['✉️ 探员通讯', '系统通知与单机剧情联络'], intel: ['📰 今日情报', '每日轮换的优先调查档案'],
    cases: ['🗂 未解案件', '档案状态、最佳评分与调查成本'], achievements: ['🏅 成就徽章', '24 项长期调查目标'],
    checkin: ['📅 每日签到', '七日奖励循环，连续签到进度保留'], events: ['🎁 活动中心', '每周轮换的单人挑战'],
    tutorial: ['📖 新手任务', '完成基础调查流程并领取奖励'], goals: ['🎯 七日目标', '按旅程天数逐步解锁'],
    agent_market: ['◈ 全息探员市场', '使用游戏内钻石签约高阶支援探员'], agents: ['🕵️ 探员名册', '三名核心探员与已签约的支援成员'],
    buy: '购买', use: '使用', equip: '装备', unequip: '卸下', claim: '领取', claimed: '已领取', locked: '未完成',
    go: '前往调查', save: '保存档案', todayBonus: '今日首次侦破额外 +250 金币',
  },
  en: {
    profile: ['🪪 DETECTIVE PROFILE', 'Identity, level and investigation statistics'], supply: ['⚡ SUPPLY CENTER', 'Recover 1 energy every 5 minutes'],
    diamonds: ['💎 DIAMOND SOURCES', 'Earned through play only; no real-money purchases'], warehouse: ['🎒 WAREHOUSE', 'Inventory, store and next-case loadout'],
    graph: ['🕸 CLUE GRAPH', 'Only evidence you actually discovered is shown'], tech: ['⚙️ RESEARCH', 'Permanent upgrades stack with agent skills'],
    comms: ['✉️ COMMS', 'System notices and single-player story contacts'], intel: ['📰 DAILY INTEL', 'A rotating priority case file'],
    cases: ['🗂 OPEN CASES', 'Status, best score and investigation cost'], achievements: ['🏅 ACHIEVEMENTS', '24 long-term detective goals'],
    checkin: ['📅 DAILY CHECK-IN', 'Seven-day reward cycle with persistent streak'], events: ['🎁 EVENT CENTER', 'A rotating weekly solo challenge'],
    tutorial: ['📖 ROOKIE TASKS', 'Learn the core loop and claim rewards'], goals: ['🎯 SEVEN-DAY GOALS', 'Unlock objectives as the journey advances'],
    agent_market: ['◈ HOLOGRAPHIC AGENT MARKET', 'Recruit advanced support agents with earned diamonds'], agents: ['🕵️ AGENT ROSTER', 'Your three core agents and recruited support members'],
    buy: 'BUY', use: 'USE', equip: 'EQUIP', unequip: 'REMOVE', claim: 'CLAIM', claimed: 'CLAIMED', locked: 'INCOMPLETE',
    go: 'INVESTIGATE', save: 'SAVE PROFILE', todayBonus: 'First solve today: +250 gold',
  },
};

function Panel({ children, accent = '#00e5ff', style = {} }) {
  return <div className="td-ui-card td-module-panel" style={{ border: `1px solid ${accent}35`, borderRadius: 13, padding: 14, background: `${accent}08`, ...style }}>{children}</div>;
}

function ActionButton({ children, onClick, disabled = false, accent = '#00e5ff', style = {} }) {
  return <button className="td-ui-button td-button-secondary td-economy-action" onClick={onClick} disabled={disabled} style={{
    border: `1px solid ${accent}80`, borderRadius: 9, padding: '8px 12px', background: `${accent}18`,
    color: accent, fontFamily: 'monospace', fontWeight: 800, fontSize: '0.62rem', cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? .42 : 1, ...style,
  }}>{children}</button>;
}

function WalletOverview({ profile, lang }) {
  const snapshot = getEconomySnapshot(profile);
  const entries = [
    { icon: '🪙', value: snapshot.wallet.gold, color: '#e8c98a', label: lang === 'zh' ? '可用金币' : 'GOLD' },
    { icon: '💎', value: snapshot.wallet.diamonds, color: '#5fd8ff', label: lang === 'zh' ? '可用钻石' : 'DIAMONDS' },
    { icon: '⚡', value: `${snapshot.energy.current}/${snapshot.energy.overflowCap}`, color: '#ffd34d', label: lang === 'zh' ? '行动体力' : 'ENERGY' },
  ];
  return <div className="td-economy-wallet">{entries.map(entry => <div key={entry.label} style={/** @type {import('react').CSSProperties & {'--wallet-color': string}} */ ({ '--wallet-color': entry.color })}>
    <span>{entry.icon}</span><section><small>{entry.label}</small><strong>{typeof entry.value === 'number' ? entry.value.toLocaleString('en-US') : entry.value}</strong></section>
  </div>)}</div>;
}

function QuantityPicker({ value, onChange, max = 10 }) {
  return <div className="td-quantity-picker" aria-label="purchase quantity">
    <button type="button" disabled={value <= 1} onClick={() => onChange(Math.max(1, value - 1))}>−</button>
    <span>×{value}</span>
    <button type="button" disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))}>＋</button>
  </div>;
}

/** @param {{ reward?: { gold?: number, diamonds?: number, energy?: number, items?: Record<string, number> } }} props */
function RewardText({ reward = {} }) {
  return <span>{[
    reward.gold ? `🪙 ${reward.gold}` : '', reward.diamonds ? `💎 ${reward.diamonds}` : '',
    reward.energy ? `⚡ ${reward.energy}` : '',
    ...Object.entries(reward.items || {}).map(([id, n]) => `${ITEM_CATALOG.find(item => item.id === id)?.icon || '📦'} ${n}`),
  ].filter(Boolean).join(' · ')}</span>;
}

function Stat({ label, value, color = '#7df1ff' }) {
  return <Panel style={{ textAlign: 'center', minWidth: 92, flex: 1 }}><div style={{ color, fontSize: '1.15rem', fontWeight: 900 }}>{value}</div><div style={{ color: 'rgba(255,255,255,.38)', fontSize: '.54rem', marginTop: 4 }}>{label}</div></Panel>;
}

function ProfileModule({ profile, onApply, tx, lang }) {
  const [name, setName] = useState(profile.detective_name);
  const [avatar, setAvatar] = useState(profile.avatar);
  const [signature, setSignature] = useState(profile.signature || '');
  const [badge, setBadge] = useState(profile.identity_badge || 'private');
  const [tags, setTags] = useState(profile.detective_tags || []);
  const progression = profile.agent_progression || [];
  const avatars = ['🕵️', '🕵️‍♀️', '👁️', '🦉', '🐺', '🎩', '🦅', '🐍'];
  const tagOptions = DETECTIVE_TAGS.map(item => item.key);
  return <>
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <Stat label={lang === 'zh' ? '等级' : 'LEVEL'} value={profile.level} />
      <Stat label={lang === 'zh' ? '经验' : 'XP'} value={profile.xp} />
      <Stat label={lang === 'zh' ? '已破案件' : 'SOLVED'} value={profile.solved_cases.length} />
      <Stat label={lang === 'zh' ? '成就' : 'ACHIEVEMENTS'} value={`${knownAchievementCount(profile)}/24`} />
    </div>
    <Panel accent="#e8c98a" style={{ marginBottom: 14 }}><div style={{ color: '#e8c98a', fontWeight: 900 }}>{rankTitleLabel(profile.rank_title, lang)}</div><div style={{ marginTop: 6, color: 'rgba(255,255,255,.42)', fontSize: '.56rem' }}>{lang === 'zh' ? `累计尝试 ${profile.case_records.reduce((sum, record) => sum + record.attempts, 0)} 次 · 有效连线 ${profile.activity_stats.valid_links}` : `${profile.case_records.reduce((sum, record) => sum + record.attempts, 0)} attempts · ${profile.activity_stats.valid_links} valid links`}</div></Panel>
    <Panel>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>{avatars.map(icon => <button className={`td-ui-button td-select-tile ${avatar === icon ? 'is-active' : ''}`} key={icon} onClick={() => setAvatar(icon)} style={{ width: 42, height: 42, borderRadius: 9, fontSize: 21, cursor: 'pointer', border: `1px solid ${avatar === icon ? '#e8c98a' : 'rgba(255,255,255,.12)'}`, background: avatar === icon ? 'rgba(232,201,138,.15)' : 'rgba(0,0,0,.3)' }}>{icon}</button>)}</div>
      <label style={{ fontSize: '.58rem', color: '#e8c98a' }}>{lang === 'zh' ? `侦探代号 · 剩余修改次数 ${profile.rename_count ? 0 : 1}` : `CODENAME · ${profile.rename_count ? 0 : 1} rename left`}</label>
      <input className="td-ui-input" value={name} maxLength={10} disabled={profile.rename_count >= 1} onChange={event => setName(event.target.value)} style={{ width: '100%', margin: '7px 0 12px', padding: 10, borderRadius: 8, border: '1px solid rgba(0,229,255,.3)', background: 'rgba(0,0,0,.45)', color: '#7df1ff', fontFamily: 'monospace' }} />
      <label style={{ fontSize: '.58rem', color: '#e8c98a' }}>{lang === 'zh' ? '个性签名' : 'SIGNATURE'}</label>
      <textarea className="td-ui-input" value={signature} maxLength={30} onChange={event => setSignature(event.target.value)} style={{ width: '100%', height: 68, margin: '7px 0 12px', padding: 10, resize: 'none', borderRadius: 8, border: '1px solid rgba(0,229,255,.3)', background: 'rgba(0,0,0,.45)', color: '#dff8ff', fontFamily: 'monospace' }} />
      <label style={{ fontSize: '.58rem', color: '#e8c98a' }}>{lang === 'zh' ? '身份徽章' : 'IDENTITY BADGE'}</label>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '7px 0 12px' }}>{IDENTITY_BADGES.map(item => <ActionButton key={item.key} accent={badge === item.key ? '#e8c98a' : '#668899'} onClick={() => setBadge(item.key)}>{identityBadgeLabel(item.key, lang)}</ActionButton>)}</div>
      <label style={{ fontSize: '.58rem', color: '#e8c98a' }}>{lang === 'zh' ? `侦探标签 · ${tags.length}/3` : `TAGS · ${tags.length}/3`}</label>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', margin: '7px 0 14px' }}>{tagOptions.map(tag => <ActionButton key={tag} accent={tags.includes(tag) ? '#a78bfa' : '#668899'} onClick={() => setTags(current => current.includes(tag) ? current.filter(value => value !== tag) : current.length < 3 ? [...current, tag] : current)}>{detectiveTagLabel(tag, lang)}</ActionButton>)}</div>
      <ActionButton onClick={() => onApply(editIdentity(profile, { detective_name: name, avatar, signature, identity_badge: badge, detective_tags: tags }), lang === 'zh' ? '档案已同步' : 'Profile synced')}>{tx.save}</ActionButton>
    </Panel>
    <div style={{ marginTop: 14, color: 'rgba(255,255,255,.45)', fontSize: '.62rem' }}>{lang === 'zh' ? '探员等级' : 'AGENT LEVELS'} · {progression.map((p, i) => `${lang === 'zh' ? ['隼目','破心','幽灵'][i] : ['NEXUS-01','AURORA-09','CIPHER-47'][i]} Lv.${getLevelFromXP(p.xp)}`).join(' / ')}</div>
  </>;
}

function LevelRoadModule({ profile, onApply, lang, busy }) {
  const zh = lang === 'zh';
  const isMax = profile.level >= DETECTIVE_LEVEL_CAP;
  const progress = isMax ? 100 : Math.min(100, Math.max(0, (profile.xp / XP_PER_LEVEL) * 100));
  const pendingCount = claimableLevelRewardCount(profile);
  const claimedIds = new Set(profile.reward_claims || []);

  return <>
    <Panel accent="#e8c98a" style={{ marginBottom: 16, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(circle at 85% 20%, rgba(232,201,138,.16), transparent 38%)' }} />
      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'auto 1fr auto', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 62, height: 62, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '2px solid rgba(232,201,138,.72)', boxShadow: '0 0 24px rgba(232,201,138,.22), inset 0 0 18px rgba(232,201,138,.12)', color: '#f5d995', fontWeight: 900, fontSize: '1.2rem' }}>{profile.level}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#f4dca7', fontWeight: 900, letterSpacing: '.1em' }}>{zh ? `侦探等级 ${profile.level}` : `DETECTIVE LEVEL ${profile.level}`}</div>
          <div style={{ height: 8, borderRadius: 999, background: 'rgba(255,255,255,.07)', overflow: 'hidden', marginTop: 10, boxShadow: 'inset 0 1px 3px rgba(0,0,0,.7)' }}>
            <div style={{ width: `${progress}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg,#00bfe8,#7df1ff 62%,#f0d28b)', boxShadow: '0 0 12px rgba(0,229,255,.55)', transition: 'width .45s ease' }} />
          </div>
          <div style={{ marginTop: 6, color: 'rgba(230,247,255,.44)', fontSize: '.56rem' }}>{isMax ? (zh ? '已达到当前最高等级' : 'CURRENT MAXIMUM LEVEL REACHED') : `${profile.xp}/${XP_PER_LEVEL} XP · ${zh ? `还需 ${XP_PER_LEVEL - profile.xp} XP` : `${XP_PER_LEVEL - profile.xp} XP TO NEXT LEVEL`}`}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <strong style={{ display: 'block', color: pendingCount ? '#00ff88' : '#7df1ff', fontSize: '1.25rem' }}>{pendingCount}</strong>
          <small style={{ color: 'rgba(230,247,255,.4)', fontSize: '.5rem', letterSpacing: '.08em' }}>{zh ? '待领取' : 'READY'}</small>
        </div>
      </div>
      <div style={{ position: 'relative', marginTop: 13, paddingTop: 11, borderTop: '1px solid rgba(232,201,138,.13)', color: 'rgba(235,246,255,.5)', fontSize: '.57rem', lineHeight: 1.7 }}>
        {zh
          ? '每次正式调查都会获得侦探经验；成功结案可获得完整经验，调查失败也会保留与进度对应的过程经验。'
          : 'Every completed investigation grants detective XP; solved cases grant full XP, while failed reports retain progress-based process XP.'}
      </div>
    </Panel>

    <div className="td-level-road-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
      {LEVEL_REWARDS.map(entry => {
        const claimId = `level:${entry.level}`;
        const claimed = claimedIds.has(claimId);
        const unlocked = profile.level >= entry.level;
        const current = profile.level === entry.level;
        const accent = claimed ? '#00ff88' : unlocked ? '#e8c98a' : '#526979';
        return <div key={entry.level} className={`td-level-road-node ${claimed ? 'is-claimed' : unlocked ? 'is-unlocked' : 'is-locked'}`}><Panel accent={accent} style={{ padding: 12, opacity: unlocked || claimed ? 1 : .62, position: 'relative', height: '100%' }}>
          {current && <span style={{ position: 'absolute', right: 10, top: 9, color: '#7df1ff', fontSize: '.47rem', letterSpacing: '.1em' }}>{zh ? '当前等级' : 'CURRENT'}</span>}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: '50%', display: 'grid', placeItems: 'center', border: `1px solid ${accent}90`, color: accent, background: `${accent}10`, fontWeight: 900 }}>{entry.level}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: unlocked ? '#eefaff' : 'rgba(220,235,245,.45)', fontWeight: 800, fontSize: '.65rem' }}>{zh ? `${entry.level} 级奖励` : `LEVEL ${entry.level} REWARD`}</div>
              <div style={{ color: accent, marginTop: 5, fontSize: '.58rem', lineHeight: 1.5 }}><RewardText reward={entry.reward} /></div>
            </div>
          </div>
          <ActionButton
            accent={accent}
            disabled={busy || claimed || !unlocked}
            style={{ width: '100%', marginTop: 11 }}
            onClick={() => onApply(
              currentProfile => claimLevelReward(currentProfile, entry.level),
              zh ? `${entry.level} 级奖励领取成功` : `Level ${entry.level} reward claimed`,
            )}
          >
            {claimed ? (zh ? '✓ 已领取' : '✓ CLAIMED') : unlocked ? (zh ? '领取奖励' : 'CLAIM REWARD') : (zh ? `等级 ${entry.level} 解锁` : `UNLOCKS AT LEVEL ${entry.level}`)}
          </ActionButton>
        </Panel></div>;
      })}
    </div>
  </>;
}

function SupplyModule({ profile, onApply, lang, tx, busy }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (profile.energy >= ENERGY_MAX) return undefined;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [profile.energy]);
  const remaining = energyCountdown(profile, new Date(now));
  const mins = Math.floor(remaining / 60000);
  const secs = Math.floor((remaining % 60000) / 1000);
  const snapshot = getEconomySnapshot(profile);
  const canBuyDirect = profile.gold >= 400;
  const directRestore = Math.min(30, ENERGY_OVERFLOW_MAX - profile.energy);
  const energyCells = Math.max(0, Math.floor(Number(profile.inventory?.energy_cell) || 0));
  const canUseStoredCell = !busy && energyCells > 0 && profile.energy < ENERGY_OVERFLOW_MAX;
  const useStoredCell = () => {
    if (!canUseStoredCell) return;
    void onApply(current => consumeEnergyCell(current), lang === 'zh' ? '体力 +30' : 'Energy +30');
  };
  return <>
    <WalletOverview profile={profile} lang={lang} />
    <Panel accent="#ffd34d" style={{ textAlign: 'center', marginBottom: 14 }}>
      <div style={{ fontSize: '2rem', color: '#ffd34d', fontWeight: 900 }}>⚡ {profile.energy}/{ENERGY_MAX}</div>
      <div className="td-energy-meter"><span style={{ width: `${Math.min(100, snapshot.energy.percent)}%` }} /></div>
      <div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.6rem', marginTop: 6 }}>{profile.energy >= ENERGY_MAX ? (lang === 'zh' ? '自然恢复已满' : 'Natural recovery full') : `${lang === 'zh' ? '下一点体力' : 'Next point'} ${mins}:${String(secs).padStart(2, '0')}`}</div>
      <div style={{ color: 'rgba(255,255,255,.3)', fontSize: '.54rem', marginTop: 4 }}>{lang === 'zh' ? `道具溢出上限 ${ENERGY_OVERFLOW_MAX}` : `Item overflow cap ${ENERGY_OVERFLOW_MAX}`}</div>
    </Panel>
    <Panel>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 30 }}>🔋</span><div style={{ flex: 1 }}><div style={{ color: '#fff', fontWeight: 800 }}>{lang === 'zh' ? '能量电池' : 'Energy Cell'}</div><div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.58rem' }}>{lang === 'zh' ? '持有' : 'OWNED'} × {energyCells}</div></div></div>
      <div style={{ color: 'rgba(255,255,255,.35)', fontSize: '.54rem', lineHeight: 1.6, marginTop: 8 }}>{lang === 'zh' ? `400 金币恢复 ${directRestore} 点体力；购买后立即使用，不占库存。` : `Spend 400 gold to restore ${directRestore} energy instantly without using inventory space.`}</div>
      <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
        <ActionButton disabled={busy || profile.energy >= ENERGY_OVERFLOW_MAX} style={!canBuyDirect || profile.energy >= ENERGY_OVERFLOW_MAX ? { opacity: .52 } : {}} onClick={() => onApply(current => buyAndUseEnergyCell(current), purchaseSuccessMessage(`${lang === 'zh' ? '体力' : 'Energy'} +${directRestore}`, lang))}>🪙 400 · {lang === 'zh' ? '购买并使用' : 'BUY & USE'}</ActionButton>
        <ActionButton disabled={!canUseStoredCell} onClick={useStoredCell}>{tx.use} +30</ActionButton>
      </div>
      {!canBuyDirect && <div className="td-economy-hint">{lang === 'zh' ? `还差 ${400 - profile.gold} 金币` : `${400 - profile.gold} more gold required`}</div>}
    </Panel>
  </>;
}

function DiamondSources({ profile, onOpen, lang }) {
  const economy = getEconomySnapshot(profile);
  const sources = [
    ['achievements', '🏅', lang === 'zh' ? '成就奖励' : 'Achievement rewards', economy.pendingDiamonds ? `${economy.pendingDiamonds} 💎 ${lang === 'zh' ? '待领取' : 'READY'}` : `${knownAchievementCount(profile)}/24`],
    ['cases', '🗂', lang === 'zh' ? '案件首通' : 'First clears', `${profile.solved_cases.filter(id => KNOWN_CASE_IDS.includes(id)).length}/${KNOWN_CASE_IDS.length}`],
    ['checkin', '📅', lang === 'zh' ? '签到奖励' : 'Check-in rewards', `${profile.checkin_streak}d`],
    ['goals', '🎯', lang === 'zh' ? '七日目标' : 'Seven-day goals', '100 💎'],
    ['events', '🎁', lang === 'zh' ? '每周挑战' : 'Weekly challenge', '40 💎'],
  ];
  return <><WalletOverview profile={profile} lang={lang} /><Panel accent="#5fd8ff" style={{ marginBottom: 12 }}><div style={{ color: '#8fe8ff', fontWeight: 900 }}>{lang === 'zh' ? '钻石只来自调查进度' : 'DIAMONDS ARE PROGRESSION-ONLY'}</div><div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.56rem', lineHeight: 1.7, marginTop: 5 }}>{economy.nextTech ? (lang === 'zh' ? `下一项可研发科技需要 ${economy.nextTech.cost} 钻石${economy.nextTech.affordable ? '，当前可解锁。' : `，还差 ${economy.nextTech.cost - economy.wallet.diamonds}。`}` : `The next available research costs ${economy.nextTech.cost} diamonds${economy.nextTech.affordable ? ' and is affordable now.' : '.'}`) : (lang === 'zh' ? '九项科技已经全部解锁。' : 'All nine technologies are unlocked.')}</div></Panel><div style={{ display: 'grid', gap: 10 }}>{sources.map(([key, icon, label, value]) => <Panel key={key}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><span style={{ fontSize: 24 }}>{icon}</span><div style={{ flex: 1 }}><div>{label}</div><div style={{ color: '#5fd8ff', marginTop: 4, fontSize: '.62rem' }}>{value}</div></div><ActionButton onClick={() => onOpen(key)}>›</ActionButton></div></Panel>)}</div></>;
}

function AgentCard({ agent, lang, owned, active, profile, onBuy = null, onActivate = null, market = false }) {
  const copy = agent[lang] || agent.zh;
  const affordable = profile.diamonds >= agent.cost;
  return <article className={`td-agent-card ${active ? 'is-active' : ''}`} style={/** @type {import('react').CSSProperties & {'--agent-color': string}} */ ({ '--agent-color': agent.color })}>
    <div className="td-agent-card-portrait"><span>{agent.icon}</span><small>{agent.tier}</small></div>
    <div className="td-agent-card-copy">
      <div className="td-agent-card-title"><strong>{agent.id}</strong><em>{copy.role}</em></div>
      <small>{copy.name}</small>
      <div className="td-agent-card-power"><span>POWER</span><i><b style={{ width: `${agent.power}%` }} /></i><strong>{agent.power}</strong></div>
      <div className="td-agent-card-ability">{copy.ability}</div>
      <div className="td-agent-card-actions">
        {agent.core ? <span>{lang === 'zh' ? '初始核心' : 'CORE AGENT'}</span> : market ? <span>💎 {agent.cost}</span> : <span>{active ? (lang === 'zh' ? '● 当前支援' : '● ACTIVE') : (lang === 'zh' ? '支援待命' : 'STANDBY')}</span>}
        {!agent.core && market && <button type="button" disabled={owned} className={!owned && !affordable ? 'is-unaffordable' : ''} onClick={() => onBuy?.(agent)}>{owned ? (lang === 'zh' ? '已拥有' : 'OWNED') : affordable ? (lang === 'zh' ? '签约探员' : 'RECRUIT') : (lang === 'zh' ? `还差 ${agent.cost - profile.diamonds}` : `NEED ${agent.cost - profile.diamonds}`)}</button>}
        {!agent.core && !market && <button type="button" disabled={active} onClick={() => onActivate?.(agent)}>{active ? (lang === 'zh' ? '已接入' : 'ACTIVE') : (lang === 'zh' ? '设为支援' : 'SET SUPPORT')}</button>}
      </div>
    </div>
  </article>;
}

function AgentMarketModule({ profile, onApply, onOpenModule, onEnterLobby, lang }) {
  const ownedIds = new Set(getOwnedAgentIds(profile));
  const marketAgents = AGENT_MARKET_CATALOG.filter(agent => !agent.core);
  return <>
    <WalletOverview profile={profile} lang={lang} />
    <div className="td-agent-market-hero">
      <div><div style={{ color: '#f0d28b', fontWeight: 900, letterSpacing: '.08em' }}>{lang === 'zh' ? '全息签约中心' : 'HOLOGRAPHIC RECRUITMENT'}</div><p style={{ margin: '6px 0 0', color: 'rgba(237,248,255,.46)', fontSize: '.58rem', lineHeight: 1.7 }}>{lang === 'zh' ? '能力指数越高，签约所需钻石越多。新探员作为支援加入下一局，不替换三名核心编队。' : 'Higher power requires more diamonds. Recruits support your next case without replacing the three core agents.'}</p></div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', position: 'relative', zIndex: 1 }}><ActionButton accent="#e8c98a" onClick={() => onOpenModule('agents')}>{lang === 'zh' ? '查看我的探员' : 'MY AGENTS'}</ActionButton><ActionButton onClick={onEnterLobby}>{lang === 'zh' ? '进入编队大厅' : 'SQUAD LOBBY'}</ActionButton></div>
    </div>
    <div className="td-agent-market-grid">{marketAgents.map(agent => <AgentCard key={agent.id} agent={agent} lang={lang} market profile={profile} owned={ownedIds.has(agent.id)} active={getActiveSupportAgentId(profile) === agent.id} onBuy={selected => onApply(purchaseAgent(profile, selected.id), purchaseSuccessMessage(lang === 'zh' ? `${selected.zh.name}${getActiveSupportAgentId(profile) ? '' : ' · 已设为支援'}` : `${selected.en.name}${getActiveSupportAgentId(profile) ? '' : ' · Active support'}`, lang))} />)}</div>
    <Panel accent="#e8c98a" style={{ marginTop: 12 }}><div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.55rem', lineHeight: 1.75 }}>{lang === 'zh' ? '钻石不接入真实付费，可通过成就、案件首通、签到、七日目标与每周挑战获得。支援效果继续遵守现有 AP 折扣和混乱抗性安全上限。' : 'Diamonds remain gameplay-only. Support bonuses still obey existing AP discount and confusion-resistance safety caps.'}</div></Panel>
  </>;
}

function OwnedAgentsModule({ profile, onApply, onOpenModule, onEnterLobby, lang }) {
  const agents = getOwnedAgents(profile);
  const activeId = getActiveSupportAgentId(profile);
  const supportCount = agents.filter(agent => !agent.core).length;
  return <>
    <div className="td-agent-roster-summary"><div><strong>{agents.length}</strong><small>{lang === 'zh' ? '已拥有' : 'OWNED'}</small></div><div><strong>3</strong><small>{lang === 'zh' ? '核心编队' : 'CORE TEAM'}</small></div><div><strong>{supportCount}</strong><small>{lang === 'zh' ? '支援探员' : 'SUPPORT'}</small></div></div>
    {!activeId && <Panel accent="#e8c98a" style={{ marginBottom: 12 }}><div style={{ color: '#e8c98a', fontWeight: 900 }}>{lang === 'zh' ? '尚未设置支援探员' : 'NO SUPPORT AGENT SELECTED'}</div><div style={{ marginTop: 5, color: 'rgba(255,255,255,.42)', fontSize: '.55rem' }}>{lang === 'zh' ? '初始三名核心探员已就绪；可前往市场签约更多支援。' : 'Your three core agents are ready. Recruit support from the market.'}</div></Panel>}
    <div className="td-agent-market-grid">{agents.map(agent => <AgentCard key={agent.id} agent={agent} lang={lang} profile={profile} owned active={activeId === agent.id} onActivate={selected => onApply(activateSupportAgent(profile, selected.id), lang === 'zh' ? `${selected.zh.name} 已设为当前支援` : `${selected.en.name} is now active support`)} />)}</div>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}><ActionButton accent="#e8c98a" onClick={() => onOpenModule('agent_market')}>{lang === 'zh' ? '前往探员市场' : 'AGENT MARKET'}</ActionButton><ActionButton onClick={onEnterLobby}>{lang === 'zh' ? '进入编队大厅' : 'SQUAD LOBBY'}</ActionButton></div>
  </>;
}

function WarehouseModule({ profile, onApply, lang, tx, busy }) {
  const [tab, setTab] = useState('inventory');
  const [quantities, setQuantities] = useState({});
  return <>
    <WalletOverview profile={profile} lang={lang} />
    <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>{[['inventory', lang === 'zh' ? '持有' : 'OWNED'], ['shop', lang === 'zh' ? '商店' : 'STORE'], ['equipped', lang === 'zh' ? '已装备' : 'LOADOUT']].map(([id, label]) => <ActionButton key={id} accent={tab === id ? '#00e5ff' : '#668899'} onClick={() => setTab(id)}>{label}</ActionButton>)}</div>
    {tab === 'shop' && <Panel accent="#e8c98a" style={{ marginBottom: 12 }}><div style={{ color: '#e8c98a', fontWeight: 900, marginBottom: 7 }}>{lang === 'zh' ? '金币来源' : 'GOLD SOURCES'}</div><div style={{ color: 'rgba(255,255,255,.48)', fontSize: '.56rem', lineHeight: 1.75 }}>{lang === 'zh' ? '案件评级：S 1000 / A 750 / B 500 / C 300 / D 150 · 今日情报 +250 · 签到、新手任务与周活动' : 'Case rank: S 1000 / A 750 / B 500 / C 300 / D 150 · Daily Intel +250 · check-ins, tasks and weekly events'}</div></Panel>}
    <div style={{ display: 'grid', gap: 10 }}>{ITEM_CATALOG.filter(item => tab === 'shop' || (tab === 'equipped' ? profile.equipped_items.includes(item.id) : profile.inventory[item.id] > 0)).map(item => {
      const text = item[lang] || item.zh;
      const equipped = profile.equipped_items.includes(item.id);
      const quantity = quantities[item.id] || 1;
      const quote = quotePurchase(profile, item.id, quantity);
      const room = Math.max(1, Math.min(10, item.stackLimit - profile.inventory[item.id]));
      return <Panel key={item.id} accent={item.currency === 'gold' ? '#e8c98a' : '#5fd8ff'}><div className="td-store-item"><span className="td-store-item-icon">{item.icon}</span><div className="td-store-item-copy"><div style={{ fontWeight: 900 }}>{text.name}</div><div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.56rem', marginTop: 4 }}>{text.desc}</div><div style={{ color: '#7df1ff', fontSize: '.56rem', marginTop: 5 }}>{lang === 'zh' ? '持有' : 'OWNED'} × {profile.inventory[item.id]} / {item.stackLimit}</div></div>{tab === 'shop' ? <div className="td-store-buy"><QuantityPicker value={quantity} max={room} onChange={value => setQuantities(current => ({ ...current, [item.id]: value }))} /><ActionButton style={!quote.canPurchase ? { opacity: .52 } : {}} accent={item.currency === 'gold' ? '#e8c98a' : '#5fd8ff'} onClick={() => onApply(purchaseItem(profile, item.id, quantity), purchaseSuccessMessage(`${text.name} ×${quantity}`, lang))}>{item.currency === 'gold' ? '🪙' : '💎'} {quote.totalCost || item.cost}</ActionButton>{!quote.canPurchase && <small>{quote.error === 'inventory_full' ? (lang === 'zh' ? '库存已满' : 'FULL') : (lang === 'zh' ? '资源不足' : 'INSUFFICIENT FUNDS')}</small>}</div> : item.id === 'energy_cell' ? <ActionButton disabled={busy || Number(profile.inventory.energy_cell) < 1 || profile.energy >= ENERGY_OVERFLOW_MAX} onClick={() => onApply(current => consumeEnergyCell(current), lang === 'zh' ? '体力 +30' : 'Energy +30')}>{tx.use}</ActionButton> : <ActionButton onClick={() => onApply(toggleEquipItem(profile, item.id), equipped ? (lang === 'zh' ? '已卸下' : 'Removed') : (lang === 'zh' ? '已装备' : 'Equipped'))}>{equipped ? tx.unequip : tx.equip}</ActionButton>}</div></Panel>;
    })}</div>
    {tab !== 'shop' && ITEM_CATALOG.every(item => tab === 'equipped' ? !profile.equipped_items.includes(item.id) : !profile.inventory[item.id]) && <Panel><div style={{ color: 'rgba(255,255,255,.4)', fontSize: '.65rem' }}>{lang === 'zh' ? '这里暂时是空的。' : 'Nothing here yet.'}</div></Panel>}
    <div style={{ marginTop: 12, color: 'rgba(255,255,255,.32)', fontSize: '.55rem' }}>{lang === 'zh' ? `任务道具最多装备 2 件 · 当前 ${profile.equipped_items.length}/2` : `Equip up to 2 mission items · ${profile.equipped_items.length}/2`}</div>
  </>;
}

function TechModule({ profile, onApply, lang }) {
  const branchLabels = { forensics: ['🧪 法证', '🧪 FORENSICS'], network: ['💻 网络', '💻 NETWORK'], psychology: ['🧠 心理', '🧠 PSYCHOLOGY'] };
  return <div style={{ display: 'grid', gap: 14 }}>{Object.keys(branchLabels).map(branch => <Panel key={branch}><div style={{ color: '#e8c98a', fontWeight: 900, marginBottom: 10 }}>{branchLabels[branch][lang === 'zh' ? 0 : 1]}</div><div style={{ display: 'grid', gap: 8 }}>{TECH_CATALOG.filter(tech => tech.branch === branch).map(tech => { const unlocked = profile.tech_unlocks.includes(tech.id); const prereq = tech.level === 1 || profile.tech_unlocks.includes(`${branch}_${tech.level - 1}`); const text = tech[lang] || tech.zh; return <div key={tech.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: 10, borderRadius: 9, background: unlocked ? 'rgba(0,255,136,.07)' : 'rgba(255,255,255,.025)', border: `1px solid ${unlocked ? 'rgba(0,255,136,.35)' : 'rgba(255,255,255,.08)'}` }}><div style={{ width: 29, height: 29, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(0,229,255,.3)', color: unlocked ? '#00ff88' : '#7df1ff' }}>{tech.level}</div><div style={{ flex: 1 }}><div style={{ fontSize: '.68rem', fontWeight: 800 }}>{text.name}</div><div style={{ fontSize: '.53rem', color: 'rgba(255,255,255,.4)', marginTop: 3 }}>{text.desc}</div></div><ActionButton disabled={unlocked || !prereq} onClick={() => onApply(unlockTech(profile, tech.id), purchaseSuccessMessage(text.name, lang))}>{unlocked ? '✓' : `💎 ${tech.cost}`}</ActionButton></div>; })}</div></Panel>)}</div>;
}

function CaseArchive({ profile, lang, onNavigate, onPlan, hasSavedTeam }) {
  return <div style={{ display: 'grid', gap: 11 }}>{CASE_SUMMARIES.map(caseData => { const record = profile.case_records.find(item => item.case_id === caseData.case_id); const solved = profile.solved_cases.includes(caseData.case_id); const clueCount = record?.discovered_clues.length || 0; const cluePct = Math.round((clueCount / Math.max(1, caseData.clue_total)) * 100); const title = lang === 'en' ? caseData.en?.title : caseData.title; return <Panel key={caseData.case_id} accent={DIFF_COLOR[caseData.difficulty]}><div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><span style={{ fontSize: 34 }}>{CASE_ICON[caseData.case_id]}</span><div style={{ flex: 1, minWidth: 180 }}><div style={{ color: '#fff', fontWeight: 900 }}>{title}</div><div style={{ color: DIFF_COLOR[caseData.difficulty], fontSize: '.54rem', marginTop: 3 }}>{caseData.difficulty} · ⚡ {CASE_ENERGY_COST[caseData.difficulty]}</div><div style={{ color: 'rgba(255,255,255,.42)', fontSize: '.55rem', marginTop: 5 }}>{solved ? (lang === 'zh' ? '已侦破' : 'SOLVED') : record ? (lang === 'zh' ? '调查中' : 'IN PROGRESS') : (lang === 'zh' ? '未开始' : 'NOT STARTED')} · {lang === 'zh' ? '最佳' : 'BEST'} {record?.best_score || '—'} · {lang === 'zh' ? '尝试' : 'TRIES'} {record?.attempts || 0} · {lang === 'zh' ? '线索' : 'CLUES'} {cluePct}%</div></div><div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}><ActionButton accent="#00e5ff" onClick={() => onPlan(caseData.case_id)}>◈ {lang === 'zh' ? '战术编组' : 'TACTICAL PLAN'}</ActionButton>{hasSavedTeam && <ActionButton onClick={() => onNavigate(caseData.case_id)}>{lang === 'zh' ? '快速调查' : 'QUICK START'}</ActionButton>}</div></div></Panel>; })}</div>;
}

function IntelModule({ profile, lang, onNavigate, tx }) {
  const id = dailyIntelCaseId();
  const caseData = CASE_SUMMARIES.find(item => item.case_id === id) || CASE_SUMMARIES[0];
  const record = profile.case_records.find(item => item.case_id === id);
  const title = lang === 'en' ? caseData.en?.title : caseData.title;
  const setting = lang === 'en' ? caseData.en?.setting : caseData.setting;
  return <><Panel accent={DIFF_COLOR[caseData.difficulty]} style={{ textAlign: 'center' }}><div style={{ fontSize: 52 }}>{CASE_ICON[id]}</div><h2 style={{ color: '#fff', margin: '8px 0' }}>{title}</h2><div style={{ color: DIFF_COLOR[caseData.difficulty], fontSize: '.58rem' }}>{caseData.difficulty}</div><p style={{ color: 'rgba(230,245,255,.55)', fontSize: '.66rem', lineHeight: 1.75 }}>{setting}</p><div style={{ color: '#e8c98a', fontSize: '.6rem', marginBottom: 12 }}>{tx.todayBonus}</div><div style={{ color: 'rgba(255,255,255,.35)', fontSize: '.55rem', marginBottom: 12 }}>{lang === 'zh' ? '当前线索完成度' : 'CLUE PROGRESS'} {record?.discovered_clues.length || 0}/{caseData.clue_total}</div><ActionButton onClick={() => onNavigate(id)}>{tx.go}</ActionButton></Panel></>;
}

const MAILS = [
  { id: 'welcome', when: () => true, icon: '🛰️', zh: ['档案管理局', '欢迎加入终端侦探网络。你的调查记录将被安全归档。'], en: ['Archive Bureau', 'Welcome to the Terminal Detective network. Your records will be archived securely.'] },
  { id: 'case1', when: p => p.solved_cases.includes('Lvl_01'), icon: '🏙️', zh: ['匿名线人', '霓虹城记住了你的名字。那条暗线，也许还没有真正结束。'], en: ['Anonymous Source', 'Neon City remembers your name. That hidden thread may not be over.'] },
  { id: 'case2', when: p => p.solved_cases.includes('Lvl_02'), icon: '🔬', zh: ['量子研究所', '幽灵协议档案已解封。感谢你保住了真相。'], en: ['Quantum Institute', 'The Ghost Protocol file is unsealed. Thank you for preserving the truth.'] },
  { id: 'case3', when: p => p.solved_cases.includes('Lvl_03'), icon: '🦋', zh: ['Lena', '我终于敢开口了。谢谢你让我相信证词有意义。'], en: ['Lena', 'I can finally speak. Thank you for proving testimony matters.'] },
  { id: 'case4', when: p => p.solved_cases.includes('Lvl_04'), icon: '🧊', zh: ['极地档案署', '零度回声已被封存。你让一段被冰封的记录重新开口。'], en: ['Polar Archive Authority', 'Zero Echo is secured. You made a frozen record speak again.'] },
  { id: 'case5', when: p => p.solved_cases.includes('Lvl_05'), icon: '🛰️', zh: ['天穹调度中心', '升降梯已恢复运行。轨道之上的人们会记住这次调查。'], en: ['Skyline Control', 'The elevator is operational again. Those above the clouds will remember this investigation.'] },
  { id: 'tech', when: p => p.tech_unlocks.length > 0, icon: '⚙️', zh: ['研发终端', '首项科技已接入调查矩阵。'], en: ['Research Terminal', 'Your first technology is now wired into the investigation matrix.'] },
  { id: 'week', when: p => SEVEN_DAY_TASKS.every(task => p.reward_claims.includes(`seven:${task.id}`)), icon: '🏅', zh: ['档案管理局', '首周评估完成。你已不再是见习侦探。'], en: ['Archive Bureau', 'First-week assessment complete. You are no longer a trainee.'] },
];

function CommsModule({ profile, onApply, lang }) {
  const mails = MAILS.filter(mail => mail.when(profile));
  return <div style={{ display: 'grid', gap: 9 }}>{mails.map(mail => { const read = profile.mail_read_ids.includes(mail.id); const copy = mail[lang] || mail.zh; return <Panel key={mail.id} accent={read ? '#668899' : '#00e5ff'}><button onClick={() => !read && onApply({ profile: { ...profile, mail_read_ids: [...profile.mail_read_ids, mail.id] } }, lang === 'zh' ? '已标记为已读' : 'Marked as read')} style={{ width: '100%', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer', textAlign: 'left', fontFamily: 'monospace' }}><div style={{ display: 'flex', gap: 10 }}><span style={{ fontSize: 24 }}>{mail.icon}</span><div><div style={{ color: read ? 'rgba(255,255,255,.5)' : '#7df1ff', fontWeight: 900 }}>{copy[0]} {!read && '●'}</div><div style={{ color: 'rgba(255,255,255,.48)', fontSize: '.6rem', lineHeight: 1.7, marginTop: 5 }}>{copy[1]}</div></div></div></button>{mail.id.startsWith('case') && <div style={{ display: 'flex', gap: 7, marginTop: 9 }}>{[lang === 'zh' ? '保持联络' : 'Stay in touch', lang === 'zh' ? '档案已收到' : 'File received'].map((choice, i) => { const choiceId = `${mail.id}:${i}`; const picked = profile.mail_reply_choices.some(value => value.startsWith(`${mail.id}:`)); return <ActionButton key={choice} disabled={picked} onClick={() => onApply({ profile: { ...profile, mail_reply_choices: [...profile.mail_reply_choices, choiceId] } }, lang === 'zh' ? '回复已发送' : 'Reply sent')}>{picked ? '✓' : choice}</ActionButton>; })}</div>}</Panel>; })}</div>;
}

function AchievementsModule({ profile, onApply, lang, tx }) {
  const [filter, setFilter] = useState('all');
  const groups = ['all', ...Object.keys(GROUP_LABEL)];
  return <><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>{groups.map(group => <ActionButton key={group} accent={filter === group ? '#00e5ff' : '#668899'} onClick={() => setFilter(group)}>{group === 'all' ? (lang === 'zh' ? '全部' : 'ALL') : GROUP_LABEL[group][lang === 'zh' ? 0 : 1]}</ActionButton>)}</div><div style={{ display: 'grid', gap: 9 }}>{ACHIEVEMENTS.filter(item => filter === 'all' || item.category === filter).map(item => { const unlocked = profile.achievements.includes(item.id); const claimed = profile.reward_claims.includes(`achievement:${item.id}`); const progress = achievementProgress(profile, item.id); const text = item[lang] || item.zh; return <Panel key={item.id} accent={unlocked ? '#c5a059' : '#668899'}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><span style={{ fontSize: 25, opacity: unlocked ? 1 : .35 }}>{unlocked ? '🏅' : '🔒'}</span><div style={{ flex: 1 }}><div style={{ color: unlocked ? '#e8c98a' : 'rgba(255,255,255,.45)', fontWeight: 900 }}>{text.name}</div><div style={{ color: 'rgba(255,255,255,.38)', fontSize: '.55rem', marginTop: 4 }}>{text.desc} · {progress.current}/{progress.target} · 💎 {item.reward}</div><div style={{ height: 3, marginTop: 7, borderRadius: 3, background: 'rgba(255,255,255,.07)' }}><div style={{ height: '100%', width: `${(progress.current / progress.target) * 100}%`, borderRadius: 3, background: unlocked ? '#e8c98a' : '#00e5ff', transition: 'width .3s' }} /></div></div><ActionButton disabled={!unlocked || claimed} accent="#e8c98a" onClick={() => onApply(claimAchievement(profile, item.id), lang === 'zh' ? `领取 ${item.reward} 钻石` : `Claimed ${item.reward} diamonds`)}>{claimed ? tx.claimed : unlocked ? tx.claim : tx.locked}</ActionButton></div></Panel>; })}</div></>;
}

function CheckinModule({ profile, onCheckin, lang, tx }) {
  const rewards = [{ gold: 500 }, { diamonds: 10 }, { energy: 30 }, { gold: 800 }, { diamonds: 20 }, { items: { ap_booster: 1 } }, { diamonds: 50, gold: 1000 }];
  const nextDay = (profile.checkin_streak % 7) + 1;
  return <><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(105px,1fr))', gap: 9 }}>{rewards.map((reward, i) => <Panel key={i} accent={i + 1 === nextDay ? '#e8c98a' : '#00e5ff'} style={{ textAlign: 'center', opacity: i + 1 === nextDay ? 1 : .65 }}><div style={{ color: '#e8c98a', fontSize: '.6rem' }}>DAY {i + 1}</div><div style={{ marginTop: 8, fontSize: '.62rem' }}><RewardText reward={reward} /></div></Panel>)}</div><Panel style={{ marginTop: 14, textAlign: 'center' }}><div style={{ marginBottom: 10, color: 'rgba(255,255,255,.5)', fontSize: '.62rem' }}>{lang === 'zh' ? `连续签到 ${profile.checkin_streak} 天` : `${profile.checkin_streak}-day streak`}</div><ActionButton disabled={!canCheckin(profile)} onClick={onCheckin}>{canCheckin(profile) ? `${tx.claim} · DAY ${nextDay}` : tx.claimed}</ActionButton></Panel></>;
}

function TaskModule({ kind, profile, onApply, lang, tx }) {
  const list = kind === 'tutorial' ? TUTORIAL_TASKS : SEVEN_DAY_TASKS;
  const dayNow = daysBetween(profile.journey_started_on) + 1;
  return <div style={{ display: 'grid', gap: 9 }}>{list.map((task, index) => { const done = kind === 'tutorial' ? tutorialTaskDone(profile, task.id) : sevenDayTaskDone(profile, task.id); const claimed = profile.reward_claims.includes(`${kind}:${task.id}`); const dayLocked = kind === 'seven' && dayNow < task.day; return <Panel key={task.id} accent={claimed ? '#00ff88' : done && !dayLocked ? '#e8c98a' : '#668899'}><div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><div style={{ width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center', border: '1px solid rgba(0,229,255,.3)', color: claimed ? '#00ff88' : '#7df1ff' }}>{kind === 'seven' ? task.day : index + 1}</div><div style={{ flex: 1 }}><div style={{ fontSize: '.66rem' }}>{task[lang]}</div><div style={{ marginTop: 5, color: 'rgba(255,255,255,.42)', fontSize: '.54rem' }}><RewardText reward={task.reward} /></div></div><ActionButton disabled={!done || claimed || dayLocked} onClick={() => onApply(claimTask(profile, kind, task.id), lang === 'zh' ? '奖励已领取' : 'Reward claimed')}>{claimed ? tx.claimed : dayLocked ? `D${task.day}` : done ? tx.claim : tx.locked}</ActionButton></div></Panel>; })}</div>;
}

function EventModule({ profile, onApply, lang, tx, onNavigate }) {
  const challenge = weeklyChallenge();
  const caseData = CASE_SUMMARIES.find(item => item.case_id === challenge.caseId);
  const record = profile.weekly_records.find(item => item.cycle_id === challenge.cycleId) || {};
  const claimed = profile.reward_claims.includes(`weekly:${challenge.cycleId}`);
  const tasks = [[record.passed, lang === 'zh' ? '成功侦破指定案件' : 'Solve the featured case'], [record.clue_target, lang === 'zh' ? '收集至少 70% 线索' : 'Collect at least 70% of clues'], [record.speed_target, lang === 'zh' ? '12 回合内且混乱低于 40' : 'Finish within 12 turns and under 40 confusion']];
  return <><Panel accent={DIFF_COLOR[caseData.difficulty]}><div style={{ textAlign: 'center', fontSize: 42 }}>{CASE_ICON[caseData.case_id]}</div><div style={{ textAlign: 'center', color: '#fff', fontWeight: 900 }}>{lang === 'en' ? caseData.en?.title : caseData.title}</div><div style={{ textAlign: 'center', color: 'rgba(255,255,255,.35)', fontSize: '.54rem', marginTop: 5 }}>{challenge.cycleId}</div><div style={{ textAlign: 'center', marginTop: 10 }}><ActionButton onClick={() => onNavigate(caseData.case_id)}>{tx.go}</ActionButton></div></Panel><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{tasks.map(([done, label]) => <Panel key={label} accent={done ? '#00ff88' : '#668899'}><span style={{ color: done ? '#00ff88' : 'rgba(255,255,255,.4)' }}>{done ? '✓' : '○'} {label}</span></Panel>)}</div><Panel style={{ marginTop: 12, textAlign: 'center' }}><div style={{ marginBottom: 10 }}>🪙 1000 · 💎 40</div><ActionButton disabled={claimed || tasks.some(([done]) => !done)} onClick={() => onApply(claimWeeklyReward(profile), lang === 'zh' ? '每周奖励已领取' : 'Weekly reward claimed')}>{claimed ? tx.claimed : tx.claim}</ActionButton></Panel></>;
}

export default function HomeModules({ moduleKey, profile, busy, onApply, onCheckin, onOpenModule, onNavigate, onPlanCase, hasSavedTeam, onEnterLobby }) {
  const { lang } = useLang();
  const tx = TEXT[lang] || TEXT.zh;
  const props = { profile, onApply, lang, tx, busy };
  let content = null;
  if (moduleKey === 'profile') content = <ProfileModule {...props} />;
  else if (moduleKey === 'level_road') content = <LevelRoadModule {...props} />;
  else if (moduleKey === 'supply') content = <SupplyModule {...props} />;
  else if (moduleKey === 'diamonds') content = <DiamondSources profile={profile} onOpen={onOpenModule} lang={lang} />;
  else if (moduleKey === 'agent_market') content = <AgentMarketModule {...props} onOpenModule={onOpenModule} onEnterLobby={onEnterLobby} />;
  else if (moduleKey === 'agents') content = <OwnedAgentsModule {...props} onOpenModule={onOpenModule} onEnterLobby={onEnterLobby} />;
  else if (moduleKey === 'warehouse') content = <WarehouseModule {...props} />;
  else if (moduleKey === 'tech') content = <TechModule {...props} />;
  else if (moduleKey === 'cases') content = <CaseArchive profile={profile} lang={lang} onNavigate={onNavigate} onPlan={onPlanCase} hasSavedTeam={hasSavedTeam} />;
  else if (moduleKey === 'intel') content = <IntelModule profile={profile} lang={lang} onNavigate={onNavigate} tx={tx} />;
  else if (moduleKey === 'graph') content = <Suspense fallback={<Panel>{lang === 'zh' ? '加载案件线索…' : 'LOADING CASE CLUES…'}</Panel>}><GraphModule profile={profile} lang={lang} /></Suspense>;
  else if (moduleKey === 'comms') content = <CommsModule {...props} />;
  else if (moduleKey === 'achievements') content = <AchievementsModule {...props} />;
  else if (moduleKey === 'checkin') content = <CheckinModule profile={profile} onCheckin={onCheckin} lang={lang} tx={tx} />;
  else if (moduleKey === 'events') content = <EventModule {...props} onNavigate={onNavigate} />;
  else if (moduleKey === 'tutorial') content = <TaskModule kind="tutorial" {...props} />;
  else if (moduleKey === 'goals') content = <TaskModule kind="seven" {...props} />;
  return content;
}
