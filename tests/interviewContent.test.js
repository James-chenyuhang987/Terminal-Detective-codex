import test from 'node:test';
import assert from 'node:assert/strict';
import { ALL_CASES } from '../src/game/caseData.js';
import { getInvestigationContent } from '../server/investigationV2/content.js';
import { getInterviewStrategyContent } from '../server/investigationV2/interviewContent.js';

const languages = ['zh', 'en'];
const fields = ['background', 'claim', 'prompt'];

for (const caseData of ALL_CASES) {
  test(`${caseData.case_id}: each NPC has two complete, distinct bilingual interview stages`, () => {
    const spec = getInvestigationContent(caseData.case_id);
    const authored = { zh: new Set(), en: new Set() };
    assert.equal(caseData.npcs.length, 3);
    for (const npc of caseData.npcs) {
      for (const stageIndex of [0, 1]) {
        const entry = getInterviewStrategyContent(caseData.case_id, npc.npc_id, stageIndex);
        assert.ok(entry);
        assert.deepEqual(Object.keys(entry).sort(), [...fields].sort());
        const testimony = spec.testimonies[npc.npc_id][stageIndex];
        for (const field of fields) {
          assert.deepEqual(Object.keys(entry[field]).sort(), [...languages].sort());
          for (const language of languages) {
            const value = entry[field][language];
            assert.equal(typeof value, 'string');
            assert.ok(value.trim().length >= 12, `${npc.npc_id}/${stageIndex}/${field}/${language}: incomplete copy`);
            assert.equal(authored[language].has(value), false, 'each strategy must add case- and character-specific material');
            authored[language].add(value);
            for (const oldField of ['topic', 'response', 'gentle_response', 'firm_response']) {
              assert.notEqual(value, testimony[oldField][language], 'the new interview must not reuse a prematurely revealing old response');
            }
            assert.doesNotMatch(value, /[c-j]_(?:0[1-8]|secret_99)|required_clues|report\.answers/,
              'authored dialogue must not expose internal evidence or answer keys');
          }
        }
        assert.notDeepEqual(entry.background, entry.claim);
        assert.notDeepEqual(entry.claim, entry.prompt);
      }
    }
    assert.equal(authored.zh.size, 18);
    assert.equal(authored.en.size, 18);
  });
}

test('interview lookup rejects unknown IDs, prototype keys and non-integer stage values without revealing another stage', () => {
  for (const id of [undefined, null, '', 'missing', '__proto__', 'constructor', 'toString', 1, {}, ['Lvl_01']]) {
    assert.equal(getInterviewStrategyContent(id, 'npc_01', 0), null);
    assert.equal(getInterviewStrategyContent('Lvl_01', id, 0), null);
  }
  for (const stage of [undefined, null, -1, 2, 1.5, '0', '1', false, true, NaN, Infinity, {}, []]) {
    assert.equal(getInterviewStrategyContent('Lvl_01', 'npc_01', stage), null);
  }
  assert.notDeepEqual(getInterviewStrategyContent('Lvl_01', 'npc_01', 0),
    getInterviewStrategyContent('Lvl_01', 'npc_01', 1));
});

test('readers cannot mutate shared interview material or insert additional answer fields', () => {
  for (const caseData of ALL_CASES) {
    for (const npc of caseData.npcs) {
      for (const stageIndex of [0, 1]) {
        const entry = getInterviewStrategyContent(caseData.case_id, npc.npc_id, stageIndex);
        const before = JSON.stringify(entry);
        assert.ok(Object.isFrozen(entry));
        for (const field of fields) {
          assert.ok(Object.isFrozen(entry[field]));
          assert.throws(() => { entry[field].zh = '改写'; }, TypeError);
          assert.throws(() => { entry[field].en = 'Changed'; }, TypeError);
        }
        assert.throws(() => { entry.answer = 'hidden'; }, TypeError);
        assert.equal(JSON.stringify(getInterviewStrategyContent(caseData.case_id, npc.npc_id, stageIndex)), before);
      }
    }
  }
});

function ungatedStatements(caseId, npcId, stageIndex = 0) {
  const entry = getInterviewStrategyContent(caseId, npcId, stageIndex);
  return { zh: `${entry.background.zh}\n${entry.claim.zh}`, en: `${entry.background.en}\n${entry.claim.en}` };
}

