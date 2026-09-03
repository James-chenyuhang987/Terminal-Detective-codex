import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  ACTION_CINEMATIC_ANIMATIONS,
  ACTION_CINEMATIC_VARIANTS,
  CINEMATIC_ANIMATION_IDS,
  CINEMATIC_ACTION_TAGS,
  CINEMATIC_OUTCOME_EFFECTS,
  buildCinematicEvent,
  detectCinematicPlayback,
  getPublicRevealedClues,
  resolveCinematicAnimation,
  resolveCinematicTemplate,
  shouldPlayActionCinematic,
} from '../src/game/actionCinematic.js';

const CASE_DATA = Object.freeze({
  case_id: 'Lvl_Test',
  hidden_clues: [{ clue_id: 'hidden_answer' }],
  clue_dictionary: [
    { clue_id: 'ordinary', keyword: '普通痕迹', weight: 'NORMAL', visual_icon: '🔍' },
    { clue_id: 'critical', keyword: '关键残留', weight: 'CRITICAL', visual_icon: '💾' },
    { clue_id: 'hidden_answer', keyword: '幕后答案', weight: 'CRITICAL', visual_icon: '⛔' },
  ],
});

function state(turn, clues = [], zone = 'zone_a') {
  return { turn_count: turn, unlocked_clues: clues, current_zone: zone };
}

test('all twelve legal actions map to one of the six cinematic templates', () => {
  assert.equal(CINEMATIC_ACTION_TAGS.length, 12);
  assert.deepEqual(new Set(CINEMATIC_ACTION_TAGS.map(resolveCinematicTemplate)), new Set([
    'investigation',
    'digital',
    'interview',
    'confrontation',
    'pursuit',
    'covert',
  ]));
  assert.equal(resolveCinematicTemplate('hack_terminal'), 'digital');
  assert.equal(resolveCinematicTemplate('present_evidence'), 'confrontation');
  assert.equal(resolveCinematicTemplate('tail_suspect'), 'pursuit');
});

test('all twelve legal actions have two distinct deterministic animation profiles', () => {
  assert.deepEqual(new Set(Object.keys(ACTION_CINEMATIC_ANIMATIONS)), new Set(CINEMATIC_ACTION_TAGS));
  assert.deepEqual(new Set(Object.keys(ACTION_CINEMATIC_VARIANTS)), new Set(CINEMATIC_ACTION_TAGS));
  assert.equal(CINEMATIC_ANIMATION_IDS.length, 24);
  assert.equal(new Set(CINEMATIC_ANIMATION_IDS).size, 24);
  for (const actionTag of CINEMATIC_ACTION_TAGS) {
    assert.equal(ACTION_CINEMATIC_VARIANTS[actionTag].length, 2);
    const observed = new Set(
      Array.from({ length: 64 }, (_, index) => resolveCinematicAnimation(actionTag, `event-${index}`).animationId),
    );
    assert.deepEqual(observed, new Set(ACTION_CINEMATIC_VARIANTS[actionTag].map(profile => profile.animationId)));
  }
  const profiles = CINEMATIC_ACTION_TAGS.map(actionTag => resolveCinematicAnimation(actionTag, 'event-7'));
  assert.equal(new Set(profiles.map(profile => profile.animationSeed)).size, 12);
  assert.deepEqual(
    resolveCinematicAnimation('analyze_forensics', 'event-7'),
    resolveCinematicAnimation('analyze_forensics', 'event-7'),
  );
});

test('real scheduled cinematic event ids rotate through both variants', () => {
  for (const actionTag of CINEMATIC_ACTION_TAGS) {
    const observed = new Set([2, 4, 6, 8].map(turn => buildCinematicEvent({
      previousState: state(turn - 1),
      nextState: state(turn),
      settlement: { action_narration: '推进调查' },
      caseData: CASE_DATA,
      actionTag,
      executorAgentId: 'NEXUS-01',
    }).animationVariant));
    assert.deepEqual(observed, new Set([0, 1]), `${actionTag} should use both variants`);
  }
});

test('unsafe turn values fall back to a deterministic cinematic variant', () => {
  const eventId = `case-1:${'9'.repeat(400)}:search_area`;
  const first = resolveCinematicAnimation('search_area', eventId);
  const second = resolveCinematicAnimation('search_area', eventId);

  assert.deepEqual(first, second);
  assert.ok(first.animationId);
});

test('even successful turns trigger while an ordinary odd turn does not', () => {
  assert.equal(shouldPlayActionCinematic(state(1), state(2), {}, CASE_DATA), true);
  assert.equal(shouldPlayActionCinematic(state(2), state(3), {}, CASE_DATA), false);
  assert.equal(shouldPlayActionCinematic(state(2), state(4), {}, CASE_DATA), false);
  assert.equal(shouldPlayActionCinematic(state(2), state(2), {}, CASE_DATA), false);
});

test('odd turns trigger for an actual trap or a newly revealed public critical clue', () => {
  assert.equal(shouldPlayActionCinematic(state(2), state(3), { is_trap: true }, CASE_DATA), true);
  assert.equal(shouldPlayActionCinematic(
    state(2, ['ordinary']),
    state(3, ['ordinary', 'critical']),
    {},
    CASE_DATA,
  ), true);
});

test('hidden critical clues never trigger or enter a cinematic event', () => {
  const before = state(2, ['ordinary']);
  const after = state(3, ['ordinary', 'hidden_answer']);
  assert.deepEqual(getPublicRevealedClues(before, after, CASE_DATA), []);
  assert.equal(shouldPlayActionCinematic(before, after, {}, CASE_DATA), false);
  const event = buildCinematicEvent({
    previousState: before,
    nextState: after,
    settlement: { action_narration: '公开行动结束' },
    caseData: CASE_DATA,
    actionTag: 'search_area',
    executorAgentId: 'NEXUS-01',
  });
  assert.deepEqual(event.revealedClues, []);
  assert.equal(JSON.stringify(event).includes('幕后答案'), false);
  assert.equal(JSON.stringify(event).includes('hidden_answer'), false);
});

