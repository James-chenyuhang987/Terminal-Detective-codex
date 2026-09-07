import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import { DEFAULT_SETTINGS, normalizeSettings, parseSettingsImport, MAX_SETTINGS_IMPORT_BYTES } from '../src/lib/settingsData.js';

const source = ts.createSourceFile('SettingsDrawer.jsx', readFileSync(new URL('../src/components/game/settings/SettingsDrawer.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
function handler(name, bindings) {
  let declaration;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) declaration = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(source);
  assert.ok(declaration);
  return compileFunction(`return (${declaration.getText(source)});`, Object.keys(bindings))(...Object.values(bindings));
}
const backup = settings => JSON.stringify({ format: 'terminal-detective-profile', schema_version: 2,
  local: { settings, saves: { save_checkpoints: 'forged-run', agent_rewarded_runs_v1: '[]' } },
  cloud_profile: { gold: 9999999, energy: 180, rewarded_runs: [], xp: 9999 } });

test('settings schema bounds values and rejects arbitrary keys without spreading prototypes', () => {
  const result = normalizeSettings(JSON.parse('{"panelLight":true,"sfxEnabled":"false","glitchLevel":"extreme","gold":99999,"__proto__":{"particles":false}}'));
  assert.deepEqual(result, { ...DEFAULT_SETTINGS, panelLight: true });
  assert.deepEqual(parseSettingsImport(backup({ panelLight: true })), result);
  for (const text of ['{}', 'null', backup([]), ' '.repeat(MAX_SETTINGS_IMPORT_BYTES + 1)]) {
    assert.throws(() => parseSettingsImport(text));
  }
});

test('actual import callback restores settings only after confirmation and never calls cloud or writes saves', async () => {
  let confirm;
  const writes = [];
  const notices = [];
  const forbidden = () => assert.fail('Import must not write cloud progress or local saves');
  const run = handler('handleImport', {
    MAX_SETTINGS_IMPORT_BYTES, parseSettingsImport,
    setConfirm: value => { confirm = value; }, setSetting: (key, value) => writes.push([key, value]),
    notify: (...args) => notices.push(args), tx: { importPreview: 'Settings only', okImport: 'Imported', errImport: 'Invalid' },
    mutate: forbidden, command: forbidden, localStorage: { setItem: forbidden },
  });
  const text = backup({ panelLight: true, storyMode: 'theater' });
  await run({ size: Buffer.byteLength(text), text: async () => text });
  assert.equal(writes.length, 0);
  assert.equal(confirm.text, 'Settings only');
  await confirm.run();
  assert.deepEqual(Object.fromEntries(writes), normalizeSettings({ panelLight: true, storyMode: 'theater' }));
  assert.deepEqual(notices, [['Imported', 'success']]);
  await run({ size: MAX_SETTINGS_IMPORT_BYTES + 1, text: forbidden });
  assert.deepEqual(notices.at(-1), ['Invalid', 'error']);
});

test('drawer has no client cloud-reset action', () => {
  assert.doesNotMatch(source.text, /\bmutate\b|\bresetCode\b|\bnormalizeProfile\b|\bmigrateProfileV2\b/);
});
