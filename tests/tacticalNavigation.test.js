import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const terminal = readFileSync(new URL('../src/pages/TerminalDetective.jsx', import.meta.url), 'utf8');

// Exercise the actual navigation callbacks without mounting authenticated UI.
function navigationHarness() {
  const state = { screen: 'CASE_SELECT', preferredCaseId: null, lobbyReturnScreen: 'HOME', caseSelectReturnScreen: 'HOME' };
  const context = vm.createContext({
    multiSaveEnabled: false,
    newSaveIntentRef: { current: false },
    selectedCase: null,
    activeRun: null,
    loadAgentLobby() {},
    setScreen(value) { state.screen = value; },
    setPreferredCaseId(value) { state.preferredCaseId = value; },
    setLobbyReturnScreen(value) { state.lobbyReturnScreen = value; },
    setLobbyPreviewRun(value) { state.previewActiveRun = value; },
    get lobbyReturnScreen() { return state.lobbyReturnScreen; },
  });
  const openLobby = terminal.match(/const openLobbyForCase = ([\s\S]*?);\n\n/);
  assert.ok(openLobby, 'lobby navigation callback exists');
  vm.runInContext(`var openLobbyForCase = ${openLobby[1]};`, context);
  assert.match(terminal, /onBack=\{\(\) => \{ setLobbyPreviewRun\(false\); setScreen\(lobbyReturnScreen\); \}\}/);
  assert.match(terminal, /onBack=\{\(\) => \{\s*setPreferredCaseId\(null\);\s*setScreen\(caseSelectReturnScreen\);\s*\}/);
  return {
    state,
    planCase: vm.runInContext("(caseId => openLobbyForCase(caseId, 'CASE_SELECT'))", context),
    leaveCases: () => { state.preferredCaseId = null; state.screen = state.caseSelectReturnScreen; },
    leaveLobby: () => { state.screen = state.lobbyReturnScreen; },
  };
}

test('case planning preserves the target and returns to the case selector', () => {
  const nav = navigationHarness();
  nav.planCase('CASE-NEON-BLOOD');
  assert.equal(nav.state.screen, 'LOBBY');
  assert.equal(nav.state.preferredCaseId, 'CASE-NEON-BLOOD');
  nav.leaveLobby();
  assert.equal(nav.state.screen, 'CASE_SELECT');
});

test('leaving case selection after planning restores a route home', () => {
  const nav = navigationHarness();
  nav.planCase('CASE-NEON-BLOOD');
  nav.leaveLobby();
  nav.leaveCases();
  assert.equal(nav.state.screen, 'HOME');
  assert.equal(nav.state.preferredCaseId, null);
});
