import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ALL_CASES } from '../src/game/caseData.js';
import { CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS } from '../src/game/playerProfile.js';

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}

const page = source('pages/TerminalDetective.jsx');
const home = source('components/game/DetectiveHome.jsx');
const selection = source('components/game/CaseSelect.jsx');

function find(root, predicate) {
  let found;
  const visit = node => {
    if (!found && predicate(node)) found = node;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(root);
  assert.ok(found, 'The tested callback must exist in the real component.');
  return found;
}

function evaluate(node, bindings) {
  const { outputText } = ts.transpileModule(`const callback = (${node.getText()});`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  });
  return compileFunction(`${outputText}\nreturn callback;`, Object.keys(bindings))(...Object.values(bindings));
}

function handler(root, name, bindings) {
  return evaluate(find(root, node => ts.isVariableDeclaration(node) && node.name.getText() === name).initializer, bindings);
}

const originalCase = ALL_CASES[0];
const targetCase = ALL_CASES[1];
const savedTeam = { specs: [{ intuition: 4 }, {}, {}], primary_agent_index: 0, command_plan: { doctrine_id: 'balanced' } };

function makeRun(caseData = originalCase, overrides = {}) {
  return { id: `paid-${caseData.case_id}`, case_id: caseData.case_id, status: 'active', team_config: { team: [{ agent_id: 'NEXUS-01' }] }, ...overrides };
}

// Execute the real callbacks with state setters and a cloud slot, so a missing
// settlement actually prevents the next start instead of returning a free run.
function appHarness({ activeRun = makeRun(), selectedCase = originalCase, saved = savedTeam, mode = 'terminal', response, resume, abandon, readOnly = false } = {}) {
  const state = {
    screen: 'HOME', selected: selectedCase, run: activeRun, activeRun, cloudRun: activeRun,
    preferred: null, strategy: activeRun?.team_config || null, calls: [], busy: false,
    error: '', narrative: null, factories: [], loads: [],
  };
  const bindings = {
    supportedInvestigationVersions: [1],
    ALL_CASES, selectedCase, activeRun, authoritativeRun: activeRun,
    profile: { energy: 120, saved_team_config: saved }, settings: { storyMode: mode }, lang: 'zh',
    screen: 'HOME', preferredCaseId: null, lobbyReturnScreen: 'HOME', abandonRunBusy: false,
    isReadOnly: readOnly, account: { id: 'owner-one' }, sessionId: 'session-one',
    teamIntentRef: { current: saved }, caseStartRef: { current: false }, abandonRunRef: { current: false },
    briefingRequestRef: { current: null }, briefedRunRef: { current: true }, entryReturnScreenRef: { current: 'HOME' },
    cloudflareApi: { functions: { invoke: () => {} } }, publicErrorMessage: cause => cause.message,
    setScreen: value => { state.screen = value; bindings.screen = value; },
    setSelectedCase: value => { state.selected = value; bindings.selectedCase = value; },
    setAuthoritativeRun: value => { state.run = value; bindings.authoritativeRun = value; },
    setAgentStrategy: value => { state.strategy = value; },
    setPreferredCaseId: value => { state.preferred = value; bindings.preferredCaseId = value; },
    setAbandonRunBusy: value => { state.busy = value; bindings.abandonRunBusy = value; },
    setAbandonRunError: value => { state.error = value; },
    setLobbyReturnScreen: () => {}, setCaseSelectReturnScreen: () => {}, setLobbyPreviewRun: () => {},
    setEntryNarrative: value => { state.narrative = value; }, setNarrativeError: () => {},
    getSelectedCoreAgentIds: () => ['NEXUS-01'], getActiveSupportAgentId: () => null,
    buildTeamConfig: config => ({ team: config.core_agent_ids }),
    loadInvestigationTerminal: async () => { state.loads.push('GAME'); },
    loadCaseSelect: async () => { state.loads.push('CASE_SELECT'); },
    loadAgentLobby: async () => { state.loads.push('LOBBY'); },
    refresh: async () => { state.calls.push({ type: 'refresh' }); },
    command: async (type, args) => {
      state.calls.push({ type, args });
      let result;
      if (response) result = await response(type, args, state);
      else if (type === 'settle_case') {
        assert.equal(args.run_id, state.cloudRun.id);
        assert.equal(state.cloudRun.status, 'abandoned', 'The paid slot cannot release an ongoing investigation.');
        state.cloudRun = null;
        result = { profile: {}, active_run: null };
      } else if (type === 'start_case') {
        if (state.cloudRun) result = { profile: {}, error: 'active_run_exists', active_run: state.cloudRun };
        else {
          state.cloudRun = makeRun(ALL_CASES.find(c => c.case_id === args.case_id));
          result = { profile: {}, active_run: state.cloudRun };
        }
      } else assert.fail(`Unexpected profile command: ${type}`);
      if (Object.hasOwn(result || {}, 'active_run')) {
        state.activeRun = result.active_run;
        bindings.activeRun = result.active_run;
      }
      return result;
    },
    createPlayerRunClient: config => {
      state.factories.push(config);
      return {
        resume: async () => {
          state.calls.push({ type: 'resume', runId: config.runId });
          return resume ? resume(state) : { run: state.cloudRun };
        },
        command: async action => {
          state.calls.push({ type: action.type, runId: config.runId });
          if (abandon) return abandon(state);
          state.cloudRun = { ...state.cloudRun, status: 'abandoned' };
          return { run: state.cloudRun };
        },
      };
    },
  };
  const call = (name, ...args) => handler(page, name, bindings)(...args);
  for (const name of ['requireConfirmed', 'resumeCloudRun', 'handleCaseSelect', 'requestCaseSelect', 'openCasesWithSavedTeam', 'openLobbyForCase']) {
    bindings[name] = (...args) => call(name, ...args);
  }
  return { state, bindings, call };
}

