import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES, Legal_Actions_List } from '../src/game/caseData.js';
import { getCaseSecret } from '../server/detectiveRules/caseSecrets.js';
import { getInvestigationContent, INVESTIGATION_CASE_IDS } from '../server/investigationV2/content.js';

const bilingual = (value, name) => {
  assert.equal(typeof value?.zh, 'string', `${name}: missing Chinese`);
  assert.equal(typeof value?.en, 'string', `${name}: missing English`);
  assert.ok(value.zh.trim().length > 0 && value.en.trim().length > 0, `${name}: blank translation`);
};

const canonicalAnswers = {
  Lvl_01: ['mei', 'emp', 'revenge', '2317'],
  Lvl_02: ['aria_staged', 'phase_shift', 'expose_harlan', '0234'],
  Lvl_03: ['sable', 'overload_script', 'silence_blackmail', '0120'],
  Lvl_04: ['elias', 'drone_nitrogen', 'model_sale', 'dawn_audit'],
  Lvl_05: ['rook', 'depressurization', 'weapons_route', 'camera_loop'],
  Lvl_06: ['tessa', 'pedestal_poison', 'forgery_sale', 'maintenance_window'],
  Lvl_07: ['neris', 'remote_pressure', 'illegal_sampling', 'sonar_loop'],
  Lvl_08: ['lucan', 'inert_gas', 'protect_trial', 'silent_mode'],
};

test('v2 authors all eight existing cases without unknown-case fallback', () => {
  assert.deepEqual(INVESTIGATION_CASE_IDS, ALL_CASES.map(item => item.case_id));
  for (const id of ['missing', '__proto__', 'constructor', '', undefined, null]) {
    assert.equal(getInvestigationContent(id), null);
  }
});

