// Presentation data only: no private case fields, settlement, rewards or profile writes.
export const SCENE_ART = Object.freeze({
  office: { background: '#0b0d13', key: '#ffe1ac', accent: '#d6ad63', fill: '#9caec0', intensity: 1.65, fog: 27 },
  datacenter: { background: '#080f18', key: '#d0e7ef', accent: '#69b4c2', fill: '#7785a0', intensity: 1.45, fog: 24 },
  lobby: { background: '#111017', key: '#ffe4b2', accent: '#cfab69', fill: '#9ba4ba', intensity: 1.75, fog: 28 },
  laboratory: { background: '#091319', key: '#e0f4ee', accent: '#7fb5a9', fill: '#8398ad', intensity: 1.6, fog: 26 },
  balcony: { background: '#0a101e', key: '#b5c6ed', accent: '#d4a05f', fill: '#7884ab', intensity: 1.15, fog: 43 },
});

const ACTIONS = new Set(['search_area', 'scan_environment', 'hack_terminal', 'reconstruct_timeline', 'analyze_evidence', 'cross_validate', 'interrogate', 'interrogate_npc', 'question_npc', 'recover']);
export function fieldProgress(state = {}) {
  const ids = Array.isArray(state.unlocked_clues) ? [...new Set(state.unlocked_clues.filter(id => typeof id === 'string' && /^[\w-]{1,64}$/.test(id)))].slice(0, 32) : [];
  const action = typeof state.last_action === 'string' && ACTIONS.has(state.last_action) ? state.last_action : '';
  return { evidenceCount: ids.length, evidenceIds: ids, turn: Math.max(0, Math.min(9999, Number(state.turn_count) || 0)), terminalActive: ['hack_terminal', 'reconstruct_timeline'].includes(action), action };
}

/**
 * Count only already-public clues assigned to the active room. Hidden clue
 * entries are deliberately excluded from the 3D dressing layer.
 */
export function sceneEvidenceCount(caseData, zoneId, progress = {}) {
  const ids = new Set(Array.isArray(progress.evidenceIds) ? progress.evidenceIds : []);
  const dictionary = new Map((Array.isArray(caseData?.clue_dictionary) ? caseData.clue_dictionary : [])
    .filter(clue => typeof clue?.clue_id === 'string' && clue.unlock_turn === undefined)
    .map(clue => [clue.clue_id, clue]));
  const assigned = caseData?.zone_clue_map?.[zoneId];
  if (!Array.isArray(assigned)) return 0;
  return assigned.filter(clueId => dictionary.has(clueId) && ids.has(clueId)).length;
}

export function npcAppearance(caseId, npcId, role) {
  let seed = 2166136261;
  for (const letter of `${caseId}/${npcId}`) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0;
  const palette = role === 'security' ? ['#344251', '#3b4542', '#424054'] : role === 'scientist' ? ['#c7c5ae', '#acbbb4', '#bec2cc'] : ['#784652', '#526275', '#77614d'];
  return { coat: palette[seed % palette.length], phase: (seed % 997) / 997 * 2, stature: 0.98 + ((seed >>> 8) % 5) * .01 };
}

const DEMEANORS = Object.freeze({
  calm: Object.freeze({ headPitch: 0, bodyPitch: 0, hesitation: 0 }),
  shaken: Object.freeze({ headPitch: .06, bodyPitch: .025, hesitation: .018 }),
  broken: Object.freeze({ headPitch: .14, bodyPitch: .055, hesitation: .025 }),
});
// Only the already-visible emotion level influences posture; it implies no guilt or truth.
export function npcDemeanor(level) {
  return Object.hasOwn(DEMEANORS, level) ? DEMEANORS[level] : DEMEANORS.calm;
}

/** Keep the view outside open cutaway walls; actual geometry still constrains the lens. */
export function fieldFraming({ position, yaw, pitch, aspect = 1.6, contact = null, focus = null, overview = false }, output = { target: [0, 0, 0] }) {
  const target = output.target;
  target[0] = position[0]; target[1] = 1.08; target[2] = position[2];
  output.yaw = yaw;
  output.pitch = pitch;
  output.distance = aspect < .85 ? 8.1 : aspect < 1.3 ? 7.2 : 6.4;
  if (overview) {
    target[0] = 0; target[1] = .8; target[2] = -.8;
    output.yaw = .10; output.pitch = .54; output.distance = aspect < 1 ? 14 : 11.5;
  } else if (contact) {
    const dx = position[0] - contact.position[0];
    const dz = position[2] - contact.position[2];
    const separation = Math.hypot(dx, dz);
    target[0] = contact.position[0]; target[1] = 1.25; target[2] = contact.position[2];
    if (separation < 3.2) { target[0] = (target[0] + position[0]) / 2; target[2] = (target[2] + position[2]) / 2; }
    output.yaw = separation > .1 ? Math.atan2(dx, dz) + .85 : contact.rotationY + .65;
    output.pitch = .30; output.distance = aspect < 1 ? 5.2 : Math.max(3.7, Math.min(separation, 3) + 2);
  } else if (focus) {
    // Keep the collision origin above the inspection tray/core rather than inside it.
    target[0] = focus[0]; target[1] = focus[1] + .32; target[2] = focus[2];
    // Portrait inspection looks over the actor's shoulder and down onto the
    // work surface, keeping the detective's head out of the evidence view.
    output.yaw = Math.atan2(position[0] - focus[0], position[2] - focus[2]) + (aspect < 1 ? .75 : .38);
    output.pitch = aspect < 1 ? .65 : .36;
    output.distance = aspect < 1 ? 4.6 : 3.5;
  }
  if ((contact || focus) && aspect > 1.2) {
    // The shared investigation panel occupies the right side of a wide viewport.
    target[0] += Math.cos(output.yaw) * .85;
    target[2] -= Math.sin(output.yaw) * .85;
  }
  return output;
}
