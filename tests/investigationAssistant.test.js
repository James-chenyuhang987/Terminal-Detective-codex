import assert from 'node:assert/strict';
import test from 'node:test';

import { Case_Data_Lvl_01, localizeCase } from '../src/game/caseData.js';
import { buildInvestigationBrief } from '../src/game/investigationAssistant.js';

function state(patch = {}) {
  return { unlocked_clues: [], action_points_left: 20, confusion_score: 0, ...patch };
}

test('assistant starts by directing the player to execute a cycle in both languages', () => {
  const zh = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'zh' });
  const en = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'en' });
  assert.deepEqual(Object.keys(zh).sort(), ['message', 'messageKey', 'tone']);
  assert.match(zh.message, /执行循环/);
  assert.match(en.message, /EXECUTE CYCLE/);
  assert.notEqual(zh.messageKey, en.messageKey);
});

test('assistant summarizes discovered public evidence without leaking hidden clues', () => {
  const publicBrief = buildInvestigationBrief({
    gameState: state({ unlocked_clues: ['c_01', 'c_02'] }),
    caseData: localizeCase(Case_Data_Lvl_01, 'en'),
    lang: 'en',
    hasNewEvidence: true,
  });
  assert.match(publicBrief.message, /EMP Burn|Security Footage/i);

  const hiddenBrief = buildInvestigationBrief({
    gameState: state({ unlocked_clues: ['c_01', 'c_02', 'c_secret_99'] }),
    caseData: localizeCase(Case_Data_Lvl_01, 'en'),
    lang: 'en',
    hasNewEvidence: true,
  });
  assert.match(hiddenBrief.message, /protected new trace/i);
  assert.doesNotMatch(hiddenBrief.message, /Anonymous Hacker Intel/i);
  assert.doesNotMatch(hiddenBrief.message, /Sofia|killer|culprit/i);
});

test('assistant prioritizes warnings, decision reading and processing safely', () => {
  const decision = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'zh', decisionPending: true });
  assert.match(decision.message, /白色.*证据及发现/);

  const confused = buildInvestigationBrief({ gameState: state({ unlocked_clues: ['c_01'], confusion_score: 70 }), caseData: Case_Data_Lvl_01, lang: 'en', decisionPending: true });
  assert.equal(confused.messageKey, 'en:warning:confusion');
  assert.equal(confused.tone, 'red');

  const lowAp = buildInvestigationBrief({ gameState: state({ unlocked_clues: ['c_01'], action_points_left: 4 }), caseData: Case_Data_Lvl_01, lang: 'zh' });
  assert.equal(lowAp.messageKey, 'zh:warning:ap');

  const processing = buildInvestigationBrief({ gameState: state({ turn_count: 2 }), caseData: Case_Data_Lvl_01, lang: 'en', isProcessing: true });
  assert.equal(processing.messageKey, 'en:processing:2');
});

test('assistant message keys stay stable until the guidance state changes', () => {
  const base = { gameState: state({ unlocked_clues: ['c_01', 'c_02'], turn_count: 3 }), caseData: Case_Data_Lvl_01, lang: 'zh' };
  const first = buildInvestigationBrief(base);
  const unrelatedUpdate = buildInvestigationBrief({ ...base, gameState: { ...base.gameState, current_hp: 72 } });
  const linked = buildInvestigationBrief({ ...base, linkedPairs: [{ a: 'c_01', b: 'c_02', valid: true }] });
  assert.equal(first.messageKey, unrelatedUpdate.messageKey);
  assert.equal(first.message, unrelatedUpdate.message);
  assert.notEqual(first.messageKey, linked.messageKey);
});

test('assistant gives one localized sentence for link, report and interview states', () => {
  const linkedPairs = [{ a: 'c_01', b: 'c_02', valid: true }, { a: 'c_02', b: 'c_03', valid: true }];
  const report = buildInvestigationBrief({
    gameState: state({ unlocked_clues: ['c_01', 'c_02', 'c_03', 'c_04', 'c_05', 'c_06', 'c_07'], turn_count: 7 }),
    caseData: Case_Data_Lvl_01,
    lang: 'en',
    linkedPairs,
  });
  assert.equal(report.tone, 'green');
  assert.equal((report.message.match(/[.!?]/g) || []).length, 1);

  const interview = buildInvestigationBrief({
    gameState: state({ unlocked_clues: ['c_01'], turn_count: 2 }),
    caseData: Case_Data_Lvl_01,
    lang: 'zh',
    selectedNpcId: 'npc_01',
  });
  assert.match(interview.message, /Mei Lin|梅琳/);
  assert.equal((interview.message.match(/。/g) || []).length, 1);
});
