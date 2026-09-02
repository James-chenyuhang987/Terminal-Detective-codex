import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AUTH_EMAIL_LANGUAGE_KEY,
  getAuthEmailLanguageCode,
  prepareAuthEmail,
  resolveAuthEmailSender,
} from '../src/lib/authEmail.js';

function storage(value, throws = false) {
  return {
    getItem(key) {
      assert.equal(key, AUTH_EMAIL_LANGUAGE_KEY);
      if (throws) throw new Error('storage unavailable');
      return value;
    },
  };
}

test('authentication email language follows the saved UI language', () => {
  assert.equal(getAuthEmailLanguageCode(storage('en')), 'en');
  assert.equal(getAuthEmailLanguageCode(storage('zh')), 'zh-CN');
  assert.equal(getAuthEmailLanguageCode(storage(null)), 'zh-CN');
  assert.equal(getAuthEmailLanguageCode(storage(null, true)), 'zh-CN');
});

test('authentication email preparation sets the Firebase language code', () => {
  const auth = { languageCode: null };
  prepareAuthEmail(auth, storage('en'));
  assert.equal(auth.languageCode, 'en');
  assert.doesNotThrow(() => prepareAuthEmail(null, storage('zh')));
});

test('authentication sender uses a valid configured address or Firebase default', () => {
  assert.equal(
    resolveAuthEmailSender(' detective@example.com ', 'terminal-detective'),
    'detective@example.com',
  );
  assert.equal(
    resolveAuthEmailSender('not-an-address', 'terminal-detective'),
    'noreply@terminal-detective.firebaseapp.com',
  );
  assert.equal(resolveAuthEmailSender('', ''), '');
});
