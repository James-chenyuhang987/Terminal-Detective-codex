import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { getAccessibleZonePath, getConnectedZones } from '../src/game/caseRuntime.js';
import { buildContactLeads } from '../src/game/investigationLeads.js';
import * as stamina from '../src/game/agentStamina.js';
import { applyRunCommand, createRun, publicRun } from '../server/gameAuthority/runAuthority.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';

const source = readFileSync(new URL('../src/components/game/investigation/InvestigationFieldPanel.jsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} });
const Workbench = () => null;
const contactExports = {};
compileFunction(ts.transpileModule(readFileSync(new URL('../src/components/game/investigation/InvestigationContacts.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText, ['require', 'exports'])(() => ({ ...React, default: React }), contactExports);

function harness(props, language = 'en') {
  const slots = [];
  let cursor = 0;
  let effects = [];
  const hooks = { ...React, default: React,
    useState(initial) {
      const index = cursor++;
      slots[index] ||= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, next => { slots[index].value = typeof next === 'function' ? next(slots[index].value) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      slots[index] ||= { current: initial };
      return slots[index];
    },
    useMemo(factory, deps) {
      const index = cursor++;
      if (!slots[index] || deps.some((item, i) => !Object.is(item, slots[index].deps[i]))) {
        slots[index] = { deps, value: factory() };
      }
      return slots[index].value;
    },
    useEffect(callback, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || !deps || deps.some((item, i) => !Object.is(item, previous.deps[i]))) {
        slots[index] = { deps, cleanup: previous?.cleanup };
        effects.push(() => {
          slots[index].cleanup?.();
          slots[index].cleanup = callback();
        });
      }
    },
  };
  const imports = {
    react: hooks,
    '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
    '@/game/investigationChoices.js': { localizedInvestigationText },
    '@/game/caseRuntime.js': { getAccessibleZonePath, getConnectedZones },
    '@/game/investigationLeads.js': { buildContactLeads },
    '@/game/agentStamina': stamina,
    './investigationField.css': {},
    './ReconstructionWorkbench.jsx': { default: Workbench },
    './CaseStoryPanel.jsx': { default: () => null },
    './InvestigationContacts.jsx': contactExports,
    './InvestigationSkillsPanel.jsx': { default: () => null, InvestigationSkillQuote: () => null, InvestigationSourceHint: () => null },
  };
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected field dependency ${id}`);
    return imports[id];
  }, exports);
  return {
    render() {
      cursor = 0;
      effects = [];
      const tree = exports.default(props);
      effects.forEach(callback => callback());
      return tree;
    },
    facts: exports.InvestigationFacts,
    findings: exports.InspectionFindings,
    feedback: exports.InspectionFeedback,
    guidance: exports.InvestigationActionGuidance,
    contacts: contactExports.default,
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

function descendants(node, predicate) {
  if (!React.isValidElement(node)) return [];
  return [
    ...(predicate(node) ? [node] : []),
    ...React.Children.toArray(node.props.children).flatMap(child => descendants(child, predicate)),
  ];
}
function label(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (!React.isValidElement(node)) return '';
  return React.Children.toArray(node.props.children).map(label).join('');
}
function button(tree, contains) {
  const match = descendants(tree, node => node.type === 'button' && label(node).includes(contains))[0];
  assert.ok(match, `Missing button containing ${contains}`);
  return match;
}
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixtures({ zeroApCredit = false, rawMaterials = false } = {}) {
  const run = createRun({ id: 'field-interaction-run', caseData: ALL_CASES[0], teamConfig: buildTeamConfig(),
    now: new Date('2026-10-15T00:00:00Z'), investigationVersion: 2 });
  if (!rawMaterials) delete run.investigation.raw_materials_revision;
  const spec = getInvestigationContent(run.case_id);
  run.state.unlocked_clues = [...spec.puzzle.required_clues];
  if (zeroApCredit) {
    run.state.action_points_left = 0;
    run.state.command_ap_credit = 1;
  }
  const view = publicRun(run);
  const props = {
    investigation: view.investigation, gameState: view.state,
    team: run.team_config.team.map(agent => ({ ...agent, stamina: run.state.agent_stamina[agent.agent_id] })),
    caseData: run.case_data, targetId: null, onTargetChange(id) { props.targetId = id; },
    onCommand: async () => ({ result: {} }), busy: false,
  };
  return { run, spec, props };
}

test('reconstruction uses the authoritative AP quote, including a zero-AP credit, while retaining stamina and busy guards', async () => {
  for (const language of ['zh', 'en']) {
    const { run, props } = fixtures({ zeroApCredit: true });
    const commands = [];
    let outcome;
    props.onCommand = async command => {
      commands.push(command);
      const offered = applyRunCommand(run, { type: 'puzzle_options' }, new Date('2026-10-15T00:00:01Z'));
      outcome = applyRunCommand(offered.run, command, new Date('2026-10-15T00:00:02Z'));
      return outcome;
    };
    assert.equal(props.investigation.puzzle.ap_cost, 0, 'the server must quote the active credit');
    const app = harness(props, language);
    button(app.render(), localizedInvestigationText(props.investigation.puzzle.label, language)).props.onClick();
    let tree = app.render();
    const first = props.investigation.puzzle.items[0];
    button(tree, localizedInvestigationText(first.label, language)).props.onClick();
    tree = app.render();
    const submitLabel = language === 'zh' ? '提交核验' : 'Submit reconstruction';
    assert.equal(button(tree, submitLabel).props.disabled, false, 'an already-waived quote must work with no AP left');
    props.investigation.puzzle.ap_cost = 1;
    assert.equal(button(app.render(), submitLabel).props.disabled, true, 'a paid submission still requires its quoted AP');
    props.investigation.puzzle.ap_cost = 0;
    const executor = props.investigation.puzzle.executor_agent_id;
    props.investigation.puzzle.executor_agent_id = null;
    assert.equal(button(app.render(), submitLabel).props.disabled, true, 'AP credit cannot bypass investigator stamina');
    props.investigation.puzzle.executor_agent_id = executor;
    props.busy = true;
    assert.equal(button(app.render(), submitLabel).props.disabled, true);
    props.busy = false;
    button(app.render(), submitLabel).props.onClick();
    await flush();
    assert.deepEqual(commands, [{ type: 'puzzle', answer_ids: [first.id] }]);
    assert.equal(outcome.run.state.action_points_left, 0);
    assert.equal(outcome.run.state.command_ap_credit, 0, 'an actual server submission spends the waived quote once');
    assert.equal(outcome.run.state.turn_count, run.state.turn_count + 1);
    app.unmount();
  }
});

test('field desk exposes the public investigation stages without adding a command or private answer', () => {
  const { props, spec } = fixtures();
  const app = harness(props);
  const tree = app.render();
  const progress = descendants(tree, node => String(node.props.className || '').includes('td-field-progress'))[0];
  assert.ok(progress, 'the current investigation stage should be visible beside the objective');
  const labels = label(progress);
  for (const stage of ['Scene evidence', 'Testimony', 'Reconstruction', 'Deductions', 'Case report']) assert.ok(labels.includes(stage));
  assert.equal(labels.includes(spec.hidden.result.en), false, 'the stage tracker must not expose protected answers');
  assert.deepEqual(props.targetId, null);
  app.unmount();
});

test('confirmed fact hints render safely as localized list items', () => {
  for (const language of ['zh', 'en']) {
    const { props } = fixtures();
    props.investigation.hint.facts = [
      { zh: '门禁记录已固定。', en: 'The access record is fixed.' },
      { zh: '现场样本已封存。', en: 'The scene sample is sealed.' },
    ];
    const app = harness(props, language);
    let tree = app.render();
    button(tree, language === 'zh' ? '展开核验提示' : 'Show investigation hint').props.onClick();
    tree = app.render();
    button(tree, language === 'zh' ? '查看已确认事实' : 'Show confirmed facts').props.onClick();
    tree = app.render();
    const facts = descendants(tree, node => node.type === app.facts)[0];
    assert.ok(facts, 'confirmed facts should be mounted after the second hint level');
    const markup = renderToStaticMarkup(facts);
    assert.match(markup, language === 'zh' ? /门禁记录已固定。/ : /The access record is fixed\./);
    assert.match(markup, language === 'zh' ? /现场样本已封存。/ : /The scene sample is sealed\./);
    assert.equal((markup.match(/<li>/g) || []).length, 2);
    const hide = button(tree, language === 'zh' ? '收起提示' : 'Hide hints');
    assert.equal(hide.props['aria-expanded'], true);
    hide.props.onClick();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === app.facts).length, 0);
    assert.equal(button(tree, language === 'zh' ? '展开核验提示' : 'Show investigation hint').props['aria-expanded'], false);
    app.unmount();
  }
});

test('the server-selected next target is visibly marked in the field desk', () => {
  const { props } = fixtures();
  const next = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
  props.investigation.current_goal_target = { target_id: next.target_id, zone_id: next.zone_id };
  const app = harness(props);
  const targetButton = descendants(app.render(), node => node.type === 'button' && node.props['aria-current'] === 'location')[0];
  assert.ok(targetButton, 'the authoritative next target should be marked');
  assert.match(label(targetButton), /NOVA CURRENT LEAD/);
  app.unmount();
});

test('the field desk connects the new workbench to authoritative submission and leaves completed materials readable', async () => {
  const { props } = fixtures({ rawMaterials: true });
  assert.ok(props.investigation.puzzle.workbench);
  const commands = [];
  props.onCommand = async command => { commands.push(command); return { result: {} }; };
  const app = harness(props);
  button(app.render(), localizedInvestigationText(props.investigation.puzzle.label, 'en')).props.onClick();
  const workbench = descendants(app.render(), node => node.type === Workbench)[0];
  assert.ok(workbench, 'new runs mount the interactive raw materials');
  assert.equal(workbench.props.disabled, false);
  const selected = props.investigation.puzzle.items.slice(0, 2).map(item => item.id);
  workbench.props.onAnswerChange(selected);
  button(app.render(), 'Submit reconstruction').props.onClick();
  await flush();
  assert.deepEqual(commands, [{ type: 'puzzle', answer_ids: selected }]);
  props.investigation.puzzle.completed = true;
  props.investigation.puzzle.confirmed_answer_ids = [...selected].reverse();
  const reviewed = descendants(app.render(), node => node.type === Workbench)[0];
  assert.equal(reviewed.props.disabled, false, 'completion disables submission, not free observation and alignment');
  assert.deepEqual(reviewed.props.answerIds, [...selected].reverse(), 'completed review follows the server-confirmed reconstruction');
  assert.equal(button(app.render(), 'Verified').props.disabled, true);
  props.busy = true;
  assert.equal(descendants(app.render(), node => node.type === Workbench)[0].props.disabled, true);
  app.unmount();
});

test('controlled unfinished reconstruction selections and measurements survive field-panel remounts without a command', () => {
  const { props } = fixtures({ rawMaterials: true });
  const commands = [];
  props.onCommand = async command => { commands.push(command); return { result: {} }; };
  props.reconstructionDraft = { answerIds: [], view: {} };
  props.onReconstructionDraftChange = next => {
    props.reconstructionDraft = typeof next === 'function' ? next(props.reconstructionDraft) : next;
  };
  const open = app => {
    button(app.render(), localizedInvestigationText(props.investigation.puzzle.label, 'en')).props.onClick();
    return descendants(app.render(), node => node.type === Workbench)[0];
  };
  const first = harness(props);
  const workbench = open(first);
  const selected = props.investigation.puzzle.items.slice(0, 2).map(item => item.id);
  workbench.props.onAnswerChange(selected);
  const view = { activeId: selected[1], offsets: { shaft: -90 }, alignments: { [selected[0]]: 6 },
    frame: 18, showReference: false };
  workbench.props.onViewChange(previous => ({ ...previous, ...view }));
  first.unmount();
  for (const presentation of ['notebook-return', 'tools-return', 'text', 'theater']) {
    const remounted = harness(props);
    const reviewed = open(remounted);
    assert.deepEqual(reviewed.props.answerIds, selected, presentation);
    assert.deepEqual(reviewed.props.viewState, view, presentation);
    remounted.unmount();
  }
  assert.deepEqual(commands, [], 'reopening the workspace cannot charge AP or submit an unfinished answer');
});

test('restored reconstruction submits only the visible current materials and ignores stale or damaged references', async () => {
  const { props } = fixtures({ rawMaterials: true });
  const commands = [];
  const selected = props.investigation.puzzle.items.slice(0, 2).map(item => item.id);
  props.reconstructionDraft = { answerIds: ['removed-material', ...selected, selected[0]], view: {} };
  props.onCommand = async command => { commands.push(command); return { result: {} }; };
  const app = harness(props);
  button(app.render(), localizedInvestigationText(props.investigation.puzzle.label, 'en')).props.onClick();
  const workbench = descendants(app.render(), node => node.type === Workbench)[0];
  assert.deepEqual(workbench.props.answerIds, selected);
  button(app.render(), 'Submit reconstruction').props.onClick();
  await flush();
  assert.deepEqual(commands, [{ type: 'puzzle', answer_ids: selected }],
    'an invisible restored material must never affect a paid reconstruction');
  props.reconstructionDraft = { answerIds: ['removed-material'], view: {} };
  assert.equal(button(app.render(), 'Submit reconstruction').props.disabled, true,
    'an empty visible selection cannot spend AP');
  app.unmount();
});

test('expired or uncertain inspection offers are removed and can be explicitly reloaded without replaying the paid action', async () => {
  for (const code of ['STALE_OPTIONS', 'RUN_REQUEST_UNCONFIRMED']) {
    const { props } = fixtures();
    const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
    const executor = props.team[0].agent_id;
    const commands = [];
    let sequence = 0;
    props.targetId = target.target_id;
    props.onCommand = async command => {
      commands.push(command);
      if (command.type === 'inspect') throw Object.assign(new Error(code), { code });
      return { result: { packs: { [executor]: { cards: [{ option_id: `offer-${++sequence}`, label: 'Verify original record',
        available: true, ap_cost: 1, stamina_cost: 10, risk_level: 'low' }] } } } };
    };
    const app = harness(props);
    app.render();
    await flush();
    let tree = app.render();
    button(tree, 'Verify original record').props.onClick();
    await flush();
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === 'button' && label(node).includes('Verify original record')).length, 0,
      'an invalidated offer must not remain actionable');
    assert.match(label(descendants(tree, node => node.props.role === 'alert')[0]), /reload the inspection options/);
    assert.deepEqual(commands.map(command => command.type), ['inspect_options', 'inspect'], 'failed actions are never automatically replayed');
    const reload = button(tree, 'Load inspection options');
    assert.equal(reload.props.disabled, false);
    reload.props.onClick();
    await flush();
    tree = app.render();
    assert.equal(button(tree, 'Verify original record').props.disabled, false);
    assert.deepEqual(commands.map(command => command.type), ['inspect_options', 'inspect', 'inspect_options']);
    app.unmount();
  }
});

test('a late option response from the previous object cannot replace the currently selected object offers', async () => {
  const { props } = fixtures();
  const targets = props.investigation.targets.filter(item => item.zone_id === props.gameState.current_zone).slice(0, 2);
  assert.equal(targets.length, 2);
  const pending = new Map();
  props.onCommand = command => new Promise(resolve => pending.set(command.target_id, resolve));
  props.targetId = targets[0].target_id;
  const app = harness(props);
  app.render();
  props.targetId = targets[1].target_id;
  app.render();
  const packs = label => ({ result: { packs: { [props.team[0].agent_id]: { cards: [{ option_id: label, label,
    available: true, ap_cost: 1, stamina_cost: 10, risk_level: 'low' }] } } } });
  pending.get(targets[1].target_id)(packs('CURRENT_OBJECT_OFFER'));
  await flush();
  pending.get(targets[0].target_id)(packs('STALE_OBJECT_OFFER'));
  await flush();
  const tree = app.render();
  assert.equal(button(tree, 'CURRENT_OBJECT_OFFER').props.disabled, false);
  assert.equal(label(tree).includes('STALE_OBJECT_OFFER'), false);
  app.unmount();
});

test('switching objects removes the old payable cards before passive effects load the new offer', async () => {
  const { props } = fixtures();
  const targets = props.investigation.targets.filter(item => item.zone_id === props.gameState.current_zone);
  const commands = [];
  let resolveNext;
  props.targetId = targets[0].target_id;
  props.onCommand = command => {
    commands.push(command);
    if (command.target_id === targets[1].target_id) return new Promise(resolve => { resolveNext = resolve; });
    return Promise.resolve({ result: { packs: { [props.team[0].agent_id]: { cards: [{ option_id: 'old-payable-offer',
      label: 'OLD_OBJECT_METHOD', available: true, ap_cost: 1, stamina_cost: 10 }] } } } });
  };
  const app = harness(props);
  app.render();
  await flush();
  assert.equal(button(app.render(), 'OLD_OBJECT_METHOD').props.disabled, false);
  props.targetId = targets[1].target_id;
  assert.equal(label(app.render()).includes('OLD_OBJECT_METHOD'), false, 'a new object must never display the previous object’s paid method');
  app.render();
  resolveNext({ result: { packs: {} } });
  await flush();
  assert.deepEqual(commands.map(command => command.type), ['inspect_options', 'inspect_options']);
  app.unmount();
});

test('an object left selected after travel cannot request inspection options in the wrong room', async () => {
  const { props } = fixtures();
  const remote = props.investigation.targets.find(item => item.zone_id !== props.gameState.current_zone);
  const commands = [];
  props.targetId = remote.target_id;
  props.onCommand = async command => { commands.push(command); return { result: { packs: {} } }; };
  const app = harness(props);
  app.render();
  await flush();
  assert.deepEqual(commands, [], 'a stale selection is not a deliberate request to inspect a remote object');
  assert.equal(button(app.render(), 'Recover team').props.disabled, false);
  app.unmount();
});

test('published objects remain freely observable before their verification prerequisites are met', async () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
    target.available = false;
    const commands = [];
    props.onCommand = async command => { commands.push(command); return { result: { packs: {} } }; };
    const app = harness(props, lang);
    const object = button(app.render(), localizedInvestigationText(target.label, lang));
    assert.equal(object.props.disabled, false);
    object.props.onClick();
    app.render();
    await flush();
    const tree = app.render();
    assert.ok(label(tree).includes(localizedInvestigationText(target.observation, lang)));
    assert.match(label(tree), lang === 'zh' ? /核验条件尚未满足/ : /Verification prerequisites are not yet met/);
    assert.equal(descendants(tree, node => node.type === 'button' && label(node).includes(lang === 'zh' ? '读取核验方案' : 'Load inspection options')).length, 0);
    assert.deepEqual(commands, [], 'free observation must not issue an invalid offer request or a paid inspection');
    target.available = true;
    app.render();
    await flush();
    assert.deepEqual(commands, [{ type: 'inspect_options', target_id: target.target_id }], 'when the server unlocks the selected object, load its offer once');
    app.unmount();
  }
});

test('route guidance marks the accessible first hop and clicking it submits only that adjacent travel', async () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    props.caseData = { scene: { zones: { start: { label: 'Start' }, hall: { label: 'Hall' }, goal: { label: 'Goal' }, locked: { label: 'Locked' } } },
      zone_connections: [['start', 'locked'], ['locked', 'goal'], ['start', 'hall'], ['hall', 'goal']] };
    props.gameState = { ...props.gameState, current_zone: 'start' };
    props.investigation = { ...props.investigation, targets: [],
      current_goal_target: { target_id: 'public-object', zone_id: 'goal' },
      zone_access: { start: { available: true }, hall: { available: true }, goal: { available: true }, locked: { available: false } } };
    const commands = [];
    props.onCommand = async command => { commands.push(command); return { result: {} }; };
    const app = harness(props, lang);
    let tree = app.render();
    assert.match(label(tree), /Start → Hall → Goal/);
    const next = descendants(tree, node => node.type === 'button' && node.props['aria-current'] === 'location');
    assert.equal(next.length, 1);
    assert.match(label(next[0]), /Hall/);
    assert.equal(next[0].props.disabled, false);
    assert.equal(button(tree, 'Locked').props.disabled, true);
    assert.deepEqual(commands, [], 'route suggestions cannot move the player');
    next[0].props.onClick();
    await flush();
    assert.deepEqual(commands, [{ type: 'travel', zone_id: 'hall' }]);
    props.gameState.current_zone = 'hall';
    tree = app.render();
    assert.match(label(tree), /Hall → Goal/);
    assert.match(label(descendants(tree, node => node.type === 'button' && node.props['aria-current'] === 'location')[0]), /Goal/);
    props.investigation.zone_access.goal.available = false;
    tree = app.render();
    assert.equal(descendants(tree, node => node.type === 'button' && node.props['aria-current'] === 'location').length, 0,
      'a changed access snapshot removes stale route advice immediately');
    app.unmount();
  }
});

test('following a public account changes only route guidance; arriving never starts or pays for an interview', async () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    props.caseData = { npcs: [{ npc_id: 'witness', name: 'Witness', role: 'Observer' }],
      scene: { zones: { start: { label: 'Start' }, hall: { label: 'Hall' }, goal: { label: 'Goal' } } },
      zone_connections: [['start', 'hall'], ['hall', 'goal']] };
    props.gameState = { ...props.gameState, current_zone: 'start' };
    props.investigation = { ...props.investigation, targets: [], npc_zones: { witness: 'goal' },
      initial_statements: { witness: { zh: '我整晚都在大厅。', en: 'I was in the hall all night.' } },
      testimony_stages: { witness: 0 }, current_goal_target: { zone_id: 'hall' },
      zone_access: { start: { available: true }, hall: { available: true }, goal: { available: true } } };
    const commands = []; const talks = [];
    props.followedNpcId = null;
    props.onFollowNpc = id => { props.followedNpcId = id; };
    props.onTalk = id => talks.push(id);
    props.onCommand = async command => { commands.push(command); return { result: {} }; };
    const app = harness(props, lang);
    let tree = app.render();
    const contactElement = descendants(tree, node => node.type === app.contacts)[0];
    const cards = app.contacts(contactElement.props);
    assert.match(renderToStaticMarkup(contactElement), lang === 'zh' ? /人物说法不等于已证实事实/ : /an account is not a proven fact/);
    button(cards, lang === 'zh' ? '追查 Witness' : 'Follow Witness').props.onClick();
    tree = app.render();
    assert.equal(props.followedNpcId, 'witness');
    assert.match(label(tree), /Start → Hall → Goal/);
    assert.deepEqual(commands, []);
    assert.deepEqual(talks, []);
    button(tree, lang === 'zh' ? '通往我的追查方向' : 'TOWARD MY LEAD').props.onClick();
    await flush();
    assert.deepEqual(commands, [{ type: 'travel', zone_id: 'hall' }]);
    props.gameState.current_zone = 'goal';
    tree = app.render();
    assert.deepEqual(talks, [], 'arrival must not ask a question automatically');
    const viewQuestions = button(tree, lang === 'zh' ? '查看 Witness 的提问' : 'View questions for Witness');
    viewQuestions.props.onClick();
    assert.deepEqual(talks, ['witness']);
    assert.equal(commands.length, 1, 'opening questions goes through the owner; the desk never submits a paid question');
    props.active = false;
    assert.equal(button(app.render(), lang === 'zh' ? '查看 Witness 的提问' : 'View questions for Witness').props.disabled, true);
    viewQuestions.props.onClick();
    assert.deepEqual(talks, ['witness'], 'a retained callback cannot open a suspended view');
    props.active = true;
    button(app.render(), lang === 'zh' ? '取消追查方向' : 'Clear chosen lead').props.onClick();
    assert.equal(props.followedNpcId, null);
    assert.equal(label(app.render()).includes(lang === 'zh' ? '我的追查方向：' : 'My chosen lead: '), false);
    props.followedNpcId = 'person-from-other-case';
    assert.equal(label(app.render()).includes(lang === 'zh' ? '我的追查方向：' : 'My chosen lead: '), false);
    app.unmount();
  }
});

test('a followed person behind a locked route displays the published entry requirement without a remote talk button', () => {
  const { props } = fixtures();
  const npc = props.caseData.npcs.find(item => props.investigation.npc_zones[item.npc_id] !== props.gameState.current_zone);
  const destination = props.investigation.npc_zones[npc.npc_id];
  props.investigation.zone_access[destination] = { available: false, requirement: { en: 'Check the public entrance seal.' } };
  props.followedNpcId = npc.npc_id;
  props.onTalk = () => assert.fail('Cannot interview a person in another room');
  const app = harness(props);
  const tree = app.render();
  assert.match(label(tree), /Check the public entrance seal\./);
  assert.equal(label(tree).includes('View questions for'), false);
  assert.equal(label(tree).includes('Route to my chosen lead:'), false);
  app.unmount();
});

test('saved preliminary findings retain their limits and do not mark an object or the scene complete', () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
    for (const item of props.investigation.targets) item.completed = item !== target;
    target.inquiry = { zh: '校验通过能否证明脚本实际执行？', en: 'Does a passed validation prove the script actually ran?' };
    props.targetId = target.target_id;
    props.investigation.inspection_revision = 1;
    props.investigation.inspection_findings = [
      { target_id: target.target_id, method_id: 'preview', label: { zh: '查看校验界面', en: 'Read the validation screen' },
        result: { zh: '界面确实显示通过。', en: 'The display does show a pass.' },
        limitation: { zh: '该界面不记录执行结果。', en: 'This screen does not record execution results.' }, executor_agent_id: props.team[0].agent_id },
      { target_id: 'different-object', method_id: 'other', result: { zh: '其他物件发现', en: 'OTHER_OBJECT_FINDING' } },
    ];
    const app = harness(props, lang);
    const tree = app.render();
    assert.ok(label(tree).includes(localizedInvestigationText(target.inquiry, lang)));
    const object = button(tree, localizedInvestigationText(target.label, lang));
    assert.match(label(object), lang === 'zh' ? /已有初步发现 · 关键核验待完成/ : /PRELIMINARY FINDING · KEY VERIFICATION PENDING/);
    const saved = descendants(tree, node => node.type === app.findings)[0];
    const markup = renderToStaticMarkup(saved);
    assert.ok(markup.includes(localizedInvestigationText(props.investigation.inspection_findings[0].result, lang)));
    assert.ok(markup.includes(localizedInvestigationText(props.investigation.inspection_findings[0].limitation, lang)));
    assert.match(markup, lang === 'zh' ? /不代替结案报告所需的关键证据/ : /do not replace the key evidence/);
    assert.equal(markup.includes(localizedInvestigationText(props.investigation.inspection_findings[1].result, lang)), false);
    const scene = descendants(tree, node => node.type === 'li' && node.props['aria-current'] === 'step')[0];
    assert.match(label(scene), lang === 'zh' ? /现场取证/ : /Scene evidence/);
    const guidance = descendants(tree, node => node.type === app.guidance)[0];
    assert.equal(guidance.props.preliminaryChecks, true);
    assert.match(renderToStaticMarkup(guidance), lang === 'zh' ? /共享最多 1 AP 基础费用/ : /share at most 1 AP in base costs/);
    app.unmount();
  }
});

test('inspection cards show method scope and paid credit while obeying zero-AP, availability and duplicate-click guards', async () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
    props.targetId = target.target_id;
    props.gameState.action_points_left = 0;
    const executor = props.team[0].agent_id;
    const card = { option_id: 'credited-verification', label: 'Compare execution records',
      scope: lang === 'zh' ? '比对独立执行记录中的指令。' : 'Compare commands recorded by independent execution logs.',
      available: true, ap_cost: 0, stamina_cost: 10, risk_level: 'low', inspection_ap_credit_used: 1 };
    const commands = [];
    let resolveInspection;
    props.onCommand = async command => {
      commands.push(command);
      if (command.type === 'inspect') return new Promise(resolve => { resolveInspection = resolve; });
      return { result: { packs: { [executor]: { cards: [card] } } } };
    };
    const app = harness(props, lang);
    app.render();
    await flush();
    let method = button(app.render(), card.label);
    assert.equal(method.props.disabled, false, 'an authoritative AP credit allows the quoted check with no AP left');
    assert.ok(label(method).includes(card.scope));
    assert.match(label(method), lang === 'zh' ? /已付初查费用抵扣 1 AP；体力与回合照常消耗/ : /1 AP credited from a paid preliminary check; stamina and turn costs still apply/);
    assert.match(label(method), lang === 'zh' ? /体力 −10% · 推进一回合/ : /Stamina −10% · Advances one turn/);
    card.ap_cost = 1;
    assert.equal(button(app.render(), card.label).props.disabled, true, 'only the current quoted cost is compared to AP');
    card.ap_cost = 0;
    card.available = false;
    assert.equal(button(app.render(), card.label).props.disabled, true, 'credit cannot bypass server stamina or availability');
    card.available = true;
    method = button(app.render(), card.label);
    method.props.onClick();
    method.props.onClick();
    assert.deepEqual(commands.map(command => command.type), ['inspect_options', 'inspect']);
    resolveInspection({ result: { completed: true, narration: 'Confirmed execution record.' } });
    await flush();
    assert.equal(descendants(app.render(), node => node.type === 'button' && label(node).includes(card.label)).length, 0,
      'the consumed quotation must be removed before any subsequent action');
    app.unmount();
  }
});

test('completed objects keep free preliminary reviews and present their findings without an error or pending-evidence badge', async () => {
  for (const lang of ['zh', 'en']) {
    const { props } = fixtures();
    const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
    target.completed = true;
    props.targetId = target.target_id;
    props.gameState.action_points_left = 0;
    props.investigation.inspection_findings = [{ target_id: target.target_id, method_id: 'display', result: 'Public display.' }];
    const commands = [];
    props.onCommand = async command => {
      commands.push(command);
      if (command.type === 'inspect') return { result: { finding: true, completed: false, narration: 'The display shows a pass.',
        limitation: { zh: '不能证明指令执行。', en: 'This does not prove execution.' } } };
      return { result: { packs: { [props.team[0].agent_id]: { cards: [
        { option_id: 'completed-review', label: 'Key record', review: true, ap_cost: 0, stamina_cost: 0, available: true, risk_level: 'low' },
        { option_id: 'preliminary-review', label: 'Validation display', review: true, ap_cost: 0, stamina_cost: 0, available: true, risk_level: 'low' },
        { option_id: 'unperformed-method', label: 'UNPERFORMED_PAID_METHOD', review: false, ap_cost: 1, available: true },
      ] } } } };
    };
    const app = harness(props, lang);
    app.render();
    await flush();
    let tree = app.render();
    assert.match(label(button(tree, localizedInvestigationText(target.label, lang))), lang === 'zh' ? /已核验 · 免费复查/ : /INSPECTED · FREE REVIEW/);
    assert.equal(label(tree).includes('UNPERFORMED_PAID_METHOD'), false);
    const review = button(tree, 'Validation display');
    assert.equal(review.props.disabled, false);
    assert.match(label(review), lang === 'zh' ? /免费复查 · 不耗体力 · 不推进回合/ : /Free review · No stamina cost or turn advance/);
    review.props.onClick();
    await flush();
    tree = app.render();
    assert.deepEqual(commands, [{ type: 'inspect_options', target_id: target.target_id }, { type: 'inspect', option_id: 'preliminary-review' }]);
    assert.equal(descendants(tree, node => node.props.role === 'alert').length, 0);
    const feedback = descendants(tree, node => node.type === app.feedback)[0];
    const markup = renderToStaticMarkup(feedback);
    assert.match(markup, /role="status"/);
    assert.match(markup, lang === 'zh' ? /已保存初步发现 · 不代替报告证据/ : /Preliminary finding saved · Not report evidence/);
    assert.match(markup, lang === 'zh' ? /不能证明指令执行/ : /This does not prove execution/);
    assert.doesNotMatch(markup, /关键核验待完成|Key verification pending/);
    app.unmount();
  }
});

test('legacy inspection views do not promise preliminary findings or fee credits', () => {
  const { props } = fixtures();
  delete props.investigation.inspection_revision;
  delete props.investigation.inspection_findings;
  const target = props.investigation.targets.find(item => item.zone_id === props.gameState.current_zone);
  delete target.inquiry;
  props.targetId = target.target_id;
  const app = harness(props);
  const tree = app.render();
  const guidance = descendants(tree, node => node.type === app.guidance)[0];
  assert.equal(guidance.props.preliminaryChecks, false);
  assert.doesNotMatch(renderToStaticMarkup(guidance), /share at most 1 AP|preliminary/);
  assert.match(renderToStaticMarkup(guidance), /An appropriate inspection method reliably secures the evidence/);
  assert.equal(renderToStaticMarkup(descendants(tree, node => node.type === app.findings)[0]), '');
  app.unmount();
});