test('first-case voluntary background and fixed claims do not reveal the later return, buyer, or concealed trial-risk admissions', () => {
  const mei = ungatedStatements('Lvl_01', 'npc_01');
  assert.match(mei.zh, /23点前离楼/);
  assert.doesNotMatch(mei.zh, /承认.*返回|隐瞒.*返回|我回来过|23:17|活体掌纹|植物人|卖掉技术/);
  assert.doesNotMatch(mei.en, /concealed my return|did come back|23:17|live palm|vegetative|sell the technology/i);
  const voss = ungatedStatements('Lvl_01', 'npc_03');
  assert.doesNotMatch(voss.zh, /确认 NovaCorp 是购买方|知道高压脉冲|隐瞒了风险/);
  assert.doesNotMatch(voss.en, /confirm NovaCorp was the buyer|we knew|conceal(?:ed|ing) risk/i);
});

test('ghost-protocol witnesses retain their pre-confrontation accounts without inventing an unrestricted QPS escape', () => {
  const harlan = ungatedStatements('Lvl_02', 'npc_01');
  assert.doesNotMatch(harlan.zh, /我发起了|下载是我发起|我下载了|我.*交付密钥|境外.*交易/);
  assert.doesNotMatch(harlan.en, /I initiated|I downloaded|I.*deliver(?:ed|ing) the key/i);
  const otto = ungatedStatements('Lvl_02', 'npc_03');
  assert.match(otto.zh, /上厕所/);
  assert.doesNotMatch(otto.zh, /02:15|02:40|信封|收钱|钱|Harlan/);
  assert.doesNotMatch(otto.en, /02:15|02:40|envelope|money|Harlan/i);
  for (const stageIndex of [0, 1]) {
    const zoe = getInterviewStrategyContent('Lvl_02', 'npc_02', stageIndex);
    for (const value of Object.values(zoe)) {
      assert.doesNotMatch(value.zh, /穿过.*锁门|穿透.*锁门|远距传送|遥控.*QPS|带着.*穿墙/);
      assert.doesNotMatch(value.en, /through (?:the )?locked door|long[- ]range teleport|remote(?:ly)? operat.*QPS/i);
    }
  }
});

test('the bar witness does not admit backstage access or blackmail before the appropriate evidence confrontation', () => {
  const initial = ungatedStatements('Lvl_03', 'npc_01');
  assert.match(initial.zh, /整晚.*吧台/);
  assert.doesNotMatch(initial.zh, /去过后台|我去后台|01:20|01:26|勒索|“S”是我/);
  assert.doesNotMatch(initial.en, /went backstage|01:20|01:26|blackmail|“S” (?:is|was) me/i);
  const later = ungatedStatements('Lvl_03', 'npc_01', 1);
  assert.match(later.zh, /去过后台/);
  assert.doesNotMatch(later.zh, /我被勒索|勒索我|每月.*更多|“S”是我/);
  assert.doesNotMatch(later.en, /blackmailed me|I was blackmailed|demanded more every month/i);
});

test('conservation and White Tower interviews do not volunteer their evidence-gated admissions', () => {
  const tessa = ungatedStatements('Lvl_06', 'npc_01');
  assert.match(tessa.zh, /展柜门没有打开/);
  assert.doesNotMatch(tessa.zh, /我.*交换机构|我.*生物签名|我登记.*R41|我.*控制基金/);
  const lucan = ungatedStatements('Lvl_08', 'npc_01');
  assert.doesNotMatch(lucan.zh, /我签了|我签署了|我删除了|我已经让.*静默/);
  assert.doesNotMatch(lucan.en, /I signed|I deleted|I ordered.*silent/i);
});

test('innocent witnesses can fix checkable observations without being made to confess', () => {
  const innocentWitnesses = {
    Lvl_01: ['npc_02'], Lvl_02: ['npc_02'], Lvl_03: ['npc_02'],
    Lvl_04: ['npc_02', 'npc_03'], Lvl_05: ['npc_02'], Lvl_06: ['npc_02'],
    Lvl_07: ['npc_02', 'npc_03'], Lvl_08: ['npc_02', 'npc_03'],
  };
  for (const [caseId, npcs] of Object.entries(innocentWitnesses)) {
    for (const npcId of npcs) {
      for (const stageIndex of [0, 1]) {
        const statements = ungatedStatements(caseId, npcId, stageIndex);
        assert.doesNotMatch(statements.zh, /我杀了|是我杀|我害死|我认罪|我承认作案/);
        assert.doesNotMatch(statements.en, /I killed|I murdered|I confess|I admit (?:the murder|killing)/i);
      }
    }
  }
  const tomas = getInterviewStrategyContent('Lvl_08', 'npc_03', 1);
  assert.match(tomas.claim.zh, /低氧报警/);
  assert.doesNotMatch(JSON.stringify(tomas), /惰性气体玻璃微层|inert.gas glass microlayer/i);
});
