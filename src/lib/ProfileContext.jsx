import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';
import { clearPendingSettlements, invokePlayerProfile, normalizeProfile } from '@/game/playerProfile';
import { clearProfileOperations } from '@/game/profileWal';
import {
  appendProfileCommand, clearProfileCommands, hasLegacyProfileWrites,
  profileCommand, readProfileCommands, removeProfileCommand,
} from '@/game/profileCommands';
import { profileRecoveryDetails } from '@/lib/profileRecovery.js';
import { createSingleFlight } from '@/lib/singleFlight.js';

const POLL_MS = 20_000;
const TRANSIENT_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);
const ProfileContext = createContext(null);

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `web-${random}`;
}

function normalizeRemote(remote) {
  return normalizeProfile(remote || {}, undefined, { regenerateEnergy: false });
}

function profileError(code, message = code) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function isTransient(cause) {
  return (cause?.status !== undefined && TRANSIENT_STATUSES.has(Number(cause.status)))
    || ['PROFILE_NETWORK', 'PROFILE_TIMEOUT', 'DATABASE_UNAVAILABLE', 'FIREBASE_KEYS_UNAVAILABLE']
      .includes(cause?.code);
}

function isStorageFailure(cause) {
  return cause?.code === 'PROFILE_WAL_UNAVAILABLE';
}

function isRecoveryFailure(cause) {
  return cause?.code === 'PROFILE_LEGACY_WRITES'
    || cause?.code === 'PROFILE_AUTHORITY_REQUIRED'
    || cause?.code === 'INVALID_COMMAND'
    || cause?.code === 'PROFILE_WAL_CORRUPT'
    || cause?.code === 'PROFILE_WAL_FULL'
    || cause?.code === 'PROFILE_WAL_DIVERGED'
    || cause?.code === 'PROFILE_WAL_OPERATION_REUSED'
    || cause?.code === 'PROFILE_DATA_CORRUPT'
    || cause?.code === 'STALE_PROFILE'
    || cause?.code === 'OPERATION_ID_REUSED';
}

