import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { SKILL_TREES, LEVEL_XP_TABLE, getLevelFromXP } from '../src/game/agentProgression.js';
import * as investigationSkills from '../src/game/investigationSkills.js';

const source = readFileSync(new URL('../src/components/game/SkillTreePanel.jsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022,
} });

function harness(lang = 'zh') {
  const values = [];
  let cursor = 0;
  const react = { ...React, default: React, useCallback: fn => fn, useEffect() {}, useId: () => 'lobby-skill-tooltip',
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = initial;
      return [values[index], value => { values[index] = value; }];
    },
  };
  const imports = {
    react,
    '@/components/ui/Icon': { default: () => null },
    '@/game/agentProgression': { SKILL_TREES, getLevelFromXP },
    '@/game/investigationSkills.js': investigationSkills,
    '@/lib/lang.jsx': { useLang: () => ({ lang }) },
    '@/components/ui/usePresentationMotion': { usePresentationMotion: () => ({ motionEnabled: false, foreground: true }) },
  };
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected import: ${name}`);
    return imports[name];
  }, exports);
  return { ...exports, render(props) { cursor = 0; return exports.default(props); } };
}
function descendants(root, predicate) {
  if (!React.isValidElement(root)) return [];
  return [...(predicate(root) ? [root] : []), ...React.Children.toArray(root.props.children).flatMap(child => descendants(child, predicate))];
}
const nodes = root => descendants(root, node => node.type.name === 'SkillNode');
const bulk = root => descendants(root, node => node.type === 'button')[0];
const tooltip = root => descendants(root, node => node.type.name === 'SkillTooltip')[0];
const progressionAt = level => [0, 1, 2].map(() => ({ xp: LEVEL_XP_TABLE[level] }));

test('skill nodes distinguish level locks, missing prerequisites, readiness and equipped skills', () => {
  const { skillNodeState, reachableSkillIds } = harness();
  for (const skills of SKILL_TREES) {
    const [first, second, third] = skills;
    assert.equal(skillNodeState(skills, first.id, [], 1), 'locked');
    assert.equal(skillNodeState(skills, first.id, [], 4), 'available');
    assert.equal(skillNodeState(skills, second.id, [], 4), 'prerequisite');
    assert.equal(skillNodeState(skills, second.id, [first.id], 4), 'available');
    assert.equal(skillNodeState(skills, first.id, [first.id], 4), 'equipped');
    assert.equal(skillNodeState(skills, third.id, [second.id], 6), 'prerequisite', 'the entire chain is required');
    assert.equal(skillNodeState(skills, 'unknown', [], 10), 'locked');
    assert.deepEqual(reachableSkillIds(skills, 5), [first.id, second.id]);
  }
});

test('blocked skill buttons remain keyboard discoverable and explain their reason without writing a loadout', () => {
  for (const lang of ['zh', 'en']) {
    const h = harness(lang);
    const changes = [];
    const props = { agentIdx: 0, progression: progressionAt(4), onChange: value => changes.push(value) };
    let root = h.render(props);
    for (const index of [1, 2]) {
      const node = nodes(root)[index];
      const button = node.type(node.props);
      assert.equal(button.props.disabled, false);
      assert.equal(button.props['aria-disabled'], true);
      button.props.onFocus();
      button.props.onClick();
      root = h.render(props);
      const tip = tooltip(root);
      const html = renderToStaticMarkup(tip.type(tip.props));
      assert.match(html, index === 1 ? (lang === 'zh' ? /先装备前置技能「锐利感知」/ : /EQUIP PREREQUISITE: SHARP PERCEPTION/)
        : (lang === 'zh' ? /需要等级 6/ : /REQUIRES LEVEL 6/));
      assert.equal(nodes(root)[index].props.tooltipId, tip.props.id);
    }
    assert.deepEqual(changes, []);
  }
});

test('individual loadout edits enforce levels, preserve other agents and cascade prerequisite removal', () => {
  const h = harness();
  const other = ['s1_1'];
  const loadout = [{ agent_id: 'NEXUS-01', skill_ids: ['s0_1', 's0_2'] }, { agent_id: 'AURORA-09', skill_ids: other }];
  const original = JSON.stringify(loadout);
  const changes = [];
  const props = { agentIdx: 0, progression: progressionAt(4), loadout, onChange: value => changes.push(value) };
  const root = h.render(props);
  nodes(root)[2].props.onClick(SKILL_TREES[0][2]);
  assert.equal(changes.length, 0, 'calling the handler directly cannot bypass the level limit');
  nodes(root)[0].props.onClick(SKILL_TREES[0][0]);
  assert.equal(changes.length, 1);
  assert.deepEqual(changes[0], [{ agent_id: 'NEXUS-01', skill_ids: [] },
    { agent_id: 'AURORA-09', skill_ids: ['s1_1'] }, { agent_id: 'CIPHER-47', skill_ids: [] }]);
  assert.equal(JSON.stringify(loadout), original, 'the saved input remains unchanged');
});

test('equip-all creates a level-eligible complete chain and stays inert while cloud changes are disabled', () => {
  for (const agentIdx of [0, 1, 2]) {
    const h = harness();
    const changes = [];
    const props = { agentIdx, progression: progressionAt(5), loadout: [[], [], []], onChange: value => changes.push(value) };
    let root = h.render(props);
    bulk(root).props.onClick();
    assert.equal(changes.length, 1);
    assert.deepEqual(changes[0][agentIdx].skill_ids, SKILL_TREES[agentIdx].slice(0, 2).map(skill => skill.id));
    props.loadout = changes[0];
    assert.equal(bulk(h.render(props)).props.disabled, true, 'an already complete chain is not submitted again');
    props.loadout = [[], [], []];
    props.disabled = true;
    root = h.render(props);
    assert.equal(bulk(root).props.disabled, true);
    bulk(root).props.onClick();
    nodes(root)[0].props.onClick(SKILL_TREES[agentIdx][0]);
    assert.equal(changes.length, 1, 'neither shortcut nor single click can write while read-only or syncing');
  }
});

test('manual skill descriptions disclose compatibility and describe only actual crash-recovery and first-check effects', () => {
  for (const lang of ['zh', 'en']) {
    const h = harness(lang);
    const scanning = h.skillEffectScope(SKILL_TREES[0][1], lang);
    assert.match(scanning, lang === 'zh' ? /不会自动取证/ : /does not discover evidence automatically/);
    const firstCheck = h.skillEffectScope(SKILL_TREES[0][4], lang);
    assert.match(firstCheck, /1 AP/);
    assert.match(firstCheck, lang === 'zh' ? /仍需选择方法、消耗体力并推进一回合/ : /choose its method, spend stamina and advance one turn/);
    const crash = h.skillEffectScope(SKILL_TREES[1][4], lang);
    assert.match(crash, /5 AP/);
    assert.match(crash, lang === 'zh' ? /不会自动恢复或阻止崩溃/ : /Does not prevent crashes or recover automatically/);
    const legacy = h.skillEffectScope(SKILL_TREES[0][4], lang, 1);
    assert.match(legacy, lang === 'zh' ? /旧版自动调查.*一条当前区域可用线索/ : /Legacy investigation: reveal one available clue/);
    for (const version of [1, 2]) {
      for (const skill of [SKILL_TREES[1][0], SKILL_TREES[1][2], SKILL_TREES[2][0]]) {
        assert.match(h.skillEffectScope(skill, lang, version), lang === 'zh' ? /目前不提供.*加成或自动效果/ : /provides none of the described bonuses or automatic effects/);
      }
    }
    const props = { agentIdx: 0, progression: progressionAt(10), loadout: [['s0_1', 's0_2'], [], []] };
    const html = renderToStaticMarkup(h.render(props));
    assert.match(html, lang === 'zh' ? /已装备技能 · 适用范围/ : /EQUIPPED SKILLS · APPLICABILITY/);
    assert.doesNotMatch(html, /部署后真实生效|Applies after deployment|ACTIVE EFFECTS|已激活效果/);
    assert.match(html, lang === 'zh' ? /之后新开的案件/ : /newly started cases/);
  }
});

test('skill previews distinguish current benefits from frozen legacy and unmarked paid cases', () => {
  for (const lang of ['zh', 'en']) {
    for (const [investigationVersion, skillsRevision, current] of [[2, 1, true], [2, 0, false], [1, 0, false], [2, 2, false]]) {
      const h = harness(lang);
      const props = { agentIdx: 1, progression: progressionAt(10), investigationVersion, skillsRevision, disabled: true };
      nodes(h.render(props))[0].props.onFocus(SKILL_TREES[1][0].id);
      const tip = tooltip(h.render(props));
      const html = renderToStaticMarkup(tip.type(tip.props));
      if (current) {
        assert.match(html, lang === 'zh' ? /新调查效果：/ : /NEW INVESTIGATION EFFECT:/);
        assert.match(html, lang === 'zh' ? /混乱增量减少 1 点，每案最多 2 次/ : /Reduce confusion from a direct question by 1, up to twice per case/);
        assert.doesNotMatch(html, /CATALOG DESCRIPTION|原始技能说明/);
      } else {
        assert.match(html, lang === 'zh' ? /原始技能说明（以适用范围为准）/ : /CATALOG DESCRIPTION \(CHECK APPLICABILITY\)/);
        assert.match(html, lang === 'zh' ? /目前不提供.*加成或自动效果/ : /provides none of the described bonuses or automatic effects/);
        assert.doesNotMatch(html, /NEW INVESTIGATION EFFECT|新调查效果/);
      }
    }
  }
});
