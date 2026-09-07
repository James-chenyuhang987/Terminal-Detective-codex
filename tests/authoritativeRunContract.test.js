import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { createPlayerRunClient } from '../src/game/playerRun.js';
import { Case_Data_Lvl_01, ReAct_Enum } from '../src/game/caseData.js';
import { buildTeamConfig, PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import { applyStaminaToTeam, canAgentInvestigate } from '../src/game/agentStamina.js';
import { generateObservationSections } from '../src/game/gameState.js';
import { successfulInterviewEvent, theaterNarrativeStage } from '../src/game/theaterNarrative.js';

// The sibling backend can be tested before integration without copying its files.
const backendURL = process.env.TD_AUTHORITY_TEST_ROOT
  ? pathToFileURL(resolve(process.env.TD_AUTHORITY_TEST_ROOT, 'server/gameAuthority/runAuthority.js'))
  : new URL('../server/gameAuthority/runAuthority.js', import.meta.url);
const authority = existsSync(backendURL) ? await import(backendURL.href) : null;
const source = ts.createSourceFile('runtime.jsx', readFileSync(new URL('../src/components/game/InvestigationTerminal.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
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
const skip = authority ? false : 'Backend reducer is integrated separately; set TD_AUTHORITY_TEST_ROOT to its worktree.';
const now = new Date('2026-09-07T00:00:00.000Z');

async function runtimeFixture({ lostQuestion = false, seedRun = () => {}, jointRound = false } = {}) {
  let run = authority.createRun({ id: 'ui-contract-run', caseData: Case_Data_Lvl_01, teamConfig: buildTeamConfig(), effects: { skill_effects: { auto_unlock_first: true } }, now });
  seedRun(run);
  const ledger = new Map();
  const storage = new Map();
  const calls = [];
  const stored = { errors: [], dialogue: [], packs: null, lines: [], ready: true };
  let sequence = 0;
  const client = createPlayerRunClient({
    runId: run.id, sessionId: 'fixture-device', createId: () => `intent-${++sequence}`,
    storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    invoke: async (_name, body) => {
      calls.push(body);
      if (body.action === 'status') return { data: { authority_version: 1, run: authority.publicRun(run) } };
      if (ledger.has(body.operation_id)) return ledger.get(body.operation_id);
      assert.equal(body.expected_revision, run.revision);
      const outcome = authority.applyRunCommand(run, body.command, now);
      run = outcome.run;
      const response = { data: { authority_version: 1, run: authority.publicRun(run), result: outcome.result } };
      ledger.set(body.operation_id, response);
      if (lostQuestion && body.command.type === 'question') throw new Error('Accepted answer lost');
      return response;
    },
  });
  const bindings = {
    useCallback: fn => fn, runClient: client, runViewRef: { current: { active: true, client } }, lang: 'en', t: {},
    commandInFlightRef: { current: false }, gameStateRef: { current: null }, bsodCountRef: { current: 0 },
    crisisPendingRef: { current: false }, finalizingRef: { current: false }, finalSettlementRef: { current: null },
    activeRunRef: { current: 0 }, abortCtrlRef: { current: null }, decisionResolveRef: { current: null },
    activeTerminalTurnRef: { current: 0 }, viewedTerminalTurnRef: { current: 0 },
    dialogueSequenceRef: { current: 1 }, closedDialogueRef: { current: 0 }, pendingQuestionPresentationRef: { current: null }, recoveryPresentationRef: { current: null },
    authorityReady: true, isProcessing: false, showBSoD: false, isLinkChecking: false, theaterMode: false, reportMode: false,
    caseData: Case_Data_Lvl_01, ReAct_Enum, settings: { cinematicsEnabled: false }, window: { matchMedia: () => ({ matches: true }) },
    generateObservationSections, streamTerminalText: async () => {}, streamInvestigationThought: async () => {},
    startStressTimer: () => {}, stopStressTimer: () => {}, shouldPlayActionCinematic: () => false,
    applyStaminaToTeam, canAgentInvestigate, successfulInterviewEvent, theaterNarrativeStage, dispatchNarrative: () => {},
    selectedNPC: null,
    schedule: () => {}, triggerSynergy: () => {}, notifyCommand: (_message, type) => { if (type === 'error') stored.errors.push(_message); },
    publicErrorMessage: error => error.message, runRecoveryMessage: error => error.message,
    addLine: (line, type) => { stored.lines.push(line); if (type === 'error') stored.errors.push(line); },
    setAuthorityReady: value => { stored.ready = value; }, setAuthorityLoading: () => {}, setAuthorityError: error => { stored.authorityError = error; },
    setNpcDialogue: value => { stored.dialogue = typeof value === 'function' ? value(stored.dialogue) : value; },
    setNpcQuestionPacks: value => { stored.packs = value; }, setNpcQuestionError: error => { if (error) stored.errors.push(error); },
    setReportError: error => { if (error) stored.errors.push(error); }, setCrisisError: error => { if (error) stored.errors.push(error); },
    setSelectedNPC: value => { bindings.selectedNPC = value; }, setNpcExecutorId: value => { bindings.npcExecutorId = value; },
    setGameState: state => { stored.state = state; },
    setServerRun: snapshot => { stored.run = snapshot; bindings.activeAgentStrategy = snapshot.agent_strategy; bindings.configuredAgentStrategy = snapshot.agent_strategy; },
    setCrisis: value => { bindings.crisis = value; }, setTruthFragments: value => { bindings.truthFragments = value; },
    setDecisionCards: packs => {
      if (packs) queueMicrotask(() => {
        const [executorAgentId, pack] = Object.entries(packs)[0];
        bindings.decisionResolveRef.current({ card: pack.cards[0], executorAgentId,
          ...(jointRound ? { assistAgentId: Object.keys(packs).find(id => id !== executorAgentId), commandIds: ['joint_action', 'tactical_preview'] } : {}),
        });
      });
    },
  };
  for (const name of ['LinkedPairs', 'NpcEmotionState', 'JudgeResult', 'ShowBSoD', 'CrisisPending', 'IsFinalizing', 'FinalJudgeResult', 'ShowGameOver', 'ActiveTerminalTurn', 'ViewedTerminalTurn', 'IsProcessing', 'ReactState', 'StreamingTerminal', 'DecisionStory', 'DecisionLog', 'AgentPath', 'ZoneFeedback', 'NewClueIds', 'IsLinkChecking', 'Cinematic', 'RedFlash']) {
    bindings[`set${name}`] = () => {};
  }
  for (const name of ['commitServerRun', 'executeRunCommand', 'beginAbortableOperation', 'isOperationCurrent']) bindings[name] = handler(name, bindings);
  bindings.commitServerRun((await client.resume()).run);
  return { bindings, stored, calls, client, cloud: () => run, perform: name => handler(name, bindings),
    resume: () => { bindings.recoveryPresentationRef.current = handler('presentRecoveredResponse', bindings); return handler('resumeRun', bindings)(); },
  };
}

test('real reducer accepts UI round, question, link, report and abandonment shapes through durable transport', { skip }, async () => {
  const h = await runtimeFixture();
  assert.deepEqual(h.stored.run.agent_strategy, h.cloud().team_config);
  assert.ok(h.stored.state.unlocked_clues.length > 0, 'server opening passive, not a UI free clue');
  await h.perform('runReActCycle')();
  assert.deepEqual(h.stored.errors, []);
  assert.equal(h.stored.state.turn_count, 1);
  const roundCommand = h.calls.find(body => body.command?.type === 'round').command;
  assert.equal(Object.hasOwn(roundCommand, 'assist_agent_id'), false);
  assert.equal(Object.hasOwn(roundCommand, 'state'), false);
  const npc = Case_Data_Lvl_01.npcs[0];
  await h.perform('handleNPCTalk')(npc);
  const [executorId, pack] = Object.entries(h.stored.packs).find(([, value]) => value.questions.length);
  h.bindings.npcExecutorId = executorId;
  await h.perform('handleNPCQuestion')(pack.questions[0]);
  assert.deepEqual(h.stored.errors, []);
  assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 1);
  assert.deepEqual(h.stored.packs, h.cloud().interrogation_options[npc.npc_id].packs);
  const priorities = PRIORITY_ACTIONS.map(action => action.id).reverse();
  await h.perform('handleRunIntent')({ type: 'priority', priority_list: priorities });
  assert.deepEqual(h.stored.run.agent_strategy.priority_list, priorities);
  if (h.stored.state.unlocked_clues.length >= 2) {
    const linkedIds = h.stored.state.unlocked_clues.slice(0, 2);
    await h.perform('handleLink')(...linkedIds);
    assert.deepEqual(h.cloud().attempted_link_keys, [[...linkedIds].sort().join(':')]);
    assert.deepEqual(h.stored.state, authority.publicRun(h.cloud()).state);
    assert.equal(h.stored.authorityError, undefined);
    assert.ok(h.stored.errors.length <= 1, 'an invalid link is a confirmed gameplay outcome');
    h.stored.errors.length = 0;
  }
  const { result: options } = await h.bindings.executeRunCommand({ type: 'report_options' });
  h.bindings.structuredReport = {
    conclusionId: options.conclusions[0].id, methodId: options.methods[0].id,
    motiveId: options.motives[0].id, timelineId: options.timelines[0].id,
    evidenceIds: h.stored.state.unlocked_clues.slice(0, 1),
  };
  assert.equal(h.bindings.structuredReport.evidenceIds.length, 1);
  await h.perform('handleSubmitReport')();
  assert.deepEqual(h.stored.errors, []);
  assert.ok(h.stored.run.judge_result);
  if (h.cloud().status === 'active') await h.perform('handleRunIntent')({ type: 'abandon' });
  assert.ok(['completed', 'failed', 'abandoned'].includes(h.cloud().status));
  assert.equal(h.client.hasPending(), false);
  assert.deepEqual(h.stored.state, authority.publicRun(h.cloud()).state);
  const summary = authority.deriveRunSummary(h.cloud());
  assert.ok(Number.isFinite(summary.xp_breakdown.total));
  assert.ok(h.calls.filter(body => body.command).every(body => !Object.hasOwn(body.command, 'xp_gain') && !Object.hasOwn(body.command, 'summary')));
});

test('real reducer accepts joint-action costs and only cloud outcomes for crisis, crash recovery and end', { skip }, async () => {
  const joint = await runtimeFixture({ jointRound: true });
  const initialPoints = joint.cloud().state.command_state.points;
  await joint.perform('runReActCycle')();
  assert.deepEqual(joint.stored.errors, []);
  assert.equal(joint.stored.state.command_state.spent_points, 2);
  assert.equal(joint.stored.state.command_state.points, initialPoints - 2);
  const action = joint.calls.find(body => body.command?.type === 'round').command;
  assert.ok(action.assist_agent_id);
  assert.deepEqual(action.command_ids, ['joint_action', 'tactical_preview']);

  const crisis = await runtimeFixture({ seedRun: run => {
    run.pending_crisis = { type: 'evidence', payload: { clue_id: run.state.unlocked_clues[0] }, choices: [{ id: 'defer', ap_cost: 0 }] };
  } });
  await crisis.perform('handleCrisisChoice')('defer');
  assert.deepEqual(crisis.stored.errors, []);
  assert.equal(crisis.stored.run.pending_crisis, null);
  assert.ok(crisis.stored.state.evidence_crisis);
  assert.deepEqual(crisis.stored.state, authority.publicRun(crisis.cloud()).state);

  const stabilize = await runtimeFixture({ seedRun: run => { run.state.confusion_score = 30; } });
  await stabilize.perform('handleRunIntent')({ type: 'command', command_id: 'emergency_stabilize' });
  assert.deepEqual(stabilize.stored.errors, []);
  assert.ok(stabilize.stored.state.confusion_score < 30);
  assert.equal(stabilize.stored.state.command_state.emergency_stabilize_used, true);
  await stabilize.perform('handleRunIntent')({ type: 'rest' });
  assert.equal(stabilize.stored.state.turn_count, 1);
  assert.deepEqual(stabilize.stored.state, authority.publicRun(stabilize.cloud()).state);

  const crashed = await runtimeFixture({ seedRun: run => {
    run.bsod_count = 1;
    run.state.is_crashed = true;
    run.state.confusion_score = 100;
  } });
  const apBefore = crashed.cloud().state.action_points_left;
  await crashed.perform('handleRunIntent')({ type: 'recover' });
  assert.deepEqual(crashed.stored.errors, []);
  assert.equal(crashed.stored.state.is_crashed, false);
  assert.equal(crashed.stored.state.confusion_score, 0);
  assert.equal(crashed.stored.state.action_points_left, apBefore - 5);
  assert.equal(crashed.stored.run.bsod_count, 1);
  await crashed.perform('handleRunIntent')({ type: 'abandon' });
  assert.equal(crashed.stored.run.status, 'abandoned');
  assert.equal(crashed.bindings.finalizingRef.current, true);
  assert.equal(authority.deriveRunSummary(crashed.cloud()).is_passed, false);
});

test('lost real reducer question response replays its answer and options without another stamina debit', { skip }, async () => {
  const h = await runtimeFixture({ lostQuestion: true });
  const npc = Case_Data_Lvl_01.npcs[0];
  await h.perform('handleNPCTalk')(npc);
  const [executorId, pack] = Object.entries(h.stored.packs).find(([, value]) => value.questions.length);
  h.bindings.npcExecutorId = executorId;
  await h.perform('handleNPCQuestion')(pack.questions[0]);
  const chargedStamina = h.cloud().state.agent_stamina[executorId];
  assert.equal(h.stored.ready, false);
  assert.equal(h.client.hasPending(), true);
  await h.resume();
  assert.equal(h.stored.ready, true);
  assert.equal(h.client.hasPending(), false);
  assert.equal(h.stored.state.agent_stamina[executorId], chargedStamina);
  assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 1);
  assert.deepEqual(h.stored.packs, h.cloud().interrogation_options[npc.npc_id].packs);
  const requests = h.calls.filter(body => body.command?.type === 'question');
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[0], requests[1]);
});
