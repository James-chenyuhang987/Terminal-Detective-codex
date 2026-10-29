import { getAccessibleZonePath } from './caseRuntime.js';
import { localizedInvestigationText as text } from './investigationChoices.js';

// This is a reading/route aid, not a second source of testimony or answer rules.
// Use only public accounts and earned records from the current run snapshot.
export function buildContactLeads({ investigation, caseData, currentZone, lang = 'zh' }) {
  const zones = caseData?.scene?.zones || caseData?.zone_layout || {};
  return (caseData?.npcs || []).flatMap(npc => {
    const zoneId = investigation?.npc_zones?.[npc.npc_id];
    if (!Object.hasOwn(zones, zoneId)) return [];
    const savedStage = investigation?.testimony_stages?.[npc.npc_id];
    const stage = Number.isInteger(savedStage) ? Math.max(0, Math.min(2, savedStage)) : 0;
    const latest = (investigation?.testimony_records?.[npc.npc_id] || [])
      .filter(record => Number.isInteger(record.stage) && record.stage > 0 && record.stage <= stage)
      .sort((a, b) => b.stage - a.stage)[0];
    return [{
      id: npc.npc_id, name: text(npc.name, lang), role: text(npc.role, lang),
      zoneId, zoneLabel: text(zones[zoneId]?.label, lang) || zoneId, stage,
      statement: text(investigation?.initial_statements?.[npc.npc_id] || npc.initial_statement, lang),
      latestTestimony: text(latest?.response, lang),
      route: getAccessibleZonePath(caseData, currentZone, zoneId, investigation?.zone_access),
    }];
  });
}
