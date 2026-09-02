import test from 'node:test';
import assert from 'node:assert/strict';

import { publicErrorMessage } from '../src/lib/publicError.js';

test('public errors expose recovery guidance instead of internal exception text', () => {
  const secret = new Error('SQLITE secret table and token should never be rendered');
  secret.status = 503;
  const message = publicErrorMessage(secret, 'zh');
  assert.match(message, /服务暂时不可用/);
  assert.doesNotMatch(message, /SQLITE|secret|token/i);
});
