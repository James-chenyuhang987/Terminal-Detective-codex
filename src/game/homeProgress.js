export const ENERGY_MAX = 120;
export const ENERGY_OVERFLOW_MAX = 180;
export const ENERGY_MINUTES_PER_POINT = 5;
export const XP_PER_LEVEL = 4800;
export const ACHIEVEMENT_TOTAL = 24;
export const KNOWN_CASE_IDS = ['Lvl_01', 'Lvl_02', 'Lvl_03'];
export const CURRENCY_CAPS = Object.freeze({ gold: 9_999_999, diamonds: 999_999 });

export const CASE_ENERGY_COST = { NORMAL: 10, HARD: 15, OMEGA: 20 };
export const CASE_GOLD_REWARD = { S: 1000, A: 750, B: 500, C: 300, D: 150 };
export const FIRST_CLEAR_DIAMONDS = { NORMAL: 20, HARD: 35, OMEGA: 50 };
export const SCORE_ORDER = { D: 1, C: 2, B: 3, A: 4, S: 5 };
const DEFAULT_CASE_TOTALS = { Lvl_01: 9, Lvl_02: 9, Lvl_03: 9 };
const HIDDEN_CLUE_IDS = ['c_secret_99', 'd_secret_99', 'e_secret_99'];

export const ITEM_CATALOG = [
  { id: 'energy_cell', icon: '🔋', currency: 'gold', cost: 400, stackLimit: 20, mission: false,
    zh: { name: '能量电池', desc: '立即恢复 30 点体力，临时上限 180。' },
    en: { name: 'Energy Cell', desc: 'Restore 30 energy immediately, up to 180.' } },
  { id: 'ap_booster', icon: '⚡', currency: 'gold', cost: 800, stackLimit: 12, mission: true,
    zh: { name: 'AP 增幅器', desc: '下一局初始 AP +3。' },
    en: { name: 'AP Booster', desc: 'Start the next case with +3 AP.' } },
  { id: 'firewall_shield', icon: '🛡️', currency: 'diamonds', cost: 35, stackLimit: 12, mission: true,
    zh: { name: '防火墙护盾', desc: '下一局抵消第一次陷阱。' },
    en: { name: 'Firewall Shield', desc: 'Negate the first trap in the next case.' } },
  { id: 'clue_scanner', icon: '📡', currency: 'diamonds', cost: 50, stackLimit: 12, mission: true,
    zh: { name: '线索扫描器', desc: '下一局自动发现起始区域一条线索。' },
    en: { name: 'Clue Scanner', desc: 'Reveal one valid clue in the starting zone.' } },
];

export const TECH_CATALOG = [
  { id: 'forensics_1', branch: 'forensics', level: 1, cost: 25, effect: { bonus_clue_chance: 0.03 },
    zh: { name: '痕迹索引', desc: '额外线索发现率 +3%' }, en: { name: 'Trace Index', desc: '+3% bonus clue chance' } },
  { id: 'forensics_2', branch: 'forensics', level: 2, cost: 60, effect: { bonus_clue_chance: 0.07 },
    zh: { name: '模式收敛', desc: '额外线索发现率累计至 +10%' }, en: { name: 'Pattern Convergence', desc: 'Bonus clue chance reaches +10%' } },
  { id: 'forensics_3', branch: 'forensics', level: 3, cost: 120, effect: { auto_unlock_first: true },
    zh: { name: '冷启动扫描', desc: '开局自动扫描一条合法线索' }, en: { name: 'Cold-start Scan', desc: 'Reveal one legal clue at case start' } },
  { id: 'network_1', branch: 'network', level: 1, cost: 25, effect: { ap_cost_discount: 0.03 },
    zh: { name: '轻量调度', desc: 'AP 消耗折扣 +3%' }, en: { name: 'Lean Scheduler', desc: '+3% AP cost discount' } },
  { id: 'network_2', branch: 'network', level: 2, cost: 60, effect: { ap_cost_discount: 0.07 },
    zh: { name: '解密内核', desc: 'AP 消耗折扣累计至 +10%' }, en: { name: 'Decrypt Kernel', desc: 'AP discount reaches +10%' } },
  { id: 'network_3', branch: 'network', level: 3, cost: 120, effect: { initial_ap_bonus: 2 },
    zh: { name: '根权限缓存', desc: '开局额外获得 2 AP' }, en: { name: 'Root Cache', desc: 'Start with 2 extra AP' } },
  { id: 'psychology_1', branch: 'psychology', level: 1, cost: 25, effect: { confusion_resistance: 0.03 },
    zh: { name: '情绪建模', desc: '混乱抗性 +3%' }, en: { name: 'Emotion Model', desc: '+3% confusion resistance' } },
  { id: 'psychology_2', branch: 'psychology', level: 2, cost: 60, effect: { confusion_resistance: 0.07 },
    zh: { name: '认知锚定', desc: '混乱抗性累计至 +10%' }, en: { name: 'Cognitive Anchor', desc: 'Confusion resistance reaches +10%' } },
  { id: 'psychology_3', branch: 'psychology', level: 3, cost: 120, effect: { bsod_immunity: true },
    zh: { name: '意志防线', desc: '免疫 BSoD 惩罚' }, en: { name: 'Will Firewall', desc: 'Ignore BSoD penalties' } },
];

const REWARD_STEPS = [10, 20, 50, 100];

