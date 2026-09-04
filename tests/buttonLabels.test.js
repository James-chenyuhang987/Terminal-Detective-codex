import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const readSource = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const terminal = readSource('../src/components/game/InvestigationTerminal.jsx');
const home = readSource('../src/components/game/DetectiveHome.jsx');
const lobby = readSource('../src/components/game/HolographicLobby.jsx');
const registration = readSource('../src/components/game/DetectiveRegistration.jsx');
const styles = readSource('../src/index.css');

test('investigation toolbar exposes visible localized names and minimap state', () => {
  assert.match(terminal, /td-hud-tool-button[\s\S]*设置[\s\S]*SETTINGS/);
  assert.match(terminal, /td-hud-tool-button[\s\S]*指引[\s\S]*GUIDE/);
  assert.match(terminal, /aria-pressed=\{showMiniMap\}/);
  assert.match(terminal, /td-mobile-only[\s\S]*地图[\s\S]*MAP/);
  assert.doesNotMatch(styles, /\.td-command-hud-button\s*\{[^}]*font-size:\s*0/);
});

test('other ambiguous icon actions include visible names or explicit accessible labels', () => {
  assert.match(home, /topActions[\s\S]*通讯[\s\S]*签到[\s\S]*设置/);
  assert.match(home, /aria-label=\{label\}[\s\S]*\{icon\}[\s\S]*\{label\}/);
  assert.match(lobby, /td-lobby-settings-button[\s\S]*设置[\s\S]*SETTINGS/);
  assert.match(registration, /td-registration-random[\s\S]*随机[\s\S]*RANDOM/);
  assert.match(registration, /label=\{zh \? '上一个头像' : 'Previous avatar'\}/);
  assert.match(registration, /label=\{zh \? '下一个头像' : 'Next avatar'\}/);
});