function selectionHarness(app) {
  const state = { blocked: Boolean(app.state.activeRun), selected: app.state.preferred, starting: null, error: '' };
  const bindings = {
    supportedInvestigationVersions: [1],
    startingRef: { current: false }, readOnly: false, runBlocked: state.blocked, lang: 'zh',
    preferredCaseId: app.state.preferred, profile: app.bindings.profile, CASE_ENERGY_COST, abandonBusy: false,
    setStartingId: value => { state.starting = value; }, setSelected: value => { state.selected = value; },
    setError: value => { state.error = value; },
    setRunBlocked: value => { state.blocked = value; bindings.runBlocked = value; },
    onSelect: caseData => app.call('requestCaseSelect', caseData), onAbandonRun: () => app.call('abandonActiveRun'),
  };
  return { state, call: (name, ...args) => handler(selection, name, bindings)(...args) };
}

test('Home case navigation honors a different selected story even with a suspended Neon case', async () => {
  const app = appHarness();
  let resumes = 0;
  let module = 'cases';
  const open = handler(home, 'openCase', {
    suspendedCase: originalCase, setModule: value => { module = value; },
    onResume: () => { resumes++; }, onOpenCases: caseId => app.call('openCasesWithSavedTeam', caseId),
  });
  await open(targetCase.case_id);
  assert.equal(module, null);
  assert.equal(resumes, 0);
  assert.equal(app.state.screen, 'CASE_SELECT');
  assert.equal(app.state.preferred, targetCase.case_id);
  assert.strictEqual(app.state.selected, originalCase);
  assert.equal(app.state.calls.length, 0, 'Browsing must neither abandon the old case nor charge for a new one.');
});

test('all ordinary case archive routes remain on selection while preserving the active investigation', async () => {
  for (const saved of [savedTeam, null]) {
    for (const selectedCase of [originalCase, null]) {
      for (const name of ['openCasesWithSavedTeam', 'openCaseSelection', 'openLobbyForCase']) {
        const app = appHarness({ saved, selectedCase });
        await app.call(name, targetCase.case_id);
        assert.equal(app.state.screen, 'CASE_SELECT', `${name}, saved=${Boolean(saved)}, local=${Boolean(selectedCase)}`);
        assert.strictEqual(app.state.activeRun.case_id, originalCase.case_id);
        assert.equal(app.state.calls.length, 0);
        if (name !== 'openCaseSelection') assert.equal(app.state.preferred, targetCase.case_id);
      }
    }
  }
});

test('same-case entry resumes but a different case never silently opens the old investigation', async () => {
  for (const selectedCase of [originalCase, null]) {
    for (const name of ['handleCaseSelect', 'requestCaseSelect']) {
      const same = appHarness({ selectedCase });
      await same.call(name, originalCase);
      assert.equal(same.state.screen, 'GAME');
      assert.equal(same.state.selected.case_id, originalCase.case_id);
      assert.equal(same.state.calls.length, 0);
      const different = appHarness({ selectedCase });
      different.state.screen = different.bindings.screen = 'CASE_SELECT';
      const result = await different.call(name, targetCase);
      assert.equal(result.error, 'active_run_exists');
      assert.equal(different.state.screen, 'CASE_SELECT');
      assert.equal(different.state.calls.length, 0);
      assert.equal(different.state.narrative, null);
    }
  }
});