for (const caseData of ALL_CASES) {
  const spec = getInvestigationContent(caseData.case_id);
  const label = caseData.case_id;
  const clues = new Set(caseData.clue_dictionary.map(item => item.clue_id));
  const zones = new Set(Object.keys(caseData.scene.zones));

  test(`${label}: eight named objects each provide one original main clue and legal verification choices`, () => {
    const mainClues = caseData.clue_dictionary.filter(item => !item.unlock_turn).map(item => item.clue_id).sort();
    assert.equal(spec.targets.length, 8);
    assert.deepEqual(spec.targets.map(item => item.clue_id).sort(), mainClues);
    assert.equal(new Set(spec.targets.map(item => item.target_id)).size, 8);
    assert.equal(new Set(spec.targets.map(item => item.label.zh)).size, 8);
    for (const target of spec.targets) {
      assert.equal(target.hidden, false);
      assert.ok(zones.has(target.zone_id), `${target.target_id}: unknown zone`);
      assert.ok(['document', 'terminal', 'sample', 'device'].includes(target.kind));
      assert.ok(Legal_Actions_List.includes(target.action_tag));
      bilingual(target.label, `${target.target_id}.label`);
      bilingual(target.observation, `${target.target_id}.observation`);
      bilingual(target.result, `${target.target_id}.result`);
      assert.ok(target.methods.length >= 2);
      assert.equal(new Set(target.methods.map(item => item.id)).size, target.methods.length);
      assert.equal(target.methods.filter(item => item.id === target.method_id).length, 1);
      target.methods.forEach(item => bilingual(item.label, `${target.target_id}/${item.id}`));
      assert.deepEqual(target.required_clues, [], 'main evidence must not depend on unavailable evidence');
    }
  });

  test(`${label}: three optional bilingual professional notes cover distinct abilities without adding reward dependencies`, () => {
    const noted = spec.targets.filter(target => target.expert_note);
    assert.ok(noted.length >= 3);
    assert.deepEqual([...new Set(noted.map(target => target.expert_note.ability))].sort(),
      ['base_hack_level', 'base_logic_power', 'base_observation_focus']);
    for (const target of noted) {
      assert.deepEqual(Object.keys(target.expert_note).sort(), ['ability', 'text']);
      bilingual(target.expert_note.text, `${target.target_id}.expert_note`);
      for (const lang of ['zh', 'en']) {
        assert.notEqual(target.expert_note.text[lang], target.result[lang], 'a professional observation adds interpretation rather than repeating the finding');
        assert.ok(!/[c-j]_(?:0[1-8]|secret_99)/.test(target.expert_note.text[lang]), 'professional copy must not leak reward/support IDs');
      }
      assert.deepEqual(target.required_clues, []);
    }
  });

  test(`${label}: all zones and three distinct NPC areas are reachable by public entry operations`, () => {
    const reached = new Set([caseData.initial_zone]);
    const performed = new Set(['search_area']);
    let changed = true;
    while (changed) {
      const oldSize = reached.size + performed.size;
      spec.targets.filter(item => reached.has(item.zone_id)).forEach(item => performed.add(item.action_tag));
      for (const [from, to] of caseData.zone_connections) {
        for (const [a, b] of [[from, to], [to, from]]) {
          const requirement = caseData.scene.zones[b].entry_requirement;
          if (reached.has(a) && (!requirement || performed.has(requirement))) reached.add(b);
        }
      }
      changed = oldSize !== reached.size + performed.size;
    }
    assert.deepEqual([...reached].sort(), [...zones].sort(), 'a locked zone depends on its own inaccessible target');
    assert.deepEqual(Object.keys(spec.npc_zones).sort(), caseData.npcs.map(item => item.npc_id).sort());
    assert.equal(new Set(Object.values(spec.npc_zones)).size, 3);
    Object.values(spec.npc_zones).forEach(zone => assert.ok(reached.has(zone)));
  });

  test(`${label}: each NPC has an initial account and two unique evidence-based bilingual stages`, () => {
    const allResponses = new Set();
    for (const npc of caseData.npcs) {
      bilingual(spec.initial_statements[npc.npc_id], `${npc.npc_id}.initial`);
      assert.equal(spec.testimonies[npc.npc_id].length, 2);
      for (const [index, testimony] of spec.testimonies[npc.npc_id].entries()) {
        assert.ok(testimony.required_clues.length > 0);
        testimony.required_clues.forEach(clue => assert.ok(clues.has(clue)));
        for (const field of ['topic', 'response', 'gentle_response', 'firm_response']) {
          bilingual(testimony[field], `${npc.npc_id}/${index}.${field}`);
          assert.ok(!allResponses.has(testimony[field].zh), 'NPC stages must not share generic replies');
          allResponses.add(testimony[field].zh);
        }
        assert.notEqual(testimony.response.zh, spec.initial_statements[npc.npc_id].zh);
      }
    }
  });

  test(`${label}: relations have valid evidence pairs, propositions and two separately testable alternative exclusions`, () => {
    assert.ok(spec.relations.length >= 6);
    assert.equal(new Set(spec.relations.map(item => item.proposition_id)).size, spec.relations.length);
    const relations = new Set();
    for (const edge of spec.relations) {
      assert.ok(clues.has(edge.a) && clues.has(edge.b));
      assert.notEqual(edge.a, edge.b);
      assert.ok(['supports', 'contradicts', 'precedes'].includes(edge.relation));
      bilingual(edge.label, edge.proposition_id);
      const relationKey = `${edge.a}:${edge.b}:${edge.relation}`;
      assert.ok(!relations.has(relationKey), 'same relation cannot award two propositions');
      relations.add(relationKey);
    }
    assert.equal(spec.relations.filter(item => item.alternative).length, 2);
    spec.relations.filter(item => item.alternative).forEach(item => assert.equal(item.relation, 'contradicts'));
  });

  test(`${label}: canonical report answers preserve existing truth and evidence supports every dimension without hidden reward`, () => {
    assert.deepEqual(Object.values(spec.report.answers), canonicalAnswers[label]);
    const fields = [['conclusions', 'conclusion_id'], ['methods', 'method_id'], ['motives', 'motive_id'], ['timelines', 'timeline_id']];
    for (const [field, answerKey] of fields) {
      const entries = spec.report[field];
      assert.equal(entries.length, 3);
      assert.equal(new Set(entries.map(item => item.id)).size, 3);
      assert.equal(entries.filter(item => item.id === spec.report.answers[answerKey]).length, 1);
      entries.forEach(item => bilingual(item.label, `${label}.report.${field}/${item.id}`));
      for (const lang of ['zh', 'en']) {
        const lengths = entries.map(item => item.label[lang].length);
        assert.ok(Math.max(...lengths) / Math.min(...lengths) <= 1.7, `${label}/${field}/${lang}: a verbose answer gives away the conclusion`);
      }
      assert.ok(entries.every(item => !/即证明|足以证明|责任就是/.test(item.label.zh)), 'options must state competing hypotheses without flagging weak reasoning');
    }
    assert.deepEqual(Object.keys(spec.report.support).sort(), ['method', 'motive', 'opportunity', 'timeline']);
    for (const [dimension, support] of Object.entries(spec.report.support)) {
      assert.ok(support.length > 0, `${dimension}: empty proof`);
      assert.equal(new Set(support).size, support.length);
      support.forEach(clueId => {
        assert.ok(clues.has(clueId));
        assert.ok(!clueId.includes('secret'), 'hidden evidence must not be necessary for a main conclusion');
      });
    }
    const wrongIds = spec.report.conclusions.filter(item => item.id !== spec.report.answers.conclusion_id).map(item => item.id);
    assert.deepEqual(Object.keys(spec.report.wrong_outcomes).sort(), wrongIds.sort());
    const culpritName = getCaseSecret(label).npcs.npc_01.name;
    for (const [id, outcome] of Object.entries(spec.report.wrong_outcomes)) {
      bilingual(outcome, `${label}.wrong/${id}`);
      // Failure feedback must explain the weak inference, never identify an
      // unproven culprit or irreversibly remove the main evidence.
      if (label !== 'Lvl_02') assert.ok(!outcome.en.includes(culpritName));
      assert.doesNotMatch(outcome.zh, /(?:真凶|永久销毁|案件结束)/);
    }
  });

  test(`${label}: a unique puzzle has a substantive legal answer and a conditional, optional independent hidden clue`, () => {
    const p = spec.puzzle;
    assert.ok(['sequence', 'compare', 'route'].includes(p.type));
    bilingual(p.label, `${label}.puzzle.label`);
    bilingual(p.prompt, `${label}.puzzle.prompt`);
    assert.ok(p.required_clues.length >= 2);
    p.required_clues.forEach(clue => assert.ok(clues.has(clue) && !clue.includes('secret')));
    const itemIds = p.items.map(item => item.id);
    assert.equal(new Set(itemIds).size, itemIds.length);
    p.items.forEach(item => bilingual(item.label, `${p.id}/${item.id}`));
    assert.ok(p.answer.length >= 2);
    assert.equal(new Set(p.answer).size, p.answer.length);
    p.answer.forEach(id => assert.ok(itemIds.includes(id)));
    if (p.type === 'compare') assert.ok(p.answer.length < itemIds.length, 'comparison needs plausible nonmatching material');
    else assert.equal(p.answer.length, itemIds.length, 'route/time ordering must use all waypoints');
    const h = spec.hidden;
    assert.ok(zones.has(h.zone_id));
    assert.ok(clues.has(h.clue_id));
    assert.ok(!spec.targets.some(item => item.clue_id === h.clue_id));
    assert.equal(h.unlock_turn, caseData.hidden_clues[0].unlock_turn);
    assert.ok(h.required_clues.length >= 2);
    h.required_clues.forEach(clue => assert.ok(clues.has(clue) && clue !== h.clue_id));
    for (const field of ['label', 'observation', 'result']) bilingual(h[field], `${h.target_id}.${field}`);
    assert.notEqual(h.result.zh, caseData.clue_dictionary.find(item => item.clue_id === h.clue_id).description);
  });
}

