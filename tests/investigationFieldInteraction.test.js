import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { getConnectedZones } from '../src/game/caseRuntime.js';
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
    '@/game/caseRuntime.js': { getConnectedZones },
    '@/game/agentStamina': stamina,
    './investigationField.css': {},
    './ReconstructionWorkbench.jsx': { default: Workbench },
    './CaseStoryPanel.jsx': { default: () => null },
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
