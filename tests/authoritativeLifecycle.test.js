import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { createPlayerRunClient } from '../src/game/playerRun.js';
import { memoryLocks } from './runClientFixtures.js';
import { Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import { canAgentInvestigate } from '../src/game/agentStamina.js';
import { createTheaterNarrativeState, theaterNarrativeReducer, successfulInterviewEvent, theaterNarrativeStage, currentTheaterNarrative } from '../src/game/theaterNarrative.js';

const text = readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('runtime.jsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function handler(name, bindings) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText() === name) initializer = node.initializer;
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer, name);
  const { outputText } = ts.transpileModule(`const result = (${initializer.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn result;`, Object.keys(bindings))(...Object.values(bindings));
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}
function gateway() {
  const pending = deferred();
  const stored = { commits: [], ready: [], errors: [], loading: [] };
  const client = { resume: () => pending.promise, command: () => pending.promise };
  const bindings = {
    useCallback: fn => fn, runClient: client, runViewRef: { current: { active: true, client } },
    lang: 'en', commandInFlightRef: { current: false }, recoveryPresentationRef: { current: null }, commitServerRun: value => stored.commits.push(value),
    setAuthorityReady: value => stored.ready.push(value), setAuthorityError: value => stored.errors.push(value), setAuthorityLoading: value => stored.loading.push(value),
  };
  return { bindings, stored, pending };
}

test('late command from unmounted or replaced session cannot overwrite current state or clear current request lock', async () => {
  for (const replaced of [false, true]) {
    const h = gateway();
    const request = handler('executeRunCommand', h.bindings)({ type: 'rest' });
    if (replaced) h.bindings.runViewRef.current = { active: true, client: {} };
    else h.bindings.runViewRef.current.active = false;
    h.pending.resolve({ run: { id: 'old-session-run' }, result: {} });
    await assert.rejects(request, { name: 'AbortError' });
    assert.deepEqual(h.stored.commits, []);
    assert.deepEqual(h.stored.ready, []);
    assert.deepEqual(h.stored.errors, []);
    assert.equal(h.bindings.commandInFlightRef.current, true);
  }
});

test('StrictMode replay commits only the live view even when both effects share the same response', async () => {
  const h = gateway();
  const first = handler('resumeRun', h.bindings)();
  h.bindings.runViewRef.current.active = false;
  h.bindings.runViewRef.current = { active: true, client: h.bindings.runClient };
  const second = handler('resumeRun', h.bindings)();
  const snapshot = { id: 'cloud-run' };
  h.pending.resolve({ run: snapshot });
  await Promise.all([first, second]);
  assert.deepEqual(h.stored.commits, [snapshot]);
  assert.deepEqual(h.stored.ready, [false, false, true]);
  assert.deepEqual(h.stored.loading, [true, true, false]);
});

test('BSoD recovery, priority and end handlers await server instead of invoking a local reset or free restart', async () => {
  for (const type of ['recover', 'abandon', 'priority']) {
    const calls = [];
    const processing = [];
    const pending = deferred();
    const command = type === 'priority' ? { type, priority_list: PRIORITY_ACTIONS.map(action => action.id).reverse() } : { type };
    const fn = handler('handleRunIntent', {
      authorityReady: true, isProcessing: false, commandInFlightRef: { current: false }, finalizingRef: { current: false },
      executeRunCommand: body => { calls.push(body); return pending.promise; },
      setIsProcessing: value => processing.push(value), notifyCommand: () => {}, lang: 'en',
    });
    const request = fn(command);
    assert.deepEqual(calls, [command]);
    assert.deepEqual(processing, [true]);
    pending.resolve({ run: { status: type === 'abandon' ? 'abandoned' : 'active' } });
    await request;
    assert.deepEqual(processing, [true, false]);
  }
  assert.match(text, /onEnd=\{\(\) => void handleRunIntent\(\{ type: 'abandon' \}\)\}/);
  assert.match(text, /onDismiss=\{\(\) => void handleRunIntent\(\{ type: 'recover' \}\)\}/);
});