test('v2 fixes known contradictions while leaving frozen v1 public case copy intact', () => {
  const neon = getInvestigationContent('Lvl_01');
  assert.match(neon.report.motives.find(item => item.id === 'revenge').label.zh, /姐姐/);
  assert.doesNotMatch(JSON.stringify(neon), /妹妹/);
  assert.match(neon.clue_overrides.c_03.description.zh, /23:16.*23:17/);
  assert.match(neon.clue_overrides.c_03.description.en, /23:16.*23:17/);
  assert.match(neon.clue_overrides.c_08.description.zh, /23:10.*23:25.*23:17.*23:31/);
  assert.match(getInvestigationContent('Lvl_02').clue_overrides.d_03.description.zh, /02:41.*回收/);
  assert.deepEqual(getInvestigationContent('Lvl_03').targets.filter(item => ['e_02', 'e_07'].includes(item.clue_id)).map(item => [item.clue_id, item.zone_id]), [['e_02', 'zone_booth3'], ['e_07', 'zone_bar']]);
  assert.equal(getInvestigationContent('Lvl_03').hidden.zone_id, 'zone_alley');
  assert.match(getInvestigationContent('Lvl_03').clue_overrides.e_08.description.zh, /01:20.*01:26.*不能排除.*收益责任/);
  assert.match(getInvestigationContent('Lvl_03').clue_overrides.e_08.description.en, /01:20.*01:26.*do not exclude liability/);
  assert.match(getInvestigationContent('Lvl_08').clue_overrides.j_01.label.zh, /气样.*氧浓度/);
  assert.match(ALL_CASES[7].clue_dictionary.find(item => item.clue_id === 'j_01').description, /玻璃/);
});

