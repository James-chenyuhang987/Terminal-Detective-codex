import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayerRunClient, isAuthoritativeRun, runRecoveryMessage } from '../src/game/playerRun.js';
import { memoryLocks } from './runClientFixtures.js';

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
    values,
  };
}
const snapshot = (revision = 0, extra = {}) => ({
  id: 'paid-run', revision, state: { run_id: 'paid-run', unlocked_clues: [], action_points_left: 20 },
  linked_pairs: [], ...extra,
});
const response = (run = snapshot(), result = {}) => ({ data: { authority_version: 1, run, result } });
const options = (overrides = {}) => ({ ownerUid: 'owner', runId: 'paid-run', sessionId: 'device', storage: memoryStorage(), locks: memoryLocks(), createId: () => 'intent-1', ...overrides });

test('run state requires a cloud identity and matching revisioned snapshot', () => {
  assert.equal(isAuthoritativeRun(snapshot()), true);
  assert.equal(isAuthoritativeRun(snapshot(), 'another'), false);
  assert.equal(isAuthoritativeRun(snapshot(-1)), false);
  assert.equal(isAuthoritativeRun({ ...snapshot(), state: { run_id: 'invented' } }), false);
});

test('commands use confirmed revisions and persist intent only before network dispatch', async () => {
  const storage = memoryStorage();
  const calls = [];
  const client = createPlayerRunClient(options({ storage, invoke: async (name, body) => {
    calls.push(body);
    assert.equal(name, 'playerRun');
    if (body.action === 'command') {
      assert.deepEqual(JSON.parse([...storage.values.values()][0]), { owner_uid: 'owner', request: body });
      return response(snapshot(5));
    }
    return response(snapshot(4));
  } }));
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_STATUS_REQUIRED' });
  await client.resume();
  await client.command({ type: 'round', option_id: 'legal-choice', executor_agent_id: 'NEXUS-01', command_ids: [] });
  assert.deepEqual(calls[1], {
    action: 'command', run_id: 'paid-run', session_id: 'device', operation_id: 'intent-1', expected_revision: 4,
    command: { type: 'round', option_id: 'legal-choice', executor_agent_id: 'NEXUS-01', command_ids: [] },
  });
  assert.equal(storage.values.size, 0);
});

test('lost accepted response survives reload and replays exactly once without a new choice or charge', async () => {
  const storage = memoryStorage();
  let charge = 0;
  let first = true;
  const calls = [];
  const ledger = new Map();
  const invoke = async (_name, body) => {
    if (body.action === 'status') return response();
    calls.push(structuredClone(body));
    if (!ledger.has(body.operation_id)) {
      charge++;
      ledger.set(body.operation_id, response(snapshot(1, { state: { run_id: 'paid-run', unlocked_clues: ['c_01'], action_points_left: 18 } })));
    }
    if (first) { first = false; throw new TypeError('Connection lost after commit'); }
    return ledger.get(body.operation_id);
  };
  const client = createPlayerRunClient(options({ storage, invoke }));
  await client.resume();
  await assert.rejects(client.command({ type: 'question', question_id: 'q-1', npc_id: 'npc-1' }));
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_PENDING' });
  const receipt = [...storage.values.values()][0];
  const restored = createPlayerRunClient(options({ storage, invoke, sessionId: 'newly-claimed-session', createId: () => 'must-not-be-used' }));
  assert.equal([...storage.values.values()][0], receipt);
  const recovered = await restored.resume();
  assert.deepEqual(calls[1], { ...calls[0], session_id: 'newly-claimed-session' });
  assert.equal(charge, 1);
  assert.deepEqual(recovered.run.state.unlocked_clues, ['c_01']);
  assert.deepEqual(recovered.recovered_command, calls[0].command);
  assert.equal(restored.hasPending(), false);
});

test('timeout keeps receipt, does not hang on an uncooperative fetch, and never dispatches a competing intent', async () => {
  const client = createPlayerRunClient(options({ timeoutMs: 5, invoke: async (_name, body) => body.action === 'status' ? response() : new Promise(() => {}) }));
  await client.resume();
  const pending = client.command({ type: 'link', clue_ids: ['c1', 'c2'] });
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_REQUEST_BUSY' });
  await assert.rejects(pending, { code: 'RUN_REQUEST_TIMEOUT' });
  assert.equal(client.hasPending(), true);
});

