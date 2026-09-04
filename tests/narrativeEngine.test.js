import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLocalThought,
  buildPublicCaseContext,
  NARRATIVE_ACTION_BEATS,
  NARRATIVE_ACTIONS,
  NARRATIVE_OUTCOMES,
  NARRATIVE_PLOT_BEATS,
  OBSERVATION_AFTERMATH_BEATS,
  renderNarrative,
  renderObservationAftermath,
  resolvePublicZoneName,
} from '../src/game/narrativeEngine.js';
import {
  CASE_NARRATIVE_IDS,
  CASE_NARRATIVE_LIBRARY,
  getCaseNarrativeProfile,
} from '../src/game/caseNarrativeLibrary.js';
import { ALL_CASES, Case_Data_Lvl_01, localizeCase } from '../src/game/caseData.js';
import { createInitialGameState, generateObservation, generateObservationSections } from '../src/game/gameState.js';

test('local narrative library covers every action and outcome with at least ten bilingual variants', () => {
  for (const actionTag of NARRATIVE_ACTIONS) {
    for (const outcome of NARRATIVE_OUTCOMES) {
      for (const lang of ['zh', 'en']) {
        const variants = new Set();
        for (let index = 0; index < 96; index += 1) {
          const result = renderNarrative({
            actionTag,
            outcome,
            lang,
            agentName: 'AURORA-09',
            zoneName: 'PUBLIC ZONE',
            clueName: 'PUBLIC CLUE',
            seed: `coverage:${actionTag}:${outcome}:${lang}:${index}`,
          });
          assert.ok(result.text.length > 12);
          variants.add(result.templateId);
        }
        assert.ok(variants.size >= 10, `${actionTag}/${outcome}/${lang} only rendered ${variants.size} variants`);
      }
    }
  }
});

test('every action has a distinct paired bilingual detective-fiction scene corpus', () => {
  assert.deepEqual(new Set(Object.keys(NARRATIVE_ACTION_BEATS)), new Set(NARRATIVE_ACTIONS));
  for (const actionTag of NARRATIVE_ACTIONS) {
    assert.ok(NARRATIVE_ACTION_BEATS[actionTag].length >= 5, `${actionTag} needs at least five scene beats`);
    for (const beat of NARRATIVE_ACTION_BEATS[actionTag]) {
      assert.ok(beat.zh.length >= 45, `${actionTag} Chinese scene beat is too short`);
      assert.ok(beat.en.length >= 100, `${actionTag} English scene beat is too short`);
    }
  }
});

test('action narration advances through four paired detective-story plot stages', () => {
  assert.deepEqual(Object.keys(NARRATIVE_PLOT_BEATS), ['opening', 'pursuit', 'escalation', 'convergence']);
  for (const [stage, beats] of Object.entries(NARRATIVE_PLOT_BEATS)) {
    assert.ok(beats.length >= 3, `${stage} needs at least three plot beats`);
    for (const beat of beats) {
      assert.ok(beat.zh.length >= 25, `${stage} Chinese plot beat is too short`);
      assert.ok(beat.en.length >= 70, `${stage} English plot beat is too short`);
    }
  }

  const shared = {
    actionTag: 'check_alibi',
    outcome: 'progress',
    agentName: 'AURORA-09',
    zoneName: 'PUBLIC ZONE',
    seed: 'plot-stage-parity',
  };
  const turns = [1, 4, 7, 10];
  const zh = turns.map(turn => renderNarrative({ ...shared, turn, lang: 'zh' }));
  const en = turns.map(turn => renderNarrative({ ...shared, turn, lang: 'en' }));
  assert.equal(new Set(zh.map(result => result.text)).size, 4);
  assert.equal(new Set(zh.map(result => result.templateId)).size, 4);
  assert.deepEqual(zh.map(result => result.templateId), en.map(result => result.templateId));
});

