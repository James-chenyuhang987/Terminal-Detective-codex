const profile = {
  profile_revision: 1,
  detective_name: 'NIGHT-OWL-EXTRA-LONG-CODENAME',
  unsolved_count: 27,
  saved_team_config: { agents: ['nova', 'iris', 'echo'] },
  level: 12,
  xp: 420,
  energy: 88,
  max_energy: 100,
  gold: 2460,
  diamonds: 88,
  achievement_flags: {},
  inventory: {},
  unlocked_agents: ['nova', 'iris', 'echo'],
  solved_cases: [],
};

export function useProfile() {
  return {
    profile,
    command: async () => ({ profile }),
    pendingCount: 0,
    refresh: async () => profile,
    syncStatus: 'online',
    takeOver: async () => profile,
    isReadOnly: false,
  };
}

export function ProfileProvider({ children }) { return children; }
export function SessionReadOnlyBanner() { return null; }
