import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { normalizeStoryMode, STORY_MODES } from '../src/game/storyMode.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/lib/settingsData.js';

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}

const settings = source('../src/lib/settings.jsx');
const page = source('../src/pages/TerminalDetective.jsx');
const home = source('../src/components/game/DetectiveHome.jsx');
const chooser = source('../src/components/game/theater/StoryModeChooser.jsx');
const control = source('../src/components/game/theater/StoryModeControl.jsx');
const drawer = source('../src/components/game/settings/SettingsDrawer.jsx');

function findNodes(root, predicate) {
  const nodes = [];
  const visit = node => {
    if (predicate(node)) nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return nodes;
}

function variable(root, name) {
  const declaration = findNodes(root, node => ts.isVariableDeclaration(node) && node.name.getText() === name)[0];
  assert.ok(declaration, `Missing ${name}`);
  return declaration.initializer;
}

function bind(node, bindings = {}) {
  return compileFunction(`return (${node.getText()});`, Object.keys(bindings))(...Object.values(bindings));
}

function handler(root, name, bindings = {}) {
  return bind(variable(root, name), bindings);
}

const readStoredNode = findNodes(settings, node => ts.isFunctionDeclaration(node) && node.name?.text === 'readStored')[0];

function readStored(raw, throws = false) {
  return bind(readStoredNode, {
    KEY: 'td_settings_v1', DEFAULT_SETTINGS, normalizeSettings,
    localStorage: { getItem(key) { assert.equal(key, 'td_settings_v1'); if (throws) throw new Error('unavailable'); return raw; } },
  })();
}

test('story mode validates exact values and defaults legacy or corrupt preferences to terminal', () => {
  assert.deepEqual(STORY_MODES, ['theater', 'terminal']);
  assert.equal(DEFAULT_SETTINGS.storyMode, 'terminal');
  for (const mode of STORY_MODES) assert.equal(normalizeStoryMode(mode), mode);
  for (const value of [undefined, null, '', '3d', 'THEATER', ' theater ', true, 0, [], {}, ['theater']]) {
    assert.equal(normalizeStoryMode(value), 'terminal');
    assert.equal(readStored(JSON.stringify({ storyMode: value })).storyMode, 'terminal');
  }
  for (const raw of [null, '', '{', 'null', '[]', 'false', '3', '"theater"']) {
    assert.deepEqual(readStored(raw), DEFAULT_SETTINGS);
  }
  assert.deepEqual(readStored(null, true), DEFAULT_SETTINGS);
  assert.equal(readStored('{"sfxEnabled":false}').storyMode, 'terminal');
  assert.equal(readStored('{"sfxEnabled":false}').sfxEnabled, false);
  assert.equal(readStored('{"storyMode":"theater"}').storyMode, 'theater');
});

test('setting updates, including imports, validate story mode and persist without touching cinematic preferences', () => {
  let current = { ...DEFAULT_SETTINGS, cinematicQuality: 'low', cinematicsEnabled: false };
  const setSetting = bind(variable(settings, 'setSetting').arguments[0], {
    DEFAULT_SETTINGS, normalizeSettings, setSettings: reducer => { current = reducer(current); },
  });
  const persistence = findNodes(settings, node => ts.isCallExpression(node) && node.expression.getText() === 'useEffect'
    && node.arguments[0]?.getText().includes('localStorage.setItem'))[0];
  const persist = () => bind(persistence.arguments[0], {
    KEY: 'td_settings_v1', settings: current,
    localStorage: { setItem(key, data) { assert.equal(key, 'td_settings_v1'); current = readStored(data); } },
  })();
  setSetting('storyMode', 'theater');
  persist();
  assert.equal(current.storyMode, 'theater');
  assert.equal(current.cinematicsEnabled, false);
  assert.equal(current.cinematicQuality, 'low');
  setSetting('storyMode', 'invalid-import');
  persist();
  assert.equal(current.storyMode, 'terminal');
  assert.match(settings.text, /updateSetting: setSetting/);
  assert.doesNotMatch(settings.text, /useProfile|mutate\(|startCase\(|settle\(/);
});

function entryBindings() {
  const changes = [];
  const state = { screen: 'LANDING', busy: false, error: '', open: false };
  const bindings = {
    profile: null, startRef: { current: false }, entryRequestRef: { current: 0 },
    normalizeStoryMode, lang: 'en',
    updateSetting: (key, value) => changes.push([key, value]),
    setStartError: error => { state.error = error; },
    setStartBusy: busy => { state.busy = busy; },
    setShowModeChooser: open => { state.open = open; },
    setScreen: screen => { state.screen = screen; },
    loadDetectiveHome: () => {}, loadAgentLobby: () => {}, loadCaseSelect: () => {},
    publicErrorMessage: error => error.message,
  };
  return { bindings, state, changes };
}

test('landing start opens the chooser without profile loading or a preference write', () => {
  const { bindings, state, changes } = entryBindings();
  handler(page, 'handleStart', bindings)();
  assert.equal(state.open, true);
  assert.equal(state.screen, 'LANDING');
  assert.deepEqual(changes, []);
  assert.doesNotMatch(variable(page, 'handleStart').getText(), /loadProfile|mutate|updateSetting|setScreen/);
});

test('confirmation saves only a local mode before loading a profile and routes named and new detectives correctly', async () => {
  for (const detective_name of ['', 'NEXUS']) {
    const { bindings, state, changes } = entryBindings();
    let calls = 0;
    bindings.loadProfile = async () => {
      calls += 1;
      assert.deepEqual(changes, [['storyMode', 'theater']]);
      assert.equal(state.screen, 'LANDING');
      return { detective_name };
    };
    const confirm = handler(page, 'handleConfirmMode', bindings);
    await Promise.all([confirm('theater'), confirm('terminal')]);
    assert.equal(calls, 1);
    assert.equal(state.screen, detective_name ? 'HOME' : 'REGISTRATION');
    assert.equal(state.busy, false);
    assert.equal(state.open, false);
  }
});

test('cancel invalidates an outstanding entry request and cannot let an old failure override a reopened chooser', async () => {
  const { bindings, state } = entryBindings();
  let rejectFirst;
  let resolveSecond;
  let calls = 0;
  bindings.loadProfile = () => ++calls === 1
    ? new Promise((_resolve, reject) => { rejectFirst = reject; })
    : new Promise(resolve => { resolveSecond = resolve; });
  const confirm = handler(page, 'handleConfirmMode', bindings);
  const cancel = handler(page, 'handleCancelMode', bindings);
  const start = handler(page, 'handleStart', bindings);
  start();
  const first = confirm('theater');
  cancel();
  assert.equal(state.busy, false);
  assert.equal(state.screen, 'LANDING');
  assert.equal(state.open, false);
  start();
  const second = confirm('terminal');
  rejectFirst(new Error('stale offline response'));
  await first;
  assert.equal(state.busy, true);
  assert.equal(state.open, true);
  assert.equal(state.error, '');
  resolveSecond({ detective_name: 'NEXUS' });
  await second;
  assert.equal(state.screen, 'HOME');
});

test('cancel prevents a late successful profile response from navigating away from landing', async () => {
  const { bindings, state } = entryBindings();
  let resolveProfile;
  bindings.loadProfile = () => new Promise(resolve => { resolveProfile = resolve; });
  const pending = handler(page, 'handleConfirmMode', bindings)('theater');
  handler(page, 'handleCancelMode', bindings)();
  resolveProfile({ detective_name: 'NEXUS' });
  await pending;
  assert.equal(state.screen, 'LANDING');
  assert.equal(state.open, false);
});

test('failed confirmation retains the chooser with feedback and permits retry', async () => {
  const { bindings, state } = entryBindings();
  let calls = 0;
  bindings.loadProfile = async () => { if (++calls === 1) throw new Error('Offline'); return { detective_name: '' }; };
  handler(page, 'handleStart', bindings)();
  const confirm = handler(page, 'handleConfirmMode', bindings);
  await confirm('theater');
  assert.equal(state.open, true);
  assert.equal(state.screen, 'LANDING');
  assert.equal(state.error, 'Offline');
  assert.equal(state.busy, false);
  await confirm('theater');
  assert.equal(state.screen, 'REGISTRATION');
});

test('the bilingual chooser uses a native modal, named radio fields, confirmation, live feedback and cancel', () => {
  assert.match(chooser.text, /<dialog[\s\S]*aria-modal="true"/);
  assert.match(chooser.text, /aria-labelledby=\{titleId\} aria-describedby=\{descriptionId\}/);
  assert.match(chooser.text, /dialog\?\.showModal\(\)/);
  assert.match(chooser.text, /dialog\?\.close\(\)/);
  assert.match(chooser.text, /previousFocus\.focus\(\)/);
  assert.match(chooser.text, /onCancel=\{event => \{ event\.preventDefault\(\); onCancel\(\); \}\}/);
  assert.match(chooser.text, /if \(!busy\) onConfirm\(choice\)/);
  assert.match(chooser.text, /取消 \/ 返回/);
  assert.match(chooser.text, /Cancel \/ Back/);
  assert.match(chooser.text, /role="alert"/);
  assert.match(chooser.text, /role="status" aria-live="polite"/);
  assert.match(control.text, /<fieldset[\s\S]*<legend/);
  assert.match(control.text, /type="radio" name=\{name\} value=\{mode\} checked=\{selected === mode\}/);
  for (const label of ['3D侦探剧情模式', '终端文字剧情模式', '3D Detective Story', 'Terminal Text Story']) {
    assert.ok(control.text.includes(label));
  }
  assert.match(home.text, /<StoryModeControl value=\{settings.storyMode\} onChange=\{value => updateSetting\('storyMode', value\)\}/);
  assert.match(drawer.text, /<StoryModeControl value=\{settings.storyMode\} onChange=\{value => change\('storyMode', value\)\}/);
  assert.match(drawer.text, /change\('cinematicsEnabled', v\)/);
});

test('settings reserve run-toolbar safe-area space and long mode labels reflow on narrow screens', () => {
  assert.match(drawer.text, /calc\(76px \+ env\(safe-area-inset-top, 0px\)\)/);
  assert.match(drawer.text, /justifyContent: 'space-between', flexShrink: 0/);
  assert.match(control.text, /repeat\(auto-fit, minmax\(min\(100%, 140px\), 1fr\)\)/);
  assert.match(control.text, /minWidth: 0, display: 'flex'/);
  assert.match(control.text, /overflowWrap: 'anywhere'/);
});

test('HOME and mode switching never key, replace, or conditionally unmount the active terminal', () => {
  const terminals = findNodes(page, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText() === 'InvestigationTerminal');
  assert.equal(terminals.length, 1);
  const terminal = terminals[0];
  assert.match(terminal.getText(), /presentationActive=\{screen === 'GAME'\}/);
  assert.match(terminal.getText(), /onOpenHome=\{handleOpenHome\}/);
  assert.match(terminal.getText(), /onGameEnd=\{\(\) => leaveRun\('HOME'\)\}/);
  assert.match(terminal.getText(), /onBackToLobby=\{\(\) => leaveRun\('LOBBY'\)\}/);
  let hasHiddenWrapper = false;
  let hasSelectedCaseGuard = false;
  for (let node = terminal; node && !ts.isFunctionDeclaration(node); node = node.parent) {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node;
      assert.equal(opening.attributes.properties.some(attribute => attribute.name?.getText() === 'key'), false);
      if (opening.getText().includes("hidden={screen !== 'GAME'}")) hasHiddenWrapper = true;
    }
    assert.equal(ts.isIfStatement(node), false);
    assert.equal(ts.isConditionalExpression(node), false);
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      assert.equal(node.left.getText(), 'selectedCase');
      hasSelectedCaseGuard = true;
    }
  }
  assert.equal(hasHiddenWrapper, true);
  assert.equal(hasSelectedCaseGuard, true);
  assert.match(page.text, /hidden=\{screen === 'GAME'\} className="td-screen-stage"/);
  assert.match(page.text, /screen !== 'GAME' \? \{ inert: '' \} : \{\}/);
});

test('Home distinguishes durable cloud investigation from local presentation drafts in both languages', () => {
  assert.match(home.text, /案件与编队已由云端保存/);
  assert.match(home.text, /镜头位置和未提交的草稿仅在当前页面保留/);
  assert.match(home.text, /Your case and squad are saved in the cloud/);
  assert.match(home.text, /Camera position and unsent drafts remain only in this page/);
  assert.doesNotMatch(home.text, /刷新或关闭页面将离开本次现场|Reloading or closing the page leaves this live session/);
});

test('suspending a run focuses the visible resume control without rerouting or mutating the run', () => {
  const effect = findNodes(home, node => ts.isCallExpression(node) && node.expression.getText() === 'useEffect'
    && node.arguments[0]?.getText().includes('resumeRef.current?.focus'))[0];
  assert.ok(effect);
  assert.match(home.text, /<button ref=\{resumeRef\}[^>]*onClick=\{suspendedCase \? onResume : named \? quickStart : onRegister\}/);
  const focusCalls = [];
  const resumeRef = { current: { focus: options => focusCalls.push(options) } };
  bind(effect.arguments[0], { resumeRef, suspendedCase: { case_id: 'Lvl_01' } })();
  assert.deepEqual(focusCalls, [{ preventScroll: true }]);
  bind(effect.arguments[0], { resumeRef, suspendedCase: null })();
  assert.equal(focusCalls.length, 1);
});

test('HOME and resume change only visibility; explicit exit clears selection for a fresh future run', () => {
  let screen = 'GAME';
  const selectedCase = { case_id: 'Lvl_01' };
  let selection = selectedCase;
  let preferred = selectedCase.case_id;
  const bindings = {
    selectedCase, setScreen: value => { screen = value; },
    setSelectedCase: value => { selection = value; }, setPreferredCaseId: value => { preferred = value; },
    setAuthoritativeRun: () => {}, refresh: async () => {},
  };
  handler(page, 'handleOpenHome', bindings)();
  assert.equal(screen, 'HOME');
  assert.strictEqual(selection, selectedCase);
  handler(page, 'handleResume', bindings)();
  assert.equal(screen, 'GAME');
  assert.strictEqual(selection, selectedCase);
  handler(page, 'leaveRun', bindings)('HOME');
  assert.equal(screen, 'HOME');
  assert.equal(selection, null);
  assert.equal(preferred, null);
  const writes = findNodes(page, node => ts.isCallExpression(node) && node.expression.getText() === 'setSelectedCase');
  assert.deepEqual(writes.map(node => node.arguments[0].getText()).sort(), ['caseData', 'null']);
});

test('settlement completing during HOME does not clear the ending or GameOver run before reward UI exits', async () => {
  const selectedCase = { case_id: 'Lvl_01' };
  const summary = { run_id: 'ending-run', case_id: selectedCase.case_id };
  let screen = 'GAME';
  let resolveSettlement;
  let calls = 0;
  const settle = handler(page, 'handleSettlement', {
    settle: received => {
      calls += 1;
      assert.strictEqual(received, summary);
      return new Promise(resolve => { resolveSettlement = resolve; });
    },
  });
  const bindings = { selectedCase, setScreen: value => { screen = value; } };
  const pending = settle(summary);
  handler(page, 'handleOpenHome', bindings)();
  assert.equal(screen, 'HOME');
  const reward = { gold: 500 };
  resolveSettlement(reward);
  assert.strictEqual(await pending, reward);
  assert.equal(screen, 'HOME');
  assert.equal(calls, 1);
  handler(page, 'handleResume', bindings)();
  assert.equal(screen, 'GAME');
  assert.doesNotMatch(variable(page, 'handleSettlement').getText(), /setSelectedCase|setScreen|leaveRun/);
});

test('every case and team entry resumes an existing run before strategy writes, module loading or another energy charge', async () => {
  for (const name of ['handleDeploy', 'handleCaseSelect', 'openLobbyForCase', 'openCasesWithSavedTeam']) {
    const screens = [];
    const result = await handler(page, name, {
      selectedCase: { case_id: 'Lvl_01' }, setScreen: value => screens.push(value),
    })({ case_id: 'Lvl_02' });
    assert.deepEqual(screens, ['GAME'], name);
    if (name.startsWith('handle')) assert.deepEqual(result, { error: null });
  }
  for (const name of ['enterLobby', 'openCase', 'quickStart']) {
    let resumes = 0;
    await handler(home, name, {
      suspendedCase: { case_id: 'Lvl_01' }, onResume: () => { resumes += 1; }, setModule: () => {},
    })('Lvl_02');
    assert.equal(resumes, 1, name);
  }
  assert.match(home.text, /onClick=\{onResume\}/);
  assert.match(home.text, /Resume current investigation/);
});

test('starting a case is single-flight and successful starts retain the selected case until explicit exit', async () => {
  const caseStartRef = { current: false };
  const selected = { case_id: 'Lvl_01' };
  let loads = 0;
  let charges = 0;
  let resolveLoad;
  let selection = null;
  const strategy = { skill_effects: { insight: 2 } };
  let savedStrategy;
  const bindings = {
    selectedCase: null, activeRun: null, caseStartRef, teamIntentRef: { current: null }, profile: {},
    loadInvestigationTerminal: () => { loads += 1; return new Promise(resolve => { resolveLoad = resolve; }); },
    command: async (type, args) => {
      assert.equal(type, 'start_case'); assert.equal(args.case_id, selected.case_id); charges += 1;
      return { profile: {}, active_run: { id: 'paid-run', case_id: selected.case_id, agent_strategy: strategy } };
    },
    resumeCloudRun: run => { selection = selected; savedStrategy = run.agent_strategy; },
    setAgentStrategy: value => { savedStrategy = value; },
    setSelectedCase: value => { selection = value; }, setScreen: screen => assert.equal(screen, 'GAME'),
  };
  const select = handler(page, 'handleCaseSelect', bindings);
  const first = select(selected);
  assert.deepEqual(await select(selected), { error: 'busy' });
  assert.equal(loads, 1);
  assert.equal(charges, 0);
  resolveLoad();
  await first;
  assert.equal(charges, 1);
  assert.strictEqual(selection, selected);
  assert.strictEqual(savedStrategy, strategy);
  assert.equal(caseStartRef.current, false);
});

test('a failed case module load releases the single-flight guard without charging or selecting a case', async () => {
  const caseStartRef = { current: false };
  const select = handler(page, 'handleCaseSelect', {
    selectedCase: null, caseStartRef,
    loadInvestigationTerminal: async () => { throw new Error('Module offline'); },
  });
  await assert.rejects(select({ case_id: 'Lvl_01' }), /Module offline/);
  assert.equal(caseStartRef.current, false);
});