test('one cinematic event applies trap, clue, progress and no-yield priority safely', () => {
  const before = state(1, [], 'zone_a');
  const after = state(2, ['critical'], 'zone_b');
  const common = {
    previousState: before,
    nextState: after,
    caseData: CASE_DATA,
    actionTag: 'hack_terminal',
    executorAgentId: 'CIPHER-47',
    assistAgentId: 'AURORA-09',
  };
  const trapped = buildCinematicEvent({
    ...common,
    settlement: { is_trap: true, trap_narration: '反制启动', action_narration: '不应优先' },
  });
  assert.equal(trapped.outcome, 'trap');
  assert.equal(trapped.narration, '反制启动');
  assert.equal(trapped.template, 'digital');
  assert.equal(trapped.eventId, 'Lvl_Test:2:hack_terminal');
  assert.ok(ACTION_CINEMATIC_VARIANTS.hack_terminal.some(profile => profile.animationId === trapped.animationId));
  assert.ok([0, 1].includes(trapped.animationVariant));
  assert.equal(trapped.outcomeEffect, CINEMATIC_OUTCOME_EFFECTS.trap);
  assert.equal(typeof trapped.animationSeed, 'number');
  assert.equal(Object.hasOwn(trapped, 'hidden_clues'), false);
  assert.equal(Object.hasOwn(trapped, 'solution'), false);

  const clue = buildCinematicEvent({ ...common, settlement: { action_narration: '发现公开痕迹' } });
  assert.equal(clue.outcome, 'clue');
  assert.equal(clue.outcomeEffect, CINEMATIC_OUTCOME_EFFECTS.clue);
  assert.deepEqual(clue.revealedClues.map(item => item.clueId), ['critical']);

  const progress = buildCinematicEvent({
    ...common,
    nextState: state(2, [], 'zone_b'),
    settlement: { action_narration: '进入相邻区域' },
  });
  assert.equal(progress.outcome, 'progress');
  assert.equal(progress.outcomeEffect, CINEMATIC_OUTCOME_EFFECTS.progress);

  const noYield = buildCinematicEvent({
    ...common,
    nextState: state(2, [], 'zone_a'),
    settlement: { action_narration: '没有发现' },
  });
  assert.equal(noYield.outcome, 'no_yield');
  assert.equal(noYield.outcomeEffect, CINEMATIC_OUTCOME_EFFECTS.no_yield);
});

test('playback capability honors accessibility, data saver and explicit quality safely', () => {
  const makeWindow = ({ reduced = false, mobile = false, webgl = true } = {}) => ({
    matchMedia: query => ({ matches: query.includes('reduced') ? reduced : mobile }),
    document: {
      createElement: () => ({
        getContext: () => webgl ? { getExtension: () => ({ loseContext() {} }) } : null,
      }),
    },
  });

  assert.equal(detectCinematicPlayback({ enabled: false, windowObject: makeWindow() }).reason, 'disabled');
  assert.equal(detectCinematicPlayback({ windowObject: makeWindow({ reduced: true }) }).reason, 'reduced_motion');
  assert.equal(detectCinematicPlayback({ windowObject: makeWindow({ webgl: false }) }).reason, 'no_webgl');
  assert.deepEqual(
    detectCinematicPlayback({ windowObject: makeWindow(), navigatorObject: { deviceMemory: 8 } }),
    { mode: '3d', quality: 'high', reason: 'capable' },
  );
  assert.equal(
    detectCinematicPlayback({ windowObject: makeWindow(), navigatorObject: { deviceMemory: 2 } }).quality,
    'low',
  );
  assert.equal(
    detectCinematicPlayback({ windowObject: makeWindow(), navigatorObject: { connection: { saveData: true } } }).mode,
    '2d',
  );
  assert.deepEqual(
    detectCinematicPlayback({ quality: 'low', windowObject: makeWindow(), navigatorObject: { deviceMemory: 8 } }),
    { mode: '3d', quality: 'low', reason: 'user_low' },
  );
  assert.deepEqual(
    detectCinematicPlayback({ quality: 'high', windowObject: makeWindow({ mobile: true }), navigatorObject: { deviceMemory: 2 } }),
    { mode: '3d', quality: 'high', reason: 'user_high' },
  );
  assert.equal(
    detectCinematicPlayback({ quality: 'high', windowObject: makeWindow({ reduced: true }) }).mode,
    '2d',
  );
  assert.equal(
    detectCinematicPlayback({ quality: 'high', windowObject: makeWindow({ webgl: false }) }).mode,
    '2d',
  );
});

test('cinematic renderer keeps deterministic effects, no eager model preloads and a completing 2D fallback', async () => {
  const [renderer, fallback] = await Promise.all([
    readFile(new URL('../src/components/game/cinematics/ActionCinematic.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/game/cinematics/ActionCinematicFallback.jsx', import.meta.url), 'utf8'),
  ]);
  assert.doesNotMatch(renderer, /Math\.random|useGLTF\.preload/);
  assert.match(renderer, /aria-hidden="true"/);
  assert.match(renderer, /completeRef\.current\?\.\('renderer_lost'\)/);
  assert.match(fallback, /completeRef\.current\?\.\('completed'\)/);
  assert.doesNotMatch(fallback, /completeRef\.current\?\.\('fallback'\)/);
  for (const animationId of CINEMATIC_ANIMATION_IDS) {
    assert.match(renderer, new RegExp(`case '${animationId}'`), `${animationId} has no procedural renderer`);
  }
});