export const ACHIEVEMENTS = [
  ['first_deploy', 'investigation', 0, '初次出勤', 'First Deployment', '开始第一起案件', 'Start your first case'],
  ['first_solve', 'investigation', 1, '首案告破', 'First Truth', '成功侦破第一起案件', 'Solve your first case'],
  ['three_archived', 'investigation', 2, '三案归档', 'Archive Keeper', '侦破全部三起案件', 'Solve all three cases'],
  ['all_s', 'investigation', 3, '真相架构师', 'Truth Architect', '全部案件获得 S 级', 'Earn S rank in all cases'],
  ['first_clue', 'evidence', 0, '第一线索', 'First Clue', '发现第一条线索', 'Discover your first clue'],
  ['ten_clues', 'evidence', 1, '证据猎手', 'Evidence Hunter', '累计发现 10 条不同线索', 'Discover 10 unique clues'],
  ['one_case_all_clues', 'evidence', 2, '完整证物链', 'Complete Chain', '收集任一案件全部线索', 'Collect every clue in one case'],
  ['all_case_clues', 'evidence', 3, '全域证物库', 'Omni Archive', '收集三案全部线索', 'Collect every clue in all cases'],
  ['first_link', 'reasoning', 0, '逻辑初连', 'First Connection', '建立第一条有效连线', 'Create your first valid link'],
  ['five_links', 'reasoning', 1, '推理网络', 'Reasoning Network', '累计建立 5 条有效连线', 'Create 5 valid links'],
  ['zero_invalid', 'reasoning', 2, '零误连破案', 'Flawless Logic', '零无效连线侦破案件', 'Solve a case with no invalid links'],
  ['all_hidden', 'reasoning', 3, '暗线猎人', 'Hidden Thread Hunter', '发现全部案件的隐藏线索', 'Discover every hidden clue'],
  ['ap_ten', 'efficiency', 0, '余量充足', 'AP to Spare', '破案时剩余至少 10 AP', 'Solve with at least 10 AP left'],
  ['eight_turns', 'efficiency', 1, '极速归档', 'Rapid Closure', '8 回合内破案', 'Solve within 8 turns'],
  ['calm_finish', 'efficiency', 2, '绝对冷静', 'Absolute Calm', '最终混乱不高于 20', 'Finish with confusion at 20 or less'],
  ['no_bsod', 'efficiency', 3, '稳定核心', 'Stable Core', '无 BSoD 侦破案件', 'Solve without a BSoD'],
  ['agent_level_2', 'growth', 0, '探员晋升', 'Agent Promoted', '任一探员达到 Lv.2', 'Raise one agent to Lv.2'],
  ['all_level_5', 'growth', 1, '精英小队', 'Elite Squad', '全部探员达到 Lv.5', 'Raise every agent to Lv.5'],
  ['tech_branch', 'growth', 2, '技术专精', 'Tech Specialist', '完成一条科技路线', 'Complete one tech branch'],
  ['all_tech', 'growth', 3, '全栈调查官', 'Full-stack Detective', '解锁全部九项科技', 'Unlock all nine technologies'],
  ['checkin_3', 'activity', 0, '三日值守', 'Three-day Watch', '连续签到 3 日', 'Check in for 3 consecutive days'],
  ['checkin_7', 'activity', 1, '七日值守', 'Seven-day Watch', '连续签到 7 日', 'Check in for 7 consecutive days'],
  ['tutorial_done', 'activity', 2, '新手毕业', 'Training Complete', '完成全部新手任务', 'Complete every tutorial task'],
  ['seven_done', 'activity', 3, '首周档案员', 'First-week Archivist', '完成全部七日目标', 'Complete all seven-day goals'],
].map(([id, category, rewardIndex, zhName, enName, zhDesc, enDesc]) => ({
  id, category, reward: REWARD_STEPS[rewardIndex],
  zh: { name: zhName, desc: zhDesc }, en: { name: enName, desc: enDesc },
}));

export const TUTORIAL_TASKS = [
  { id: 'register', reward: { gold: 200 }, zh: '完成侦探注册', en: 'Complete detective registration' },
  { id: 'checkin', reward: { diamonds: 10 }, zh: '完成一次签到', en: 'Complete one check-in' },
  { id: 'team', reward: { gold: 300 }, zh: '保存一次探员编队', en: 'Save an agent squad' },
  { id: 'case', reward: { items: { energy_cell: 1 } }, zh: '开始第一起案件', en: 'Start your first case' },
  { id: 'clues', reward: { items: { ap_booster: 1 } }, zh: '累计发现 3 条线索', en: 'Discover 3 clues' },
  { id: 'report', reward: { diamonds: 30 }, zh: '提交第一份调查报告', en: 'Submit your first report' },
];

export const SEVEN_DAY_TASKS = [
  { id: 'day1', day: 1, reward: { gold: 200 }, zh: '进入一次探员大厅', en: 'Enter the agent lobby' },
  { id: 'day2', day: 2, reward: { diamonds: 10 }, zh: '累计签到 2 天', en: 'Check in on 2 days' },
  { id: 'day3', day: 3, reward: { gold: 500 }, zh: '累计发现 5 条线索', en: 'Discover 5 clues' },
  { id: 'day4', day: 4, reward: { diamonds: 20 }, zh: '累计建立 2 条有效连线', en: 'Create 2 valid links' },
  { id: 'day5', day: 5, reward: { items: { ap_booster: 1 } }, zh: '成功侦破 1 起案件', en: 'Solve 1 case' },
  { id: 'day6', day: 6, reward: { diamonds: 30 }, zh: '解锁 1 项科技', en: 'Unlock 1 technology' },
  { id: 'day7', day: 7, reward: { diamonds: 100 }, zh: '获得 B 级或以上评分', en: 'Earn rank B or better' },
];

