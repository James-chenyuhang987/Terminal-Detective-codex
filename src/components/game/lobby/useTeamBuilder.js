import { useCallback, useMemo, useRef, useState } from 'react';
import { effectiveAttrs, normalizeSpecialtyAllocation } from '@/game/specialtySystem';
import {
  AGENT_DEFS, defaultPriorities, defaultSpecs, getCoreAgentDefs, normalizePriorities, normalizePriorityList,
} from '@/game/teamConfig';
import { normalizeCommandPlan } from '@/game/commandSystem';
import { DEFAULT_AGENT_IDS, getOwnedAgentIds, normalizeCoreAgentIds } from '@/game/agentMarket';

function normalizeSelectedIndex(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(AGENT_DEFS.length - 1, Math.floor(parsed)));
}

function availableCoreIds(profile) {
  const owned = new Set(getOwnedAgentIds(profile));
  return normalizeCoreAgentIds(profile?.saved_team_config?.core_agent_ids)
    .map((id, slot) => owned.has(id) ? id : DEFAULT_AGENT_IDS[slot]);
}

function normalizeSpecs(specs, coreAgentIds) {
  return getCoreAgentDefs(coreAgentIds).map((agent, slot) => (
    normalizeSpecialtyAllocation(slot, specs?.[slot], agent.attribute_bonus)
  ));
}

export function useTeamBuilder(profile) {
  const [coreAgentIds, setCoreAgentIds] = useState(() => availableCoreIds(profile));
  const [specs, setSpecs] = useState(() => {
    const saved = profile?.saved_team_config;
    return Array.isArray(saved?.specs) && saved.specs.length === AGENT_DEFS.length
      ? normalizeSpecs(saved.specs, coreAgentIds)
      : defaultSpecs();
  });
  const [priorities, setPriorities] = useState(() => {
    const saved = profile?.saved_team_config;
    return Array.isArray(saved?.priorities) ? normalizePriorities(saved.priorities) : defaultPriorities();
  });
  const [selectedIdx, setSelectedIdx] = useState(() => normalizeSelectedIndex(profile?.saved_team_config?.primary_agent_index));
  const [primaryAgentIdx, updatePrimaryAgentIdx] = useState(() => normalizeSelectedIndex(profile?.saved_team_config?.primary_agent_index));
  const setPrimaryAgentIdx = useCallback(value => updatePrimaryAgentIdx(normalizeSelectedIndex(value)), []);
  const [skillLoadout, setSkillLoadout] = useState(() => profile?.skill_loadout || []);
  const [commandPlan, setCommandPlan] = useState(() => normalizeCommandPlan(profile?.saved_team_config?.command_plan));
  const presetUndoRef = useRef(null);
  const [canUndoPreset, setCanUndoPreset] = useState(false);
  const clearPresetUndo = useCallback(() => {
    presetUndoRef.current = null;
    setCanUndoPreset(false);
  }, []);

  const agentDefs = useMemo(() => getCoreAgentDefs(coreAgentIds), [coreAgentIds]);

  const agents = useMemo(() => specs.map((spec, index) => ({
    agent_id: agentDefs[index].id,
    name: agentDefs[index].name || agentDefs[index].id,
    icon: agentDefs[index].icon,
    color: agentDefs[index].color,
    role: agentDefs[index].roleZh,
    roleZh: agentDefs[index].roleZh,
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
    const replacement = getCoreAgentDefs(probe)[index];
    clearPresetUndo();
    setSpecs(current => current.map((spec, slot) => slot === index
      ? normalizeSpecialtyAllocation(slot, spec, replacement.attribute_bonus) : spec));
    setCoreAgentIds(current => {
      const next = [...current];
      next[index] = agentId;
      return normalizeCoreAgentIds(next);
    });
    setSelectedIdx(index);
    return true;
  }, [clearPresetUndo, profile]);

  const updateSpec = useCallback((spec) => {
    clearPresetUndo();
    setSpecs(current => current.map((entry, index) => index === selectedIdx
      ? normalizeSpecialtyAllocation(index, spec, agentDefs[index].attribute_bonus) : entry));
  }, [agentDefs, clearPresetUndo, selectedIdx]);

  const updatePriority = useCallback((index, list) => {
    clearPresetUndo();
    setPriorities(current => current.map((entry, entryIndex) => (
      entryIndex === index ? normalizePriorityList(list) : entry
    )));
  }, [clearPresetUndo]);

  const applyPreset = useCallback((preset) => {
    if (!Array.isArray(preset?.specs) || preset.specs.length !== AGENT_DEFS.length) return null;
    const normalized = {
      specs: normalizeSpecs(preset.specs, coreAgentIds),
      priorities: normalizePriorities(preset.priorities),
    };
    presetUndoRef.current = {
      specs: specs.map(spec => ({ ...spec })),
      priorities: priorities.map(list => [...list]),
    };
    setSpecs(normalized.specs);
    setPriorities(normalized.priorities);
    setCanUndoPreset(true);
    return normalized;
  }, [coreAgentIds, priorities, specs]);

  const undoPreset = useCallback(() => {
    const previous = presetUndoRef.current;
    if (!previous) return false;
    clearPresetUndo();
    setSpecs(previous.specs.map(spec => ({ ...spec })));
    setPriorities(previous.priorities.map(list => [...list]));
    return true;
  }, [clearPresetUndo]);

  const currentConfig = useCallback(() => ({
    specs, priorities, primary_agent_index: primaryAgentIdx, command_plan: normalizeCommandPlan(commandPlan),
    core_agent_ids: normalizeCoreAgentIds(coreAgentIds),
  }), [commandPlan, coreAgentIds, primaryAgentIdx, priorities, specs]);

  const loadSaved = useCallback(() => {
    const saved = profile?.saved_team_config;
    if (!Array.isArray(saved?.specs) || saved.specs.length !== AGENT_DEFS.length) return false;
    const restoredCoreIds = availableCoreIds(profile);
    clearPresetUndo();
    setSpecs(normalizeSpecs(saved.specs, restoredCoreIds));
    setPriorities(normalizePriorities(saved.priorities));
    setSelectedIdx(normalizeSelectedIndex(saved.primary_agent_index));
    setPrimaryAgentIdx(saved.primary_agent_index);
    setCommandPlan(normalizeCommandPlan(saved.command_plan));
    setCoreAgentIds(restoredCoreIds);
    return true;
  }, [clearPresetUndo, profile, setPrimaryAgentIdx]);

  return {
    agents, agentDefs, coreAgentIds, replaceCoreAgent, specs, priorities, selectedIdx, setSelectedIdx,
    primaryAgentIdx, setPrimaryAgentIdx, canUndoPreset, undoPreset,
    skillLoadout, setSkillLoadout, commandPlan, setCommandPlan,
    updateSpec, updatePriority, applyPreset, currentConfig, loadSaved,
  };
}
