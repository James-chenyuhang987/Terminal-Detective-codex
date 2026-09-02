import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useLang } from '@/lib/lang.jsx';
import {
  applySettlementToProfile,
  diffProfileWrite,
  enqueuePendingSettlement,
  invokePlayerProfile,
  migrateProfileV2,
  readPendingSettlements,
  removePendingSettlement,
} from '@/game/playerProfile';
import {
  applyPendingProfileOperations,
  appendProfileOperation,
  clearProfileOperations,
  readProfileOperations,
  removeProfileOperation,
  updateProfileOperation,
} from '@/game/profileWal';

const POLL_MS = 20_000;
const PROFILE_MIGRATION_OPERATION_ID = 'profile-migration-v2';
const TRANSIENT_STATUSES = new Set([0, 408, 429, 500, 502, 503, 504]);
const ProfileContext = createContext(null);

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `web-${random}`;
}

function isSameProfile(a, b) {
  return Object.keys(diffProfileWrite(a, b)).length === 0;
}

function normalizeRemote(remote) {
  return migrateProfileV2(remote || {});
}

function profileError(code, message = code) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function isTransient(cause) {
  return TRANSIENT_STATUSES.has(Number(cause?.status) || 0)
    || ['PROFILE_NETWORK', 'PROFILE_TIMEOUT', 'DATABASE_UNAVAILABLE', 'FIREBASE_KEYS_UNAVAILABLE']
      .includes(cause?.code);
}

function isStorageFailure(cause) {
  return cause?.code === 'PROFILE_WAL_UNAVAILABLE';
}

