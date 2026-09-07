import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readEnvelope, readProfileRow, profilePayload, commandHash, matchingOperation,
  serialize, MAX_PROFILE_BYTES,
} from '../cloudflare/worker/authorityStore.js';
import { authorityDB, request, USER_ID } from './cloudflareAuthorityDB.js';

test('authority storage initializes only once and preserves existing reward provenance', async () => {
  const DB = authorityDB({ gold: 321, energy: 20, rewarded_runs: ['old-baseline-run'] });
  const now = new Date('2026-09-05T12:00:00Z');
  const row = await readProfileRow({ DB }, USER_ID, now);
  assert.equal(row.authority_version, 1);
  assert.equal(row.profile_revision, 0);
  const profile = profilePayload(row, now);
  assert.equal(profile.energy, 20);
  assert.equal(profile.gold, 321);
  assert.deepEqual(profile.rewarded_runs, ['old-baseline-run']);
  const stored = DB.profile().profile_json;
  await readProfileRow({ DB }, USER_ID, new Date(now.getTime() + 60000));
  assert.equal(DB.profile().profile_json, stored);
});

test('parallel empty initialization never issues multiple initial resource grants', async () => {
  const DB = authorityDB();
  const rows = await Promise.all(Array.from({ length: 10 }, () => readProfileRow({ DB }, USER_ID)));
  for (const row of rows) {
    assert.equal(row.authority_version, 1);
    assert.equal(profilePayload(row).energy, 120);
  }
  assert.equal(DB.count('profiles'), 1);
  assert.equal(DB.count('profile_operations'), 0);
});

test('corrupt stored snapshots fail closed instead of resetting to defaults', async () => {
  for (const corrupt of ['[]', '{broken', 'null', 'true']) {
    const DB = authorityDB(corrupt);
    await assert.rejects(readProfileRow({ DB }, USER_ID), error => error.code === 'PROFILE_DATA_CORRUPT');
    assert.equal(DB.profile().profile_json, corrupt);
    assert.equal(DB.profile().authority_version, 0);
  }
});

test('legacy patches and client state never pass the strict command envelope', async () => {
  for (const body of [
    { action: 'patch', patch: { gold: 999999 } },
    { action: 'command', operation_id: 'unique-operation-1234', expected_revision: 0, command: { type: 'checkin' }, profile: {} },
    { action: 'command', operation_id: 'unique-operation-1234', expected_revision: -1, command: { type: 'checkin' } },
    { action: 'status', user_id: 'forged' },
  ]) await assert.rejects(readEnvelope(request(body)), error => error.status === 400);
});

test('intent hashing is stable by object order but binds exact command and revision', async () => {
  const hash = await commandHash({ type: 'identity', patch: { avatar: 'A', signature: 'B' } });
  assert.equal(hash, await commandHash({ patch: { signature: 'B', avatar: 'A' }, type: 'identity' }));
  assert.notEqual(hash, await commandHash({ type: 'identity', patch: { avatar: 'B', signature: 'A' } }));
  const row = { patch_hash: hash, base_revision: 4, result_revision: 5, result_json: '{}' };
  assert.equal(matchingOperation(row, 4, hash), true);
  assert.equal(matchingOperation(row, 5, hash), false);
  assert.equal(matchingOperation({ ...row, result_json: null }, 4, hash), false);
  assert.throws(() => serialize({ oversized: 'a'.repeat(MAX_PROFILE_BYTES) }), error => error.status === 413);
});