test('temporal propositions follow recorded event times, including the complete escape chronology, rather than recovery or inferred authorization order', () => {
  const neon = getInvestigationContent('Lvl_01');
  const access = neon.relations.find(item => item.a === 'c_03' && item.b === 'c_05' && item.relation === 'precedes');
  assert.ok(access);
  for (const lang of ['zh', 'en']) assert.match(access.label[lang], /23:16.*23:17/);
  assert.equal(access.alternative, false);
  for (const [a, firstTime] of [['c_01', '23:05'], ['c_03', '23:16'], ['c_05', '23:19']]) {
    const discovery = neon.relations.find(item => item.a === a && item.b === 'c_08' && item.relation === 'precedes');
    assert.ok(discovery);
    for (const lang of ['zh', 'en']) assert.match(discovery.label[lang], new RegExp(`${firstTime}.*23:31`));
  }
  const ghost = getInvestigationContent('Lvl_02');
  const clocked = [['d_04', '01:55'], ['d_07', '02:17'], ['d_02', '02:18'], ['d_06', '02:34'], ['d_03', '02:41']];
  for (let earlier = 0; earlier < clocked.length; earlier++) {
    for (let later = earlier + 1; later < clocked.length; later++) {
      const [a, firstTime] = clocked[earlier];
      const [b, secondTime] = clocked[later];
      for (const lang of ['zh', 'en']) {
        assert.ok(ghost.targets.find(target => target.clue_id === a).result[lang].includes(firstTime));
        assert.ok(ghost.targets.find(target => target.clue_id === b).result[lang].includes(secondTime));
        const proposition = ghost.relations.find(item => item.a === a && item.b === b && item.relation === 'precedes');
        assert.ok(proposition, `${a}>${b}`);
        assert.ok(proposition.label[lang].includes(firstTime));
        assert.ok(proposition.label[lang].includes(secondTime));
        assert.equal(proposition.alternative, false);
      }
    }
  }
  for (const [caseId, a, b] of [['Lvl_02', 'd_03', 'd_06'], ['Lvl_05', 'g_08', 'g_02'], ['Lvl_08', 'j_03', 'j_02']]) {
    const relations = getInvestigationContent(caseId).relations;
    assert.equal(relations.some(item => item.a === a && item.b === b && item.relation === 'precedes'), false);
    assert.ok(relations.some(item => item.a === a && item.b === b && item.relation === 'supports'));
  }
  const trap = getInvestigationContent('Lvl_03');
  assert.equal(trap.relations.some(item => item.relation === 'precedes'
    && [item.a, item.b].sort().join(':') === 'e_03:e_05'), false, 'overlapping access and witness windows have no strict order');
});

test('all independent hidden records have a specific corroborating relationship grounded in their result text', () => {
  for (const [caseId, fact, shared] of [['Lvl_01', 'c_05', /shaft/], ['Lvl_02', 'd_03', /QPS/],
    ['Lvl_03', 'e_02', /Riku/], ['Lvl_04', 'f_04', /Elias/], ['Lvl_05', 'g_06', /Rook/],
    ['Lvl_06', 'h_03', /Tessa/], ['Lvl_07', 'i_01', /pressure/], ['Lvl_08', 'j_03', /Lucan/]]) {
    const spec = getInvestigationContent(caseId);
    const related = spec.relations.filter(edge => [edge.a, edge.b].includes(spec.hidden.clue_id));
    assert.ok(related.some(edge => edge.a === spec.hidden.clue_id && edge.b === fact && edge.relation === 'supports'), caseId);
    assert.ok(related.every(edge => edge.alternative === false));
    assert.match(spec.hidden.result.en, shared);
    assert.match(spec.targets.find(target => target.clue_id === fact).result.en, shared);
    assert.equal(spec.relations.filter(edge => edge.alternative).length, 2);
  }
});

test('private content is immutable, distinct per case and absent from browser source imports', async () => {
  assert.equal(new Set(INVESTIGATION_CASE_IDS.map(id => getInvestigationContent(id).puzzle.id)).size, 8);
  const target = getInvestigationContent('Lvl_01').targets[0];
  assert.throws(() => { target.result.zh = 'corrupted'; }, TypeError);
  assert.throws(() => { target.methods[0].label.zh = 'corrupted'; }, TypeError);
  const { readFile, readdir } = await import('node:fs/promises');
  async function sourceFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = await Promise.all(entries.map(async entry => entry.isDirectory()
      ? sourceFiles(`${dir}/${entry.name}`)
      : /\.[cm]?[jt]sx?$/.test(entry.name) ? [`${dir}/${entry.name}`] : []));
    return files.flat();
  }
  for (const file of await sourceFiles(new URL('../src', import.meta.url).pathname)) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /(?:from\s*|import\s*\(|require\s*\()\s*['"][^'"]*investigationV2\/content/, `${file}: private answers imported by client`);
  }
});
