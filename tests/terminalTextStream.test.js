import assert from 'node:assert/strict';
import test from 'node:test';

import { streamTerminalText } from '../src/game/terminalTextStream.js';

function createTimerApi() {
  let callback = null;
  let cleared = 0;
  return {
    setInterval(next) {
      callback = next;
      return 1;
    },
    clearInterval() {
      cleared += 1;
      callback = null;
    },
    tick() {
      callback?.();
    },
    get cleared() {
      return cleared;
    },
  };
}

test('terminal text streams one visible Unicode character at a time in order', async () => {
  const timerApi = createTimerApi();
  const chunks = [];
  let started = '';
  let done = '';
  const resultPromise = streamTerminalText({
    text: '案A🔍',
    intervalMs: 1,
    timerApi,
    onStart: text => { started = text; },
    onChunk: chunk => chunks.push(chunk),
    onDone: text => { done = text; },
  });

  timerApi.tick();
  timerApi.tick();
  timerApi.tick();

  assert.equal(await resultPromise, '案A🔍');
  assert.equal(started, '案A🔍');
  assert.deepEqual(chunks, ['案', 'A', '🔍']);
  assert.equal(done, '案A🔍');
  assert.equal(timerApi.cleared, 1);
});

test('terminal text completes immediately when motion is reduced', async () => {
  const timerApi = createTimerApi();
  const chunks = [];
  const result = await streamTerminalText({
    text: '完整剧情',
    instant: true,
    timerApi,
    onChunk: chunk => chunks.push(chunk),
  });

  assert.equal(result, '完整剧情');
  assert.deepEqual(chunks, ['完整剧情']);
  assert.equal(timerApi.cleared, 0);
});

test('terminal text aborts with the rendered prefix and clears its timer once', async () => {
  const timerApi = createTimerApi();
  const controller = new AbortController();
  const chunks = [];
  let done = '';
  const resultPromise = streamTerminalText({
    text: '侦探终端',
    intervalMs: 1,
    timerApi,
    signal: controller.signal,
    onChunk: chunk => chunks.push(chunk),
    onDone: text => { done = text; },
  });

  timerApi.tick();
  timerApi.tick();
  controller.abort();
  timerApi.tick();

  assert.equal(await resultPromise, '侦探');
  assert.deepEqual(chunks, ['侦', '探']);
  assert.equal(done, '侦探');
  assert.equal(timerApi.cleared, 1);
});