test('choosing another story requires abandon and confirmed settlement before entering the requested story', async () => {
  const app = appHarness();
  await app.call('openCasesWithSavedTeam', targetCase.case_id);
  const archive = selectionHarness(app);
  await archive.call('handleStart', targetCase);
  assert.equal(app.state.calls.length, 0);
  assert.equal(archive.state.blocked, true);
  await archive.call('handleAbandon');
  assert.deepEqual(app.state.calls.map(c => c.type), ['resume', 'abandon', 'settle_case']);
  assert.deepEqual(app.state.calls[2].args, { run_id: makeRun().id });
  assert.equal(app.state.selected, null);
  assert.equal(app.state.run, null);
  assert.equal(app.state.activeRun, null);
  assert.equal(app.state.preferred, targetCase.case_id, 'Keep the requested case after releasing the old paid slot.');
  assert.equal(archive.state.blocked, false);
  await archive.call('handleStart', targetCase);
  assert.equal(app.state.screen, 'GAME');
  assert.strictEqual(app.state.selected, targetCase);
  assert.equal(app.state.run.case_id, targetCase.case_id);
  assert.deepEqual(app.state.calls.map(c => c.type), ['resume', 'abandon', 'settle_case', 'start_case']);
  assert.equal(app.state.calls[3].args.case_id, targetCase.case_id);
});

test('failed or unconfirmed settlement keeps the old run and the new story blocked', async () => {
  const failureResults = [
    { error: 'offline' }, { profile: {}, error: 'settlement_rejected' },
    { profile: {}, pending: true }, { profile: {} }, { profile: {}, active_run: makeRun() },
  ];
  for (const settlement of failureResults) {
    const originalRun = makeRun();
    const app = appHarness({ activeRun: originalRun, response: async () => settlement });
    await app.call('openCasesWithSavedTeam', targetCase.case_id);
    const archive = selectionHarness(app);
    await archive.call('handleAbandon');
    assert.equal(archive.state.blocked, true);
    assert.strictEqual(app.state.selected, originalCase);
    assert.strictEqual(app.state.run, originalRun);
    assert.equal(app.state.preferred, targetCase.case_id);
    assert.equal(app.state.busy, false);
    assert.equal(app.bindings.abandonRunRef.current, false);
    assert.ok(app.state.error);
    await archive.call('handleStart', targetCase);
    assert.equal(app.state.calls.filter(c => c.type === 'start_case').length, 0);
    assert.equal(app.state.screen, 'CASE_SELECT');
  }
});

test('resume and abandon failures preserve local investigation state without attempting settlement', async () => {
  for (const options of [
    { resume: async () => { throw new Error('offline'); } },
    { abandon: async () => ({ run: makeRun() }) },
    { readOnly: true },
  ]) {
    const app = appHarness(options);
    await app.call('openCasesWithSavedTeam', targetCase.case_id);
    assert.equal(await app.call('abandonActiveRun'), false);
    assert.strictEqual(app.state.selected, originalCase);
    assert.equal(app.state.run.case_id, originalCase.case_id);
    assert.equal(app.state.preferred, targetCase.case_id);
    assert.equal(app.state.calls.some(c => c.type === 'settle_case'), false);
    assert.equal(app.state.busy, false);
    assert.ok(app.state.error);
  }
});

test('recovered abandoned run settles without issuing a second abandon command', async () => {
  const app = appHarness({ activeRun: makeRun(originalCase, { status: 'abandoned' }) });
  assert.equal(await app.call('abandonActiveRun'), true);
  assert.deepEqual(app.state.calls.map(c => c.type), ['resume', 'settle_case']);
  assert.equal(app.state.activeRun, null);
});

test('ending the active run is single flight even before React has rendered the busy state', async () => {
  let release;
  const resumed = new Promise(resolve => { release = resolve; });
  const app = appHarness({ resume: () => resumed });
  const end = handler(page, 'abandonActiveRun', app.bindings);
  const first = end();
  assert.equal(await end(), false, 'A second call on the same render closure must be blocked by the ref.');
  assert.equal(app.state.factories.length, 1);
  assert.equal((await app.call('requestCaseSelect', targetCase)).error, 'active_run_exists');
  release({ run: makeRun() });
  assert.equal(await first, true);
  assert.deepEqual(app.state.calls.map(c => c.type), ['resume', 'abandon', 'settle_case']);
  assert.equal(app.bindings.abandonRunRef.current, false);
});

