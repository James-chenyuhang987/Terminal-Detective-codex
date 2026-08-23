import { base44 } from '@/api/base44Client';

export const ENERGY_MAX = 120;
export const ENERGY_MINUTES_PER_POINT = 5;
export const ACHIEVEMENT_TOTAL = 68;
export const XP_PER_LEVEL = 4800;

const DEFAULTS = {
  detective_name: '',
  avatar: '🕵️',
  signature: '',
  level: 1,
  xp: 0,
  rank_title: '新手侦探',
  energy: ENERGY_MAX,
  energy_updated_at: null,
  diamonds: 0,
  gold: 0,
  last_checkin: null,
  checkin_streak: 0,
  achievements: [],
  solved_cases: [],
  unsolved_count: 3,
};

// 体力按真实时间恢复
export function regenEnergy(profile) {
  const now = Date.now();
  const last = profile.energy_updated_at ? new Date(profile.energy_updated_at).getTime() : now;
  const gained = Math.floor((now - last) / (ENERGY_MINUTES_PER_POINT * 60 * 1000));
  if (gained <= 0 || profile.energy >= ENERGY_MAX) {
    return { ...profile, energy_updated_at: new Date(now).toISOString() };
  }
  return {
    ...profile,
    energy: Math.min(ENERGY_MAX, profile.energy + gained),
    energy_updated_at: new Date(now).toISOString(),
  };
}

export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function canCheckin(profile) {
  return profile.last_checkin !== todayKey();
}

export function applyCheckin(profile) {
  if (!canCheckin(profile)) return { profile, reward: null };
  const streak = (profile.checkin_streak || 0) + 1;
  const reward = { energy: 30, gold: 500 + streak * 100, diamonds: 20 };
  return {
    profile: {
      ...profile,
      energy: Math.min(ENERGY_MAX + 60, profile.energy + reward.energy),
      gold: (profile.gold || 0) + reward.gold,
      diamonds: (profile.diamonds || 0) + reward.diamonds,
      last_checkin: todayKey(),
      checkin_streak: streak,
    },
    reward,
  };
}

export async function loadProfile() {
  const me = await base44.auth.me();
  const merged = {};
  Object.keys(DEFAULTS).forEach(k => {
    merged[k] = me?.[k] === undefined || me?.[k] === null ? DEFAULTS[k] : me[k];
  });
  merged.email = me?.email;
  merged.full_name = me?.full_name;
  return regenEnergy(merged);
}

export async function saveProfile(patch) {
  const clean = { ...patch };
  delete clean.email;
  delete clean.full_name;
  delete clean.id;
  await base44.auth.updateMe(clean);
}