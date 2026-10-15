import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { ALL_CASES, localizeCase } from '../src/game/caseData.js';
import { handleProfileFunction } from '../cloudflare/worker/profileAuthority.js';
import { createRun, applyRunCommand, publicRun } from '../server/gameAuthority/runAuthority.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { authorityDB, session, request } from './cloudflareAuthorityDB.js';

async function status(DB) {
  const response = await handleProfileFunction(request({ action: 'status' }), { DB }, session);
  assert.equal(response.status, 200);
  return response.json();
}

test('profile archive labels disclose only recorded known clues and never persist or advance old records', async () => {
  const DB = authorityDB({ case_records: [
    { case_id: 'Lvl_01', discovered_clues: ['c_01', 'c_secret_99', 'unknown'], valid_links: ['c_01|c_02'], attempts: 3, solved: true },
    { case_id: 'Lvl_02', discovered_clues: ['d_02'], valid_links: [], attempts: 1 },
  ] });
  const first = await status(DB);
  const originalJson = DB.profile().profile_json;
  const revision = DB.profile().profile_revision;
  const second = await status(DB);
  assert.deepEqual(second.archive_clue_labels, {
    Lvl_01: { c_01: { zh: '染血收据', en: 'Bloody Receipt' }, c_secret_99: { zh: '匿名线索', en: 'Anonymous Lead' } },
    Lvl_02: { d_02: { zh: 'Aria 的工牌', en: "Aria's Badge" } },
  });
  assert.deepEqual(second.profile.case_records, first.profile.case_records);
  assert.equal(DB.profile().profile_json, originalJson);
  assert.equal(DB.profile().profile_revision, revision);
  assert.equal(DB.count('profile_operations'), 0);
  assert.equal(Object.hasOwn(second.profile, 'archive_clue_labels'), false);
  assert.ok(!originalJson.includes('archive_clue_labels'));
  const display = JSON.stringify(second.archive_clue_labels);
  assert.ok(!display.includes('description') && !display.includes('weight') && !display.includes('c_03'));
});

test('v2 inspections restore only earned bilingual clue labels, description and weight in publicRun', () => {
  let run = createRun({ id: 'archive-privacy-v2-run', caseData: ALL_CASES[0], teamConfig: buildTeamConfig(),
    investigationVersion: 2, now: new Date('2026-10-14T12:00:00Z') });
  assert.deepEqual(publicRun(run).state.revealed_clues, []);
  const offers = applyRunCommand(run, { type: 'inspect_options', target_id: 'target_c_01' }, new Date('2026-10-14T12:00:00Z'));
  run = offers.run;
  const card = Object.values(offers.result.packs)[0].cards.find(item => item.method_id === 'metadata');
  run = applyRunCommand(run, { type: 'inspect', option_id: card.option_id }, new Date('2026-10-14T12:00:00Z')).run;
  const revealed = publicRun(run).state.revealed_clues;
  assert.equal(revealed.length, 1);
  const clue = run.case_data.clue_dictionary.find(item => item.clue_id === 'c_01');
  const english = run.case_data.en.clue_dictionary.find(item => item.clue_id === 'c_01');
  assert.deepEqual(revealed[0], { clue_id: 'c_01', keyword: clue.keyword, description: clue.description,
    visual_icon: clue.visual_icon, weight: clue.weight, en: { keyword: english.keyword, description: english.description } });
});

test('archive graph renders earned bilingual labels using a sanitized catalog and masks unknown clues', () => {
  const catalog = ALL_CASES.map(item => ({ ...item,
    clue_dictionary: item.clue_dictionary.map(clue => ({ ...clue, keyword: '待核验证据', description: '', weight: 'MEDIUM' })),
    en: { ...item.en, clue_dictionary: item.en.clue_dictionary.map(clue => ({ ...clue, keyword: 'Unverified evidence', description: '', weight: 'MEDIUM' })) },
  }));
  const source = readFileSync(new URL('../src/components/game/home/modules/GraphModule.jsx', import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const archive = { Lvl_01: { c_01: { zh: '染血收据', en: 'Bloody Receipt' } } };
  const imports = {
    react: React, 'react/jsx-runtime': jsxRuntime,
    '@/game/caseData': { ALL_CASES: catalog, localizeCase },
    '@/lib/ProfileContext.jsx': { useProfile: () => ({ archiveClueLabels: archive }) },
    '@/components/ui/Icon.jsx': { default: () => null, IconText: ({ text }) => React.createElement('span', null, text) },
  };
  const exports = {};
  compileFunction(code, ['require', 'exports'])(id => {
    assert.ok(Object.hasOwn(imports, id), `Unexpected import: ${id}`);
    return imports[id];
  }, exports);
  const profile = { case_records: [{ case_id: 'Lvl_01', discovered_clues: ['c_01'], valid_links: [] }] };
  for (const lang of ['zh', 'en']) {
    const markup = renderToStaticMarkup(React.createElement(exports.default, { profile, lang }));
    assert.ok(markup.includes(archive.Lvl_01.c_01[lang]));
    assert.ok(!markup.includes(lang === 'zh' ? '克隆门禁卡' : 'Cloned Access Card'));
    assert.equal((markup.match(/UNKNOWN EVIDENCE|未知证据/g) || []).length, 8);
  }
});
