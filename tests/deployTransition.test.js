import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const lobby = readFileSync(new URL('../src/components/game/HolographicLobby.jsx', import.meta.url), 'utf8');
const sequenceStart = lobby.indexOf('{showSequence && deploymentSnapshot && (');
const sequenceEnd = lobby.indexOf('<DeployControls', sequenceStart);
const sequenceBlock = lobby.slice(sequenceStart, sequenceEnd);
const deployCall = sequenceBlock.indexOf('await onDeploy');

test('successful deployment keeps the transition overlay mounted until navigation', () => {
  assert.ok(sequenceStart >= 0 && sequenceEnd > sequenceStart);
  assert.ok(deployCall >= 0);
  assert.match(sequenceBlock, /const result = await onDeploy\([\s\S]*?\);\s*if \(result\?\.error\) \{/);
  assert.equal(sequenceBlock.match(/clearDeployment\(\)/g)?.length, 2);
  assert.doesNotMatch(sequenceBlock.slice(0, deployCall), /clearDeployment\(\)/);
});

test('failed deployment dismisses the transition overlay and returns control to the lobby', () => {
  assert.match(sequenceBlock, /if \(result\?\.error\) \{\s*clearDeployment\(\);/);
  assert.match(sequenceBlock, /catch \{\s*clearDeployment\(\);/);
});
