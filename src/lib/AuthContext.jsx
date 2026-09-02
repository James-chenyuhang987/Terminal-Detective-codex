import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  GithubAuthProvider,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  getRedirectResult,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onIdTokenChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  reauthenticateWithRedirect,
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
import { AUTH_FEEDBACK_CODES, AUTH_NOTICE_CODES, hasGitHubProvider, mapFirebaseAuthError, providerIds, validatePassword } from '@/lib/authErrors';
import { firebaseAuthReady, firebasePublicConfig, isFirebaseConfigured } from '@/lib/firebase';
import { createSessionBootstrap, isRecentAuthTime } from '@/lib/authSession';
import { setAuthTokenProvider } from '@/lib/authToken';
import {
  AUTH_THROTTLE_ACTIONS,
  authThrottleRemaining,
  clearAuthThrottle,
  recordAuthRateLimit,
  recordAuthSuccess,
} from '@/lib/authThrottle';
import { requestAuthReadiness } from '@/lib/authReadiness';

const AuthContext = createContext(null);
const REDIRECT_ACTION_KEY = 'td_firebase_redirect_action';
const AUTH_RECOVERY_POLL_MS = 20_000;
const RECOVERABLE_AUTH_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);

function feedbackError(code, cause) {
  const error = /** @type {Error & { feedbackCode?: string, httpStatus?: number, cause?: unknown }} */ (new Error(code));
  error.feedbackCode = code;
  error.cause = cause;
  return error;
}

function feedbackCodeFor(error) {
  return error?.feedbackCode || mapFirebaseAuthError(error);
}

