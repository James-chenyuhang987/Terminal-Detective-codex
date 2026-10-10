import assert from 'node:assert/strict';
import test from 'node:test';
import { MeshStandardMaterial } from 'three';
import { fieldFraming, fieldProgress, npcAppearance, npcDemeanor, sceneEvidenceCount, SCENE_ART } from '../src/game/theaterVisuals.js';
import { fieldMaterial } from '../src/game/theaterMaterials.js';

test('field dressing projects confirmed state only, without accessing case answers or private records', () => {
  const state = Object.freeze({ unlocked_clues: Object.freeze(['c_01', 'c_01', 'c_02', '../../answer', null]), turn_count: 4, last_action: 'hack_terminal',
    get culprit() { throw new Error('private answer accessed'); }, get chat_history() { throw new Error('dialogue history accessed'); }, get profile() { throw new Error('profile accessed'); },
  });
  assert.deepEqual(fieldProgress(state), { evidenceCount: 2, evidenceIds: ['c_01','c_02'], turn: 4, terminalActive: true, action: 'hack_terminal' });
  assert.equal(fieldProgress({last_action:'a_hidden_answer',unlocked_clues:[]}).terminalActive, false);
  assert.equal(fieldProgress({turn_count:Infinity}).turn, 9999);
  assert.equal(fieldProgress({turn_count:NaN}).turn, 0);
});

test('all rooms keep distinct art direction; stable public NPC IDs produce bounded independent appearances', () => {
  assert.equal(new Set(Object.values(SCENE_ART).map(art=>art.key)).size, 5);
  for (const role of ['witness','security','scientist']) {
    const looks = Array.from({length:12},(_,i)=>npcAppearance('Lvl_01',`npc_${i}`,role));
    assert.ok(looks.every(look=>/^#[0-9a-f]{6}$/.test(look.coat)&&look.stature>=.98&&look.stature<=1.02&&look.phase>=0&&look.phase<2));
    assert.ok(new Set(looks.map(look=>look.coat)).size>1);
    assert.deepEqual(npcAppearance('Lvl_01','npc_1',role),npcAppearance('Lvl_01','npc_1',role));
  }
});

test('scene clue dressing only counts public clues assigned to the active zone', () => {
  const caseData = {
    zone_clue_map: { zone_a: ['c_01', 'c_secret', 'c_02'] },
    clue_dictionary: [{ clue_id: 'c_01' }, { clue_id: 'c_secret', unlock_turn: 6 }, { clue_id: 'c_02' }],
  };
  assert.equal(sceneEvidenceCount(caseData, 'zone_a', { evidenceIds: ['c_01', 'c_secret', 'c_02'] }), 2);
  assert.equal(sceneEvidenceCount(caseData, 'zone_missing', { evidenceIds: ['c_01'] }), 0);
});

test('exploration camera fits the avatar through the open front, with more distance on a narrow viewport', () => {
  const source = {position:Object.freeze([0,0,3]),yaw:0,pitch:.55,aspect:1.6};
  const desktop = fieldFraming(source);
  const mobile = fieldFraming({...source,aspect:.46});
  assert.ok(desktop.target[2]+Math.cos(desktop.pitch)*desktop.distance>6, 'The camera can use the open space beyond the cutaway front');
  assert.ok(mobile.distance>desktop.distance);
  assert.deepEqual(source.position,[0,0,3]);
  const reusable={target:[0,0,0]};
  assert.strictEqual(fieldFraming(source,reusable),reusable);
});

test('NPC posture uses only public emotion levels and falls back to a neutral bounded pose', () => {
  assert.deepEqual(npcDemeanor('a_private_answer'), npcDemeanor('calm'));
  assert.deepEqual(npcDemeanor('__proto__'), npcDemeanor('calm'));
  assert.deepEqual(npcDemeanor('constructor'), npcDemeanor('calm'));
  assert.ok(npcDemeanor('broken').headPitch > npcDemeanor('shaken').headPitch);
  for (const level of ['calm', 'shaken', 'broken']) {
    assert.ok(Object.values(npcDemeanor(level)).every(value => Number.isFinite(value) && value >= 0 && value <= .15));
    assert.ok(Object.isFrozen(npcDemeanor(level)));
  }
});

test('inspection, arrival and conversation framing never teleport a player or change navigation yaw', () => {
  const position=Object.freeze([0,0,3]);
  const contact=Object.freeze({position:Object.freeze([1.2,0,1.6]),rotationY:0});
  const args={position,yaw:.25,pitch:.55,aspect:1.6};
  const overview=fieldFraming({...args,overview:true});
  const dialogue=fieldFraming({...args,contact});
  const inspection=fieldFraming({...args,focus:[-3.6,1.3,-2.5]});
  assert.ok(overview.distance>fieldFraming(args).distance);
  assert.ok(dialogue.distance<fieldFraming(args).distance);
  assert.ok(inspection.distance<fieldFraming(args).distance);
  assert.deepEqual(position,[0,0,3]);
  assert.equal(args.yaw,.25);
});

test('surface finishing owns its material and shader state, preserving the loader cache', () => {
  const source=new MeshStandardMaterial({color:'#493422',roughness:.7});source.name='wood';
  const first=fieldMaterial(source),second=fieldMaterial(source);
  assert.notStrictEqual(first,source);assert.notStrictEqual(first,second);
  first.color.set('#ffffff');assert.equal(source.color.getHexString(),'493422');
  const shader={uniforms:{},vertexShader:'#include <common>\n#include <begin_vertex>',fragmentShader:'#include <common>\n#include <roughnessmap_fragment>'};
  first.onBeforeCompile(shader);
  assert.ok(shader.uniforms.fieldGrain.value>0);
  assert.match(shader.vertexShader,/vFieldCoord = position/);
  assert.match(shader.fragmentShader,/roughnessFactor = clamp/);
  first.dispose();second.dispose();source.dispose();
});
