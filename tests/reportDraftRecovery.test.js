import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { defaultReportDraft, readReportDraft, removeReportDraft, writeReportDraft } from '../src/game/reportDraft.js';

const source = ts.createSourceFile('InvestigationTerminal.jsx', readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8'),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const terminal = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'InvestigationTerminal');
const commitStatement = terminal.body.statements.find(node => ts.isVariableStatement(node)
  && node.declarationList.declarations.some(declaration => declaration.name.getText(source) === 'commitServerRun'));
const code = ts.transpileModule(commitStatement.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { ownerUid: 'owner-a', runId: 'run-1', caseId: 'Lvl_01', investigationVersion: 2 };
const draft = { ...defaultReportDraft(), conclusionId: 'suspect-1', methodId: 'method-1', motiveId: 'motive-1', timelineId: 'timeline-1',
  evidenceByDimension: { opportunity: ['c_01'], method: ['c_02'], motive: ['c_03'], timeline: ['c_04'] } };
function storage() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
function run(extra = {}) {
  return { id: context.runId, status: 'active', investigation_version: 2, investigation: { report_policy: { balance_revision: 2 } },
    state: { run_id: context.runId, unlocked_clues: ['c_01', 'c_02', 'c_03', 'c_04'] }, linked_pairs: [], ...extra };
}

// Execute the component's actual shared snapshot commit. Transport responses,
// receipt replay and refresh/status all flow through this callback.
function harness(store = storage(), scope = context) {
  const presented = {};
  let clears = 0;
  const setters = Object.fromEntries(['ServerRun', 'ReportOptions', 'GameState', 'LinkedPairs', 'NpcEmotionState', 'TruthFragments',
    'JudgeResult', 'ShowBSoD', 'CrisisPending', 'Crisis', 'IsFinalizing', 'FinalJudgeResult', 'ShowGameOver']
    .map(key => [`set${key}`, next => { presented[key] = typeof next === 'function' ? next(presented[key]) : next; }]));
  const bindings = { ...setters, useCallback: callback => callback,
    gameStateRef: { current: null }, bsodCountRef: { current: 0 }, crisisPendingRef: { current: false },
    finalSettlementRef: { current: null }, finalizingRef: { current: false },
    clearReportDraft: () => { clears++; return removeReportDraft(scope, store); } };
  const commit = compileFunction(`${code}\nreturn commitServerRun;`, Object.keys(bindings))(...Object.values(bindings));
  return { store, presented, commit, get clears() { return clears; } };
}

test('direct success and replay of the same successful snapshot both clear only the matching report draft', () => {
  const app = harness();
  const other = { ...context, runId: 'run-2' };
  writeReportDraft(context, draft, app.store);
  writeReportDraft(other, draft, app.store);
  const success = run({ status: 'completed', judge_result: { is_passed: true, score: 'A' } });
  app.commit(success);
  assert.equal(readReportDraft(context, app.store).status, 'empty');
  assert.equal(readReportDraft(other, app.store).status, 'saved');
  assert.equal(app.presented.ShowGameOver, true);
  app.commit(success);
  assert.equal(app.clears, 2, 'replaying a confirmed success remains safe and idempotent');
  assert.equal(readReportDraft(context, app.store).status, 'empty');
  assert.equal(readReportDraft(other, app.store).status, 'saved');
});

test('a lost successful response clears its existing draft when the recovery snapshot is committed', () => {
  const store = storage();
  writeReportDraft(context, draft, store);
  assert.equal(readReportDraft(context, store).status, 'saved');
  const recovered = harness(store);
  recovered.commit(run({ status: 'completed', judge_result: { is_passed: true, score: 'B' } }));
  assert.equal(recovered.clears, 1);
  assert.deepEqual(readReportDraft(context, store).value, defaultReportDraft());
  assert.equal(recovered.presented.FinalJudgeResult.score, 'B');
});

test('rejected reports retain choices and evidence for correction after a normal or replayed response', () => {
  const app = harness();
  const saved = writeReportDraft(context, draft, app.store);
  const rejected = run({ judge_result: { is_passed: false, score: 'D', missing_dimensions: ['method'] } });
  app.commit(rejected);
  app.commit(rejected);
  assert.equal(app.clears, 0);
  assert.deepEqual(readReportDraft(context, app.store), saved);
  assert.equal(app.presented.JudgeResult.is_passed, false);
});

test('status snapshots without a passing judgment preserve report drafts rather than guessing from status', () => {
  const app = harness();
  const saved = writeReportDraft(context, draft, app.store);
  app.commit(run());
  app.commit(run({ status: 'completed', judge_result: null }));
  assert.equal(app.clears, 0);
  assert.deepEqual(readReportDraft(context, app.store), saved);
});

test('refreshing completed or settled successful cases clears leftover v1 and v2 drafts', () => {
  for (const investigationVersion of [1, 2]) {
    const scope = { ...context, investigationVersion };
    for (const status of ['completed', 'settled']) {
      const store = storage();
      writeReportDraft(scope, { ...draft, evidenceIds: ['c_01', 'c_02'] }, store);
      const refreshed = harness(store, scope);
      refreshed.commit(run({ investigation_version: investigationVersion, status, judge_result: { is_passed: true, score: 'C' } }));
      assert.equal(refreshed.clears, 1);
      assert.equal(readReportDraft(scope, store).status, 'empty');
      assert.equal(refreshed.presented.ShowGameOver, true);
    }
  }
});
