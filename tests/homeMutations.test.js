import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';

import * as progress from '../src/game/homeProgress.js';
import * as market from '../src/game/agentMarket.js';
import { applySettlementToProfile } from '../src/game/playerProfile.js';
import { transactionErrorMessage } from '../src/game/transactionFeedback.js';
import { profileCommand } from '../src/game/profileCommands.js';
import { publicErrorMessage } from '../src/lib/publicError.js';

function readComponent(path) {
  return ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'),
    ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
}

const home = readComponent('../src/components/game/DetectiveHome.jsx');
const modules = readComponent('../src/components/game/home/HomeModules.jsx');

beforeEach(t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-09-05T12:00:00Z') });
});

function findNodes(root, predicate) {
  const found = [];
  const visit = node => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(root);
  return found;
}

// Exercise the real JSX callbacks without mounting React or duplicating their logic.
function bindFunction(node, bindings) {
  return compileFunction(`return (${node.getText()});`, Object.keys(bindings))(...Object.values(bindings));
}

function handler(name, bindings) {
  const declaration = findNodes(home, node => ts.isVariableDeclaration(node) && node.name.getText() === name)[0];
  assert.ok(declaration, `Missing home handler ${name}`);
  return bindFunction(declaration.initializer, bindings);
}

const actionCalls = findNodes(modules, node => ts.isCallExpression(node) && node.expression.getText() === 'onApply');

const actionTypes = {
  editIdentity: 'identity', purchaseItem: 'purchase_item', claimTask: 'claim_task',
  unlockTech: 'unlock_tech', purchaseAgent: 'purchase_agent',
};

function moduleAction(name, bindings) {
  const type = actionTypes[name] || name;
  const call = actionCalls.find(node => node.arguments[0].getText().includes(`type: '${type}'`));
  assert.ok(call, `${name} must send a command intent`);
  return bindFunction(call.arguments[0], bindings);
}

// Mock server evaluation for UI feedback tests; actual D1 authorization is tested separately.
function evaluateServerCommand(current, type, args) {
  switch (type) {
    case 'purchase_item': return progress.purchaseItem(current, args.item_id, args.quantity);
    case 'claim_task': return progress.claimTask(current, args.kind, args.task_id);
    case 'unlock_tech': return progress.unlockTech(current, args.tech_id);
    case 'purchase_agent': return market.purchaseAgent(current, args.agent_id);
    case 'identity': return progress.editIdentity(current, args.patch);
    case 'checkin': return progress.applyCheckin(current);
    case 'mail_read': return { profile: { ...current, mail_read_ids: [...new Set([...current.mail_read_ids, args.mail_id])] } };
    case 'mail_reply': return current.mail_reply_choices.some(id => id.startsWith(`${args.mail_id}:`))
      ? { error: 'already_claimed' }
      : { profile: { ...current, mail_reply_choices: [...current.mail_reply_choices, args.choice_id] } };
    default: throw new Error(`Unexpected test command ${type}`);
  }
}

function homeQueue(initial, { pending = false, readOnly = false, failWrite = false } = {}) {
  let current = initial;
  let tail = Promise.resolve();
  const notices = [];
  const busyRef = { current: false };
  const mutate = reducer => {
    const operation = tail.then(async () => {
      const result = await reducer(current);
      if (result.error) return result;
      if (failWrite || pending) throw Object.assign(new Error('offline'), { code: 'PROFILE_COMMAND_PENDING' });
      current = result.profile;
      return { ...result, ...(pending ? { pending: true } : {}) };
    });
    tail = operation.catch(() => {});
    return operation;
  };
  const bindings = {
    isReadOnly: readOnly, busyRef, setBusy: () => {}, publicErrorMessage,
    command: (type, args) => {
      profileCommand(type, args);
      return mutate(current => evaluateServerCommand(current, type, args));
    },
    notify: (message, type = 'success') => notices.push({ message, type }),
    lang: 'en', transactionErrorMessage,
  };
  bindings.notifySaved = handler('notifySaved', bindings);
  const applyResult = handler('applyResult', bindings);
  return { get current() { return current; }, mutate, applyResult, bindings, notices, busyRef };
}

function caseSummary(now) {
  return {
    run_id: 'queued-background-reward',
    case_id: progress.dailyIntelCaseId(now) === 'Lvl_01' ? 'Lvl_02' : 'Lvl_01',
    score: 'B', difficulty: 'NORMAL', is_passed: true, xp_gain: 100,
    clues: ['c_01'], turns: 5,
  };
}

test('every module action sends intent only and does not capture the rendered profile', () => {
  assert.ok(actionCalls.length >= 15);
  for (const call of actionCalls) {
    const reducer = call.arguments[0];
    assert.ok(ts.isObjectLiteralExpression(reducer), call.getText());
    const staleReferences = findNodes(reducer, node => ts.isIdentifier(node) && node.text === 'profile'
      && !(ts.isPropertyAssignment(node.parent) && node.parent.name === node)
      && !(ts.isPropertyAccessExpression(node.parent) && node.parent.name === node));
    assert.equal(staleReferences.length, 0, reducer.getText());
  }
});

