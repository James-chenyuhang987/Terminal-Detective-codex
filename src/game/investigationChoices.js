const RISKS = { low: 0, medium: 1, high: 2 };

/** Automatic delegation uses visible risk and the player's priorities. */
export function selectAutomaticInvestigationCard(cards = [], priorities = []) {
  const rank = card => {
    const tag = card.actionTag || card.action_tag;
    const index = priorities.indexOf(tag);
    return index < 0 ? priorities.length : index;
  };
  return [...cards].sort((a, b) => (RISKS[a.risk_level] ?? 3) - (RISKS[b.risk_level] ?? 3)
    || rank(a) - rank(b)
    || (Number(b.estimatedAlignment) || 0) - (Number(a.estimatedAlignment) || 0)
    || String(a.option_id || a.optionId || '').localeCompare(String(b.option_id || b.optionId || '')))[0] || null;
}

export const REPORT_DIMENSIONS = ['opportunity', 'method', 'motive', 'timeline'];

export function reportEvidenceIds(groups = {}) {
  return [...new Set(REPORT_DIMENSIONS.flatMap(key => Array.isArray(groups[key]) ? groups[key] : []))];
}

export function localizedInvestigationText(value, lang = 'zh') {
  if (Array.isArray(value)) return value.map(item => localizedInvestigationText(item, lang)).filter(Boolean).join('\n');
  return typeof value === 'string' ? value : value?.[lang] || value?.zh || value?.en || '';
}

/** Move only server-revealed clues; unrevealed object rewards remain private. */
export function overlayKnownClueZones(zoneClueMap = {}, knownClueZones = {}) {
  const moved = new Set(Object.keys(knownClueZones));
  const zones = Object.fromEntries(Object.entries(zoneClueMap).map(([zone, ids]) =>
    [zone, ids.filter(id => !moved.has(id))]));
  for (const [clueId, zoneId] of Object.entries(knownClueZones)) {
    zones[zoneId] = [...(zones[zoneId] || []), clueId];
  }
  return zones;
}
