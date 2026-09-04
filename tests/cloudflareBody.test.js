import test from 'node:test';
import assert from 'node:assert/strict';

import { readBodyBytes, readBodyText } from '../cloudflare/worker/body.js';

test('Worker body reader accepts chunked payloads within the byte limit', async () => {
  const request = new Request('https://game.example/api/test', {
    method: 'POST',
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('hello '));
        controller.enqueue(new TextEncoder().encode('world'));
        controller.close();
      },
    }),
    duplex: 'half',
  });

  assert.equal(await readBodyText(request, 11), 'hello world');
});

test('Worker body reader cancels chunked payloads as soon as the limit is exceeded', async () => {
  let cancelled = false;
  const request = new Request('https://game.example/api/test', {
    method: 'POST',
    body: new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: 'half',
  });

  await assert.rejects(
    readBodyBytes(request, 12),
    error => error.code === 'PAYLOAD_TOO_LARGE' && error.status === 413,
  );
  assert.equal(cancelled, true);
});

test('Worker body reader rejects oversized declared lengths before consuming the stream', async () => {
  const request = new Request('https://game.example/api/test', {
    method: 'POST',
    headers: { 'content-length': '13' },
    body: 'small',
  });

  await assert.rejects(
    readBodyBytes(request, 12, 'RULES_PAYLOAD_TOO_LARGE'),
    error => error.code === 'RULES_PAYLOAD_TOO_LARGE' && error.status === 413,
  );
});
