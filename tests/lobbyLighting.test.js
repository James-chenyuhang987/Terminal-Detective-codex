import test from 'node:test';
import assert from 'node:assert/strict';

import { getLobbyLighting } from '../src/game/lobbyLighting.js';

function localTime(hour, minute = 0) {
  return new Date(2026, 7, 27, hour, minute, 0, 0);
}

test('lobby lighting is brightest during the day and darkest at night', () => {
  const noon = getLobbyLighting(localTime(12));
  const evening = getLobbyLighting(localTime(19));
  const midnight = getLobbyLighting(localTime(0));
  assert.equal(noon.phase, 'day');
  assert.equal(evening.phase, 'evening');
  assert.equal(midnight.phase, 'night');
  assert.ok(noon.brightness > evening.brightness);
  assert.ok(evening.brightness > midnight.brightness);
});

test('dawn and sunset transition smoothly without dropping below the readable floor', () => {
  const dawn = getLobbyLighting(localTime(6, 30));
  const morning = getLobbyLighting(localTime(8));
  const lateNight = getLobbyLighting(localTime(23, 30));
  assert.equal(dawn.phase, 'dawn');
  assert.ok(dawn.brightness < morning.brightness);
  assert.ok(lateNight.brightness >= 0.72);
  assert.ok(lateNight.nightVeil <= 0.2);
});

