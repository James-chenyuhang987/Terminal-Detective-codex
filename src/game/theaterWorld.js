// Pure presentation geometry. This module deliberately has no engine/state imports.
export const PLAYER_RADIUS = 0.28;
export const MAX_FRAME_DELTA = 0.05;
export const WALK_SPEED = 1.4;
export const SPRINT_SPEED = 2.4;
export const SCENE_FILES = Object.freeze({ office: 'office.glb', datacenter: 'datacenter.glb', lobby: 'lobby.glb', laboratory: 'laboratory.glb', balcony: 'balcony.glb' });
export const CHARACTER_FILES = Object.freeze({ detective: 'detective.glb', witness: 'witness.glb', security: 'security.glb', scientist: 'scientist.glb' });

// Public presentation metadata keeps the same intent contract while giving
// each room a different investigative identity. These labels describe what
// is visible in the room; they do not encode case answers or hidden clues.
export const SCENE_INTERACTION_PROFILES = Object.freeze({
  office: Object.freeze({
    workstation: Object.freeze({ type: 'terminal', label: '案卷归档终端', labelEn: 'CASE ARCHIVE TERMINAL', accent: '#d6ad63', markerOffsets: [[-.24, .08], [0, 0], [.24, -.06]] }),
    evidence: Object.freeze({ type: 'evidence', label: '证物归档桌', labelEn: 'EVIDENCE ARCHIVE TABLE', accent: '#c5a66f', markerOffsets: [[-.28, .12], [0, 0], [.26, -.10]] }),
  }),
  datacenter: Object.freeze({
    workstation: Object.freeze({ type: 'terminal', label: 'EMP 诊断节点', labelEn: 'EMP DIAGNOSTIC NODE', accent: '#69b4c2', markerOffsets: [[-.18, -.14], [.06, .02], [.26, .16]] }),
    evidence: Object.freeze({ type: 'evidence', label: '碎片芯片阵列', labelEn: 'SHATTERED CHIP ARRAY', accent: '#7fd3df', markerOffsets: [[-.34, .04], [-.05, -.16], [.28, .10]] }),
  }),
  lobby: Object.freeze({
    workstation: Object.freeze({ type: 'terminal', label: '监控回放台', labelEn: 'SURVEILLANCE REPLAY DESK', accent: '#cfab69', markerOffsets: [[-.25, .08], [.02, -.02], [.28, .12]] }),
    evidence: Object.freeze({ type: 'evidence', label: '门禁证物箱', labelEn: 'ACCESS-LOG CUSTODY BOX', accent: '#e4bd73', markerOffsets: [[-.20, -.14], [.06, .02], [.30, .16]] }),
  }),
  laboratory: Object.freeze({
    workstation: Object.freeze({ type: 'terminal', label: '协议分析台', labelEn: 'PROTOCOL ANALYSIS BENCH', accent: '#7fb5a9', markerOffsets: [[-.24, .04], [0, -.10], [.24, .08]] }),
    evidence: Object.freeze({ type: 'evidence', label: '神经接口样本台', labelEn: 'NEURAL INTERFACE SAMPLE RACK', accent: '#9bd5bd', markerOffsets: [[-.30, .10], [-.04, -.08], [.25, .12]] }),
  }),
  balcony: Object.freeze({
    workstation: Object.freeze({ type: 'terminal', label: '气象中继', labelEn: 'WEATHER RELAY', accent: '#d4a05f', markerOffsets: [[-.26, -.06], [0, .11], [.26, -.04]] }),
    evidence: Object.freeze({ type: 'evidence', label: '湿地面勘验区', labelEn: 'WET DECK SURVEY AREA', accent: '#d7b574', markerOffsets: [[-.34, .12], [-.06, -.04], [.26, .14]] }),
  }),
});

export function sceneForZone(zoneId) {
  const id = String(zoneId || '').toLowerCase();
  const exact = { zone_datacenter: 'datacenter', zone_lobby: 'lobby', zone_lab: 'laboratory', zone_balcony: 'balcony' };
  if (Object.hasOwn(exact, id)) return exact[id];
  if (/(?:data[_-]?center|server)/.test(id)) return 'datacenter';
  if (/(?:^|[_-])(?:lab|laboratory)(?:$|[_-])/.test(id)) return 'laboratory';
  if (/lobby/.test(id)) return 'lobby';
  if (/balcony/.test(id)) return 'balcony';
  return 'office';
}

