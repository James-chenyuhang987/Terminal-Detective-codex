// Tutorial milestones follow completed public actions, never input presses or
// unrevealed case content. A restored case starts at its relevant milestone.
export function investigationTutorialStage({ state, investigation, progress = /** @type {{moved?: boolean, observed?: boolean, reportOpened?: boolean}} */ ({}), theaterMode = false, investigationVersion = 2 }) {
  if (investigationVersion !== 2 || !investigation || progress.reportOpened) return null;
  const known = new Set(state?.unlocked_clues || []);
  const hasEvidence = (state?.revealed_clues || []).some(clue => known.has(clue.clue_id));
  const checked = (investigation.completed_checks || []).length > 0;
  const hasTestimony = Object.entries(investigation.testimony_records || {}).some(([npcId, records]) =>
    Array.isArray(records) && records.some(record => Number.isInteger(record.stage) && record.stage > 0
      && record.stage <= Math.min(2, Number(investigation.testimony_stages?.[npcId]) || 0)));
  const hasDeduction = (investigation.propositions || []).some(item => known.has(item.a) && known.has(item.b));
  if (hasTestimony) return hasDeduction || investigation.puzzle?.completed ? 'report' : 'deduction';
  if (hasEvidence) return 'testimony';
  // An unsuccessful check still proves that the player has observed an object.
  if (progress.observed || checked) return 'verify';
  if (theaterMode && !progress.moved) return 'move';
  return 'observe';
}