test('crisis intent contains only a server option ID and does not synthesize evidence, AP, or rewards', async () => {
  const calls = [];
  const lines = [];
  await handler('handleCrisisChoice', {
    authorityReady: true, crisis: { id: 'server-event' }, crisisPendingRef: { current: true }, commandInFlightRef: { current: false },
    setCrisisError: () => {}, executeRunCommand: async body => { calls.push(body); return { result: { resultText: 'Cloud outcome' } }; },
    addLine: text => lines.push(text),
  })('choice-1');
  assert.deepEqual(calls, [{ type: 'crisis', option_id: 'choice-1' }]);
  assert.match(lines[0], /Cloud outcome/);
});

function roundHarness(choice, offline = false) {
  const initial = { run_id: 'paid-round', turn_count: 2, action_points_left: 18, unlocked_clues: [], confusion_score: 4 };
  const confirmed = { ...initial, turn_count: 3, action_points_left: 15, confusion_score: 11 };
  const calls = [];
  const stored = { state: initial, errors: [] };
  const packs = { 'NEXUS-01': [{ option_id: 'server-choice', action_tag: 'search_area', label: 'Inspect' }] };
  const refs = { decisionResolveRef: { current: null }, gameStateRef: { current: initial }, activeRunRef: { current: 1 }, abortCtrlRef: { current: null } };
  const bindings = {
    ...refs, authorityReady: true, isProcessing: false, finalizingRef: { current: false }, crisisPendingRef: { current: false }, showBSoD: false,
    lang: 'en', t: {}, activeAgentStrategy: { team: [] }, caseData: { clue_dictionary: [] }, settings: { cinematicsEnabled: false },
    activeTerminalTurnRef: { current: 2 }, viewedTerminalTurnRef: { current: 2 },
    beginAbortableOperation: () => ({ ctrl: new AbortController(), operationId: 1 }),
    generateObservationSections: () => ({ story: { npcs: [] }, observation: {}, observationTerminalText: 'Public observation' }),
    window: { matchMedia: () => ({ matches: true }) },
    streamTerminalText: async () => {}, streamInvestigationThought: async () => {}, startStressTimer: () => {}, stopStressTimer: () => {},
    shouldPlayActionCinematic: () => false,
    executeRunCommand: async command => {
      calls.push(command);
      if (command.type === 'decision_options') return { result: { packs } };
      if (offline) throw new Error('uncertain');
      stored.state = confirmed;
      return { run: { state: confirmed }, result: { settlement: { action_narration: 'Cloud resolution' } } };
    },
    setDecisionCards: value => {
      if (value) queueMicrotask(() => refs.decisionResolveRef.current(choice));
    },
    addLine: (line, type) => { if (type === 'error') stored.errors.push(line); }, publicErrorMessage: error => error.message,
  };
  for (const name of ['ActiveTerminalTurn', 'ViewedTerminalTurn', 'IsProcessing', 'ReactState', 'StreamingTerminal', 'DecisionStory', 'DecisionLog']) {
    bindings[`set${name}`] = () => {};
  }
  bindings.ReAct_Enum = { OBSERVE: 'OBSERVE', THINK: 'THINK', ACT: 'ACT', IDLE: 'IDLE' };
  return { calls, stored, initial, confirmed, run: handler('runReActCycle', bindings) };
}