export function sceneInteractionProfile(sceneName, hotspotId) {
  const scene = Object.hasOwn(SCENE_INTERACTION_PROFILES, sceneName) ? SCENE_INTERACTION_PROFILES[sceneName] : null;
  return scene?.[hotspotId]
    || SCENE_INTERACTION_PROFILES.office[hotspotId]
    || SCENE_INTERACTION_PROFILES.office.evidence;
}

function check(condition, message) {
  if (!condition) throw new Error(`Theater asset manifest: ${message}`);
}

function vector(value, length, name) {
  check(Array.isArray(value) && value.length === length && value.every(n => Number.isFinite(n) && Math.abs(n) <= 100), `${name} must contain ${length} finite meter coordinates`);
  return [...value];
}

function identifier(value, name) {
  check(typeof value === 'string' && /^[a-zA-Z0-9_.-]{1,64}$/.test(value), `${name} has an invalid identifier`);
  return value;
}

function list(value, name, maximum = 128) {
  check(Array.isArray(value) && value.length <= maximum, `${name} must be an array (maximum ${maximum})`);
  return value;
}

function dimensions(value, name) {
  const min = vector(value?.min, 3, `${name}.min`);
  const max = vector(value?.max, 3, `${name}.max`);
  check(min.every((n, axis) => n < max[axis]), `${name} must have positive dimensions`);
  return { min, max };
}

function unique(values, name) {
  check(new Set(values.map(value => value.id)).size === values.length, `${name} identifiers must be unique`);
  return values;
}

function positive(value, name, max = 20) {
  check(Number.isFinite(value) && value > 0 && value <= max, `${name} must be positive and at most ${max}`);
  return value;
}

export function isWalkable(position, room, radius = PLAYER_RADIUS) {
  if (!Array.isArray(position) || position.length !== 3 || !position.every(Number.isFinite) || !Number.isFinite(radius) || radius <= 0) return false;
  return isWalkableXZ(position[0], position[2], room, radius);
}

function isWalkableXZ(x, z, room, radius) {
  if (x < room.bounds.min[0] + radius || x > room.bounds.max[0] - radius || z < room.bounds.min[2] + radius || z > room.bounds.max[2] - radius) return false;
  if (room.walkableBounds && (x < room.walkableBounds.min[0] || x > room.walkableBounds.max[0] || z < room.walkableBounds.min[1] || z > room.walkableBounds.max[1])) return false;
  for (const box of room.colliders) {
    const nearestX = Math.max(box.min[0], Math.min(x, box.max[0]));
    const nearestZ = Math.max(box.min[1], Math.min(z, box.max[1]));
    if ((x - nearestX) ** 2 + (z - nearestZ) ** 2 < radius ** 2 - 1e-10) return false;
  }
  return true;
}

