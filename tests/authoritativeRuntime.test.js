import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { normalizePriorityList } from '../src/game/teamConfig.js';

const text = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');
const owner = ts.createSourceFile('InvestigationTerminal.jsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const endingText = readFileSync(new URL('../src/components/game/GameOverScreen.jsx', import.meta.url), 'utf8');
const ending = ts.createSourceFile('GameOverScreen.jsx', endingText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function find(root, name) {
  let found;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(root);
  assert.ok(found, name);
  return found.initializer;
}
function handler(name, bindings, root = owner) {
  const { outputText } = ts.transpileModule(`const result = (${find(root, name).getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}
const callback = fn => fn;
function commitHarness() {
  const stored = {};
  const bindings = { useCallback: callback, gameStateRef: { current: null }, bsodCountRef: { current: 0 }, crisisPendingRef: { current: false }, finalSettlementRef: { current: null }, finalizingRef: { current: false } };
  for (const name of ['ServerRun', 'GameState', 'LinkedPairs', 'NpcEmotionState', 'TruthFragments', 'JudgeResult', 'ShowBSoD', 'CrisisPending', 'Crisis', 'IsFinalizing', 'FinalJudgeResult', 'ShowGameOver']) {
    bindings[`set${name}`] = value => { stored[name] = value; };
  }
  return { stored, bindings, commit: handler('commitServerRun', bindings) };
}
const run = (extra = {}) => ({
  id: 'paid-1', revision: 9, status: 'active', state: { run_id: 'paid-1', turn_count: 3, unlocked_clues: ['c_02'], destroyed_clue_ids: ['c_01'], action_points_left: 7, confusion_score: 100, is_crashed: true },
  linked_pairs: [{ a: 'c_02', b: 'c_03', valid: true }], bsod_count: 2,
  npc_emotions: { npc_1: { level: 'broken' } }, truth_fragments: 3, pending_crisis: { id: 'purge' }, ...extra,
});

test('actual commit stores exact server state and dependent crisis, links, emotion, crash values without local re-rolls', () => {
  const h = commitHarness();
  const snapshot = run();
  h.commit(snapshot);
  assert.strictEqual(h.stored.GameState, snapshot.state);
  assert.strictEqual(h.bindings.gameStateRef.current, snapshot.state);
  assert.strictEqual(h.stored.LinkedPairs, snapshot.linked_pairs);
  assert.strictEqual(h.stored.Crisis, snapshot.pending_crisis);
  assert.strictEqual(h.stored.NpcEmotionState, snapshot.npc_emotions);
  assert.equal(h.bindings.bsodCountRef.current, 2);
  assert.equal(h.stored.ShowBSoD, true);
  assert.equal(h.stored.TruthFragments, 3);
  assert.doesNotMatch(text, /applySettlementResult|applyRecoveryTurn|applyCrisisChoice|acquireClues|destroyClues|spendAgentStamina|settleRoundEvidence|rollCrisis|createInitialGameState/);
  assert.equal((text.match(/setGameState\(/g) || []).length, 1);
});

test('public acquired clue projection overrides local labels in the selected language without granting evidence', () => {
  const local = { clue_dictionary: [{ clue_id: 'c_01', keyword: 'Old label', description: 'Old text' }, { clue_id: 'c_02', keyword: 'Locked label' }] };
  const clue = { clue_id: 'c_01', keyword: '云端线索', description: '云端记录', visual_icon: '🔎', en: { keyword: 'Cloud clue', description: 'Cloud record' } };
  for (const lang of ['en', 'zh']) {
    const result = handler('caseData', {
      useMemo: fn => fn(), localizeCase: () => local, caseDataResolved: local,
      serverRun: { state: { revealed_clues: [clue] } }, lang,
    });
    assert.equal(result.clue_dictionary[0].keyword, lang === 'en' ? clue.en.keyword : clue.keyword);
    assert.equal(result.clue_dictionary[0].description, lang === 'en' ? clue.en.description : clue.description);
    assert.equal(result.clue_dictionary[1].keyword, 'Locked label');
    assert.equal(local.clue_dictionary[0].keyword, 'Old label');
  }
});

test('terminal cloud status restores finalization after lost report or abandon replies', () => {
  for (const status of ['completed', 'failed', 'abandoned', 'settled']) {
    const h = commitHarness();
    const snapshot = run({ status, judge_result: { score: status === 'completed' ? 'A' : 'D', is_passed: status === 'completed' } });
    h.commit(snapshot);
    assert.equal(h.stored.ShowGameOver, true);
    assert.equal(h.bindings.finalizingRef.current, true);
    assert.strictEqual(h.bindings.finalSettlementRef.current.gameState, snapshot.state);
    assert.strictEqual(h.stored.FinalJudgeResult, snapshot.judge_result);
  }
});

test('actual runtime gateway commits before business error, freezes unknown results, and rejects overlapping intents', async () => {
  for (const kind of ['success', 'business', 'offline', 'busy']) {
    const h = commitHarness();
    const signals = {};
    const commands = [];
    const snapshot = run();
    const bindings = {
      useCallback: callback, lang: 'en', commandInFlightRef: { current: kind === 'busy' }, commitServerRun: h.commit,
      setAuthorityReady: value => { signals.ready = value; }, setAuthorityError: value => { signals.error = value; },
      runClient: { command: async command => {
        commands.push(command);
        if (kind === 'offline') throw new Error('offline');
        return { run: snapshot, result: kind === 'business' ? { error: 'insufficient_ap' } : {} };
      } },
    };
    bindings.runViewRef = { current: { client: bindings.runClient, active: true } };
    const execute = handler('executeRunCommand', bindings);
    if (kind === 'success') await execute({ type: 'rest' });
    else await assert.rejects(execute({ type: 'rest' }));
    assert.equal(commands.length, kind === 'busy' ? 0 : 1);
    if (kind === 'success' || kind === 'business') assert.strictEqual(h.stored.GameState, snapshot.state);
    if (kind === 'offline') { assert.equal(signals.ready, false); assert.ok(signals.error); }
    else assert.equal(signals.ready, undefined);
  }
});

test('map priorities stay server-controlled through pending or rejected reorders and disable while locked', () => {
  const mapText = readFileSync(new URL('../src/components/game/CaseFlowMap.jsx', import.meta.url), 'utf8');
  const map = ts.createSourceFile('map.jsx', mapText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const confirmed = normalizePriorityList();
  for (const priorityDisabled of [false, true]) {
    const calls = [];
    const bindings = {
      priority: confirmed, priorityDisabled, dragPri: confirmed[0],
      onPriorityChange: value => calls.push(value), setDragPri: () => {}, setDragOverPri: () => {},
    };
    handler('movePriority', bindings, map)(0, 1);
    handler('handlePriDrop', bindings, map)(confirmed[1]);
    assert.equal(calls.length, priorityDisabled ? 0 : 2);
    assert.deepEqual(confirmed, normalizePriorityList());
    assert.deepEqual(handler('priority', { normalizePriorityList, agentStrategy: { priority_list: confirmed } }, map), confirmed);
    if (!priorityDisabled) {
      assert.deepEqual(calls[0], calls[1]);
      assert.notDeepEqual(calls[0], confirmed);
      assert.deepEqual(handler('priority', { normalizePriorityList, agentStrategy: { priority_list: calls[0] } }, map), calls[0]);
    }
  }
  assert.doesNotMatch(mapText, /setPriority\(/);
  assert.match(text, /priorityDisabled=\{interactionLocked\}/);
  assert.equal(handler('currentZone', { gameState: { current_zone: 'server-zone' }, agentPath: ['old-local-zone'] }, map), 'server-zone');
});

test('cinematic completion is presentation-only and cannot recalculate truth or unlock bonuses', () => {
  const lines = [];
  let cleared = false;
  handler('handleCinematicDone', {
    cinematic: { narrative: 'Confirmed link', villain_memory: 'A memory', is_core_link: true, hidden_ending_progress: 999 },
    setCinematic: value => { cleared = value === null; }, addLine: line => lines.push(line), lang: 'en',
  })();
  assert.equal(cleared, true);
  assert.equal(lines.length, 2);
});

test('actual report handler sends only selection IDs and trusts server rejection state, never applies local penalties', async () => {
  const commands = [];
  const state = run().state;
  let judgment;
  const ctrl = new AbortController();
  const report = { conclusionId: 'suspect', methodId: 'method', motiveId: 'motive', timelineId: 'timeline', evidenceIds: ['c_02'] };
  const verdict = { score: 'D', is_passed: false, critique: 'Stored verdict' };
  await handler('handleSubmitReport', {
    authorityReady: true, structuredReport: report, isProcessing: false, abortCtrlRef: { current: null }, finalizingRef: { current: false }, crisisPendingRef: { current: false }, activeRunRef: { current: 1 },
    beginAbortableOperation: () => ({ ctrl, operationId: 1 }), isOperationCurrent: () => true,
    setIsProcessing: () => {}, setReportError: () => {}, setReactState: () => {}, ReAct_Enum: { REPORTING: 'REPORTING', IDLE: 'IDLE' },
    executeRunCommand: async command => { commands.push(command); return { run: { state, judge_result: verdict }, result: verdict }; },
    setJudgeResult: result => { judgment = result; }, addLine: () => {}, t: {}, publicErrorMessage: () => '', lang: 'en',
  })();
  assert.deepEqual(commands, [{ type: 'report', conclusion_id: report.conclusionId, method_id: report.methodId, motive_id: report.motiveId, timeline_id: report.timelineId, evidence_ids: report.evidenceIds }]);
  assert.strictEqual(judgment, verdict);
  assert.equal(state.action_points_left, 7);
});

test('settlement actual callback sends no xp or summary and accepts only cloud-confirmed breakdown and profile', async () => {
  for (const outcome of ['confirmed', 'flat-confirmed', 'pending', 'missing-profile', 'missing-breakdown', 'error']) {
    const stored = {};
    const calls = [];
    const breakdown = { total: 173, base: 100, clueBonus: 73 };
    const profile = { level: 2, xp: 73, agent_progression: [{ xp: 17 }] };
    const response = { profile, result: { xp_breakdown: breakdown } };
    if (outcome === 'flat-confirmed') { response.xp_breakdown = breakdown; delete response.result; }
    if (outcome === 'pending') response.pending = true;
    if (outcome === 'missing-profile') delete response.profile;
    if (outcome === 'missing-breakdown') delete response.result.xp_breakdown;
    if (outcome === 'error') response.error = 'offline';
    const bindings = {
      useCallback: callback, settlementSentRef: { current: false },
      onSettlement: async (...args) => { calls.push(args); return response; },
      setSettlementStatus: value => { stored.status = value; }, setXpGain: value => { stored.xp = value; },
      normalizeAgentProgression: value => value, setNewProg: value => { stored.progression = value; }, setSettledDetective: value => { stored.detective = value; },
    };
    await handler('syncSettlement', bindings, ending)();
    assert.deepEqual(calls, [[]]);
    const confirmed = ['confirmed', 'flat-confirmed'].includes(outcome);
    assert.equal(stored.status, confirmed ? 'saved' : 'error');
    assert.equal(stored.xp, confirmed ? breakdown : undefined);
  }
  assert.doesNotMatch(endingText, /calculateCaseXP|REWARDS SAVED LOCALLY/);
  assert.match(text, /onSettlement=\{\(\) => onSettlement\?\.\(\{ run_id: finalGameState.run_id \}\)\}/);
});
