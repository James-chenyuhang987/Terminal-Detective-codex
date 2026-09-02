import test from 'node:test';
import assert from 'node:assert/strict';

import { handleProfileFunction, profileInternals } from '../cloudflare/worker/profile.js';

const USER_ID = 'firebase-user-123';
const SESSION_ID = 'web-1234567890123456';

function fakeProfileDB(profileJson = '{}', { beforeBatch } = {}) {
  const row = {
    profile_json: profileJson,
    profile_revision: 0,
    active_session_id: SESSION_ID,
  };
  const operations = new Map();

  function statement(sql) {
    return {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      async first() {
        if (sql.includes('FROM profile_operations')) {
          return operations.get(`${this.args[0]}:${this.args[1]}`) || null;
        }
        if (sql.includes('FROM profiles')) return { ...row };
        return null;
      },
      async run() {
        if (sql.includes('INSERT INTO profiles')) return { meta: { changes: 0 } };
        if (sql.includes('SET active_session_id')) {
          row.active_session_id = this.args[0];
          return { meta: { changes: 1 } };
        }
        return { meta: { changes: 0 } };
      },
    };
  }

  return {
    row,
    operations,
    prepare: statement,
    async batch(statements) {
      beforeBatch?.(row);
      const insert = statements[0];
      const [
        userId, operationId, baseRevision, resultRevision, hash,
        ownerId, expectedRevision, sessionId,
      ] = insert.args;
      const key = `${userId}:${operationId}`;
      let inserted = false;
      if (!operations.has(key)
        && ownerId === USER_ID
        && expectedRevision === row.profile_revision
        && sessionId === row.active_session_id) {
        operations.set(key, {
          base_revision: baseRevision,
          result_revision: resultRevision,
          patch_hash: hash,
        });
        inserted = true;
      }

      const update = statements[1];
      const [
        nextJson, updateUserId, updateRevision, updateSessionId,
        operationUserId, updateOperationId, operationBase, operationResult, operationHash,
      ] = update.args;
      const operation = operations.get(`${operationUserId}:${updateOperationId}`);
      const changed = updateUserId === USER_ID
        && updateRevision === row.profile_revision
        && updateSessionId === row.active_session_id
        && operation?.base_revision === operationBase
        && operation?.result_revision === operationResult
        && operation?.patch_hash === operationHash;
      if (changed) {
        row.profile_json = nextJson;
        row.profile_revision += 1;
      } else if (inserted) {
        operations.delete(key);
      }
      return [{ meta: { changes: inserted ? 1 : 0 } }, { meta: { changes: changed ? 1 : 0 } }];
    },
  };
}

function profileRequest(body, owner = USER_ID) {
  return new Request('https://game.example/api/profile', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-profile-owner': owner,
    },
    body: JSON.stringify({ session_id: SESSION_ID, ...body }),
  });
}

const session = {
  user_id: USER_ID,
  user: { id: USER_ID, email: 'detective@example.com' },
};

test('profile writes require an owner header matching the Firebase token owner', async () => {
  const DB = fakeProfileDB();
  const response = await handleProfileFunction(
    profileRequest({ action: 'status' }, 'another-user'),
    { DB },
    session,
  );
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'PROFILE_OWNER_MISMATCH');
});

test('claiming a profile session does not invalidate pending profile revisions', async () => {
  const DB = fakeProfileDB(JSON.stringify({ gold: 25 }));
  DB.row.profile_revision = 7;
  DB.row.active_session_id = 'web-previous-session';
  const response = await handleProfileFunction(
    profileRequest({ action: 'claim_session' }),
    { DB },
    session,
  );
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(DB.row.active_session_id, SESSION_ID);
  assert.equal(DB.row.profile_revision, 7);
  assert.equal(payload.profile.profile_revision, 7);
});

test('profile operation ledger makes repeated writes idempotent', async () => {
  const DB = fakeProfileDB();
  const body = {
    action: 'patch',
    operation_id: 'profile-operation-0001',
    expected_revision: 0,
    patch: { gold: 25 },
  };
  const first = await handleProfileFunction(profileRequest(body), { DB }, session);
  const firstPayload = await first.json();
  assert.equal(first.status, 200);
  assert.equal(firstPayload.profile.gold, 25);
  assert.equal(firstPayload.profile.profile_revision, 1);
  assert.equal(firstPayload.replayed, false);

  const replay = await handleProfileFunction(profileRequest(body), { DB }, session);
  const replayPayload = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(replayPayload.profile.profile_revision, 1);
  assert.equal(replayPayload.replayed, true);
  assert.equal(DB.operations.size, 1);

  const reused = await handleProfileFunction(profileRequest({
    ...body,
    patch: { gold: 100 },
  }), { DB }, session);
  assert.equal(reused.status, 409);
  assert.equal((await reused.json()).code, 'OPERATION_ID_REUSED');
});

