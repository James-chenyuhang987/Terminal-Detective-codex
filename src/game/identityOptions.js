export const IDENTITY_BADGES = [
  { key: 'city', icon: '🏙', zh: '城市警局', en: 'CITY POLICE' },
  { key: 'private', icon: '🗝', zh: '私家侦探', en: 'PRIVATE DETECTIVE' },
  { key: 'bureau', icon: '🛰', zh: '特别调查局', en: 'SPECIAL INVESTIGATION BUREAU' },
];

export const DETECTIVE_TAGS = [
  { key: '冷静', zh: '冷静', en: 'CALM' },
  { key: '直觉', zh: '直觉', en: 'INTUITIVE' },
  { key: '技术流', zh: '技术流', en: 'TECH SPECIALIST' },
  { key: '心理侧写', zh: '心理侧写', en: 'PROFILER' },
  { key: '铁血', zh: '铁血', en: 'RESOLUTE' },
  { key: '书虫', zh: '书虫', en: 'SCHOLAR' },
  { key: '夜行者', zh: '夜行者', en: 'NIGHT OWL' },
  { key: '话术大师', zh: '话术大师', en: 'NEGOTIATOR' },
];

const RANK_EN = {
  '新手侦探': 'ROOKIE DETECTIVE',
  '现场调查员': 'FIELD INVESTIGATOR',
  '资深探员': 'SENIOR AGENT',
  '首席侦探': 'CHIEF DETECTIVE',
  '逻辑架构师': 'LOGIC ARCHITECT',
};

export function identityBadgeLabel(id, lang = 'zh') {
  const option = IDENTITY_BADGES.find(item => item.key === id) || IDENTITY_BADGES[1];
  return `${option.icon} ${option[lang] || option.zh}`;
}

export function detectiveTagLabel(value, lang = 'zh') {
  const option = DETECTIVE_TAGS.find(item => item.key === value || item.zh === value || item.en === value);
  return option?.[lang] || value;
}

export function rankTitleLabel(value, lang = 'zh') {
  return lang === 'en' ? (RANK_EN[value] || value) : value;
}