test('a cloud start race may recover the requested case but cannot route a different case', async () => {
  for (const cloudCase of [originalCase, targetCase]) {
    const app = appHarness({ activeRun: null, selectedCase: null, response: async () => ({
      profile: {}, error: 'active_run_exists', active_run: makeRun(cloudCase),
    }) });
    await app.call('openCasesWithSavedTeam', targetCase.case_id);
    const result = await app.call('handleCaseSelect', targetCase);
    assert.equal(app.state.calls.length, 1);
    if (cloudCase === targetCase) {
      assert.equal(result.error, null);
      assert.equal(app.state.screen, 'GAME');
      assert.strictEqual(app.state.selected, targetCase);
    } else {
      assert.equal(result.error, 'active_run_exists');
      assert.equal(app.state.screen, 'CASE_SELECT');
      assert.equal(app.state.selected, null);
      assert.equal(app.state.run, null);
    }
  }
});

test('a late cloud conflict keeps the requested story selected and blocks another start in the archive', async () => {
  const app = appHarness({ activeRun: null, selectedCase: null, response: async () => ({
    profile: {}, error: 'active_run_exists', active_run: makeRun(),
  }) });
  await app.call('openCasesWithSavedTeam', targetCase.case_id);
  const archive = selectionHarness(app);
  await archive.call('handleStart', targetCase);
  assert.equal(archive.state.blocked, true);
  assert.equal(archive.state.selected, targetCase.case_id);
  assert.equal(archive.state.starting, null);
  assert.ok(archive.state.error);
  assert.equal(app.state.screen, 'CASE_SELECT');
  await archive.call('handleStart', targetCase);
  assert.equal(app.state.calls.filter(c => c.type === 'start_case').length, 1);
});

test('concurrent story starts never charge or mount the second selected story', async () => {
  let release;
  const reply = new Promise(resolve => { release = resolve; });
  const app = appHarness({ activeRun: null, selectedCase: null, response: () => reply });
  const first = app.call('handleCaseSelect', targetCase);
  assert.deepEqual(await app.call('handleCaseSelect', ALL_CASES[2]), { error: 'busy' });
  release({ profile: {}, active_run: makeRun(targetCase) });
  await first;
  assert.equal(app.state.calls.length, 1);
  assert.equal(app.state.run.case_id, targetCase.case_id);
  assert.strictEqual(app.state.selected, targetCase);
});

test('case archive guard names both the saved investigation and the requested new story in both languages', () => {
  const component = find(selection, node => ts.isFunctionDeclaration(node) && node.name?.getText() === 'CaseSelect');
  const body = `function CaseSelect${component.getText().slice(component.getText().indexOf('('))}`;
  const { outputText } = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } });
  for (const lang of ['zh', 'en']) {
    const bindings = {
    supportedInvestigationVersions: [1],
      React, ALL_CASES, CASE_ENERGY_COST, CASE_GOLD_REWARD, FIRST_CLEAR_DIAMONDS,
      useLang: () => ({ lang, t: new Proxy({}, { get: (_, key) => String(key) }) }),
      useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {},
      Icon: () => null, IconText: ({ text }) => React.createElement('span', null, text), noirColor: value => value,
      DIFFICULTY_CONFIG: { NORMAL: { label: 'NORMAL', color: '#8aaa91', bg: '#8aaa91', stars: 1 } }, CASE_COVER_ICONS: [],
    };
    const render = compileFunction(`${outputText}\nreturn CaseSelect;`, Object.keys(bindings))(...Object.values(bindings));
    const html = renderToStaticMarkup(render({
      activeRun: makeRun(), preferredCaseId: targetCase.case_id, profile: { energy: 120 },
    }));
    const guard = html.match(/<section class="td-case-run-guard"[\s\S]*?<\/section>/)?.[0];
    assert.ok(guard);
    const title = caseData => lang === 'en' ? (caseData.en?.title || caseData.subtitle || caseData.title) : caseData.title;
    assert.ok(guard.includes(title(originalCase)), 'The guard should identify the investigation being ended.');
    assert.ok(guard.includes(title(targetCase)), 'The guard should preserve and identify the requested new story.');
  }
});
