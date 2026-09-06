/** Convert a scene intent into a presentation action, never an engine settlement. */
export function resolveTheaterInteraction(target, npcs = [], paused = false) {
  if (paused || !target) return null;
  if (target.kind === 'npc') {
    const npc = npcs.find(item => item.npc_id === target.npcId);
    return npc ? { type: 'talk', npc } : null;
  }
  if (target.kind === 'door') return { type: 'panel', panel: 'routes' };
  if (target.kind === 'investigate') return { type: 'panel', panel: 'investigate' };
  return null;
}