test('business rejection commits returned run revision and clears only its own receipt', async () => {
  const seen = [];
  const client = createPlayerRunClient(options({ invoke: async (_name, body) => {
    seen.push(body);
    return body.action === 'status' ? response() : response(snapshot(seen.length - 1), { error: 'insufficient_ap' });
  } }));
  await client.resume();
  const outcome = await client.command({ type: 'crisis', option_id: 'costly' });
  assert.equal(outcome.result.error, 'insufficient_ap');
  assert.equal(client.hasPending(), false);
  await client.command({ type: 'crisis', option_id: 'free' });
  assert.equal(seen[2].expected_revision, 1);
});

test('unconfirmed, malformed, and wrong-run responses never discard pending receipts', async () => {
  for (const bad of [{ data: {} }, response(snapshot(1, { id: 'other-run' })),
    { data: { authority_version: 0, run: snapshot() } },
    ...['STALE_RUN', 'RUN_SETTLED'].map(error => ({ data: { authority_version: 1, run: snapshot(1), error } })),
  ]) {
    const client = createPlayerRunClient(options({ invoke: async (_name, body) => body.action === 'status' ? response() : bad }));
    await client.resume();
    await assert.rejects(client.command({ type: 'abandon' }), { code: 'INVALID_RUN_RESPONSE' });
    assert.equal(client.hasPending(), true);
  }
});

test('missing or malformed command results retain the receipt and recover the original outcome', async () => {
  for (const result of [undefined, null, [], 'accepted', 1, true]) {
    const storage = memoryStorage();
    const calls = [];
    let complete = false;
    const client = createPlayerRunClient(options({ storage, invoke: async (_name, body) => {
      if (body.action === 'status') return { data: { authority_version: 1, run: snapshot() } };
      calls.push(structuredClone(body));
      return { data: { authority_version: 1, run: snapshot(1), result: complete ? { response: 'Recorded answer' } : result } };
    } }));
    await client.resume();
    await assert.rejects(client.command({ type: 'question', npc_id: 'npc', question_id: 'q1' }), { code: 'INVALID_RUN_RESPONSE' });
    assert.equal(client.hasPending(), true);
    const receipt = [...storage.values.values()][0];
    await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_PENDING' });
    assert.equal([...storage.values.values()][0], receipt);
    complete = true;
    const recovered = await client.resume();
    assert.equal(recovered.result.response, 'Recorded answer');
    assert.deepEqual(recovered.recovered_command, calls[0].command);
    assert.deepEqual(calls[1], calls[0]);
    assert.equal(client.hasPending(), false);
  }
});

test('storage failure and missing paid run fail closed before any command is sent', async () => {
  let sent = 0;
  const invoke = async () => { sent++; return response(); };
  await assert.rejects(createPlayerRunClient(options({ runId: '', invoke })).resume(), { code: 'RUN_AUTHORITY_REQUIRED' });
  assert.equal(sent, 0);
  const client = createPlayerRunClient(options({ storage: { getItem: () => null, setItem: () => { throw new Error('quota'); } }, invoke }));
  await client.resume();
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_STORAGE_UNAVAILABLE' });
  assert.equal(sent, 1);
});

test('StrictMode refresh callers share status and different owners never discover each other receipts', async () => {
  const storage = memoryStorage();
  let reads = 0;
  const invoke = async (_name, body) => {
    if (body.action === 'status') { reads++; return response(); }
    throw new Error('offline');
  };
  const first = createPlayerRunClient(options({ storage, invoke }));
  await Promise.all([first.resume(), first.resume()]);
  assert.equal(reads, 1);
  await assert.rejects(first.command({ type: 'rest' }));
  const second = createPlayerRunClient(options({ storage, invoke, ownerUid: 'different-owner', sessionId: 'new-device' }));
  assert.equal(second.hasPending(), false);
  await second.resume();
  assert.equal(first.hasPending(), true);
});

test('revision conflicts refresh without silently rebasing a stale selection', async () => {
  const calls = [];
  const client = createPlayerRunClient(options({ invoke: async (_name, body) => {
    calls.push(body);
    if (body.action === 'command') throw Object.assign(new Error('stale'), { code: 'STALE_RUN' });
    return response(snapshot(3));
  } }));
  await client.resume();
  await assert.rejects(client.command({ type: 'round', option_id: 'stale-card' }), { code: 'STALE_RUN' });
  assert.equal(client.hasPending(), false);
  await client.resume();
  assert.equal(calls.filter(body => body.action === 'command').length, 1);
  assert.equal(calls.at(-1).action, 'status');
});

