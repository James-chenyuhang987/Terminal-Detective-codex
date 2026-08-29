import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getTerminalLinesForTurn,
  getTerminalTurns,
  stepTerminalTurn,
} from '../src/game/turnArchive.js';

test('terminal archive exposes briefing and sorted unique turns', () => {
  const lines = [{ turn: 2 }, { turn: 1 }, { turn: 2 }, {}];
  assert.deepEqual(getTerminalTurns(lines, 3), [0, 1, 2, 3]);
});

test('terminal archive filters lines to a single turn', () => {
  const lines = [{ id: 'brief' }, { id: 'one', turn: 1 }, { id: 'two', turn: 2 }];
  assert.deepEqual(getTerminalLinesForTurn(lines, 1).map(line => line.id), ['one']);
  assert.deepEqual(getTerminalLinesForTurn(lines, 0).map(line => line.id), ['brief']);
});

test('terminal archive arrows stop at the first and latest page', () => {
  const turns = [0, 1, 3];
  assert.equal(stepTerminalTurn(turns, 0, -1), 0);
  assert.equal(stepTerminalTurn(turns, 1, 1), 3);
  assert.equal(stepTerminalTurn(turns, 3, 1), 3);
});

