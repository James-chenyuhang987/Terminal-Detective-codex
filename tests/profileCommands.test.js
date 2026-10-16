import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileCommand, appendProfileCommand, readProfileCommands, removeProfileCommand,
  clearProfileCommands, hasLegacyProfileWrites, PROFILE_COMMAND_PREFIX,
} from '../src/game/profileCommands.js';

function storage() {
  const data = new Map();
  return { data, get length() { return data.size; }, key: n => [...data.keys()][n],
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const receipt = { ownerUid: 'owner-a', lineageId: 'web-session-1234567890', baseRevision: 7,
  operationId: 'operation-1234567890', command: { type: 'purchase_item', item_id: 'energy_cell', quantity: 1 } };

test('commands reject snapshots, arbitrary economic fields, inherited keys and non-JSON values', () => {
  for (const [type, args] of [
    ['patch', { gold: 9999 }], ['identity', { patch: { gold: 9999 } }],
    ['checkin', { now: '2099-01-01' }], ['settle_case', { run_id: 'run1', xp_gain: 99999 }],
    ['constructor', {}], ['toString', {}], ['__proto__', {}], [null, {}],
    ['purchase_item', { item_id: 'x', quantity: Infinity }],
    ['identity', { patch: JSON.parse('{"__proto__":{"gold":99}}') }],
    ['identity', { patch: { signature: 'x'.repeat(1025) } }],
  ]) assert.throws(() => profileCommand(type, args), { code: 'PROFILE_COMMAND_INVALID' });
});

test('intents are canonical, detached from forms and contain no profile snapshots', () => {
  const args = { patch: { signature: 'truth', detective_name: 'NEXUS' } };
  const command = profileCommand('identity', args);
  args.patch.signature = 'changed';
  assert.equal(command.patch.signature, 'truth');
  assert.equal(JSON.stringify(command), JSON.stringify(profileCommand('identity', {
    patch: { detective_name: 'NEXUS', signature: 'truth' },
  })));
});

test('case-start journal preserves negotiated investigation versions and legacy omission', () => {
  for (const version of [undefined, 1, 2]) {
    const store = storage();
    const args = { case_id: 'Lvl_01', ...(version === undefined ? {} : { investigation_version: version }) };
    const command = profileCommand('start_case', args);
    appendProfileCommand({ ...receipt, command }, store);
    assert.deepEqual(readProfileCommands('owner-a', store)[0].command, { ...args, type: 'start_case' });
  }
  for (const version of [0, 3, '2', null, false]) {
    assert.throws(() => profileCommand('start_case', { case_id: 'Lvl_01', investigation_version: version }),
      { code: 'PROFILE_COMMAND_INVALID' });
  }
});

test('new saves and run selection persist their exact canonical intent without carrying gameplay snapshots', () => {
  for (const args of [{ case_id: 'Lvl_01' }, { case_id: 'Lvl_01', new_save: false },
    { case_id: 'Lvl_01', new_save: true, investigation_version: 2 }]) {
    const store = storage();
    appendProfileCommand({ ...receipt, command: profileCommand('start_case', args) }, store);
    assert.deepEqual(readProfileCommands('owner-a', store)[0].command, { type: 'start_case', ...args });
  }
  const store = storage();
  const intent = profileCommand('resume_run', { run_id: 'run-second-save' });
  appendProfileCommand({ ...receipt, command: intent }, store);
  assert.deepEqual(readProfileCommands('owner-a', store)[0].command, intent);
  for (const new_save of [1, 0, 'true', null, {}, []]) {
    assert.throws(() => profileCommand('start_case', { case_id: 'Lvl_01', new_save }), { code: 'PROFILE_COMMAND_INVALID' });
  }
  for (const args of [{}, { run_id: '' }, { run_id: '../run' }, { run_id: null }, { run_id: 'run-1', state: {} }, { run_id: 'x'.repeat(181) }]) {
    assert.throws(() => profileCommand('resume_run', args), { code: 'PROFILE_COMMAND_INVALID' });
  }
});

test('switch receipts survive reload and removing profile commands leaves every run retry receipt intact', () => {
  const store = storage();
  const runReceiptKey = 'td-authoritative-run-intent-v2:owner-a:run-one';
  store.setItem(runReceiptKey, '{"unconfirmed":"run action"}');
  const entry = appendProfileCommand({ ...receipt, command: profileCommand('resume_run', { run_id: 'run-two' }) }, store);
  assert.deepEqual(readProfileCommands('owner-a', store)[0], entry);
  removeProfileCommand('owner-a', entry.operationId, store);
  assert.equal(store.getItem(runReceiptKey), '{"unconfirmed":"run action"}');
  assert.deepEqual(readProfileCommands('owner-a', store), []);
});

test('journal keeps one immutable owner-scoped receipt for retries and reloads', () => {
  const store = storage();
  const entry = appendProfileCommand(receipt, store);
  assert.deepEqual(readProfileCommands('owner-a', store), [entry]);
  assert.deepEqual(readProfileCommands('owner-b', store), []);
  assert.throws(() => appendProfileCommand({ ...receipt, operationId: 'operation-duplicate1' }, store), { code: 'PROFILE_COMMAND_PENDING' });
  assert.equal(entry.baseRevision, 7);
  removeProfileCommand('owner-b', entry.operationId, store);
  assert.equal(readProfileCommands('owner-a', store).length, 1);
  clearProfileCommands('owner-a', store);
  assert.deepEqual(readProfileCommands('owner-a', store), []);
});

test('journal stops on checksum corruption, conflicting tabs and storage write/delete failure', () => {
  const store = storage();
  appendProfileCommand(receipt, store);
  const key = store.key(0);
  const saved = store.getItem(key);
  store.setItem(key, saved.replace('energy_cell', 'forged_item'));
  assert.throws(() => readProfileCommands('owner-a', store), { code: 'PROFILE_WAL_CORRUPT' });
  store.setItem(key, saved);
  const other = storage();
  appendProfileCommand({ ...receipt, operationId: 'operation-secondtab' }, other);
  store.setItem(other.key(0), other.getItem(other.key(0)));
  assert.throws(() => readProfileCommands('owner-a', store), { code: 'PROFILE_WAL_DIVERGED' });
  const blocked = storage();
  blocked.setItem = () => {};
  assert.throws(() => appendProfileCommand(receipt, blocked), { code: 'PROFILE_WAL_UNAVAILABLE' });
  blocked.setItem = (key, value) => blocked.data.set(key, value);
  appendProfileCommand(receipt, blocked);
  blocked.removeItem = () => {};
  assert.throws(() => removeProfileCommand(receipt.ownerUid, receipt.operationId, blocked), { code: 'PROFILE_WAL_UNAVAILABLE' });
});

test('a browser blocking the localStorage getter returns the recoverable storage gate for every journal operation', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true,
      get() { throw new DOMException('Blocked storage', 'SecurityError'); } });
    for (const operation of [
      () => appendProfileCommand(receipt), () => readProfileCommands(receipt.ownerUid),
      () => removeProfileCommand(receipt.ownerUid, receipt.operationId),
      () => clearProfileCommands(receipt.ownerUid), () => hasLegacyProfileWrites(receipt.ownerUid),
    ]) assert.throws(operation, { code: 'PROFILE_WAL_UNAVAILABLE' });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  }
});

test('legacy snapshots are detected but never loaded or automatically discarded', () => {
  const store = storage();
  store.setItem('td_profile_wal_v1:owner-a:operation:old', '{"gold":9999999}');
  assert.equal(hasLegacyProfileWrites('owner-a', store), true);
  assert.equal(hasLegacyProfileWrites('owner-b', store), false);
  assert.deepEqual(readProfileCommands('owner-a', store), []);
  clearProfileCommands('owner-a', store);
  assert.equal(store.length, 1);
  assert.equal(PROFILE_COMMAND_PREFIX, 'td_profile_commands_v1:');
});

test('invalid receipt identity and revision are rejected before any write', () => {
  for (const patch of [{ ownerUid: '' }, { lineageId: 'short' }, { lineageId: 'x'.repeat(129) },
    { baseRevision: -1 }, { baseRevision: 1.5 }, { operationId: '../escape' }]) {
    const store = storage();
    assert.throws(() => appendProfileCommand({ ...receipt, ...patch }, store));
    assert.equal(store.length, 0);
  }
});