const DEFAULT_STATS = {
  cases_started: 0, cases_solved: 0, valid_links: 0, invalid_links: 0,
  reports_submitted: 0, bsod_runs: 0, team_saved: 0, lobby_visits: 0,
  best_agent_level: 0, all_agents_min_level: 0, best_score_value: 0,
};

export const PROFILE_DEFAULTS = {
  detective_name: '', avatar: '🕵️', signature: '', identity_badge: 'private', detective_tags: [], rename_count: 0,
  level: 1, xp: 0, rank_title: '新手侦探', energy: ENERGY_MAX,
  energy_updated_at: null, diamonds: 0, gold: 0, last_checkin: null,
  checkin_streak: 0, checkin_history: [], achievements: [], solved_cases: [],
  unsolved_count: 3, inventory: {}, equipped_items: [], tech_unlocks: [],
  case_records: [], activity_stats: DEFAULT_STATS, reward_claims: [],
  journey_started_on: null, mail_read_ids: [], mail_reply_choices: [],
  rewarded_runs: [], weekly_records: [], agent_progression: [], skill_loadout: [],
  saved_team_config: null, profile_revision: 0, active_session_id: '', home_progress_version: 2,
};

export const PROFILE_FIELD_KEYS = Object.freeze(Object.keys(PROFILE_DEFAULTS));

const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const currencyAmount = (value, currency) => clamp(Math.floor(finite(value)), 0, CURRENCY_CAPS[currency]);
const INVENTORY_HARD_CAP = 999;

export function localDateKey(date = new Date()) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function localDayNumber(date = new Date()) {
  const d = new Date(date);
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86400000);
}

export function daysBetween(startKey, date = new Date()) {
  if (!startKey) return 0;
  const [y, m, d] = startKey.split('-').map(Number);
  return Math.max(0, localDayNumber(date) - Math.floor(new Date(y, m - 1, d).getTime() / 86400000));
}

