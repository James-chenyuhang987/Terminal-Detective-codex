import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { ALL_CASES } from '../src/game/caseData.js';
import { createPlayerRunClient } from '../src/game/playerRun.js';
import { runRecoveryMessage } from '../src/game/playerRun.js';
import { publicErrorMessage } from '../src/lib/publicError.js';

const page = ts.createSourceFile('TerminalDetective.jsx', readFileSync(new URL('../src/pages/TerminalDetective.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const home = ts.createSourceFile('DetectiveHome.jsx', readFileSync(new URL('../src/components/game/DetectiveHome.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function nodes(root, predicate) {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function evaluate(node, bindings) {
  const { outputText } = ts.transpileModule(`const callback = (${node.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn callback;`, Object.keys(bindings))(...Object.values(bindings));
}
function callback(root, name, bindings) {
  const node = nodes(root, value => ts.isVariableDeclaration(value) && value.name.getText() === name)[0];
  assert.ok(node, `${name} must be a real callback`);
  return evaluate(node.initializer, bindings);
}
const makeRun = (id, caseData = ALL_CASES[0], patch = {}) => ({
  id, revision: 2, case_id: caseData.case_id, status: 'active',
  state: { run_id: id, unlocked_clues: [] }, linked_pairs: [],
  agent_strategy: { team: [{ agent_id: 'NEXUS-01' }] }, ...patch,
});
const oldRun = makeRun('old-paid-run');
const nextRun = makeRun('new-paid-run', ALL_CASES[1]);
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

// Real page callback bodies; only external transport, lazy chunks and React
// setters are substituted. Capability zero is separately covered by legacy tests.
function harness({ activeRun = oldRun, selectedCase = ALL_CASES[0], response, load, reconcile, clientFactory } = {}) {
  const state = { screen: 'SAVES', run: activeRun, selected: selectedCase, owner: 'owner-a', epoch: 0,
    busy: false, error: '', newSave: false, calls: [], reconciliations: [], loads: [], };
  const profile = { detective_name: 'NEXUS', saved_team_config: null, energy: 100 };
  const bindings = {
    ALL_CASES, multiSaveEnabled: true, selectedCase, activeRun, authoritativeRun: activeRun,
    profile, account: { id: 'owner-a' }, sessionId: 'session-a', settings: { storyMode: 'terminal' }, lang: 'en',
    supportedInvestigationVersions: [1, 2], isReadOnly: false,
    navigationRef: { current: { owner: 'owner-a' } }, caseStartRef: { current: false },
    startRef: { current: false }, newSaveIntentRef: { current: false }, teamIntentRef: { current: null },
    briefingRequestRef: { current: null }, briefedRunRef: { current: false },
    screen: state.screen, entryReturnScreenRef: { current: 'HOME' },
    setScreen: value => { state.screen = value; bindings.screen = value; },
    setRunOwner: value => { state.owner = value; },
    setRestoreEpoch: next => { state.epoch = typeof next === 'function' ? next(state.epoch) : next; },
    setAuthoritativeRun: value => { state.run = value; bindings.authoritativeRun = value; },
    setSelectedCase: value => { state.selected = value; bindings.selectedCase = value; },
    setAgentStrategy: value => { state.strategy = value; },
    setNewSaveMode: value => { state.newSave = value; },
    setSaveBusy: value => { state.busy = value; }, setSaveError: value => { state.error = value; },
    setNarrativeError() {}, setEntryNarrative() {}, setAbandonRunError() {},
    setPreferredCaseId: value => { state.preferred = value; },
    setLobbyReturnScreen: value => { state.lobbyReturn = value; }, setCaseSelectReturnScreen() {},
    setLobbyPreviewRun: value => { state.previewActiveRun = value; },
    getSelectedCoreAgentIds: () => ['NEXUS-01', 'AURORA-09', 'CIPHER-47'],
    getActiveSupportAgentId: () => null, buildTeamConfig: config => ({ team: config.core_agent_ids }),
    loadInvestigationTerminal: async () => { state.loads.push('GAME'); if (load) await load(); },
    loadCaseSelect: async () => { state.loads.push('CASE_SELECT'); }, loadAgentLobby: async () => {},
    cloudflareApi: { functions: { invoke: async () => {} } },
    publicErrorMessage: error => error.message, runRecoveryMessage: error => error.code || error.message,
    command: async (type, args) => {
      state.calls.push({ type, args });
      const result = response ? await response(type, args) : { profile, active_run: nextRun, run: nextRun };
      if (Object.hasOwn(result || {}, 'active_run')) bindings.activeRun = result.active_run;
      return result;
    },
    refresh: async () => profile, loadProfile: async () => profile,
    createPlayerRunClient: clientFactory || (config => ({ resume: async () => {
      state.reconciliations.push(config);
      return reconcile ? reconcile() : { run: activeRun };
    } })),
  };
  const call = (name, ...args) => callback(page, name, bindings)(...args);
  for (const name of ['requireConfirmed', 'resumeCloudRun', 'handleCaseSelect', 'requestCaseSelect', 'reconcileSelectedRun',
    'openCasesWithSavedTeam', 'resumeSavedRun', 'refreshSaves']) bindings[name] = (...args) => call(name, ...args);
  return { state, bindings, call, switchOwner() { bindings.account = { id: 'owner-b' }; bindings.navigationRef.current = { owner: 'owner-b' }; } };
}

test('new investigation uses the default team and explicitly creates a separate paid save despite a mounted old run', async () => {
  const app = harness();
  await app.call('openCasesWithSavedTeam');
  assert.equal(app.state.screen, 'CASE_SELECT');
  assert.equal(app.state.newSave, true);
  assert.equal(app.state.calls.length, 0, 'choosing a story does not charge');
  assert.deepEqual(app.bindings.teamIntentRef.current.specs, [{}, {}, {}]);
  assert.deepEqual(app.bindings.teamIntentRef.current.core_agent_ids, ['NEXUS-01', 'AURORA-09', 'CIPHER-47']);
  const result = await app.call('handleCaseSelect', ALL_CASES[1]);
  assert.equal(result.error, null);
  assert.deepEqual(app.state.calls, [{ type: 'start_case', args: {
    case_id: ALL_CASES[1].case_id, team_config: app.bindings.teamIntentRef.current,
    investigation_version: 2, new_save: true,
  } }]);
  assert.equal(app.state.reconciliations.length, 1, 'the old run must finish reconciling before its selected pointer changes');
  assert.strictEqual(app.state.run, nextRun);
  assert.equal(app.state.owner, 'owner-a');
  assert.equal(app.state.epoch, 1);
  assert.equal(app.state.screen, 'GAME');
  assert.equal(app.bindings.newSaveIntentRef.current, false);
});

test('new save intent also prevents silently resuming an older save of the same case', async () => {
  const freshSameCase = makeRun('same-story-new-save');
  const app = harness({ response: async () => ({ profile: {}, active_run: freshSameCase, run: freshSameCase }) });
  await app.call('openCasesWithSavedTeam');
  const result = await app.call('requestCaseSelect', ALL_CASES[0]);
  assert.equal(result.error, null);
  assert.equal(app.state.calls[0].type, 'start_case');
  assert.equal(app.state.calls[0].args.new_save, true);
  assert.strictEqual(app.state.run, freshSameCase);
  assert.notStrictEqual(app.state.run, oldRun);
});

test('resuming selects an exact save without an entry charge and uses only the current authoritative projection', async () => {
  const saved = { id: nextRun.id, case_id: nextRun.case_id, status: 'active' };
  const receiptRun = makeRun('stale-receipt');
  const app = harness({ response: async () => ({ profile: {}, active_run: nextRun, run: receiptRun }) });
  await app.call('resumeSavedRun', saved);
  assert.deepEqual(app.state.calls, [{ type: 'resume_run', args: { run_id: saved.id } }]);
  assert.strictEqual(app.state.run, nextRun);
  assert.equal(app.state.epoch, 1);
  assert.equal(app.state.screen, 'GAME');
  assert.equal(app.bindings.briefedRunRef.current, true, 'restoring must not replay the paid case arrival');
  assert.equal(app.state.busy, false);
});

test('a resume receipt whose current selection differs never mounts its old run', async () => {
  const app = harness({ response: async () => ({ profile: {}, active_run: oldRun, run: nextRun }) });
  await app.call('resumeSavedRun', { id: nextRun.id });
  assert.strictEqual(app.state.run, oldRun);
  assert.equal(app.state.epoch, 0);
  assert.equal(app.state.screen, 'SAVES');
  assert.match(app.state.error, /RUN_NOT_SELECTED/);
});

test('settled or missing save cards show a confirmed rejection instead of an uncertain pending action', async () => {
  for (const missing of [false, true]) {
    const app = harness({ response: async () => {
      if (missing) throw Object.assign(new Error('Internal database details'), { code: 'RUN_NOT_FOUND', status: 404 });
      return { profile: {}, active_run: oldRun, error: 'run_not_resumable' };
    } });
    Object.assign(app.bindings, { publicErrorMessage, runRecoveryMessage });
    await app.call('resumeSavedRun', { id: nextRun.id });
    assert.match(app.state.error, missing ? /no longer available/i : /finished/i);
    assert.doesNotMatch(app.state.error, /not yet confirmed|paused|Internal|database/i);
    assert.equal(app.state.screen, 'SAVES');
    assert.equal(app.state.epoch, 0);
    assert.equal(app.state.busy, false);
    assert.equal(app.bindings.caseStartRef.current, false);
  }
});

test('unconfirmed save selections keep the original receipt recovery guidance', async () => {
  const app = harness({ response: async () => ({ profile: {}, active_run: nextRun, pending: true }) });
  Object.assign(app.bindings, { publicErrorMessage, runRecoveryMessage });
  await app.call('resumeSavedRun', { id: nextRun.id });
  assert.match(app.state.error, /not yet confirmed/i);
  assert.equal(app.state.epoch, 0);
});

test('replayed new-start receipts cannot open a different run even when both saves use the same story', async () => {
  const current = makeRun('newer-selected-same-story');
  const app = harness({ response: async () => ({ profile: {}, active_run: current, run: oldRun }) });
  await app.call('openCasesWithSavedTeam');
  assert.equal((await app.call('handleCaseSelect', ALL_CASES[0])).error, 'selection_changed');
  assert.strictEqual(app.state.run, oldRun);
  assert.equal(app.state.screen, 'CASE_SELECT');
  assert.equal(app.state.epoch, 0);
});

test('unconfirmed and rejected starts preserve the old save and never mount their receipt', async () => {
  for (const extra of [{ pending: true }, { error: 'insufficient_energy' }]) {
    const app = harness({ response: async () => ({ profile: {}, active_run: nextRun, run: nextRun, ...extra }) });
    await app.call('openCasesWithSavedTeam');
    assert.ok((await app.call('handleCaseSelect', ALL_CASES[1])).error);
    assert.strictEqual(app.state.run, oldRun);
    assert.equal(app.state.epoch, 0);
    assert.equal(app.state.screen, 'CASE_SELECT');
    assert.equal(app.bindings.caseStartRef.current, false);
  }
});

test('duplicate resume and start requests are single flight before React can rerender', async () => {
  const response = deferred();
  const app = harness({ response: () => response.promise });
  const pending = app.call('resumeSavedRun', { id: nextRun.id });
  await app.call('resumeSavedRun', { id: 'third-save' });
  assert.deepEqual(await app.call('handleCaseSelect', ALL_CASES[1]), { error: 'active_run_exists' });
  await tick();
  assert.equal(app.state.calls.length, 1);
  response.resolve({ profile: {}, active_run: nextRun });
  await pending;
  assert.equal(app.state.epoch, 1);

  const startResponse = deferred();
  const start = harness({ response: () => startResponse.promise });
  await start.call('openCasesWithSavedTeam');
  const first = start.call('handleCaseSelect', ALL_CASES[1]);
  assert.deepEqual(await start.call('handleCaseSelect', ALL_CASES[2]), { error: 'busy' });
  await start.call('resumeSavedRun', { id: 'third-save' });
  await tick();
  assert.equal(start.state.calls.length, 1);
  startResponse.resolve({ profile: {}, active_run: nextRun, run: nextRun });
  await first;
  assert.strictEqual(start.state.run, nextRun);
});

test('account changes during lazy loading, old-run reconciliation or cloud selection cannot mount a previous owner save', async () => {
  for (const action of ['resume', 'start']) {
    for (const stage of ['lazy', 'reconcile', 'command']) {
      const pendingStage = deferred();
      const reached = deferred();
      const pause = () => { reached.resolve(); return pendingStage.promise; };
      const app = harness({
        load: stage === 'lazy' ? pause : null,
        reconcile: stage === 'reconcile' ? pause : null,
        response: stage === 'command' ? pause : null,
      });
      if (action === 'start') await app.call('openCasesWithSavedTeam');
      const pending = action === 'resume' ? app.call('resumeSavedRun', { id: nextRun.id })
        : app.call('handleCaseSelect', ALL_CASES[1]);
      await reached.promise;
      app.switchOwner();
      pendingStage.resolve({ profile: {}, active_run: nextRun, run: nextRun });
      await pending;
      assert.strictEqual(app.state.run, oldRun, `${action}/${stage}`);
      assert.equal(app.state.epoch, 0, `${action}/${stage}`);
      assert.notEqual(app.state.screen, 'GAME', `${action}/${stage}`);
      assert.equal(app.state.calls.length, stage === 'command' ? 1 : 0, `${action}/${stage}`);
    }
  }
});

test('ending a legacy investigation cannot clear a new account run or send later commands after an account switch', async () => {
  for (const stage of ['resume', 'abandon', 'settle']) {
    const reached = deferred();
    const pendingStage = deferred();
    const pause = async current => {
      if (stage === current) { reached.resolve(); await pendingStage.promise; }
    };
    const app = harness({
      clientFactory: () => ({
        resume: async () => { await pause('resume'); return { run: oldRun }; },
        command: async () => { await pause('abandon'); return { run: { ...oldRun, status: 'abandoned' } }; },
      }),
      response: async () => { await pause('settle'); return { profile: {}, active_run: null }; },
    });
    const ending = { busy: false, error: '' };
    Object.assign(app.bindings, {
      abandonRunRef: { current: false }, abandonRunBusy: false,
      setAbandonRunBusy: value => { ending.busy = value; },
      setAbandonRunError: value => { ending.error = value; },
    });
    const pending = app.call('abandonActiveRun');
    await reached.promise;
    app.switchOwner();
    app.state.run = nextRun;
    app.state.selected = ALL_CASES[1];
    ending.busy = true;
    app.bindings.abandonRunRef.current = true;
    pendingStage.resolve();
    assert.equal(await pending, false, stage);
    assert.strictEqual(app.state.run, nextRun, stage);
    assert.strictEqual(app.state.selected, ALL_CASES[1], stage);
    assert.equal(ending.busy, true, 'the old completion must not clear a new owner action');
    assert.equal(app.bindings.abandonRunRef.current, true);
    assert.equal(app.state.calls.length, stage === 'settle' ? 1 : 0, stage);
    assert.equal(ending.error, '');
  }
});

test('a real unresolved durable run receipt prevents selection changes and new case charges', async () => {
  const entries = new Map();
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key) };
  const locks = { request: async (_key, _options, work) => work({}) };
  const calls = [];
  const invoke = async (_name, body) => {
    if (body.action === 'status') return { data: { authority_version: 1, run: oldRun } };
    calls.push(body);
    throw Object.assign(new Error('offline'), { code: 'NETWORK' });
  };
  const factory = config => createPlayerRunClient({ ...config, storage, locks, invoke });
  const client = factory({ ownerUid: 'owner-a', runId: oldRun.id, sessionId: 'session-a' });
  await client.resume();
  await assert.rejects(client.command({ type: 'inspect', option_id: 'known-option' }), { code: 'NETWORK' });
  assert.equal(entries.size, 1);
  const receipt = [...entries.values()][0];
  for (const action of ['resume', 'start']) {
    const app = harness({ clientFactory: factory });
    if (action === 'start') {
      await app.call('openCasesWithSavedTeam');
      await assert.rejects(app.call('handleCaseSelect', ALL_CASES[1]), { code: 'NETWORK' });
    } else await app.call('resumeSavedRun', { id: nextRun.id });
    assert.equal(app.state.calls.length, 0, 'no resume_run or start_case may pass the unresolved receipt');
    assert.strictEqual(app.state.run, oldRun);
    assert.equal(app.state.epoch, 0);
    assert.equal([...entries.values()][0], receipt, 'the same action receipt remains available for a safe retry');
  }
  assert.equal(calls.length, 3);
  assert.ok(calls.every(body => body.operation_id === calls[0].operation_id && body.run_id === oldRun.id));
});

test('readonly, unsupported and invalid save requests do not select or charge an investigation', async () => {
  for (const patch of [{ isReadOnly: true }, { multiSaveEnabled: false }, {}]) {
    const app = harness();
    Object.assign(app.bindings, patch);
    await app.call('resumeSavedRun', Object.keys(patch).length ? { id: nextRun.id } : {});
    assert.equal(app.state.calls.length, 0);
    assert.equal(app.state.loads.length, 0);
    assert.equal(app.state.reconciliations.length, 0);
    assert.strictEqual(app.state.run, oldRun);
  }
});

test('the mounted terminal key changes for explicit restores but remains stable across Home and mode changes', () => {
  const terminal = nodes(page, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'InvestigationTerminal')[0];
  const key = terminal.attributes.properties.find(item => item.name?.getText() === 'key').initializer.expression;
  const getKey = (ownerKey, run, restoreEpoch) => evaluate(key, { ownerKey, authoritativeRun: run, restoreEpoch });
  assert.equal(getKey('owner-a', oldRun, 1), 'owner-a:old-paid-run:1');
  assert.notEqual(getKey('owner-a', oldRun, 1), getKey('owner-b', oldRun, 1));
  assert.notEqual(getKey('owner-a', oldRun, 1), getKey('owner-a', nextRun, 1));
  assert.notEqual(getKey('owner-a', oldRun, 1), getKey('owner-a', oldRun, 2));
  assert.doesNotMatch(key.getText(), /screen|settings|storyMode|lang/);
  assert.match(page.text, /selectedCase && runOwner === ownerKey && \(/, 'a previous owner terminal must not appear for even the render before cleanup effects');
});

test('new Home starts a distinct investigation while legacy services retain their single-slot resume route', () => {
  for (const capability of [false, true]) {
    const calls = [];
    callback(home, 'quickStart', { multiSaveAvailable: capability, suspendedCase: ALL_CASES[0],
      onStartInvestigation: () => calls.push('new'), onResume: () => calls.push('resume'),
      openModule: () => calls.push('case-module'),
    })();
    assert.deepEqual(calls, [capability ? 'new' : 'resume']);
  }
});

test('new Home can edit a different case loadout while an old save stays preserved; legacy services keep the slot guard', () => {
  for (const capability of [false, true]) {
    const app = harness();
    app.bindings.multiSaveEnabled = capability;
    const archiveTargets = [];
    const visitCommands = [];
    callback(home, 'enterLobby', {
      multiSaveAvailable: capability, profile: app.bindings.profile,
      suspendedCase: ALL_CASES[0], isReadOnly: false,
      setModule() {}, onResume: () => assert.fail('Planning a different case must not resume the old save'),
      onOpenCases: id => archiveTargets.push(id),
      onEnterLobby: (...args) => app.call('openLobbyForCase', ...args),
      command: async type => { visitCommands.push(type); },
      notify: () => assert.fail('The lobby visit should succeed'), publicErrorMessage: cause => cause.message, lang: 'en',
    })(ALL_CASES[1].case_id);
    assert.strictEqual(app.state.run, oldRun, 'planning never abandons or rewrites the existing paid save');
    assert.equal(app.state.calls.length, 0, 'planning does not start, settle or resume a case');
    if (capability) {
      assert.deepEqual(archiveTargets, []);
      assert.equal(app.state.screen, 'LOBBY');
      assert.equal(app.state.preferred, ALL_CASES[1].case_id);
      assert.equal(app.state.lobbyReturn, 'HOME');
      assert.equal(app.state.previewActiveRun, false, 'the new loadout is editable rather than the old investigation preview');
      assert.equal(app.bindings.newSaveIntentRef.current, true);
      assert.equal(app.state.newSave, true);
      assert.deepEqual(visitCommands, ['visit_lobby']);
    } else {
      assert.deepEqual(archiveTargets, [ALL_CASES[1].case_id]);
      assert.equal(app.state.screen, 'SAVES');
      assert.deepEqual(visitCommands, []);
    }
  }
});
