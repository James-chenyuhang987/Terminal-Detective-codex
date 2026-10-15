import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as specialty from '../src/game/specialtySystem.js';
import * as commands from '../src/game/commandSystem.js';
import { PRESET_CONFIGS } from '../src/game/casePresets.js';
import { buildTeamConfig, defaultPriorities, getCoreAgentDefs, PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import { buildLobbyPreparation, buildLobbyPresetPreview, describeLobbySynergy } from '../src/game/lobbyPreparation.js';
import { getActiveSupportAgent } from '../src/game/agentMarket.js';
import { authoritativeProfile, prepareCaseStart } from '../server/gameAuthority/profileCommands.js';
import { createRun } from '../server/gameAuthority/runAuthority.js';

let language = 'zh';
const imports = {
  react: { ...React, default: React },
  '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
  '@/components/ui/Icon': { default: () => null },
  '@/game/specialtySystem': specialty,
  '@/game/casePresets': { PRESET_CONFIGS },
  '@/game/lobbyPreparation': { buildLobbyPreparation, buildLobbyPresetPreview, describeLobbySynergy },
  '@/game/commandSystem': commands,
  '@/game/teamConfig': { PRIORITY_ACTIONS },
  './lobbyPreparation.css': {},
};
function loadComponent(filename) {
  const source = readFileSync(new URL(`../src/components/game/lobby/${filename}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected component import ${id}`);
    return imports[id];
  }, exports);
  return exports.default;
}
const LobbyPreparationPanel = loadComponent('LobbyPreparationPanel.jsx');
const CommandPlanPanel = loadComponent('CommandPlanPanel.jsx');

function formation(specs = [{}, {}, {}], coreAgentIds = undefined) {
  const config = { specs, priorities: defaultPriorities(), primary_agent_index: 1,
    core_agent_ids: coreAgentIds, command_plan: { ...commands.DEFAULT_COMMAND_PLAN } };
  return { config, agentDefs: getCoreAgentDefs(coreAgentIds), agents: buildTeamConfig(config).team };
}
function panelProps(patch = {}) {
  const draft = formation();
  return { agents: draft.agents, agentDefs: draft.agentDefs, specs: draft.config.specs, primaryAgentIdx: 1,
    commandPlan: draft.config.command_plan, onPreviewPreset() {}, onApplyPreset() {}, onUndoPreset() {},
    onAdjustAgent() {}, onPrimaryAgent() {}, ...patch };
}
function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach(freezeTree);
  }
  return value;
}
// Resolve the actual stateless components so tests can invoke the handlers
// attached to rendered buttons, rather than matching implementation text.
function nodes(element) {
  if (!React.isValidElement(element)) return [];
  if (typeof element.type === 'function') return nodes(element.type(element.props));
  return [element, ...React.Children.toArray(element.props.children).flatMap(nodes)];
}
function content(element) {
  if (typeof element === 'string' || typeof element === 'number') return String(element);
  if (!React.isValidElement(element)) return '';
  if (typeof element.type === 'function') return content(element.type(element.props));
  return React.Children.toArray(element.props.children).map(content).join('');
}
function button(tree, label) {
  const result = nodes(tree).find(node => node.type === 'button' && content(node) === label);
  assert.ok(result, `Button ${label} must exist`);
  return result;
}

test('lobby preparation uses real raw role attributes and quotes support AP and doctrine CP', () => {
  const draft = formation([{ logic_power: 4 }, { observation_focus: 10 }, { hack_level: 20 }]);
  freezeTree(draft);
  const result = buildLobbyPreparation({ agents: draft.agents, specs: draft.config.specs,
    commandPlan: { doctrine_id: 'rapid_pursuit' }, support: { effects: { initial_ap_bonus: 2 } } });
  assert.equal(result.initialAP, 22);
  assert.equal(result.initialCP, 4);
  assert.equal(result.agents[0].ability_percent.logic_power, 60);
  assert.equal(result.agents[0].professional_observation.logic_power, true);
  assert.equal(result.agents[0].specialist_efficiency, false);
  assert.equal(result.agents[0].remaining, 16);
  assert.equal(result.agents[1].ability_percent.observation_focus, 75);
  assert.equal(result.agents[1].specialist_efficiency, true);
  assert.equal(result.agents[2].ability_percent.hack_level, 100);
  assert.equal(result.agents[2].specialist_efficiency, true);
  assert.deepEqual(result.agents.map(agent => agent.slot), [0, 1, 2]);
  const normal = buildLobbyPreparation({ agents: draft.agents, specs: draft.config.specs, commandPlan: {} });
  assert.equal(normal.initialAP, 20);
  assert.equal(normal.initialCP, 3);
  const below = formation([{ logic_power: 3 }, { observation_focus: 9 }, {}]);
  const belowThreshold = buildLobbyPreparation({ agents: below.agents, specs: below.config.specs, commandPlan: {} });
  assert.equal(belowThreshold.agents[0].professional_observation.logic_power, false, '23 raw points do not meet the 24-point threshold');
  assert.equal(belowThreshold.agents[1].professional_observation.observation_focus, true);
  assert.equal(belowThreshold.agents[1].specialist_efficiency, false, '29 raw points do not meet the 30-point threshold');
});