test('profile patches require an integer revision and a non-empty patch', async () => {
  const DB = fakeProfileDB();
  for (const expected_revision of [undefined, -1, 0.5, '0']) {
    const response = await handleProfileFunction(profileRequest({
      action: 'patch',
      operation_id: 'profile-operation-0001',
      expected_revision,
      patch: { gold: 25 },
    }), { DB }, session);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_PATCH');
  }
  assert.equal(profileInternals.cleanPatch({}), null);
  assert.equal(DB.row.profile_revision, 0);
});

test('profile patches reject a merged profile that exceeds the storage limit', async () => {
  const DB = fakeProfileDB(JSON.stringify({ signature: 'x'.repeat(300_000) }));
  const response = await handleProfileFunction(profileRequest({
    action: 'patch',
    operation_id: 'profile-operation-0001',
    expected_revision: 0,
    patch: { mail_read_ids: Array.from({ length: 40 }, () => 'y'.repeat(8_000)) },
  }), { DB }, session);

  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PROFILE_TOO_LARGE');
  assert.equal(DB.row.profile_revision, 0);
  assert.equal(DB.operations.size, 0);
});

test('profile replay never reports success before its result revision is visible', async () => {
  const DB = fakeProfileDB();
  DB.operations.set(`${USER_ID}:profile-operation-0001`, {
    base_revision: 0,
    result_revision: 1,
    patch_hash: await profileInternals.patchHash({ gold: 25 }),
  });
  const request = () => profileRequest({
    action: 'patch',
    operation_id: 'profile-operation-0001',
    expected_revision: 0,
    patch: { gold: 25 },
  });

  const pending = await handleProfileFunction(request(), { DB }, session);
  assert.equal(pending.status, 503);
  assert.equal((await pending.json()).code, 'DATABASE_UNAVAILABLE');

  DB.row.profile_json = JSON.stringify({ gold: 25 });
  DB.row.profile_revision = 1;
  const replay = await handleProfileFunction(request(), { DB }, session);
  const payload = await replay.json();
  assert.equal(replay.status, 200);
  assert.equal(payload.replayed, true);
  assert.equal(payload.profile.profile_revision, 1);
});

test('profile compare-and-set allows only one operation at a revision', async () => {
  const DB = fakeProfileDB();
  const [first, second] = await Promise.all([
    handleProfileFunction(profileRequest({
      action: 'patch',
      operation_id: 'profile-operation-0001',
      expected_revision: 0,
      patch: { gold: 25 },
    }), { DB }, session),
    handleProfileFunction(profileRequest({
      action: 'patch',
      operation_id: 'profile-operation-0002',
      expected_revision: 0,
      patch: { diamonds: 5 },
    }), { DB }, session),
  ]);
  assert.deepEqual([first.status, second.status].sort(), [200, 409]);
  assert.equal(DB.row.profile_revision, 1);
  assert.equal(DB.operations.size, 1);
});

test('profile save reports a session takeover that races with compare-and-set', async () => {
  const DB = fakeProfileDB('{}', {
    beforeBatch: row => { row.active_session_id = 'web-another-session'; },
  });
  const response = await handleProfileFunction(profileRequest({
    action: 'patch',
    operation_id: 'profile-operation-0001',
    expected_revision: 0,
    patch: { gold: 25 },
  }), { DB }, session);

  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'SESSION_TAKEN');
  assert.equal(DB.row.profile_revision, 0);
  assert.equal(DB.operations.size, 0);
});

test('corrupt cloud profile data fails closed instead of becoming an empty profile', async () => {
  const DB = fakeProfileDB('{"gold":');
  await assert.rejects(
    handleProfileFunction(profileRequest({ action: 'status' }), { DB }, session),
    error => error.code === 'PROFILE_DATA_CORRUPT' && error.status === 500,
  );
});