test('Chinese and English select the same semantic scene and outcome templates', () => {
  for (const actionTag of NARRATIVE_ACTIONS) {
    const event = {
      actionTag,
      outcome: 'progress',
      agentName: 'AURORA-09',
      zoneName: 'PUBLIC ZONE',
      clueName: 'PUBLIC CLUE',
      seed: `semantic-parity:${actionTag}`,
    };
    const zh = renderNarrative({ ...event, lang: 'zh' });
    const en = renderNarrative({ ...event, lang: 'en' });
    assert.equal(zh.templateId, en.templateId);
    assert.doesNotMatch(`${zh.text}\n${en.text}`, /\{\w+\}/);
  }
});

test('narrative output is stable and recent template ids prevent immediate repetition', () => {
  const event = {
    actionTag: 'analyze_forensics', outcome: 'clue', lang: 'zh',
    agentName: 'AURORA-09', zoneName: '法证室', clueName: '公开证物', seed: 'stable-seed',
  };
  const first = renderNarrative(event);
  assert.deepEqual(renderNarrative(event), first);
  const next = renderNarrative(event, [first.templateId, 'older:progress:0:0', 'oldest:progress:0:1']);
  assert.notEqual(next.templateId, first.templateId);
});

test('public case context excludes protected clue records from narrative progress', () => {
  const hiddenClue = Case_Data_Lvl_01.hidden_clues?.[0];
  assert.ok(hiddenClue?.clue_id);
  const caseData = Case_Data_Lvl_01;
  const hiddenRecord = caseData.clue_dictionary.find(clue => clue.clue_id === hiddenClue.clue_id);
  const context = buildPublicCaseContext({
    gameState: {
      turn_count: 3,
      current_zone: Object.keys(caseData.scene.zones)[0],
      unlocked_clues: [hiddenClue.clue_id],
    },
    caseData,
    lang: 'zh',
  });
  assert.equal(context.clueCount, 0);
  if (hiddenRecord?.keyword) assert.doesNotMatch(context.narrative, new RegExp(hiddenRecord.keyword));
});

test('narrative engine only interpolates explicit safe public fields', () => {
  const event = {
    actionTag: 'search_area', outcome: 'progress', lang: 'en', seed: 'privacy',
    agentName: 'NEXUS-01', zoneName: 'PUBLIC ATRIUM', clueName: 'PUBLIC TRACE',
    killer: 'SHOULD_NEVER_RENDER', truth: 'HIDDEN_TRUTH_SHOULD_NEVER_RENDER',
  };
  const text = renderNarrative(event).text;
  assert.doesNotMatch(text, /SHOULD_NEVER_RENDER|HIDDEN_TRUTH_SHOULD_NEVER_RENDER/);
});

test('first turn creates a coherent public case opening without leaking internal zone ids', () => {
  const caseData = localizeCase(Case_Data_Lvl_01, 'zh');
  const state = createInitialGameState(caseData);
  const context = buildPublicCaseContext({ gameState: state, caseData, lang: 'zh' });
  const sections = generateObservationSections(state, caseData, 'zh');
  const observation = generateObservation(state, caseData, 'zh');
  const thought = buildLocalThought({
    gameState: state,
    caseData,
    agentStrategy: { primary_agent_id: 'AURORA-09', team: [{ agent_id: 'AURORA-09' }] },
    observation,
    lang: 'zh',
  });

  assert.equal(context.isOpening, true);
  assert.deepEqual(sections.story, context);
  assert.equal(sections.observation, observation);
  assert.equal(sections.observation, `${sections.storyBlock}\n\n${sections.scanBlock}`);
  assert.equal(sections.observationTerminalText, `◈ 回合 1 — 观察阶段\n${sections.observation}`);
  assert.match(sections.observationTerminalText, /系统扫描 · 回合 1/);
  assert.match(sections.observationTerminalText, /地点.*数据中心 · 案发现场/s);
  assert.match(sections.observationTerminalText, /接触人.*Mei Lin/s);
  assert.match(sections.observationTerminalText, /证据.*0\/9 已保全/s);
  assert.match(sections.observationTerminalText, /混乱.*HP.*AP/s);
  assert.match(sections.observationTerminalText, /声望.*100点/s);
  assert.equal(context.zoneName, '数据中心 · 案发现场');
  assert.match(observation, /第一幕.*封锁现场.*霓虹血迹/s);
  assert.match(observation, /现场初勘/);
  assert.match(observation, /核心谜题/);
  assert.match(observation, /Victor Zhao/);
  assert.match(observation, /相关人员.*Mei Lin/s);
  assert.match(observation, /首要任务/);
  assert.match(thought, /第一条判断必须从现场/);
  assert.doesNotMatch(`${observation}\n${thought}`, /zone_datacenter/);
});