/** Extract known fields only; filenames cannot redirect a loader to an external URL. */
export function validateTheaterManifest(input) {
  check(input?.version === 1 && input.units === 'meters' && input.upAxis === 'Y' && input.forwardAxis === '+Z', 'expected version 1, meters, Y-up and +Z-forward');
  const defaultSpawn = vector(input.spawn, 3, 'spawn');
  let walkableBounds = null;
  if (input.walkableBounds !== undefined) {
    const min = vector(input.walkableBounds?.min, 2, 'walkableBounds.min');
    const max = vector(input.walkableBounds?.max, 2, 'walkableBounds.max');
    check(min.every((value, axis) => max[axis] - value >= 1), 'walkableBounds must have positive usable dimensions');
    walkableBounds = { min, max };
  }
  const scenes = {};
  for (const [key, file] of Object.entries(SCENE_FILES)) {
    const source = input.scenes?.[key];
    check(source?.file === file, `${key}.file must be the bundled ${file}`);
    const bounds = dimensions(source.bounds, `${key}.bounds`);
    check(bounds.max[0] - bounds.min[0] >= 2 && bounds.max[2] - bounds.min[2] >= 2 && bounds.max[1] >= 2 && bounds.min[1] <= 0, `${key} must have a usable floor and room dimensions`);
    const inside = (value, name) => {
      const point = vector(value, 3, name);
      check(point[0] >= bounds.min[0] && point[0] <= bounds.max[0] && point[2] >= bounds.min[2] && point[2] <= bounds.max[2] && Math.abs(point[1]) < 0.05, `${name} must lie on the room floor within its bounds`);
      return point;
    };
    const colliders = unique(list(source.colliders, `${key}.colliders`).map(box => {
      const id = identifier(box?.id, `${key}.collider`);
      const min = vector(box.min, 2, `${key}.${id}.min`);
      const max = vector(box.max, 2, `${key}.${id}.max`);
      check(min.every((n, axis) => n < max[axis]), `${key}.${id} collider must have positive dimensions`);
      check(min[0] >= bounds.min[0] - 1 && max[0] <= bounds.max[0] + 1 && min[1] >= bounds.min[2] - 1 && max[1] <= bounds.max[2] + 1, `${key}.${id} collider is outside the room`);
      return { id, min, max };
    }), `${key}.colliders`);
    const doors = unique(list(source.doors, `${key}.doors`, 16).map(door => ({ id: identifier(door?.id, `${key}.door`), position: inside(door.position, `${key}.door.position`), width: positive(door.width, `${key}.door.width`) })), `${key}.doors`);
    const hotspots = unique(list(source.hotspots, `${key}.hotspots`, 32).map(hotspot => {
      const position = inside(hotspot.position, `${key}.hotspot.position`);
      const focusPosition = hotspot.focusPosition === undefined ? [position[0], 1.15, position[2] - .8] : vector(hotspot.focusPosition, 3, `${key}.hotspot.focusPosition`);
      check(focusPosition[0] >= bounds.min[0] && focusPosition[0] <= bounds.max[0] && focusPosition[2] >= bounds.min[2] && focusPosition[2] <= bounds.max[2] && focusPosition[1] >= .3 && focusPosition[1] <= 2.2, `${key}.hotspot.focusPosition must be a visible prop inside the room`);
      return { id: identifier(hotspot?.id, `${key}.hotspot`), position, radius: positive(hotspot.radius, `${key}.hotspot.radius`, 4), focusPosition };
    }), `${key}.hotspots`);
    const npcs = list(source.npcs, `${key}.npcs`, 32).map(npc => {
      check(['witness', 'security', 'scientist'].includes(npc?.role), `${key}.npc.role is not an authored character`);
      check(Number.isFinite(npc.rotationY) && Math.abs(npc.rotationY) <= Math.PI * 2, `${key}.npc.rotationY must be finite radians`);
      return { role: npc.role, position: inside(npc.position, `${key}.npc.position`), rotationY: npc.rotationY };
    });
    check(npcs.length >= 3 && doors.length > 0 && hotspots.length > 0, `${key} needs interview slots, a route and an investigation target`);
    if (walkableBounds) check(walkableBounds.min[0] >= bounds.min[0] && walkableBounds.max[0] <= bounds.max[0] && walkableBounds.min[1] >= bounds.min[2] && walkableBounds.max[1] <= bounds.max[2], `${key}.walkableBounds must fit within the room`);
    const room = { file, bounds, walkableBounds: walkableBounds ? { min: [...walkableBounds.min], max: [...walkableBounds.max] } : null, spawn: inside(source.spawn ?? defaultSpawn, `${key}.spawn`), colliders, doors, hotspots, npcs };
    check(isWalkable(room.spawn, room), `${key}.spawn intersects furniture or a wall`);
    check(npcs.every(npc => isWalkable(npc.position, room)), `${key} interview slots intersect furniture or walls`);
    scenes[key] = room;
  }
  const characters = {};
  for (const [key, file] of Object.entries(CHARACTER_FILES)) {
    const source = input.characters?.[key];
    check(source?.file === file, `${key}.file must be the bundled ${file}`);
    check(Array.isArray(source.animations) && ['Idle', 'Walk', 'Talk'].every(name => source.animations.includes(name)), `${key} needs Idle, Walk and Talk animations`);
    const locomotion = source.locomotion === undefined ? { speed: WALK_SPEED, duration: 1 } : {
      speed: positive(source.locomotion?.speed, `${key}.locomotion.speed`, 3),
      duration: positive(source.locomotion?.duration, `${key}.locomotion.duration`, 4),
    };
    const gaitSource = source.gait || {};
    const gait = {
      stance: Number.isFinite(gaitSource.stance) ? gaitSource.stance : .56,
      heelEnd: Number.isFinite(gaitSource.heelEnd) ? gaitSource.heelEnd : .10,
      toeStart: Number.isFinite(gaitSource.toeStart) ? gaitSource.toeStart : .40,
      swingLift: Number.isFinite(gaitSource.swingLift) ? gaitSource.swingLift : .068,
    };
    check(gait.stance > 0 && gait.stance < 1, `${key}.gait.stance must be between 0 and 1`);
    check(gait.heelEnd >= 0 && gait.heelEnd < gait.toeStart && gait.toeStart < gait.stance, `${key}.gait heel/toe phases must be ordered before stance end`);
    check(gait.swingLift >= 0 && gait.swingLift <= .3, `${key}.gait.swingLift must be a plausible meter value`);
    characters[key] = { file, height: positive(source.height, `${key}.height`, 3), bounds: dimensions(source.bounds, `${key}.bounds`), animations: ['Idle', 'Walk', 'Talk'], locomotion, gait };
  }
  return { version: 1, units: 'meters', upAxis: 'Y', forwardAxis: '+Z', spawn: defaultSpawn, scenes, characters };
}

