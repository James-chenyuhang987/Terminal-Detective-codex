import { buildInvestigationEvidence } from './investigationEvidence.js';
import { localizedInvestigationText as text } from './investigationChoices.js';

// A review of the acquired record, not a second solution/judgment engine.
// Preserve recorded order; only explicit `precedes` relations assert chronology.
export function buildInvestigationReconstruction({ state, investigation, npcs = [], zones = {}, lang = 'zh' }) {
  const evidence = buildInvestigationEvidence({ state, investigation, zones, lang });
  const known = new Map(evidence.clues.map(clue => [clue.clue_id, clue]));
  const seen = new Set();
  const relations = (investigation?.propositions || []).filter(item => {
    if (!item?.id || seen.has(item.id) || !known.has(item.a) || !known.has(item.b)
      || !['supports', 'contradicts', 'precedes'].includes(item.relation) || !text(item.label, lang)) return false;
    seen.add(item.id);
    return true;
  }).map(item => ({ id: item.id, label: text(item.label, lang), relation: item.relation,
    clues: [known.get(item.a), known.get(item.b)] }));
  const testimonies = npcs.flatMap(npc => {
    const stage = Math.max(0, Math.min(2, Math.floor(Number(investigation?.testimony_stages?.[npc.npc_id]) || 0)));
    const seenStages = new Set();
    const records = investigation?.testimony_records?.[npc.npc_id];
    return (Array.isArray(records) ? records : []).filter(record => {
      if (!Number.isInteger(record?.stage) || record.stage <= 0 || record.stage > stage
        || seenStages.has(record.stage) || !text(record.response, lang)) return false;
      seenStages.add(record.stage);
      return true;
    }).sort((a, b) => a.stage - b.stage).map(record => ({
      npcId: npc.npc_id, name: text(npc.name, lang), stage: record.stage, response: text(record.response, lang),
      ...(investigation?.interview_revision === 1 && text(record.prior_claim, lang)
        ? { priorClaim: text(record.prior_claim, lang) } : {}),
      clues: [...new Set(Array.isArray(record.evidence_ids) ? record.evidence_ids : [])]
        .filter(id => known.has(id)).map(id => known.get(id)),
    }));
  });
  return { ...evidence, relations, testimonies };
}
