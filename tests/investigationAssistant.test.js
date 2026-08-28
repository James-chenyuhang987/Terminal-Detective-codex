import assert from 'node:assert/strict';
import test from 'node:test';

import { Case_Data_Lvl_01 } from '../src/game/caseData.js';
import { buildInvestigationBrief } from '../src/game/investigationAssistant.js';

function state(patch = {}) {
  return { unlocked_clues: [], action_points_left: 20, confusion_score: 0, ...patch };
}

test('assistant starts by directing the player to execute a cycle in both languages', () => {
  const zh = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'zh' });
  const en = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'en' });
  assert.equal(zh.action, 'execute_cycle');
  assert.match(zh.instruction, /执行循环/);
  assert.equal(en.action, 'execute_cycle');
  assert.match(en.instruction, /EXECUTE CYCLE/);
});

test('assistant summarizes only evidence the player has discovered', () => {
  const brief = buildInvestigationBrief({
    gameState: state({ unlocked_clues: ['c_01', 'c_02'] }),
    caseData: Case_Data_Lvl_01,
    lang: 'en',
  });
  assert.deepEqual(brief.summary.map(item => item.id).sort(), ['c_01', 'c_02']);
  assert.equal(brief.summary.some(item => item.id === 'c_03'), false);
  assert.equal(brief.action, 'open_link');
});

test('assistant prioritizes decision reading, high confusion and low AP safely', () => {
  const decision = buildInvestigationBrief({ gameState: state(), caseData: Case_Data_Lvl_01, lang: 'zh', decisionPending: true });
  assert.match(decision.instruction, /白色文字/);

  const confused = buildInvestigationBrief({ gameState: state({ unlocked_clues: ['c_01'], confusion_score: 70 }), caseData: Case_Data_Lvl_01, lang: 'en' });
  assert.equal(confused.action, 'open_command');

  const lowAp = buildInvestigationBrief({ gameState: state({ unlocked_clues: ['c_01'], action_points_left: 4 }), caseData: Case_Data_Lvl_01, lang: 'zh' });
  assert.equal(lowAp.action, 'open_report');
});
