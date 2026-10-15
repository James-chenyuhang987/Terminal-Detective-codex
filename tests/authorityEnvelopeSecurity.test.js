import test from 'node:test';
import assert from 'node:assert/strict';
import { readEnvelope, commandHash, MAX_BODY_BYTES } from '../cloudflare/worker/authorityStore.js';
import { handleRunFunction } from '../cloudflare/worker/run.js';
import { handleProfileFunction } from '../cloudflare/worker/profileAuthority.js';
import { validateProfileCommand } from '../server/gameAuthority/profileCommands.js';

const session = { user_id: 'envelope-security-user', user: { id: 'envelope-security-user' } };
const envelope = command => ({ action: 'command', session_id: 'web-1234567890123456',
  run_id: 'run-1234567890123456', operation_id: 'cmd-1234567890123456', expected_revision: 0, command });
const request = raw => new Request('https://game.example/api/test', { method: 'POST', body: raw });

test('run and profile endpoints reject a small deeply nested payload before touching persistent state', async () => {
  for (const [handler, type] of [[handleRunFunction, 'rest'], [handleProfileFunction, 'save_team']]) {
    const body = envelope({ type });
    if (handler === handleProfileFunction) delete body.run_id;
    const raw = JSON.stringify(body).replace(`"type":"${type}"`,
      `"type":"${type}","team_config":${'['.repeat(7000)}0${']'.repeat(7000)}`);
    assert.ok(new TextEncoder().encode(raw).byteLength < MAX_BODY_BYTES);
    let reads = 0;
    const DB = { prepare() { reads += 1; throw new Error('Unexpected database access'); } };
    const response = await handler(request(raw), { DB }, session);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_COMMAND');
    assert.equal(reads, 0);
  }
});

test('legitimate grouped report evidence and team settings remain hashable through the envelope boundary', async () => {
  const commands = [
    { type: 'report', conclusion_id: 'conclusion_1', method_id: 'method_1', motive_id: 'motive_1',
      timeline_id: 'timeline_1', evidence_by_dimension: { opportunity: ['c_01'], method: ['c_02'],
        motive: ['c_03'], timeline: ['c_04', 'c_05'] } },
    { type: 'start_case', case_id: 'Lvl_01', investigation_version: 2,
      team_config: { specs: [{ logic_power: 10 }, {}, {}], priorities: [[], [], []],
        command_plan: { doctrine_id: 'evidence_control', contingency_id: 'reserve' } } },
  ];
  for (const command of commands) {
    const body = await readEnvelope(request(JSON.stringify(envelope(command))), true);
    assert.deepEqual(body.command, command);
    assert.match(await commandHash(body.command), /^[a-f0-9]{64}$/);
  }
});

test('profile command types reject coercion objects with a controlled client error', () => {
  for (const type of [null, [], ['checkin'], { toString: null }, { valueOf: null }, 1, true]) {
    assert.throws(() => validateProfileCommand({ type }),
      error => error.code === 'INVALID_COMMAND' && error.status === 400);
  }
});