export function isoWeekKey(date = new Date()) {
  const d = new Date(date);
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function normalizeProfile(raw = {}, now = new Date()) {
  const allowed = Object.fromEntries(PROFILE_FIELD_KEYS
    .filter(key => Object.prototype.hasOwnProperty.call(raw || {}, key))
    .map(key => [key, raw[key]]));
  const p = { ...PROFILE_DEFAULTS, ...allowed };
  p.detective_name = typeof p.detective_name === 'string' ? p.detective_name.trim().slice(0, 10) : '';
  p.avatar = typeof p.avatar === 'string' ? p.avatar.slice(0, 16) : '🕵️';
  p.signature = typeof p.signature === 'string' ? p.signature.trim().slice(0, 30) : '';
  p.identity_badge = ['city', 'private', 'bureau'].includes(p.identity_badge) ? p.identity_badge : 'private';
  p.detective_tags = unique(p.detective_tags).filter(tag => typeof tag === 'string').map(tag => tag.slice(0, 16)).slice(0, 3);
  p.level = Math.max(1, finite(p.level, 1));
  p.xp = Math.max(0, finite(p.xp));
  p.energy = clamp(finite(p.energy, ENERGY_MAX), 0, ENERGY_OVERFLOW_MAX);
  p.diamonds = currencyAmount(p.diamonds, 'diamonds');
  p.gold = currencyAmount(p.gold, 'gold');
  p.rename_count = clamp(finite(p.rename_count), 0, 1);
  p.checkin_streak = Math.max(0, finite(p.checkin_streak));
  p.checkin_history = unique(p.checkin_history).slice(-60);
  p.achievements = unique(p.achievements);
  p.solved_cases = unique(p.solved_cases);
  p.inventory = Object.fromEntries(ITEM_CATALOG.map(item => [
    item.id,
    clamp(Math.floor(finite(p.inventory?.[item.id])), 0, INVENTORY_HARD_CAP),
  ]));
  p.equipped_items = unique(p.equipped_items).filter(id => ITEM_CATALOG.some(item => item.id === id && item.mission)).slice(0, 2);
  p.tech_unlocks = unique(p.tech_unlocks).filter(id => TECH_CATALOG.some(tech => tech.id === id));
  p.case_records = Array.isArray(p.case_records) ? p.case_records.map(record => ({
    case_id: record.case_id, difficulty: record.difficulty || 'NORMAL', attempts: Math.max(0, finite(record.attempts)),
    solves: Math.max(0, finite(record.solves)), best_score: record.best_score || null,
    best_turns: record.best_turns == null ? null : Math.max(0, finite(record.best_turns)),
    lowest_confusion: record.lowest_confusion == null ? null : clamp(finite(record.lowest_confusion), 0, 100),
    discovered_clues: unique(record.discovered_clues), valid_links: unique(record.valid_links),
    last_played_at: record.last_played_at || null,
  })).filter(record => record.case_id) : [];
  p.activity_stats = { ...DEFAULT_STATS, ...(p.activity_stats || {}) };
  Object.keys(DEFAULT_STATS).forEach(key => { p.activity_stats[key] = Math.max(0, finite(p.activity_stats[key])); });
  p.reward_claims = unique(p.reward_claims);
  p.mail_read_ids = unique(p.mail_read_ids);
  p.mail_reply_choices = unique(p.mail_reply_choices);
  // Never truncate idempotency keys: an old run must remain non-rewardable.
  p.rewarded_runs = unique(p.rewarded_runs);
  p.weekly_records = Array.isArray(p.weekly_records) ? p.weekly_records.slice(-20) : [];
  p.journey_started_on ||= localDateKey(now);
  p.agent_progression = Array.isArray(p.agent_progression) ? p.agent_progression : [];
  p.skill_loadout = Array.isArray(p.skill_loadout) ? p.skill_loadout : [];
  p.saved_team_config = p.saved_team_config && typeof p.saved_team_config === 'object' ? p.saved_team_config : null;
  p.profile_revision = Math.max(0, Math.floor(finite(p.profile_revision)));
  p.active_session_id = typeof p.active_session_id === 'string' ? p.active_session_id.slice(0, 128) : '';
  p.home_progress_version = Math.max(1, Math.floor(finite(p.home_progress_version, 1)));
  const knownSolved = p.solved_cases.filter(id => KNOWN_CASE_IDS.includes(id));
  p.unsolved_count = Math.max(0, KNOWN_CASE_IDS.length - knownSolved.length);
  return regenEnergy(p, now);
}

export function regenEnergy(profile, now = new Date()) {
  const p = { ...profile };
  const current = clamp(finite(p.energy, ENERGY_MAX), 0, ENERGY_OVERFLOW_MAX);
  const nowMs = new Date(now).getTime();
  const lastMs = p.energy_updated_at ? new Date(p.energy_updated_at).getTime() : nowMs;
  if (current >= ENERGY_MAX || !Number.isFinite(lastMs) || lastMs > nowMs) {
    return { ...p, energy: current, energy_updated_at: new Date(nowMs).toISOString() };
  }
  const interval = ENERGY_MINUTES_PER_POINT * 60000;
  const gained = Math.floor((nowMs - lastMs) / interval);
  if (gained <= 0) return { ...p, energy: current, energy_updated_at: new Date(lastMs).toISOString() };
  const energy = Math.min(ENERGY_MAX, current + gained);
  const updatedMs = energy >= ENERGY_MAX ? nowMs : lastMs + gained * interval;
  return { ...p, energy, energy_updated_at: new Date(updatedMs).toISOString() };
}

export function energyCountdown(profile, now = new Date()) {
  if (profile.energy >= ENERGY_MAX) return 0;
  const last = new Date(profile.energy_updated_at || now).getTime();
  const interval = ENERGY_MINUTES_PER_POINT * 60000;
  return Math.max(0, interval - ((new Date(now).getTime() - last) % interval));
}

function rewardProfile(profile, reward = {}) {
  const next = { ...profile };
  next.gold = currencyAmount(next.gold + finite(reward.gold), 'gold');
  next.diamonds = currencyAmount(next.diamonds + finite(reward.diamonds), 'diamonds');
  next.energy = clamp(next.energy + finite(reward.energy), 0, ENERGY_OVERFLOW_MAX);
  next.inventory = { ...next.inventory };
  Object.entries(reward.items || {}).forEach(([id, amount]) => {
    const item = ITEM_CATALOG.find(entry => entry.id === id);
    if (item) next.inventory[id] = clamp(Math.floor(finite(next.inventory[id]) + finite(amount)), 0, INVENTORY_HARD_CAP);
  });
  return next;
}

function addProfileXP(profile, amount) {
  let level = profile.level;
  let xp = profile.xp + Math.max(0, finite(amount));
  while (xp >= XP_PER_LEVEL) { xp -= XP_PER_LEVEL; level += 1; }
  const titles = [[10, '逻辑架构师'], [8, '首席侦探'], [5, '资深探员'], [3, '现场调查员'], [1, '新手侦探']];
  return { ...profile, level, xp, rank_title: titles.find(([min]) => level >= min)?.[1] || '新手侦探' };
}

export function canCheckin(profile, now = new Date()) { return profile.last_checkin !== localDateKey(now); }

export function applyCheckin(profile, now = new Date()) {
  const p = normalizeProfile(profile, now);
  if (!canCheckin(p, now)) return { profile: p, reward: null, error: 'already_claimed' };
  const today = localDateKey(now);
  const yesterday = localDateKey(new Date(new Date(now).getTime() - 86400000));
  const streak = p.last_checkin === yesterday ? p.checkin_streak + 1 : 1;
  const rewards = [
    { gold: 500 }, { diamonds: 10 }, { energy: 30 }, { gold: 800 },
    { diamonds: 20 }, { items: { ap_booster: 1 } }, { diamonds: 50, gold: 1000 },
  ];
  const reward = rewards[(streak - 1) % rewards.length];
  let next = rewardProfile(p, reward);
  next.last_checkin = today;
  next.checkin_streak = streak;
  next.checkin_history = unique([...next.checkin_history, today]).slice(-60);
  return { profile: evaluateAchievements(next), reward, day: ((streak - 1) % 7) + 1 };
}

export function quotePurchase(profile, itemId, quantity = 1) {
  const item = ITEM_CATALOG.find(entry => entry.id === itemId);
  if (!item) return {
    item: null, quantity: 0, owned: 0, stackLimit: 0, balance: 0, totalCost: 0,
    afterBalance: 0, afterOwned: 0, error: 'unknown_item', canPurchase: false,
  };
  const count = Math.floor(finite(quantity));
  const owned = Math.max(0, Math.floor(finite(profile?.inventory?.[itemId])));
  const balance = currencyAmount(profile?.[item.currency], item.currency);
  const totalCost = item.cost * Math.max(0, count);
  const quote = {
    item, quantity: count, owned, stackLimit: item.stackLimit, balance, totalCost,
    afterBalance: Math.max(0, balance - totalCost), afterOwned: owned + count,
  };
  if (count < 1 || count > 10) return { ...quote, error: 'invalid_quantity', canPurchase: false };
  if (owned + count > item.stackLimit) return { ...quote, error: 'inventory_full', canPurchase: false };
  if (balance < totalCost) return { ...quote, error: 'insufficient_funds', canPurchase: false };
  return { ...quote, error: null, canPurchase: true };
}

export function purchaseItem(profile, itemId, quantity = 1) {
  const quote = quotePurchase(profile, itemId, quantity);
  if (!quote.canPurchase || !quote.item) return { profile, ...quote };
  const { item } = quote;
  const next = {
    ...profile,
    inventory: { ...profile.inventory, [itemId]: quote.afterOwned },
    [item.currency]: quote.afterBalance,
  };
  return {
    profile: next, item, quantity: quote.quantity, error: null,
    transaction: { currency: item.currency, delta: -quote.totalCost, balance: quote.afterBalance },
  };
}

export function consumeEnergyCell(profile) {
  if (finite(profile.inventory?.energy_cell) < 1) return { profile, error: 'not_owned' };
  if (profile.energy >= ENERGY_OVERFLOW_MAX) return { profile, error: 'energy_full' };
  const next = { ...profile, inventory: { ...profile.inventory, energy_cell: profile.inventory.energy_cell - 1 } };
  const before = next.energy;
  next.energy = Math.min(ENERGY_OVERFLOW_MAX, next.energy + 30);
  return { profile: next, restored: next.energy - before };
}

export function buyAndUseEnergyCell(profile) {
  if (finite(profile.energy) >= ENERGY_OVERFLOW_MAX) return { profile, error: 'energy_full' };
  const item = ITEM_CATALOG.find(entry => entry.id === 'energy_cell');
  const balance = currencyAmount(profile.gold, 'gold');
  if (balance < item.cost) return { profile, item, error: 'insufficient_funds' };
  const before = clamp(finite(profile.energy), 0, ENERGY_OVERFLOW_MAX);
  const next = {
    ...profile,
    gold: balance - item.cost,
    energy: Math.min(ENERGY_OVERFLOW_MAX, before + 30),
  };
  return {
    profile: next, item, error: null, restored: next.energy - before,
    transaction: { currency: 'gold', delta: -item.cost, balance: next.gold },
  };
}

export function getEconomySnapshot(profile) {
  const p = profile || PROFILE_DEFAULTS;
  const pendingAchievements = ACHIEVEMENTS.filter(item => (
    p.achievements?.includes(item.id) && !p.reward_claims?.includes(`achievement:${item.id}`)
  ));
  const availableTech = TECH_CATALOG.filter(tech => (
    !p.tech_unlocks?.includes(tech.id)
    && (tech.level === 1 || p.tech_unlocks?.includes(`${tech.branch}_${tech.level - 1}`))
  )).sort((a, b) => a.cost - b.cost);
  const nextTech = availableTech[0] || null;
  const energy = clamp(finite(p.energy), 0, ENERGY_OVERFLOW_MAX);
  return {
    wallet: {
      gold: currencyAmount(p.gold, 'gold'),
      diamonds: currencyAmount(p.diamonds, 'diamonds'),
    },
    energy: {
      current: energy,
      baseCap: ENERGY_MAX,
      overflowCap: ENERGY_OVERFLOW_MAX,
      percent: Math.round((energy / ENERGY_MAX) * 100),
      availableDifficulties: Object.entries(CASE_ENERGY_COST)
        .filter(([, cost]) => energy >= cost).map(([difficulty]) => difficulty),
    },
    pendingDiamonds: pendingAchievements.reduce((sum, item) => sum + item.reward, 0),
    pendingAchievementCount: pendingAchievements.length,
    nextTech: nextTech ? { id: nextTech.id, cost: nextTech.cost, affordable: finite(p.diamonds) >= nextTech.cost } : null,
    buyingPower: Object.fromEntries(ITEM_CATALOG.map(item => [
      item.id,
      Math.min(
        Math.floor(currencyAmount(p[item.currency], item.currency) / item.cost),
        Math.max(0, item.stackLimit - Math.floor(finite(p.inventory?.[item.id]))),
      ),
    ])),
  };
}

export function toggleEquipItem(profile, itemId) {
  const item = ITEM_CATALOG.find(entry => entry.id === itemId && entry.mission);
  if (!item || finite(profile.inventory?.[itemId]) < 1) return { profile, error: 'not_owned' };
  const equipped = [...profile.equipped_items];
  if (equipped.includes(itemId)) return { profile: { ...profile, equipped_items: equipped.filter(id => id !== itemId) } };
  if (equipped.length >= 2) return { profile, error: 'equip_limit' };
  return { profile: { ...profile, equipped_items: [...equipped, itemId] } };
}

export function unlockTech(profile, techId) {
  const tech = TECH_CATALOG.find(entry => entry.id === techId);
  if (!tech) return { profile, error: 'unknown_tech' };
  if (profile.tech_unlocks.includes(techId)) return { profile, error: 'already_unlocked' };
  if (tech.level > 1 && !profile.tech_unlocks.includes(`${tech.branch}_${tech.level - 1}`)) return { profile, error: 'prerequisite' };
  if (profile.diamonds < tech.cost) return { profile, error: 'insufficient_funds' };
  const next = evaluateAchievements({ ...profile, diamonds: profile.diamonds - tech.cost, tech_unlocks: [...profile.tech_unlocks, techId] });
  return { profile: next, tech };
}

export function getTechEffects(profile) {
  const effects = {};
  TECH_CATALOG.filter(tech => profile.tech_unlocks.includes(tech.id)).forEach(tech => {
    Object.entries(tech.effect).forEach(([key, value]) => {
      effects[key] = typeof value === 'number' ? finite(effects[key]) + value : value;
    });
  });
  return effects;
}

function recordFor(profile, caseData) {
  return profile.case_records.find(record => record.case_id === caseData.case_id) || {
    case_id: caseData.case_id, difficulty: caseData.difficulty || 'NORMAL', attempts: 0, solves: 0,
    best_score: null, best_turns: null, lowest_confusion: null, discovered_clues: [], valid_links: [], last_played_at: null,
  };
}

function replaceRecord(profile, record) {
  return { ...profile, case_records: [...profile.case_records.filter(item => item.case_id !== record.case_id), record] };
}

export function startCase(profile, caseData, now = new Date()) {
  let next = normalizeProfile(profile, now);
  const cost = CASE_ENERGY_COST[caseData.difficulty] ?? 10;
  if (next.energy < cost) return { profile: next, error: 'insufficient_energy', cost };
  const equipped = [...next.equipped_items];
  const tech = getTechEffects(next);
  const effects = {
    skill_effects: {
      bonus_clue_chance: finite(tech.bonus_clue_chance), ap_cost_discount: finite(tech.ap_cost_discount),
      confusion_resistance: finite(tech.confusion_resistance), auto_unlock_first: tech.auto_unlock_first === true || equipped.includes('clue_scanner'),
      bsod_immunity: tech.bsod_immunity === true,
    },
    initial_ap_bonus: finite(tech.initial_ap_bonus) + (equipped.includes('ap_booster') ? 3 : 0),
    ignore_first_trap: equipped.includes('firewall_shield'),
  };
  next = { ...next, energy: next.energy - cost, equipped_items: [], inventory: { ...next.inventory },
    activity_stats: { ...next.activity_stats, cases_started: next.activity_stats.cases_started + 1 } };
  equipped.forEach(id => { next.inventory[id] = Math.max(0, finite(next.inventory[id]) - 1); });
  const record = { ...recordFor(next, caseData), attempts: recordFor(next, caseData).attempts + 1, last_played_at: new Date(now).toISOString() };
  next = evaluateAchievements(replaceRecord(next, record));
  return { profile: next, effects, cost };
}

function pairKey(pair) {
  const values = Array.isArray(pair) ? pair : [pair?.a, pair?.b];
  return values.filter(Boolean).sort().join('|');
}

export function dailyIntelCaseId(date = new Date(), caseIds = ['Lvl_01', 'Lvl_02', 'Lvl_03']) {
  return caseIds[Math.abs(localDayNumber(date)) % caseIds.length];
}

export function weeklyChallenge(date = new Date(), caseIds = ['Lvl_01', 'Lvl_02', 'Lvl_03']) {
  const cycleId = isoWeekKey(date);
  const weekNumber = finite(cycleId.split('W')[1], 1);
  return { cycleId, caseId: caseIds[(weekNumber - 1) % caseIds.length] };
}

export function settleCase(profile, summary, now = new Date()) {
  let next = normalizeProfile(profile, now);
  if (!summary?.run_id) return { profile: next, error: 'missing_run_id' };
  if (next.rewarded_runs.includes(summary.run_id)) return { profile: next, duplicate: true };
  next.rewarded_runs = [...next.rewarded_runs, summary.run_id];
  const existing = recordFor(next, summary);
  const validKeys = unique([...(existing.valid_links || []), ...(summary.valid_links || []).map(pairKey)]);
  const clues = unique([...(existing.discovered_clues || []), ...(summary.clues || [])]);
  const passed = summary.is_passed === true;
  const score = summary.score || 'D';
  const better = !existing.best_score || (SCORE_ORDER[score] || 0) > (SCORE_ORDER[existing.best_score] || 0);
  const record = {
    ...existing, difficulty: summary.difficulty || existing.difficulty, solves: existing.solves + (passed ? 1 : 0),
    best_score: passed && better ? score : existing.best_score,
    best_turns: passed ? Math.min(existing.best_turns ?? Infinity, finite(summary.turns)) : existing.best_turns,
    lowest_confusion: passed ? Math.min(existing.lowest_confusion ?? Infinity, finite(summary.confusion, 100)) : existing.lowest_confusion,
    discovered_clues: clues, valid_links: validKeys, last_played_at: new Date(now).toISOString(),
  };
  next = replaceRecord(next, record);
  next.activity_stats = {
    ...next.activity_stats,
    cases_solved: next.activity_stats.cases_solved + (passed ? 1 : 0),
    valid_links: next.activity_stats.valid_links + Math.max(0, finite(summary.valid_link_count)),
    invalid_links: next.activity_stats.invalid_links + Math.max(0, finite(summary.invalid_link_count)),
    reports_submitted: next.activity_stats.reports_submitted + 1,
    bsod_runs: next.activity_stats.bsod_runs + (summary.bsod_count > 0 ? 1 : 0),
    best_agent_level: Math.max(next.activity_stats.best_agent_level, finite(summary.best_agent_level)),
    all_agents_min_level: Math.max(next.activity_stats.all_agents_min_level, finite(summary.all_agents_min_level)),
    best_score_value: Math.max(next.activity_stats.best_score_value, passed ? (SCORE_ORDER[score] || 0) : 0),
  };
  const firstClear = passed && !next.solved_cases.includes(summary.case_id);
  if (passed) {
    next.solved_cases = unique([...next.solved_cases, summary.case_id]);
    next = rewardProfile(next, {
      gold: CASE_GOLD_REWARD[score] || 0,
      diamonds: firstClear ? (FIRST_CLEAR_DIAMONDS[summary.difficulty] || 0) : 0,
    });
    next = addProfileXP(next, summary.xp_gain);
    const dailyKey = `intel:${localDateKey(now)}`;
    if (dailyIntelCaseId(now) === summary.case_id && !next.reward_claims.includes(dailyKey)) {
      next.gold = currencyAmount(next.gold + 250, 'gold');
      next.reward_claims = [...next.reward_claims, dailyKey];
    }
  }
  const weekly = weeklyChallenge(now);
  if (summary.case_id === weekly.caseId) {
    const prior = next.weekly_records.find(item => item.cycle_id === weekly.cycleId) || {};
    const weeklyRecord = {
      cycle_id: weekly.cycleId, case_id: weekly.caseId,
      passed: prior.passed || passed,
      clue_target: prior.clue_target || (passed && finite(summary.clue_ratio) >= 0.7),
      speed_target: prior.speed_target || (passed && finite(summary.turns) <= 12 && finite(summary.confusion) < 40),
    };
    next.weekly_records = [...next.weekly_records.filter(item => item.cycle_id !== weekly.cycleId), weeklyRecord].slice(-20);
  }
  next.unsolved_count = Math.max(0, KNOWN_CASE_IDS.length - next.solved_cases.filter(id => KNOWN_CASE_IDS.includes(id)).length);
  next = evaluateAchievements(next, summary);
  return { profile: next, firstClear, passed };
}

function totalUniqueClues(profile) {
  return unique(profile.case_records
    .filter(record => KNOWN_CASE_IDS.includes(record.case_id))
    .flatMap(record => record.discovered_clues || [])).length;
}

function allCaseClues(profile, caseTotals = {}) {
  const ids = Object.keys(caseTotals);
  return ids.length >= 3 && ids.every(id => (profile.case_records.find(record => record.case_id === id)?.discovered_clues.length || 0) >= caseTotals[id]);
}

function achievementMet(id, profile, latest = {}, caseTotals = DEFAULT_CASE_TOTALS) {
  const stats = profile.activity_stats;
  const records = profile.case_records.filter(record => KNOWN_CASE_IDS.includes(record.case_id));
  const totalClues = totalUniqueClues(profile);
  const techBranches = ['forensics', 'network', 'psychology'];
  const claims = profile.reward_claims;
  const checks = {
    first_deploy: stats.cases_started >= 1,
    first_solve: stats.cases_solved >= 1,
    three_archived: unique(profile.solved_cases.filter(id => KNOWN_CASE_IDS.includes(id))).length >= KNOWN_CASE_IDS.length,
    all_s: records.filter(record => record.best_score === 'S').length >= 3,
    first_clue: totalClues >= 1,
    ten_clues: totalClues >= 10,
    one_case_all_clues: Object.entries(caseTotals).some(([id, total]) => (records.find(record => record.case_id === id)?.discovered_clues.length || 0) >= total),
    all_case_clues: allCaseClues(profile, caseTotals),
    first_link: stats.valid_links >= 1,
    five_links: stats.valid_links >= 5,
    zero_invalid: latest.is_passed && finite(latest.invalid_link_count) === 0,
    all_hidden: HIDDEN_CLUE_IDS.every(clueId => records.some(record => record.discovered_clues.includes(clueId))),
    ap_ten: latest.is_passed && finite(latest.ap_left) >= 10,
    eight_turns: latest.is_passed && finite(latest.turns) <= 8,
    calm_finish: latest.is_passed && finite(latest.confusion, 100) <= 20,
    no_bsod: latest.is_passed && finite(latest.bsod_count) === 0,
    agent_level_2: stats.best_agent_level >= 2,
    all_level_5: stats.all_agents_min_level >= 5,
    tech_branch: techBranches.some(branch => [1, 2, 3].every(level => profile.tech_unlocks.includes(`${branch}_${level}`))),
    all_tech: profile.tech_unlocks.length >= 9,
    checkin_3: profile.checkin_streak >= 3,
    checkin_7: profile.checkin_streak >= 7,
    tutorial_done: TUTORIAL_TASKS.every(task => claims.includes(`tutorial:${task.id}`)),
    seven_done: SEVEN_DAY_TASKS.every(task => claims.includes(`seven:${task.id}`)),
  };
  return checks[id] === true;
}

export function evaluateAchievements(profile, latest = {}, caseTotals = DEFAULT_CASE_TOTALS) {
  const unlocked = ACHIEVEMENTS.filter(item => achievementMet(item.id, profile, latest, caseTotals)).map(item => item.id);
  return { ...profile, achievements: unique([...profile.achievements, ...unlocked]) };
}

export function achievementProgress(profile, id, caseTotals = DEFAULT_CASE_TOTALS) {
  const stats = profile.activity_stats;
  const records = profile.case_records.filter(record => KNOWN_CASE_IDS.includes(record.case_id));
  const totalClues = totalUniqueClues(profile);
  const unlocked = profile.achievements.includes(id);
  const branchProgress = Math.max(...['forensics', 'network', 'psychology'].map(branch =>
    [1, 2, 3].filter(level => profile.tech_unlocks.includes(`${branch}_${level}`)).length
  ));
  const binary = () => ({ current: unlocked ? 1 : 0, target: 1 });
  const values = {
    first_deploy: [stats.cases_started, 1], first_solve: [stats.cases_solved, 1],
    three_archived: [unique(profile.solved_cases.filter(id => KNOWN_CASE_IDS.includes(id))).length, KNOWN_CASE_IDS.length],
    all_s: [records.filter(record => record.best_score === 'S').length, 3],
    first_clue: [totalClues, 1], ten_clues: [totalClues, 10],
    one_case_all_clues: [Math.max(0, ...records.map(record => record.discovered_clues.length)), Math.max(...Object.values(caseTotals))],
    all_case_clues: [totalClues, Object.values(caseTotals).reduce((sum, total) => sum + total, 0)],
    first_link: [stats.valid_links, 1], five_links: [stats.valid_links, 5],
    all_hidden: [HIDDEN_CLUE_IDS.filter(clueId => records.some(record => record.discovered_clues.includes(clueId))).length, HIDDEN_CLUE_IDS.length],
    agent_level_2: [stats.best_agent_level, 2], all_level_5: [stats.all_agents_min_level, 5],
    tech_branch: [branchProgress, 3], all_tech: [profile.tech_unlocks.length, 9],
    checkin_3: [profile.checkin_streak, 3], checkin_7: [profile.checkin_streak, 7],
    tutorial_done: [TUTORIAL_TASKS.filter(task => profile.reward_claims.includes(`tutorial:${task.id}`)).length, TUTORIAL_TASKS.length],
    seven_done: [SEVEN_DAY_TASKS.filter(task => profile.reward_claims.includes(`seven:${task.id}`)).length, SEVEN_DAY_TASKS.length],
  };
  if (!values[id]) return binary();
  const [current, target] = values[id];
  return { current: Math.min(target, Math.max(0, finite(current))), target };
}

export function claimAchievement(profile, achievementId) {
  const achievement = ACHIEVEMENTS.find(item => item.id === achievementId);
  const claimId = `achievement:${achievementId}`;
  if (!achievement || !profile.achievements.includes(achievementId)) return { profile, error: 'locked' };
  if (profile.reward_claims.includes(claimId)) return { profile, error: 'already_claimed' };
  return { profile: { ...profile, diamonds: profile.diamonds + achievement.reward, reward_claims: [...profile.reward_claims, claimId] }, reward: { diamonds: achievement.reward } };
}

export function tutorialTaskDone(profile, id) {
  const stats = profile.activity_stats;
  const checks = {
    register: !!profile.detective_name, checkin: profile.checkin_history.length >= 1,
    team: stats.team_saved >= 1, case: stats.cases_started >= 1,
    clues: totalUniqueClues(profile) >= 3, report: stats.reports_submitted >= 1,
  };
  return checks[id] === true;
}

export function sevenDayTaskDone(profile, id) {
  const stats = profile.activity_stats;
  const checks = {
    day1: stats.lobby_visits >= 1, day2: profile.checkin_history.length >= 2,
    day3: totalUniqueClues(profile) >= 5, day4: stats.valid_links >= 2,
    day5: stats.cases_solved >= 1, day6: profile.tech_unlocks.length >= 1,
    day7: stats.best_score_value >= SCORE_ORDER.B,
  };
  return checks[id] === true;
}

export function claimTask(profile, kind, taskId, now = new Date()) {
  const list = kind === 'tutorial' ? TUTORIAL_TASKS : SEVEN_DAY_TASKS;
  const task = list.find(item => item.id === taskId);
  const claimId = `${kind}:${taskId}`;
  if (!task) return { profile, error: 'unknown_task' };
  if (profile.reward_claims.includes(claimId)) return { profile, error: 'already_claimed' };
  if (kind === 'seven' && daysBetween(profile.journey_started_on, now) + 1 < task.day) return { profile, error: 'day_locked' };
  const done = kind === 'tutorial' ? tutorialTaskDone(profile, taskId) : sevenDayTaskDone(profile, taskId);
  if (!done) return { profile, error: 'incomplete' };
  let next = rewardProfile(profile, task.reward);
  next.reward_claims = [...next.reward_claims, claimId];
  next = evaluateAchievements(next);
  return { profile: next, reward: task.reward };
}

export function claimWeeklyReward(profile, now = new Date()) {
  const weekly = weeklyChallenge(now);
  const record = profile.weekly_records.find(item => item.cycle_id === weekly.cycleId);
  const claimId = `weekly:${weekly.cycleId}`;
  if (!record?.passed || !record?.clue_target || !record?.speed_target) return { profile, error: 'incomplete' };
  if (profile.reward_claims.includes(claimId)) return { profile, error: 'already_claimed' };
  const next = rewardProfile(profile, { gold: 1000, diamonds: 40 });
  next.reward_claims = [...next.reward_claims, claimId];
  return { profile: next, reward: { gold: 1000, diamonds: 40 } };
}

export function markActivity(profile, key, amount = 1) {
  if (!(key in DEFAULT_STATS)) return profile;
  return evaluateAchievements({ ...profile, activity_stats: { ...profile.activity_stats, [key]: profile.activity_stats[key] + amount } });
}

export function editIdentity(profile, patch) {
  const next = { ...profile };
  if (typeof patch.avatar === 'string') next.avatar = patch.avatar;
  if (typeof patch.signature === 'string') next.signature = patch.signature.trim().slice(0, 30);
  if (['city', 'private', 'bureau'].includes(patch.identity_badge)) next.identity_badge = patch.identity_badge;
  if (Array.isArray(patch.detective_tags)) next.detective_tags = unique(patch.detective_tags)
    .filter(tag => typeof tag === 'string').map(tag => tag.slice(0, 16)).slice(0, 3);
  const name = typeof patch.detective_name === 'string' ? patch.detective_name.trim().slice(0, 10) : profile.detective_name;
  if (name && name !== profile.detective_name) {
    if (profile.rename_count >= 1) return { profile, error: 'rename_used' };
    next.detective_name = name;
    next.rename_count = profile.rename_count + 1;
  }
  return { profile: next };
}
