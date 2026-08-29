const MODULE_META = {
  zh: {
    profile: ['🪪 侦探档案', '身份、等级与调查统计'],
    level_road: ['🛤 等级之路', '积累调查经验，领取每一级成长奖励'],
    supply: ['⚡ 补给中心', '体力每 5 分钟恢复 1 点'],
    diamonds: ['💎 钻石来源', '仅通过游戏进度获得，不含真实付费'],
    warehouse: ['🎒 物品仓库', '道具、商店与下一局装备'],
    graph: ['🕸 线索图谱', '只显示你真实发现的证据'],
    tech: ['⚙️ 科技研发', '永久能力将叠加到探员技能'],
    comms: ['✉️ 探员通讯', '系统通知与单机剧情联络'],
    intel: ['📰 今日情报', '每日轮换的优先调查档案'],
    cases: ['🗂 未解案件', '档案状态、最佳评分与调查成本'],
    achievements: ['🏅 成就徽章', '24 项长期调查目标'],
    checkin: ['📅 每日签到', '七日奖励循环，连续签到进度保留'],
    events: ['🎁 活动中心', '每周轮换的单人挑战'],
    tutorial: ['📖 新手任务', '完成基础调查流程并领取奖励'],
    goals: ['🎯 七日目标', '按旅程天数逐步解锁'],
    agent_market: ['◈ 全息探员市场', '使用游戏内钻石签约高阶支援探员'],
    agents: ['🕵️ 探员名册', '三名核心探员与已签约的支援成员'],
    settings: ['⚙️ 设置中心', '游戏、画面、语言与账户设置'],
  },
  en: {
    profile: ['🪪 DETECTIVE PROFILE', 'Identity, level and investigation statistics'],
    level_road: ['🛤 LEVEL ROAD', 'Earn investigation XP and claim every level reward'],
    supply: ['⚡ SUPPLY CENTER', 'Recover 1 energy every 5 minutes'],
    diamonds: ['💎 DIAMOND SOURCES', 'Earned through play only; no real-money purchases'],
    warehouse: ['🎒 WAREHOUSE', 'Inventory, store and next-case loadout'],
    graph: ['🕸 CLUE GRAPH', 'Only evidence you actually discovered is shown'],
    tech: ['⚙️ RESEARCH', 'Permanent upgrades stack with agent skills'],
    comms: ['✉️ COMMS', 'System notices and single-player story contacts'],
    intel: ['📰 DAILY INTEL', 'A rotating priority case file'],
    cases: ['🗂 OPEN CASES', 'Status, best score and investigation cost'],
    achievements: ['🏅 ACHIEVEMENTS', '24 long-term detective goals'],
    checkin: ['📅 DAILY CHECK-IN', 'Seven-day reward cycle with persistent streak'],
    events: ['🎁 EVENT CENTER', 'A rotating weekly solo challenge'],
    tutorial: ['📖 ROOKIE TASKS', 'Learn the core loop and claim rewards'],
    goals: ['🎯 SEVEN-DAY GOALS', 'Unlock objectives as the journey advances'],
    agent_market: ['◈ HOLOGRAPHIC AGENT MARKET', 'Recruit advanced support agents with earned diamonds'],
    agents: ['🕵️ AGENT ROSTER', 'Your three core agents and recruited support members'],
    settings: ['⚙️ SETTINGS', 'Game, visuals, language and account'],
  },
};

export function getHomeModuleMeta(moduleKey, lang = 'zh') {
  const catalog = MODULE_META[lang] || MODULE_META.zh;
  const [title, subtitle] = catalog[moduleKey] || catalog.warehouse;
  return {
    title,
    subtitle,
    width: moduleKey === 'agent_market' || moduleKey === 'agents' || moduleKey === 'level_road' ? 820 : moduleKey === 'settings' ? 400 : 620,
  };
}
