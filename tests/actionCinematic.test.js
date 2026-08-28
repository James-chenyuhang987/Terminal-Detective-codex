import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CINEMATIC_ACTION_TAGS,
  buildCinematicEvent,
  detectCinematicPlayback,
  getPublicRevealedClues,
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
  assert.equal(Object.hasOwn(trapped, 'hidden_clues'), false);
  assert.equal(Object.hasOwn(trapped, 'solution'), false);

  const clue = buildCinematicEvent({ ...common, settlement: { action_narration: '发现公开痕迹' } });
  assert.equal(clue.outcome, 'clue');
  assert.deepEqual(clue.revealedClues.map(item => item.clueId), ['critical']);

  const progress = buildCinematicEvent({
    ...common,
    nextState: state(2, [], 'zone_b'),
    settlement: { action_narration: '进入相邻区域' },
  });
  assert.equal(progress.outcome, 'progress');

  const noYield = buildCinematicEvent({
    ...common,
    nextState: state(2, [], 'zone_a'),
    settlement: { action_narration: '没有发现' },
  });
  assert.equal(noYield.outcome, 'no_yield');
});

test('playback capability chooses disabled, reduced-motion, WebGL and low-quality modes', () => {
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
    detectCinematicPlayback({ windowObject: makeWindow(), navigatorObject: { connection: { saveData: true } } }).reason,
    'save_data',
  );
});
