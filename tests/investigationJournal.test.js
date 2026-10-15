import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { localizedInvestigationText } from '../src/game/investigationChoices.js';

let language = 'zh';
function loadComponent(filename, imports) {
  const source = readFileSync(new URL(`../src/components/game/investigation/${filename}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected journal dependency ${id}`);
    return imports[id];
  }, exports);
  return exports;
}
const imports = {
  react: { ...React, default: React },
  '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
  '@/game/investigationChoices.js': { localizedInvestigationText },
  './evidenceArchive.css': {},
  './investigationJournal.css': {},
};
const reference = loadComponent('EvidenceReference.jsx', imports);
const evidenceLibrary = loadComponent('EvidenceLibrary.jsx', { ...imports, './EvidenceReference.jsx': reference });
const interviewHistory = loadComponent('InterviewHistory.jsx', { ...imports, './interviewHistory.css': {} });
const journalImports = { ...imports, './EvidenceLibrary.jsx': evidenceLibrary, './InterviewHistory.jsx': interviewHistory };
const Journal = loadComponent('InvestigationJournal.jsx', journalImports).default;
const fixture = {
  clues: [
    { clue_id: 'access', keyword: { zh: '门禁原始记录', en: 'Original access record' },
      description: { zh: '记录保留了两种不同的硬件签章。', en: 'The record retains two different hardware signatures.' } },
    { clue_id: 'sample', keyword: { zh: '现场样本', en: 'Scene sample' },
      description: { zh: '现场样本已封存，等待交叉核对。', en: 'The scene sample is sealed for cross-checking.' } },
  ],
  newClueIds: ['sample'],
  sources: { access: { zh: '北门读卡器', en: 'North gate reader' } },
  expertNotes: { access: { zh: '先核对签章，再整理时间。', en: 'Check the signatures before ordering events.' } },
  npcs: [
    { npc_id: 'witness', name: { zh: '目击者', en: 'Witness' }, role: { zh: '现场联系人', en: 'Scene contact' }, initial_statement: 'OLD_ACCOUNT' },
    { npc_id: 'guard', name: { zh: '值班保安', en: 'Duty guard' } },
  ],
  investigation: {
    initial_statements: {
      witness: { zh: '我听到了两次开门声。', en: 'I heard the door open twice.' },
      guard: { zh: '我在值班室核对交接表。', en: 'I checked the handover sheet in the duty room.' },
    },
    testimony_stages: { witness: 1, guard: 0 },
    testimony_records: { witness: [{ stage: 1,
      response: { zh: '第二次声音来自北门，我没有看到进门的人。', en: 'The second sound came from the north gate; I did not see who entered.' },
      evidence_ids: ['access', 'access'],
    }] },
    propositions: [{ id: 'known-order', label: { zh: '门禁记录早于现场样本的封存时间。', en: 'The access record precedes the sealing of the scene sample.' },
      a: 'access', b: 'sample', relation: 'precedes' }],
  },
};
const render = props => renderToStaticMarkup(React.createElement(Journal, props));

test('earned interview backgrounds and recorded claims survive refresh with their unverified status and stage boundary', () => {
  const acquired = structuredClone(fixture);
  acquired.investigation.interview_revision = 1;
  acquired.investigation.interview_records = { witness: [
    { stage: 0, kind: 'background', response: { zh: '我负责夜班交接。', en: 'I handled the night handover.' } },
    { stage: 0, kind: 'claim', response: { zh: '当时我只听到一次开门。', en: 'I heard the door only once then.' } },
    { stage: 2, kind: 'claim', response: 'UNREACHED_STAGE' },
    { stage: 0, kind: 'private_answer', response: 'INVALID_KIND' },
  ] };
  acquired.investigation.testimony_records.witness[0].prior_claim = acquired.investigation.interview_records.witness[1].response;
  const before = JSON.stringify(acquired);
  for (language of ['zh', 'en']) {
    const markup = render(acquired);
    assert.ok(markup.includes(acquired.investigation.interview_records.witness[0].response[language]));
    assert.ok(markup.includes(acquired.investigation.interview_records.witness[1].response[language]));
    assert.ok(markup.includes(language === 'zh' ? '对峙前固定说法' : 'Account recorded before confrontation'));
    assert.ok(markup.includes(language === 'zh' ? '核对证据后的补充' : 'Follow-up after checking evidence'));
    assert.doesNotMatch(markup, /UNREACHED_STAGE|INVALID_KIND/);
    assert.match(markup, /<details class="td-interview-history">/);
  }
  assert.equal(JSON.stringify(acquired), before);
  delete acquired.investigation.interview_revision;
  assert.equal(render(acquired).includes('td-interview-history'), false);
});