test('lobby starting resources match an authoritative run including tech, owned equipment and active support', () => {
  const now = new Date('2026-10-15T00:00:00Z');
  for (const [index, scenario] of [
    { inventory: { ap_booster: 1 }, equipped_items: ['ap_booster'], expectedAP: 27 },
    { inventory: { ap_booster: 0 }, equipped_items: ['ap_booster'], expectedAP: 24 },
    { inventory: { ap_booster: 1 }, equipped_items: [], expectedAP: 24 },
  ].entries()) {
    const draft = formation();
    draft.config.command_plan.doctrine_id = 'rapid_pursuit';
    const profile = authoritativeProfile({ ...scenario, saved_team_config: draft.config,
      tech_unlocks: ['network_1', 'network_2', 'network_3'],
      reward_claims: ['agent:ORACLE-00', 'support-agent:ORACLE-00'],
    }, now);
    freezeTree(profile);
    const before = JSON.stringify(profile);
    const preview = buildLobbyPreparation({ agents: draft.agents, specs: draft.config.specs,
      commandPlan: draft.config.command_plan, support: getActiveSupportAgent(profile), profile });
    assert.equal(preview.initialAP, scenario.expectedAP);
    assert.equal(preview.initialCP, 4);
    assert.equal(JSON.stringify(profile), before, 'preview must not consume inventory or energy');
    const started = prepareCaseStart(profile, { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2 }, now);
    assert.equal(started.error, undefined);
    const run = createRun({ id: `lobby-resource-preview-${index}`, caseData: started.caseData,
      teamConfig: started.teamConfig, effects: started.effects, now, investigationVersion: 2 });
    assert.equal(run.state.action_points_left, preview.initialAP);
    assert.equal(run.state.command_state.points, preview.initialCP);
    assert.equal(profile.inventory.ap_booster, scenario.inventory.ap_booster);
    assert.equal(started.profile.inventory.ap_booster, scenario.equipped_items.length ? 0 : scenario.inventory.ap_booster);
  }
});

test('preset preview is read-only and exposes real gains, losses and elite-core returned points', () => {
  const draft = formation([{ logic_power: 5, confusion_resistance: 15 }, { observation_focus: 20 }, { ap_cost_discount: 20 }],
    ['SOVEREIGN-01', 'SERAPH-88', 'OMEGA-77']);
  const preset = structuredClone(PRESET_CONFIGS.find(entry => entry.id === 'brute_force'));
  freezeTree(draft);
  freezeTree(preset);
  const before = JSON.stringify({ draft, preset });
  const result = buildLobbyPresetPreview({ preset, specs: draft.config.specs, agentDefs: draft.agentDefs, agents: draft.agents });
  assert.equal(JSON.stringify({ draft, preset }), before);
  assert.equal(result.refunded, 14);
  assert.deepEqual(result.specs, [{ logic_power: 13 }, { observation_focus: 10, logic_power: 10 }, { hack_level: 13 }]);
  assert.deepEqual(result.rows.map(row => row.remaining), [7, 0, 7]);
  const logicGain = result.rows[0].changes.find(change => change.key === 'logic_power');
  const resistanceLoss = result.rows[0].changes.find(change => change.key === 'confusion_resistance');
  assert.deepEqual(logicGain, { key: 'logic_power', before: 32, after: 40, delta: 8 });
  assert.deepEqual(resistanceLoss, { key: 'confusion_resistance', before: 30, after: 15, delta: -15 });
  assert.equal(result.rows[0].preparation.specialist_efficiency, true);
  assert.deepEqual(result.rows[0].beforePriorities, draft.agents[0].priority_list.slice(0, 3));
  assert.deepEqual(result.rows[0].afterPriorities, preset.priorities[0].slice(0, 3));
  assert.equal(draft.config.primary_agent_index, 1);
  assert.equal(draft.config.command_plan.doctrine_id, 'evidence_control');
  assert.equal(buildLobbyPresetPreview({ preset: null, specs: draft.config.specs, agentDefs: draft.agentDefs }), null);
  assert.equal(buildLobbyPresetPreview({ preset: { specs: [{}] }, specs: draft.config.specs, agentDefs: draft.agentDefs }), null);
});