test('actual observation/thought/decision loop submits card identifiers and commits only confirmed round state', async () => {
  const choice = { card: { option_id: 'server-choice', action_tag: 'search_area', label: 'Inspect', injected_reward: 99999 }, executorAgentId: 'NEXUS-01', assistAgentId: 'CIPHER-47', commandIds: ['joint_action'] };
  for (const offline of [false, true]) {
    const h = roundHarness(choice, offline);
    await h.run();
    assert.deepEqual(h.calls, [
      { type: 'decision_options', lang: 'en' },
      { type: 'round', option_id: 'server-choice', assist_agent_id: 'CIPHER-47', command_ids: ['joint_action'], lang: 'en' },
    ]);
    assert.strictEqual(h.stored.state, offline ? h.initial : h.confirmed);
    assert.equal(h.stored.errors.length, offline ? 1 : 0);
  }
});

test('actual rest decision uses the paid-run transport, never a client recovery reducer', async () => {
  const h = roundHarness({ rest: true });
  await h.run();
  assert.deepEqual(h.calls, [{ type: 'decision_options', lang: 'en' }, { type: 'rest', lang: 'en' }]);
  assert.strictEqual(h.stored.state, h.confirmed);
});


async function interviewRuntime({ lost = false, deferredAnswer = false } = {}) {
  const pending = deferred();
  const npc = Case_Data_Lvl_01.npcs[0];
  const ledger = new Map();
  const values = new Map();
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const stored = { charges: 0, ready: true, dialogue: [], packs: { old: true }, lines: [], narrative: createTheaterNarrativeState('paid-interview') };
  let cloud = { id: 'paid-interview', revision: 0, status: 'active', linked_pairs: [], state: { run_id: 'paid-interview', turn_count: 0, unlocked_clues: [], agent_stamina: { 'NEXUS-01': 100 } } };
  const answer = { response: 'The answer from the cloud ledger.', npc_name: npc.name, cooperationChange: 1, packs: { refreshed: true } };
  let sequence = 0;
  const calls = [];
  let activeSession = 'device';
  const options = { ownerUid: 'fixture-owner', runId: cloud.id, sessionId: activeSession, storage, locks: memoryLocks(), createId: () => `intent-${++sequence}`, invoke: async (_name, body) => {
    calls.push(structuredClone(body));
    if (body.session_id !== activeSession) throw Object.assign(new Error('Session taken'), { code: 'SESSION_TAKEN' });
    if (body.action === 'status') return { data: { authority_version: 1, run: cloud } };
    if (!ledger.has(body.operation_id)) {
      stored.charges++;
      cloud = { ...cloud, revision: 1, state: { ...cloud.state, agent_stamina: { 'NEXUS-01': 90 } } };
      ledger.set(body.operation_id, { data: { authority_version: 1, run: cloud, result: answer } });
      if (deferredAnswer) await pending.promise;
      if (lost) throw new Error('accepted response lost');
    }
    return ledger.get(body.operation_id);
  } };
  const client = createPlayerRunClient(options);
  await client.resume();
  const bindings = {
    useCallback: fn => fn, lang: 'en', t: {}, authorityReady: true, isProcessing: false, selectedNPC: npc,
    caseData: Case_Data_Lvl_01, theaterMode: true, configuredAgentStrategy: { team: [{ agent_id: 'NEXUS-01' }] }, npcExecutorId: 'NEXUS-01',
    runClient: client, runViewRef: { current: { client, active: true } }, commandInFlightRef: { current: false },
    gameStateRef: { current: cloud.state }, abortCtrlRef: { current: null }, activeRunRef: { current: 0 },
    finalizingRef: { current: false }, crisisPendingRef: { current: false }, dialogueSequenceRef: { current: 1 }, closedDialogueRef: { current: 0 },
    recoveryPresentationRef: { current: null }, pendingQuestionPresentationRef: { current: null },
    setAuthorityReady: v => { stored.ready = v; }, setAuthorityError: v => { stored.authorityError = v; }, setAuthorityLoading: () => {},
    commitServerRun: run => { stored.state = run.state; bindings.gameStateRef.current = run.state; },
    setNpcDialogue: fn => { stored.dialogue = typeof fn === 'function' ? fn(stored.dialogue) : fn; },
    setNpcQuestionPacks: v => { stored.packs = v; }, setNpcQuestionError: () => {}, setNpcExecutorId: () => {},
    setSelectedNPC: v => { bindings.selectedNPC = v; }, setIsProcessing: () => {}, setNewClueIds: () => {}, schedule: () => {}, triggerSynergy: () => {},
    addLine: v => { stored.lines.push(v); }, canAgentInvestigate, successfulInterviewEvent, theaterNarrativeStage,
    dispatchNarrative: event => { stored.narrative = theaterNarrativeReducer(stored.narrative, event); },
    publicErrorMessage: error => error.message,
  };
  for (const name of ['beginAbortableOperation', 'isOperationCurrent', 'executeRunCommand', 'handleAbort']) bindings[name] = handler(name, bindings);
  const refreshRecovery = () => { bindings.recoveryPresentationRef.current = handler('presentRecoveredResponse', bindings); };
  refreshRecovery();
  return { stored, bindings, client, pending, calls,
    ask: () => handler('handleNPCQuestion', bindings)({ questionId: 'question-1', text: 'Question?' }),
    close: () => handler('handleNPCDialogueClose', bindings)(),
    resume: () => { refreshRecovery(); return handler('resumeRun', bindings)(); },
    reload: () => {
      activeSession = 'newly-claimed-device';
      bindings.runClient = createPlayerRunClient({ ...options, sessionId: activeSession });
      bindings.runViewRef.current = { client: bindings.runClient, active: true };
      bindings.executeRunCommand = handler('executeRunCommand', bindings);
      bindings.pendingQuestionPresentationRef.current = null;
      bindings.selectedNPC = null;
      stored.dialogue = [];
    },
  };
}