export function ProfileProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const sessionIdRef = useRef(createSessionId());
  const ownerRef = useRef('');
  const profileRef = useRef(null);
  const activeRunRef = useRef(null);
  const queueRef = useRef(Promise.resolve());
  const lifecycleRef = useRef(0);
  const requestControllersRef = useRef(new Set());
  const replayFlightRef = useRef(createSingleFlight());
  const claimFlightRef = useRef(createSingleFlight());
  const mountedRef = useRef(true);
  const syncStatusRef = useRef('loading');
  const [profile, setProfile] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [account, setAccount] = useState(user || null);
  const [syncStatus, setSyncStatus] = useState('loading');
  const [pendingCount, setPendingCount] = useState(0);
  const [error, setError] = useState(null);

  const isCurrentOwner = useCallback((ownerUid, generation) => (
    mountedRef.current
    && ownerRef.current === ownerUid
    && lifecycleRef.current === generation
  ), []);

  const changeSyncStatus = useCallback((next, ownerUid = ownerRef.current, generation = lifecycleRef.current) => {
    if (!isCurrentOwner(ownerUid, generation)) return;
    syncStatusRef.current = next;
    setSyncStatus(next);
  }, [isCurrentOwner]);

  const commitProfile = useCallback((next, ownerUid = ownerRef.current, generation = lifecycleRef.current) => {
    if (!isCurrentOwner(ownerUid, generation)) return false;
    profileRef.current = next;
    setProfile(next);
    return true;
  }, [isCurrentOwner]);

  const commitError = useCallback((next, ownerUid = ownerRef.current, generation = lifecycleRef.current) => {
    if (isCurrentOwner(ownerUid, generation)) setError(next);
  }, [isCurrentOwner]);

  const updatePendingCount = useCallback((ownerUid, generation) => {
    if (!isCurrentOwner(ownerUid, generation)) return [];
    if (hasLegacyProfileWrites(ownerUid)) throw profileError('PROFILE_LEGACY_WRITES');
    const entries = readProfileCommands(ownerUid);
    setPendingCount(entries.length);
    return entries;
  }, [isCurrentOwner]);

  const invokeOwned = useCallback(async (action, payload, ownerUid, generation) => {
    if (!isCurrentOwner(ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    const controller = new AbortController();
    requestControllersRef.current.add(controller);
    try {
      return await invokePlayerProfile(action, payload, {
        signal: controller.signal,
      });
    } finally {
      requestControllersRef.current.delete(controller);
    }
  }, [isCurrentOwner]);

  const acceptPayload = useCallback((payload, ownerUid, generation) => {
    if (payload?.authority_version !== 1) throw profileError('PROFILE_AUTHORITY_REQUIRED');
    if (payload?.account?.id && payload.account.id !== ownerUid) {
      throw profileError('PROFILE_OWNER_MISMATCH', 'The profile response belongs to another account.');
    }
    if (!payload?.profile || typeof payload.profile !== 'object' || Array.isArray(payload.profile)
      || !Number.isSafeInteger(payload.profile.profile_revision) || payload.profile.profile_revision < 0) {
      throw profileError('PROFILE_DATA_CORRUPT');
    }
    if (!Object.hasOwn(payload, 'active_run') || (payload.active_run !== null
      && (typeof payload.active_run !== 'object' || Array.isArray(payload.active_run)
        || typeof payload.active_run.id !== 'string' || !payload.active_run.id
        || !Number.isSafeInteger(payload.active_run.revision) || payload.active_run.revision < 0))) {
      throw profileError('PROFILE_DATA_CORRUPT');
    }
    if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
    if (payload.profile.profile_revision < (profileRef.current?.profile_revision ?? 0)) return profileRef.current;
    const next = normalizeRemote(payload.profile);
    if (!commitProfile(next, ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    if (payload?.account) setAccount(payload.account);
    // Investigation commands advance the run revision independently of the profile.
    const currentRun = activeRunRef.current;
    if (!currentRun || currentRun.id !== payload.active_run?.id || currentRun.revision <= payload.active_run.revision) {
      activeRunRef.current = payload.active_run;
      setActiveRun(payload.active_run);
    }
    return next;
  }, [commitProfile, isCurrentOwner]);

  const setFailureState = useCallback((cause, ownerUid, generation) => {
    if (['PROFILE_SYNC_BLOCKED', 'PROFILE_REQUEST_CANCELLED'].includes(cause?.code)) return;
    commitError(cause, ownerUid, generation);
    if (cause?.code === 'SESSION_TAKEN' || cause?.code === 'PROFILE_OWNER_MISMATCH') {
      changeSyncStatus('readonly', ownerUid, generation);
    } else if (isStorageFailure(cause)) {
      changeSyncStatus('storage_unavailable', ownerUid, generation);
    } else if (isRecoveryFailure(cause)) {
      changeSyncStatus('recovery', ownerUid, generation);
    } else if (!['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
      changeSyncStatus('error', ownerUid, generation);
    }
  }, [changeSyncStatus, commitError]);

  const transmitEntry = useCallback(async (entry, ownerUid, generation) => {
    if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
    try {
      const payload = await invokeOwned('command', {
        session_id: sessionIdRef.current,
        operation_id: entry.operationId,
        expected_revision: entry.baseRevision,
        command: entry.command,
      }, ownerUid, generation);
      if (!payload?.result || typeof payload.result !== 'object' || Array.isArray(payload.result)) {
        throw profileError('PROFILE_DATA_CORRUPT');
      }
      if (['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
        throw profileError('PROFILE_SYNC_BLOCKED');
      }
      const saved = acceptPayload(payload, ownerUid, generation);
      removeProfileCommand(ownerUid, entry.operationId);
      updatePendingCount(ownerUid, generation);
      commitError(null, ownerUid, generation);
      changeSyncStatus('online', ownerUid, generation);
      return { ...payload.result, result: payload.result, profile: saved, pending: false };
    } catch (cause) {
      if (!isCurrentOwner(ownerUid, generation)) throw cause;
      if (isRecoveryFailure(cause) || isStorageFailure(cause)
        || cause?.code === 'SESSION_TAKEN' || cause?.code === 'PROFILE_OWNER_MISMATCH') {
        setFailureState(cause, ownerUid, generation);
        throw cause;
      }
      if (isTransient(cause)) {
        commitError(cause, ownerUid, generation);
        changeSyncStatus('pending', ownerUid, generation);
        throw profileError('PROFILE_COMMAND_PENDING');
      }
      setFailureState(cause, ownerUid, generation);
      throw cause;
    }
  }, [acceptPayload, changeSyncStatus, commitError, invokeOwned, isCurrentOwner, setFailureState, updatePendingCount]);

  const replayWal = useCallback((ownerUid = ownerRef.current, generation = lifecycleRef.current) => (
    replayFlightRef.current.run(`${generation}:${ownerUid}`, async () => {
      if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
      if (['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
        throw profileError(syncStatusRef.current === 'readonly' ? 'SESSION_TAKEN' : 'PROFILE_SYNC_BLOCKED');
      }
      try {
        const entries = updatePendingCount(ownerUid, generation);
        if (!entries.length) return null;
        changeSyncStatus('syncing', ownerUid, generation);
        return await transmitEntry(entries[0], ownerUid, generation);
      } catch (cause) {
        if (cause?.code !== 'PROFILE_COMMAND_PENDING' && isCurrentOwner(ownerUid, generation)) {
          setFailureState(cause, ownerUid, generation);
        }
        throw cause;
      }
    })
  ), [changeSyncStatus, isCurrentOwner, setFailureState, transmitEntry, updatePendingCount]);

  const performClaim = useCallback(async (ownerUid, generation) => {
    if (!ownerUid) throw profileError('PROFILE_OWNER_MISSING', 'No authenticated profile owner.');
    changeSyncStatus('syncing', ownerUid, generation);
    commitError(null, ownerUid, generation);
    try {
      const payload = await invokeOwned('claim_session', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      acceptPayload(payload, ownerUid, generation);
      const remaining = updatePendingCount(ownerUid, generation);
      changeSyncStatus(remaining.length ? 'pending' : 'online', ownerUid, generation);
      return profileRef.current;
    } catch (cause) {
      if (isCurrentOwner(ownerUid, generation)) setFailureState(cause, ownerUid, generation);
      throw cause;
    }
  }, [
    acceptPayload,
    changeSyncStatus,
    commitError,
    invokeOwned,
    isCurrentOwner,
    setFailureState,
    updatePendingCount,
  ]);

  const claim = useCallback(() => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    return claimFlightRef.current.run(
      `${generation}:${ownerUid}`,
      () => performClaim(ownerUid, generation),
    );
  }, [performClaim]);

  const loadProfile = useCallback(() => (
    profileRef.current ? Promise.resolve(profileRef.current) : claim()
  ), [claim]);

  const refresh = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    try {
      if (['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
        throw profileError('PROFILE_SYNC_BLOCKED');
      }
      const pending = updatePendingCount(ownerUid, generation);
      if (pending.length) {
        await replayWal(ownerUid, generation);
        return profileRef.current;
      }
      const payload = await invokeOwned('status', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      if (['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
        throw profileError('PROFILE_SYNC_BLOCKED');
      }
      const currentPending = updatePendingCount(ownerUid, generation);
      const next = acceptPayload(payload, ownerUid, generation);
      changeSyncStatus(currentPending.length ? 'pending' : 'online', ownerUid, generation);
      commitError(null, ownerUid, generation);
      return next;
    } catch (cause) {
      if (isCurrentOwner(ownerUid, generation)) {
        if (cause?.code === 'PROFILE_COMMAND_PENDING' || (isTransient(cause) && pendingCount > 0)) changeSyncStatus('pending', ownerUid, generation);
        else setFailureState(cause, ownerUid, generation);
      }
      throw cause;
    }
  }, [
    acceptPayload,
    changeSyncStatus,
    commitError,
    invokeOwned,
    isCurrentOwner,
    pendingCount,
    replayWal,
    setFailureState,
    updatePendingCount,
  ]);

  const runCommand = useCallback(async (intent, ownerUid, generation) => {
    if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
    if (['loading', 'readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
      throw profileError(syncStatusRef.current === 'readonly' ? 'SESSION_TAKEN' : 'PROFILE_SYNC_BLOCKED');
    }
    if (!ownerUid || !profileRef.current) throw profileError('PROFILE_NOT_LOADED');
    try {
      const existing = updatePendingCount(ownerUid, generation);
      if (existing.length) {
        const retryingSameIntent = JSON.stringify(existing[0].command) === JSON.stringify(intent);
        const recovered = await replayWal(ownerUid, generation);
        if (retryingSameIntent && recovered) return recovered;
      }
      if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
      appendProfileCommand({
        ownerUid, lineageId: sessionIdRef.current, command: intent,
        baseRevision: Number(profileRef.current.profile_revision) || 0,
      });
      updatePendingCount(ownerUid, generation);
      changeSyncStatus('pending', ownerUid, generation);
      let confirmed = await replayWal(ownerUid, generation);
      // A poll may have inspected an empty journal just before this append.
      if (!confirmed) confirmed = await replayWal(ownerUid, generation);
      if (!confirmed) throw profileError('PROFILE_COMMAND_PENDING');
      return confirmed;
    } catch (cause) {
      if (cause?.code !== 'PROFILE_COMMAND_PENDING' && isCurrentOwner(ownerUid, generation)) {
        setFailureState(cause, ownerUid, generation);
      }
      throw cause;
    }
  }, [changeSyncStatus, isCurrentOwner, replayWal, setFailureState, updatePendingCount]);

  const command = useCallback((type, args = {}) => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    const intent = profileCommand(type, args);
    const pending = queueRef.current.catch(() => {}).then(() => runCommand(intent, ownerUid, generation));
    queueRef.current = pending;
    return pending;
  }, [runCommand]);

  const settle = useCallback((summary) => command('settle_case', { run_id: summary?.run_id }), [command]);
  const replayPending = useCallback(() => replayWal(), [replayWal]);

  const takeOver = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    const previousStatus = syncStatusRef.current;
    try {
      await claim();
    } catch (cause) {
      if (previousStatus === 'readonly' && isCurrentOwner(ownerUid, generation)) {
        changeSyncStatus('readonly', ownerUid, generation);
      }
      throw cause;
    }
    await replayPending();
    return profileRef.current;
  }, [changeSyncStatus, claim, isCurrentOwner, replayPending]);

  const discardPendingChanges = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    try {
      const payload = await invokeOwned('status', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      const next = acceptPayload(payload, ownerUid, generation);
      clearProfileOperations(ownerUid);
      clearProfileCommands(ownerUid);
      clearPendingSettlements(undefined, ownerUid);
      setPendingCount(0);
      commitError(null, ownerUid, generation);
      changeSyncStatus('online', ownerUid, generation);
      return next;
    } catch (cause) {
      if (isCurrentOwner(ownerUid, generation)) setFailureState(cause, ownerUid, generation);
      throw cause;
    }
  }, [acceptPayload, changeSyncStatus, commitError, invokeOwned, isCurrentOwner, setFailureState]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycleRef.current += 1;
      for (const controller of requestControllersRef.current) controller.abort();
      requestControllersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    lifecycleRef.current += 1;
    const generation = lifecycleRef.current;
    for (const controller of requestControllersRef.current) controller.abort();
    requestControllersRef.current.clear();
    queueRef.current = Promise.resolve();
    replayFlightRef.current.clear();
    claimFlightRef.current.clear();
    const ownerUid = isAuthenticated && user?.id ? user.id : '';
    ownerRef.current = ownerUid;
    profileRef.current = null;
    activeRunRef.current = null;
    syncStatusRef.current = ownerUid ? 'loading' : 'offline';
    setProfile(null);
    setActiveRun(null);
    setAccount(user || null);
    setError(null);
    setPendingCount(0);
    setSyncStatus(syncStatusRef.current);
    if (ownerUid) {
      void claim().then(() => replayPending()).catch(() => {});
    }
    return () => {
      if (lifecycleRef.current === generation) lifecycleRef.current += 1;
      for (const controller of requestControllersRef.current) controller.abort();
      requestControllersRef.current.clear();
    };
  }, [claim, isAuthenticated, replayPending, user?.id]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return undefined;
    const synchronize = () => {
      if (!['syncing', 'storage_unavailable', 'recovery', 'readonly'].includes(syncStatusRef.current)) {
        const operation = profileRef.current
          ? replayPending().then(() => refresh())
          : claim().then(() => replayPending());
        void operation.catch(() => {});
      }
    };
    const timer = window.setInterval(synchronize, POLL_MS);
    window.addEventListener('online', synchronize);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', synchronize);
    };
  }, [claim, isAuthenticated, refresh, replayPending, user?.id]);

  const value = useMemo(() => ({
    profile,
    activeRun,
    sessionId: sessionIdRef.current,
    account,
    syncStatus,
    pendingCount,
    error,
    command,
    refresh,
    loadProfile,
    takeOver,
    settle,
    discardPendingChanges,
    isReadOnly: ['readonly', 'storage_unavailable', 'recovery'].includes(syncStatus),
  }), [
    account,
    activeRun,
    discardPendingChanges,
    error,
    command,
    pendingCount,
    profile,
    refresh,
    loadProfile,
    settle,
    syncStatus,
    takeOver,
  ]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within ProfileProvider');
  return context;
}

export function SessionReadOnlyBanner() {
  const {
    discardPendingChanges,
    error,
    isReadOnly,
    pendingCount,
    syncStatus,
    takeOver,
  } = useProfile();
  const { lang } = useLang();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const recovery = profileRecoveryDetails(error, lang, pendingCount);
  useEffect(() => {
    setConfirmDiscard(false);
    setDiscarding(false);
  }, [error?.code, syncStatus]);
  if (!isReadOnly && syncStatus !== 'pending') return null;

  const copy = {
    readonly: lang === 'zh'
      ? '此账号已在新设备接管；当前页面仅可查看。未同步改动会保留在此设备。'
      : 'This account is active on another device. Pending changes remain on this device.',
    storage_unavailable: lang === 'zh'
      ? '浏览器本地存储不可用。为防止进度丢失，档案修改已暂停。'
      : 'Browser storage is unavailable. Profile changes are paused to prevent data loss.',
    recovery: recovery.message,
    pending: lang === 'zh'
      ? `有 ${pendingCount} 项操作尚未获服务器确认；联网后会自动重试，不代表奖励已到账。`
      : `${pendingCount} action${pendingCount === 1 ? '' : 's'} not confirmed by the server. Retrying automatically; rewards are not yet confirmed.`,
  };

  const restoreCloudProfile = async () => {
    setDiscarding(true);
    try {
      await discardPendingChanges();
    } catch {
      // ProfileContext records and exposes the recovery failure.
    } finally {
      setDiscarding(false);
      setConfirmDiscard(false);
    }
  };

  return (
    <div role="alert" className="td-session-banner">
      <div className="td-session-banner__copy">
        <span>{copy[syncStatus]}</span>
        {confirmDiscard && <strong>{recovery.confirm}</strong>}
      </div>
      <div className="td-session-banner__actions">
        {syncStatus === 'readonly' && (
          <button type="button" onClick={() => void takeOver().catch(() => {})} disabled={syncStatus === 'syncing'}>
            {lang === 'zh' ? '接管此设备' : 'TAKE OVER THIS DEVICE'}
          </button>
        )}
        {syncStatus === 'recovery' && recovery.canDiscard && !confirmDiscard && (
          <button
            type="button"
            aria-expanded="false"
            onClick={() => setConfirmDiscard(true)}
          >
            {recovery.action}
          </button>
        )}
        {syncStatus === 'recovery' && recovery.canDiscard && confirmDiscard && (
          <>
            <button type="button" onClick={() => setConfirmDiscard(false)} disabled={discarding}>
              {recovery.cancelAction}
            </button>
            <button
              type="button"
              className="td-session-banner__danger"
              onClick={() => void restoreCloudProfile()}
              disabled={discarding}
            >
              {recovery.confirmAction}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
