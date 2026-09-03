import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lobby = readFileSync(new URL('../src/components/game/HolographicLobby.jsx', import.meta.url), 'utf8');
const sequenceStart = lobby.indexOf('{showSequence && (');
const sequenceEnd = lobby.indexOf('<DeployControls', sequenceStart);
const sequenceBlock = lobby.slice(sequenceStart, sequenceEnd);
const deployCall = sequenceBlock.indexOf('await onDeploy');
const firstDismiss = sequenceBlock.indexOf('setShowSequence(false)');

test('successful deployment keeps the transition overlay mounted until navigation', () => {
  assert.ok(sequenceStart >= 0 && sequenceEnd > sequenceStart);
  assert.ok(deployCall >= 0);
  assert.ok(firstDismiss > deployCall);
  assert.doesNotMatch(sequenceBlock.slice(0, deployCall), /setShowSequence\(false\)/);
});

test('failed deployment dismisses the transition overlay and returns control to the lobby', () => {
  assert.match(sequenceBlock, /if \(result\?\.error\) \{\s*setShowSequence\(false\);/);
  assert.match(sequenceBlock, /catch \{\s*setShowSequence\(false\);/);
});