test('stealth and brute presets preview real synergy gains and losses before applying', () => {
  const brute = PRESET_CONFIGS.find(preset => preset.id === 'brute_force');
  const stealth = PRESET_CONFIGS.find(preset => preset.id === 'stealth');
  const draft = formation(structuredClone(brute.specs));
  freezeTree(draft);
  const preview = buildLobbyPresetPreview({ preset: stealth, specs: draft.config.specs, agentDefs: draft.agentDefs,
    agents: draft.agents });
  assert.deepEqual(preview.gainedSynergyIds, ['ghost_protocol']);
  assert.deepEqual(preview.lostSynergyIds, ['cross_validation']);
  assert.deepEqual(preview.proposedSynergy.active.map(skill => skill.id), ['digital_forensics', 'ghost_protocol']);
  const reverse = buildLobbyPresetPreview({ preset: brute, specs: preview.specs, agentDefs: draft.agentDefs });
  assert.deepEqual(reverse.gainedSynergyIds, ['cross_validation']);
  assert.deepEqual(reverse.lostSynergyIds, ['ghost_protocol']);
  assert.deepEqual(draft.config.specs, brute.specs);
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(LobbyPreparationPanel, panelProps({
      agents: draft.agents, agentDefs: draft.agentDefs, specs: draft.config.specs, selectedPresetId: 'stealth',
    })));
    assert.ok(markup.includes(language === 'zh' ? '预设协同收益' : 'Preset synergy benefits'));
    assert.ok(markup.includes(language === 'zh' ? '幽灵协议 · 新增' : 'GHOST PROTOCOL · Added'));
    assert.ok(markup.includes(language === 'zh' ? '数字法证 · 保留' : 'DIGITAL FORENSICS · Kept'));
    assert.ok(markup.includes(language === 'zh' ? '应用后失去：交叉验证' : 'Lost after applying: CROSS VALIDATION'));
    assert.ok(markup.includes(language === 'zh' ? '危机导致的混乱增量降低 20%' : 'Confusion added by crises is reduced by 20%'));
    assert.equal(markup.includes(language === 'zh' ? '线索发现率 +20%' : 'Increases clue discovery'), false,
      'new investigations must not promise the old random-clue bonus');
    assert.ok(markup.indexOf(language === 'zh' ? '危机导致的混乱增量降低 20%' : 'Confusion added by crises is reduced by 20%')
      < markup.indexOf(language === 'zh' ? '应用「隐秘渗透型」' : 'Apply STEALTH INFILTRATION'));
  }
});

test('preparation panel renders localized responsibilities, costs and accessible comparison results', () => {
  const draft = formation(undefined, ['SOVEREIGN-01', 'SERAPH-88', 'OMEGA-77']);
  const props = panelProps({ agentDefs: draft.agentDefs, selectedPresetId: 'brute_force', primaryAgentIdx: 2 });
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(LobbyPreparationPanel, props));
    assert.ok(markup.includes(language === 'zh' ? '让每位探员都有分工' : 'Give every agent a role'));
    assert.ok(markup.includes(language === 'zh' ? '三人共同出勤' : 'All three agents deploy'));
    assert.ok(markup.includes(language === 'zh' ? '自动触发时消耗 1 CP' : 'automatic contingency costs 1 CP'));
    assert.ok(markup.includes(language === 'zh' ? '试演分数不代表案件胜率' : 'rehearsal scores are not case win rates'));
    assert.match(markup, /<caption>/);
    assert.match(markup, /scope="col"/);
    assert.match(markup, /scope="row"/);
    assert.match(markup, /aria-live="polite"/);
    assert.ok(markup.includes(language === 'zh' ? '14 点超过核心能力上限' : '14 points exceed core caps'));
    assert.ok(markup.includes(language === 'zh' ? '应用后余 7 点' : '7 points remain to allocate'));
    assert.ok(markup.includes(language === 'zh' ? '旧版行动偏好 · 前三项' : 'Legacy action preferences · top 3'));
    assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 2, 'one primary and one preview are selected');
  }
});

test('previewing, applying and undoing presets call distinct controls without changing the draft', () => {
  language = 'en';
  const calls = [];
  const props = panelProps({ canUndoPreset: true,
    onPreviewPreset: id => calls.push(['preview', id]),
    onApplyPreset: preset => calls.push(['apply', preset.id]),
    onUndoPreset: () => calls.push(['undo']),
  });
  const before = JSON.stringify(props.specs);
  let tree = LobbyPreparationPanel(props);
  assert.equal(nodes(tree).some(node => node.type === 'button' && content(node).startsWith('Apply ')), false);
  const preset = PRESET_CONFIGS.find(entry => entry.id === 'brute_force');
  button(tree, preset.nameEn).props.onClick();
  assert.deepEqual(calls, [['preview', preset.id]]);
  assert.equal(JSON.stringify(props.specs), before);
  tree = LobbyPreparationPanel({ ...props, selectedPresetId: preset.id });
  button(tree, `Apply ${preset.nameEn}`).props.onClick();
  assert.deepEqual(calls, [['preview', preset.id], ['apply', preset.id]]);
  button(tree, 'Undo preset').props.onClick();
  assert.deepEqual(calls, [['preview', preset.id], ['apply', preset.id], ['undo']]);
  assert.equal(JSON.stringify(props.specs), before);
});