test('pre-commit syntax rejection clears only its receipt while unknown server failures remain retryable', async () => {
  for (const status of [400, 503]) {
    const calls = [];
    const client = createPlayerRunClient(options({ invoke: async (_name, body) => {
      calls.push(body);
      if (body.action === 'status') return response();
      throw Object.assign(new Error('INVALID_COMMAND'), { code: 'INVALID_COMMAND', status });
    } }));
    await client.resume();
    await assert.rejects(client.command({ type: 'round', option_id: 'invalid' }), { status });
    assert.equal(client.hasPending(), status !== 400);
    if (status === 400) {
      await client.resume();
      assert.equal(calls.at(-1).action, 'status');
    }
  }
});

test('recovery copy never promises a failed reply consumed no resources', () => {
  assert.match(runRecoveryMessage({ code: 'offline' }), /not yet confirmed/);
  assert.match(runRecoveryMessage({ code: 'RUN_AUTHORITY_REQUIRED' }), /cannot create free runs/);
});

test('a settled-run rejection is not replayed forever, while session takeover retains its uncertain intent', async () => {
  for (const code of ['RUN_SETTLED', 'SESSION_TAKEN']) {
    const client = createPlayerRunClient(options({ invoke: async (_name, body) => {
      if (body.action === 'status') return response();
      throw Object.assign(new Error(code), { code });
    } }));
    await client.resume();
    await assert.rejects(client.command({ type: 'abandon' }), { code });
    assert.equal(client.hasPending(), code === 'SESSION_TAKEN');
  }
});

test('an older response cannot erase a newer receipt written by another runtime view', async () => {
  const storage = memoryStorage();
  const client = createPlayerRunClient(options({ storage, invoke: async (_name, body) => {
    if (body.action === 'status') return response();
    const [key] = storage.values.keys();
    storage.setItem(key, JSON.stringify({ owner_uid: 'owner', request: { ...body, operation_id: 'newer-intent' } }));
    return response(snapshot(1));
  } }));
  await client.resume();
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_CONFLICT' });
  assert.equal(client.hasPending(), true);
  assert.equal(JSON.parse([...storage.values.values()][0]).request.operation_id, 'newer-intent');
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_PENDING' });
});

test('silent or throwing receipt deletion cannot claim success and recovers the same accepted operation', async () => {
  for (const failure of ['silent', 'throw']) {
    const storage = memoryStorage();
    const remove = storage.removeItem;
    storage.removeItem = () => { if (failure === 'throw') throw new Error('Storage blocked'); };
    const ledger = new Map();
    const calls = [];
    const invoke = async (_name, body) => {
      if (body.action === 'status') return response();
      calls.push(structuredClone(body));
      if (!ledger.has(body.operation_id)) ledger.set(body.operation_id, response(snapshot(1), { response: 'Confirmed answer' }));
      return ledger.get(body.operation_id);
    };
    const client = createPlayerRunClient(options({ storage, invoke }));
    await client.resume();
    await assert.rejects(client.command({ type: 'question', npc_id: 'npc', question_id: 'q1' }), { code: 'RUN_INTENT_CLEANUP_FAILED' });
    const frozen = [...storage.values.values()][0];
    assert.equal(client.hasPending(), true);
    await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_PENDING' });
    const reloaded = createPlayerRunClient(options({ storage, invoke, sessionId: 'claimed-after-reload' }));
    await assert.rejects(reloaded.resume(), { code: 'RUN_INTENT_CLEANUP_FAILED' });
    assert.equal([...storage.values.values()][0], frozen, 'dispatch rebind must not rewrite the frozen receipt');
    storage.removeItem = remove;
    const recovered = await reloaded.resume();
    assert.equal(recovered.result.response, 'Confirmed answer');
    assert.deepEqual(recovered.recovered_command, calls[0].command);
    assert.deepEqual(calls[1], { ...calls[0], session_id: 'claimed-after-reload' });
    assert.deepEqual(calls[2], calls[1]);
    assert.equal(ledger.size, 1);
    assert.equal(reloaded.hasPending(), false);
  }
});

test('receipt replacement during removal stays pending instead of becoming false success', async () => {
  const storage = memoryStorage();
  storage.removeItem = key => {
    const current = JSON.parse(storage.getItem(key));
    storage.setItem(key, JSON.stringify({ ...current, request: { ...current.request, operation_id: 'replacement' } }));
  };
  const client = createPlayerRunClient(options({ storage, invoke: async () => response() }));
  await client.resume();
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_CONFLICT' });
  assert.equal(JSON.parse([...storage.values.values()][0]).request.operation_id, 'replacement');
  await assert.rejects(client.command({ type: 'abandon' }), { code: 'RUN_INTENT_PENDING' });
});

