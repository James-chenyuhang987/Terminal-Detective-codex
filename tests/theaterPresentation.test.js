import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveTheaterInteraction } from '../src/game/theaterInteraction.js';
import { createInitialGameState, applySettlementResult, applyRecoveryTurn } from '../src/game/gameState.js';
import { ALL_CASES, Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { resolveNextZone } from '../src/game/caseRuntime.js';

const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const owner = read('components/game/InvestigationTerminal.jsx');
const presentation = read('components/game/theater/TheaterPresentation.jsx');
const controls = read('components/game/theater/RunPresentationControls.jsx');
const decisions = read('components/game/DecisionCards.jsx');

function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}

test('every case routes scene contacts to the exact existing NPC, without inventing dialogue', () => {
  for (const caseData of ALL_CASES) {
    const npcs = freeze(structuredClone(caseData.npcs));
    for (const npc of npcs) {
      const result = resolveTheaterInteraction({ kind: 'npc', npcId: npc.npc_id }, npcs);
      assert.equal(result.type, 'talk');
      assert.strictEqual(result.npc, npc);
      assert.deepEqual(Object.keys(result), ['type', 'npc']);
    }
    assert.equal(resolveTheaterInteraction({ kind: 'npc', npcId: 'not-in-this-case' }, npcs), null);
  }
});

test('doors and props only open presentation panels; repeated exploration spends or unlocks nothing', () => {
  const caseData = freeze(structuredClone(Case_Data_Lvl_01));
  const state = freeze({
    ...createInitialGameState(caseData),
    agent_stamina: { 'NEXUS-01': 4, 'AURORA-09': 10, 'CIPHER-47': 90 },
    action_points_left: 7,
    turn_count: 5,
    unlocked_clues: ['c_01'],
    destroyed_clues: ['c_08'],
  });
  const before = structuredClone(state);
  for (let i = 0; i < 40; i++) {
    assert.deepEqual(resolveTheaterInteraction({ kind: 'door', id: 'exit', next_zone: 'zone_lab' }, caseData.npcs), { type: 'panel', panel: 'routes' });
    assert.deepEqual(resolveTheaterInteraction({ kind: 'investigate', id: 'evidence', new_clues: ['c_08'] }, caseData.npcs), { type: 'panel', panel: 'investigate' });
  }
  assert.deepEqual(state, before);
  const nextZone = resolveNextZone({ caseData, currentZone: state.current_zone, actionName: 'hack_terminal' });
  const settlement = applySettlementResult(state, { action_name: 'hack_terminal', time_cost: 2, next_zone: nextZone }, { executing_agent_id: 'AURORA-09' }, caseData).newState;
  assert.equal(settlement.run_id, state.run_id);
  assert.equal(settlement.action_points_left, state.action_points_left - 2);
  assert.equal(settlement.turn_count, state.turn_count + 1);
  assert.equal(settlement.current_zone, 'zone_lab');
  assert.equal(settlement.agent_stamina['AURORA-09'], 4);
  assert.deepEqual(settlement.destroyed_clues, state.destroyed_clues);
  const recovered = applyRecoveryTurn(settlement, Object.keys(settlement.agent_stamina));
  assert.equal(recovered.run_id, state.run_id);
  assert.equal(recovered.turn_count, settlement.turn_count + 1);
  assert.equal(recovered.agent_stamina['AURORA-09'], 8);
});

test('modal, busy, hidden-route and background pause rejects all scene intents', () => {
  const npcs = Case_Data_Lvl_01.npcs;
  for (const intent of [{ kind: 'npc', npcId: npcs[0].npc_id }, { kind: 'door', id: 'exit' }, { kind: 'investigate', id: 'workstation' }]) {
    assert.equal(resolveTheaterInteraction(intent, npcs, true), null);
  }
  assert.equal(resolveTheaterInteraction(null, npcs), null);
  assert.equal(resolveTheaterInteraction({ kind: 'settle' }, npcs), null);
});

test('theater is a lazy presentation child of the single authoritative investigation owner', () => {
  assert.equal((owner.match(/createInitialGameState\(/g) || []).length, 1);
  assert.match(owner, /theaterMode && <TheaterPresentation/);
  assert.match(owner, /onSwitch=\{\(\) => setSetting\('storyMode', theaterMode \? 'terminal' : 'theater'\)\}/);
  assert.match(owner, /onTextMode=\{\(\) => setSetting\('storyMode', 'terminal'\)\}/);
  assert.match(presentation, /lazy\(\(\) => import\('\.\/TheaterScene'\)\)/);
  assert.doesNotMatch(presentation, /from ['"](?:three|@react-three)|setGameState|startCase|applySettlementResult|resolveNextZone|fetch\(/);
  assert.match(presentation, /const intent = resolveTheaterInteraction\(target, caseData.npcs, movementPaused\)/);
  assert.match(presentation, /if \(intent\?\.type === 'talk'\) onTalk\(intent.npc\)/);
  assert.match(owner, /onQuestion=\{handleNPCQuestion\}/);
  assert.match(owner, /onSubmit=\{handleSubmitReport\}/);
  assert.match(owner, /onLink=\{handleLink\}/);
  assert.match(owner, /dialoguePanel=\{dialoguePanel\}/);
  assert.match(owner, /reportPanel=\{reportPanel\}/);
  assert.match(owner, /toolsPanel=\{toolsPanel\}/);
});

test('mode controls never abort pending actions and remain available through final settlement', () => {
  assert.match(controls, /createPortal\(/);
  assert.doesNotMatch(controls, /onGameEnd|onBackToLobby|handleAbort|onChoose|run_id|gameState/);
  const ending = owner.slice(owner.indexOf('  if (showGameOver) {'), owner.indexOf('className={`td-investigation td-page-shell'));
  assert.match(ending, /\{presentationControls\}/);
  assert.match(ending, /<GameOverScreen/);
  assert.match(ending, /finalSettlementRef.current/);
  assert.match(ending, /run_id: finalGameState.run_id/);
  assert.match(owner, /active=\{presentationActive\}/);
  assert.match(owner, /actionCinematic && presentationActive && !showSettings &&/);
  assert.match(owner, /onClick=\{onOpenHome \|\| onBackToLobby\}/);
});

test('a suspended decision retains component state and cannot auto-resolve while HOME or settings is open', () => {
  assert.match(owner, /\{decisionCards && \(\s*<DecisionCards/);
  assert.match(owner, /presentationActive=\{presentationActive && !showSettings\}/);
  assert.match(decisions, /if \(!presentationActive\) return undefined;\s*const id = window.setInterval/);
  assert.match(decisions, /if \(!document.hidden && document.hasFocus\(\)\) setLeft/);
  assert.match(decisions, /if \(!presentationActive\) return;\s*const fallbackCard/);
  assert.match(decisions, /style=\{presentationActive \? undefined : \{ display: 'none' \}\}/);
  assert.doesNotMatch(decisions, /setLeft\(timeLimit\)|key=\{.*storyMode/);
});

test('shared tools, reports, and notebook have accessible scene-independent controls and safe failure paths', () => {
  for (const control of ['onExecute', 'onTalk', 'onOpenTools', 'onReport', 'onCommand', 'onGuide', 'onEnd', 'onTextMode']) assert.ok(presentation.includes(control));
  assert.match(presentation, /class TheaterErrorBoundary/);
  assert.match(presentation, /SceneUnavailable/);
  assert.match(presentation, /onPointerCancel/);
  assert.match(presentation, /onLostPointerCapture/);
  assert.match(presentation, /previous.isConnected/);
  assert.match(presentation, /prefers-reduced-motion/);
});
