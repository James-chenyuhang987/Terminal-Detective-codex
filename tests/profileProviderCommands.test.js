import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import * as journal from '../src/game/profileCommands.js';
import { normalizeProfile } from '../src/game/homeProgress.js';
import { createSingleFlight } from '../src/lib/singleFlight.js';

const tree = ts.createSourceFile('ProfileContext.jsx', readFileSync(new URL('../src/lib/ProfileContext.jsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const providerIndex = tree.statements.findIndex(node => ts.isFunctionDeclaration(node) && node.name.text === 'ProfileProvider');
const code = ts.transpileModule(tree.statements.slice(0, providerIndex + 1)
  .filter(node => !ts.isImportDeclaration(node)).map(node => node.getText(tree).replace(/^export /, '')).join('\n'),
{ compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;

function memoryStorage() {
  const data = new Map();
  return { get length() { return data.size; }, key: index => [...data.keys()][index],
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const deferred = () => { let resolve; let reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const failure = (code, status) => Object.assign(new Error(code), { code, ...(status === undefined ? {} : { status }) });
const payload = (id = 'owner-a', revision = 0, extra = {}) => ({ authority_version: 1, account: { id },
  profile: { gold: 1000, energy: 100, profile_revision: revision }, active_run: null, ...extra });
const libraryRun = (id, revision = 0, extra = {}) => ({ id, case_id: 'Lvl_01', revision, status: 'active',
  created_at: '2026-10-16T00:00:00.000Z', updated_at: '2026-10-16T00:00:00.000Z',
  zone_id: 'office', turn_count: revision, action_points_left: 20 - revision,
  clue_count: revision, clue_total: 9, grade: null, selected: false, ...extra });
const libraryPayload = (revision, activeRun, runs, extra = {}) => payload('owner-a', revision, {
  active_run: activeRun, save_library_version: 1, save_library_limit: 20, run_library: runs, ...extra,
});

// Hook adapter executes the real provider, including dependency changes and effect cleanup.
function harness(invoke, store = memoryStorage()) {
  let auth = { user: { id: 'owner-a' }, isAuthenticated: true };
  let cursor = 0; let dirty = true; let value; let synchronize;
  const slots = []; const pendingEffects = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const memo = (factory, deps) => {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
    return slots[i].value;
  };
  const bindings = {
    React: { createElement: (_type, props) => props.value }, createContext: () => ({ Provider: 'Profile' }),
    useAuth: () => auth,
    useRef: initial => { const i = cursor++; slots[i] ||= { current: initial }; return slots[i]; },
    useState: initial => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useCallback: (fn, deps) => memo(() => fn, deps), useMemo: memo,
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        pendingEffects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    normalizeProfile, createSingleFlight, invokePlayerProfile: invoke,
    profileCommand: journal.profileCommand,
    appendProfileCommand: entry => journal.appendProfileCommand(entry, store),
    readProfileCommands: owner => journal.readProfileCommands(owner, store),
    removeProfileCommand: (owner, id) => journal.removeProfileCommand(owner, id, store),
    clearProfileCommands: owner => journal.clearProfileCommands(owner, store),
    hasLegacyProfileWrites: owner => journal.hasLegacyProfileWrites(owner, store),
    clearProfileOperations: () => {}, clearPendingSettlements: () => {},
    window: { setInterval: callback => { synchronize = callback; return 1; }, clearInterval: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
  };
  const Provider = compileFunction(`${code}\nreturn ProfileProvider;`, Object.keys(bindings))(...Object.values(bindings));
  const render = () => {
    if (!dirty) return;
    dirty = false; cursor = 0; value = Provider({ children: null });
    pendingEffects.splice(0).forEach(effect => effect());
  };
  return {
    get value() { render(); return value; }, store,
    poll() { synchronize(); },
    switchOwner(id) { auth = { user: id ? { id } : null, isAuthenticated: Boolean(id) }; dirty = true; render(); },
    async flush() { for (let i = 0; i < 12; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('real provider sends only persisted intent and never displays an optimistic purchase', async () => {
  const response = deferred(); const calls = [];
  const app = harness(async (action, args) => {
    calls.push({ action, args });
    if (action === 'command') {
      const entry = journal.readProfileCommands('owner-a', app.store)[0];
      assert.equal(entry.operationId, args.operation_id);
      return response.promise;
    }
    return payload();
  });
  await app.flush();
  const buying = app.value.command('purchase_item', { item_id: 'energy_cell', quantity: 1 });
  await app.flush();
  assert.equal(app.value.profile.gold, 1000);
  const sent = calls.find(call => call.action === 'command').args;
  assert.deepEqual(sent.command, { item_id: 'energy_cell', quantity: 1, type: 'purchase_item' });
  assert.equal(sent.expected_revision, 0);
  assert.equal(Object.hasOwn(sent, 'patch'), false);
  response.resolve(payload('owner-a', 1, { profile: { gold: 600, profile_revision: 1 }, result: { item_id: 'energy_cell' } }));
  assert.equal((await buying).profile.gold, 600);
  await app.flush();
  assert.equal(app.value.profile.gold, 600);
  assert.equal(app.value.pendingCount, 0);
  app.unmount();
});

test('archive clue labels are owner-bound read-only display data and never enter profile or receipts', async () => {
  const pending = deferred();
  const records = [{ case_id: 'Lvl_01', discovered_clues: ['c_01'], valid_links: [] }];
  const labels = { Lvl_01: { c_01: { zh: '染血收据', en: 'Bloody Receipt' }, c_03: { zh: '未发现', en: 'Undiscovered' } },
    Lvl_02: { d_01: { zh: '未发现第二案', en: 'Undiscovered second case' } } };
  let owner = 'owner-a';
  const app = harness(async action => {
    if (action === 'command') return pending.promise;
    return payload(owner, 0, { profile: { profile_revision: 0, gold: 1000, case_records: owner === 'owner-a' ? records : [] },
      archive_clue_labels: labels });
  });
  await app.flush();
  assert.deepEqual(app.value.archiveClueLabels, { Lvl_01: { c_01: labels.Lvl_01.c_01 } });
  assert.equal(Object.isFrozen(app.value.archiveClueLabels.Lvl_01.c_01), true);
  assert.equal(Object.hasOwn(app.value.profile, 'archive_clue_labels'), false);
  assert.equal(Object.hasOwn(app.value.profile, 'archiveClueLabels'), false);
  const command = app.value.command('checkin');
  const cancelled = assert.rejects(command, { code: 'PROFILE_REQUEST_CANCELLED' });
  await app.flush();
  const journalText = JSON.stringify(journal.readProfileCommands('owner-a', app.store));
  assert.ok(!journalText.includes('Bloody Receipt') && !journalText.includes('archive'));
  owner = 'owner-b';
  app.switchOwner(owner);
  await app.flush();
  assert.deepEqual(app.value.archiveClueLabels, {});
  pending.resolve(payload('owner-a', 1, { profile: { profile_revision: 1, case_records: records }, archive_clue_labels: labels, result: {} }));
  await cancelled;
  await app.flush();
  assert.deepEqual(app.value.archiveClueLabels, {});
  app.unmount();
});

test('lost response remains pending; same intent reuses original operation/revision once without double charge', async () => {
  const calls = []; let offline = true;
  const app = harness(async (action, args) => {
    if (action !== 'command') return payload();
    calls.push(args);
    if (offline) throw failure('PROFILE_NETWORK', 0);
    return payload('owner-a', 1, { profile: { gold: 600, profile_revision: 1 }, result: { purchased: true } });
  });
  await app.flush();
  await assert.rejects(app.value.command('purchase_item', { item_id: 'energy_cell', quantity: 1 }), { code: 'PROFILE_COMMAND_PENDING' });
  await app.flush();
  assert.equal(app.value.syncStatus, 'pending');
  assert.equal(app.value.profile.gold, 1000);
  await assert.rejects(app.value.refresh(), { code: 'PROFILE_COMMAND_PENDING' });
  await app.flush();
  assert.equal(app.value.syncStatus, 'pending');
  offline = false;
  const result = await app.value.command('purchase_item', { quantity: 1, item_id: 'energy_cell' });
  assert.equal(result.purchased, true);
  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], calls[2]);
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 0);
  app.unmount();
});

test('reload claims a new game session but replays unchanged receipt and restores active run', async () => {
  const store = memoryStorage();
  const entry = journal.appendProfileCommand({ ownerUid: 'owner-a', lineageId: 'web-previous-session-001',
    operationId: 'operation-previous-001', baseRevision: 4, command: { type: 'start_case', case_id: 'Lvl_01' } }, store);
  const run = { id: 'server-run-1', case_id: 'Lvl_01', revision: 0 };
  const app = harness(async (action, args) => {
    if (action === 'command') {
      assert.equal(args.operation_id, entry.operationId);
      assert.equal(args.expected_revision, 4);
      assert.notEqual(args.session_id, entry.lineageId);
      return payload('owner-a', 5, { active_run: run, result: { run } });
    }
    return payload('owner-a', 5, { active_run: run });
  }, store);
  await app.flush();
  assert.deepEqual(app.value.activeRun, run);
  assert.equal(app.value.pendingCount, 0);
  app.unmount();
});

test('account switching cancels late replies and queued commands without consuming old receipts', async () => {
  const response = deferred(); let sends = 0;
  const app = harness(async (action) => {
    if (action === 'command') { sends++; return response.promise; }
    return payload(sends ? 'owner-b' : 'owner-a');
  });
  await app.flush();
  const first = app.value.command('checkin');
  const second = app.value.command('visit_lobby');
  const firstCheck = assert.rejects(first, { code: 'PROFILE_REQUEST_CANCELLED' });
  const secondCheck = assert.rejects(second, { code: 'PROFILE_REQUEST_CANCELLED' });
  await app.flush();
  app.switchOwner('owner-b');
  await app.flush();
  response.resolve(payload('owner-a', 1, { profile: { gold: 9999, profile_revision: 1 }, result: {} }));
  await Promise.all([firstCheck, secondCheck]);
  await app.flush();
  assert.equal(app.value.profile.gold, 1000);
  assert.equal(app.value.account.id, 'owner-b');
  assert.equal(sends, 1);
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
  app.unmount();
});

test('storage failure after cloud acceptance retains receipt and blocks further commands', async () => {
  const store = memoryStorage(); store.removeItem = () => {};
  const app = harness(async action => action === 'command'
    ? payload('owner-a', 1, { result: { rewarded: true } }) : payload(), store);
  await app.flush();
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_WAL_UNAVAILABLE' });
  await app.flush();
  assert.equal(app.value.syncStatus, 'storage_unavailable');
  assert.equal(journal.readProfileCommands('owner-a', store).length, 1);
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_SYNC_BLOCKED' });
  app.unmount();
});

test('late status cannot downgrade a newer profile or unblock storage recovery', async () => {
  for (const blocked of [false, true]) {
    const status = deferred(); const store = memoryStorage();
    if (blocked) store.removeItem = () => {};
    const app = harness(async action => action === 'status' ? status.promise : action === 'command'
      ? payload('owner-a', 1, { profile: { gold: 600, profile_revision: 1 }, result: {} }) : payload(), store);
    await app.flush();
    const refresh = app.value.refresh();
    const checked = blocked ? assert.rejects(refresh, { code: 'PROFILE_SYNC_BLOCKED' }) : refresh;
    if (blocked) await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_WAL_UNAVAILABLE' });
    else await app.value.command('checkin');
    status.resolve(payload());
    await checked;
    await app.flush();
    assert.equal(app.value.profile.gold, 600);
    assert.equal(app.value.syncStatus, blocked ? 'storage_unavailable' : 'online');
    app.unmount();
  }
});

test('malformed command acknowledgment retains its receipt and recovery cannot erase it before a valid cloud fetch', async () => {
  let unavailable = true;
  const app = harness(async action => {
    if (action === 'command') return payload('owner-a', 1);
    if (action === 'status' && unavailable) throw failure('PROFILE_NETWORK', 0);
    return payload();
  });
  await app.flush();
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_DATA_CORRUPT' });
  await app.flush();
  assert.equal(app.value.syncStatus, 'recovery');
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
  await assert.rejects(app.value.refresh(), { code: 'PROFILE_SYNC_BLOCKED' });
  await assert.rejects(app.value.discardPendingChanges(), { code: 'PROFILE_NETWORK' });
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
  await app.flush();
  assert.equal(app.value.syncStatus, 'recovery');
  await assert.rejects(app.value.refresh(), { code: 'PROFILE_SYNC_BLOCKED' });
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_SYNC_BLOCKED' });
  unavailable = false;
  await app.value.discardPendingChanges();
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 0);
  app.unmount();
});

test('same-profile-revision responses retain the newest run; settlement and a new owner clear it', async () => {
  const replies = []; let owner = 'owner-a';
  const initialRun = { id: 'run-one', revision: 1, state: { round: 1 } };
  const latestRun = { id: 'run-one', revision: 4, state: { round: 4 } };
  const app = harness(async action => {
    if (action === 'status') { const reply = deferred(); replies.push(reply); return reply.promise; }
    if (action === 'command') return payload(owner, 2, { result: {} });
    return payload(owner, 1, { active_run: initialRun });
  });
  await app.flush();
  const old = app.value.refresh();
  const fresh = app.value.refresh();
  replies[1].resolve(payload(owner, 1, { active_run: latestRun }));
  await fresh;
  replies[0].resolve(payload(owner, 1, { active_run: initialRun }));
  await old;
  await app.flush();
  assert.deepEqual(app.value.activeRun, latestRun);
  const preSettlement = app.value.refresh();
  await app.value.command('settle_case', { run_id: 'run-one' });
  assert.equal(app.value.activeRun, null);
  replies[2].resolve(payload(owner, 1, { active_run: latestRun }));
  await preSettlement;
  assert.equal(app.value.activeRun, null);
  owner = 'owner-b';
  app.switchOwner(owner);
  await app.flush();
  assert.deepEqual(app.value.activeRun, initialRun);
  app.unmount();
});

test('command results expose current active run separately from immutable original replay metadata', async () => {
  const original = { id: 'run-original', revision: 0 };
  for (const current of [null, { id: 'run-newer', revision: 3 }]) {
    const app = harness(async action => action === 'command'
      ? payload('owner-a', 4, { active_run: current, result: { run: original } }) : payload());
    await app.flush();
    const result = await app.value.command('start_case', { case_id: 'Lvl_01' });
    assert.deepEqual(result.run, original);
    assert.deepEqual(result.result.run, original);
    assert.deepEqual(result.active_run, current);
    assert.deepEqual(app.value.activeRun, current);
    app.unmount();
  }
});

test('save library keeps two saves of the same case and exposes only bounded public metadata', async () => {
  const first = libraryRun('same-case-first', 3);
  const second = libraryRun('same-case-second', 1, { selected: true });
  const secret = { state: { private_answer: 'never copy' }, reward: { gold: 99 }, owner_uid: 'owner-a' };
  const app = harness(async () => libraryPayload(1, second, [{ ...first, ...secret }, second]));
  await app.flush();
  assert.equal(app.value.saveLibraryVersion, 1);
  assert.equal(app.value.saveLibraryLimit, 20);
  assert.deepEqual(app.value.savedRuns.map(run => [run.id, run.case_id, run.selected]), [
    [first.id, 'Lvl_01', false], [second.id, 'Lvl_01', true],
  ]);
  assert.equal(Object.isFrozen(app.value.savedRuns[0]), true);
  const serialized = JSON.stringify(app.value.savedRuns);
  assert.doesNotMatch(serialized, /private_answer|reward|owner_uid|never copy/);
  assert.equal(Object.hasOwn(app.value.profile, 'run_library'), false);
  assert.equal(app.store.length, 0);
  app.unmount();
});

test('legacy payloads safely summarize the single active run without enabling multiple-save capability', async () => {
  const run = { id: 'legacy-paid-run', case_id: 'Lvl_01', revision: 4, status: 'active',
    state: { current_zone: 'balcony', turn_count: 2, action_points_left: 18, unlocked_clues: ['c_01'] } };
  for (const extra of [{}, { save_library_version: 1 }, { save_library_version: 99 }]) {
    const app = harness(async () => payload('owner-a', 1, { active_run: run, ...extra }));
    await app.flush();
    assert.equal(app.value.saveLibraryVersion, 0);
    assert.equal(app.value.saveLibraryLimit, 20);
    assert.deepEqual(app.value.savedRuns.map(item => [item.id, item.zone_id, item.turn_count, item.action_points_left, item.clue_count, item.selected]),
      [[run.id, 'balcony', 2, 18, 1, true]]);
    app.unmount();
  }
  const app = harness(async () => payload());
  await app.flush();
  assert.deepEqual(app.value.savedRuns, []);
  assert.equal(app.value.saveLibraryVersion, 0);
  app.unmount();
});

test('save-library capacity limits unfinished investigations while retaining twenty settlement-history summaries', async () => {
  const active = libraryRun('current-save', 2);
  const history = Array.from({ length: 20 }, (_, i) => libraryRun(`history-${i}`, 3, { status: 'settled', grade: 'B' }));
  const app = harness(async () => libraryPayload(1, active, [active, ...history]));
  await app.flush();
  assert.equal(app.value.saveLibraryVersion, 1);
  assert.equal(app.value.saveLibraryLimit, 20);
  assert.equal(app.value.savedRuns.length, 21);
  assert.equal(app.value.savedRuns.filter(run => run.status === 'settled').length, 20);
  app.unmount();
});

test('out-of-order polls cannot downgrade save progress, drop another same-case save or change selection at one profile revision', async () => {
  const replies = [];
  const first = libraryRun('run-one', 1, { selected: true });
  const second = libraryRun('run-two', 0);
  const app = harness(async action => {
    if (action === 'status') { const reply = deferred(); replies.push(reply); return reply.promise; }
    return libraryPayload(1, first, [first, second]);
  });
  await app.flush();
  const old = app.value.refresh();
  const fresh = app.value.refresh();
  const latest = libraryRun(first.id, 5, { updated_at: '2026-10-16T00:10:00.000Z' });
  replies[1].resolve(libraryPayload(1, latest, [latest, second]));
  await fresh;
  replies[0].resolve(libraryPayload(1, second, [first, { ...second, selected: true }]));
  await old;
  await app.flush();
  assert.equal(app.value.activeRun.id, first.id);
  assert.equal(app.value.activeRun.revision, 5);
  assert.deepEqual(app.value.savedRuns.map(run => [run.id, run.revision, run.selected]), [[first.id, 5, true], [second.id, 0, false]]);
  const incomplete = app.value.refresh();
  replies[2].resolve(libraryPayload(1, null, [first]));
  await incomplete;
  assert.equal(app.value.activeRun.id, first.id);
  assert.equal(app.value.savedRuns.length, 2);
  assert.equal(app.value.savedRuns.find(run => run.id === first.id).revision, 5);
  app.unmount();
});

test('a confirmed save switch advances profile revision and old polls cannot restore the previous selected save', async () => {
  const oldReply = deferred();
  const first = libraryRun('run-one', 4);
  const second = libraryRun('run-two', 2);
  const app = harness(async (action, args) => {
    if (action === 'status') return oldReply.promise;
    if (action === 'command') {
      assert.deepEqual(args.command, { type: 'resume_run', run_id: second.id });
      assert.equal(args.expected_revision, 1);
      return libraryPayload(2, second, [first, second], { result: { run_id: second.id } });
    }
    return libraryPayload(1, first, [first, second]);
  });
  await app.flush();
  const old = app.value.refresh();
  const result = await app.value.command('resume_run', { run_id: second.id });
  assert.equal(result.active_run.id, second.id);
  oldReply.resolve(libraryPayload(1, first, [first]));
  await old;
  assert.equal(app.value.activeRun.id, second.id);
  assert.equal(app.value.savedRuns.length, 2);
  assert.deepEqual(app.value.savedRuns.filter(run => run.selected).map(run => run.id), [second.id]);
  assert.equal(app.value.pendingCount, 0);
  app.unmount();
});

test('missing-save rejections release only their own profile receipt and cannot lock out the next investigation', async () => {
  for (const type of ['resume_run', 'settle_case']) {
    const first = libraryRun('existing-save', 4);
    const calls = [];
    const app = harness(async (action, args) => {
      if (action !== 'command') return libraryPayload(1, first, [first]);
      calls.push(args);
      if (args.command.type === type) throw failure('RUN_NOT_FOUND', 404);
      return libraryPayload(2, first, [first], { result: { saved: true } });
    });
    await app.flush();
    const runReceiptKey = 'td-authoritative-run-intent-v2:owner-a:existing-save';
    app.store.setItem(runReceiptKey, '{"unconfirmed":"run action"}');
    await assert.rejects(app.value.command(type, { run_id: 'missing-save' }), { code: 'RUN_NOT_FOUND' });
    assert.equal(journal.readProfileCommands('owner-a', app.store).length, 0);
    assert.equal(app.value.pendingCount, 0);
    assert.equal(app.value.isReadOnly, false);
    assert.equal(app.store.getItem(runReceiptKey), '{"unconfirmed":"run action"}');
    assert.equal(app.value.activeRun.id, first.id);
    assert.equal((await app.value.command('checkin')).saved, true);
    assert.equal(calls.length, 2);
    assert.equal(calls[1].expected_revision, 1, 'The rejected switch did not advance the profile.');
    assert.equal(calls[1].command.type, 'checkin');
    assert.notEqual(calls[1].operation_id, calls[0].operation_id);
    app.unmount();
  }
});

test('missing-save receipt cleanup failure preserves the receipt and blocks new commands until storage recovers', async () => {
  const store = memoryStorage();
  store.removeItem = () => {};
  const app = harness(async action => {
    if (action === 'command') throw failure('RUN_NOT_FOUND', 404);
    return payload();
  }, store);
  await app.flush();
  await assert.rejects(app.value.command('resume_run', { run_id: 'missing-save' }), { code: 'PROFILE_WAL_UNAVAILABLE' });
  assert.equal(app.value.syncStatus, 'storage_unavailable');
  assert.equal(journal.readProfileCommands('owner-a', store).length, 1);
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_SYNC_BLOCKED' });
  app.unmount();
});

test('an uncertain missing-save response retains the original receipt for exact reconciliation', async () => {
  const calls = [];
  const app = harness(async (action, args) => {
    if (action !== 'command') return payload();
    calls.push(args);
    throw failure('RUN_NOT_FOUND', 503);
  });
  await app.flush();
  await assert.rejects(app.value.command('resume_run', { run_id: 'missing-save' }), { code: 'PROFILE_COMMAND_PENDING' });
  await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_COMMAND_PENDING' });
  assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
  assert.deepEqual(calls[0], calls[1]);
  app.unmount();
});

test('a newer profile revision never downgrades the same investigation revision while real selection changes remain possible', async () => {
  const latest = libraryRun('run-one', 10);
  const second = libraryRun('run-two', 2);
  let response = libraryPayload(1, latest, [latest, second]);
  const app = harness(async () => response);
  await app.flush();
  const olderRun = libraryRun(latest.id, 9);
  response = libraryPayload(2, olderRun, [olderRun, second], { profile: { profile_revision: 2, gold: 900 } });
  await app.value.refresh();
  assert.equal(app.value.profile.profile_revision, 2);
  assert.equal(app.value.profile.gold, 900);
  assert.equal(app.value.activeRun.revision, 10);
  assert.equal(app.value.savedRuns.find(run => run.id === latest.id).revision, 10);
  response = libraryPayload(3, second, [latest, second]);
  await app.value.refresh();
  assert.equal(app.value.activeRun.id, second.id);
  assert.deepEqual(app.value.savedRuns.filter(run => run.selected).map(run => run.id), [second.id]);
  response = libraryPayload(4, null, [latest, second]);
  await app.value.refresh();
  assert.equal(app.value.activeRun, null);
  assert.ok(app.value.savedRuns.every(run => !run.selected));
  app.unmount();
});

test('same run-revision library metadata keeps its newest timestamp and a capability downgrade closes multiple-save controls', async () => {
  const run = libraryRun('run-one', 3, { updated_at: '2026-10-16T00:10:00.000Z', clue_count: 4 });
  let response = libraryPayload(1, run, [run], { save_library_limit: 12 });
  const app = harness(async () => response);
  await app.flush();
  assert.equal(app.value.saveLibraryLimit, 12);
  response = libraryPayload(1, run, [{ ...run, updated_at: '2026-10-16T00:00:00.000Z', clue_count: 2 }]);
  await app.value.refresh();
  assert.equal(app.value.savedRuns[0].clue_count, 4);
  response = payload('owner-a', 2, { active_run: run });
  await app.value.refresh();
  assert.equal(app.value.saveLibraryVersion, 0);
  assert.equal(app.value.saveLibraryLimit, 20);
  assert.equal(app.value.savedRuns.length, 1);
  app.unmount();
});

test('changing profile owners immediately clears save metadata and ignores the previous owner delayed response', async () => {
  const late = deferred(); let owner = 'owner-a';
  const run = libraryRun('owner-a-save', 2);
  const app = harness(async action => {
    if (action === 'status') return late.promise;
    return owner === 'owner-a' ? libraryPayload(1, run, [run]) : payload(owner);
  });
  await app.flush();
  const refresh = app.value.refresh();
  const cancelled = assert.rejects(refresh, { code: 'PROFILE_REQUEST_CANCELLED' });
  owner = 'owner-b'; app.switchOwner(owner);
  assert.deepEqual(app.value.savedRuns, []);
  assert.equal(app.value.saveLibraryVersion, 0);
  assert.equal(app.value.saveLibraryLimit, 20);
  await app.flush();
  late.resolve(libraryPayload(2, run, [run]));
  await cancelled;
  assert.deepEqual(app.value.savedRuns, []);
  assert.equal(app.value.activeRun, null);
  assert.equal(app.value.account.id, owner);
  app.unmount();
});

test('resume replay returns the current selection separately from immutable original result and keeps run receipts', async () => {
  const first = libraryRun('old-save', 1); const current = libraryRun('selected-save', 7);
  const store = memoryStorage();
  const receipt = journal.appendProfileCommand({ ownerUid: 'owner-a', lineageId: 'web-previous-session-001',
    operationId: 'operation-previous-001', baseRevision: 1, command: { type: 'resume_run', run_id: first.id } }, store);
  const runKey = 'td-authoritative-run-intent-v2:owner-a:old-save';
  store.setItem(runKey, '{"unconfirmed":"gameplay"}');
  const app = harness(async (action, args) => {
    if (action === 'command') {
      assert.equal(args.operation_id, receipt.operationId);
      assert.deepEqual(args.command, receipt.command);
      return libraryPayload(3, current, [first, current], { result: { run: first } });
    }
    return libraryPayload(3, current, [first, current]);
  }, store);
  await app.flush();
  assert.equal(app.value.activeRun.id, current.id);
  assert.deepEqual(app.value.savedRuns.filter(run => run.selected).map(run => run.id), [current.id]);
  assert.equal(store.getItem(runKey), '{"unconfirmed":"gameplay"}');
  assert.equal(journal.readProfileCommands('owner-a', store).length, 0);
  app.unmount();
});

test('malformed save libraries cannot accept a paid command or clear its retry receipt', async () => {
  const run = libraryRun('run-one');
  for (const run_library of [null, {}, [run, run], [{ ...run, revision: -1 }], [{ ...run, id: '../escape' }],
    [{ ...run, status: 'unknown' }], [{ ...run, case_id: '' }], Array.from({ length: 41 }, (_, i) => libraryRun(`run-${i}`))]) {
    const app = harness(async action => action === 'command'
      ? libraryPayload(1, run, run_library, { result: {} }) : payload());
    await app.flush();
    await assert.rejects(app.value.command('start_case', { case_id: 'Lvl_01', new_save: true }), { code: 'PROFILE_DATA_CORRUPT' });
    assert.equal(app.value.profile.profile_revision, 0);
    assert.equal(app.value.saveLibraryVersion, 0);
    assert.deepEqual(app.value.savedRuns, []);
    assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
    app.unmount();
  }
});

test('malformed or missing authoritative active run fails closed without clearing pending intent', async () => {
  for (const active_run of [undefined, [], {}, { id: 'run-one', revision: -1 }, { id: 'run-one', revision: '4' }]) {
    const app = harness(async action => action === 'command'
      ? payload('owner-a', 1, { active_run, result: {} }) : payload());
    await app.flush();
    await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_DATA_CORRUPT' });
    assert.equal(app.value.profile.profile_revision, 0);
    assert.equal(app.value.syncStatus, 'recovery');
    assert.equal(journal.readProfileCommands('owner-a', app.store).length, 1);
    app.unmount();
  }
});

test('refresh validates authority and owner even when a reply has an older revision', async () => {
  for (const extra of [{ account: { id: 'someone-else' } }, { authority_version: 0 }]) {
    const app = harness(async action => action === 'status' ? payload('owner-a', 0, extra) : payload('owner-a', 2));
    await app.flush();
    await assert.rejects(app.value.refresh());
    await app.flush();
    assert.ok(['readonly', 'recovery'].includes(app.value.syncStatus));
    assert.equal(app.value.profile.profile_revision, 2);
    app.unmount();
  }
});

test('a command appended during an empty background poll still dispatches immediately exactly once', async () => {
  let sends = 0;
  const app = harness(async action => {
    if (action !== 'command') return payload();
    sends++;
    return payload('owner-a', 1, { result: { purchased: true } });
  });
  await app.flush();
  app.poll();
  const result = await app.value.command('purchase_item', { item_id: 'energy_cell', quantity: 1 });
  await app.flush();
  assert.equal(result.purchased, true);
  assert.equal(sends, 1);
  assert.equal(app.value.pendingCount, 0);
  assert.equal(app.value.syncStatus, 'online');
  app.unmount();
});

test('concurrent identical retry joins an in-flight replay rather than making a second purchase', async () => {
  let calls = 0; const response = deferred();
  const app = harness(async action => {
    if (action !== 'command') return payload();
    calls++;
    if (calls === 1) throw failure('PROFILE_NETWORK', 0);
    return response.promise;
  });
  await app.flush();
  await assert.rejects(app.value.command('purchase_item', { item_id: 'energy_cell', quantity: 1 }), { code: 'PROFILE_COMMAND_PENDING' });
  const refresh = app.value.refresh();
  const retry = app.value.command('purchase_item', { quantity: 1, item_id: 'energy_cell' });
  await app.flush();
  response.resolve(payload('owner-a', 1, { result: { purchased: true } }));
  await refresh;
  assert.equal((await retry).purchased, true);
  assert.equal(calls, 2);
  app.unmount();
});

test('legacy snapshots, malformed cloud data and missing authority fail closed', async () => {
  for (const kind of ['legacy', 'authority', 'profile']) {
    const store = memoryStorage(); let sends = 0;
    if (kind === 'legacy') store.setItem('td_profile_wal_v1:owner-a', '{"gold":999999}');
    const app = harness(async action => {
      if (action === 'command') sends++;
      return payload('owner-a', 0, kind === 'authority' ? { authority_version: undefined }
        : kind === 'profile' ? { profile: null } : {});
    }, store);
    await app.flush();
    assert.equal(app.value.syncStatus, 'recovery');
    await assert.rejects(app.value.command('checkin'), { code: 'PROFILE_SYNC_BLOCKED' });
    assert.equal(sends, 0);
    app.unmount();
  }
});
