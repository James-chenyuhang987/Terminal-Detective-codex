import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  onIdTokenChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  unlink,
  updatePassword,
} from 'firebase/auth';
import { appParams } from '@/lib/app-params';
import { AUTH_FEEDBACK_CODES, authRedirectFeedback, hasGitHubProvider, mapFirebaseAuthError, providerIds, validatePassword } from '@/lib/authErrors';
import { cooldownRemaining, startAuthCooldown } from '@/lib/authCooldown';
import { firebaseAuthReady, firebasePublicConfig, isFirebaseConfigured } from '@/lib/firebase';
import { setAuthTokenProvider } from '@/lib/authToken';

const AuthContext = createContext(null);
const AUTH_TIMEOUT_MS = 10_000;
const AUTH_RETRY_LIMIT = 2;
const VERIFY_COOLDOWN_KEY = 'td_firebase_verify_cooldown';
const RESET_COOLDOWN_KEY = 'td_firebase_reset_cooldown';

function feedbackError(code, cause) {
  const error = /** @type {Error & { feedbackCode?: string, cause?: unknown }} */ (new Error(code));
  error.feedbackCode = code;
  error.cause = cause;
  return error;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function actionUrl(kind = 'verified') {
  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  url.searchParams.set('auth', kind);
  return url.toString();
}

function paramsObject(params) {
  const result = /** @type {Record<string, string>} */ ({});
  params.forEach((value, key) => { result[key] = value; });
  return result;
}

function consumeAuthReturn() {
  const url = new URL(window.location.href);
  const action = url.searchParams.get('auth') || '';
  const redirectParams = paramsObject(url.searchParams);
  let feedback = authRedirectFeedback(redirectParams);
  const hashValue = url.hash.replace(/^#\??/, '');
  if (hashValue && /(?:^|&)error(?:_code|_description)?=/.test(hashValue)) {
    feedback ||= authRedirectFeedback(paramsObject(new URLSearchParams(hashValue)));
    url.hash = '';
  }
  const sensitiveKeys = ['auth', 'error', 'error_code', 'error_description'];
  const changed = sensitiveKeys.some(key => url.searchParams.has(key)) || Boolean(feedback && window.location.hash);
  sensitiveKeys.forEach(key => url.searchParams.delete(key));
  if (changed) {
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return { action, feedback };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function wait(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function retryAfterMs(response, attempt) {
  const header = Number(response?.headers?.get('retry-after'));
  if (Number.isFinite(header) && header > 0) return Math.min(5_000, header * 1000);
  return 500 * (2 ** attempt);
}

async function probeCloudflareAuth() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${appParams.serverUrl}/api/auth/config`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const payload = await readJson(response);
    if (!response.ok) return { ready: false, feedbackCode: AUTH_FEEDBACK_CODES.NETWORK, payload };
    if (payload?.project_id && payload.project_id !== firebasePublicConfig.projectId) {
      return { ready: false, feedbackCode: AUTH_FEEDBACK_CODES.BACKEND_MISMATCH, payload };
    }
    if (!payload?.ready || !payload?.firebase || !payload?.database || !payload?.schema) {
      return { ready: false, feedbackCode: AUTH_FEEDBACK_CODES.CONFIG_MISSING, payload };
    }
    return { ready: true, feedbackCode: '', payload };
  } catch (error) {
    return { ready: false, feedbackCode: mapFirebaseAuthError(error) === AUTH_FEEDBACK_CODES.UNKNOWN ? AUTH_FEEDBACK_CODES.NETWORK : mapFirebaseAuthError(error), error };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function bootstrapCloudflare(firebaseUser, forceRefresh = false, attempt = 0) {
  const token = await firebaseUser.getIdToken(forceRefresh);
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  try {
    const response = await fetch(`${appParams.serverUrl}/api/auth/session`, {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    if (response.status === 401 && !forceRefresh) {
      return bootstrapCloudflare(firebaseUser, true, attempt);
    }
    if ([429, 502, 503, 504].includes(response.status) && attempt < AUTH_RETRY_LIMIT) {
      await wait(retryAfterMs(response, attempt));
      return bootstrapCloudflare(firebaseUser, forceRefresh, attempt + 1);
    }
    const payload = await readJson(response);
    if (!response.ok || !payload?.authenticated || !payload?.user) {
      const code = payload?.code || payload?.error || (response.status === 401 ? 'UNAUTHENTICATED' : 'AUTH_BACKEND_UNAVAILABLE');
      if (code === 'EMAIL_UNVERIFIED') throw feedbackError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED, payload);
      if (code === 'FIREBASE_NOT_CONFIGURED') throw feedbackError(AUTH_FEEDBACK_CODES.CONFIG_MISSING, payload);
      throw feedbackError(AUTH_FEEDBACK_CODES.NETWORK, payload);
    }
    return payload;
  } catch (error) {
    if (attempt < AUTH_RETRY_LIMIT && (error?.name === 'AbortError' || error instanceof TypeError)) {
      await wait(500 * (2 ** attempt));
      return bootstrapCloudflare(firebaseUser, forceRefresh, attempt + 1);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

function requireConfigured(auth) {
  if (!auth) throw feedbackError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
  return auth;
}

export function AuthProvider({ children }) {
  const [firebaseUser, setFirebaseUser] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [authServiceError, setAuthServiceError] = useState('');
  const [authBackendStatus, setAuthBackendStatus] = useState(isFirebaseConfigured ? 'checking' : 'config');
  const mountedRef = useRef(true);
  const bootSequenceRef = useRef(0);
  const backendReadyRef = useRef(false);

  const checkAuthBackend = useCallback(async () => {
    if (!isFirebaseConfigured) {
      backendReadyRef.current = false;
      setAuthBackendStatus('config');
      setAuthServiceError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
      return false;
    }
    setAuthBackendStatus('checking');
    const result = await probeCloudflareAuth();
    if (!mountedRef.current) return false;
    backendReadyRef.current = result.ready;
    setAuthBackendStatus(result.ready ? 'ready' : result.feedbackCode === AUTH_FEEDBACK_CODES.CONFIG_MISSING || result.feedbackCode === AUTH_FEEDBACK_CODES.BACKEND_MISMATCH ? 'config' : 'error');
    setAuthServiceError(result.feedbackCode);
    return result.ready;
  }, []);

  const applyFirebaseUser = useCallback(async (nextUser, { forceRefresh = false } = {}) => {
    const sequence = ++bootSequenceRef.current;
    setFirebaseUser(nextUser || null);
    setVerificationEmail(nextUser?.email || '');
    setUser(null);
    setIsAuthenticated(false);
    if (!nextUser) return null;
    setAuthServiceError('');
    if (!nextUser.emailVerified) {
      setAuthServiceError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      return null;
    }
    try {
      if (!backendReadyRef.current && !await checkAuthBackend()) return null;
      const session = await bootstrapCloudflare(nextUser, forceRefresh);
      if (!mountedRef.current || sequence !== bootSequenceRef.current) return null;
      setUser(session.user);
      setIsAuthenticated(true);
      return session.user;
    } catch (error) {
      if (!mountedRef.current || sequence !== bootSequenceRef.current) return null;
      setAuthServiceError(error?.feedbackCode || AUTH_FEEDBACK_CODES.NETWORK);
      return null;
    }
  }, [checkAuthBackend]);

  useEffect(() => {
    mountedRef.current = true;
    if (!isFirebaseConfigured) {
      setAuthServiceError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return () => { mountedRef.current = false; };
    }

    let unsubscribe = () => {};
    let authReturn = consumeAuthReturn();
    void firebaseAuthReady().then(async auth => {
      if (!auth || !mountedRef.current) return;
      setAuthTokenProvider(force => auth.currentUser?.getIdToken(Boolean(force)) || '');
      await checkAuthBackend();
      try { await getRedirectResult(auth); } catch (error) {
        if (mountedRef.current) setAuthServiceError(mapFirebaseAuthError(error));
      }
      if (authReturn.feedback && mountedRef.current) setAuthServiceError(authReturn.feedback);
      unsubscribe = onIdTokenChanged(auth, async nextUser => {
        setIsLoadingAuth(true);
        if (authReturn.action === 'verified' && nextUser && !nextUser.emailVerified) {
          try {
            await reload(nextUser);
            if (nextUser.emailVerified) await nextUser.getIdToken(true);
          } catch {
            // The verification panel remains available as a safe manual retry.
          }
        }
        authReturn = { action: '', feedback: '' };
        await applyFirebaseUser(nextUser);
        if (mountedRef.current) {
          setAuthChecked(true);
          setIsLoadingAuth(false);
        }
      });
    }).catch(() => {
      if (mountedRef.current) {
        setAuthServiceError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      mountedRef.current = false;
      unsubscribe();
      setAuthTokenProvider(null);
    };
  }, [applyFirebaseUser, checkAuthBackend]);

  const auth = useCallback(async () => requireConfigured(await firebaseAuthReady()), []);

  const signInWithEmail = useCallback(async (email, password) => {
    try {
      const instance = await auth();
      const credential = await signInWithEmailAndPassword(instance, normalizeEmail(email), String(password || ''));
      if (!credential.user.emailVerified) {
        setVerificationEmail(credential.user.email || normalizeEmail(email));
        throw feedbackError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      }
      await applyFirebaseUser(credential.user, { forceRefresh: true });
      return credential.user;
    } catch (error) {
      if (error?.feedbackCode) throw error;
      throw feedbackError(mapFirebaseAuthError(error), error);
    }
  }, [applyFirebaseUser, auth]);

  const signUpWithEmail = useCallback(async (email, password) => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    try {
      const instance = await auth();
      const credential = await createUserWithEmailAndPassword(instance, normalizeEmail(email), String(password));
      setFirebaseUser(credential.user);
      setVerificationEmail(credential.user.email || normalizeEmail(email));
      setAuthServiceError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      await sendEmailVerification(credential.user, { url: actionUrl('verified'), handleCodeInApp: false });
      startAuthCooldown(VERIFY_COOLDOWN_KEY);
      return credential.user;
    } catch (error) {
      if (error?.feedbackCode) throw error;
      const code = mapFirebaseAuthError(error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) startAuthCooldown(VERIFY_COOLDOWN_KEY, { rateLimited: true });
      throw feedbackError(code, error);
    }
  }, [auth]);

  const sendVerificationAgain = useCallback(async () => {
    const remaining = cooldownRemaining(VERIFY_COOLDOWN_KEY);
    if (remaining) throw Object.assign(feedbackError(AUTH_FEEDBACK_CODES.RATE_LIMITED), { remaining });
    const instance = await auth();
    const current = instance.currentUser;
    if (!current) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    try {
      await sendEmailVerification(current, { url: actionUrl('verified'), handleCodeInApp: false });
      startAuthCooldown(VERIFY_COOLDOWN_KEY);
      return true;
    } catch (error) {
      const code = mapFirebaseAuthError(error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) startAuthCooldown(VERIFY_COOLDOWN_KEY, { rateLimited: true });
      throw feedbackError(code, error);
    }
  }, [auth]);

  const refreshEmailVerification = useCallback(async () => {
    const instance = await auth();
    const current = instance.currentUser;
    if (!current) return false;
    await reload(current);
    if (!current.emailVerified) throw feedbackError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
    await applyFirebaseUser(current, { forceRefresh: true });
    return true;
  }, [applyFirebaseUser, auth]);

  const sendPasswordReset = useCallback(async email => {
    const remaining = cooldownRemaining(RESET_COOLDOWN_KEY);
    if (remaining) throw Object.assign(feedbackError(AUTH_FEEDBACK_CODES.RATE_LIMITED), { remaining });
    try {
      const instance = await auth();
      await sendPasswordResetEmail(instance, normalizeEmail(email), { url: actionUrl('password-reset'), handleCodeInApp: false });
    } catch (error) {
      const code = mapFirebaseAuthError(error);
      if (code === AUTH_FEEDBACK_CODES.INVALID_EMAIL) throw feedbackError(code, error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) {
        startAuthCooldown(RESET_COOLDOWN_KEY, { rateLimited: true });
        throw feedbackError(code, error);
      }
      if (code !== AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL) throw feedbackError(code, error);
      // Account enumeration protection: unknown and known accounts receive the same UI response.
    }
    startAuthCooldown(RESET_COOLDOWN_KEY);
    return true;
  }, [auth]);

  const loginWithGitHub = useCallback(async () => {
    const instance = await auth();
    const provider = new GithubAuthProvider();
    provider.addScope('read:user');
    provider.addScope('user:email');
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(instance, provider);
      await applyFirebaseUser(result.user, { forceRefresh: true });
      return result.user;
    } catch (error) {
      const code = mapFirebaseAuthError(error);
      if (code === AUTH_FEEDBACK_CODES.POPUP_BLOCKED) {
        try {
          await signInWithRedirect(instance, provider);
          return null;
        } catch (redirectError) {
          throw feedbackError(mapFirebaseAuthError(redirectError), redirectError);
        }
      }
      throw feedbackError(code, error);
    }
  }, [applyFirebaseUser, auth]);

  const linkGitHub = useCallback(async () => {
    const instance = await auth();
    if (!instance.currentUser) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    if (hasGitHubProvider(instance.currentUser)) return instance.currentUser;
    const provider = new GithubAuthProvider();
    provider.addScope('read:user');
    provider.addScope('user:email');
    try {
      const result = await linkWithPopup(instance.currentUser, provider);
      await applyFirebaseUser(result.user, { forceRefresh: true });
      return result.user;
    } catch (error) {
      throw feedbackError(mapFirebaseAuthError(error), error);
    }
  }, [applyFirebaseUser, auth]);

  const unlinkGitHub = useCallback(async () => {
    const instance = await auth();
    const current = instance.currentUser;
    if (!current) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    if (providerIds(current).length <= 1) throw feedbackError(AUTH_FEEDBACK_CODES.LAST_PROVIDER);
    const next = await unlink(current, 'github.com');
    await applyFirebaseUser(next, { forceRefresh: true });
    return next;
  }, [applyFirebaseUser, auth]);

  const addPassword = useCallback(async password => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    const instance = await auth();
    const current = instance.currentUser;
    if (!current?.email) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_EMAIL);
    try {
      const credential = EmailAuthProvider.credential(current.email, String(password));
      const result = await linkWithCredential(current, credential);
      await applyFirebaseUser(result.user, { forceRefresh: true });
      return result.user;
    } catch (error) {
      throw feedbackError(mapFirebaseAuthError(error), error);
    }
  }, [applyFirebaseUser, auth]);

  const changePassword = useCallback(async password => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    const instance = await auth();
    if (!instance.currentUser) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    try {
      await updatePassword(instance.currentUser, String(password));
      return true;
    } catch (error) {
      throw feedbackError(mapFirebaseAuthError(error), error);
    }
  }, [auth]);

  const logout = useCallback(async () => {
    const instance = await firebaseAuthReady();
    if (instance) await signOut(instance).catch(() => undefined);
    bootSequenceRef.current += 1;
    setFirebaseUser(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthServiceError('');
  }, []);

  const checkUserAuth = useCallback(async () => {
    const instance = await firebaseAuthReady();
    if (!instance?.currentUser) return null;
    await reload(instance.currentUser);
    return applyFirebaseUser(instance.currentUser, { forceRefresh: true });
  }, [applyFirebaseUser]);

  const retryAuthService = useCallback(async () => {
    const ready = await checkAuthBackend();
    if (!ready) return false;
    const instance = await firebaseAuthReady();
    if (instance?.currentUser) await applyFirebaseUser(instance.currentUser, { forceRefresh: true });
    return true;
  }, [applyFirebaseUser, checkAuthBackend]);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    const instance = await firebaseAuthReady();
    return instance?.currentUser?.getIdToken(Boolean(forceRefresh)) || '';
  }, []);

  const value = useMemo(() => ({
    user,
    firebaseUser,
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    authBackend: isAuthenticated ? 'firebase-cloudflare' : null,
    authServiceError,
    authBackendStatus,
    firebaseConfigured: isFirebaseConfigured,
    verificationEmail,
    verificationPending: Boolean(firebaseUser && !firebaseUser.emailVerified),
    providers: providerIds(firebaseUser),
    signInWithEmail,
    signUpWithEmail,
    sendVerificationAgain,
    refreshEmailVerification,
    sendPasswordReset,
    loginWithGitHub,
    linkGitHub,
    unlinkGitHub,
    addPassword,
    changePassword,
    logout,
    checkUserAuth,
    retryAuthService,
    getIdToken,
    cooldownRemaining: () => ({ verification: cooldownRemaining(VERIFY_COOLDOWN_KEY), reset: cooldownRemaining(RESET_COOLDOWN_KEY) }),
  }), [
    addPassword, authBackendStatus, authChecked, authServiceError, changePassword, checkUserAuth, firebaseUser, getIdToken,
    isAuthenticated, isLoadingAuth, linkGitHub, loginWithGitHub, logout, refreshEmailVerification,
    retryAuthService, sendPasswordReset, sendVerificationAgain, signInWithEmail, signUpWithEmail, unlinkGitHub, user, verificationEmail,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