test('cross-tab lock prevents another client overwriting an unresolved owner/run receipt', async () => {
  const storage = memoryStorage();
  const locks = memoryLocks();
  let resolveRequest;
  const pending = new Promise(resolve => { resolveRequest = resolve; });
  const calls = [];
  const invoke = async (_name, body) => {
    calls.push(body);
    return body.action === 'status' ? response() : pending;
  };
  const first = createPlayerRunClient(options({ storage, locks, invoke }));
  const second = createPlayerRunClient(options({ storage, locks, invoke, sessionId: 'other-tab', createId: () => 'other-intent' }));
  await first.resume();
  await second.resume();
  const accepted = first.command({ type: 'rest' });
  const frozen = [...storage.values.values()][0];
  await assert.rejects(second.command({ type: 'abandon' }), { code: 'RUN_REQUEST_BUSY' });
  await assert.rejects(second.resume(), { code: 'RUN_REQUEST_BUSY' });
  assert.equal([...storage.values.values()][0], frozen);
  assert.equal(calls.filter(body => body.action === 'command').length, 1);
  resolveRequest(response(snapshot(1)));
  await accepted;
  await second.resume();
  assert.equal(second.hasPending(), false);
});

test('missing or denied Web Locks fail closed with supported browser and secure origin guidance', async () => {
  for (const locks of [null, { request: async () => { throw new Error('SecurityError'); } }]) {
    let sent = 0;
    const client = createPlayerRunClient(options({ locks, invoke: async () => { sent++; return response(); } }));
    await assert.rejects(client.resume(), { code: 'RUN_LOCK_UNAVAILABLE' });
    await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_LOCK_UNAVAILABLE' });
    assert.equal(sent, 0);
  }
  assert.match(runRecoveryMessage({ code: 'RUN_LOCK_UNAVAILABLE' }), /Web Locks over HTTPS/);
  assert.match(runRecoveryMessage({ code: 'RUN_INTENT_CLEANUP_FAILED' }), /paused/);
});

test('definitive rejection is not acknowledged when its receipt cannot be removed', async () => {
  const storage = memoryStorage();
  const remove = storage.removeItem;
  storage.removeItem = () => {};
  const calls = [];
  const client = createPlayerRunClient(options({ storage, invoke: async (_name, body) => {
    calls.push(body);
    if (body.action === 'command') throw Object.assign(new Error('Invalid intent'), { status: 400 });
    return response(snapshot(2));
  } }));
  await client.resume();
  await assert.rejects(client.command({ type: 'rest' }), { code: 'RUN_INTENT_CLEANUP_FAILED' });
  assert.equal(client.hasPending(), true);
  storage.removeItem = remove;
  await assert.rejects(client.resume(), { status: 400 });
  assert.deepEqual(calls[1], calls[2]);
  assert.equal(client.hasPending(), false);
  await client.resume();
  assert.equal(calls.at(-1).action, 'status');
});

test('a mismatched owner envelope and absent authenticated owner fail closed', async () => {
  const storage = memoryStorage();
  let sent = 0;
  const invoke = async (_name, body) => {
    sent++;
    if (body.action === 'status') return response();
    throw new Error('offline');
  };
  const client = createPlayerRunClient(options({ storage, invoke }));
  await client.resume();
  await assert.rejects(client.command({ type: 'rest' }));
  const [key] = storage.values.keys();
  const receipt = JSON.parse(storage.getItem(key));
  storage.setItem(key, JSON.stringify({ ...receipt, owner_uid: 'another-owner' }));
  await assert.rejects(client.resume(), { code: 'RUN_INTENT_CORRUPT' });
  await assert.rejects(createPlayerRunClient(options({ ownerUid: undefined, storage, invoke })).resume(), { code: 'RUN_AUTHORITY_REQUIRED' });
  assert.equal(sent, 2);
});

test('a restricted browser storage getter yields a friendly closed gate rather than crashing render', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    const client = createPlayerRunClient({ ownerUid: 'owner', runId: 'paid-run', sessionId: 'device', locks: memoryLocks(), invoke: () => { throw new Error('must not dispatch'); } });
    await assert.rejects(client.resume(), { code: 'RUN_INTENT_STORAGE_UNAVAILABLE' });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});
