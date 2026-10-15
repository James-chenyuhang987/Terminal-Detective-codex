import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { investigationTutorialStage } from '../src/game/investigationTutorial.js';
import { buildInvestigationReconstruction } from '../src/game/investigationReconstruction.js';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';
import { agentAdvancementSummary } from '../src/game/settlementPresentation.js';
import * as progression from '../src/game/agentProgression.js';
import { normalizeAgentProgression } from '../src/game/playerProfile.js';

let lang = 'zh';
function loadComponent(path, imports = {}) {
  const source = readFileSync(new URL(`../src/components/game/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  const shared = { react: { ...React, default: React }, '@/lib/lang.jsx': { useLang: () => ({ lang }) },
    '@/game/investigationChoices.js': { localizedInvestigationText }, ...imports };
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(shared, id), `Unexpected presentation dependency ${id}`);
    return shared[id];
  }, exports);
  return exports;
}
const state = {
  run_id: 'run-a', unlocked_clues: ['a', 'b'], revealed_clues: [
    { clue_id: 'a', keyword: '门禁记录', description: '两组签章', en: { keyword: 'Access record', description: 'Two signatures' } },
    { clue_id: 'b', keyword: '现场样本', description: '样本已密封', en: { keyword: 'Scene sample', description: 'Sample sealed' } },
    { clue_id: 'secret', keyword: 'UNSEEN ANSWER', description: 'UNSEEN DESCRIPTION' },
  ],
};
const investigation = {
  completed_checks: [{ target_id: 'reader', clue_ids: ['a'], expert_note: { zh: '分别整理', en: 'Group separately' } }],
  targets: [{ target_id: 'reader', label: { zh: '读卡器', en: 'Reader' } }],
  testimony_stages: { witness: 1 },
  testimony_records: { witness: [
    { stage: 2, response: { zh: 'FUTURE CONFESSION', en: 'FUTURE CONFESSION' }, evidence_ids: ['secret'] },
    { stage: 1, response: { zh: '我看见有人经过', en: 'I saw someone pass' }, evidence_ids: ['a', 'secret'] },
    { stage: 1, response: 'DUPLICATE CLAIM', evidence_ids: ['b'] },
  ] },
  propositions: [
    { id: 'sequence', a: 'a', b: 'b', relation: 'precedes', label: { zh: '门禁先于采样', en: 'Access precedes sampling' } },
    { id: 'corroboration', a: 'b', b: 'a', relation: 'supports', label: { zh: '两份记录互相支持', en: 'The records corroborate' } },
    { id: 'secret', a: 'a', b: 'secret', relation: 'precedes', label: 'HIDDEN ORDER' },
    { id: 'unsupported', a: 'a', b: 'b', relation: 'invented', label: 'UNSUPPORTED RELATION' },
  ], puzzle: { completed: false },
};

test('progressive tutorial follows real acquired milestones and restores the relevant lesson', () => {
  const options = { state: { unlocked_clues: [], revealed_clues: [] }, investigation: {}, theaterMode: true };
  assert.equal(investigationTutorialStage(options), 'move');
  assert.equal(investigationTutorialStage({ ...options, progress: { forward: true } }), 'move', 'a key press does not prove actual movement');
  assert.equal(investigationTutorialStage({ ...options, progress: { moved: true } }), 'observe');
  assert.equal(investigationTutorialStage({ ...options, progress: { observed: true } }), 'verify');
  assert.equal(investigationTutorialStage({ ...options, investigation: { completed_checks: [{}] } }), 'verify', 'an unsuccessful check does not grant evidence');
  assert.equal(investigationTutorialStage({ ...options, state, investigation: {} }), 'testimony');
  assert.equal(investigationTutorialStage({ ...options, state, investigation: { ...investigation, propositions: [] } }), 'deduction');
  assert.equal(investigationTutorialStage({ ...options, state, investigation }), 'report');
  assert.equal(investigationTutorialStage({ ...options, state, investigation, progress: { reportOpened: true } }), null);
  assert.equal(investigationTutorialStage({ ...options, investigationVersion: 1 }), null, 'legacy keeps its existing full guide');
  assert.equal(investigationTutorialStage({ ...options, theaterMode: false }), 'observe', 'text players never need to move in 3D');
  assert.equal(investigationTutorialStage({ ...options, state, investigation: { ...investigation, testimony_stages: {} } }), 'testimony', 'future testimony records cannot skip the testimony lesson');
});

function descendants(element, type) {
  if (!React.isValidElement(element)) return [];
  return [...(element.type === type ? [element] : []), ...React.Children.toArray(element.props.children).flatMap(child => descendants(child, type))];
}

test('hints can be dismissed per milestone and run without trapping focus or pausing movement', () => {
  let dismissed = {};
  let opened = 0;
  const guide = loadComponent('ProgressiveInvestigationGuide.jsx', {
    react: { ...React, default: React, useState: () => [dismissed, update => { dismissed = update(dismissed); }] },
    '@/game/investigationTutorial.js': { investigationTutorialStage }, './progressiveInvestigationGuide.css': {},
  }).default;
  const props = { gameState: { run_id: 'first' }, investigation: {}, theaterMode: true, onOpenGuide: () => opened++ };
  let tree = guide(props);
  let markup = renderToStaticMarkup(tree);
  assert.match(markup, /data-tutorial-stage="move"/);
  assert.doesNotMatch(markup, /role="dialog"|aria-modal|autofocus|tabindex="-1"/);
  assert.match(markup, /<details><summary>/);
  const buttons = descendants(tree, 'button');
  buttons[0].props.onClick();
  assert.equal(opened, 1, 'the complete course remains available explicitly');
  buttons[1].props.onClick();
  assert.equal(guide(props), null);
  tree = guide({ ...props, progress: { moved: true } });
  assert.match(renderToStaticMarkup(tree), /data-tutorial-stage="observe"/);
  assert.match(renderToStaticMarkup(guide({ ...props, gameState: { run_id: 'second' } })), /data-tutorial-stage="move"/);
  assert.equal(guide({ ...props, active: false, gameState: { run_id: 'second' } }), null);
});

test('evidence reconstruction excludes undiscovered clues, future testimony and unsupported order', () => {
  const snapshot = JSON.stringify({ state, investigation });
  for (lang of ['zh', 'en']) {
    const record = buildInvestigationReconstruction({ state, investigation, npcs: [{ npc_id: 'witness', name: 'Witness' }], lang });
    assert.deepEqual(record.clues.map(clue => clue.clue_id), ['a', 'b']);
    assert.deepEqual(record.relations.map(item => item.id), ['sequence', 'corroboration']);
    assert.deepEqual(record.relations.map(item => item.relation), ['precedes', 'supports']);
    assert.equal(record.testimonies.length, 1);
    assert.equal(record.testimonies[0].stage, 1);
    assert.deepEqual(record.testimonies[0].clues.map(clue => clue.clue_id), ['a']);
    assert.equal(record.testimonies[0].response, investigation.testimony_records.witness[1].response[lang]);
    assert.equal(record.clues[0].keyword, lang === 'zh' ? '门禁记录' : 'Access record');
    assert.equal(JSON.stringify(record).includes('UNSEEN'), false);
    assert.equal(JSON.stringify(record).includes('FUTURE'), false);
    assert.equal(record.relations.some(item => Object.hasOwn(item, 'timestamp')), false, 'review must never invent event times');
  }
  assert.equal(JSON.stringify({ state, investigation }), snapshot);
  assert.deepEqual(buildInvestigationReconstruction({ state: {}, investigation: null }).clues, [], 'legacy and empty runs remain readable');
});

test('ending review provides keyboard-expandable references and distinguishes testimony from facts', () => {
  const reference = loadComponent('investigation/EvidenceReference.jsx', { './evidenceArchive.css': {} });
  const review = loadComponent('investigation/CaseReconstruction.jsx', {
    '@/game/investigationReconstruction.js': { buildInvestigationReconstruction },
    './EvidenceReference.jsx': reference, './CaseStoryPanel.jsx': { default: () => null }, './caseReconstruction.css': {},
    './EvidenceReportExplanation.jsx': { default: () => null },
  }).default;
  for (lang of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(review, { gameState: state, investigation, npcs: [{ npc_id: 'witness', name: 'Witness' }] }));
    assert.ok(markup.includes(lang === 'zh' ? '只有明确的“先于”关系表示事件顺序' : 'Only explicit “Precedes” relations establish event order'));
    assert.ok(markup.includes(lang === 'zh' ? '人物陈述' : 'Personal account'));
    assert.ok(markup.includes(lang === 'zh' ? '分别整理' : 'Group separately'));
    assert.ok(markup.includes(lang === 'zh' ? '两组签章' : 'Two signatures'));
    assert.doesNotMatch(markup, /UNSEEN|FUTURE|HIDDEN ORDER|UNSUPPORTED RELATION|DUPLICATE CLAIM/);
    assert.match(markup, /<details[^>]*><summary>/);
    assert.doesNotMatch(markup, /<form|<button|datetime=/);
    const empty = renderToStaticMarkup(React.createElement(review, { gameState: {} }));
    assert.ok(empty.includes(lang === 'zh' ? '本局没有已保全的证据' : 'No evidence was secured'));
  }
});

test('confirmed agent progression is aggregated once per agent with only newly unlocked skills', () => {
  const oldProg = [{ xp: 250 }, { xp: 0 }, { xp: 700 }];
  const newProg = [{ xp: 1400 }, { xp: 700 }, { xp: 700 }];
  const summary = agentAdvancementSummary(oldProg, newProg);
  assert.deepEqual(summary.map(item => [item.agentIdx, item.fromLevel, item.toLevel]), [[0, 2, 6], [1, 0, 4]]);
  assert.deepEqual(summary.map(item => item.newSkills.map(skill => skill.unlock_level)), [[4, 6], [2, 4]]);
  assert.deepEqual(agentAdvancementSummary(oldProg, null), [], 'unconfirmed settlement shows no awarded advancement');
  assert.deepEqual(agentAdvancementSummary(newProg, oldProg), [], 'no invented gain on stale or lower XP');
  const source = readFileSync(new URL('../src/components/game/GameOverScreen.jsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf('<CaseReconstruction') < source.indexOf('{/* XP breakdown */}'));
  assert.doesNotMatch(source, /modalQueue|currentModal|<LevelUpModal/);
});

test('actual ending screen renders one expandable summary for several simultaneous promotions', () => {
  const oldProg = normalizeAgentProgression([{ xp: 250 }, { xp: 0 }, { xp: 700 }]);
  const newProg = normalizeAgentProgression([{ xp: 1400 }, { xp: 700 }, { xp: 700 }]);
  const injected = [{ total: 100, base: 100 }, oldProg, { level: 1, xp: 0 }, newProg, { level: 2, xp: 0 }, 'xp', 'saved'];
  let cursor = 0;
  const noop = () => {};
  const inertReact = { ...React, default: React, useState(initial) {
    return [cursor < injected.length ? injected[cursor++] : typeof initial === 'function' ? initial() : initial, noop];
  }, useEffect: noop, useRef: value => ({ current: value }), useCallback: callback => callback };
  const Ending = loadComponent('GameOverScreen.jsx', {
    react: inertReact,
    '@/components/ui/Icon': { default: () => null, IconText: ({ text }) => text },
    '@/game/agentProgression': progression,
    '@/game/playerProfile': { DETECTIVE_LEVEL_CAP: 50, XP_PER_LEVEL: 100, normalizeAgentProgression },
    '@/lib/ProfileContext.jsx': { useProfile: () => ({ profile: {} }) },
    '@/components/game/investigation/CaseReconstruction.jsx': { default: () => React.createElement('section', null, 'Acquired record') },
    '@/game/settlementPresentation.js': { agentAdvancementSummary },
    '@/game/caseEvaluation': { normalizeCaseScore: score => score },
    '@/components/ui/usePresentationMotion': { usePresentationMotion: () => ({ motionEnabled: false }) },
    '@/components/ui/SlicedTitle': { default: ({ children }) => React.createElement('h1', null, children) },
    '@/lib/settings.jsx': { useSettings: () => ({ settings: { particles: false } }) },
  }).default;
  lang = 'en';
  const tree = Ending({ gameState: { ...state, action_points_left: 5 }, caseData: { title: 'Case', clue_dictionary: [] }, judgeResult: { score: 'B', is_passed: true } });
  const markup = renderToStaticMarkup(tree);
  assert.equal((markup.match(/class="td-advancement-summary"/g) || []).length, 1);
  assert.match(markup, /2 agents advanced/);
  assert.match(markup, /EVIDENCE ASSOCIATION/);
  assert.match(markup, /COGNITIVE ACCELERATION/);
  assert.doesNotMatch(markup, /role="dialog"|SHARP PERCEPTION/);
});

test('steady exploration keeps AP visible and moves secondary vitals behind a native status disclosure', () => {
  const hud = loadComponent('theater/TheaterStatusHUD.jsx');
  const normal = { action_points_left: 12, current_hp: 100, confusion_score: 5, turn_count: 3 };
  assert.deepEqual(hud.theaterStatusWarnings(normal), { ap: false, hp: false, confusion: false, crisis: false });
  for (lang of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(hud.default, { gameState: normal, evidenceCount: 2 }));
    assert.match(markup, /AP <b>12<\/b>/);
    assert.doesNotMatch(markup, /td-theater-status-alert|is-warning/);
    assert.match(markup, /<details[^>]*><summary>/);
    assert.ok(markup.includes(lang === 'zh' ? '已保全线索' : 'Secured clues'));
    assert.match(markup, /<dd>2<\/dd>/);
    const danger = renderToStaticMarkup(React.createElement(hud.default, { gameState: { ...normal, action_points_left: 2, current_hp: 25, confusion_score: 70 }, crisisPending: true }));
    assert.match(danger, /class="is-warning"/);
    assert.match(danger, /role="status" aria-live="polite"/);
    assert.ok(danger.includes(lang === 'zh' ? '现场危机' : 'Field crisis'));
    assert.ok(danger.indexOf('70%') < danger.indexOf('<details'), 'abnormal vitals remain visible without expanding status');
  }
});

test('field subtitles expire once per new public line and keep their full notebook record intact', () => {
  let expired = null;
  let dependencies = [];
  let cleanup;
  let timerId = 0;
  const timers = new Map();
  const timerWindow = {
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  };
  const source = readFileSync(new URL('../src/components/game/theater/TheaterStatusHUD.jsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('TheaterStatusHUD.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
  const hook = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'useFieldTransmission');
  const run = compileFunction(`${hook.getText().replace(/^export\s+/, '')}\nreturn useFieldTransmission;`, ['useState', 'useEffect', 'window'])(
    () => [expired, value => { expired = value; }],
    (effect, next) => {
      if (next.length === dependencies.length && next.every((value, i) => Object.is(value, dependencies[i]))) return;
      cleanup?.(); dependencies = next; cleanup = effect();
    }, timerWindow,
  );
  const lines = [{ id: 'first', type: 'narration', text: 'Original record' }];
  assert.strictEqual(run(lines[0], true), lines[0]);
  assert.equal([...timers.values()][0].delay, 6500);
  run(lines[0], true);
  assert.equal(timerId, 1, 'a rerender does not restart the caption timer');
  [...timers.values()][0].callback();
  assert.equal(run(lines[0], true), null);
  assert.equal(lines[0].text, 'Original record', 'only the subtitle view expires, never the notebook line');
  const urgent = { id: 'second', type: 'error', text: 'Known alert' };
  assert.strictEqual(run(urgent, true), urgent);
  assert.equal([...timers.values()].at(-1).delay, 11000);
  assert.equal(run(urgent, false), null);
  assert.equal(timers.size, 0, 'background transition cleans up the caption timer');
});