test('viewing specialty details and assigning a primary remain separate preparation actions', () => {
  language = 'en';
  const actions = [];
  const props = panelProps({ primaryAgentIdx: 2,
    onAdjustAgent: slot => actions.push(['view', slot]), onPrimaryAgent: slot => actions.push(['primary', slot]) });
  const tree = LobbyPreparationPanel(props);
  const rows = nodes(tree).filter(node => node.type === 'article');
  button(rows[0], 'Specialties · 20 unspent').props.onClick();
  assert.deepEqual(actions, [['view', 0]]);
  button(rows[0], 'Make primary').props.onClick();
  assert.deepEqual(actions, [['view', 0], ['primary', 0]]);
  assert.equal(button(rows[2], 'Current primary').props['aria-pressed'], true);
  assert.equal(button(rows[2], 'Current primary').props.disabled, true);
  assert.equal(button(rows[0], 'Make primary').props['aria-pressed'], false);
  assert.equal(props.primaryAgentIdx, 2, 'the panel emits intent; it does not mutate parent state');
  const locked = LobbyPreparationPanel({ ...props, selectedPresetId: 'brute_force', canUndoPreset: true, disabled: true,
    onApplyPreset: preset => actions.push(['apply', preset.id]), onUndoPreset: () => actions.push(['undo']) });
  assert.equal(button(locked, 'Make primary').props.disabled, true);
  assert.equal(button(locked, 'Undo preset').props.disabled, true);
  assert.equal(button(locked, `Apply ${PRESET_CONFIGS[0].nameEn}`).props.disabled, true);
  button(locked, 'Make primary').props.onClick();
  button(locked, 'Undo preset').props.onClick();
  button(locked, `Apply ${PRESET_CONFIGS[0].nameEn}`).props.onClick();
  assert.deepEqual(actions, [['view', 0], ['primary', 0]], 'locked mutation handlers must not emit changes');
});

test('command choices preserve their companion selection and disabled handlers cannot emit changes', () => {
  language = 'en';
  const changes = [];
  const initial = { ...commands.DEFAULT_COMMAND_PLAN };
  let tree = CommandPlanPanel({ value: initial, onChange: next => changes.push(next) });
  const rapid = nodes(tree).find(node => node.type === 'button' && content(node).includes('RAPID PURSUIT'));
  assert.ok(rapid);
  rapid.props.onClick();
  assert.deepEqual(changes[0], { doctrine_id: 'rapid_pursuit', contingency_id: 'cognitive_stabilizer' });
  tree = CommandPlanPanel({ value: changes[0], onChange: next => changes.push(next) });
  const throttle = nodes(tree).find(node => node.type === 'button' && content(node).includes('EMERGENCY THROTTLE'));
  assert.ok(throttle);
  throttle.props.onClick();
  assert.deepEqual(changes[1], { doctrine_id: 'rapid_pursuit', contingency_id: 'emergency_throttle' });
  assert.deepEqual(initial, commands.DEFAULT_COMMAND_PLAN);
  const locked = CommandPlanPanel({ value: changes[1], disabled: true, onChange: next => changes.push(next) });
  const lockedButtons = nodes(locked).filter(node => node.type === 'button');
  assert.equal(lockedButtons.length, 6);
  lockedButtons.forEach(node => {
    assert.equal(node.props.disabled, true);
    node.props.onClick();
  });
  assert.equal(changes.length, 2);
});

test('command panel localizes case context and quotes its automatic CP cost before selection', () => {
  const targetCase = { title: '测试案件', en: { title: 'Fixture case' } };
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(CommandPlanPanel, {
      value: commands.DEFAULT_COMMAND_PLAN, targetCase, disabled: true, id: 'command-fixture', labelledBy: 'command-tab',
    }));
    assert.ok(markup.includes(language === 'zh' ? '目标案件 测试案件' : 'TARGET Fixture case'));
    assert.ok(markup.includes(language === 'zh' ? '自动消耗 1 CP' : 'COSTS 1 CP'));
    assert.match(markup, /role="tabpanel"/);
    assert.match(markup, /aria-labelledby="command-tab"/);
    assert.equal((markup.match(/aria-pressed="true"/g) || []).length, 2);
    assert.equal((markup.match(/disabled=""/g) || []).length, 6);
  }
});