function isRecoveryFailure(cause) {
  return cause?.code === 'PROFILE_WAL_CORRUPT'
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
  const queueRef = useRef(Promise.resolve());
  const lifecycleRef = useRef(0);
  const requestControllersRef = useRef(new Set());
  const replayingRef = useRef(null);
  const mountedRef = useRef(true);
  const syncStatusRef = useRef('loading');
  const [profile, setProfile] = useState(null);
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
    const entries = readProfileOperations(ownerUid);
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
        ownerId: ownerUid,
        signal: controller.signal,
      });
    } finally {
      requestControllersRef.current.delete(controller);
    }
  }, [isCurrentOwner]);

  const acceptPayload = useCallback((payload, ownerUid, generation, pendingEntries = []) => {
    if (payload?.account?.id && payload.account.id !== ownerUid) {
      throw profileError('PROFILE_OWNER_MISMATCH', 'The profile response belongs to another account.');
    }
    const next = normalizeRemote(applyPendingProfileOperations(payload?.profile, pendingEntries));
    if (!commitProfile(next, ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    if (payload?.account) setAccount(payload.account);
    return next;
  }, [commitProfile]);

  const setFailureState = useCallback((cause, ownerUid, generation) => {
    commitError(cause, ownerUid, generation);
    if (cause?.code === 'SESSION_TAKEN' || cause?.code === 'PROFILE_OWNER_MISMATCH') {
      changeSyncStatus('readonly', ownerUid, generation);
    } else if (isStorageFailure(cause)) {
      changeSyncStatus('storage_unavailable', ownerUid, generation);
    } else if (isRecoveryFailure(cause)) {
      changeSyncStatus('recovery', ownerUid, generation);
    } else {
      changeSyncStatus('error', ownerUid, generation);
    }
  }, [changeSyncStatus, commitError]);

  const transmitEntry = useCallback(async (entry, ownerUid, generation) => {
    if (!isCurrentOwner(ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    let pendingEntry;
    try {
      pendingEntry = updateProfileOperation(ownerUid, entry.operationId, { incrementAttempts: true });
      updatePendingCount(ownerUid, generation);
    } catch (cause) {
      setFailureState(cause, ownerUid, generation);
      throw cause;
    }

    try {
      const payload = await invokeOwned('patch', {
        session_id: sessionIdRef.current,
        operation_id: pendingEntry.operationId,
        expected_revision: pendingEntry.baseRevision,
        patch: pendingEntry.patch,
      }, ownerUid, generation);
      removeProfileOperation(ownerUid, pendingEntry.operationId);
      const remaining = updatePendingCount(ownerUid, generation);
      const saved = acceptPayload(payload, ownerUid, generation, remaining);
      commitError(null, ownerUid, generation);
      changeSyncStatus(remaining.length ? 'syncing' : 'online', ownerUid, generation);
      return { profile: saved, pending: false };
    } catch (cause) {
      if (!isCurrentOwner(ownerUid, generation)) throw cause;
      if (cause?.code === 'STALE_PROFILE' && cause?.payload?.profile) {
        const fresh = normalizeRemote(cause.payload.profile);
        const remaining = updatePendingCount(ownerUid, generation);
        commitProfile(
          normalizeRemote(applyPendingProfileOperations(fresh, remaining)),
          ownerUid,
          generation,
        );
        setFailureState(cause, ownerUid, generation);
        throw cause;
      }
      if (isRecoveryFailure(cause)) {
        setFailureState(cause, ownerUid, generation);
        throw cause;
      }
      if (isTransient(cause)) {
        commitError(cause, ownerUid, generation);
        changeSyncStatus('pending', ownerUid, generation);
        updatePendingCount(ownerUid, generation);
        return { profile: profileRef.current, pending: true };
      }
      setFailureState(cause, ownerUid, generation);
      throw cause;
    }
  }, [
    acceptPayload,
    changeSyncStatus,
    commitError,
    commitProfile,
    invokeOwned,
    isCurrentOwner,
    setFailureState,
    updatePendingCount,
  ]);

  const replayWal = useCallback(async (ownerUid = ownerRef.current, generation = lifecycleRef.current) => {
    const replayKey = `${generation}:${ownerUid}`;
    if (!isCurrentOwner(ownerUid, generation)
      || replayingRef.current
      || ['readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
      return profileRef.current;
    }
    replayingRef.current = replayKey;
    try {
      const entries = updatePendingCount(ownerUid, generation);
      if (!entries.length) return profileRef.current;
      const lineages = new Set(entries.map(entry => entry.lineageId));
      if (lineages.size !== 1) {
        throw profileError('PROFILE_WAL_DIVERGED', 'Pending profile changes came from concurrent sessions.');
      }
      changeSyncStatus('syncing', ownerUid, generation);
      let confirmedRevision = null;
      for (let index = 0; index < entries.length; index += 1) {
        let entry = entries[index];
        if (!isCurrentOwner(ownerUid, generation)) break;
        if (confirmedRevision !== null) {
          entry = updateProfileOperation(ownerUid, entry.operationId, {
            baseRevision: confirmedRevision,
          });
        }
        const optimistic = normalizeRemote({ ...(profileRef.current || {}), ...entry.patch });
        commitProfile(optimistic, ownerUid, generation);
        const result = await transmitEntry(entry, ownerUid, generation);
        if (result.pending) {
          const completeOptimistic = normalizeRemote(applyPendingProfileOperations(
            profileRef.current,
            entries.slice(index + 1),
          ));
          commitProfile(completeOptimistic, ownerUid, generation);
          break;
        }
        const savedRevision = Number(result.profile?.profile_revision);
        confirmedRevision = Number.isInteger(savedRevision)
          && savedRevision === entry.baseRevision + 1
          ? savedRevision
          : null;
      }
      updatePendingCount(ownerUid, generation);
      return profileRef.current;
    } catch (cause) {
      if (isCurrentOwner(ownerUid, generation)) setFailureState(cause, ownerUid, generation);
      throw cause;
    } finally {
      if (replayingRef.current === replayKey) replayingRef.current = null;
    }
  }, [
    changeSyncStatus,
    commitProfile,
    isCurrentOwner,
    setFailureState,
    transmitEntry,
    updatePendingCount,
  ]);

  const claim = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    if (!ownerUid) throw profileError('PROFILE_OWNER_MISSING', 'No authenticated profile owner.');
    changeSyncStatus('syncing', ownerUid, generation);
    commitError(null, ownerUid, generation);
    try {
      const pendingEntries = updatePendingCount(ownerUid, generation);
      const lineages = new Set(pendingEntries.map(entry => entry.lineageId));
      if (lineages.size > 1) {
        throw profileError('PROFILE_WAL_DIVERGED', 'Pending profile changes came from concurrent sessions.');
      }
      const payload = await invokeOwned('claim_session', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      const remote = normalizeRemote(payload.profile);
      const migrationPatch = payload.compatibility_mode || isSameProfile(remote, payload.profile)
        ? {}
        : diffProfileWrite(payload.profile, remote);
      if (Object.keys(migrationPatch).length) {
        const hasPendingMigration = pendingEntries.some(entry => (
          Object.entries(migrationPatch).every(([key, value]) => (
            JSON.stringify(entry.patch?.[key]) === JSON.stringify(value)
          ))
        ));
        if (!hasPendingMigration) {
          const firstCreatedAt = pendingEntries[0]?.createdAt;
          appendProfileOperation({
            ownerUid,
            operationId: PROFILE_MIGRATION_OPERATION_ID,
            lineageId: pendingEntries[0]?.lineageId || sessionIdRef.current,
            patch: migrationPatch,
            baseRevision: Number(payload.profile?.profile_revision) || 0,
            ...(firstCreatedAt
              ? { createdAt: new Date(Date.parse(firstCreatedAt) - 1).toISOString() }
              : {}),
          });
        }
      }
      const remaining = updatePendingCount(ownerUid, generation);
      acceptPayload(payload, ownerUid, generation, remaining);
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
    transmitEntry,
    updatePendingCount,
  ]);

  const refresh = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    try {
      const pending = updatePendingCount(ownerUid, generation);
      if (pending.length) return await replayWal(ownerUid, generation);
      const payload = await invokeOwned('status', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      const currentPending = updatePendingCount(ownerUid, generation);
      const remoteRevision = Number(payload.profile?.profile_revision) || 0;
      const currentRevision = Number(profileRef.current?.profile_revision) || 0;
      if (remoteRevision < currentRevision) {
        changeSyncStatus(currentPending.length ? 'pending' : 'online', ownerUid, generation);
        commitError(null, ownerUid, generation);
        return profileRef.current;
      }
      const next = acceptPayload(payload, ownerUid, generation, currentPending);
      changeSyncStatus(currentPending.length ? 'pending' : 'online', ownerUid, generation);
      commitError(null, ownerUid, generation);
      return next;
    } catch (cause) {
      if (isCurrentOwner(ownerUid, generation)) {
        if (isTransient(cause) && pendingCount > 0) changeSyncStatus('pending', ownerUid, generation);
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

  const runMutation = useCallback(async (reducer) => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    if (['loading', 'syncing', 'readonly', 'storage_unavailable', 'recovery'].includes(syncStatusRef.current)) {
      throw profileError(
        syncStatusRef.current === 'readonly' ? 'SESSION_TAKEN' : 'PROFILE_SYNC_BLOCKED',
        'Profile changes are currently blocked.',
      );
    }
    const before = profileRef.current;
    if (!ownerUid || !before) throw profileError('PROFILE_NOT_LOADED', 'Profile is not loaded.');
    const existing = updatePendingCount(ownerUid, generation);
    if (existing.some(entry => entry.lineageId !== sessionIdRef.current)) {
      throw profileError(
        'PROFILE_FOREIGN_WAL_PENDING',
        'Pending changes from the previous session must sync before new changes can be saved.',
      );
    }
    const reduced = await reducer(before);
    if (!isCurrentOwner(ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    if (reduced?.error) return reduced;
    const candidate = normalizeRemote(reduced?.profile || reduced || before);
    const patch = diffProfileWrite(before, candidate);
    if (!Object.keys(patch).length) {
      const remaining = updatePendingCount(ownerUid, generation);
      return {
        ...reduced,
        profile: before,
        unchanged: true,
        ...(remaining.length ? { pending: true } : {}),
      };
    }

    try {
      appendProfileOperation({
        ownerUid,
        lineageId: sessionIdRef.current,
        patch,
        baseRevision: Number(before.profile_revision) || 0,
      });
      updatePendingCount(ownerUid, generation);
    } catch (cause) {
      setFailureState(cause, ownerUid, generation);
      throw cause;
    }
    commitProfile(candidate, ownerUid, generation);
    changeSyncStatus('syncing', ownerUid, generation);
    await replayWal(ownerUid, generation);
    const remaining = updatePendingCount(ownerUid, generation);
    return {
      ...(reduced?.profile ? reduced : {}),
      profile: profileRef.current,
      ...(remaining.length ? { pending: true } : {}),
    };
  }, [
    changeSyncStatus,
    commitProfile,
    isCurrentOwner,
    replayWal,
    setFailureState,
    updatePendingCount,
  ]);

  const mutate = useCallback((reducer) => {
    const work = () => runMutation(typeof reducer === 'function' ? reducer : () => reducer);
    const pending = queueRef.current.catch(() => {}).then(work);
    queueRef.current = pending;
    return pending;
  }, [runMutation]);

  const settle = useCallback(async (summary) => {
    const ownerUid = ownerRef.current;
    enqueuePendingSettlement(summary, undefined, ownerUid);
    const result = await mutate(current => applySettlementToProfile(current, summary));
    if (!result?.pending) removePendingSettlement(summary.run_id, undefined, ownerUid);
    return result;
  }, [mutate]);

  const replayPending = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    await replayWal(ownerUid, generation);
    if (!isCurrentOwner(ownerUid, generation) || syncStatusRef.current === 'readonly') return;
    if (updatePendingCount(ownerUid, generation).length) return;
    for (const summary of readPendingSettlements(undefined, ownerUid)) {
      try {
        const result = await mutate(current => applySettlementToProfile(current, summary));
        if (!result?.pending) removePendingSettlement(summary.run_id, undefined, ownerUid);
        if (result?.pending) break;
      } catch { break; }
    }
  }, [isCurrentOwner, mutate, replayWal, updatePendingCount]);

  const takeOver = useCallback(async () => {
    await claim();
    await replayPending();
    return profileRef.current;
  }, [claim, replayPending]);

  const discardPendingChanges = useCallback(async () => {
    const ownerUid = ownerRef.current;
    const generation = lifecycleRef.current;
    try {
      clearProfileOperations(ownerUid);
      setPendingCount(0);
      commitError(null, ownerUid, generation);
      changeSyncStatus('syncing', ownerUid, generation);
      const payload = await invokeOwned('status', {
        session_id: sessionIdRef.current,
      }, ownerUid, generation);
      const next = acceptPayload(payload, ownerUid, generation);
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
    replayingRef.current = null;
    const ownerUid = isAuthenticated && user?.id ? user.id : '';
    ownerRef.current = ownerUid;
    profileRef.current = null;
    syncStatusRef.current = ownerUid ? 'loading' : 'offline';
    setProfile(null);
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
    account,
    syncStatus,
    pendingCount,
    error,
    mutate,
    refresh,
    takeOver,
    settle,
    discardPendingChanges,
    isReadOnly: ['readonly', 'storage_unavailable', 'recovery'].includes(syncStatus),
  }), [
    account,
    discardPendingChanges,
    error,
    mutate,
    pendingCount,
    profile,
    refresh,
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
  if (!isReadOnly && syncStatus !== 'pending') return null;

  const copy = {
    readonly: lang === 'zh'
      ? '此账号已在新设备接管；当前页面仅可查看。未同步改动会保留在此设备。'
      : 'This account is active on another device. Pending changes remain on this device.',
    storage_unavailable: lang === 'zh'
      ? '浏览器本地存储不可用。为防止进度丢失，档案修改已暂停。'
      : 'Browser storage is unavailable. Profile changes are paused to prevent data loss.',
    recovery: lang === 'zh'
      ? '本地或云端档案需要恢复，档案修改已暂停。'
      : 'Local or cloud profile data needs recovery. Profile changes are paused.',
    pending: lang === 'zh'
      ? `有 ${pendingCount} 项改动等待同步；联网后会自动重试。`
      : `${pendingCount} change${pendingCount === 1 ? '' : 's'} waiting to sync. Retrying automatically.`,
  };
  return (
    <div role="alert" className="td-session-banner">
      <span>{copy[syncStatus]}</span>
      {syncStatus === 'readonly' && (
        <button type="button" onClick={() => void takeOver()} disabled={syncStatus === 'syncing'}>
          {lang === 'zh' ? '接管此设备' : 'TAKE OVER THIS DEVICE'}
        </button>
      )}
      {syncStatus === 'recovery' && [
        'PROFILE_WAL_CORRUPT',
        'PROFILE_WAL_FULL',
        'PROFILE_WAL_DIVERGED',
        'PROFILE_WAL_OPERATION_REUSED',
        'STALE_PROFILE',
        'OPERATION_ID_REUSED',
      ].includes(error?.code) && (
        <button type="button" onClick={() => void discardPendingChanges()}>
          {lang === 'zh' ? '舍弃本地待同步改动' : 'DISCARD PENDING CHANGES'}
        </button>
      )}
    </div>
  );
}