test('terminal story block preserves the same protected public narrative used by decisions', () => {
  const hiddenClue = Case_Data_Lvl_01.hidden_clues?.[0];
  const hiddenRecord = Case_Data_Lvl_01.clue_dictionary.find(clue => clue.clue_id === hiddenClue?.clue_id);
  const sections = generateObservationSections({
    ...createInitialGameState(Case_Data_Lvl_01),
    turn_count: 3,
    unlocked_clues: hiddenClue ? [hiddenClue.clue_id] : [],
  }, Case_Data_Lvl_01, 'zh');

  assert.equal(sections.story.clueCount, 0);
  assert.match(sections.storyBlock, new RegExp(sections.story.narrative.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (hiddenRecord?.keyword) assert.doesNotMatch(sections.storyBlock, new RegExp(hiddenRecord.keyword));
});

test('public zone resolver and narrative output replace raw internal ids with readable fallbacks', () => {
  assert.equal(resolvePublicZoneName(Case_Data_Lvl_01, 'zone_datacenter', 'en'), 'Data Center · Crime Scene');
  const text = renderNarrative({
    actionTag: 'search_area', outcome: 'progress', lang: 'zh',
    zoneId: 'zone_datacenter', clueIds: ['c_01'], seed: 'raw-id-guard',
  }).text;
  assert.doesNotMatch(text, /zone_datacenter|c_01/);
});

test('all eight cases provide complete bilingual dramatic profiles for every public zone', () => {
  assert.equal(CASE_NARRATIVE_IDS.length, ALL_CASES.length);
  assert.deepEqual(new Set(CASE_NARRATIVE_IDS), new Set(ALL_CASES.map(item => item.case_id)));

  for (const caseData of ALL_CASES) {
    for (const lang of ['zh', 'en']) {
      const localized = localizeCase(caseData, lang);
      const profile = getCaseNarrativeProfile(caseData.case_id, lang);
      assert.ok(profile.prologue.length > (lang === 'zh' ? 45 : 80), `${caseData.case_id}/${lang} prologue is too short`);
      assert.ok(profile.question.length >= (lang === 'zh' ? 30 : 80), `${caseData.case_id}/${lang} question is too short`);
      for (const stage of ['opening', 'pursuit', 'convergence']) {
        assert.ok(profile.stages[stage].length > (lang === 'zh' ? 30 : 80), `${caseData.case_id}/${lang}/${stage} stage missing`);
        assert.ok(profile.objectives[stage].length > (lang === 'zh' ? 25 : 80), `${caseData.case_id}/${lang}/${stage} objective missing`);
      }
      assert.ok(profile.motifs.length >= 4, `${caseData.case_id}/${lang} motifs incomplete`);
      assert.deepEqual(
        new Set(Object.keys(profile.zones)),
        new Set(Object.keys(localized.scene.zones)),
        `${caseData.case_id}/${lang} zone atmosphere coverage differs from public case zones`,
      );
    }
  }
});

test('each case opening uses its own prologue and central mystery in both languages', () => {
  for (const caseData of ALL_CASES) {
    for (const lang of ['zh', 'en']) {
      const localized = localizeCase(caseData, lang);
      const state = createInitialGameState(localized);
      const context = buildPublicCaseContext({ gameState: state, caseData: localized, lang });
      const profile = getCaseNarrativeProfile(caseData.case_id, lang);
      assert.equal(context.stage, 'opening');
      assert.equal(context.question, profile.question);
      assert.match(context.narrative, new RegExp(profile.prologue.slice(0, 24).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.match(context.narrative, new RegExp(profile.question.slice(0, 18).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      assert.ok(context.zoneAtmosphere.length > 20);
      assert.doesNotMatch(context.narrative, /\bzone_[a-z0-9_:-]+\b/i);
    }
  }
});

test('action results echo the active case premise without changing deterministic selection', () => {
  const shared = {
    actionTag: 'analyze_forensics',
    outcome: 'clue',
    lang: 'zh',
    agentName: 'AURORA-09',
    zoneName: '公开现场',
    clueName: '公开证物',
    seed: 'same-public-action',
  };
  const neon = renderNarrative({ ...shared, caseId: 'Lvl_01' });
  const abyss = renderNarrative({ ...shared, caseId: 'Lvl_07' });
  assert.equal(renderNarrative({ ...shared, caseId: 'Lvl_01' }).text, neon.text);
  assert.notEqual(neon.text, abyss.text);
  assert.ok(CASE_NARRATIVE_LIBRARY.Lvl_01.zh.motifs.some(motif => neon.text.includes(motif)));
  assert.ok(CASE_NARRATIVE_LIBRARY.Lvl_07.zh.motifs.some(motif => abyss.text.includes(motif)));
});

test('adaptive observation corpus provides multiple paired variants for every action family', () => {
  assert.deepEqual(
    new Set(Object.keys(OBSERVATION_AFTERMATH_BEATS)),
    new Set(['testimony', 'scene', 'timeline', 'digital', 'forensics', 'network']),
  );
  for (const [group, beats] of Object.entries(OBSERVATION_AFTERMATH_BEATS)) {
    assert.ok(beats.length >= 4, `${group} needs at least four aftermath variants`);
    for (const beat of beats) {
      assert.ok(beat.zh.length >= 35, `${group} Chinese aftermath is too short`);
      assert.ok(beat.en.length >= 80, `${group} English aftermath is too short`);
    }
  }
});

test('next observation changes with the selected action and final outcome', () => {
  const base = {
    ...createInitialGameState(Case_Data_Lvl_01),
    turn_count: 1,
    unlocked_clues: ['c_01'],
    last_action_context: {
      version: 1,
      turn: 1,
      action_tag: 'interrogate_suspect',
      executor_agent_id: 'NEXUS-01',
      assist_agent_id: null,
      outcome: 'progress',
      public_clue_ids: [],
      from_zone: 'zone_datacenter',
      to_zone: 'zone_datacenter',
      moved: false,
      ap_spent: 2,
      hp_delta: 0,
      confusion_delta: 2,
      trap_triggered: false,
    },
  };
  const testimony = buildPublicCaseContext({ gameState: base, caseData: Case_Data_Lvl_01, lang: 'zh' });
  const digital = buildPublicCaseContext({
    gameState: {
      ...base,
      last_action_context: {
        ...base.last_action_context,
        action_tag: 'hack_terminal',
        outcome: 'trap',
        confusion_delta: 8,
        trap_triggered: true,
      },
    },
    caseData: Case_Data_Lvl_01,
    lang: 'zh',
  });

  assert.match(testimony.narrative, /审讯相关人员/);
  assert.match(digital.narrative, /入侵终端/);
  assert.match(digital.aftermath.text, /反制|警报|陷阱|敌对/);
  assert.notEqual(testimony.aftermath.text, digital.aftermath.text);
});

test('adaptive observations are stable and bilingual languages share a semantic template', () => {
  const gameState = {
    ...createInitialGameState(Case_Data_Lvl_01),
    run_id: 'stable-observation-run',
    turn_count: 2,
    current_zone: 'zone_lobby',
    unlocked_clues: ['c_01', 'c_03'],
    last_action_context: {
      version: 1,
      turn: 2,
      action_tag: 'check_cctv',
      executor_agent_id: 'CIPHER-47',
      assist_agent_id: 'NEXUS-01',
      outcome: 'clue',
      public_clue_ids: ['c_03'],
      from_zone: 'zone_datacenter',
      to_zone: 'zone_lobby',
      moved: true,
      ap_spent: 2,
      hp_delta: 0,
      confusion_delta: 1,
      trap_triggered: false,
    },
  };
  const zh = renderObservationAftermath({ gameState, caseData: Case_Data_Lvl_01, lang: 'zh' });
  const en = renderObservationAftermath({ gameState, caseData: Case_Data_Lvl_01, lang: 'en' });

  assert.deepEqual(renderObservationAftermath({ gameState, caseData: Case_Data_Lvl_01, lang: 'zh' }), zh);
  assert.equal(zh.templateId, en.templateId);
  assert.match(zh.text, /复查监控/);
  assert.match(en.text, /camera review/);
  assert.match(zh.text, /大堂 · 监控中心/);
  assert.match(en.text, /Lobby · Surveillance/);
});

test('stable state seeds expose several aftermath variants without random redraws', () => {
  const templateIds = new Set();
  for (let index = 0; index < 40; index += 1) {
    const gameState = {
      ...createInitialGameState(Case_Data_Lvl_01),
      run_id: `variant-run-${index}`,
      turn_count: 1,
      last_action_context: {
        version: 1,
        turn: 1,
        action_tag: 'search_area',
        executor_agent_id: 'AURORA-09',
        assist_agent_id: null,
        outcome: 'progress',
        public_clue_ids: [],
        from_zone: 'zone_datacenter',
        to_zone: 'zone_datacenter',
        moved: false,
        ap_spent: 1,
        hp_delta: 0,
        confusion_delta: 0,
        trap_triggered: false,
      },
    };
    templateIds.add(renderObservationAftermath({ gameState, caseData: Case_Data_Lvl_01, lang: 'zh' }).templateId);
  }
  assert.ok(templateIds.size >= 4);
});

test('all legal action choices produce distinguishable next-turn story text', () => {
  const texts = NARRATIVE_ACTIONS.map(actionTag => {
    const gameState = {
      ...createInitialGameState(Case_Data_Lvl_01),
      run_id: 'all-action-observations',
      turn_count: 1,
      last_action_context: {
        version: 1,
        turn: 1,
        action_tag: actionTag,
        executor_agent_id: 'NEXUS-01',
        assist_agent_id: null,
        outcome: 'progress',
        public_clue_ids: [],
        from_zone: 'zone_datacenter',
        to_zone: 'zone_datacenter',
        moved: false,
        ap_spent: 1,
        hp_delta: 0,
        confusion_delta: 0,
        trap_triggered: false,
      },
    };
    return renderObservationAftermath({ gameState, caseData: Case_Data_Lvl_01, lang: 'zh' }).text;
  });

  assert.equal(new Set(texts).size, NARRATIVE_ACTIONS.length);
});

test('adaptive observation never renders hidden clue ids or hidden clue text', () => {
  const hidden = Case_Data_Lvl_01.hidden_clues[0];
  const gameState = {
    ...createInitialGameState(Case_Data_Lvl_01),
    turn_count: 1,
    unlocked_clues: [hidden.clue_id],
    last_action_context: {
      version: 1,
      turn: 1,
      action_tag: 'analyze_forensics',
      executor_agent_id: 'AURORA-09',
      assist_agent_id: null,
      outcome: 'clue',
      public_clue_ids: [hidden.clue_id],
      from_zone: 'zone_datacenter',
      to_zone: 'zone_datacenter',
      moved: false,
      ap_spent: 1,
      hp_delta: 0,
      confusion_delta: 0,
      trap_triggered: false,
    },
  };
  const context = buildPublicCaseContext({ gameState, caseData: Case_Data_Lvl_01, lang: 'zh' });

  assert.doesNotMatch(context.narrative, new RegExp(hidden.clue_id));
  assert.doesNotMatch(context.narrative, new RegExp(hidden.text.slice(0, 12)));
  assert.equal(context.aftermath.outcome, 'progress');
});
