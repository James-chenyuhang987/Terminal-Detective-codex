import assert from 'node:assert/strict';
import test from 'node:test';
import { cancelDeferredDispose, deferDispose } from '../src/lib/deferredDispose.js';

const nextTask = () => new Promise(resolve => setTimeout(resolve, 0));

test('owned resource disposal can be canceled when an effect is replayed', async () => {
  const resource = {};
  let disposed = 0;
  deferDispose(resource, () => { disposed += 1; });
  cancelDeferredDispose(resource);
  await nextTask();
  assert.equal(disposed, 0);

  deferDispose(resource, () => { disposed += 1; });
  await nextTask();
  assert.equal(disposed, 1);
});
