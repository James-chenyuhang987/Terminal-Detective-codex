import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { selectAutomaticInvestigationCard, reportEvidenceIds, REPORT_DIMENSIONS } from '../src/game/investigationChoices.js';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { createPlayerRunClient } from '../src/game/playerRun.js';
import { memoryLocks } from './runClientFixtures.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';
import { Case_Data_Lvl_01, ReAct_Enum } from '../src/game/caseData.js';
import { buildTeamConfig, PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import { applyStaminaToTeam, canAgentInvestigate } from '../src/game/agentStamina.js';
import { generateObservationSections } from '../src/game/gameState.js';
import { successfulInterviewEvent, theaterNarrativeStage } from '../src/game/theaterNarrative.js';
import { getRejectedReportPenalty } from '../src/game/caseEvaluation.js';
import { defaultReportDraft, sanitizeReportDraft } from '../src/game/reportDraft.js';
import { getTerminalTurns } from '../src/game/turnArchive.js';

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
function reportOptionsEffect(bindings) {
  let callback;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText() === 'useEffect'
      && node.arguments[0]?.getText().includes("type: 'report_options'")) callback = node.arguments[0];
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(callback, 'The report-loading effect must exist in the real component.');
  const { outputText } = ts.transpileModule(`const effect = (${callback.getText()});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } });
  return compileFunction(`${outputText}\nreturn effect;`, Object.keys(bindings))(...Object.values(bindings));
}
const skip = authority ? false : 'Backend reducer is integrated separately; set TD_AUTHORITY_TEST_ROOT to its worktree.';
const now = new Date('2026-09-07T00:00:00.000Z');

async function runtimeFixture({ lostQuestion = false, incompleteQuestion = false, lostLink = false, lostReport = false, lostReportOptions = false,
  advanceAfterReportOptions = false, delayReportOptions = false, seedRun = () => {}, jointRound = false, investigationVersion = 1 } = {}) {
  let run = authority.createRun({ id: 'ui-contract-run', caseData: Case_Data_Lvl_01, teamConfig: buildTeamConfig(), effects: { skill_effects: { auto_unlock_first: true } }, now, investigationVersion });
  seedRun(run);
  const ledger = new Map();
  const storage = new Map();
  const calls = [];
  const reportOptionReleases = [];
  const stored = { errors: [], dialogue: [], packs: null, lines: [], lineRecords: [], ready: true, reportOptions: null,
    activeTerminalTurn: 0, viewedTerminalTurn: 0 };
  let sequence = 0;
  let activeSession = 'fixture-device';
  const clientOptions = {
    ownerUid: 'fixture-owner', runId: run.id, sessionId: activeSession, locks: memoryLocks(), createId: () => `intent-${++sequence}`,
    storage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    invoke: async (_name, body) => {
      calls.push(body);
      if (body.session_id !== activeSession) throw Object.assign(new Error('Session taken'), { code: 'SESSION_TAKEN' });
      if (body.action === 'status') return { data: { authority_version: 1, run: authority.publicRun(run) } };
      if (ledger.has(body.operation_id)) {
        // Production replays the original result with the latest saved run,
        // which may have advanced in another tab before this receipt arrives.
        const receipt = ledger.get(body.operation_id);
        return { data: { ...receipt.data, run: authority.publicRun(run) } };
      }
      assert.equal(body.expected_revision, run.revision);
      const outcome = authority.applyRunCommand(run, body.command, now);
      run = outcome.run;
      const response = { data: { authority_version: 1, run: authority.publicRun(run), result: outcome.result } };
      ledger.set(body.operation_id, response);
      if (lostQuestion && body.command.type === 'question') throw new Error('Accepted answer lost');
      if (lostLink && body.command.type === 'link') throw new Error('Accepted link reply lost');
      if (incompleteQuestion && body.command.type === 'question') return { data: { authority_version: 1, run: response.data.run } };
      if (lostReport && body.command.type === 'report') throw new Error('Accepted report reply lost');
      if (lostReportOptions && body.command.type === 'report_options') throw new Error('Accepted report options reply lost');
      if (delayReportOptions && body.command.type === 'report_options') await new Promise(resolve => reportOptionReleases.push(resolve));
      if (advanceAfterReportOptions && body.command.type === 'report_options') {
        const choices = insufficientReportSelection(run);
        run = authority.applyRunCommand(run, { type: 'report', ...reportCommandFromSelection(choices) }, now).run;
        run = authority.applyRunCommand(run, { type: 'rest' }, now).run;
        return { data: { ...response.data, run: authority.publicRun(run) } };
      }
      return response;
    },
  };
  const client = createPlayerRunClient(clientOptions);
  const bindings = {
    dialogueLanguageRef: { current: 'en' }, reportOptionsRequestRef: { current: null }, clearReportDraft: () => {},
    investigationV2: investigationVersion === 2, investigation: null, selectAutomaticInvestigationCard, reportEvidenceIds, REPORT_DIMENSIONS, sanitizeReportDraft,
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
    addLine: (line, type) => { stored.lines.push(line); stored.lineRecords.push({ text: line, turn: bindings.activeTerminalTurnRef.current }); if (type === 'error') stored.errors.push(line); },
    setAuthorityReady: value => { stored.ready = value; }, setAuthorityLoading: () => {}, setAuthorityError: error => { stored.authorityError = error; },
    setNpcDialogue: value => { stored.dialogue = typeof value === 'function' ? value(stored.dialogue) : value; },
    setNpcQuestionPacks: value => { stored.packs = value; }, setNpcQuestionError: error => { if (error) stored.errors.push(error); },
    setReportError: error => { if (error) stored.errors.push(error); }, setCrisisError: error => { if (error) stored.errors.push(error); },
    setReportOptions: value => { stored.reportOptions = typeof value === 'function' ? value(stored.reportOptions) : value; },
    setStructuredReport: value => { bindings.structuredReport = typeof value === 'function' ? value(bindings.structuredReport || defaultReportDraft()) : value; },
    setLinkWorkspace: value => { stored.linkWorkspace = typeof value === 'function'
      ? value(stored.linkWorkspace || { client, draft: { relation: 'supports', firstClue: '', secondClue: '' }, feedback: null }) : value; },
    setFieldTargetId: () => {}, handleNPCDialogueClose: () => {},
    setSelectedNPC: value => { bindings.selectedNPC = value; }, setNpcExecutorId: value => { bindings.npcExecutorId = value; },
    setGameState: state => { stored.state = state; },
    setServerRun: snapshot => { stored.run = snapshot; bindings.investigation = snapshot.investigation;
      bindings.activeAgentStrategy = snapshot.agent_strategy; bindings.configuredAgentStrategy = snapshot.agent_strategy; },
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
  for (const name of ['LinkedPairs', 'NpcEmotionState', 'JudgeResult', 'ShowBSoD', 'CrisisPending', 'IsFinalizing', 'FinalJudgeResult', 'ShowGameOver', 'IsProcessing', 'ReactState', 'StreamingTerminal', 'DecisionStory', 'DecisionLog', 'AgentPath', 'ZoneFeedback', 'NewClueIds', 'IsLinkChecking', 'Cinematic', 'RedFlash']) {
    bindings[`set${name}`] = () => {};
  }
  bindings.setActiveTerminalTurn = value => { stored.activeTerminalTurn = value; };
  bindings.setViewedTerminalTurn = value => { stored.viewedTerminalTurn = value; };
  for (const name of ['reportOptionsFromResponse', 'commitServerRun', 'executeRunCommand', 'beginAbortableOperation', 'isOperationCurrent']) bindings[name] = handler(name, bindings);
  bindings.commitServerRun((await client.resume()).run);
  return { bindings, stored, calls, client, cloud: () => run, perform: name => handler(name, bindings),
    releaseReportOptions: () => { assert.ok(reportOptionReleases.length, 'A report options response must be pending.'); reportOptionReleases.shift()(); },
    advance: command => { const outcome = authority.applyRunCommand(run, command, now); run = outcome.run; return outcome; },
    reload: () => {
      activeSession = 'newly-claimed-device';
      bindings.runClient = createPlayerRunClient({ ...clientOptions, sessionId: activeSession });
      bindings.runViewRef.current = { active: true, client: bindings.runClient };
      bindings.executeRunCommand = handler('executeRunCommand', bindings);
      bindings.pendingQuestionPresentationRef.current = null;
      bindings.selectedNPC = null;
      stored.dialogue = [];
    },
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

test('v2 crisis recheck directs a remote NPC visit without issuing an invalid dialogue offer', { skip }, async () => {
  const h = await runtimeFixture({ investigationVersion: 2, seedRun: run => {
    run.pending_crisis = { type: 'npc_recant', payload: { npc_id: 'npc_02', npc_name: 'Mei Lin' }, choices: [{ id: 'reinterrogate', ap_cost: 0 }] };
  } });
  h.bindings.investigation = h.stored.run.investigation;
  const notices = [];
  const reopened = [];
  h.bindings.notifyCommand = message => notices.push(message);
  h.bindings.handleNPCTalk = async npc => reopened.push(npc.npc_id);
  await h.perform('handleCrisisChoice')('reinterrogate');
  assert.equal(h.stored.run.pending_crisis, null);
  assert.equal(h.cloud().state.action_points_left, 20);
  assert.deepEqual(reopened, []);
  assert.equal(notices.length, 1);
  assert.match(notices[0], /Visit .* to check/);
  assert.equal(h.calls.filter(body => body.command?.type === 'interrogation_options').length, 0);
  assert.deepEqual(h.stored.errors, []);
});

for (const incompleteQuestion of [false, true]) {
  test(`${incompleteQuestion ? 'incomplete' : 'lost'} real reducer question response replays its answer and options without another stamina debit`, { skip }, async () => {
    for (const reload of [false, true]) {
      const h = await runtimeFixture({ lostQuestion: !incompleteQuestion, incompleteQuestion });
      const npc = Case_Data_Lvl_01.npcs[0];
      await h.perform('handleNPCTalk')(npc);
      const [executorId, pack] = Object.entries(h.stored.packs).find(([, value]) => value.questions.length);
      h.bindings.npcExecutorId = executorId;
      const previousStamina = h.cloud().state.agent_stamina[executorId];
      await h.perform('handleNPCQuestion')(pack.questions[0]);
      const chargedStamina = h.cloud().state.agent_stamina[executorId];
      assert.ok(chargedStamina < previousStamina);
      assert.equal(h.stored.ready, false);
      assert.equal(h.client.hasPending(), true);
      assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 0);
      if (incompleteQuestion) assert.equal(h.stored.authorityError.code, 'INVALID_RUN_RESPONSE');
      if (reload) h.reload();
      await h.resume();
      assert.equal(h.stored.ready, true);
      assert.equal(h.client.hasPending(), false);
      assert.equal(h.stored.state.agent_stamina[executorId], chargedStamina);
      assert.equal(h.stored.dialogue.filter(line => line.role === 'npc').length, 1);
      assert.deepEqual(h.stored.packs, h.cloud().interrogation_options[npc.npc_id].packs);
      const requests = h.calls.filter(body => body.command?.type === 'question');
      assert.equal(requests.length, 2);
      assert.deepEqual(requests[1], { ...requests[0], session_id: reload ? 'newly-claimed-device' : 'fixture-device' });
    }
  });
}


test('V2 field callbacks preserve authority, explicit methods and report evidence dimensions', { skip }, async () => {
  const h = await runtimeFixture({ investigationVersion: 2 });
  const content = getInvestigationContent('Lvl_01');
  const target = content.targets.find(item => item.zone_id === h.cloud().state.current_zone);
  const before = h.cloud().state.action_points_left;
  const offers = await h.perform('handleFieldCommand')({ type: 'inspect_options', target_id: target.target_id });
  assert.equal(h.cloud().state.action_points_left, before, 'Reading options is free');
  const card = Object.values(offers.result.packs)[0].cards.find(item => item.method_id === target.method_id);
  await h.perform('handleFieldCommand')({ type: 'inspect', option_id: card.option_id });
  assert.ok(h.cloud().state.unlocked_clues.includes(target.clue_id));
  assert.equal(h.cloud().state.action_points_left, before - card.ap_cost);
  const review = await h.perform('handleFieldCommand')({ type: 'inspect_options', target_id: target.target_id });
  const same = Object.values(review.result.packs)[0].cards.find(item => item.method_id === target.method_id);
  await h.perform('handleFieldCommand')({ type: 'inspect', option_id: same.option_id });
  assert.equal(h.cloud().state.turn_count, 1, 'Review cannot replay the paid action');
  let dialogueCloseCount = 0;
  h.bindings.handleNPCDialogueClose = () => { dialogueCloseCount += 1; };
  await h.perform('handleFieldCommand')({ type: 'travel', zone_id: 'zone_balcony' });
  assert.equal(h.cloud().state.current_zone, 'zone_balcony');
  assert.equal(h.cloud().state.turn_count, 1);
  assert.equal(h.cloud().state.action_points_left, before - card.ap_cost);
  assert.equal(dialogueCloseCount, 0, 'A travel must not abort its own committed operation by closing an absent dialogue');
  assert.equal(h.bindings.abortCtrlRef.current, null);
  h.bindings.structuredReport = {
    conclusionId: Array.isArray(content.report.answers.conclusion_id) ? content.report.answers.conclusion_id[0] : content.report.answers.conclusion_id,
    methodId: [content.report.answers.method_id].flat()[0], motiveId: [content.report.answers.motive_id].flat()[0], timelineId: [content.report.answers.timeline_id].flat()[0],
    evidenceByDimension: Object.fromEntries(REPORT_DIMENSIONS.map(key => [key, [target.clue_id]])), evidenceIds: [target.clue_id],
  };
  await h.perform('handleSubmitReport')();
  const sent = h.calls.find(call => call.command?.type === 'report').command;
  assert.deepEqual(sent.evidence_by_dimension, h.bindings.structuredReport.evidenceByDimension);
  assert.equal(h.cloud().status, 'active', 'Insufficient evidence leaves the investigation open');
});

test('V2 testimony advance refreshes its stage-bound offers instead of adopting an empty pack', { skip }, async () => {
  const h = await runtimeFixture({ investigationVersion: 2 });
  const content = getInvestigationContent('Lvl_01');
  const npcId = Object.keys(content.npc_zones)[0];
  // Seed a paid public room for this UI callback regression; routing is tested by the authority suite.
  h.cloud().state.current_zone = content.npc_zones[npcId];
  h.cloud().state.visited_zones.push(content.npc_zones[npcId]);
  h.cloud().state.unlocked_clues = content.testimonies[npcId][0].required_clues;
  h.bindings.commitServerRun(authority.publicRun(h.cloud()));
  await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
  const executor = h.bindings.npcExecutorId;
  const question = h.stored.packs[executor].questions.find(item => item.tone === 'evidence');
  await h.perform('handleNPCQuestion')(question);
  assert.equal(h.cloud().investigation.testimony_stages[npcId], 1);
  assert.ok(h.stored.packs[executor].questions.every(item => item.topicId === 'testimony:1'));
  assert.equal(h.calls.filter(call => call.command?.type === 'interrogation_options').length, 2);
});

test('actual dialogue callbacks select and execute the discounted low-stamina authority offer', { skip }, async () => {
  const content = getInvestigationContent('Lvl_01');
  const npcId = 'npc_02';
  const h = await runtimeFixture({ investigationVersion: 2, seedRun: run => {
    run.team_config.skill_effects = { interrogation_bonus: .3 };
    run.state.current_zone = content.npc_zones[npcId];
    run.state.unlocked_clues = content.testimonies[npcId][0].required_clues;
    run.next_crisis_turn = 99;
    run.team_config.team.forEach(agent => { run.state.agent_stamina[agent.agent_id] = 2; });
  } });
  await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
  assert.deepEqual(h.stored.errors, []);
  const executor = h.bindings.npcExecutorId;
  const question = h.stored.packs[executor].questions.find(item => item.tone === 'evidence');
  assert.equal(question.stamina_cost, 6);
  assert.equal(question.available, true);
  await h.perform('handleNPCQuestion')(question);
  assert.deepEqual(h.stored.errors, []);
  assert.equal(h.cloud().investigation.testimony_stages[npcId], 1);
  assert.equal(h.cloud().state.agent_stamina[executor], 0);
  assert.equal(h.cloud().investigation.skill_usage.interview_stamina, 1);
  assert.equal(h.calls.filter(call => call.command?.type === 'question').length, 1);
});

test('lost strategy replies restore the recorded account and charge its action only once', { skip }, async () => {
  const content = getInvestigationContent('Lvl_01');
  const npcId = 'npc_02';
  for (const tone of ['gentle', 'firm']) {
    const h = await runtimeFixture({ investigationVersion: 2, lostQuestion: true, seedRun: run => {
      run.state.current_zone = content.npc_zones[npcId];
      run.next_crisis_turn = 99;
    } });
    await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
    const question = h.stored.packs[h.bindings.npcExecutorId].questions.find(item => item.tone === tone);
    const ap = h.cloud().state.action_points_left;
    const turns = h.cloud().state.turn_count;
    await h.perform('handleNPCQuestion')(question);
    const saved = structuredClone(h.cloud().state);
    h.reload();
    await h.resume();
    assert.deepEqual(h.cloud().state, saved);
    assert.equal(h.cloud().state.action_points_left, ap - (tone === 'firm' ? 1 : 0));
    assert.equal(h.cloud().state.turn_count, turns + (tone === 'firm' ? 1 : 0));
    assert.equal(h.cloud().investigation.interview_records[npcId].length, 1);
    assert.deepEqual(h.stored.run.investigation.interview_records, h.cloud().investigation.interview_records);
    const sent = h.calls.filter(call => call.command?.type === 'question');
    assert.equal(new Set(sent.map(call => call.operation_id)).size, 1);
    await h.resume();
    assert.deepEqual(h.cloud().state, saved);
  }
});

test('question turn archive follows actual paid v2 turns and recovery while v1 and completed-testimony reviews keep their turn', { skip }, async () => {
  const content = getInvestigationContent('Lvl_01');
  const npcId = 'npc_02';
  for (const scenario of [
    { investigationVersion: 2, stage: 0, lostQuestion: false, expectedTurn: 8 },
    { investigationVersion: 2, stage: 0, lostQuestion: true, expectedTurn: 8 },
    { investigationVersion: 2, stage: 2, lostQuestion: false, expectedTurn: 7 },
    { investigationVersion: 1, stage: 0, lostQuestion: false, expectedTurn: 7 },
  ]) {
    const h = await runtimeFixture({ ...scenario, seedRun: run => {
      run.state.turn_count = 7;
      run.state.action_points_left = 13;
      run.state.current_zone = content.npc_zones[npcId];
      run.state.visited_zones.push(content.npc_zones[npcId]);
      run.state.unlocked_clues = run.case_data.clue_dictionary.map(clue => clue.clue_id);
      run.next_crisis_turn = scenario.expectedTurn === 8 ? 8 : 99;
      if (scenario.stage === 2) {
        run.investigation.testimony_stages[npcId] = 2;
        run.investigation.testimony_records[npcId] = content.testimonies[npcId].map((record, index) => ({
          stage: index + 1, response: record.response, evidence_ids: record.required_clues,
        }));
      }
    } });
    h.bindings.activeTerminalTurnRef.current = 7;
    h.bindings.viewedTerminalTurnRef.current = 7;
    h.bindings.setActiveTerminalTurn(7);
    h.bindings.setViewedTerminalTurn(7);
    await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
    assert.equal(h.stored.activeTerminalTurn, 7, 'Reading dialogue options never advances the archive.');
    const executor = h.bindings.npcExecutorId;
    const question = scenario.investigationVersion === 2
      ? h.stored.packs[executor].questions.find(item => item.tone === 'evidence')
      : h.stored.packs[executor].questions[0];
    // Closing before delivery routes the confirmed answer into the terminal.
    h.bindings.closedDialogueRef.current = h.bindings.dialogueSequenceRef.current;
    await h.perform('handleNPCQuestion')(question);
    if (scenario.lostQuestion) {
      assert.equal(h.stored.activeTerminalTurn, 7, 'A lost response cannot guess that the server advanced a turn.');
      await h.resume();
    }
    assert.equal(h.cloud().state.turn_count, scenario.expectedTurn);
    assert.equal(h.stored.activeTerminalTurn, scenario.expectedTurn);
    assert.equal(h.stored.viewedTerminalTurn, scenario.expectedTurn);
    assert.equal(h.bindings.activeTerminalTurnRef.current, scenario.expectedTurn);
    assert.ok(getTerminalTurns(h.stored.lineRecords, h.stored.activeTerminalTurn).includes(scenario.expectedTurn));
    assert.equal(h.stored.lineRecords.at(-1).turn, scenario.expectedTurn, 'The delivered answer belongs to its authoritative turn.');
    assert.equal(h.cloud().state.action_points_left, scenario.expectedTurn === 8 ? 12 : 13);
    if (scenario.expectedTurn === 8) assert.ok(h.stored.run.pending_crisis);
  }
});

test('open dialogue archives each confirmed answer on its paid turn so earlier question pages remain available', { skip }, async () => {
  const content = getInvestigationContent('Lvl_01');
  const npcId = 'npc_02';
  const h = await runtimeFixture({ investigationVersion: 2, seedRun: run => {
    run.state.turn_count = 7;
    run.state.current_zone = content.npc_zones[npcId];
    run.state.visited_zones.push(content.npc_zones[npcId]);
    run.state.unlocked_clues = run.case_data.clue_dictionary.map(clue => clue.clue_id);
    run.next_crisis_turn = 99;
  } });
  await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
  for (const turn of [8, 9]) {
    const question = h.stored.packs[h.bindings.npcExecutorId].questions.find(item => item.tone === 'evidence');
    await h.perform('handleNPCQuestion')(question);
    assert.equal(h.stored.activeTerminalTurn, turn);
    const answer = h.stored.dialogue.filter(line => line.role === 'npc').at(-1);
    assert.ok(answer?.text);
    const records = h.stored.lineRecords.filter(line => line.turn === turn);
    assert.equal(records.length, 1, 'An open dialogue still records its confirmed public answer once.');
    assert.ok(records[0].text.includes(answer.text));
  }
  assert.deepEqual(getTerminalTurns(h.stored.lineRecords, h.stored.activeTerminalTurn), [0, 8, 9]);
  assert.equal(h.cloud().state.action_points_left, 18);
  assert.deepEqual(h.stored.errors, []);
});

test('a recovered answer with its dialogue still open is archived once and a later status refresh cannot duplicate it', { skip }, async () => {
  for (const reload of [false, true]) {
    const content = getInvestigationContent('Lvl_01');
    const npcId = 'npc_02';
    const h = await runtimeFixture({ investigationVersion: 2, lostQuestion: true, seedRun: run => {
      run.state.turn_count = 7;
      run.state.current_zone = content.npc_zones[npcId];
      run.state.visited_zones.push(content.npc_zones[npcId]);
      run.state.unlocked_clues = run.case_data.clue_dictionary.map(clue => clue.clue_id);
      run.next_crisis_turn = 99;
    } });
    await h.perform('handleNPCTalk')(Case_Data_Lvl_01.npcs.find(npc => npc.npc_id === npcId));
    const question = h.stored.packs[h.bindings.npcExecutorId].questions.find(item => item.tone === 'evidence');
    await h.perform('handleNPCQuestion')(question);
    assert.equal(h.stored.lineRecords.length, 0, 'An unknown response does not fabricate a saved answer.');
    if (reload) h.reload();
    await h.resume();
    assert.equal(h.stored.lineRecords.length, 1);
    assert.equal(h.stored.lineRecords[0].turn, 8);
    assert.ok(h.stored.lineRecords[0].text.includes(h.stored.dialogue.filter(line => line.role === 'npc').at(-1).text));
    await h.resume();
    assert.equal(h.stored.lineRecords.length, 1);
    assert.equal(h.cloud().state.turn_count, 8);
    assert.equal(h.cloud().state.action_points_left, 19);
  }
});

function evidenceCorrectionFixture(lostReport = false, options = {}) {
  return runtimeFixture({ investigationVersion: 2, lostReport, ...options, seedRun: run => {
    // The reducer owns these known clues; this contract isolates the report UI
    // from route traversal, which the authority playthrough suite verifies.
    run.state.unlocked_clues = run.case_data.clue_dictionary.map(clue => clue.clue_id);
    run.state.action_points_left = 7;
    run.next_crisis_turn = 99;
  } });
}

function insufficientReportSelection(run) {
  const answers = getInvestigationContent('Lvl_01').report.answers;
  const clue = run.state.unlocked_clues[0];
  return {
    conclusionId: [answers.conclusion_id].flat()[0], methodId: [answers.method_id].flat()[0],
    motiveId: [answers.motive_id].flat()[0], timelineId: [answers.timeline_id].flat()[0],
    evidenceByDimension: Object.fromEntries(REPORT_DIMENSIONS.map(key => [key, [clue]])), evidenceIds: [clue],
  };
}

function reportCommandFromSelection(selection) {
  return { conclusion_id: selection.conclusionId, method_id: selection.methodId,
    motive_id: selection.motiveId, timeline_id: selection.timelineId,
    evidence_by_dimension: selection.evidenceByDimension, evidence_ids: selection.evidenceIds };
}

async function openInsufficientReport(h) {
  const options = (await h.bindings.executeRunCommand({ type: 'report_options' })).result;
  h.bindings.setReportOptions(options);
  h.bindings.structuredReport = insufficientReportSelection(h.cloud());
  return options;
}

test('normal evidence correction refreshes loaded report policy and AP-dependent penalties without another offer or revision', { skip }, async () => {
  const h = await evidenceCorrectionFixture();
  assert.equal(h.stored.reportOptions, null, 'Public policy alone cannot fabricate unopened report choices.');
  const options = await openInsufficientReport(h);
  assert.equal(options.report_policy.evidence_correction_available, true);
  const revision = h.cloud().revision;
  await h.perform('handleSubmitReport')();
  assert.equal(h.cloud().revision, revision + 1);
  assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, false);
  assert.deepEqual(h.stored.reportOptions.report_policy.evidence_rejection_penalty, { apLoss: 1, reputationLoss: 8, confusionIncrease: 4 });
  assert.equal(h.stored.state.action_points_left, 7, 'Only the attachment correction allowance was consumed.');
  assert.strictEqual(h.stored.reportOptions.conclusions, options.conclusions);
  assert.strictEqual(h.stored.reportOptions.availableEvidence, options.availableEvidence);
  assert.strictEqual(h.stored.reportOptions.dimension_guidance, options.dimension_guidance);
  await h.perform('handleSubmitReport')();
  assert.equal(h.cloud().revision, revision + 2);
  assert.equal(h.stored.state.action_points_left, 6);
  assert.deepEqual(h.stored.reportOptions.report_policy.conclusion_rejection_penalty, getRejectedReportPenalty(h.stored.state));
  assert.equal(h.stored.reportOptions.report_policy.conclusion_rejection_penalty.apLoss, 1);
  assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 1);
  assert.deepEqual(h.stored.errors, []);
});

test('lost report recovery and later AP changes refresh the current policy without repeating correction or reading offers again', { skip }, async () => {
  for (const reload of [false, true]) {
    const h = await evidenceCorrectionFixture(true);
    const options = await openInsufficientReport(h);
    const revision = h.cloud().revision;
    await h.perform('handleSubmitReport')();
    assert.equal(h.stored.ready, false);
    assert.equal(h.client.hasPending(), true);
    assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, true, 'Unknown replies do not guess at an allowance.');
    assert.equal(h.cloud().investigation.evidence_correction_used, true);
    if (reload) h.reload();
    await h.resume();
    assert.equal(h.stored.ready, true);
    assert.equal(h.client.hasPending(), false);
    assert.equal(h.cloud().revision, revision + 1, 'Receipt replay cannot apply the free correction twice.');
    assert.equal(h.stored.state.action_points_left, 7);
    assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, false);
    assert.strictEqual(h.stored.reportOptions.conclusions, options.conclusions);
    assert.equal(h.stored.reportOptions.report_policy.conclusion_rejection_penalty.apLoss, 2);
    await h.perform('handleRunIntent')({ type: 'rest' });
    assert.equal(h.stored.state.action_points_left, 6);
    assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, false);
    assert.equal(h.stored.reportOptions.report_policy.conclusion_rejection_penalty.apLoss, 1);
    assert.deepEqual(h.stored.reportOptions.report_policy, authority.publicRun(h.cloud()).investigation.report_policy);
    const requests = h.calls.filter(body => body.command?.type === 'report');
    assert.equal(requests.length, 2);
    assert.deepEqual(requests[1], { ...requests[0], session_id: reload ? 'newly-claimed-device' : 'fixture-device' });
    assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 1);
  }
});

test('committing v1 and unmarked v2 runs preserves their loaded report choices and historical policy behavior', { skip }, async () => {
  for (const investigationVersion of [1, 2]) {
    const h = await runtimeFixture({ investigationVersion, seedRun: run => {
      if (investigationVersion === 2) {
        delete run.investigation.balance_revision;
        delete run.investigation.evidence_correction_used;
      }
      run.next_crisis_turn = 99;
    } });
    const response = await h.bindings.executeRunCommand({ type: 'report_options' });
    const options = response.result;
    assert.strictEqual(h.bindings.reportOptionsFromResponse(response), options, 'Legacy offers are returned unchanged.');
    h.bindings.setReportOptions(options);
    assert.equal(options.report_policy, undefined);
    await h.perform('handleRunIntent')({ type: 'rest' });
    assert.strictEqual(h.stored.reportOptions, options);
    assert.equal(h.stored.reportOptions.report_policy, undefined);
    assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 1);
    assert.deepEqual(h.stored.errors, []);
  }
});

test('normal report-loading effect adopts the latest run policy instead of its older cached offer policy', { skip }, async () => {
  const h = await evidenceCorrectionFixture(false, { advanceAfterReportOptions: true });
  const cleanup = reportOptionsEffect({ ...h.bindings,
    reportMode: true, authorityReady: true, authorityLoading: false, isFinalizing: false,
  })();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.cloud().investigation.evidence_correction_used, true);
  assert.equal(h.stored.state.action_points_left, 6);
  assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, false);
  assert.equal(h.stored.reportOptions.report_policy.conclusion_rejection_penalty.apLoss, 1);
  assert.deepEqual(h.stored.reportOptions.report_policy, authority.publicRun(h.cloud()).investigation.report_policy);
  assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 1);
  assert.equal(h.cloud().revision, 3, 'Only the offer plus the other tab’s report and rest advance the revision.');
  assert.deepEqual(h.stored.errors, []);
  cleanup();
});

test('a replayed lost report-options reply keeps current policy after another tab consumes its allowance and AP', { skip }, async () => {
  for (const reload of [false, true]) {
    const h = await evidenceCorrectionFixture(false, { lostReportOptions: true });
    h.bindings.reportMode = true;
    await assert.rejects(h.bindings.executeRunCommand({ type: 'report_options' }), /reply lost/);
    assert.equal(h.client.hasPending(), true);
    assert.equal(h.stored.reportOptions, null);
    const selection = insufficientReportSelection(h.cloud());
    h.advance({ type: 'report', ...reportCommandFromSelection(selection) });
    h.advance({ type: 'rest' });
    const latest = authority.publicRun(h.cloud());
    assert.equal(latest.investigation.report_policy.evidence_correction_available, false);
    assert.equal(latest.state.action_points_left, 6);
    if (reload) h.reload();
    await h.resume();
    assert.equal(h.stored.ready, true);
    assert.equal(h.client.hasPending(), false);
    assert.deepEqual(h.stored.reportOptions.report_policy, latest.investigation.report_policy);
    assert.equal(h.stored.reportOptions.report_policy.evidence_correction_available, false);
    assert.equal(h.stored.reportOptions.report_policy.conclusion_rejection_penalty.apLoss, 1);
    assert.deepEqual(h.stored.state, latest.state);
    assert.equal(h.cloud().revision, latest.revision, 'Recovery does not read another offer or repeat either remote command.');
    const offers = h.calls.filter(body => body.command?.type === 'report_options');
    assert.equal(offers.length, 2, 'Only the original request and its same-operation replay are sent.');
    assert.deepEqual(offers[1], { ...offers[0], session_id: reload ? 'newly-claimed-device' : 'fixture-device' });
  }
});

test('closing and reopening a report while its offer is loading shares the response without a busy error or another revision', { skip }, async () => {
  const h = await evidenceCorrectionFixture(false, { delayReportOptions: true });
  const bindings = { ...h.bindings, reportMode: true, authorityReady: true, authorityLoading: false, isFinalizing: false };
  const firstCleanup = reportOptionsEffect(bindings)();
  await new Promise(resolve => setImmediate(resolve));
  firstCleanup();
  const secondCleanup = reportOptionsEffect(bindings)();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.stored.errors, [], 'The new panel must await the same in-flight offer rather than fail with RUN_REQUEST_BUSY.');
  h.releaseReportOptions();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.stored.reportOptions?.conclusions.length, 'The reopened panel receives the original authoritative offer.');
  assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 1);
  assert.equal(h.cloud().revision, 1);
  assert.equal(h.stored.state.action_points_left, 7);
  assert.equal(h.bindings.reportOptionsRequestRef.current, null);
  secondCleanup();
});

test('changing report language during loading reads the localized offer after the first response and keeps draft selections', { skip }, async () => {
  const h = await evidenceCorrectionFixture(false, { delayReportOptions: true });
  h.bindings.structuredReport = insufficientReportSelection(h.cloud());
  const draft = structuredClone(h.bindings.structuredReport);
  const load = lang => {
    const bindings = { ...h.bindings, lang, reportMode: true, authorityReady: true, authorityLoading: false, isFinalizing: false };
    bindings.executeRunCommand = handler('executeRunCommand', bindings);
    return reportOptionsEffect(bindings)();
  };
  const firstCleanup = load('en');
  await new Promise(resolve => setImmediate(resolve));
  firstCleanup();
  const secondCleanup = load('zh');
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.stored.errors, [], 'A language change must not race the single-flight command lock.');
  h.releaseReportOptions();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.calls.filter(body => body.command?.type === 'report_options').length, 2);
  h.releaseReportOptions();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(h.stored.reportOptions.conclusions.some(option => /[\u4e00-\u9fff]/.test(option.label)));
  assert.deepEqual(h.bindings.structuredReport, draft);
  assert.deepEqual(h.calls.filter(body => body.command?.type === 'report_options').map(body => body.command.lang), ['en', 'zh']);
  assert.deepEqual(h.stored.errors, []);
  assert.equal(h.cloud().revision, 2);
  assert.equal(h.stored.state.action_points_left, 7);
  secondCleanup();
});

test('recovering a lost link reply replaces the pending failure message with its confirmed relation result exactly once', { skip }, async () => {
  for (const relation of ['supports', 'contradicts']) {
    for (const reload of [false, true]) {
      const h = await runtimeFixture({ investigationVersion: 2, lostLink: true, seedRun: run => {
        run.state.unlocked_clues = ['c_01', 'c_02'];
      } });
      await h.perform('handleLink')('c_01', 'c_02', relation);
      assert.equal(h.stored.ready, false);
      assert.equal(h.client.hasPending(), true);
      assert.match(h.stored.linkWorkspace.feedback.text, /lost/);
      const committed = authority.publicRun(h.cloud());
      if (reload) h.reload();
      await h.resume();
      const feedback = h.stored.linkWorkspace.feedback;
      assert.equal(h.stored.ready, true);
      assert.strictEqual(h.stored.linkWorkspace.client, h.bindings.runClient);
      assert.equal(feedback.valid, relation === 'supports');
      assert.equal(feedback.a, 'c_01');
      assert.equal(feedback.b, 'c_02');
      assert.equal(feedback.relation, relation);
      assert.equal(feedback.lang, 'en');
      assert.ok(feedback.text);
      assert.doesNotMatch(feedback.text, /lost/);
      assert.deepEqual(authority.publicRun(h.cloud()), committed, 'Replaying the receipt cannot repeat a relation reward or confusion penalty.');
      const calls = h.calls.filter(body => body.command?.type === 'link');
      assert.equal(calls.length, 2);
      assert.deepEqual(calls[1], { ...calls[0], session_id: reload ? 'newly-claimed-device' : 'fixture-device' });
    }
  }
});
