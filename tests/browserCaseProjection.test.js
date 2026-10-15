import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { ALL_CASES } from '../src/game/caseData.js';
import { browserCaseProjection, projectCaseCatalogForBrowser } from '../scripts/browser-case-projection.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FILES = ['caseData.js', 'caseDataExtra.js', 'caseDataExpansion.js'];
const sources = Object.fromEntries(await Promise.all(FILES.map(async name =>
  [name, await readFile(new URL(`../src/game/${name}`, import.meta.url), 'utf8')])));

function projectedCatalog() {
  const modules = new Map();
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const exports = {};
    modules.set(name, exports);
    const projected = projectCaseCatalogForBrowser(sources[name], name);
    const commonjs = ts.transpileModule(projected, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    new Function('require', 'exports', commonjs)(id => load(id.replace('./', '')), exports);
    return exports;
  }
  return load('caseData.js');
}

test('browser catalogs withhold undiscovered evidence and relationships without changing Node catalogs', () => {
  const projected = projectedCatalog();
  assert.equal(projected.ALL_CASES.length, 8);
  for (let index = 0; index < ALL_CASES.length; index += 1) {
    const original = ALL_CASES[index];
    const browser = projected.ALL_CASES[index];
    assert.equal(browser.case_id, original.case_id);
    assert.deepEqual(browser.scene, original.scene);
    assert.deepEqual(browser.npcs, original.npcs);
    assert.deepEqual(browser.zone_clue_map, original.zone_clue_map);
    assert.deepEqual(browser.conflict_dictionary, []);
    assert.ok(original.conflict_dictionary.length, `${original.case_id} server relationships must be preserved`);
    for (const language of [original, original.en]) {
      assert.ok(language.clue_dictionary.every(clue => clue.description.length > 0));
    }
    for (const [language, keyword] of [[browser, '待核验证据'], [browser.en, 'Unverified evidence']]) {
      assert.ok(language.clue_dictionary.every(clue => clue.description === ''));
      assert.ok(language.clue_dictionary.every(clue => clue.keyword === keyword && clue.weight === 'MEDIUM'));
    }
    assert.deepEqual(browser.clue_dictionary.map(({ description: _description, keyword: _keyword, weight: _weight, ...clue }) => clue),
      original.clue_dictionary.map(({ description: _description, keyword: _keyword, weight: _weight, ...clue }) => clue));
  }
  assert.equal(projected.localizeCase(projected.ALL_CASES[0], 'en').title, ALL_CASES[0].en.title);
});

test('browser projection does not touch scene descriptions and refuses dynamic clue catalogs', () => {
  const source = 'export const x = { scene: {description: "public"}, clue_dictionary: [{description: "private", clue_id: "c_01"}], conflict_dictionary: [{reason: "private reason"}], en: {clue_dictionary: [{description: "private English"}], conflict_dictionary: [{reason: "private English reason"}]} };';
  const projected = projectCaseCatalogForBrowser(source);
  assert.match(projected, /description: "public"/);
  assert.doesNotMatch(projected, /private/);
  assert.throws(() => projectCaseCatalogForBrowser('const x = {clue_dictionary: getPrivateClues()};'), /literal array/);
  assert.throws(() => projectCaseCatalogForBrowser('const x = {clue_dictionary: [...privateClues]};'), /literal objects/);
});

test('Vite development output and source maps both exclude all original evidence descriptions', async () => {
  const server = await createServer({
    root: ROOT, configFile: false, plugins: [browserCaseProjection(ROOT)],
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    for (const name of FILES) {
      const results = await Promise.all(['', '?raw'].map(query => server.transformRequest(`/src/game/${name}${query}`)));
      assert.ok(results.every(result => result));
      const rawParsed = ts.createSourceFile(name, results[1].code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
      const rawExport = rawParsed.statements.find(statement => ts.isExportAssignment(statement));
      assert.ok(rawExport && ts.isStringLiteral(rawExport.expression), `${name}?raw must export source text`);
      assert.equal(rawExport.expression.text, projectCaseCatalogForBrowser(sources[name], name));
      const transmitted = JSON.stringify(results.map(result => ({ code: result.code, map: result.map })));
      const cases = ALL_CASES.filter(item => name === 'caseData.js' ? ['Lvl_01', 'Lvl_02', 'Lvl_03'].includes(item.case_id)
        : name === 'caseDataExtra.js' ? ['Lvl_04', 'Lvl_05'].includes(item.case_id) : ['Lvl_06', 'Lvl_07', 'Lvl_08'].includes(item.case_id));
      for (const item of cases) {
        for (const language of [item, item.en]) {
          for (const clue of language.clue_dictionary) {
            assert.ok(!transmitted.includes(JSON.stringify(clue.description).slice(1, -1)), `${name}/${clue.clue_id} description leaked`);
          }
        }
        for (const relationship of item.conflict_dictionary) {
          assert.ok(!transmitted.includes(relationship.reason), `${name} relationship leaked`);
        }
      }
    }
  } finally {
    await server.close();
  }
});

test('Vite SSR projection preserves original authority catalogs', () => {
  const plugin = browserCaseProjection(ROOT);
  const path = fileURLToPath(new URL('../src/game/caseData.js', import.meta.url));
  assert.equal(plugin.transform(sources['caseData.js'], path, { ssr: true }), null);
  assert.equal(plugin.transform(sources['caseData.js'], '/other/src/game/caseData.js'), null);
});
