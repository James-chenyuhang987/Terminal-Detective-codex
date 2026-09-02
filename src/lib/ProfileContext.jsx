import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';
import {
  applySettlementToProfile,
  clearPendingProfileWrite,
  diffProfileWrite,
  enqueuePendingProfileWrite,
  enqueuePendingSettlement,
  invokePlayerProfile,
  isRetryableProfileError,
  migrateProfileV2,
  readPendingProfileWrite,
  readPendingSettlements,
  removePendingSettlement,
} from '@/game/playerProfile';

const SESSION_KEY = 'td_profile_session_v2';
const POLL_MS = 20_000;
const ProfileContext = createContext(null);

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `web-${random}`;
}

function sessionIdForTab() {
  try {
    const current = sessionStorage.getItem(SESSION_KEY);
    if (current) return current;
    const created = createSessionId();
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch { return createSessionId(); }
}

function isSameProfile(a, b) {
  return Object.keys(diffProfileWrite(a, b)).length === 0;
}

function normalizeRemote(remote) {
  return migrateProfileV2(remote || {});
}

export function ProfileProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const sessionIdRef = useRef(sessionIdForTab());
  const pendingOwnerRef = useRef(user?.id || 'signed-in');
  const profileRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const mutationGenerationRef = useRef(0);
  const replayingRef = useRef(false);
  const replayingProfileRef = useRef(false);
  const mountedRef = useRef(true);
  const syncStatusRef = useRef('loading');
  const [profile, setProfile] = useState(null);
  const [account, setAccount] = useState(user || null);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [hasPendingWrite, setHasPendingWrite] = useState(false);

  const changeSyncStatus = useCallback((next) => {
    syncStatusRef.current = next;
    if (mountedRef.current) setSyncStatus(next);
  }, []);

  const commitProfile = useCallback((next) => {
    profileRef.current = next;
    if (mountedRef.current) setProfile(next);
  }, []);

  const commitError = useCallback((next) => {
    if (mountedRef.current) setError(next);
  }, []);

  const acceptPayload = useCallback((payload) => {
    const next = normalizeRemote(payload?.profile);
    if (payload?.account?.id) pendingOwnerRef.current = payload.account.id;
    commitProfile(next);
    if (payload?.account && mountedRef.current) setAccount(payload.account);
    return next;
  }, [commitProfile]);

  const claim = useCallback(async () => {
    changeSyncStatus('syncing');
    commitError(null);
    try {
      const payload = await invokePlayerProfile('claim_session', { session_id: sessionIdRef.current });
      const remote = normalizeRemote(payload.profile);
      let accepted = remote;
      if (!payload.compatibility_mode && !isSameProfile(remote, payload.profile)) {
        const migrated = await invokePlayerProfile('patch', {
          session_id: sessionIdRef.current,
          expected_revision: Number(payload.profile?.profile_revision) || 0,
          patch: diffProfileWrite(payload.profile, remote),
        });
        accepted = acceptPayload(migrated);
      } else {
        if (payload?.account?.id) pendingOwnerRef.current = payload.account.id;
        commitProfile(remote);
        if (mountedRef.current) setAccount(payload.account || user || null);
      }
      changeSyncStatus('online');
      return accepted;
    } catch (cause) {
      commitError(cause);
      changeSyncStatus(cause?.code === 'SESSION_TAKEN' ? 'readonly' : 'error');
      throw cause;
    }
  }, [acceptPayload, changeSyncStatus, commitError, commitProfile, user]);

  const refresh = useCallback(async () => {
    const generation = mutationGenerationRef.current;
    try {
      const payload = await invokePlayerProfile('status', { session_id: sessionIdRef.current });
      if (generation !== mutationGenerationRef.current) {
        return profileRef.current || normalizeRemote(payload?.profile);
      }
      const next = acceptPayload(payload);
      changeSyncStatus('online');
      commitError(null);
      return next;
    } catch (cause) {
      commitError(cause);
      changeSyncStatus(cause?.code === 'SESSION_TAKEN' ? 'readonly' : 'error');
      throw cause;
    }
  }, [acceptPayload, changeSyncStatus, commitError]);

  const runMutation = useCallback(async (reducer, { retryStale = true } = {}) => {
    if (syncStatusRef.current === 'readonly') {
      const cause = /** @type {Error & { code?: string }} */ (new Error('This device no longer owns the active session.'));
      cause.code = 'SESSION_TAKEN';
      throw cause;
    }
    const before = profileRef.current;
    if (!before) throw new Error('Profile is not loaded.');
    mutationGenerationRef.current += 1;
    const reduced = await reducer(before);
    if (reduced?.error) return reduced;
    const candidate = normalizeRemote(reduced?.profile || reduced || before);
    const patch = diffProfileWrite(before, candidate);
    if (!Object.keys(patch).length) return { ...reduced, profile: before, unchanged: true };
    const ownerId = pendingOwnerRef.current;
    const alreadyPending = Boolean(readPendingProfileWrite(undefined, ownerId));
    const journal = enqueuePendingProfileWrite(patch, undefined, ownerId);
    setHasPendingWrite(Boolean(journal?.stored));
    commitProfile(candidate);
    if (alreadyPending || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      if (!journal?.stored) {
        commitProfile(before);
        const cause = /** @type {Error & { code?: string }} */ (new Error('Local recovery storage is unavailable.'));
        cause.code = 'PROFILE_RECOVERY_UNAVAILABLE';
        commitError(cause);
        changeSyncStatus('error');
        throw cause;
      }
      changeSyncStatus('pending');
      return { ...(reduced?.profile ? reduced : {}), profile: candidate, queued: true };
    }
    changeSyncStatus('syncing');
    try {
      const payload = await invokePlayerProfile('patch', {
        session_id: sessionIdRef.current,
        expected_revision: Number(before.profile_revision) || 0,
        patch,
      });
      const saved = acceptPayload(payload);
      clearPendingProfileWrite(undefined, ownerId);
      setHasPendingWrite(false);
      changeSyncStatus('online');
      commitError(null);
      return { ...(reduced?.profile ? reduced : {}), profile: saved };
    } catch (cause) {
      if (cause?.code === 'STALE_PROFILE' && retryStale) {
        clearPendingProfileWrite(undefined, ownerId);
        setHasPendingWrite(false);
        const fresh = cause?.payload?.profile ? normalizeRemote(cause.payload.profile) : await refresh();
        commitProfile(fresh);
        return runMutation(reducer, { retryStale: false });
      }
      if (isRetryableProfileError(cause) && journal?.stored) {
        commitError(cause);
        changeSyncStatus('pending');
        return { ...(reduced?.profile ? reduced : {}), profile: candidate, queued: true };
      }
      clearPendingProfileWrite(undefined, ownerId);
      setHasPendingWrite(false);
      commitProfile(before);
      commitError(cause);
      changeSyncStatus(cause?.code === 'SESSION_TAKEN' ? 'readonly' : 'error');
      throw cause;
    }
  }, [acceptPayload, changeSyncStatus, commitError, commitProfile, refresh]);

  const mutate = useCallback((reducer, options) => {
    const work = () => runMutation(typeof reducer === 'function' ? reducer : () => reducer, options);
    const pending = queueRef.current.catch(() => {}).then(work);
    queueRef.current = pending;
    return pending;
  }, [runMutation]);

  const settle = useCallback(async (summary) => {
    enqueuePendingSettlement(summary, undefined, pendingOwnerRef.current);
    try {
      const result = await mutate(current => applySettlementToProfile(current, summary));
      removePendingSettlement(summary.run_id, undefined, pendingOwnerRef.current);
      return result;
    } catch (cause) {
      throw cause;
    }
  }, [mutate]);

  const replayPending = useCallback(async () => {
    if (replayingRef.current || !profileRef.current || syncStatusRef.current === 'readonly') return;
    replayingRef.current = true;
    try {
      for (const summary of readPendingSettlements(undefined, pendingOwnerRef.current)) {
        try {
          await mutate(current => applySettlementToProfile(current, summary));
          removePendingSettlement(summary.run_id, undefined, pendingOwnerRef.current);
        } catch { break; }
      }
    } finally { replayingRef.current = false; }
  }, [mutate]);

  const replayPendingProfileWrite = useCallback(async () => {
    const ownerId = pendingOwnerRef.current;
    const pending = readPendingProfileWrite(undefined, ownerId);
    setHasPendingWrite(Boolean(pending));
    if (!pending || replayingProfileRef.current || syncStatusRef.current === 'readonly') return profileRef.current;
    replayingProfileRef.current = true;
    changeSyncStatus('syncing');
    try {
      let basePayload = await invokePlayerProfile('status', { session_id: sessionIdRef.current });
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remote = normalizeRemote(basePayload.profile);
        const candidate = normalizeRemote({ ...remote, ...pending.patch });
        const patch = diffProfileWrite(remote, candidate);
        if (!Object.keys(patch).length) {
          clearPendingProfileWrite(undefined, ownerId);
          setHasPendingWrite(false);
          acceptPayload(basePayload);
          changeSyncStatus('online');
          commitError(null);
          return remote;
        }
        try {
          const savedPayload = await invokePlayerProfile('patch', {
            session_id: sessionIdRef.current,
            expected_revision: Number(remote.profile_revision) || 0,
            patch,
          });
          const saved = acceptPayload(savedPayload);
          clearPendingProfileWrite(undefined, ownerId);
          setHasPendingWrite(false);
          changeSyncStatus('online');
          commitError(null);
          return saved;
        } catch (cause) {
          if (cause?.code === 'STALE_PROFILE' && attempt === 0 && cause?.payload?.profile) {
            basePayload = { ...basePayload, profile: cause.payload.profile };
            continue;
          }
          throw cause;
        }
      }
      return profileRef.current;
    } catch (cause) {
      commitError(cause);
      if (cause?.code === 'SESSION_TAKEN') {
        changeSyncStatus('readonly');
      } else if (isRetryableProfileError(cause)) {
        changeSyncStatus('pending');
      } else {
        clearPendingProfileWrite(undefined, ownerId);
        setHasPendingWrite(false);
        changeSyncStatus('error');
      }
      throw cause;
    } finally {
      replayingProfileRef.current = false;
    }
  }, [acceptPayload, changeSyncStatus, commitError]);

  const takeOver = useCallback(async () => {
    const claimed = await claim();
    await replayPendingProfileWrite();
    await replayPending();
    return claimed;
  }, [claim, replayPending, replayPendingProfileWrite]);

  useEffect(() => {
    mountedRef.current = true;
    if (isAuthenticated) void claim()
      .then(() => replayPendingProfileWrite())
      .then(() => replayPending())
      .catch(() => {});
    return () => { mountedRef.current = false; };
  }, [claim, isAuthenticated, replayPending, replayPendingProfileWrite]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const synchronize = () => {
      if (syncStatusRef.current === 'syncing' || syncStatusRef.current === 'readonly') return;
      const profileSync = readPendingProfileWrite(undefined, pendingOwnerRef.current)
        ? replayPendingProfileWrite()
        : refresh();
      void profileSync.then(() => replayPending()).catch(() => {});
    };
    const timer = window.setInterval(synchronize, POLL_MS);
    const onOnline = () => synchronize();
    window.addEventListener('online', onOnline);
    return () => { window.clearInterval(timer); window.removeEventListener('online', onOnline); };
  }, [isAuthenticated, refresh, replayPending, replayPendingProfileWrite]);

  const value = useMemo(() => ({
    profile, account, syncStatus, error, mutate, refresh, takeOver, settle, hasPendingWrite,
    isReadOnly: syncStatus === 'readonly',
  }), [account, error, hasPendingWrite, mutate, profile, refresh, settle, syncStatus, takeOver]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within ProfileProvider');
  return context;
}

export function SessionReadOnlyBanner() {
  const { isReadOnly, takeOver, syncStatus } = useProfile();
  const { lang } = useLang();
  if (!isReadOnly) return null;
  return (
    <div role="alert" className="td-session-banner">
      <span>{lang === 'zh' ? '此账号已在新设备接管；当前页面仅可查看。' : 'This account is active on another device. This page is now read-only.'}</span>
      <button type="button" onClick={() => void takeOver()} disabled={syncStatus === 'syncing'}>
        {lang === 'zh' ? '接管此设备' : 'TAKE OVER THIS DEVICE'}
      </button>
    </div>
  );
}
