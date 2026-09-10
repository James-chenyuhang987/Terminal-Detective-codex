import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFunction } from 'node:vm';
import ts from 'typescript';
import * as authErrors from '../src/lib/authErrors.js';
import { createSessionBootstrap } from '../src/lib/authSession.js';

const source = readFileSync(new URL('../src/lib/AuthContext.jsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('AuthContext.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
const code = ts.transpileModule(tree.statements.filter(node => !ts.isImportDeclaration(node))
  .map(node => node.getText(tree).replace(/^export /, '').replaceAll('import.meta.env.BASE_URL', "'/'")).join('\n'),
{ compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
const deferred = () => {
  let resolve; let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const user = uid => ({ uid, emailVerified: true, email: `${uid}@example.com`, getIdToken: async () => uid });

function harness({ readiness = async () => true, session = async token => ({ authenticated: true, user: { id: token } }), redirect = async () => null } = {}) {
  let cursor = 0; let dirty = true; let value; let observer; let online;
  const slots = []; const effects = []; const sessionCalls = [];
  const auth = { currentUser: null };
  const same = (a, b) => a && b && a.length === b.length && a.every((item, i) => Object.is(item, b[i]));
  const memo = (factory, deps) => {
    const i = cursor++;
    if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, value: factory() };
    return slots[i].value;
  };
  const bindings = {
    ...authErrors,
    React: { createElement: (_type, props) => props.value }, createContext: () => ({ Provider: 'Auth' }),
    useRef: initial => { const i = cursor++; slots[i] ||= { current: initial }; return slots[i]; },
    useState: initial => {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: initial };
      return [slots[i].value, next => {
        if (!Object.is(next, slots[i].value)) { slots[i].value = next; dirty = true; }
      }];
    },
    useCallback: (fn, deps) => memo(() => fn, deps), useMemo: memo,
    useEffect: (fn, deps) => {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const old = slots[i]; slots[i] = { deps };
        effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
      }
    },
    appParams: { serverUrl: 'https://game.example' }, isFirebaseConfigured: true,
    firebasePublicConfig: { projectId: 'fixture-project' }, firebaseAuthReady: async () => auth,
    requestAuthReadiness: readiness, getRedirectResult: redirect,
    consumeCapturedAuthReturn: () => ({ action: '', feedback: '' }), setAuthTokenProvider: () => {},
    onIdTokenChanged: (_auth, callback) => { observer = callback; return () => { observer = null; }; },
    signOut: async () => { auth.currentUser = null; await observer?.(null); },
    createSessionBootstrap: () => createSessionBootstrap(async token => {
      sessionCalls.push(token);
      return session(token);
    }, { transientRetries: 0 }),
    window: { setInterval: callback => { online = callback; return 1; }, clearInterval: () => {}, addEventListener: () => {}, removeEventListener: () => {} },
  };
  const Provider = compileFunction(`${code}\nreturn AuthProvider;`, Object.keys(bindings))(...Object.values(bindings));
  const render = () => {
    if (!dirty) return;
    dirty = false; cursor = 0; value = Provider({ children: null });
    effects.splice(0).forEach(effect => effect());
  };
  return {
    auth, sessionCalls,
    get value() { render(); return value; },
    get subscribed() { return Boolean(observer); },
    emit(next) { auth.currentUser = next; return observer(next); },
    poll() { online(); },
    async flush() { for (let i = 0; i < 8; i++) { render(); await new Promise(resolve => setImmediate(resolve)); } render(); },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test('a delayed readiness success or error cannot restore a signed-out Firebase user', async () => {
  for (const rejected of [false, true]) {
    const ready = deferred(); const app = harness({ readiness: () => ready.promise });
    await app.flush();
    const stale = app.emit(user('owner-a'));
    await app.value.logout();
    if (rejected) ready.reject(new Error('offline')); else ready.resolve(true);
    await stale; await app.flush();
    assert.equal(app.value.firebaseUser, null);
    assert.equal(app.value.user, null);
    assert.equal(app.value.verificationEmail, '');
    assert.equal(app.value.isAuthenticated, false);
    assert.deepEqual(app.sessionCalls, []);
    app.unmount();
  }
});

test('backend recovery does not bootstrap its captured user after logout', async () => {
  const ready = deferred(); let requests = 0;
  const app = harness({ readiness: () => ++requests === 1 ? Promise.reject(new Error('offline')) : ready.promise });
  await app.flush();
  const initial = app.emit(user('owner-a'));
  await app.flush();
  app.poll();
  await app.value.logout();
  ready.resolve(true);
  await initial; await app.flush();
  assert.deepEqual(app.sessionCalls, []);
  assert.equal(app.value.firebaseUser, null);
  assert.equal(app.value.isAuthenticated, false);
  app.unmount();
});

test('an account switch invalidates an older token request before it can update authentication', async () => {
  for (const reject of [false, true]) {
    const token = deferred(); const app = harness();
    await app.flush();
    const stale = app.emit({ ...user('owner-a'), getIdToken: () => token.promise });
    await app.flush();
    await app.emit(user('owner-b'));
    if (reject) token.reject(new Error('old token failed')); else token.resolve('owner-a');
    await stale; await app.flush();
    assert.deepEqual(app.sessionCalls, ['owner-b']);
    assert.equal(app.value.firebaseUser.uid, 'owner-b');
    assert.equal(app.value.user.id, 'owner-b');
    assert.equal(app.value.isAuthenticated, true);
    app.unmount();
  }
});

test('same-UID SDK user replacement ignores an older bootstrap success or failure', async () => {
  for (const rejected of [false, true]) {
    const old = deferred();
    const current = { authenticated: true, user: { id: 'owner-a', version: 'current' } };
    const app = harness({ session: token => token === 'old-token' ? old.promise : current });
    await app.flush();
    const first = app.emit({ ...user('owner-a'), getIdToken: async () => 'old-token' });
    await app.flush();
    const replacement = { ...user('owner-a'), getIdToken: async () => 'new-token' };
    await app.emit(replacement);
    if (rejected) old.reject(Object.assign(new Error('invalid token'), { httpStatus: 401 }));
    else old.resolve({ authenticated: true, user: { id: 'owner-a', version: 'stale' } });
    await first; await app.flush();
    assert.equal(app.value.firebaseUser, replacement);
    assert.deepEqual(app.value.user, current.user);
    assert.equal(app.value.isAuthenticated, true);
    assert.equal(app.value.authServiceError, '');
    assert.equal(app.value.isLoadingAuth, false);
    app.unmount();
  }
});

test('a same-UID token refresh preserves the signed-in account on transient failure and recovers', async () => {
  let unavailable = false;
  const app = harness({ session: async () => {
    if (unavailable) throw Object.assign(new Error('temporarily offline'), { httpStatus: 503 });
    return { authenticated: true, user: { id: 'owner-a' } };
  } });
  await app.flush();
  await app.emit(user('owner-a'));
  unavailable = true;
  await app.emit({ ...user('owner-a'), getIdToken: async () => 'new-token' });
  await app.flush();
  assert.equal(app.value.user.id, 'owner-a');
  assert.equal(app.value.isAuthenticated, true);
  assert.equal(app.value.isLoadingAuth, false);
  assert.ok(app.value.authServiceError);
  unavailable = false;
  app.poll(); await app.flush();
  assert.equal(app.value.user.id, 'owner-a');
  assert.equal(app.value.authServiceError, '');
  app.unmount();
});

test('logout and unmount ignore late token success or failure without sending another session request', async () => {
  for (const dispose of ['logout', 'unmount']) {
    for (const rejected of [false, true]) {
      const token = deferred(); const app = harness();
      await app.flush();
      const stale = app.emit({ ...user('owner-a'), getIdToken: () => token.promise });
      await app.flush();
      if (dispose === 'logout') await app.value.logout(); else app.unmount();
      const before = app.value;
      if (rejected) token.reject(new Error('stale token failed')); else token.resolve('owner-a');
      await stale; await app.flush();
      assert.equal(app.value, before);
      assert.deepEqual(app.sessionCalls, []);
      if (dispose === 'logout') app.unmount();
    }
  }
});

test('unmount during readiness prevents late session requests or provider state changes', async () => {
  const ready = deferred(); const app = harness({ readiness: () => ready.promise });
  await app.flush();
  const stale = app.emit(user('owner-a'));
  app.unmount();
  const before = app.value;
  ready.resolve(true);
  await stale; await app.flush();
  assert.deepEqual(app.sessionCalls, []);
  assert.equal(app.value, before);
});

test('unmount while redirect initialization waits does not install a leaked token observer', async () => {
  const redirect = deferred(); const app = harness({ redirect: () => redirect.promise });
  await app.flush();
  assert.equal(app.subscribed, false);
  app.unmount();
  redirect.resolve(null);
  await app.flush();
  assert.equal(app.subscribed, false);
});
