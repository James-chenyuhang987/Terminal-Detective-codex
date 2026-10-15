import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const lobby = readFileSync(new URL('../src/components/game/HolographicLobby.jsx', import.meta.url), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const loadout = (...ids) => [{ agent_id: 'NEXUS-01', skill_ids: ids }];

function callbackSource(name) {
  const match = lobby.match(new RegExp(`  const ${name} = ([\\s\\S]*?\\n  });`));
  assert.ok(match, `${name} callback exists`);
  return `const ${name} = ${match[1]};`;
}

function helperSource(name) {
  const match = lobby.match(new RegExp(`function ${name}\\([^]*?\\n\\}`));
  assert.ok(match, `${name} helper exists`);
  return match[0];
}

// Execute the component's actual async callbacks, sharing refs while capturing
// state per render. Deferred writes let a second click race the React rerender.
function skillSyncHarness(initialLoadout = loadout(), readOnly = false) {
  const state = {
    skillLoadout: plain(initialLoadout),
    skillSyncPending: false,
    deploymentPending: false,
    showSequence: false,
    snapshot: null,
  };
  const skillWrites = [];
  const teamWrites = [];
  const notices = [];
  const skillSyncLockRef = { current: false };
  const deploymentLockRef = { current: false };
  const context = vm.createContext({
    skillSyncLockRef,
    deploymentLockRef,
    corePurchaseBusyRef: { current: false },
    // Deliberately remains stale even when a local write succeeds.
    profile: { skill_loadout: loadout() },
    lang: 'zh',
    selectedIdx: 2,
    primaryAgentIdx: 0,
    activeSupport: null,
    targetCase: null,
    matchForecast: 55,
    agentDefs: [{ id: 'NEXUS-01', icon: '👁️', color: '#00e5ff' }],
    currentConfig: () => ({ specs: [{}, {}, {}], priorities: [[], [], []] }),
    setSkillLoadout(value) { state.skillLoadout = value; },
    setSkillSyncPending(value) { state.skillSyncPending = value; },
    setDeploymentPending(value) { state.deploymentPending = value; },
    setShowSequence(value) { state.showSequence = value; },
    setDeploymentSnapshot(value) { state.snapshot = value; },
    setShowRehearsal() {},
    setShowTutorial() {},
    setCoreMarketSlot() {},
    clearDeployment() {
      deploymentLockRef.current = false;
      state.deploymentPending = false;
      state.showSequence = false;
      state.snapshot = null;
    },
    showNotice(message, duration, type) { notices.push({ message, duration, type }); },
    onSkillLoadout(value) {
      return new Promise((resolve, reject) => skillWrites.push({ value, resolve, reject }));
    },
    async onTeamSave(value) { teamWrites.push(value); },
  });
  const createHandlers = vm.runInContext(`
    ${helperSource('cloneDeploymentConfig')}
    ${helperSource('cloneDeploymentLoadout')}
    (function render(readOnly, deploymentLocked, skillLoadout) {
      ${callbackSource('saveSkillLoadout')}
      ${callbackSource('prepareDeploy')}
      return { saveSkillLoadout, prepareDeploy };
    })
  `, context);
  return {
    state, skillWrites, teamWrites, notices, skillSyncLockRef, deploymentLockRef,
    render() {
      return createHandlers(readOnly, state.skillSyncPending || state.deploymentPending || state.showSequence, state.skillLoadout);
    },
  };
}

test('skill saves reject a racing second click and accept a fresh write after completion', async () => {
  const harness = skillSyncHarness();
  const handlers = harness.render();
  const requested = loadout('s0_1');
  const first = handlers.saveSkillLoadout(requested);
  requested[0].skill_ids.push('s0_5');
  await handlers.saveSkillLoadout(loadout('s0_1', 's0_2'));
  assert.equal(harness.skillWrites.length, 1);
  assert.deepEqual(plain(harness.skillWrites[0].value), loadout('s0_1'));
  assert.equal(harness.state.skillSyncPending, true);
  assert.equal(harness.skillSyncLockRef.current, true);
  harness.skillWrites[0].resolve();
  await first;
  assert.equal(harness.state.skillSyncPending, false);
  assert.equal(harness.skillSyncLockRef.current, false);

  const second = harness.render().saveSkillLoadout(loadout('s0_1', 's0_2'));
  assert.equal(harness.skillWrites.length, 2);
  harness.skillWrites[1].resolve();
  await second;
  assert.deepEqual(plain(harness.state.skillLoadout), loadout('s0_1', 's0_2'));
});

test('deployment waits for a skill save before capturing the confirmed loadout', async () => {
  const harness = skillSyncHarness();
  const handlers = harness.render();
  const pending = handlers.saveSkillLoadout(loadout('s0_1'));
  await handlers.prepareDeploy();
  assert.equal(harness.teamWrites.length, 0);
  assert.equal(harness.state.snapshot, null);
  assert.equal(harness.deploymentLockRef.current, false);
  harness.skillWrites[0].resolve();
  await pending;

  await harness.render().prepareDeploy();
  assert.equal(harness.teamWrites.length, 1);
  assert.equal(harness.state.showSequence, true);
  assert.deepEqual(plain(harness.state.snapshot.skillLoadout), loadout('s0_1'));
  assert.equal(harness.state.snapshot.selectedIdx, 0, 'deployment uses the assigned primary even while viewing another agent');
});

test('a rejected write restores the latest confirmed local skills despite a stale profile', async () => {
  const harness = skillSyncHarness();
  const first = harness.render().saveSkillLoadout(loadout('s0_1'));
  harness.skillWrites[0].resolve();
  await first;

  const failed = harness.render().saveSkillLoadout(loadout('s0_1', 's0_2'));
  harness.skillWrites[1].reject(new Error('Network unavailable'));
  await failed;
  assert.deepEqual(plain(harness.state.skillLoadout), loadout('s0_1'));
  assert.equal(harness.notices.at(-1).type, 'error');
  assert.equal(harness.state.skillSyncPending, false);
  assert.equal(harness.skillSyncLockRef.current, false);

  const retry = harness.render().saveSkillLoadout(loadout('s0_1', 's0_2'));
  assert.equal(harness.skillWrites.length, 3);
  harness.skillWrites[2].resolve();
  await retry;
});

test('read-only preparation never starts skill or deployment writes', async () => {
  const harness = skillSyncHarness(loadout('s0_1'), true);
  const handlers = harness.render();
  await handlers.saveSkillLoadout(loadout());
  await handlers.prepareDeploy();
  assert.equal(harness.skillWrites.length, 0);
  assert.equal(harness.teamWrites.length, 0);
  assert.equal(harness.state.snapshot, null);
  assert.equal(harness.state.skillSyncPending, false);
  assert.deepEqual(plain(harness.state.skillLoadout), loadout('s0_1'));
});

test('starting deployment prevents a racing skill change from altering its snapshot', async () => {
  const harness = skillSyncHarness(loadout('s0_1'));
  const handlers = harness.render();
  const deployment = handlers.prepareDeploy();
  await handlers.saveSkillLoadout(loadout());
  await deployment;
  assert.equal(harness.skillWrites.length, 0);
  assert.deepEqual(plain(harness.state.snapshot.skillLoadout), loadout('s0_1'));
  assert.deepEqual(plain(harness.state.skillLoadout), loadout('s0_1'));
});
