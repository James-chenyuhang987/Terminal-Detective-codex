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
