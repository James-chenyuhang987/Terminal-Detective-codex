function zoneKeys(caseData) {
  const layoutKeys = Object.keys(caseData?.zone_layout || {});
  if (layoutKeys.length) return layoutKeys;
  return Object.keys(caseData?.scene?.zones || {});
}

export function getInitialZone(caseData) {
  const keys = zoneKeys(caseData);
  return keys.includes(caseData?.initial_zone) ? caseData.initial_zone : (keys[0] || null);
}

export function getConnectedZones(caseData, currentZone) {
  const keys = zoneKeys(caseData);
  if (!currentZone || !keys.includes(currentZone)) return keys;

  const connected = new Set();
  for (const edge of caseData?.zone_connections || []) {
    if (!Array.isArray(edge) || edge.length < 2) continue;
    const [from, to] = edge;
    if (from === currentZone && keys.includes(to)) connected.add(to);
    if (to === currentZone && keys.includes(from)) connected.add(from);
  }
  return [...connected];
}

export function isValidZoneTransition(caseData, fromZone, toZone) {
  if (!toZone || !zoneKeys(caseData).includes(toZone)) return false;
  if (!fromZone || fromZone === toZone) return true;
  return getConnectedZones(caseData, fromZone).includes(toZone);
}

export function resolveNextZone({
  caseData,
  currentZone,
  actionName,
  visitedZones = [],
  canBypassRequirements = false,
}) {
  const start = getInitialZone(caseData);
  const current = zoneKeys(caseData).includes(currentZone) ? currentZone : start;
  const connected = getConnectedZones(caseData, current);
  if (!connected.length) return current;

  const visited = new Set(visitedZones);
  const ordered = [...connected].sort((a, b) => Number(visited.has(a)) - Number(visited.has(b)));
  const zones = caseData?.scene?.zones || {};

  // Specialist actions move to the zone gated by that exact action.
  if (actionName && actionName !== 'search_area') {
    const exact = ordered.find(zone => zones[zone]?.entry_requirement === actionName);
    if (exact) return exact;
  }

  // A broad search explores an accessible, preferably unvisited, adjacent zone.
  if (actionName === 'search_area') {
    const accessible = ordered.find(zone => {
      const requirement = zones[zone]?.entry_requirement;
      return !requirement || requirement === 'search_area' || canBypassRequirements;
    });
    if (accessible) return accessible;
  }

  return current;
}

export function getZoneClueIds(caseData, zoneId) {
  const mapped = caseData?.zone_clue_map?.[zoneId];
  if (Array.isArray(mapped)) return mapped;
  return (caseData?.clue_dictionary || []).map(clue => clue.clue_id);
}

export function getAvailableClueIds(caseData, zoneId, unlockedClues = [], turn = 0, destroyedClues = []) {
  const known = new Set([...unlockedClues, ...(Array.isArray(destroyedClues) ? destroyedClues : [])]);
  const protectedUntil = new Map(
    (caseData?.hidden_clues || []).map(clue => [
      clue?.clue_id,
      Math.max(1, Number(clue?.unlock_turn) || 1),
    ]),
  );
  return getZoneClueIds(caseData, zoneId).filter(id =>
    !known.has(id) && (!protectedUntil.has(id) || turn >= protectedUntil.get(id))
  );
}