test('actual lost-answer receipt replay restores dialogue and fresh options without another charge or question', async () => {
  for (const reload of [false, true]) {
    const h = await interviewRuntime({ lost: true });
    await h.ask();
    assert.equal(h.stored.ready, false);
    assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 0);
    assert.equal(h.client.hasPending(), true);
    if (reload) h.reload();
    await h.resume();
    assert.equal(h.stored.ready, true);
    assert.equal(h.stored.charges, 1);
    assert.equal(h.stored.state.agent_stamina['NEXUS-01'], 90);
    assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 1);
    assert.deepEqual(h.stored.packs, { refreshed: true });
    assert.equal(h.client.hasPending(), false);
    const requests = h.calls.filter(body => body.action === 'command');
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], { ...requests[0], session_id: reload ? 'newly-claimed-device' : 'device' });
    h.close();
    if (!reload) assert.equal(currentTheaterNarrative(h.stored.narrative).stage, 'opening');
  }
});

test('actual close during accepted question keeps server commit and releases late narrative instead of blocking the queue', async () => {
  const h = await interviewRuntime({ deferredAnswer: true });
  const request = h.ask();
  assert.equal(h.bindings.commandInFlightRef.current, true);
  h.close();
  h.pending.resolve();
  await request;
  assert.equal(h.stored.charges, 1);
  assert.equal(h.stored.state.agent_stamina['NEXUS-01'], 90);
  assert.equal(h.bindings.selectedNPC, null);
  assert.equal(h.stored.dialogue.length, 0);
  assert.equal(h.stored.packs, null);
  assert.match(h.stored.lines[0], /answer from the cloud/);
  assert.equal(currentTheaterNarrative(h.stored.narrative).stage, 'opening');
});

test('retry of an already-closed question restores answer to terminal and releases the captured chapter', async () => {
  const h = await interviewRuntime({ lost: true });
  await h.ask();
  h.close();
  await h.resume();
  assert.equal(h.stored.ready, true);
  assert.equal(h.stored.charges, 1);
  assert.equal(h.bindings.selectedNPC, null);
  assert.match(h.stored.lines.at(-1), /answer from the cloud/);
  assert.equal(currentTheaterNarrative(h.stored.narrative).stage, 'opening');
});
