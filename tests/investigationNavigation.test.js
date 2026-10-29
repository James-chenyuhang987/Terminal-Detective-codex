import test from 'node:test';
import assert from 'node:assert/strict';
import { getAccessibleZonePath, getConnectedZones } from '../src/game/caseRuntime.js';
import { ALL_CASES } from '../src/game/caseData.js';
import { buildTeamConfig } from '../src/game/teamConfig.js';
import { createRun, applyRunCommand, publicRun } from '../server/gameAuthority/runAuthority.js';

test('walking directions use the shortest open path and never infer access from an absent or truthy flag', () => {
  const map = { scene: { zones: { a: {}, b: {}, c: {}, d: {}, shortcut: {}, isolated: {} } },
    zone_connections: [['a', 'shortcut'], ['shortcut', 'd'], ['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd']] };
  const access = { b: { available: true }, c: { available: true }, d: { available: true }, shortcut: { available: false } };
  const before = JSON.stringify({ map, access });
  assert.deepEqual(getAccessibleZonePath(map, 'a', 'd', access), ['c', 'd']);
  assert.deepEqual(getAccessibleZonePath(map, 'd', 'd', access), []);
  assert.equal(getAccessibleZonePath(map, 'a', 'isolated', access), null);
  assert.equal(getAccessibleZonePath(map, 'unknown', 'd', access), null);
  assert.equal(getAccessibleZonePath(map, 'a', undefined, access), null);
  assert.equal(getAccessibleZonePath(map, 'a', 'd'), null);
  assert.equal(getAccessibleZonePath(map, 'a', 'd', null), null);
  assert.equal(getAccessibleZonePath(map, 'a', 'd', { d: { available: true }, shortcut: { available: 'true' } }), null);
  assert.equal(JSON.stringify({ map, access }), before);
});

test('all eight cases can follow suggested routes through the authoritative travel command without spending AP', () => {
  const now = new Date('2026-10-26T00:00:00Z');
  for (const caseData of ALL_CASES) {
    const run = createRun({ id: `navigation-${caseData.case_id}`, caseData, teamConfig: buildTeamConfig(), now, investigationVersion: 2 });
    const zones = Object.keys(caseData.scene.zones);
    // A fully explored saved run still travels one confirmed adjacent room at a time.
    run.state.visited_zones = [...zones];
    for (const start of zones) for (const destination of zones) {
      run.state.current_zone = start;
      const view = publicRun(run);
      const route = getAccessibleZonePath(caseData, start, destination, view.investigation.zone_access);
      assert.ok(route, `${caseData.case_id}: ${start} -> ${destination}`);
      let travelled = run;
      for (const zone_id of route) {
        assert.ok(getConnectedZones(caseData, travelled.state.current_zone).includes(zone_id));
        travelled = applyRunCommand(travelled, { type: 'travel', zone_id }, now).run;
      }
      assert.equal(travelled.state.current_zone, destination);
      assert.equal(travelled.state.action_points_left, run.state.action_points_left);
      assert.equal(travelled.state.turn_count, run.state.turn_count);
      assert.deepEqual(travelled.state.unlocked_clues, run.state.unlocked_clues);
    }
  }
});