test('a serialized public refresh fixture restores complete known evidence, testimony and deductions without replaying commands', () => {
  const refreshed = JSON.parse(JSON.stringify(fixture));
  const before = JSON.stringify(refreshed);
  for (language of ['zh', 'en']) {
    const markup = render(refreshed);
    for (const record of refreshed.clues) {
      assert.ok(markup.includes(record.keyword[language]));
      assert.ok(markup.includes(record.description[language]));
    }
    assert.ok(markup.includes(refreshed.sources.access[language]));
    assert.ok(markup.includes(refreshed.expertNotes.access[language]));
    for (const statement of Object.values(refreshed.investigation.initial_statements)) {
      assert.ok(markup.includes(statement[language]));
    }
    const response = refreshed.investigation.testimony_records.witness[0].response;
    assert.ok(markup.includes(response[language]));
    assert.equal(markup.includes(response[language === 'zh' ? 'en' : 'zh']), false);
    assert.ok(markup.includes(refreshed.investigation.propositions[0].label[language]));
    assert.match(markup, /aria-hidden="true"> → /, 'temporal deductions must preserve their direction');
    assert.equal(markup.includes('OLD_ACCOUNT'), false, 'authoritative public initial accounts override the legacy fallback');
    assert.ok(markup.includes(language === 'zh' ? '人物陈述需结合证据判断' : 'Personal accounts must be checked against evidence'));
    assert.ok(markup.includes(language === 'zh' ? '不代表整案结论已经成立' : 'does not establish the whole case'));
    assert.doesNotMatch(markup, /<form|<textarea|contenteditable|data-dimension|SUBMIT|提交结案报告/,
      'reviewing records cannot attach report evidence, spend resources or save handwritten notes');
  }
  assert.equal(JSON.stringify(refreshed), before, 'reading a refreshed snapshot must not mutate its authority data');
});

test('future testimony, unknown evidence endpoints and private case fields never appear in the journal', () => {
  const guarded = JSON.parse(JSON.stringify(fixture));
  guarded.investigation.testimony_records.witness.push({ stage: 2, response: 'FUTURE_FOLLOW_UP', evidence_ids: ['hidden-evidence'] });
  guarded.investigation.testimony_records.witness[0].evidence_ids.push('UNREVEALED_REFERENCE_ID');
  guarded.investigation.testimony_records.unknown_npc = [{ stage: 1, response: 'UNKNOWN_NPC_ACCOUNT' }];
  guarded.investigation.testimony_stages.unknown_npc = 2;
  guarded.investigation.testimonies = { witness: { stages: ['PRIVATE_FUTURE_TESTIMONY'] } };
  guarded.investigation.report_answer = 'PRIVATE_REPORT_ANSWER';
  guarded.investigation.hidden_clue = { clue_id: 'hidden-evidence', keyword: 'HIDDEN_EVIDENCE_TITLE' };
  guarded.investigation.propositions.push(
    { id: 'private-edge', a: 'access', b: 'hidden-evidence', relation: 'supports', label: 'UNREVEALED_DEDUCTION' },
    { id: 'private-edge-2', a: 'hidden-evidence', b: 'sample', relation: 'supports', label: 'UNREVEALED_DEDUCTION_2' },
  );
  for (language of ['zh', 'en']) {
    const markup = render(guarded);
    assert.doesNotMatch(markup, /FUTURE_FOLLOW_UP|UNREVEALED_REFERENCE_ID|UNKNOWN_NPC_ACCOUNT|PRIVATE_|HIDDEN_EVIDENCE_TITLE|UNREVEALED_DEDUCTION|hidden-evidence/);
    const references = markup.match(/<p class="td-journal-references"><strong>[^<]+<\/strong>([^<]+)<\/p>/);
    assert.equal(references[1], guarded.clues[0].keyword[language], 'reference names are known-only and deduplicated');
    assert.ok(markup.includes(guarded.investigation.testimony_records.witness[0].response[language]));
  }
});

test('only acquired stages become visible and every confirmed relationship retains its public wording', () => {
  language = 'en';
  const acquired = JSON.parse(JSON.stringify(fixture));
  acquired.investigation.testimony_stages.witness = 2;
  acquired.investigation.testimony_records.witness.unshift({ stage: 2, response: 'SECOND_ACQUIRED_ACCOUNT', evidence_ids: ['sample'] });
  acquired.investigation.testimony_records.witness.push(
    { stage: 0, response: 'INVALID_ZERO_STAGE' },
    { stage: 3, response: 'INVALID_THIRD_STAGE' },
  );
  acquired.investigation.propositions.push(
    { id: 'known-support', a: 'access', b: 'sample', relation: 'supports', label: 'KNOWN_SUPPORT' },
    { id: 'known-conflict', a: 'sample', b: 'access', relation: 'contradicts', label: 'KNOWN_CONTRADICTION' },
  );
  const markup = render(acquired);
  const first = acquired.investigation.testimony_records.witness[1].response.en;
  assert.ok(markup.indexOf(first) < markup.indexOf('SECOND_ACQUIRED_ACCOUNT'), 'records remain in stage order after refresh');
  assert.match(markup, /KNOWN_SUPPORT|KNOWN_CONTRADICTION/);
  assert.match(markup, /Confirmed · Supports/);
  assert.match(markup, /Confirmed · Contradicts/);
  assert.doesNotMatch(markup, /INVALID_ZERO_STAGE|INVALID_THIRD_STAGE/);
  acquired.investigation.testimony_stages.witness = 0;
  const untouched = render(acquired);
  assert.equal(untouched.includes(first), false);
  assert.equal(untouched.includes('SECOND_ACQUIRED_ACCOUNT'), false);
  assert.match(untouched, /No follow-up testimony recorded yet/);
});

