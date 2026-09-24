import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildCaseMatchReadout } from '../src/game/casePresets.js';
import { buildTacticalRehearsal } from '../src/game/tacticalRehearsal.js';

const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const landing = source('../src/components/game/GameLanding.jsx');
const home = source('../src/components/game/DetectiveHome.jsx');
const portal = source('../src/components/game/home/HomePortal.jsx');
const modules = source('../src/components/game/home/HomeModules.jsx');
const rehearsalPanel = source('../src/components/game/TacticalRehearsalPanel.jsx');
const lobby = source('../src/components/game/HolographicLobby.jsx');

test('landing copy keeps the terminal label bilingual and the detective identity inline', () => {
  assert.match(landing, /霓虹血迹案件调查终端/);
  assert.match(landing, /NEON BLOOD CASE INVESTIGATION TERMINAL/);
  assert.match(landing, /className="td-detective-identity(?:\s|\")/);
  assert.doesNotMatch(landing, /展开完整内容/);
});

test('home dossier action opens the case archive and tactical desk enters the lobby', () => {
  assert.match(home, /const quickStart = \(\) => \{[\s\S]*?openModule\('cases'\);[\s\S]*?\n  \};/);
  assert.match(home, /调取案件卷宗/);
  assert.match(home, /<HomePortal onEnterLobby=\{enterLobby\} \/>/);
  assert.match(portal, /const handleEnter = onEnterLobby \|\| onEnter/);
  assert.match(portal, /战术台/);
  assert.doesNotMatch(portal, /agent_market/);
  assert.match(modules, /进入战术台/);
});

test('tactical readout remains public and bounded', () => {
  const agents = [
    { agent_id: 'NEXUS-01', logic_power: 20, observation_focus: 10, confusion_resistance: 10, hack_level: 10 },
    { agent_id: 'AURORA-09', logic_power: 10, observation_focus: 20, confusion_resistance: 10, hack_level: 10 },
    { agent_id: 'CIPHER-47', logic_power: 10, observation_focus: 10, confusion_resistance: 10, hack_level: 20 },
  ];
  const readout = buildCaseMatchReadout(agents);
  assert.equal(readout.strengths.length, 0);
  assert.deepEqual(readout.risks.map(item => item.key), ['hack_level', 'logic_power', 'observation_focus']);
  assert.ok(Array.isArray(readout.tradeoffs));
  const rehearsal = buildTacticalRehearsal({
    agents: agents.map(agent => ({ ...agent, stamina: 2, profile: { private_note: true } })),
    synergy_skills: ['digital_forensics'],
  });
  const serialized = JSON.stringify(rehearsal).toLowerCase();
  for (const forbidden of ['stamina', 'profile', 'reward', 'answer', 'culprit']) {
    assert.equal(serialized.includes(`"${forbidden}"`), false, `unexpected ${forbidden} field`);
  }
  assert.ok(rehearsal.durationSeconds >= 30 && rehearsal.durationSeconds <= 60);
});

test('rehearsal keeps formation context and exposes the selected risk', () => {
  assert.match(rehearsalPanel, /当前战术上下文/);
  assert.match(rehearsalPanel, /暴露短板/);
  assert.match(rehearsalPanel, /稳定度/);
  assert.match(lobby, /getEquippedSkillEffects/);
  assert.match(lobby, /skillEffects: rehearsalSkillEffects/);
});

test('deployment briefing uses the active core roster', () => {
  const sequence = source('../src/components/game/DeploySequence.jsx');
  assert.match(sequence, /squad = null/);
  assert.match(sequence, /squadLabel/);
  assert.match(lobby, /squad: agentDefs\.map\(agent => agent\.id\)/);
  assert.match(lobby, /squadAgents: agentDefs\.map\(agent => \(\{/);
  assert.match(lobby, /squad=\{deploymentSnapshot\.squad\}/);
  assert.match(lobby, /squadAgents=\{deploymentSnapshot\.squadAgents\}/);
  assert.doesNotMatch(sequence, /value: 'NEXUS-01 \+ AURORA-09 \+ CIPHER-47'/);
});