function isRecoverableAuthFailure(code, error) {
  const status = Number(error?.httpStatus || error?.cause?.httpStatus) || 0;
  return code === AUTH_FEEDBACK_CODES.NETWORK
    || code === AUTH_FEEDBACK_CODES.BACKEND_NOT_READY
    || RECOVERABLE_AUTH_STATUSES.has(status);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function actionUrl(kind = 'verified') {
  const url = new URL(import.meta.env.BASE_URL || '/', window.location.origin);
  url.searchParams.set('auth', kind);
  return url.toString();
}

function requireThrottle(action) {
  const remaining = authThrottleRemaining(action);
  if (!remaining) return;
  throw Object.assign(feedbackError(AUTH_FEEDBACK_CODES.RATE_LIMITED), { remaining });
}

function consumeAuthReturn() {
  const url = new URL(window.location.href);
  const action = url.searchParams.get('auth') || '';
  if (action) {
    url.searchParams.delete('auth');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }
  return action;
}

function rememberRedirectAction(action) {
  try { sessionStorage.setItem(REDIRECT_ACTION_KEY, action); } catch { /* redirect can continue without a notice */ }
}

function consumeRedirectAction() {
  try {
    const action = sessionStorage.getItem(REDIRECT_ACTION_KEY) || '';
    sessionStorage.removeItem(REDIRECT_ACTION_KEY);
    return action;
  } catch {
    return '';
  }
}

function githubProvider() {
  const provider = new GithubAuthProvider();
  provider.addScope('read:user');
  provider.addScope('user:email');
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

/**
 * @param {string} token
 * @param {{ signal?: AbortSignal }} [options]
 */
async function requestCloudflareSession(token, { signal } = {}) {
  const response = await fetch(`${appParams.serverUrl}/api/auth/session`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    signal,
  });
  const payload = await readJson(response);
  if (!response.ok || !payload?.authenticated || !payload?.user) {
    const code = payload?.code || payload?.error || (response.status === 401 ? 'UNAUTHENTICATED' : 'AUTH_BACKEND_UNAVAILABLE');
    const feedbackCode = code === 'EMAIL_UNVERIFIED'
      ? AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED
      : code === 'FIREBASE_NOT_CONFIGURED'
        ? AUTH_FEEDBACK_CODES.CONFIG_MISSING
        : code === 'FIREBASE_PROFILE_CONFLICT'
          ? AUTH_FEEDBACK_CODES.PROFILE_CONFLICT
          : code === 'DATABASE_UNAVAILABLE' || code === 'AUTH_BACKEND_NOT_READY'
            ? AUTH_FEEDBACK_CODES.BACKEND_NOT_READY
            : response.status === 401
              ? AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL
              : AUTH_FEEDBACK_CODES.NETWORK;
    const error = feedbackError(feedbackCode, payload);
    error.httpStatus = response.status;
    throw error;
  }
  return payload;
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
  const [authNotice, setAuthNotice] = useState(null);
  const [authBackendReady, setAuthBackendReady] = useState(false);
  const mountedRef = useRef(true);
  const bootSequenceRef = useRef(0);
  const observedPrincipalRef = useRef('');
  const authCheckedRef = useRef(false);
  const authenticatedUidRef = useRef('');
  const sessionBootstrapRef = useRef(null);
  const sessionRetryUidRef = useRef('');
  const readinessPromiseRef = useRef(null);
  const authBackendReadyRef = useRef(false);
  if (!sessionBootstrapRef.current) sessionBootstrapRef.current = createSessionBootstrap(requestCloudflareSession);

  const ensureAuthBackend = useCallback(async () => {
    if (!isFirebaseConfigured) throw feedbackError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
    if (authBackendReadyRef.current) return true;
    if (readinessPromiseRef.current) return readinessPromiseRef.current;
    const request = requestAuthReadiness(appParams.serverUrl, firebasePublicConfig.projectId)
      .then(() => {
        authBackendReadyRef.current = true;
        if (mountedRef.current) {
          setAuthBackendReady(true);
          setAuthServiceError('');
        }
        return true;
      })
      .catch(error => {
        const backendFailure = error?.code === 'AUTH_BACKEND_NOT_READY'
          || error?.code === 'FIREBASE_PROJECT_MISMATCH';
        const code = backendFailure ? AUTH_FEEDBACK_CODES.BACKEND_NOT_READY : AUTH_FEEDBACK_CODES.NETWORK;
        if (mountedRef.current) {
          setAuthBackendReady(false);
          setAuthServiceError(code);
        }
        throw feedbackError(code, error);
      })
      .finally(() => {
        if (readinessPromiseRef.current === request) readinessPromiseRef.current = null;
      });
    readinessPromiseRef.current = request;
    return request;
  }, []);

  const applyFirebaseUser = useCallback(async (nextUser, {
    forceRefresh = false,
    throwOnFailure = false,
  } = {}) => {
    const nextPrincipal = nextUser?.uid
      ? `${nextUser.uid}:${nextUser.emailVerified ? 'verified' : 'unverified'}`
      : '';
    if (observedPrincipalRef.current !== nextPrincipal || (nextPrincipal && forceRefresh)) {
      observedPrincipalRef.current = nextPrincipal;
      bootSequenceRef.current += 1;
      sessionBootstrapRef.current.clear();
    }
    const sequence = bootSequenceRef.current;
    const previousUid = authenticatedUidRef.current;
    const preserveSession = Boolean(nextUser?.uid && previousUid === nextUser.uid);
    setFirebaseUser(nextUser || null);
    setVerificationEmail(nextUser?.email || '');
    setAuthServiceError('');
    if (!nextUser) {
      authenticatedUidRef.current = '';
      sessionRetryUidRef.current = '';
      setUser(null);
      setIsAuthenticated(false);
      return null;
    }
    if (!nextUser.emailVerified) {
      authenticatedUidRef.current = '';
      sessionRetryUidRef.current = '';
      setUser(null);
      setIsAuthenticated(false);
      setAuthServiceError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      return null;
    }
    if (!preserveSession) {
      setUser(null);
      setIsAuthenticated(false);
    }
    try {
      const session = await sessionBootstrapRef.current.run(nextUser, { forceRefresh });
      if (!mountedRef.current || sequence !== bootSequenceRef.current) return null;
      authenticatedUidRef.current = nextUser.uid;
      sessionRetryUidRef.current = '';
      setUser(session.user);
      setIsAuthenticated(true);
      return session.user;
    } catch (error) {
      if (!mountedRef.current || sequence !== bootSequenceRef.current) return null;
      const code = error?.feedbackCode || AUTH_FEEDBACK_CODES.NETWORK;
      const recoverable = isRecoverableAuthFailure(code, error);
      const keepCurrentSession = preserveSession && recoverable;
      sessionRetryUidRef.current = recoverable ? nextUser.uid : '';
      if (!keepCurrentSession) {
        authenticatedUidRef.current = '';
        setUser(null);
        setIsAuthenticated(false);
      } else {
        setAuthNotice({ kind: 'error', code });
      }
      setAuthServiceError(code);
      if (throwOnFailure) throw feedbackError(code, error);
      return null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;
    if (!isFirebaseConfigured) {
      setAuthServiceError(AUTH_FEEDBACK_CODES.CONFIG_MISSING);
      setAuthChecked(true);
      setIsLoadingAuth(false);
      return () => { mountedRef.current = false; };
    }

    let unsubscribe = () => {};
    let authReturn = consumeAuthReturn();
    const redirectAction = consumeRedirectAction();
    let authInstance = null;
    const retryAuth = () => {
      const current = authInstance?.currentUser;
      if (cancelled || !current?.emailVerified) {
        if (!authBackendReadyRef.current) void ensureAuthBackend().catch(() => {});
        return;
      }
      if (authBackendReadyRef.current && sessionRetryUidRef.current !== current.uid) return;
      void ensureAuthBackend()
        .then(() => applyFirebaseUser(current))
        .catch(() => {
          sessionRetryUidRef.current = current.uid;
        });
    };
    window.addEventListener('online', retryAuth);
    const recoveryTimer = window.setInterval(retryAuth, AUTH_RECOVERY_POLL_MS);
    void ensureAuthBackend().catch(() => {});
    void firebaseAuthReady().then(async auth => {
      if (!auth || cancelled || !mountedRef.current) return;
      authInstance = auth;
      setAuthTokenProvider(force => auth.currentUser?.getIdToken(Boolean(force)) || '');
      try {
        const redirectResult = await getRedirectResult(auth);
        if (!cancelled && mountedRef.current && redirectResult && redirectAction === 'github-link') {
          setAuthNotice({ kind: 'success', code: AUTH_NOTICE_CODES.GITHUB_LINKED });
        } else if (!cancelled && mountedRef.current && redirectResult && redirectAction === 'reauthenticate') {
          setAuthNotice({ kind: 'success', code: AUTH_NOTICE_CODES.REAUTHENTICATED });
        }
      } catch (error) {
        if (!cancelled && mountedRef.current) {
          const code = feedbackCodeFor(error);
          setAuthServiceError(code);
          setAuthNotice({ kind: 'error', code });
        }
      }
      unsubscribe = onIdTokenChanged(auth, async nextUser => {
        if (cancelled) return;
        const shouldBlock = !authCheckedRef.current
          || Boolean(nextUser?.emailVerified && authenticatedUidRef.current !== nextUser.uid);
        if (shouldBlock) setIsLoadingAuth(true);
        if (authReturn === 'verified' && nextUser && !nextUser.emailVerified) {
          try {
            await reload(nextUser);
            if (nextUser.emailVerified) await nextUser.getIdToken(true);
          } catch {
            // The verification panel remains available as a safe manual retry.
          }
          if (!nextUser.emailVerified) {
            setAuthNotice({ kind: 'error', code: AUTH_NOTICE_CODES.VERIFICATION_INCOMPLETE });
          }
        } else if (authReturn === 'password-reset') {
          setAuthNotice({ kind: 'success', code: AUTH_NOTICE_CODES.PASSWORD_RESET_COMPLETE });
        }
        authReturn = '';
        if (!nextUser?.emailVerified) {
          await applyFirebaseUser(nextUser);
        } else {
          try {
            await ensureAuthBackend();
            await applyFirebaseUser(nextUser);
          } catch (error) {
            if (!cancelled && mountedRef.current) {
              const code = feedbackCodeFor(error);
              setFirebaseUser(nextUser);
              setVerificationEmail(nextUser.email || '');
              setAuthServiceError(code);
              sessionRetryUidRef.current = nextUser.uid;
              if (authenticatedUidRef.current !== nextUser.uid) {
                authenticatedUidRef.current = '';
                setUser(null);
                setIsAuthenticated(false);
              }
            }
          }
        }
        if (!cancelled && mountedRef.current) {
          authCheckedRef.current = true;
          setAuthChecked(true);
          if (shouldBlock) setIsLoadingAuth(false);
        }
      });
    }).catch(error => {
      if (!cancelled && mountedRef.current) {
        setAuthServiceError(feedbackCodeFor(error));
        authCheckedRef.current = true;
        setAuthChecked(true);
        setIsLoadingAuth(false);
      }
    });

    return () => {
      cancelled = true;
      mountedRef.current = false;
      window.clearInterval(recoveryTimer);
      window.removeEventListener('online', retryAuth);
      unsubscribe();
      sessionBootstrapRef.current.clear();
      setAuthTokenProvider(null);
    };
  }, [applyFirebaseUser, ensureAuthBackend]);

  const configuredAuth = useCallback(async () => {
    return requireConfigured(await firebaseAuthReady());
  }, []);

  const auth = useCallback(async () => {
    await ensureAuthBackend();
    return configuredAuth();
  }, [configuredAuth, ensureAuthBackend]);

  const ensureRecentLogin = useCallback(async (current, password = '') => {
    try {
      const token = await getIdTokenResult(current);
      if (isRecentAuthTime(token.authTime)) return true;
      const providers = providerIds(current);
      if (password && providers.includes('password') && current.email) {
        await reauthenticateWithCredential(current, EmailAuthProvider.credential(current.email, String(password)));
        return true;
      }
      if (providers.includes('github.com')) {
        const provider = githubProvider();
        try {
          await reauthenticateWithPopup(current, provider);
          return true;
        } catch (error) {
          if (feedbackCodeFor(error) !== AUTH_FEEDBACK_CODES.POPUP_BLOCKED) throw error;
          rememberRedirectAction('reauthenticate');
          await reauthenticateWithRedirect(current, provider);
          return false;
        }
      }
      throw feedbackError(AUTH_FEEDBACK_CODES.RECENT_LOGIN_REQUIRED);
    } catch (error) {
      if (error?.feedbackCode) throw error;
      throw feedbackError(feedbackCodeFor(error), error);
    }
  }, []);

  const signInWithEmail = useCallback(async (email, password) => {
    const throttleAction = AUTH_THROTTLE_ACTIONS.EMAIL_LOGIN;
    requireThrottle(throttleAction);
    try {
      const instance = await auth();
      const credential = await signInWithEmailAndPassword(instance, normalizeEmail(email), String(password || ''));
      if (!credential.user.emailVerified) {
        setVerificationEmail(credential.user.email || normalizeEmail(email));
        throw feedbackError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      }
      await applyFirebaseUser(credential.user, { forceRefresh: true, throwOnFailure: true });
      clearAuthThrottle(throttleAction);
      return credential.user;
    } catch (error) {
      if (error?.feedbackCode) throw error;
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) recordAuthRateLimit(throttleAction);
      throw feedbackError(code, error);
    }
  }, [applyFirebaseUser, auth]);

  const signUpWithEmail = useCallback(async (email, password) => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    const registerAction = AUTH_THROTTLE_ACTIONS.REGISTER;
    const verifyAction = AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL;
    requireThrottle(registerAction);
    let userCreated = false;
    try {
      const instance = await configuredAuth();
      const credential = await createUserWithEmailAndPassword(instance, normalizeEmail(email), String(password));
      userCreated = true;
      setFirebaseUser(credential.user);
      setVerificationEmail(credential.user.email || normalizeEmail(email));
      setAuthServiceError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
      await sendEmailVerification(credential.user, { url: actionUrl('verified'), handleCodeInApp: false });
      clearAuthThrottle(registerAction);
      recordAuthSuccess(verifyAction);
      return credential.user;
    } catch (error) {
      if (error?.feedbackCode) throw error;
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) recordAuthRateLimit(userCreated ? verifyAction : registerAction);
      throw feedbackError(code, error);
    }
  }, [configuredAuth]);

  const sendVerificationAgain = useCallback(async () => {
    const throttleAction = AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL;
    requireThrottle(throttleAction);
    const instance = await configuredAuth();
    const current = instance.currentUser;
    if (!current) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    try {
      await sendEmailVerification(current, { url: actionUrl('verified'), handleCodeInApp: false });
      recordAuthSuccess(throttleAction);
      return true;
    } catch (error) {
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) recordAuthRateLimit(throttleAction);
      throw feedbackError(code, error);
    }
  }, [configuredAuth]);

  const refreshEmailVerification = useCallback(async () => {
    const instance = await auth();
    const current = instance.currentUser;
    if (!current) return false;
    await reload(current);
    if (!current.emailVerified) throw feedbackError(AUTH_FEEDBACK_CODES.EMAIL_UNVERIFIED);
    await applyFirebaseUser(current, { forceRefresh: true, throwOnFailure: true });
    return true;
  }, [applyFirebaseUser, auth]);

  const sendPasswordReset = useCallback(async email => {
    const throttleAction = AUTH_THROTTLE_ACTIONS.RESET_PASSWORD;
    requireThrottle(throttleAction);
    try {
      const instance = await configuredAuth();
      await sendPasswordResetEmail(instance, normalizeEmail(email), { url: actionUrl('password-reset'), handleCodeInApp: false });
    } catch (error) {
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.INVALID_EMAIL) throw feedbackError(code, error);
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) {
        recordAuthRateLimit(throttleAction);
        throw feedbackError(code, error);
      }
      if (code !== AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL) throw feedbackError(code, error);
      // Account enumeration protection: unknown and known accounts receive the same UI response.
    }
    recordAuthSuccess(throttleAction);
    return true;
  }, [configuredAuth]);

  const loginWithGitHub = useCallback(async () => {
    const throttleAction = AUTH_THROTTLE_ACTIONS.GITHUB_LOGIN;
    requireThrottle(throttleAction);
    const instance = await auth();
    const provider = githubProvider();
    try {
      const result = await signInWithPopup(instance, provider);
      await applyFirebaseUser(result.user, { forceRefresh: true, throwOnFailure: true });
      clearAuthThrottle(throttleAction);
      return result.user;
    } catch (error) {
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.POPUP_BLOCKED) {
        try {
          rememberRedirectAction('github-login');
          await signInWithRedirect(instance, provider);
          return null;
        } catch (redirectError) {
          throw feedbackError(feedbackCodeFor(redirectError), redirectError);
        }
      }
      if (code === AUTH_FEEDBACK_CODES.RATE_LIMITED) recordAuthRateLimit(throttleAction);
      throw feedbackError(code, error);
    }
  }, [applyFirebaseUser, auth]);

  const linkGitHub = useCallback(async (currentPassword = '') => {
    const instance = await auth();
    if (!instance.currentUser) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    if (hasGitHubProvider(instance.currentUser)) return instance.currentUser;
    if (!await ensureRecentLogin(instance.currentUser, currentPassword)) return null;
    const provider = githubProvider();
    try {
      const result = await linkWithPopup(instance.currentUser, provider);
      await applyFirebaseUser(result.user, { forceRefresh: true, throwOnFailure: true });
      return result.user;
    } catch (error) {
      const code = feedbackCodeFor(error);
      if (code === AUTH_FEEDBACK_CODES.POPUP_BLOCKED) {
        try {
          rememberRedirectAction('github-link');
          await linkWithRedirect(instance.currentUser, provider);
          return null;
        } catch (redirectError) {
          throw feedbackError(feedbackCodeFor(redirectError), redirectError);
        }
      }
      throw feedbackError(code, error);
    }
  }, [applyFirebaseUser, auth, ensureRecentLogin]);

  const unlinkGitHub = useCallback(async (currentPassword = '') => {
    const instance = await auth();
    const current = instance.currentUser;
    if (!current) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    if (providerIds(current).length <= 1) throw feedbackError(AUTH_FEEDBACK_CODES.LAST_PROVIDER);
    if (!await ensureRecentLogin(current, currentPassword)) return null;
    const next = await unlink(current, 'github.com');
    await applyFirebaseUser(next, { forceRefresh: true, throwOnFailure: true });
    return next;
  }, [applyFirebaseUser, auth, ensureRecentLogin]);

  const addPassword = useCallback(async password => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    const instance = await auth();
    const current = instance.currentUser;
    if (!current?.email) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_EMAIL);
    try {
      if (!await ensureRecentLogin(current)) return null;
      const credential = EmailAuthProvider.credential(current.email, String(password));
      const result = await linkWithCredential(current, credential);
      await applyFirebaseUser(result.user, { forceRefresh: true, throwOnFailure: true });
      return result.user;
    } catch (error) {
      throw feedbackError(feedbackCodeFor(error), error);
    }
  }, [applyFirebaseUser, auth, ensureRecentLogin]);

  const changePassword = useCallback(async (password, currentPassword = '') => {
    const validation = validatePassword(password);
    if (!validation.valid) throw feedbackError(AUTH_FEEDBACK_CODES.WEAK_PASSWORD);
    const instance = await auth();
    if (!instance.currentUser) throw feedbackError(AUTH_FEEDBACK_CODES.INVALID_CREDENTIAL);
    try {
      if (!await ensureRecentLogin(instance.currentUser, currentPassword)) return false;
      await updatePassword(instance.currentUser, String(password));
      return true;
    } catch (error) {
      throw feedbackError(feedbackCodeFor(error), error);
    }
  }, [auth, ensureRecentLogin]);

  const logout = useCallback(async () => {
    const instance = await firebaseAuthReady();
    try {
      if (instance) await signOut(instance);
    } catch (error) {
      throw feedbackError(feedbackCodeFor(error), error);
    }
    bootSequenceRef.current += 1;
    observedPrincipalRef.current = '';
    sessionBootstrapRef.current.clear();
    authenticatedUidRef.current = '';
    sessionRetryUidRef.current = '';
    setFirebaseUser(null);
    setUser(null);
    setIsAuthenticated(false);
    setAuthChecked(true);
    setAuthServiceError('');
    setAuthNotice(null);
  }, []);

  const checkUserAuth = useCallback(async () => {
    const instance = await firebaseAuthReady();
    if (!instance?.currentUser) return null;
    await reload(instance.currentUser);
    return applyFirebaseUser(instance.currentUser, { forceRefresh: true });
  }, [applyFirebaseUser]);

  const getIdToken = useCallback(async (forceRefresh = false) => {
    const instance = await firebaseAuthReady();
    return instance?.currentUser?.getIdToken(Boolean(forceRefresh)) || '';
  }, []);

  const clearAuthNotice = useCallback(() => setAuthNotice(null), []);
  const getCooldownRemaining = useCallback(() => ({
    verification: authThrottleRemaining(AUTH_THROTTLE_ACTIONS.VERIFY_EMAIL),
    reset: authThrottleRemaining(AUTH_THROTTLE_ACTIONS.RESET_PASSWORD),
    emailLogin: authThrottleRemaining(AUTH_THROTTLE_ACTIONS.EMAIL_LOGIN),
    registration: authThrottleRemaining(AUTH_THROTTLE_ACTIONS.REGISTER),
    github: authThrottleRemaining(AUTH_THROTTLE_ACTIONS.GITHUB_LOGIN),
  }), []);

  const value = useMemo(() => ({
    user,
    firebaseUser,
    isAuthenticated,
    isLoadingAuth,
    authChecked,
    authBackend: isAuthenticated ? 'firebase-cloudflare' : null,
    authServiceError,
    authNotice,
    authBackendReady,
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
    clearAuthNotice,
    checkUserAuth,
    getIdToken,
    cooldownRemaining: getCooldownRemaining,
  }), [
    addPassword, authBackendReady, authChecked, authNotice, authServiceError, changePassword, checkUserAuth, clearAuthNotice, firebaseUser, getCooldownRemaining, getIdToken,
    isAuthenticated, isLoadingAuth, linkGitHub, loginWithGitHub, logout, refreshEmailVerification,
    sendPasswordReset, sendVerificationAgain, signInWithEmail, signUpWithEmail, unlinkGitHub, user, verificationEmail,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
