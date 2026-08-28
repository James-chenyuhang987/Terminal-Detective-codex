import { useCallback, useMemo, useState } from 'react';
import { effectiveAttrs } from '@/game/specialtySystem';
import {
  AGENT_DEFS, defaultPriorities, defaultSpecs, normalizePriorities, normalizePriorityList,
} from '@/game/teamConfig';
import { normalizeCommandPlan } from '@/game/commandSystem';

export function useTeamBuilder(profile) {
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

  const agents = useMemo(() => specs.map((spec, index) => ({
    agent_id: AGENT_DEFS[index].id,
    role: AGENT_DEFS[index].roleZh,
    base_stance: AGENT_DEFS[index].stance,
    ...effectiveAttrs(index, spec),
    priority_list: priorities[index],
  })), [priorities, specs]);

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
  }), [commandPlan, priorities, selectedIdx, specs]);

  const loadSaved = useCallback(() => {
    const saved = profile?.saved_team_config;
    if (!Array.isArray(saved?.specs)) return false;
    setSpecs(saved.specs.map(spec => ({ ...spec })));
    setPriorities(normalizePriorities(saved.priorities));
    setSelectedIdx(saved.primary_agent_index ?? 1);
    setCommandPlan(normalizeCommandPlan(saved.command_plan));
    return true;
  }, [profile?.saved_team_config]);

  return {
    agents, specs, priorities, selectedIdx, setSelectedIdx, skillLoadout, setSkillLoadout, commandPlan, setCommandPlan,
    updateSpec, updatePriority, applyPreset, currentConfig, loadSaved,
  };
}
