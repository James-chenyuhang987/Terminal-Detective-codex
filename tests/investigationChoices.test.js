import test from 'node:test';
import assert from 'node:assert/strict';
import { selectAutomaticInvestigationCard, reportEvidenceIds, overlayKnownClueZones } from '../src/game/investigationChoices.js';
import { Case_Data_Lvl_03 } from '../src/game/caseData.js';

test('delegation stays steady when issued cards are shuffled', () => {
  const cards = [{ optionId: 'risky', actionTag: 'hack_terminal', risk_level: 'high', estimatedAlignment: 90 },
    { optionId: 'safe', actionTag: 'search_area', risk_level: 'low', estimatedAlignment: 65 },
    { optionId: 'preferred', actionTag: 'check_cctv', risk_level: 'low', estimatedAlignment: 60 }];
  for (const order of [cards, [...cards].reverse(), [cards[1], cards[0], cards[2]]]) {
    assert.equal(selectAutomaticInvestigationCard(order, ['check_cctv', 'hack_terminal']).optionId, 'preferred');
  }
  assert.equal(selectAutomaticInvestigationCard([]), null);
});

test('dimension evidence is deduplicated without losing attribution in the input', () => {
  const groups = { opportunity: ['a', 'b'], method: ['b'], motive: ['c'], timeline: ['a', 'd'] };
  assert.deepEqual(reportEvidenceIds(groups), ['a', 'b', 'c', 'd']);
  assert.deepEqual(groups.method, ['b']);
});

test('revealed Red Butterfly clues use their v2 object zones without relocating unknown rewards', () => {
  const original = structuredClone(Case_Data_Lvl_03.zone_clue_map);
  const revised = overlayKnownClueZones(original, { e_02: 'zone_booth3', e_07: 'zone_bar' });
  assert.ok(revised.zone_booth3.includes('e_02'));
  assert.ok(revised.zone_bar.includes('e_07'));
  assert.equal(revised.zone_booth3.includes('e_07'), false);
  assert.equal(revised.zone_alley.includes('e_02'), false);
  assert.ok(revised.zone_alley.includes('e_06'));
  assert.ok(revised.zone_backroom.includes('e_secret_99'), 'no hidden reward mapping inferred');
  assert.deepEqual(original, Case_Data_Lvl_03.zone_clue_map, 'legacy map stays frozen');
  assert.deepEqual(overlayKnownClueZones(original), original);
  const hiddenRevealed = overlayKnownClueZones(revised, { e_secret_99: 'zone_alley' });
  assert.ok(hiddenRevealed.zone_alley.includes('e_secret_99'));
  assert.equal(hiddenRevealed.zone_backroom.includes('e_secret_99'), false);
});
