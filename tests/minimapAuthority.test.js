import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { Case_Data_Lvl_01, Case_Data_Lvl_02, localizeCase } from '../src/game/caseData.js';
import { ICON_PATHS, resolveIconName, iconTextParts } from '../src/components/ui/iconData.js';
import { noirColor } from '../src/components/ui/palette.js';
import { AUTH_EMAIL_LANGUAGE_KEY } from '../src/lib/authEmail.js';

// Compile the actual production component and its real language/icon providers;
// no replica map reducer or extracted JSX is used by these render assertions.
function load(path, imports, bindings = {}) {
  const source = readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022,
  } });
  const exports = {};
  compileFunction(outputText, ['require', 'exports', ...Object.keys(bindings)])(name => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency: ${name}`);
    return imports[name];
  }, exports, ...Object.values(bindings));
  return exports;
}
const react = { ...React, default: React };
const icons = load('components/ui/Icon.jsx', { react, './iconData.js': { ICON_PATHS, resolveIconName, iconTextParts } });
function renderMap(props, lang = 'zh') {
  const language = load('lib/lang.jsx', { react, '@/lib/authEmail': { AUTH_EMAIL_LANGUAGE_KEY } }, {
    localStorage: { getItem: () => lang },
  });
  const { default: MiniMap } = load('components/game/MiniMap.jsx', {
    react, '@/lib/lang.jsx': language, '@/components/ui/Icon': icons, '@/components/ui/palette': { noirColor },
  });
  return renderToStaticMarkup(React.createElement(language.LangProvider, null,
    React.createElement(MiniMap, props)));
}
function zoneLabels(html) {
  return [...html.matchAll(/<div[^>]*role="group"[^>]*aria-label="([^"]+)"/g)].map(match => match[1]);
}

test('MiniMap uses authoritative current and visited zones even when the local agent path is stale', () => {
  const html = renderMap({
    caseData: Case_Data_Lvl_01,
    gameState: { current_zone: 'zone_lab', visited_zones: ['zone_datacenter', 'zone_lab'], unlocked_clues: [], action_points_left: 12 },
    agentPath: ['zone_datacenter', 'zone_lobby', 'zone_balcony'],
    accentColor: '#709f9a',
  });
  const labels = zoneLabels(html);
  assert.ok(labels.includes('私人实验室 · 当前 · 0 线索'));
  assert.ok(labels.includes('数据中心 · 已探索 · 0 线索'));
  assert.ok(labels.includes('大堂 · 未探索 · 0 线索'));
  assert.ok(labels.includes('天台阳台 · 未探索 · 0 线索'));
  assert.equal(labels.filter(label => label.includes(' · 当前 · ')).length, 1);
  assert.match(html, /2\/4 区域/);
  assert.doesNotMatch(html, /3\/4 区域/);
  assert.match(html, /AP 12/);
});

test('MiniMap renders two acquired clues in a newly visited area from the zone-to-clue-array mapping', () => {
  for (const lang of ['zh', 'en']) {
    const caseData = localizeCase(Case_Data_Lvl_02, lang);
    const html = renderMap({
      caseData,
      gameState: { current_zone: 'zone_server', visited_zones: ['zone_lab_core', 'zone_server'],
        unlocked_clues: ['d_01', 'd_04', 'd_08'], action_points_left: 17 },
      agentPath: ['zone_lab_core'], accentColor: '#709f9a',
    }, lang);
    const labels = zoneLabels(html);
    assert.ok(labels.includes(lang === 'zh' ? '服务器间 · 当前 · 2 线索' : 'Server Room · Current · 2 clues'));
    assert.ok(labels.includes(lang === 'zh' ? '量子核心实验室 · 已探索 · 1 线索' : 'Quantum Core Lab · Visited · 1 clues'));
    assert.equal(labels.filter(label => / · (?:当前|Current) · /.test(label)).length, 1);
    assert.match(html, />2<\/div>/, 'the new area must render the visible numeric clue badge');
    assert.match(html, />1<\/div>/, 'the original area retains its own clue badge');
    assert.match(html, lang === 'zh' ? /2\/4 区域/ : /2\/4 Zones/);
  }
});

test('MiniMap preserves the default legacy layout, clue map and agent-path fallback without authoritative zone fields', () => {
  for (const lang of ['zh', 'en']) {
    const html = renderMap({
      gameState: { unlocked_clues: ['c_04', 'c_05'], action_points_left: 9 },
      agentPath: ['zone_datacenter', 'zone_lab'], accentColor: '#709f9a',
    }, lang);
    const labels = zoneLabels(html);
    assert.ok(labels.includes(lang === 'zh' ? '私人实验室 · 当前 · 2 线索' : 'Private Lab · Current · 2 clues'));
    assert.ok(labels.includes(lang === 'zh' ? '数据中心 · 已探索 · 0 线索' : 'Data Center · Visited · 0 clues'));
    assert.equal(labels.length, 4);
    assert.match(html, />2<\/div>/);
    assert.match(html, lang === 'zh' ? /2\/4 区域/ : /2\/4 Zones/);
  }
  const empty = zoneLabels(renderMap({ accentColor: '#709f9a' }));
  assert.ok(empty.includes('数据中心 · 当前 · 0 线索'));
  assert.ok(empty.includes('私人实验室 · 未探索 · 0 线索'));
});