test('a warehouse purchase queued behind settlement preserves the earned gold and case record', async () => {
  const now = new Date();
  const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 }, now);
  const queue = homeQueue(rendered);
  const summary = caseSummary(now);
  const settlement = queue.mutate(current => applySettlementToProfile(current, summary));
  const purchase = queue.applyResult(moduleAction('purchaseItem', {
    profile: rendered, item: { id: 'energy_cell' }, quantity: 1,
  }), 'Purchased');
  assert.equal(queue.current.gold, 1000);
  await settlement;
  const result = await purchase;
  assert.equal(result.profile.gold, 1100);
  assert.equal(result.profile.inventory.energy_cell, 1);
  assert.ok(result.profile.rewarded_runs.includes(summary.run_id));
  assert.ok(result.profile.case_records.some(record => record.case_id === summary.case_id));
  assert.equal(rendered.gold, 1000);
});

test('queued purchases recheck the current inventory limit and current balance', async () => {
  for (const [patch, expectedError] of [
    [{ gold: 399 }, 'insufficient_funds'],
    [{ inventory: { energy_cell: 20 } }, 'inventory_full'],
  ]) {
    const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 });
    const queue = homeQueue(rendered);
    await queue.mutate(current => ({ profile: progress.normalizeProfile({ ...current, ...patch }) }));
    const before = structuredClone(queue.current);
    const result = await queue.applyResult(moduleAction('purchaseItem', {
      profile: rendered, item: { id: 'energy_cell' }, quantity: 1,
    }));
    assert.equal(result, false);
    assert.deepEqual(queue.current, before);
    assert.equal(queue.notices.at(-1).type, 'error');
    assert.equal(queue.notices.at(-1).message, transactionErrorMessage(expectedError, 'en'));
  }
});

test('queued task claims preserve settlement rewards and reject a second claim', async () => {
  const rendered = progress.normalizeProfile({ detective_name: 'NEXUS', gold: 1000, energy: 120 });
  const queue = homeQueue(rendered);
  const settlement = queue.mutate(current => applySettlementToProfile(current, caseSummary(new Date())));
  const action = moduleAction('claimTask', { profile: rendered, kind: 'tutorial', task: { id: 'register' } });
  const claim = queue.applyResult(action);
  await settlement;
  assert.equal((await claim).profile.gold, 1700);
  assert.equal(await queue.applyResult(action), false);
  assert.equal(queue.current.gold, 1700);
  assert.equal(queue.current.reward_claims.filter(id => id === 'tutorial:register').length, 1);
});

test('queued technology unlocks preserve newly awarded diamonds and recheck ownership', async () => {
  const rendered = progress.normalizeProfile({ diamonds: 100, energy: 120 });
  const queue = homeQueue(rendered);
  const award = queue.mutate(current => ({ profile: { ...current, diamonds: current.diamonds + 40 } }));
  const action = moduleAction('unlockTech', { profile: rendered, tech: { id: 'network_1' } });
  const purchase = queue.applyResult(action);
  await award;
  assert.equal((await purchase).profile.diamonds, 115);
  assert.equal(await queue.applyResult(action), false);
  assert.equal(queue.current.diamonds, 115);
  assert.deepEqual(queue.current.tech_unlocks, ['network_1']);
});

test('agent purchases preserve queued claims and cannot purchase the same agent twice', async () => {
  const selected = market.AGENT_MARKET_CATALOG.find(agent => !agent.core);
  const rendered = progress.normalizeProfile({ diamonds: selected.cost, energy: 120 });
  const queue = homeQueue(rendered);
  const award = queue.mutate(current => ({ profile: {
    ...current, diamonds: current.diamonds + 40, reward_claims: [...current.reward_claims, 'tutorial:register'],
  } }));
  const action = moduleAction('purchaseAgent', { profile: rendered, selected });
  const purchase = queue.applyResult(action);
  await award;
  const result = await purchase;
  assert.equal(result.profile.diamonds, 40);
  assert.ok(result.profile.reward_claims.includes('tutorial:register'));
  assert.ok(market.getOwnedAgentIds(result.profile).includes(selected.id));
  assert.equal(await queue.applyResult(action), false);
  assert.equal(queue.current.diamonds, 40);
});

