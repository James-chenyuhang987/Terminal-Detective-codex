import test from 'node:test';
import assert from 'node:assert/strict';

import {
  requestSecurityInternals,
  validateRuleEnvelope,
} from '../cloudflare/worker/requestSecurity.js';

test('rule requests accept only declared deterministic tasks and a plain payload', () => {
  assert.deepEqual(validateRuleEnvelope({
    task: 'decision_options',
    payload: { caseId: 'Lvl_01', turn: 1, unlockedClueIds: [] },
  }), {
    task: 'decision_options',
    payload: { caseId: 'Lvl_01', turn: 1, unlockedClueIds: [] },
  });
  assert.deepEqual(validateRuleEnvelope({ task: 'admin_dump', payload: {} }), {
    error: 'UNKNOWN_RULE_TASK',
  });
  assert.deepEqual(validateRuleEnvelope({ task: 'decision_options', payload: [] }), {
    error: 'INVALID_RULE_PAYLOAD',
  });
  assert.deepEqual(validateRuleEnvelope({ task: 'decision_options', payload: {}, debug: true }), {
    error: 'INVALID_RULE_REQUEST',
  });
});

test('rule requests reject client identity injection and prototype-pollution keys', () => {
  assert.deepEqual(validateRuleEnvelope({
    task: 'report_options',
    payload: { caseId: 'Lvl_01', context: { user_id: 'other-player' } },
  }), { error: 'FORBIDDEN_IDENTITY_FIELD' });

  const polluted = JSON.parse('{"task":"link_check","payload":{"__proto__":{"isAdmin":true}}}');
  assert.deepEqual(validateRuleEnvelope(polluted), { error: 'FORBIDDEN_IDENTITY_FIELD' });
  assert.equal({}.isAdmin, undefined);
});

test('rule requests reject resource-exhaustion shapes before rules execute', () => {
  const oversized = Array.from({ length: requestSecurityInternals.LIMITS.arrayLength + 1 }, () => 'x');
  assert.deepEqual(validateRuleEnvelope({
    task: 'decision_options', payload: { unlockedClueIds: oversized },
  }), { error: 'ARRAY_TOO_LARGE' });

  let deep = { value: true };
  for (let index = 0; index < requestSecurityInternals.LIMITS.depth + 2; index += 1) {
    deep = { child: deep };
  }
  assert.deepEqual(validateRuleEnvelope({ task: 'decision_options', payload: deep }), {
    error: 'PAYLOAD_TOO_DEEP',
  });
});
