import { useCallback, useMemo, useState } from 'react';
import { effectiveAttrs } from '@/game/specialtySystem';
import {
  AGENT_DEFS, defaultPriorities, defaultSpecs, getCoreAgentDefs, normalizePriorities, normalizePriorityList,
} from '@/game/teamConfig';
import { normalizeCommandPlan } from '@/game/commandSystem';
import { DEFAULT_AGENT_IDS, getOwnedAgentIds, normalizeCoreAgentIds } from '@/game/agentMarket';

export function useTeamBuilder(profile) {
  const initialCoreIds = () => {
    const owned = new Set(getOwnedAgentIds(profile));
    return normalizeCoreAgentIds(profile?.saved_team_config?.core_agent_ids)
      .map((id, slot) => owned.has(id) ? id : DEFAULT_AGENT_IDS[slot]);
  };
  const [coreAgentIds, setCoreAgentIds] = useState(initialCoreIds);
  const [specs, setSpecs] = useState(() => {
    const saved = profile?.saved_team_config;
    return Array.isArray(saved?.specs) && saved.specs.length === AGENT_DEFS.length
      ? saved.specs.map(spec => ({ ...spec }))
      : defaultSpecs();
  });
  const [priorities, setPriorities] = useState(() => {
    const saved = profile?.saved_team_config;
    return Array.isArray(saved?.priorities) ? normalizePriorities(saved.priorities) : defaultPriorities();
  });
  const [selectedIdx, setSelectedIdx] = useState(() => profile?.saved_team_config?.primary_agent_index ?? 1);
  const [skillLoadout, setSkillLoadout] = useState(() => profile?.skill_loadout || []);
  const [commandPlan, setCommandPlan] = useState(() => normalizeCommandPlan(profile?.saved_team_config?.command_plan));

  const agentDefs = useMemo(() => getCoreAgentDefs(coreAgentIds), [coreAgentIds]);

  const agents = useMemo(() => specs.map((spec, index) => ({
    agent_id: agentDefs[index].id,
    role: agentDefs[index].roleZh,
    base_stance: agentDefs[index].stance,
    ...effectiveAttrs(index, spec, agentDefs[index].attribute_bonus),
    priority_list: priorities[index],
  })), [agentDefs, priorities, specs]);

  const replaceCoreAgent = useCallback((slot, agentId, ownedProfile = profile) => {
    const index = Number.isInteger(slot) ? slot : Math.floor(Number(slot));
    const owned = new Set(getOwnedAgentIds(ownedProfile));
    if (index < 0 || index >= DEFAULT_AGENT_IDS.length || !owned.has(agentId)) return false;
    const probe = [...DEFAULT_AGENT_IDS];
    probe[index] = agentId;
    if (normalizeCoreAgentIds(probe)[index] !== agentId) return false;
    setCoreAgentIds(current => {
      const next = [...current];
      next[index] = agentId;
      return normalizeCoreAgentIds(next);
    });
    setSelectedIdx(index);
    return true;
  }, [profile]);

  const updateSpec = useCallback((spec) => {
    setSpecs(current => current.map((entry, index) => index === selectedIdx ? spec : entry));
  }, [selectedIdx]);

  const updatePriority = useCallback((index, list) => {
    setPriorities(current => current.map((entry, entryIndex) => (
      entryIndex === index ? normalizePriorityList(list) : entry
    )));
  }, []);

  const applyPreset = useCallback((preset) => {
    setSpecs(preset.specs.map(spec => ({ ...spec })));
    setPriorities(normalizePriorities(preset.priorities));
  }, []);

  const currentConfig = useCallback(() => ({
    specs, priorities, primary_agent_index: selectedIdx, command_plan: normalizeCommandPlan(commandPlan),
    core_agent_ids: normalizeCoreAgentIds(coreAgentIds),
  }), [commandPlan, coreAgentIds, priorities, selectedIdx, specs]);

  const loadSaved = useCallback(() => {
    const saved = profile?.saved_team_config;
    if (!Array.isArray(saved?.specs)) return false;
    setSpecs(saved.specs.map(spec => ({ ...spec })));
    setPriorities(normalizePriorities(saved.priorities));
    setSelectedIdx(saved.primary_agent_index ?? 1);
    setCommandPlan(normalizeCommandPlan(saved.command_plan));
    setCoreAgentIds(initialCoreIds());
    return true;
  }, [profile]);

  return {
    agents, agentDefs, coreAgentIds, replaceCoreAgent, specs, priorities, selectedIdx, setSelectedIdx,
    skillLoadout, setSkillLoadout, commandPlan, setCommandPlan,
    updateSpec, updatePriority, applyPreset, currentConfig, loadSaved,
  };
}