export function withNpcColliders(room, npcs) {
  return { ...room, colliders: [...room.colliders, ...npcs.map(npc => ({
    id: `interview-${npc.npcId}`,
    min: [npc.position[0] - 0.2, npc.position[2] - 0.2],
    max: [npc.position[0] + 0.2, npc.position[2] + 0.2],
  }))] };
}

export function cameraRelativeMovement(controls, yaw = 0, output = [0, 0]) {
  const forward = Number(Boolean(controls?.forward)) - Number(Boolean(controls?.backward));
  const right = Number(Boolean(controls?.right)) - Number(Boolean(controls?.left));
  const magnitude = Math.hypot(forward, right);
  output[0] = !magnitude || !Number.isFinite(yaw) ? 0 : (right * Math.cos(yaw) - forward * Math.sin(yaw)) / magnitude;
  output[1] = !magnitude || !Number.isFinite(yaw) ? 0 : (-forward * Math.cos(yaw) - right * Math.sin(yaw)) / magnitude;
  return output;
}

/** Circle footprint of an upright capsule, axis sliding and radius-sized substeps. */
export function movePlayer(position, direction, delta, room, radius = PLAYER_RADIUS, speed = WALK_SPEED, output = [0, 0, 0]) {
  const source = isWalkable(position, room, radius) ? position : room.spawn;
  const origin = output;
  origin[0] = source[0]; origin[1] = source[1]; origin[2] = source[2];
  if (!Number.isFinite(delta) || delta <= 0 || !Number.isFinite(speed) || speed <= 0 || !Number.isFinite(radius) || radius <= 0 || !Array.isArray(direction) || direction.length !== 2 || !direction.every(Number.isFinite)) return origin;
  const magnitude = Math.hypot(...direction);
  if (!magnitude) return origin;
  const distance = Math.min(delta, MAX_FRAME_DELTA) * Math.min(speed, 8);
  const dx = direction[0] / Math.max(1, magnitude) * distance;
  const dz = direction[1] / Math.max(1, magnitude) * distance;
  const count = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.3)));
  const advanceAxis = (axis, amount) => {
    const start = origin[axis];
    const walkable = value => isWalkableXZ(axis === 0 ? value : origin[0], axis === 2 ? value : origin[2], room, radius);
    if (walkable(start + amount)) { origin[axis] = start + amount; return; }
    let low = 0;
    let high = 1;
    for (let attempt = 0; attempt < 12; attempt++) {
      const fraction = (low + high) / 2;
      if (walkable(start + amount * fraction)) low = fraction;
      else high = fraction;
    }
    origin[axis] = start + amount * low;
  };
  for (let index = 0; index < count; index++) {
    advanceAxis(0, dx / count);
    advanceAxis(2, dz / count);
  }
  return origin;
}

export function characterRole(npc, index = 0, caseId = '') {
  if (caseId === 'Lvl_01' && index < 3) return ['witness', 'security', 'scientist'][index];
  const publicIdentity = `${npc?.role || ''} ${npc?.name || ''}`;
  if (/security|guard|保安|安保|警卫/i.test(publicIdentity)) return 'security';
  if (/scientist|research|laboratory|\blab\b|\bdr\.|doctor|研究|实验|博士|科学/i.test(publicIdentity)) return 'scientist';
  return 'witness';
}

