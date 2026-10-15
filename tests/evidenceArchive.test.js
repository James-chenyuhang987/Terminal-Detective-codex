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
    assert.ok(Object.hasOwn(imports, id), `Unexpected archive dependency ${id}`);
    return imports[id];
  }, exports);
  return exports;
}
const sharedImports = {
  react: { ...React, default: React },
  '@/lib/lang.jsx': { useLang: () => ({ lang: language }) },
  '@/game/investigationChoices.js': { localizedInvestigationText },
  './evidenceArchive.css': {},
};
const reference = loadComponent('EvidenceReference.jsx', sharedImports);
const libraryImports = { ...sharedImports, './EvidenceReference.jsx': reference };
const library = loadComponent('EvidenceLibrary.jsx', libraryImports);
const records = [
  { clue_id: 'access', keyword: { zh: '原始门禁记录', en: 'Original access record' },
    description: { zh: '日志保留了两组硬件签章。\n请逐项核对时间。', en: 'The log preserves two hardware signatures.\nCheck each timestamp.' } },
  { clue_id: 'sample', keyword: { zh: '现场样本', en: 'Scene sample' },
    description: { zh: '样本放入密封袋保存。', en: 'The sample was preserved in a sealed bag.' } },
];
const sources = { access: { zh: '北侧门厅 · 读卡器', en: 'North lobby · card reader' } };
const expertNotes = { access: { zh: '按签章分别整理事件。', en: 'Group events by signature.' } };

test('evidence references keep complete known findings, source and earned observations readable in either language', () => {
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(reference.default, {
      clue: records[0], sourceLabel: sources.access, expertNote: expertNotes.access,
    }));
    assert.match(markup, /^<details\b/);
    assert.match(markup, /<summary>/, 'native summary supplies keyboard expansion without custom click handlers');
    assert.ok(markup.includes(records[0].keyword[language]));
    assert.ok(markup.includes(records[0].description[language]), 'full multiline description must remain in the record');
    assert.ok(markup.includes(sources.access[language]));
    assert.ok(markup.includes(expertNotes.access[language]));
    assert.equal(markup.includes(records[0].description[language === 'zh' ? 'en' : 'zh']), false);
    assert.doesNotMatch(markup, /<button|<form|aria-pressed|data-dimension|onclick/i,
      'reading evidence must not submit, select attachments or reveal a report dimension');
  }
});

test('references omit unearned observations, escape public text, and handle incomplete records', () => {
  language = 'en';
  const markup = renderToStaticMarkup(React.createElement(reference.default, {
    clue: { clue_id: 'safe', keyword: '<Known record>', description: '<script>untrusted finding</script>' },
  }));
  assert.match(markup, /&lt;Known record&gt;/);
  assert.match(markup, /&lt;script&gt;untrusted finding&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<script|<dl|Professional observation|Earned professional observation/);
  assert.equal(renderToStaticMarkup(React.createElement(reference.default, { clue: null })), '');
  const incomplete = renderToStaticMarkup(React.createElement(reference.default, { clue: { clue_id: 'partial' } }));
  assert.match(incomplete, /Evidence record/);
  assert.match(incomplete, /No detailed record available/);
  assert.doesNotMatch(incomplete, /undefined|null/);
});

test('search reads full discovered descriptions, sources and earned notes without mutating or sorting known evidence', () => {
  const frozen = Object.freeze(records.map(clue => Object.freeze({ ...clue })));
  const { filterEvidence } = library;
  for (const [query, lang, expected] of [
    ['时间', 'zh', ['access']],
    ['读卡器', 'zh', ['access']],
    ['分别整理', 'zh', ['access']],
    ['SEALED', 'en', ['sample']],
    ['ｈａｒｄｗａｒｅ', 'en', ['access']],
    ['record north', 'en', ['access']],
    ['record sealed', 'en', []],
    ['not discovered', 'en', []],
    ['   ', 'zh', ['access', 'sample']],
  ]) {
    const matches = filterEvidence(frozen, query, lang, sources, expertNotes);
    assert.deepEqual(matches.map(clue => clue.clue_id), expected, `${lang}/${query}`);
    matches.forEach(clue => assert.ok(frozen.includes(clue), 'search must retain the original public records'));
  }
  assert.deepEqual(filterEvidence([null, {}, records[0], records[0], records[1]]).map(clue => clue.clue_id), ['access', 'sample']);
  assert.deepEqual(filterEvidence(), []);
});

test('library exposes a labeled search, readable known records, new markers and counts in both languages', () => {
  for (language of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(library.default, {
      clues: records, newClueIds: ['access'], sources, expertNotes,
    }));
    const inputId = markup.match(/<input[^>]*id="([^"]+)"/)[1];
    assert.ok(markup.includes(`<label for="${inputId}">`));
    assert.match(markup, /type="search"/);
    assert.match(markup, /role="status" aria-live="polite" aria-atomic="true"/);
    assert.equal((markup.match(/<details\b/g) || []).length, 2);
    assert.ok(markup.includes(language === 'zh' ? '显示 2 / 2 条已发现证据' : 'Showing 2 of 2 discovered records'));
    assert.ok(markup.includes(language === 'zh' ? '新取得' : 'Newly secured'));
    assert.ok(markup.includes(expertNotes.access[language]));
    const empty = renderToStaticMarkup(React.createElement(library.default));
    assert.ok(empty.includes(language === 'zh' ? '尚未取得证据' : 'No evidence secured yet'));
    assert.equal(empty.includes('<details'), false);
  }
});

function descendants(element, type) {
  if (!React.isValidElement(element)) return [];
  return [
    ...(element.type === type ? [element] : []),
    ...React.Children.toArray(element.props.children).flatMap(child => descendants(child, type)),
  ];
}

test('searching and clearing updates only the local view, with no resource or selection callbacks', () => {
  let query = '';
  const interactive = loadComponent('EvidenceLibrary.jsx', { ...libraryImports,
    react: { ...React, default: React, useId: () => 'known-evidence-search', useState: () => [query, next => { query = next; }] },
  }).default;
  const snapshot = JSON.stringify({ records, sources, expertNotes });
  const props = { clues: records, sources, expertNotes };
  for (language of ['zh', 'en']) {
    query = '';
    const render = () => interactive(props);
    descendants(render(), 'input')[0].props.onChange({ target: { value: 'unmatched query' } });
    let tree = render();
    const markup = renderToStaticMarkup(tree);
    assert.ok(markup.includes(language === 'zh' ? '没有匹配的已发现证据' : 'No discovered evidence matches'));
    assert.ok(markup.includes(language === 'zh' ? '显示 0 / 2' : 'Showing 0 of 2'));
    assert.equal(descendants(tree, 'li').length, 0);
    const clear = descendants(tree, 'button')[0];
    assert.equal(clear.props.type, 'button', 'clearing a search cannot submit an ancestor report form');
    clear.props.onClick();
    tree = render();
    assert.equal(descendants(tree, 'input')[0].props.value, '');
    assert.equal(descendants(tree, 'li').length, 2);
    assert.equal(descendants(tree, 'button').length, 0);
  }
  assert.equal(JSON.stringify({ records, sources, expertNotes }), snapshot);
});
