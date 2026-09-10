// Original bureau linework, shared by SVG controls and canvas effects.
export const ICON_PATHS = Object.freeze({
  search: ['M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14', 'm15 15 6 6', 'M7 10h6M10 7v6'],
  eye: ['M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  detective: ['m5 9 2-6h10l2 6M2 10h20M7 14l3 1m4 0 3-1M6 21l2-4 4 2 4-2 2 4'],
  fingerprint: ['M4 12a8 8 0 0 1 16 0v3M7 15v-3a5 5 0 0 1 10 0v4l-1 5M10 20l1-5v-3a1 1 0 0 1 2 0v5M4 16l-1 4M7 18l-1 4'],
  shield: ['m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Z', 'm8 12 3 3 5-6'],
  badge: ['m12 2 3 5 6 1-4 5 1 7-6-3-6 3 1-7-4-5 6-1 3-5Z'],
  star: ['m12 3 3 6 6 1-4 5 1 6-6-3-6 3 1-6-4-5 6-1 3-6Z'],
  crown: ['m3 6 4 4 5-7 5 7 4-4-2 13H5L3 6ZM6 22h12'],
  trophy: ['M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v4l4 3m10-7h4v4l-4 3M12 15v5m-4 1h8'],
  bolt: ['m14 2-9 12h6l-1 8 9-12h-6l1-8Z'],
  coin: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'M8 7h8v10H8V7Zm4 0v10'],
  gem: ['m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M8 8l4 13 4-13M9 3 8 8m7-5 1 5'],
  battery: ['M3 7h16v12H3V7Zm16 4h3v4h-3M6 10v6m3-6v6m3-6v6'],
  briefcase: ['M3 7h18v14H3V7Zm5 0V3h8v4M3 12l9 3 9-3M10 12h4v5h-4v-5Z'],
  archive: ['M3 3h18v5H3V3Zm2 5v13h14V8M9 12h6m-6 4h6'],
  file: ['M5 2h9l5 5v15H5V2Zm9 0v6h5M8 12h8m-8 4h6'],
  clipboard: ['M8 5H4v17h16V5h-4M8 2h8v5H8V2Zm0 10h8m-8 5h6'],
  book: ['M12 5v16M2 3h6l4 2 4-2h6v16h-6l-4 2-4-2H2V3Z'],
  mail: ['M2 5h20v14H2V5Zm0 0 10 8L22 5M2 19l7-8m13 8-7-8'],
  calendar: ['M4 5h16v17H4V5Zm0 5h16M8 2v6m8-6v6M8 14h2m4 0h2m-8 4h2'],
  gift: ['M2 8h20v5H2V8Zm2 5v9h16v-9M12 8v14M12 8C0 8 7-3 12 8Zm0 0C24 8 17-3 12 8Z'],
  settings: ['M9 3h6l1 4 4 2v6l-4 2-1 4H9l-1-4-4-2V9l4-2 1-4Z', 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  sliders: ['M4 3v18M12 3v18M20 3v18M1 8h6m2 8h6m2-10h6'],
  lock: ['M5 10h14v12H5V10Zm3 0V6a4 4 0 0 1 8 0v4M12 14v4'],
  unlock: ['M5 10h14v12H5V10Zm3 0V6a4 4 0 0 1 8 0M12 14v4'],
  key: ['M8 3a5 5 0 1 0 0 10A5 5 0 0 0 8 3Zm4 9 9 9m-6-6 3-3m0 6 3-3'],
  user: ['M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M4 22v-3a8 8 0 0 1 16 0v3'],
  users: ['M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-3a7 7 0 0 1 14 0v3M17 3a4 4 0 0 1 0 8m2 3a7 7 0 0 1 3 5v2'],
  id: ['M2 5h20v16H2V5ZM7 9a2 2 0 1 0 0 4 2 2 0 0 0 0-4M4 17a3 3 0 0 1 6 0m4-7h5m-5 4h5m-5 4h3'],
  robot: ['M4 7h16v14H4V7ZM12 3v4M9 3h6M8 11v3m8-3v3m-8 3h8M1 11v6m22-6v6'],
  brain: ['M12 4c-4-4-8 0-7 4-5 3-2 8 0 9-1 5 5 6 7 2V4Zm0 0c4-4 8 0 7 4 5 3 2 8 0 9 1 5-5 6-7 2M5 8l3 2m-3 7 3-3m11-6-3 2m3 7-3-3'],
  microscope: ['m10 2 7 3-4 9-7-3 4-9ZM8 13l-2 4m-3 0h9M16 8c9 7 3 13-4 13H4M12 21v-4'],
  flask: ['M8 2h8M9 2v7L3 20l1 2h16l1-2-6-11V2M6 15h12m-8 3h1m3-1h1'],
  dna: ['M6 2c0 9 12 11 12 20M18 2C18 11 6 13 6 22M6 3h12M8 7h8m-8 10h8M6 21h12'],
  terminal: ['M2 4h20v16H2V4Zm3 4 4 4-4 4m7 0h6'],
  chip: ['M6 6h12v12H6V6ZM9 9h6v6H9V9ZM9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4'],
  disk: ['M3 3h15l3 3v15H3V3Zm4 0v7h10V3M7 21v-7h10v7'],
  globe: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M2 12h20M12 2c-6 6-6 14 0 20 6-6 6-14 0-20'],
  signal: ['M4 20v-4m5 4v-8m5 8V8m5 12V4'],
  radar: ['M12 2a10 10 0 1 0 10 10M12 7a5 5 0 1 0 5 5M12 12l9-9M12 2v10h10'],
  satellite: ['m8 9 7 7m-8-5 4-4 6 6-4 4-6-6ZM2 8l4-4 3 3-4 4-3-3Zm11 11 4-4 3 3-4 4-3-3M16 3a5 5 0 0 1 5 5m-5-2a2 2 0 0 1 2 2'],
  map: ['m2 5 7-3 6 3 7-3v17l-7 3-6-3-7 3V5Zm7-3v17m6-14v17'],
  pin: ['M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7Z', 'M12 6a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  compass: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20', 'm16 8-2 6-6 2 2-6 6-2Z'],
  city: ['M2 22V9h6v13M8 22V2h8v20m0 0V6h6v16M11 6h2m-2 4h2m-2 4h2m-2 4h2M4 13h1m14-3h1m-1 4h1'],
  building: ['m2 8 10-6 10 6H2Zm2 4v7m5-7v7m6-7v7m5-7v7M2 22h20'],
  route: ['M3 22 8 2m8 0 5 20M12 3v3m0 4v4m0 4v4'],
  camera: ['M2 7h5l2-4h6l2 4h5v14H2V7ZM12 9a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
  film: ['M2 3h20v18H2V3ZM6 3v18M18 3v18M2 8h4m-4 8h4M18 8h4m-4 8h4'],
  microphone: ['M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3ZM5 10v2a7 7 0 0 0 14 0v-2M12 19v3m-4 0h8'],
  chat: ['M2 3h20v14H9l-6 5v-5H2V3Zm4 5h12M6 12h8'],
  phone: ['m5 2 4 5-3 3 8 8 3-3 5 4-2 3C10 23 1 14 2 4l3-2Z'],
  link: ['m9 15 6-6M9 5l2-2a5 5 0 0 1 7 7l-3 3M15 19l-2 2a5 5 0 0 1-7-7l3-3'],
  network: ['M12 2v6m0 8v6M2 12h6m8 0h6M5 5l4 4m6 6 4 4M5 19l4-4m6-6 4-4M12 8l4 4-4 4-4-4 4-4Z'],
  puzzle: ['M3 3h7c-2 6 6 6 4 0h7v7c-6-2-6 6 0 4v7h-7c2-6-6-6-4 0H3v-7c6 2 6-6 0-4V3Z'],
  chart: ['M3 2v20h19M7 17v-6m5 6V6m5 11V9'],
  target: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 10v4m-2-2h4'],
  wrench: ['M13 3a6 6 0 0 0-7 8l-4 7a3 3 0 0 0 4 4l7-6a6 6 0 0 0 8-7l-4 4-5-5 1-5Z'],
  scissors: ['m8 9 12 12M8 15 20 3M5 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M5 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6'],
  paperclip: ['m8 12 7-7c5-5 9 1 5 5L9 21c-6 6-11-1-7-5L13 5c3-3 6 1 3 4l-9 9'],
  edit: ['m4 15 12-12 5 5L9 20l-7 2 2-7Zm9-9 5 5'],
  dice: ['M3 3h18v18H3V3ZM7 7h.01M17 7h.01M12 12h.01M7 17h.01M17 17h.01'],
  owl: ['m4 3 5 3h6l5-3v11l-8 8-8-8V3ZM8 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6M16 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6M10 16l2 2 2-2'],
  wolf: ['m3 2 6 6h6l6-6-2 15-7 5-7-5L3 2ZM7 12l3 2m7-2-3 2m-4 3h4l-2 3-2-3Z'],
  hat: ['m5 14 2-11h10l2 11M2 15c3 8 17 8 20 0H2Zm4-5h12'],
  eagle: ['m2 4 8 5 2-3 2 3 8-5-4 11-4 1-2 6-2-6-4-1L2 4Z'],
  snake: ['M4 18c-5-8 17-2 16-10-1-8-10-6-10-1 0 4 7 4 7 0M4 18c4 7 14 4 12 0M20 8l2 2m-2-2 2-2'],
  butterfly: ['M12 4v18M12 12C-2-7-2 14 8 14c-9 9 3 10 4 1 1 9 13 8 4-1 10 0 10-21-4-2ZM9 2l3 3 3-3'],
  mask: ['M3 3c5 3 13 3 18 0v9c0 6-9 10-9 10S3 18 3 12V3ZM7 10l3 1m4 0 3-1m-9 5c3 2 5 2 8 0'],
  ghost: ['M4 22V10a8 8 0 0 1 16 0v12l-4-3-4 3-4-3-4 3ZM8 10v2m8-2v2m-6 4h4'],
  calm: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M7 9h2m6 0h2m-9 7h8'],
  nervous: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M7 10h2m6 0h2m-9 7 2-2 2 2 2-2 2 2M18 4l-2 3'],
  angry: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m-6 5 4 3m8-3-4 3m-6 7c3-3 5-3 8 0'],
  heart: ['M12 22C-5 11 2-3 12 6 22-3 29 11 12 22Z'],
  flame: ['M13 2c2 9 8 8 8 14a9 9 0 0 1-18 0c0-5 4-7 5-10 0 5 3 6 4 6 2-4 1-6 1-10Z'],
  snow: ['M12 2v20M3 7l18 10M3 17 21 7M9 4l3 3 3-3M9 20l3-3 3 3'],
  wave: ['M2 6c5-7 7 7 12 0s6-1 8 0M2 12c5-7 7 7 12 0s6-1 8 0M2 18c5-7 7 7 12 0s6-1 8 0'],
  sun: ['M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2'],
  moon: ['M21 14A10 10 0 0 1 10 2a10 10 0 1 0 11 12Z'],
  cloud: ['M7 19a5 5 0 1 1 0-10c1-8 13-8 13 1 5 1 4 9-1 9H7Z'],
  coffee: ['M3 7h14v9a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V7Zm14 2h5v6h-5M6 2v2m5-2v2m5-2v2'],
  box: ['m2 6 10-4 10 4v12l-10 4-10-4V6Zm0 0 10 4 10-4M12 10v12M7 4l10 4'],
  anchor: ['M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6M12 8v14M7 11h10M2 15v3h4m16-3v3h-4M3 18c3 5 15 5 18 0'],
  door: ['M4 22V2h16v20M7 22V5l10 3v14M13 15h1'],
  warning: ['m12 2 11 20H1L12 2ZM12 9v5m0 4h.01'],
  stop: ['m7 2-5 5v10l5 5h10l5-5V7l-5-5H7ZM8 8l8 8m0-8-8 8'],
  help: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M8 8c0-5 9-5 8 0 0 3-4 3-4 6m0 4h.01'],
  check: ['m4 12 5 6L21 5'],
  close: ['m5 5 14 14m0-14L5 19'],
  refresh: ['M20 9A9 9 0 0 0 4 5L2 9m0-6v6h6m-4 6a9 9 0 0 0 16 4l2-4m0 6v-6h-6'],
  clock: ['M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20M12 5v7l5 3'],
  play: ['m6 3 15 9-15 9V3Z'],
  pause: ['M6 3h3v18H6V3Zm9 0h3v18h-3V3Z'],
  infinity: ['M12 12C-2-6-2 30 12 12c14-18 14 18 0 0Z'],
});

const groups = {
  search: '🔍 🔎', eye: '👁️ 👁️‍🗨️ 🧿', detective: '🕵️ 🕵️‍♀️ 🕶️', shield: '🛡️ 🔰',
  star: '⭐', crown: '♛', trophy: '🏆 🏅', bolt: '⚡ 🔌', coin: '🪙', gem: '💎 💠', battery: '🔋',
  briefcase: '🎒 💼 🧰', archive: '🗄 🗄️ 🗃️ 🗂 📁 📂', file: '📄 📑 🧾', clipboard: '📋',
  book: '📖 📚 📓 📒 📜 📰', mail: '✉ ✉️ 📨 📮', calendar: '📅', gift: '🎁 🎉', settings: '⚙️',
  lock: '🔒 🔐', unlock: '🔓', key: '🔑 🗝 🗝️', user: '👤 👩‍💼 👩‍🔬 👩‍🚀 💂 🤵 🧑‍✈️ 🧑‍🎨 🧑‍🔬 🧑‍🚀', users: '👥', id: '🪪 💳',
  robot: '🤖', brain: '🧠 🤔', microscope: '🔬', flask: '🧪 🧫', dna: '🧬', terminal: '💻 🖥️ 📱', chip: '🦾 ⚛️', disk: '💾 💿',
  globe: '🌐', signal: '📶', radar: '📡', satellite: '🛰 🛰️ 🚁', map: '🗺 🗺️', pin: '📍', compass: '🧭',
  city: '🏙 🏙️ 🌃 🌆 🌌 🗼', building: '🏛️ 🏥 🗿', route: '🛤 🛗', camera: '📷 📹', film: '🎥 🎞️', microphone: '🎤 🎙️ 🎧', chat: '💬 🗣️', phone: '📞',
  link: '🔗', network: '🕸 🕸️', puzzle: '🧩', chart: '📊 📉', target: '🎯 🔭', wrench: '🔧 🛠️ 📐', paperclip: '📎', edit: '📝', dice: '🎲',
  owl: '🦉', wolf: '🐺', hat: '🎩 🧥', eagle: '🦅 🐦‍⬛ 🪽', snake: '🐍', butterfly: '🦋 🌸', mask: '🎭 👓 🧤', ghost: '👻 🫥',
  calm: '😐', nervous: '😰', angry: '😡 😤 💢', heart: '❤️ 💔 🩺', flame: '🔥 💥', snow: '❄️ 🧊', wave: '🌊 🫧',
  sun: '☀ 🌤', moon: '🌙', cloud: '🌫️', coffee: '☕ 🥤 🍸', box: '📦', anchor: '⚓', door: '🚪',
  warning: '⚠ ⚠️ 🚨 ☢️', stop: '🛑 ⛔ 💀 ⬛', help: '❓ 🔮', check: '✅', close: '❌', refresh: '🔄 🌀',
  clock: '⏱️ ⏳', play: '▶', pause: '⏸ ⏹', infinity: '♾️', badge: '⚔️',
};

export const LEGACY_ICON_NAMES = Object.freeze(Object.fromEntries(Object.entries(groups).flatMap(([name, icons]) => icons.split(' ').flatMap(icon => [[icon, name], [icon.replaceAll('\uFE0F', ''), name]]))));
export function resolveIconName(value) {
  return Object.hasOwn(ICON_PATHS, value) ? value : Object.hasOwn(LEGACY_ICON_NAMES, value) ? LEGACY_ICON_NAMES[value] : 'file';
}

const legacySequences = Object.keys(LEGACY_ICON_NAMES).sort((a, b) => b.length - a.length);
const legacyPattern = new RegExp(legacySequences.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gu');

// Called only at explicit authored UI/system-text boundaries, never on saved data.
export function iconTextParts(value) {
  if (typeof value !== 'string') return [{ text: value }];
  const parts = [];
  let start = 0;
  for (const match of value.matchAll(legacyPattern)) {
    // Do not partially replace an unrecognized joined emoji supplied by a user.
    const following = value.slice(match.index + match[0].length);
    if (value[match.index - 1] === '\u200D' || /^[\u200D\uFE0F\p{Emoji_Modifier}]/u.test(following)) continue;
    if (match.index > start) parts.push({ text: value.slice(start, match.index) });
    parts.push({ icon: LEGACY_ICON_NAMES[match[0]], original: match[0] });
    start = match.index + match[0].length;
  }
  if (start < value.length || parts.length === 0) parts.push({ text: value.slice(start) });
  return parts;
}
