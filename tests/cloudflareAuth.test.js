import test from 'node:test';
import assert from 'node:assert/strict';

import { authInternals } from '../cloudflare/worker/auth.js';
import { profileInternals } from '../cloudflare/worker/profile.js';

test('OAuth return paths cannot escape the current Cloudflare origin', () => {
  assert.equal(authInternals.safeReturnPath('/game?tab=home#profile'), '/game?tab=home#profile');
  assert.equal(authInternals.safeReturnPath('https://attacker.example/steal'), '/');
  assert.equal(authInternals.safeReturnPath('//attacker.example/steal'), '/');
  assert.equal(authInternals.safeReturnPath('/\\attacker.example'), '/');
});

test('profile patches reject metadata and accept only progress fields', () => {
  assert.deepEqual(profileInternals.cleanPatch({ gold: 500, detective_name: 'Nova' }), {
    gold: 500, detective_name: 'Nova',
  });
  assert.equal(profileInternals.cleanPatch({ id: 'forged', gold: 500 }), null);
  assert.equal(profileInternals.cleanPatch([]), null);
});