/** Every room is interview staging, not a claim about an NPC's canonical location. */
export function stageNpcs(npcs, room, caseId = '') {
  const occupied = [];
  return (npcs || []).map((npc, index) => {
    const role = characterRole(npc, index, caseId);
    const preferred = room.npcs.find(slot => slot.role === role && !occupied.some(point => Math.hypot(point[0] - slot.position[0], point[2] - slot.position[2]) < 0.9));
    const slot = preferred || room.npcs.find(item => !occupied.some(point => Math.hypot(point[0] - item.position[0], point[2] - item.position[2]) < 0.9));
    let position = slot ? [...slot.position] : null;
    if (!position) {
      for (let z = room.bounds.min[2] + 1; z < room.bounds.max[2] - 1 && !position; z += 1.2) {
        for (let x = room.bounds.min[0] + 1; x < room.bounds.max[0] - 1 && !position; x += 1.2) {
          const candidate = [x, 0, z];
          if (isWalkable(candidate, room, 0.45) && Math.hypot(x - room.spawn[0], z - room.spawn[2]) > 1 && occupied.every(point => Math.hypot(x - point[0], z - point[2]) >= 1.1)) position = candidate;
        }
      }
    }
    check(position, 'not enough safe interview space for this case');
    occupied.push(position);
    return { npcId: npc.npc_id, name: npc.name, role, position, rotationY: slot?.rotationY ?? 0 };
  });
}

/** Preserve authored roles, but version 2 has canonical contact locations. */
export function stageInvestigationNpcs(npcs, room, caseId, zoneId, investigation) {
  const staged = stageNpcs(npcs, room, caseId);
  if (!investigation?.npc_zones) return staged;
  return staged.filter(npc => investigation.npc_zones[npc.npcId] === zoneId);
}

export function investigationPropKind(kind) {
  if (/document|log|record|paper|timeline/i.test(String(kind))) return 'document';
  if (/terminal|console|screen|script|monitor/i.test(String(kind))) return 'terminal';
  if (/sample|trace|fluid|resin|fiber|blood/i.test(String(kind))) return 'sample';
  return 'device';
}

/** Connected cells keep public target positions reachable around furniture. */
function reachableCells(room) {
  const step = .4, origin = room.spawn;
  const cells = new Map([['0,0', [...origin]]]), queue = [[0, 0]];
  for (let index = 0; index < queue.length && index < 4000; index++) {
    const [x, z] = queue[index];
    for (const [nx, nz] of [[x - 1, z], [x + 1, z], [x, z - 1], [x, z + 1]]) {
      const key = `${nx},${nz}`;
      if (cells.has(key)) continue;
      const point = [origin[0] + nx * step, 0, origin[2] + nz * step];
      if (!isWalkable(point, room, .35)) continue;
      cells.set(key, point); queue.push([nx, nz]);
    }
  }
  return [...cells.values()];
}

/** Uses only already-public observations; it cannot infer reward/clue IDs. */
export function investigationTargets(room, npcs, investigation, zoneId) {
  if (!Array.isArray(investigation?.targets)) return [];
  const sources = investigation.targets.filter(target => target?.zone_id === zoneId && typeof target.target_id === 'string').slice(0, 8);
  const movementRoom = withNpcColliders(room, npcs);
  const reached = reachableCells(movementRoom), occupied = [];
  return sources.map((target, index) => {
    const preferred = Array.isArray(target.position) && target.position.length === 3 && target.position.every(Number.isFinite)
      ? target.position : room.hotspots[index % room.hotspots.length]?.position || room.spawn;
    const candidates = reached.filter(point => Math.hypot(point[0] - room.spawn[0], point[2] - room.spawn[2]) > 1
      && occupied.every(other => Math.hypot(point[0] - other[0], point[2] - other[2]) >= 1.0)
      && npcs.every(npc => Math.hypot(point[0] - npc.position[0], point[2] - npc.position[2]) >= .9)
      && room.doors.every(door => Math.hypot(point[0] - door.position[0], point[2] - door.position[2]) >= 1));
    candidates.sort((a, b) => Math.hypot(a[0] - preferred[0], a[2] - preferred[2]) - Math.hypot(b[0] - preferred[0], b[2] - preferred[2]));
    const position = candidates[0];
    if (!position) return null;
    occupied.push(position);
    const label = typeof target.label?.zh === 'string' ? target.label.zh.slice(0, 120) : '现场物件';
    const labelEn = typeof target.label?.en === 'string' ? target.label.en.slice(0, 160) : 'Scene object';
    const checks = investigation.completed_checks;
    const completed = Boolean(target.completed || (!Array.isArray(checks) && checks?.[target.target_id])
      || (Array.isArray(checks) && checks.some(check => check === target.target_id || check?.target_id === target.target_id)));
    return { kind: 'investigate', id: target.target_id, position: [...position], focusPosition: [position[0], 1.03, position[2]], radius: 1.25,
      label, labelEn, presentationLabel: label, presentationLabelEn: labelEn,
      propKind: investigationPropKind(target.kind), hotspotType: 'object', accent: completed ? '#96c5a5' : '#d8bb85', completed };
  }).filter(Boolean);
}

