const localized = (value, lang) => typeof value === 'string' ? value : value?.[lang] || value?.zh || value?.en || '';

// Use earned public records, never the unrevealed case catalog. Both IDs and
// descriptions must come from the current authoritative snapshot.
export function buildInvestigationEvidence({ state, investigation, zones = {}, lang = 'zh' }) {
  const known = new Set(state?.unlocked_clues || []);
  const seen = new Set();
  const clues = (state?.revealed_clues || []).filter(clue => {
    if (!known.has(clue.clue_id) || seen.has(clue.clue_id)) return false;
    seen.add(clue.clue_id);
    return true;
  }).map(clue => ({ ...clue,
    keyword: lang === 'en' ? clue.en?.keyword || clue.keyword : clue.keyword,
    description: lang === 'en' ? clue.en?.description || clue.description : clue.description,
  }));
  const sources = {};
  const expertNotes = {};
  for (const clue of clues) {
    const check = investigation?.completed_checks?.find(item => item.clue_ids?.includes(clue.clue_id));
    const target = check && investigation?.targets?.find(item => item.target_id === check.target_id);
    const zone = investigation?.clue_zones?.[clue.clue_id];
    sources[clue.clue_id] = [localized(target?.label, lang), localized(target?.zone_label, lang) || localized(zones[zone]?.label, lang)]
      .filter(Boolean).join(' · ');
    const note = localized(check?.expert_note, lang);
    if (note) expertNotes[clue.clue_id] = note;
  }
  return { clues, sources, expertNotes };
}