test('mail reducers preserve other queued reads and reject a conflicting reply', async () => {
  const rendered = progress.normalizeProfile({ energy: 120 });
  const queue = homeQueue(rendered);
  const mail = { id: 'case:1' };
  const actionFor = field => {
    const type = field === 'mail_read_ids' ? 'mail_read' : 'mail_reply';
    const call = actionCalls.find(node => node.arguments[0].getText().includes(`type: '${type}'`));
    assert.ok(call);
    return bindFunction(call.arguments[0], { profile: rendered, mail, choiceId: `${mail.id}:0` });
  };
  const otherRead = queue.mutate(current => ({ profile: { ...current, mail_read_ids: ['welcome'] } }));
  const read = queue.applyResult(actionFor('mail_read_ids'));
  await otherRead;
  await read;
  await queue.applyResult(actionFor('mail_read_ids'));
  assert.deepEqual(queue.current.mail_read_ids, ['welcome', mail.id]);
  await queue.mutate(current => ({ profile: { ...current, mail_reply_choices: [`${mail.id}:1`] } }));
  assert.equal(await queue.applyResult(actionFor('mail_reply_choices')), false);
  assert.deepEqual(queue.current.mail_reply_choices, [`${mail.id}:1`]);
});

test('identity edits retain newer case progress and recheck the rename limit', async () => {
  const rendered = progress.normalizeProfile({ detective_name: 'OLD', gold: 1000, energy: 120 });
  const queue = homeQueue(rendered);
  const action = moduleAction('editIdentity', {
    profile: rendered, name: 'NEW', avatar: '🦉', signature: 'Truth', badge: 'bureau', tags: ['Calm'],
  });
  const settlement = queue.mutate(current => applySettlementToProfile(current, caseSummary(new Date())));
  const edit = queue.applyResult(action);
  await settlement;
  assert.equal((await edit).profile.gold, 1500);
  assert.equal(queue.current.detective_name, 'NEW');
  const anotherName = moduleAction('editIdentity', {
    profile: rendered, name: 'AGAIN', avatar: '🦉', signature: 'Truth', badge: 'bureau', tags: [],
  });
  assert.equal(await queue.applyResult(anotherName), false);
  assert.equal(queue.current.detective_name, 'NEW');
});

test('check-in celebrates confirmed server metadata and preserves prior settlement gold', async () => {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 });
  const queue = homeQueue(rendered);
  const celebrations = [];
  const checkin = handler('handleCheckin', {
    ...queue.bindings, applyResult: queue.applyResult, applyCheckin: progress.applyCheckin,
    setCheckinCelebration: result => celebrations.push(result), profile: rendered,
  });
  const update = queue.mutate(current => {
    const settled = applySettlementToProfile(current, caseSummary(now));
    return { profile: { ...settled.profile, last_checkin: progress.localDateKey(yesterday), checkin_streak: 1 } };
  });
  const checking = checkin();
  await update;
  await checking;
  assert.equal(queue.current.gold, 1500);
  assert.equal(celebrations[0].day, 2);
  assert.equal(celebrations[0].reward.diamonds, 10);
  assert.match(queue.notices.at(-1).message, /Check-in complete/);
  assert.doesNotMatch(queue.notices.at(-1).message, /pending/);
  await checkin();
  assert.equal(celebrations.length, 1);
  assert.equal(queue.notices.at(-1).type, 'error');
});

test('home rejects precomputed snapshots, read-only writes and duplicate in-flight clicks', async () => {
  const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 });
  const queue = homeQueue(rendered);
  assert.equal(await queue.applyResult(progress.purchaseItem(rendered, 'energy_cell')), false);
  const action = { type: 'purchase_item', item_id: 'energy_cell', quantity: 1 };
  assert.equal(await queue.applyResult(current => progress.purchaseItem(current, 'energy_cell')), false);
  const first = queue.applyResult(action);
  assert.equal(await queue.applyResult(action), false);
  await first;
  assert.equal(queue.current.gold, 600);
  assert.equal(queue.busyRef.current, false);
  const readOnly = homeQueue(rendered, { readOnly: true });
  assert.equal(await readOnly.applyResult(action), false);
  assert.strictEqual(readOnly.current, rendered);
});

test('failed check-in writes release busy state without showing a reward celebration', async () => {
  const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 });
  const queue = homeQueue(rendered, { failWrite: true });
  const celebrations = [];
  const checkin = handler('handleCheckin', {
    ...queue.bindings, applyResult: queue.applyResult, applyCheckin: progress.applyCheckin,
    setCheckinCelebration: result => celebrations.push(result), profile: rendered,
  });
  await checkin();
  assert.equal(celebrations.length, 0);
  assert.equal(queue.busyRef.current, false);
  assert.equal(queue.notices.at(-1).type, 'error');
  assert.strictEqual(queue.current, rendered);
});


test('unconfirmed check-in never celebrates or changes displayed resources', async () => {
  const rendered = progress.normalizeProfile({ gold: 1000, energy: 120 });
  const queue = homeQueue(rendered, { pending: true });
  const celebrations = [];
  await handler('handleCheckin', {
    ...queue.bindings, applyResult: queue.applyResult,
    setCheckinCelebration: value => celebrations.push(value),
  })();
  assert.equal(celebrations.length, 0);
  assert.strictEqual(queue.current, rendered);
  assert.match(queue.notices.at(-1).message, /not confirmed/);
});
