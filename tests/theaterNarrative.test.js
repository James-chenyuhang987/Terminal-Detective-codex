import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { ALL_CASES, Case_Data_Lvl_01, localizeCase } from '../src/game/caseData.js';
import { getCaseNarrativeProfile } from '../src/game/caseNarrativeLibrary.js';
import { createInitialGameState } from '../src/game/gameState.js';
import { acquireClues } from '../src/game/clueState.js';
import { applyStaminaToTeam, canAgentInvestigate, spendAgentStamina } from '../src/game/agentStamina.js';
import { getEmotion, shiftEmotion } from '../src/game/npcEmotion.js';
import {
  canPresentTheaterNarrative, caseBriefingNarrative, createTheaterNarrativeState, currentTheaterNarrative,
  successfulInterviewEvent, theaterNarrativeReducer, theaterNarrativeStage, worldNarrative,
} from '../src/game/theaterNarrative.js';

function source(path) {
  return ts.createSourceFile(path, readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}
const owner = source('components/game/InvestigationTerminal.jsx');
const page = source('pages/TerminalDetective.jsx');
const home = source('components/game/DetectiveHome.jsx');
const overlay = source('components/game/theater/NarrativeOverlay.jsx');
const css = readFileSync(new URL('../src/components/game/theater/narrative.css', import.meta.url), 'utf8');
function nodes(root, predicate) {
  const found = [];
  const visit = node => { if (predicate(node)) found.push(node); ts.forEachChild(node, visit); };
  visit(root);
  return found;
}
function evaluate(node, bindings = {}) {
  const { outputText } = ts.transpileModule(`const result = (${node.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}
function handler(root, name, bindings) {
  const declaration = nodes(root, node => ts.isVariableDeclaration(node) && node.name.getText() === name)[0];
  assert.ok(declaration, name);
  return evaluate(declaration.initializer, bindings);
}
function effect(root, fragment, bindings) {
  const call = nodes(root, node => ts.isCallExpression(node) && ['useEffect', 'useLayoutEffect'].includes(node.expression.getText()) && node.arguments[0]?.getText().includes(fragment))[0];
  assert.ok(call, fragment);
  return evaluate(call.arguments[0], bindings)();
}
function freeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(freeze);
  return Object.freeze(value);
}
const goodResult = { response: 'An observed answer', cooperationChange: 1, repeated: false, emotionShift: 1, nextEmotion: 'shaken', revealedClueIds: [] };
function answer(stage = 'opening', overrides = {}) {
  return successfulInterviewEvent({ runId: 'run-1', dialogueId: 1, theaterAtQuestion: true, result: goodResult, stage, ...overrides });
}

test('world prologue is original generic bilingual setting; briefings use only existing public case fields', () => {
  for (const lang of ['zh', 'en']) {
    const world = worldNarrative(lang);
    assert.ok(world.title && world.text.length > 100);
    for (const c of ALL_CASES) {
      const before = structuredClone(c);
      const briefing = caseBriefingNarrative(freeze(structuredClone(c)), lang);
      assert.ok(briefing.title.includes(localizeCase(c, lang).title));
      assert.ok(briefing.text.includes(getCaseNarrativeProfile(c.case_id, lang).prologue));
      assert.ok(briefing.text.includes(localizeCase(c, lang).scene.description));
      if (c.case_id !== 'Lvl_01') assert.ok(briefing.text.includes(lang === 'en' ? 'generic scene staging' : '通用场景布置'));
      assert.ok(!world.text.includes(c.case_id));
      assert.deepEqual(c, before);
    }
  }
  const pureSource = readFileSync(new URL('../src/game/theaterNarrative.js', import.meta.url), 'utf8');
  assert.doesNotMatch(pureSource, /caseSecrets|server\/|judgeStructured|acquireClues|spendAgentStamina|startCase\(|setGameState|fetch\(/);
});

test('public stage matches observation boundaries without depending on secret facts', () => {
  const caseData = { clue_dictionary: new Array(10).fill({}) };
  assert.equal(theaterNarrativeStage({ turn_count: 0, unlocked_clues: ['one'] }, caseData), 'opening');
  assert.equal(theaterNarrativeStage({ turn_count: 4, unlocked_clues: [] }, caseData), 'opening');
  assert.equal(theaterNarrativeStage({ turn_count: 2, unlocked_clues: new Array(5) }, caseData), 'pursuit');
  assert.equal(theaterNarrativeStage({ turn_count: 2, unlocked_clues: new Array(6) }, caseData), 'convergence');
});

test('only effective returned non-repeated answers enqueue, not estimates, openings, failures or terminal questions', () => {
  for (const result of [null, {}, { ...goodResult, response: '' }, { ...goodResult, repeated: true }, { ...goodResult, error: 'offline' },
    { ...goodResult, cooperationChange: 0 }, { ...goodResult, cooperationChange: -1 },
    { ...goodResult, cooperationChange: undefined, estimatedAlignment: 100 }, { ...goodResult, consequence: { confusionIncrease: 2 } }]) {
    assert.equal(answer('opening', { result }), null);
  }
  assert.equal(answer('opening', { theaterAtQuestion: false }), null);
  assert.equal(answer('secret-stage'), null);
  assert.equal(answer().type, 'answer');
});

test('run-owned queue waits for matching dialogue close, dedupes each stage and rejects stale runs and completions', () => {
  let state = freeze(createTheaterNarrativeState('run-1'));
  state = theaterNarrativeReducer(state, answer());
  assert.equal(currentTheaterNarrative(state), null);
  assert.strictEqual(theaterNarrativeReducer(state, answer()), state);
  state = theaterNarrativeReducer(state, { type: 'close', runId: 'run-1', dialogueId: 2 });
  assert.equal(currentTheaterNarrative(state), null);
  state = theaterNarrativeReducer(state, { type: 'close', runId: 'run-1', dialogueId: 1 });
  const opening = currentTheaterNarrative(state);
  assert.equal(opening.stage, 'opening');
  assert.equal(currentTheaterNarrative(state, 'en').id, opening.id);
  state = theaterNarrativeReducer(state, answer('pursuit', { dialogueId: 2 }));
  state = theaterNarrativeReducer(state, answer('convergence', { dialogueId: 3 }));
  for (const event of [null, { ...answer(), runId: 'old-run' }, { type: 'complete', runId: 'run-1', id: 'wrong-id' }]) {
    assert.strictEqual(theaterNarrativeReducer(state, event), state);
  }
  state = theaterNarrativeReducer(state, { type: 'complete', runId: 'run-1', id: opening.id });
  assert.equal(currentTheaterNarrative(state), null);
  state = theaterNarrativeReducer(state, { type: 'close', runId: 'run-1', dialogueId: 2 });
  assert.equal(currentTheaterNarrative(state).stage, 'pursuit');
  assert.strictEqual(theaterNarrativeReducer(state, answer()), state, 'completed stage never replays');
  assert.deepEqual(createTheaterNarrativeState('new-run').seen, []);
});

test('every higher-priority panel or transaction postpones rather than consumes an interlude', () => {
  const safe = { theaterMode: true, presentationActive: true };
  assert.equal(canPresentTheaterNarrative(safe), true);
  for (const flag of ['selectedNPC', 'reportMode', 'isProcessing', 'isFinalizing', 'crisisPending', 'crisis', 'decisionCards',
    'actionCinematic', 'cinematic', 'showBSoD', 'showGameOver', 'showSettings', 'showOnboarding', 'showCommandConsole', 'mobileToolsOpen', 'isLinkChecking']) {
    assert.equal(canPresentTheaterNarrative({ ...safe, [flag]: true }), false, flag);
  }
  assert.equal(canPresentTheaterNarrative({ ...safe, theaterMode: false }), false);
  assert.equal(canPresentTheaterNarrative({ ...safe, presentationActive: false }), false);
});

function entryHarness(mode = 'theater') {
  const state = { screen: 'CASE_SELECT', narrative: null, busy: false, error: '', charges: 0, routes: 0 };
  const bindings = {
    selectedCase: null, settings: { storyMode: mode }, lang: 'en',
    briefingRequestRef: { current: null }, briefedRunRef: { current: false }, caseStartRef: { current: false },
    setScreen: value => { state.screen = value; }, setEntryNarrative: value => { state.narrative = value; },
    setNarrativeBusy: value => { state.busy = value; }, setNarrativeError: value => { state.error = value; }, setPreferredCaseId: () => {},
    publicErrorMessage: e => e.message,
    openCasesWithSavedTeam: async () => { state.routes++; state.screen = 'CASE_SELECT'; },
    handleCaseSelect: async () => { state.charges++; return { effects: {} }; },
  };
  return { state, bindings, call: (name, ...args) => handler(page, name, { ...bindings, entryNarrative: state.narrative })(...args) };
}

test('only explicit theater Home Start uses prologue; resume and ordinary case navigation bypass it', () => {
  let starts = 0;
  handler(home, 'quickStart', { suspendedCase: null, onStartInvestigation: () => starts++ })();
  assert.equal(starts, 1);
  let resumes = 0;
  handler(home, 'quickStart', { suspendedCase: {}, onResume: () => resumes++ })();
  assert.equal(resumes, 1);
  let modules = 0;
  handler(home, 'quickStart', { suspendedCase: null, onStartInvestigation: null, profile: { saved_team_config: {} }, openModule: () => modules++ })();
  assert.equal(modules, 1, 'text flow stays unchanged');
  for (const name of ['openCasesWithSavedTeam', 'openLobbyForCase', 'handleResume']) {
    assert.doesNotMatch(nodes(page, n => ts.isVariableDeclaration(n) && n.name.getText() === name)[0].getText(), /setEntryNarrative/);
  }
  const h = entryHarness();
  h.call('handleHomeStartInvestigation');
  assert.equal(h.state.narrative.kind, 'prologue');
  assert.equal(h.state.charges, 0);
  h.call('cancelEntryNarrative');
  assert.equal(h.state.screen, 'HOME');
  assert.equal(h.state.narrative, null);
  assert.equal(h.state.charges, 0);
});

test('prologue continue enters existing saved-team flow without selecting or charging a case', async () => {
  const h = entryHarness();
  h.call('handleHomeStartInvestigation');
  await h.call('completeEntryNarrative');
  assert.equal(h.state.routes, 1);
  assert.equal(h.state.narrative, null);
  assert.equal(h.state.charges, 0);
});

test('case briefing is cancellable before charge and retains original promise until single-flight confirmation', async () => {
  const h = entryHarness();
  const selection = h.call('requestCaseSelect', Case_Data_Lvl_01);
  assert.equal(h.state.narrative.kind, 'briefing');
  assert.equal(h.state.charges, 0);
  assert.deepEqual(await h.call('requestCaseSelect', ALL_CASES[1]), { error: 'busy' });
  h.call('cancelEntryNarrative');
  assert.deepEqual(await selection, { error: 'cancelled' });
  assert.equal(h.state.charges, 0);
  const next = h.call('requestCaseSelect', Case_Data_Lvl_01);
  let finish;
  h.bindings.handleCaseSelect = () => { h.state.charges++; return new Promise(resolve => { finish = resolve; }); };
  const confirm = h.call('completeEntryNarrative');
  await h.call('completeEntryNarrative');
  h.call('cancelEntryNarrative');
  assert.equal(h.state.charges, 1);
  assert.equal(h.state.busy, true);
  assert.equal(h.state.narrative.kind, 'briefing', 'cannot cancel once normal charge has begun');
  finish({ effects: {} });
  await confirm;
  await next;
  assert.equal(h.state.narrative, null);
  assert.equal(h.state.busy, false);
  assert.equal(h.bindings.briefedRunRef.current, true);
});

test('briefing failed entry stays retryable, does not mark arrival, and cancellation releases caller', async () => {
  for (const throws of [false, true]) {
    const h = entryHarness();
    h.bindings.handleCaseSelect = async () => { if (throws) throw new Error('offline'); return { error: 'insufficient_energy' }; };
    const pending = h.call('requestCaseSelect', Case_Data_Lvl_01);
    await h.call('completeEntryNarrative');
    assert.ok(h.state.error);
    assert.equal(h.state.busy, false);
    assert.equal(h.bindings.briefedRunRef.current, false);
    assert.equal(h.state.narrative.kind, 'briefing');
    h.call('cancelEntryNarrative');
    assert.deepEqual(await pending, { error: 'cancelled' });
  }
  const h = entryHarness('terminal');
  await h.call('requestCaseSelect', Case_Data_Lvl_01);
  assert.equal(h.state.charges, 1);
  assert.equal(h.state.narrative, null);
});

function interviewHarness({ theater = true, failRefresh = false } = {}) {
  const initial = createInitialGameState(Case_Data_Lvl_01);
  initial.run_id = 'run-1'; initial.agent_stamina = { 'NEXUS-01': 100 };
  const stored = { gameState: initial, dialogue: [], asked: {}, emotions: {}, processing: false, packs: null, error: null, charges: 0, narrative: createTheaterNarrativeState(initial.run_id) };
  let resolveAnswer, rejectAnswer;
  const team = [{ agent_id: 'NEXUS-01', stamina: 100 }];
  const bindings = {
    selectedNPC: Case_Data_Lvl_01.npcs[0], theaterMode: theater, dialogueSequenceRef: { current: 1 },
    gameStateRef: { current: initial }, activeRunRef: { current: 0 }, abortCtrlRef: { current: null },
    finalizingRef: { current: false }, crisisPendingRef: { current: false }, isProcessing: false,
    configuredAgentStrategy: { team }, npcExecutorId: 'NEXUS-01', askedQuestionIds: {}, npcEmotionState: {}, caseData: Case_Data_Lvl_01, lang: 'en',
    AbortController, applyStaminaToTeam, canAgentInvestigate, getEmotion, shiftEmotion, acquireClues,
    spendAgentStamina: (...args) => { stored.charges++; return spendAgentStamina(...args); },
    successfulInterviewEvent, theaterNarrativeStage,
    dispatchNarrative: event => { stored.narrative = theaterNarrativeReducer(stored.narrative, event); },
    setGameState: value => { stored.gameState = value; },
    setNpcDialogue: update => { stored.dialogue = typeof update === 'function' ? update(stored.dialogue) : update; },
    setAskedQuestionIds: update => { stored.asked = update(stored.asked); },
    setNpcEmotionState: update => { stored.emotions = update(stored.emotions); },
    setIsProcessing: value => { stored.processing = value; },
    setNpcQuestionPacks: value => { stored.packs = value; }, setNpcQuestionError: value => { stored.error = value; },
    setSelectedNPC: value => { bindings.selectedNPC = value; },
    setNewClueIds: () => {}, schedule: () => {}, addLine: () => {}, triggerSynergy: () => {},
    resolveInterrogationOption: () => new Promise((resolve, reject) => { resolveAnswer = resolve; rejectAnswer = reject; }),
    getInterrogationOptionPacks: async () => { if (failRefresh) throw new Error('refresh offline'); return { packs: {} }; },
  };
  bindings.beginAbortableOperation = handler(owner, 'beginAbortableOperation', bindings);
  bindings.isOperationCurrent = handler(owner, 'isOperationCurrent', bindings);
  bindings.handleAbort = () => {
    if (!bindings.abortCtrlRef.current) return;
    bindings.activeRunRef.current++;
    bindings.abortCtrlRef.current.abort();
    bindings.abortCtrlRef.current = null;
    stored.processing = false;
  };
  const ask = (...args) => handler(owner, 'handleNPCQuestion', bindings)(...args);
  const close = handler(owner, 'handleNPCDialogueClose', bindings);
  return { stored, bindings, ask: () => ask({ questionId: 'q-1', text: 'Question' }), close, resolve: value => resolveAnswer(value), reject: e => rejectAnswer(e) };
}

test('actual question commits once across Home and mode switches; refresh failure does not lose interlude', async () => {
  for (const failRefresh of [false, true]) {
    const h = interviewHarness({ failRefresh });
    const pending = h.ask();
    await h.ask();
    h.bindings.theaterMode = false;
    const before = structuredClone(h.stored.gameState);
    h.resolve(goodResult);
    await pending;
    assert.equal(h.stored.charges, 1);
    assert.equal(h.stored.gameState.run_id, before.run_id);
    assert.equal(h.stored.gameState.agent_stamina['NEXUS-01'], 90);
    assert.equal(h.stored.gameState.turn_count, before.turn_count);
    assert.equal(h.stored.gameState.action_points_left, before.action_points_left);
    assert.deepEqual(h.stored.gameState.unlocked_clues, before.unlocked_clues);
    assert.equal(h.stored.asked[Case_Data_Lvl_01.npcs[0].npc_id].length, 1);
    assert.equal(h.stored.narrative.queue.length, 1);
    assert.equal(currentTheaterNarrative(h.stored.narrative), null);
    h.close();
    assert.equal(currentTheaterNarrative(h.stored.narrative).stage, 'opening');
    const after = structuredClone(h.stored.gameState);
    h.close();
    assert.equal(h.stored.narrative.queue.length, 1);
    assert.deepEqual(h.stored.gameState, after, 'close only affects presentation');
    if (failRefresh) assert.equal(h.stored.error, null, 'close clears refresh feedback');
  }
});

test('closing during option refresh preserves a committed answer and releases its chapter exactly once', async () => {
  const h = interviewHarness();
  let finishRefresh;
  h.bindings.getInterrogationOptionPacks = () => new Promise(resolve => { finishRefresh = resolve; });
  const pending = h.ask();
  h.resolve(goodResult);
  await Promise.resolve();
  assert.equal(h.stored.charges, 1);
  assert.equal(h.stored.processing, true);
  assert.equal(currentTheaterNarrative(h.stored.narrative), null);
  h.close();
  assert.equal(currentTheaterNarrative(h.stored.narrative).stage, 'opening');
  finishRefresh({ packs: { stale: true } });
  await pending;
  assert.equal(h.stored.processing, false);
  assert.equal(h.stored.packs, null);
  assert.equal(h.stored.charges, 1);
  assert.equal(h.stored.narrative.queue.length, 1);
});

test('actual rejected, aborted and stale responses never commit effects or enqueue; weak answers do not narrate', async () => {
  for (const outcome of ['rejected', 'aborted', 'stale', 'weak', 'repeated', 'terminal']) {
    const h = interviewHarness({ theater: outcome !== 'terminal' });
    const pending = h.ask();
    if (outcome === 'aborted') h.close();
    if (outcome === 'stale') h.bindings.activeRunRef.current++;
    if (outcome === 'rejected') h.reject(new Error('expired'));
    else h.resolve({ ...goodResult, cooperationChange: outcome === 'weak' ? 0 : 1, repeated: outcome === 'repeated' });
    await pending;
    assert.equal(h.stored.narrative.queue.length, 0, outcome);
    assert.equal(h.stored.charges, ['weak', 'repeated', 'terminal'].includes(outcome) ? 1 : 0, outcome);
  }
});

test('actual question commits existing revealed clue once; narrative never adds a second clue or charge', async () => {
  const h = interviewHarness();
  const pending = h.ask();
  h.resolve({ ...goodResult, revealedClueIds: ['c_01'] });
  await pending;
  h.close();
  assert.deepEqual(h.stored.gameState.unlocked_clues, ['c_01']);
  assert.equal(h.stored.charges, 1);
  const before = structuredClone(h.stored.gameState);
  const current = currentTheaterNarrative(h.stored.narrative);
  h.bindings.dispatchNarrative({ type: 'complete', runId: 'run-1', id: current.id });
  assert.deepEqual(h.stored.gameState, before);
});

function events() {
  const listeners = new Map();
  return { listeners, addEventListener(name, cb) { listeners.set(name, cb); }, removeEventListener(name) { listeners.delete(name); }, dispatch(name) { listeners.get(name)?.(); } };
}
function timerHarness(overrides = {}) {
  const state = { reveal: { count: 0, complete: false }, foreground: true, reducedMotion: false };
  const callbacks = new Map();
  const document = { ...events(), hidden: false, focused: true, hasFocus() { return this.focused; } };
  const query = { ...events(), matches: false };
  const window = { ...events(), matchMedia: () => query, setInterval(cb) { callbacks.set(1, cb); return 1; }, clearInterval: id => callbacks.delete(id) };
  const bindings = {
    document, window, reducedMotion: false, active: true, foreground: true, busy: false, complete: false, characters: Array.from('Test passage'),
    setReveal: update => { state.reveal = update(state.reveal); }, setForeground: value => { state.foreground = value; },
    setReducedMotion: value => { state.reducedMotion = value; }, ...overrides,
  };
  return { state, bindings, document, window, query, callbacks, tick: () => callbacks.get(1)?.() };
}

test('actual typewriter effect advances, pauses hidden/unfocused/Home/settings, and cleans up its timer', () => {
  const h = timerHarness();
  const cleanup = effect(overlay, 'window.setInterval', h.bindings);
  h.tick(); assert.equal(h.state.reveal.count, 2);
  h.document.hidden = true; h.tick(); assert.equal(h.state.reveal.count, 2);
  h.document.hidden = false; h.document.focused = false; h.tick(); assert.equal(h.state.reveal.count, 2);
  h.document.focused = true; h.tick(); assert.equal(h.state.reveal.count, 4);
  cleanup(); assert.equal(h.callbacks.size, 0);
  for (const overrides of [{ active: false }, { foreground: false }, { busy: true }, { complete: true }]) {
    const paused = timerHarness(overrides);
    assert.equal(effect(overlay, 'window.setInterval', paused.bindings), undefined);
    assert.equal(paused.callbacks.size, 0);
  }
  const reduced = timerHarness({ reducedMotion: true, complete: true });
  effect(overlay, 'window.setInterval', reduced.bindings);
  assert.equal(reduced.state.reveal.complete, true);
  assert.equal(reduced.callbacks.size, 0);
});

test('actual overlay visibility/motion listeners clean up and refocus does not reset progress', () => {
  const h = timerHarness();
  const cleanup = effect(overlay, "query.addEventListener('change'", h.bindings);
  h.window.dispatch('blur'); assert.equal(h.state.foreground, false);
  h.window.dispatch('focus'); assert.equal(h.state.foreground, true);
  h.document.hidden = true; h.document.dispatch('visibilitychange'); assert.equal(h.state.foreground, false);
  h.query.matches = true; h.query.dispatch('change'); assert.equal(h.state.reducedMotion, true);
  cleanup();
  for (const target of [h.window, h.document, h.query]) assert.equal(target.listeners.size, 0);
});

test('actual modal lifecycle contains focus and restores visible connected focus, never hidden Home run controls', () => {
  class Element {
    isConnected = true;
    hidden = false;
    focused = 0;
    closest() { return this.hidden ? {} : null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus() { this.focused++; }
  }
  for (const hidden of [false, true]) {
    const previous = new Element(); previous.hidden = hidden;
    const fallback = new Element();
    const dialog = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, contains: () => false };
    const document = { activeElement: previous, body: {}, querySelector: () => fallback };
    const cleanup = effect(overlay, 'dialog?.showModal()', { active: true, dialogRef: { current: dialog }, document, HTMLElement: Element, restoreFocusSelector: '' });
    assert.equal(dialog.open, true);
    cleanup();
    assert.equal(dialog.open, false);
    assert.equal(previous.focused, hidden ? 0 : 1);
  }
  for (const kind of ['removed', 'body', 'home-focused', 'fallback-hidden']) {
    const body = new Element();
    const previous = kind === 'body' ? body : new Element();
    if (kind !== 'body') previous.isConnected = false;
    const fallback = new Element(); fallback.hidden = kind === 'fallback-hidden';
    const document = { activeElement: previous, body, querySelector: () => fallback };
    const dialog = { showModal() {}, close() { document.activeElement = kind === 'home-focused' ? new Element() : body; }, contains: () => false };
    const cleanup = effect(overlay, 'dialog?.showModal()', { active: true, dialogRef: { current: dialog }, document, HTMLElement: Element, restoreFocusSelector: '.td-run-presentation-controls button' });
    cleanup();
    assert.equal(fallback.focused, ['removed', 'body'].includes(kind) ? 1 : 0, kind);
    assert.equal(previous.focused, 0);
  }
  assert.equal(effect(overlay, 'dialog?.showModal()', { active: false }), undefined);
});

test('overlay keeps full stable wrapping and static accessible text; native top layer blocks underlying action input', () => {
  assert.match(overlay.text, /<dialog[\s\S]*aria-modal="true"/);
  assert.match(overlay.text, /aria-describedby=\{textId\}/);
  assert.match(overlay.text, /td-narrative-copy" aria-hidden="true"/);
  assert.match(overlay.text, /<p id=\{textId\} className="td-narrative-sr">\{text\}<\/p>/);
  assert.doesNotMatch(overlay.text, /aria-live|role="status"/);
  assert.match(overlay.text, /onKeyDown=\{event => event.stopPropagation\(\)\}/);
  assert.match(css, /visibility: hidden/);
  assert.match(css, /height: calc\(50dvh/);
  assert.match(css, /white-space: pre-wrap/);
  assert.match(css, /min-height: 44px/);
  assert.match(css, /overflow: auto/);
  assert.match(owner.text, /useReducer\(theaterNarrativeReducer, gameState.run_id, createTheaterNarrativeState\)/);
  assert.match(owner.text, /useRef\(\{ arrived: narrativeBriefed \}\)/);
  assert.match(owner.text, /paused=\{Boolean\(narrativeVisible \|\|/);
  assert.match(owner.text, /key=\{activeNarrative.id\}/);
  assert.doesNotMatch(owner.text, /key=\{(?:lang|theaterMode|settings.storyMode)\}/);
});
