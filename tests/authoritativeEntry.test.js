import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { ALL_CASES } from '../src/game/caseData.js';
import { profileCommand, appendProfileCommand, readProfileCommands } from '../src/game/profileCommands.js';
import { handleProfileFunction } from '../cloudflare/worker/profile.js';
import { authorityDB, request, session } from './cloudflareAuthorityDB.js';

const source = ts.createSourceFile('TerminalDetective.jsx', readFileSync(new URL('../src/pages/TerminalDetective.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const handlers = new Map();
function collect(node) {
  if (ts.isVariableDeclaration(node) && node.initializer && ts.isArrowFunction(node.initializer)) handlers.set(node.name.getText(), node.initializer.getText());
  ts.forEachChild(node, collect);
}
collect(source);

const rawConfig = { specs: [{ intuition: 4 }, {}, {}], primary_agent_index: 0, command_plan: { doctrine_id: 'balanced' } };
const serverRun = { id: 'paid-run-001', case_id: ALL_CASES[0].case_id, team_config: { team: [{ agent_id: 'NEXUS-01' }], effects: { server: true } }, state: {} };

function harness({ activeRun = null, selectedCase = null, response, saved = rawConfig } = {}) {
  const state = { screen: 'HOME', run: null, strategy: null, selected: null, calls: [], narrative: null };
  const bindings = {
    multiSaveEnabled: false, newSaveIntentRef: { current: false }, navigationRef: { current: {} },
    isReadOnly: false, account: { id: 'entry-owner' },
    setRunOwner() {}, setRestoreEpoch() {}, setNewSaveMode() {},
    supportedInvestigationVersions: [1],
    ALL_CASES, selectedCase, activeRun, profile: { saved_team_config: saved }, settings: { storyMode: 'theater' }, lang: 'en',
    teamIntentRef: { current: null }, caseStartRef: { current: false }, briefingRequestRef: { current: null }, briefedRunRef: { current: false }, preferredCaseId: null, lobbyReturnScreen: 'HOME',
    setScreen: value => { state.screen = value; }, setAuthoritativeRun: value => { state.run = value; },
    setAgentStrategy: value => { state.strategy = value; }, setSelectedCase: value => { state.selected = value; },
    setEntryNarrative: value => { state.narrative = value; }, setNarrativeError: () => {}, setPreferredCaseId: () => {}, setLobbyReturnScreen: () => {}, setCaseSelectReturnScreen: () => {},
    loadInvestigationTerminal: async () => {}, loadCaseSelect: async () => {}, loadAgentLobby: async () => {},
    command: async (type, args) => { state.calls.push({ type, args }); return response ? response(type, args) : { profile: {}, active_run: serverRun, run: serverRun }; },
  };
  const bind = name => compileFunction(`return (${handlers.get(name)});`, Object.keys(bindings))(...Object.values(bindings));
  for (const name of ['requireConfirmed', 'resumeCloudRun', 'handleCaseSelect', 'requestCaseSelect', 'openLobbyForCase', 'openCasesWithSavedTeam']) bindings[name] = (...args) => bind(name)(...args);
  return { state, bindings, call: (name, ...args) => bind(name)(...args) };
}

test('paid entry sends only raw case/team intent and adopts server strategy without adding client effects', async () => {
  const app = harness();
  app.bindings.teamIntentRef.current = rawConfig;
  await app.call('handleCaseSelect', ALL_CASES[0]);
  assert.deepEqual(app.state.calls, [{ type: 'start_case', args: { case_id: ALL_CASES[0].case_id, team_config: rawConfig } }]);
  assert.strictEqual(app.state.strategy, serverRun.team_config);
  assert.strictEqual(app.state.run, serverRun);
  assert.equal(app.state.screen, 'GAME');
  const defaults = harness({ saved: null });
  await defaults.call('handleCaseSelect', ALL_CASES[0]);
  assert.deepEqual(defaults.state.calls[0].args, { case_id: ALL_CASES[0].case_id });
});

test('paid entry carries the negotiated version through the real journal and authoritative endpoint', async () => {
  for (const supported of [[1], [1, 2]]) {
    const values = new Map();
    const store = { get length() { return values.size; }, key: index => [...values.keys()][index],
      getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
    const DB = authorityDB({ energy: 120, gold: 1000 });
    const app = harness({ saved: { specs: [{}, {}, {}], primary_agent_index: 0,
      command_plan: { doctrine_id: 'balanced' } }, response: async (type, args) => {
      const command = profileCommand(type, args);
      appendProfileCommand({ ownerUid: session.user_id, lineageId: 'web-entry-audit-123456',
        operationId: 'entry-audit-operation-123456', baseRevision: 0, command }, store);
      const [saved] = readProfileCommands(session.user_id, store);
      const response = await handleProfileFunction(request({ action: 'command',
        operation_id: saved.operationId, expected_revision: saved.baseRevision, command: saved.command }), { DB }, session);
      const payload = await response.json();
      assert.equal(response.status, 200, JSON.stringify(payload));
      return { ...payload.result, profile: payload.profile, active_run: payload.active_run };
    } });
    app.bindings.supportedInvestigationVersions = supported;
    await app.call('handleCaseSelect', ALL_CASES[0]);
    const version = supported.includes(2) ? 2 : 1;
    assert.equal(app.state.run.investigation_version ?? 1, version);
    assert.equal(app.state.run.case_id, ALL_CASES[0].case_id);
    assert.equal(app.state.screen, 'GAME');
    assert.equal(DB.count('player_runs'), 1);
    DB.sqlite.close();
  }
});

test('explicit resume and same-case entry retain a paid cloud run without charging or replaying narrative', async () => {
  for (const name of ['handleCaseSelect', 'requestCaseSelect', 'handleHomeStartInvestigation', 'handleResume', 'openLobbyForCase', 'handleDeploy']) {
    const app = harness({ activeRun: serverRun });
    await app.call(name, name === 'openLobbyForCase' ? serverRun.case_id : ALL_CASES[0], rawConfig);
    assert.strictEqual(app.state.run, serverRun, name);
    assert.equal(app.state.screen, 'GAME', name);
    assert.equal(app.state.calls.length, 0, name);
    assert.equal(app.state.narrative, null, name);
  }
});

test('cloud confirmation recovered after a lost start reply is resumable, including active_run_exists', async () => {
  const app = harness({ response: async () => { throw Object.assign(new Error('pending'), { code: 'PROFILE_COMMAND_PENDING' }); } });
  await assert.rejects(app.call('handleCaseSelect', ALL_CASES[0]), { code: 'PROFILE_COMMAND_PENDING' });
  assert.equal(app.state.run, null);
  assert.equal(app.bindings.caseStartRef.current, false);
  app.bindings.activeRun = serverRun;
  await app.call('handleHomeStartInvestigation');
  assert.strictEqual(app.state.run, serverRun);
  assert.equal(app.state.calls.length, 1);
  const race = harness({ response: async () => ({ profile: {}, error: 'active_run_exists', active_run: serverRun, run: serverRun }) });
  assert.equal((await race.call('handleCaseSelect', ALL_CASES[0])).error, null);
  assert.strictEqual(race.state.run, serverRun);
});

test('start replay only enters a current run for the requested case and never resurrects its old receipt', async () => {
  for (const active_run of [null, { ...serverRun, id: 'newer-paid-run' }, { ...serverRun, id: 'other-paid-run', case_id: ALL_CASES[1].case_id }]) {
    const app = harness({ response: async () => ({ profile: {}, active_run, run: serverRun, result: { run: serverRun } }) });
    const result = await app.call('handleCaseSelect', ALL_CASES[0]);
    const matches = active_run?.case_id === ALL_CASES[0].case_id;
    assert.strictEqual(app.state.run, matches ? active_run : null);
    assert.equal(app.state.screen, matches ? 'GAME' : 'HOME');
    assert.equal(result.error, matches ? null : active_run ? 'active_run_exists' : 'cloud_run_unavailable');
    assert.equal(app.state.calls.length, 1);
  }
});

test('concurrent starts share the guarded entry, while rejected starts never mount a free run', async () => {
  let complete;
  const app = harness({ response: () => new Promise(resolve => { complete = resolve; }) });
  const first = app.call('handleCaseSelect', ALL_CASES[0]);
  assert.deepEqual(await app.call('handleCaseSelect', ALL_CASES[0]), { error: 'busy' });
  complete({ error: 'insufficient_energy', cost: 10, profile: {} });
  assert.equal((await first).error, 'insufficient_energy');
  assert.equal(app.state.run, null);
  assert.equal(app.state.calls.length, 1);
});

test('team/skill saves treat business rejection and pending metadata as failures rather than saved', async () => {
  for (const name of ['handleTeamSave', 'handleSkillLoadout']) {
    for (const result of [{}, { profile: {}, error: 'invalid_team' }, { profile: {}, pending: true }]) {
      const app = harness({ response: async () => result });
      await assert.rejects(app.call(name, rawConfig), { code: 'PROFILE_ACTION_REJECTED' });
    }
    const confirmed = { profile: { skill_loadout: [] } };
    const app = harness({ response: async () => confirmed });
    assert.strictEqual(await app.call(name, rawConfig), confirmed);
  }
});

test('deployment retains raw team config separately from rendered strategy', async () => {
  const app = harness();
  const presentation = { team: [], effects: { local: true } };
  await app.call('handleDeploy', presentation, rawConfig);
  assert.strictEqual(app.bindings.teamIntentRef.current, rawConfig);
  assert.equal(app.state.screen, 'CASE_SELECT');
  assert.equal(app.state.calls.length, 0);
});