test('version-one and empty records remain readable without fabricating follow-ups or deductions', () => {
  for (language of ['zh', 'en']) {
    const empty = render({});
    assert.ok(empty.includes(language === 'zh' ? '尚未取得证据' : 'No evidence secured yet'));
    assert.ok(empty.includes(language === 'zh' ? '暂无可回看的证词记录' : 'No testimony records to review yet'));
    assert.ok(empty.includes(language === 'zh' ? '尚无已确认命题' : 'No confirmed deductions yet'));
    const legacy = render({ clues: fixture.clues, investigation: null,
      npcs: [{ npc_id: 'legacy', name: 'Known legacy witness', initial_statement: 'Known legacy initial statement' }] });
    assert.match(legacy, /Known legacy initial statement/);
    assert.ok(legacy.includes(language === 'zh' ? '尚未取得补充证词' : 'No follow-up testimony recorded yet'));
    assert.doesNotMatch(legacy, /undefined|\[object Object\]|PRIVATE_|FUTURE_/);
  }
});

function descendants(root, predicate) {
  if (!React.isValidElement(root)) return [];
  return [...(predicate(root) ? [root] : []), ...React.Children.toArray(root.props.children).flatMap(child => descendants(child, predicate))];
}

test('journal tabs support keyboard and touch while keeping the evidence reader mounted and preserving every input record', () => {
  const values = [];
  let cursor = 0;
  const react = { ...React, default: React, useId: () => 'journal-keyboard',
    useState(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = typeof initial === 'function' ? initial() : initial;
      return [values[index], next => { values[index] = typeof next === 'function' ? next(values[index]) : next; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in values)) values[index] = { current: initial };
      return values[index];
    },
  };
  const Interactive = loadComponent('InvestigationJournal.jsx', { ...journalImports, react }).default;
  const renderTree = () => { cursor = 0; return Interactive(fixture); };
  const tabs = tree => descendants(tree, item => item.props.role === 'tab');
  const panels = tree => descendants(tree, item => item.props.role === 'tabpanel');
  const focused = [];
  let prevented = 0;
  let tree = renderTree();
  tabs(tree).forEach((tab, index) => tab.ref({ focus: () => focused.push(index) }));
  const reader = descendants(tree, item => item.type === evidenceLibrary.default)[0];
  for (const key of ['clues', 'newClueIds', 'sources', 'expertNotes']) assert.equal(reader.props[key], fixture[key]);
  assert.deepEqual(panels(tree).map(panel => panel.props.hidden), [false, true, true]);
  const transitions = [[0, 'ArrowRight', 1], [1, 'End', 2], [2, 'ArrowRight', 0], [0, 'ArrowLeft', 2], [2, 'Home', 0]];
  for (const [from, key, next] of transitions) {
    tabs(tree)[from].props.onKeyDown({ key, preventDefault: () => { prevented++; } });
    tree = renderTree();
    assert.deepEqual(tabs(tree).map(tab => tab.props['aria-selected']), [0, 1, 2].map(index => index === next));
    assert.deepEqual(tabs(tree).map(tab => tab.props.tabIndex), [0, 1, 2].map(index => index === next ? 0 : -1));
    assert.deepEqual(panels(tree).map(panel => panel.props.hidden), [0, 1, 2].map(index => index !== next));
    assert.equal(focused.at(-1), next);
    assert.equal(descendants(tree, item => item.type === evidenceLibrary.default).length, 1,
      'switching tabs preserves the same evidence child so its search and open details are not discarded');
    tabs(tree).forEach((tab, index) => {
      assert.equal(tab.props.type, 'button');
      assert.equal(tab.props['aria-controls'], panels(tree)[index].props.id);
      assert.equal(panels(tree)[index].props['aria-labelledby'], tab.props.id);
    });
  }
  tabs(tree)[0].props.onKeyDown({ key: 'Enter', preventDefault: () => { prevented++; } });
  assert.equal(prevented, transitions.length, 'unhandled keys retain their native behavior');
  tabs(tree)[2].props.onClick();
  tree = renderTree();
  assert.equal(tabs(tree)[2].props['aria-selected'], true, 'native click activation also supports touch');
});

test('raw English evidence names and escaped testimony stay readable in journal references', () => {
  language = 'en';
  const raw = JSON.parse(JSON.stringify(fixture));
  raw.clues[0] = { clue_id: 'access', keyword: '中文名称', keyword_en: 'English source name', description: 'Known record' };
  raw.investigation.testimony_records.witness[0].response = '<script>public account</script>';
  const markup = render(raw);
  assert.match(markup, /English source name/);
  assert.doesNotMatch(markup, /中文名称|<script>/);
  assert.match(markup, /&lt;script&gt;public account&lt;\/script&gt;/);
});
