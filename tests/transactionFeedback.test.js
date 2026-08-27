import test from 'node:test';
import assert from 'node:assert/strict';

import { purchaseSuccessMessage, transactionErrorMessage } from '../src/game/transactionFeedback.js';

test('transaction feedback uses the requested purchase copy in both languages', () => {
  assert.equal(transactionErrorMessage('insufficient_funds', 'zh'), '资金不足');
  assert.equal(transactionErrorMessage('insufficient_funds', 'en'), 'Insufficient funds');
  assert.equal(purchaseSuccessMessage('', 'zh'), '购买成功');
  assert.equal(purchaseSuccessMessage('', 'en'), 'Purchase successful');
});

test('transaction feedback appends localized purchase details consistently', () => {
  assert.equal(purchaseSuccessMessage('能量电池 ×2', 'zh'), '购买成功 · 能量电池 ×2');
  assert.equal(purchaseSuccessMessage('Energy Cell ×2', 'en'), 'Purchase successful · Energy Cell ×2');
  assert.equal(transactionErrorMessage('missing_code', 'zh'), '');
});
