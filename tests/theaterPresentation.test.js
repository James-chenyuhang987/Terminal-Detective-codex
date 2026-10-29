import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { resolveTheaterInteraction } from '../src/game/theaterInteraction.js';
import { createInitialGameState, applySettlementResult, applyRecoveryTurn } from '../src/game/gameState.js';
import { ALL_CASES, Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { resolveNextZone } from '../src/game/caseRuntime.js';

const read = name => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8');
const owner = read('components/game/InvestigationTerminal.jsx');
const presentation = read('components/game/theater/TheaterPresentation.jsx');
const controls = read('components/game/theater/RunPresentationControls.jsx');
const decisions = read('components/game/DecisionCards.jsx');

test('a field contact opens the existing dialogue after closing the theater overlay, with pause and area guards', () => {
  const file = ts.createSourceFile('TheaterPresentation.jsx', presentation, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const component = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'TheaterPresentation');
  const declaration = component.body.statements.filter(ts.isVariableStatement).flatMap(node => [...node.declarationList.declarations])
    .find(node => node.name.getText(file) === 'contactFieldPanel');
  const calls = [];
  const fieldPanel = React.createElement('div', { onTalk: id => calls.push(['talk', id]) });
  const bindings = { React, fieldPanel, busy: false, paused: false, active: true, zoneId: 'hall',
    investigation: { npc_zones: { witness: 'hall', suspect: 'roof' } }, closePanel: () => calls.push(['close']) };
  const render = overrides => {
    const values = { ...bindings, ...overrides };
    return compileFunction(`return ${declaration.initializer.getText(file)};`, Object.keys(values))(...Object.values(values));
  };
  for (const override of [{ busy: true }, { paused: true }, { active: false }]) render(override).props.onTalk('witness');
  render().props.onTalk('suspect');
  render().props.onTalk('unknown');
  assert.deepEqual(calls, []);
  render().props.onTalk('witness');
  assert.deepEqual(calls, [['close'], ['talk', 'witness']]);
  assert.equal(render({ fieldPanel: null }), null);
});

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
  assert.doesNotMatch(owner, /createInitialGameState\(/);
  assert.equal((owner.match(/setGameState\(run.state\)/g) || []).length, 1);
  assert.match(owner, /theaterMode && <TheaterPresentation/);
  assert.match(owner, /onSwitch=\{\(\) => setSetting\('storyMode', theaterMode \? 'terminal' : 'theater'\)\}/);
  assert.match(owner, /onTextMode=\{\(\) => setSetting\('storyMode', 'terminal'\)\}/);
  assert.match(presentation, /lazy\(\(\) => import\('\.\/TheaterScene'\)\)/);
  assert.doesNotMatch(presentation, /from ['"](?:three|@react-three)|setGameState|startCase|applySettlementResult|resolveNextZone|fetch\(/);
  assert.match(presentation, /const intent = resolveTheaterInteraction\(target, caseData.npcs, movementPaused\)/);
  assert.match(presentation, /if \(intent\?\.type === 'talk'\) \{[\s\S]*?setInteractionNpcId\(intent.npc.npc_id\);[\s\S]*?onTalk\(intent.npc\);/);
  assert.match(presentation, /closePanel\(\); setInteractionNpcId\(npc\.npc_id\); onTalk\(npc\);/);
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
  assert.match(presentation, /const \{ reducedMotion \} = usePresentationMotion\(\)/);
  assert.match(read('components/ui/usePresentationMotion.js'), /prefers-reduced-motion/);
  assert.match(read('components/ui/usePresentationMotion.js'), /settings.reduceMotion/);
});


test('opening the dialogue consumes its pending interaction so closing the inner dialogue cannot leave a stale talk pose', () => {
  const source = ts.createSourceFile('TheaterPresentation.jsx', presentation, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  let effect;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'useEffect' && node.arguments[1]?.getText() === '[dialoguePanel, interactionNpcId]') effect = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  const { outputText } = ts.transpileModule(`const result = (${effect.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  let pending = 'witness';
  const timers = new Map();
  const window = { setTimeout(callback) { timers.set(1, callback); return 1; }, clearTimeout(id) { timers.delete(id); } };
  const run = dialoguePanel => compileFunction(`${outputText}\nreturn result;`, ['interactionNpcId', 'dialoguePanel', 'setInteractionNpcId', 'window'])(
    pending, dialoguePanel, value => { pending = typeof value === 'function' ? value(pending) : value; }, window,
  )();
  const cancelPending = run(null);
  assert.equal(pending, 'witness', 'the gesture starts while the dialogue loads');
  assert.equal(timers.size, 1);
  cancelPending();
  run({ type: 'NPCDialogBox' });
  assert.equal(pending, null, 'the authoritative selected NPC takes over as soon as the dialogue is present');
  run(null);
  assert.equal(timers.size, 0, 'closing inside NPCDialogBox does not leave a 1.2-second stale interaction');
});
