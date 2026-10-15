import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import * as specialty from '../src/game/specialtySystem.js';
import * as team from '../src/game/teamConfig.js';
import { normalizeCommandPlan } from '../src/game/commandSystem.js';
import { DEFAULT_AGENT_IDS, getOwnedAgentIds, normalizeCoreAgentIds } from '../src/game/agentMarket.js';

const plain = value => JSON.parse(JSON.stringify(value));
const hookSource = readFileSync(new URL('../src/components/game/lobby/useTeamBuilder.js', import.meta.url), 'utf8');

// Exercise the real hook callbacks across renders, retaining its state and
// refs. No DOM or production session is needed to test the local draft.
function builderHarness(initialProfile = {}) {
  const cells = [];
  let cursor = 0;
  const context = vm.createContext({
    ...specialty, ...team, normalizeCommandPlan, DEFAULT_AGENT_IDS, getOwnedAgentIds, normalizeCoreAgentIds,
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial;
      return [cells[index], value => {
        cells[index] = typeof value === 'function' ? value(cells[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useMemo: callback => callback(),
    useCallback: callback => callback,
  });
  const useTeamBuilder = vm.runInContext(`${hookSource.replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export function useTeamBuilder', 'function useTeamBuilder')}\nuseTeamBuilder;`, context);
  let profile = initialProfile;
  return {
    render(nextProfile = profile) {
      profile = nextProfile;
      cursor = 0;
      return useTeamBuilder(profile);
    },
  };
}

test('specialty normalization retains legal whole points within role, budget and effective cap', () => {
  const normalize = specialty.normalizeSpecialtyAllocation;
  assert.deepEqual(normalize(0, { hack_level: 20, logic_power: 12.8, confusion_resistance: 15, unknown: 99 }),
    { logic_power: 12, confusion_resistance: 8 });
  assert.deepEqual(normalize(2, { hack_level: 20, ap_cost_discount: 20 }, { hack_level: 7, ap_cost_discount: 5 }),
    { hack_level: 13, ap_cost_discount: 7 });
  assert.deepEqual(normalize(0, { logic_power: 20 }, { logic_power: 7 }), { logic_power: 13 });
  assert.equal(specialty.specRemaining(normalize(0, { logic_power: 20 }, { logic_power: 7 })), 7);
  for (const input of [null, [], '20', 20]) assert.deepEqual(normalize(0, input), {});
  assert.deepEqual(normalize(0, { logic_power: Infinity, confusion_resistance: NaN }), {});
  assert.deepEqual(normalize(0, { logic_power: '20', confusion_resistance: -1 }), {});
  assert.deepEqual(normalize(-1, { logic_power: 20 }), {});
  const reversed = { confusion_resistance: 20, logic_power: 20 };
  assert.deepEqual(normalize(0, reversed), normalize(0, { logic_power: 20, confusion_resistance: 20 }));
  assert.deepEqual(reversed, { confusion_resistance: 20, logic_power: 20 });
});

test('viewing and editing another operative keeps the explicitly assigned primary', () => {
  const harness = builderHarness();
  let builder = harness.render();
  assert.equal(builder.primaryAgentIdx, 1);
  builder.setSelectedIdx(2);
  builder = harness.render();
  builder.updateSpec({ hack_level: 20, observation_focus: 99 });
  builder = harness.render();
  assert.equal(builder.selectedIdx, 2);
  assert.equal(builder.currentConfig().primary_agent_index, 1);
  assert.deepEqual(plain(builder.specs[2]), { hack_level: 20 });
  builder.setPrimaryAgentIdx(0);
  builder = harness.render();
  assert.equal(builder.selectedIdx, 2);
  assert.equal(builder.currentConfig().primary_agent_index, 0);
});

test('owned upgraded cores return capped points on initial load, preset application and replacement', () => {
  const profile = {
    reward_claims: ['agent:SOVEREIGN-01', 'agent:SERAPH-88'],
    saved_team_config: {
      specs: [{ logic_power: 20 }, { observation_focus: 20 }, {}],
      core_agent_ids: ['SOVEREIGN-01', 'AURORA-09', 'CIPHER-47'], primary_agent_index: 2,
    },
  };
  const harness = builderHarness(profile);
  let builder = harness.render();
  assert.equal(builder.coreAgentIds[0], 'SOVEREIGN-01');
  assert.deepEqual(plain(builder.specs[0]), { logic_power: 13 });
  const applied = builder.applyPreset({ specs: [{ logic_power: 20 }, { observation_focus: 20 }, { hack_level: 20 }] });
  assert.deepEqual(plain(applied.specs[0]), { logic_power: 13 });
  builder = harness.render();
  assert.equal(builder.replaceCoreAgent(1, 'SERAPH-88'), true);
  builder = harness.render();
  assert.equal(builder.selectedIdx, 1);
  assert.equal(builder.primaryAgentIdx, 2);
  assert.equal(builder.canUndoPreset, false);
  assert.deepEqual(plain(builder.specs[1]), { observation_focus: 13 });
  assert.equal(specialty.specRemaining(builder.specs[1]), 7);
  assert.equal(builder.replaceCoreAgent(0, 'SERAPH-88'), false);
});

test('preset undo restores only specs and priorities once, keeping core, commander and doctrine choices', () => {
  const harness = builderHarness();
  let builder = harness.render();
  const original = plain(builder.currentConfig());
  const preset = { specs: [{ logic_power: 20 }, { observation_focus: 20 }, { hack_level: 20 }],
    priorities: [['check_alibi'], ['examine_clue'], ['hack_terminal']] };
  builder.applyPreset(preset);
  preset.specs[0].logic_power = 1;
  builder = harness.render();
  assert.equal(builder.canUndoPreset, true);
  assert.equal(builder.specs[0].logic_power, 20);
  builder.setPrimaryAgentIdx(0);
  builder.setCommandPlan({ doctrine_id: 'rapid_pursuit', contingency_id: 'emergency_throttle' });
  builder.setSelectedIdx(2);
  builder = harness.render();
  assert.equal(builder.undoPreset(), true);
  assert.equal(builder.undoPreset(), false);
  builder = harness.render();
  assert.deepEqual(plain(builder.specs), original.specs);
  assert.deepEqual(plain(builder.priorities), original.priorities);
  assert.deepEqual(plain(builder.coreAgentIds), original.core_agent_ids);
  assert.equal(builder.primaryAgentIdx, 0);
  assert.equal(builder.selectedIdx, 2);
  assert.equal(builder.commandPlan.doctrine_id, 'rapid_pursuit');
  assert.equal(builder.canUndoPreset, false);
});

test('manual specialty or priority changes invalidate preset undo instead of overwriting later edits', () => {
  for (const edit of [builder => builder.updateSpec({ observation_focus: 8 }),
    builder => builder.updatePriority(1, ['check_alibi'])]) {
    const harness = builderHarness();
    let builder = harness.render();
    builder.applyPreset({ specs: [{ logic_power: 20 }, { observation_focus: 20 }, { hack_level: 20 }] });
    builder = harness.render();
    const undoFromPreviousRender = builder.undoPreset;
    edit(builder);
    assert.equal(undoFromPreviousRender(), false);
    builder = harness.render();
    assert.equal(builder.canUndoPreset, false);
    assert.equal(builder.undoPreset(), false);
  }
});

test('restoring a saved formation normalizes allocations and restores both view and primary', () => {
  const harness = builderHarness();
  let builder = harness.render();
  assert.equal(builder.loadSaved(), false);
  builder.applyPreset({ specs: [{ logic_power: 20 }, { observation_focus: 20 }, { hack_level: 20 }] });
  builder = harness.render({ reward_claims: ['agent:SOVEREIGN-01'], saved_team_config: {
    specs: [{ logic_power: 20, hack_level: 99 }, {}, {}], primary_agent_index: 0,
    core_agent_ids: ['SOVEREIGN-01', 'AURORA-09', 'CIPHER-47'],
    command_plan: { doctrine_id: 'steady_control', contingency_id: 'evidence_lockdown' },
  } });
  assert.equal(builder.loadSaved(), true);
  builder = harness.render();
  assert.equal(builder.selectedIdx, 0);
  assert.equal(builder.primaryAgentIdx, 0);
  assert.equal(builder.canUndoPreset, false);
  assert.deepEqual(plain(builder.specs[0]), { logic_power: 13 });
  assert.equal(builder.commandPlan.doctrine_id, 'steady_control');
});

test('specialty read-only mode disables every actual allocation button', () => {
  const source = readFileSync(new URL('../src/components/game/SpecialtyAttrPanel.jsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source.replace(/^import[\s\S]*?;\n/gm, '')
    .replace('export default function SpecialtyAttrPanel', 'function SpecialtyAttrPanel'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
  }).outputText;
  const context = vm.createContext({ React, ...specialty, useLang: () => ({ lang: 'zh' }),
    noirColor: value => value, IconText: ({ text }) => React.createElement('span', null, text) });
  const Component = vm.runInContext(`${code}\nSpecialtyAttrPanel;`, context);
  const props = { agentIdx: 0, spec: { logic_power: 5 }, onSpecChange() {}, agentColor: '#00e5ff' };
  const readOnly = renderToStaticMarkup(React.createElement(Component, { ...props, disabled: true }));
  const buttons = readOnly.match(/<button\b[^>]*>/g);
  assert.equal(buttons.length, 4);
  assert.ok(buttons.every(button => button.includes('disabled=""')));
  const editable = renderToStaticMarkup(React.createElement(Component, props));
  assert.ok((editable.match(/<button\b[^>]*>/g) || []).some(button => !button.includes('disabled=""')));
});
