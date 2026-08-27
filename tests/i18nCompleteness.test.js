import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES, localizeCase } from '../src/game/caseData.js';
import { getLore } from '../src/game/agentLore.js';
import { SKILL_TREES } from '../src/game/agentProgression.js';
import { calcCaseMatchScore, PRESET_CONFIGS } from '../src/game/casePresets.js';
import { SYNERGY_SKILLS } from '../src/game/specialtySystem.js';
import { AGENT_DEFS, PRIORITY_ACTIONS } from '../src/game/teamConfig.js';
import {
  DETECTIVE_TAGS,
  IDENTITY_BADGES,
  detectiveTagLabel,
  identityBadgeLabel,
  rankTitleLabel,
} from '../src/game/identityOptions.js';
import { createInitialGameState, generateObservation } from '../src/game/gameState.js';

const HAN = /\p{Script=Han}/u;

function assertEnglish(value, label) {
  assert.equal(typeof value, 'string', `${label} must be a string`);
  assert.ok(value.trim(), `${label} must not be empty`);
  assert.equal(HAN.test(value), false, `${label} still contains Chinese text: ${value}`);
}

test('agent, skill, preset and identity catalogs provide complete English copy', () => {
  AGENT_DEFS.forEach((agent, index) => {
    assertEnglish(agent.role, `agent ${index} role`);
    assertEnglish(agent.descEn, `agent ${index} description`);
    const lore = getLore(index, 'en');
    assertEnglish(lore.personality, `agent ${index} personality`);
    assertEnglish(lore.quote, `agent ${index} quote`);
    assertEnglish(lore.summary, `agent ${index} summary`);
    assertEnglish(lore.psych, `agent ${index} psych profile`);
    lore.timeline.forEach((entry, itemIndex) => {
      assertEnglish(entry.title, `agent ${index} timeline ${itemIndex} title`);
      assertEnglish(entry.text, `agent ${index} timeline ${itemIndex} text`);
    });
  });

  PRIORITY_ACTIONS.forEach(action => assertEnglish(action.labelEn, `${action.id} action`));
  SKILL_TREES.flat().forEach(skill => {
    assertEnglish(skill.nameEn, `${skill.id} skill name`);
    assertEnglish(skill.descEn, `${skill.id} skill description`);
  });
  SYNERGY_SKILLS.forEach(skill => {
    assertEnglish(skill.nameEn, `${skill.id} synergy name`);
    assertEnglish(skill.conditionEn, `${skill.id} synergy condition`);
    assertEnglish(skill.descEn, `${skill.id} synergy description`);
  });
  PRESET_CONFIGS.forEach(preset => {
    assertEnglish(preset.nameEn, `${preset.id} preset name`);
    assertEnglish(preset.descEn, `${preset.id} preset description`);
  });

  IDENTITY_BADGES.forEach(item => assertEnglish(identityBadgeLabel(item.key, 'en'), `${item.key} badge`));
  DETECTIVE_TAGS.forEach(item => assertEnglish(detectiveTagLabel(item.key, 'en'), `${item.key} tag`));
  assertEnglish(rankTitleLabel('新手侦探', 'en'), 'rank title');
  assertEnglish(calcCaseMatchScore([{}, {}, {}], undefined, 'en').advice, 'case match advice');
});

test('every case exposes English scene, map, clue and NPC copy', () => {
  ALL_CASES.forEach(source => {
    const caseData = localizeCase(source, 'en');
    assertEnglish(caseData.title, `${source.case_id} title`);
    assertEnglish(caseData.setting, `${source.case_id} setting`);
    assertEnglish(caseData.scene.description, `${source.case_id} scene`);
    Object.values(caseData.scene.zones).forEach(zone => assertEnglish(zone.label, `${source.case_id} scene zone`));
    Object.values(caseData.zone_layout).forEach(zone => {
      assertEnglish(zone.label, `${source.case_id} map zone`);
      assertEnglish(zone.sublabel, `${source.case_id} map zone detail`);
    });
    caseData.clue_dictionary.forEach(clue => {
      assertEnglish(clue.keyword, `${clue.clue_id} clue`);
      assertEnglish(clue.description, `${clue.clue_id} clue description`);
    });
    caseData.npcs.forEach(npc => {
      assertEnglish(npc.role, `${source.case_id} NPC role`);
      assertEnglish(npc.public_persona, `${source.case_id} NPC persona`);
      assertEnglish(npc.personality, `${source.case_id} NPC personality`);
      assertEnglish(npc.initial_statement, `${source.case_id} NPC statement`);
    });

    const state = createInitialGameState(caseData);
    assertEnglish(generateObservation(state, caseData, 'en'), `${source.case_id} observation`);
  });
});