function investigationCollider(target) {
  return { id: `object-${target.id}`, min: [target.position[0] - .22, target.position[2] - .22], max: [target.position[0] + .22, target.position[2] + .22] };
}

export function withInvestigationColliders(room, targets) {
  return { ...room, colliders: [...room.colliders, ...targets.map(investigationCollider)] };
}

export function createInvestigationCollisionState() { return { known: new Set(), pending: new Set() }; }

/** New corroboration can appear under a stationary actor. Let them leave first. */
export function updateInvestigationColliders(state, room, targets, actorPosition = null) {
  const colliders = targets.map(investigationCollider);
  const active = colliders.filter(box => {
    const clear = !actorPosition || isWalkable(actorPosition, { ...room, colliders: [box] });
    if (!state.known.has(box.id)) {
      state.known.add(box.id);
      if (!clear) state.pending.add(box.id);
    }
    if (state.pending.has(box.id) && clear) state.pending.delete(box.id);
    return !state.pending.has(box.id);
  });
  return { ...room, colliders: [...room.colliders, ...active] };
}

/** Small bounded upper-body additions; detective chin IK stays authored. */
export function conversationOffsets(time, speaking, listening, emotion = 'calm') {
  const t = Number.isFinite(time) ? time : 0;
  const pitch = emotion === 'broken' ? .065 : emotion === 'shaken' ? .025 : 0;
  return {
    headX: pitch + (listening ? Math.sin(t * 1.4) * .016 : speaking ? Math.sin(t * 2.2) * .018 : 0),
    headY: listening ? Math.sin(t * .7) * .018 : 0,
    forearmX: speaking ? Math.sin(t * 2.2 - .35) * .026 : 0,
  };
}

export function interactionTargets(room, npcs, sceneName = 'office') {
  return [
    ...npcs.map(npc => ({ kind: 'npc', npcId: npc.npcId, position: [...npc.position], radius: 1.6, label: 'Talk / 交谈' })),
    ...room.hotspots.map(hotspot => {
      const profile = sceneInteractionProfile(sceneName, hotspot.id);
      return {
        kind: 'investigate', id: hotspot.id, position: [...hotspot.position], radius: hotspot.radius,
        label: hotspot.id === 'workstation' ? 'Inspect workstation / 调查工作台' : 'Inspect scene / 调查现场',
        hotspotType: profile.type, presentationLabel: profile.label, presentationLabelEn: profile.labelEn,
        accent: profile.accent,
      };
    }),
    ...room.doors.map(door => ({ kind: 'door', id: door.id, position: [...door.position], radius: Math.max(1.4, door.width * 0.7), label: 'Room routes / 区域通道' })),
  ];
}

export function targetKey(target) {
  return target ? `${target.kind}:${target.npcId ?? target.id}` : '';
}

export function nearestTarget(position, targets) {
  if (!Array.isArray(position) || !position.every(Number.isFinite)) return null;
  let nearest = null;
  let closest = Infinity;
  for (const target of targets) {
    const distance = Math.hypot(position[0] - target.position[0], position[2] - target.position[2]);
    if (distance <= target.radius && distance < closest) { nearest = target; closest = distance; }
  }
  return nearest;
}

export function interactionIntent(target) {
  if (target?.kind === 'npc' && typeof target.npcId === 'string') return { kind: 'npc', npcId: target.npcId };
  if (['investigate', 'door'].includes(target?.kind) && typeof target.id === 'string') return { kind: target.kind, id: target.id };
  return null;
}

export function restoreSpatial(saved, room) {
  const position = isWalkable(saved?.position, room) ? [...saved.position] : [...room.spawn];
  position[1] = 0;
  return {
    position,
    rotationY: Number.isFinite(saved?.rotationY) ? saved.rotationY : Math.PI,
    yaw: Number.isFinite(saved?.yaw) ? saved.yaw % (Math.PI * 2) : 0,
    pitch: Number.isFinite(saved?.pitch) ? Math.max(0.35, Math.min(1.05, saved.pitch)) : 0.55,
  };
}

export function isViewportKeyTarget(target, viewport) {
  if (!target || !viewport?.contains(target)) return false;
  if (target.closest?.('input, textarea, select, button, a, [role="button"], [contenteditable]:not([contenteditable="false"])')) return false;
  return target === viewport || String(target.tagName).toLowerCase() === 'canvas';
}
