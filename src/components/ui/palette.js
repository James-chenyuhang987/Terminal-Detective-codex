export const NOIR = Object.freeze({
  ink: '#08121c', surface: '#101e2a', raised: '#172936', paper: '#e6dfcf', muted: '#9caaa9',
  brass: '#c5a66f', brassLight: '#e1d0ac', teal: '#709f9a', tealLight: '#a5c8c0',
  success: '#8aaa91', warning: '#c19a63', danger: '#c77c78', dangerLight: '#dda29a', slate: '#9b9aae',
});

const families = {
  '#709f9a': ['00e5ff', '00ffff', '00c8ff', '00ccff', '00d4ff', '00c0ff', '00bfff', '00aaff', '00b8ff', '22d3ee', '38bdf8', '5fd8ff', '38b9ff', '40cfff', '00bcd4', '00ddff', '00eeff', '63d9e3', '6edce5', '0040ff', '63cbd3', '59dbff', '43d2ff', '00a5b9', '00aacd', '00a2b9', '75eaf8', '69eaff', '72efff', '5deeff', '72eefa', '69efff', '5af0ff', '67d5f0'],
  '#a5c8c0': ['7df1ff', '8ff3ff', '80dfee', '9ff8ff', '8fe8ff', '8ff4ff', '7de8ff', '6ee8ff', '8eeee6', '71f5ff', '72f7ff', '77f7ff', 'b9f9ff', '9fefff', '87eaff', '80ffff', '93f6ff', '7deeff', '7ce9ed', '7debf3', '7af6ff', '8ceeff', '7dcdd8', '9de9ff', 'bcefff', 'b9e9f2', 'bdf8ff', 'bff8ff', 'a7f7ff', '8ef5ff', '82edf8', '9ff7ff', '8ee8f2', '85eefb', 'afeff7', '7be7e7', '80e5dd', '8ae4de', '86e8ed', '9ad3e6'],
  '#9b9aae': ['a78bfa', 'bf5fff', 'd88cff', 'a855f7', '8b5cf6', 'c084fc', 'c77dff', 'a78bff', 'c084ff', 'b388ff', '9966ff', '9f7aea', 'aa88ff', '8b7fff', 'a58aff', 'c46dff', 'ff3aff', 'c9a7ff', 'c9b6ff', '8888aa', '7e50e1', '8a62ff', 'a38cff', 'cabcff', 'c8b9ff', '8d7cff', '4b69ab', 'ae86ff'],
  '#8aaa91': ['00ff88', '00ff99', '00ffcc', '00ff80', '4dffa6', '72ffc0', '7dffba', '80d9a3', '78d59c', '00b878', '34d399', '22c55e', '39ff14', '4ade80', '00ffaa', '00ff00', '66ff99', '88ffcc', '4dffb8', '50ffb1', '52d69a', '63eab0', '80f4bd', '8fffc4', 'a3ff47', '6fffc0', '78ffc0', '38f59a', '64efaf', '54eba1', '5dffb3', '62f0ad', '60eeb1', '00bb80', '9bffd0', '70ffc0', '27d98b'],
  '#c5a66f': ['e8c98a', 'c5a059', 'e3b85b', 'e1b354', 'f0cb70', 'f5d987', 'e8b85a', 'f2ca6e', 'f3cd72', 'f3d075', 'e7bd60', 'e0b454', 'd4a342', 'ffd34d', 'ffc857', 'ffd700', 'f5c842', 'ffcc00', 'ffdd00', 'fbbf24', 'e3bc6b', 'f2c96c', 'e7b958', 'f0cf78', 'd8aa50', 'd7a542', 'f5c967', 'dcb45c', 'd7a64a', 'f1ce75', 'e9bc5b', 'd3a344', 'e8c46b', 'd6a546', 'd3a045', 'dba846', 'ebc96f', 'f0c96c', 'f1c46d', 'ffe066', 'f1d28c', 'ffd18a', 'ffdd80', 'f1d48f', 'ffe69d', 'f0bc4a', 'edcd84', 'e6b858', 'dca43c', 'e4a835', 'e2b250', 'f3da9c', 'efc569', 'ffde8c', 'ffe091', 'f2cd79', 'ffe2a4', 'ffe477', 'ffda82', 'ffda7e', 'ffd66f', 'ffdd87', 'ffcc5c', 'ffd875', 'ffcc53', 'ffd166', 'f2c96f', 'ffd17e', 'efc787'],
  '#e1d0ac': ['f4d99f', 'f0d28b', 'f0d9a5', 'd8be88', 'ffd27a', 'f7df9a', 'ffe18b', 'ffea9a', 'fff0b0', 'ffe3a0', 'ffe49b', 'fff1bd', 'ffe4a0', 'ffe39a', 'ffe89b', 'fff8cf', 'fff7c7', 'fff0a6', 'fff1c9', 'fff6ca', 'fff2b0', 'f3d47d', 'fff1ad', 'f0cf7e', 'ffd9c2', 'ffe5b0', 'f6e3b8', 'f4d99c', 'f8e5b8', 'e8d8ae', 'f4e2b4', 'eed393', 'e7d9b5', 'ffeba9', 'efd597', 'f1dba5', 'f1e3c0', 'f4dea6', 'f4e3bb', 'ffe8aa', 'f2e1b7', 'ebd297', 'ffecbe', 'ffe8a9', 'f3e4bb', 'fff6d7', 'fff4c6', 'ffe9b0', 'ffe29e', 'fff3cf', 'f5e2b8', 'fff0c8', 'f4d79d', 'f6e5c1'],
  '#c19a63': ['ffaa00', 'ff6600', 'ff6b35', 'ff5500', 'ff9d00', 'f2b84b', 'ffc35b', 'ff8800', 'ff9900', 'ffcc44', 'ffbb33', 'f59e0b', 'fb923c', 'ffb347', 'ffbd3d', 'ffbb00', 'ffaa33', 'ffb800', 'ffb74d', 'ff8a00', 'ff9e3d', 'ffae69', 'ff8152', 'ffb940', 'ffb733'],
  '#c77c78': ['ff3860', 'ff3366', 'ff4444', 'ff5555', 'ff6b6b', 'ff6b84', 'ff5f7f', 'ff4d6d', 'f43f5e', 'ef4444', 'f87171', 'ff3377', 'ff0055', 'ff0066', 'ff0000', 'ff3355', 'ff4d4d', 'ff3360', 'ff416c', 'ff0040', 'ff0020', 'ff5b69', 'ff456d', 'ff7d9c', 'ff718c', 'ff5275', 'ff5876', 'ff4c70'],
  '#dda29a': ['ff7890', 'ff6685', 'ff7893', 'ff718f', 'ff9a9f', 'ff90a5', 'ff8da1', 'ff9ca9', 'ff99aa', 'ff7c93', 'ff829b', 'ff9aac', 'ffd5df', 'ffb9ca', 'ff9b74', 'ff9378', 'ffb4b4'],
  '#e6dfcf': ['cfefff', 'dff8ff', 'dffcff', 'e9fdff', 'eafcff', 'dff9ff', 'dffaff', 'eefaff', 'e2f2ff', 'd8f7fa', 'effeff', 'e7fbff', 'f0fdff', 'eaffff', 'ddf8ff', 'e0f7ff', 'e6f7ff', 'edf8ff', 'f1f7ff', 'e8e8f5', 'f2f2f2', 'f3fbff', 'd8f8ff', 'dcf5ff', 'dcf2fa', 'daf4fc', 'fff0f4', 'dceff9', 'e1f2fa', 'e8f5fa', 'd9f9ff', 'd7f7ff', 'e8fbff', 'e9fbff', 'effbff', 'd7fbff', 'e7f6ff', 'e0f1f8', 'dcf4fa', 'eaf9ff', 'ebf6ff', 'def3fa', 'e8f7ff', 'dff7ff', 'dff5ff', 'daf1fc', 'e0f6ff', 'def5ff', 'daf1f8', 'e6fff5', 'ddf8ef', 'd9fff0', 'e7f8f2', 'dbf4ec', 'e1f3fa', 'daffef', 'ddf6ff', 'ebf8ff', 'd8f4fc'],
  '#9caaa9': ['668899', '557085', '627a8e', '849fb4', '6f899e', '8fb1c6'],
  '#08121c': ['020810', '040810', '050914', '02040a', '000611', '000711', '02060e', '050a14', '020408', '010509', '0a0a0f', '0a0f20', '0a0020', '03060f', '050e22', '010408', '01050b', '020914', '02070e'],
  '#101e2a': ['0a1628', '04121f', '06101d', '091321', '07101c', '07101b', '0a1524'],
};
const catalogColors = {
  '#39e6ff': NOIR.teal, '#9cf6ff': NOIR.tealLight, '#66e8ff': NOIR.tealLight,
  '#b98cff': NOIR.slate, '#e1c4ff': NOIR.paper, '#c995ff': NOIR.slate,
  '#ff8157': NOIR.warning, '#ffb06f': NOIR.brassLight, '#ffd47a': NOIR.brass,
  '#54f0a3': NOIR.success, '#8dff9f': NOIR.success, '#ff76c8': NOIR.dangerLight,
  '#00bfe8': NOIR.teal, '#8ff0ff': NOIR.tealLight, '#00b7ff': NOIR.teal,
  '#87eeea': NOIR.tealLight, '#ffd39a': NOIR.brassLight, '#d7aa52': NOIR.brass,
};
export const LEGACY_COLORS = Object.freeze({ ...Object.fromEntries(Object.entries(families).flatMap(([color, values]) => values.map(value => [`#${value}`, color]))), ...catalogColors });
const rgb = hex => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const rgbColors = Object.fromEntries(Object.entries(LEGACY_COLORS).map(([from, to]) => [rgb(from).join(','), rgb(to).join(', ')]));

// Presentation-only compatibility; stored agent/case/profile colors are unchanged.
export function noirColor(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/#[\da-f]{6}(?:[\da-f]{2})?\b/gi, color => {
    const match = LEGACY_COLORS[color.slice(0, 7).toLowerCase()];
    return match ? match + color.slice(7) : color;
  }).replace(/\b(rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?=\s*[,)]|\s)/gi, (match, format, r, g, b) => {
    const color = rgbColors[`${r},${g},${b}`];
    return color ? `${format}(${color}` : match;
  });
}
