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
const RUN_STATUSES = new Set(['active', 'completed', 'failed', 'abandoned', 'settled']);
const RUN_GRADES = new Set(['S', 'A', 'B', 'C', 'D', 'F']);
const ProfileContext = createContext(null);

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  return `web-${random}`;
}

function normalizeRemote(remote, archiveClueLabels = {}) {
  const profile = normalizeProfile(remote || {}, undefined, { regenerateEnergy: false });
  const labels = Object.fromEntries(profile.case_records.map(record => [record.case_id,
    Object.freeze(Object.fromEntries(record.discovered_clues.flatMap(id => {
      const label = archiveClueLabels?.[record.case_id]?.[id];
      return label && typeof label.zh === 'string' && typeof label.en === 'string'
        ? [[id, Object.freeze({ zh: label.zh, en: label.en })]] : [];
    }))) ]));
  // This display projection stays outside profileRef and command receipts.
  return { profile, archiveClueLabels: Object.freeze(labels) };
}

function profileError(code, message = code) {
  const error = /** @type {Error & { code?: string }} */ (new Error(message));
  error.code = code;
  return error;
}

function runSummary(run, legacy = false) {
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
  const date = value => typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value)) ? value : null;
  const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/.test(value) ? value : '';
  const caseId = identifier(run.case_id ?? run.state?.case_id);
  const grade = [run.grade, run.judge_result?.score].find(value => RUN_GRADES.has(value)) ?? null;
  if (!legacy && (!caseId || !RUN_STATUSES.has(run.status))) throw profileError('PROFILE_DATA_CORRUPT');
  return {
    id: run.id, case_id: caseId,
    status: RUN_STATUSES.has(run.status) ? run.status : 'active',
    revision: run.revision, created_at: date(run.created_at), updated_at: date(run.updated_at),
    zone_id: identifier(run.zone_id ?? run.state?.current_zone),
    turn_count: count(run.turn_count ?? run.state?.turn_count),
    action_points_left: count(run.action_points_left ?? run.state?.action_points_left),
    clue_count: count(run.clue_count ?? run.state?.unlocked_clues?.length),
    clue_total: count(run.clue_total),
    grade,
    selected: false,
  };
}

function normalizeRunLibrary(payload) {
  const version = payload.save_library_version === 1 && Array.isArray(payload.run_library) ? 1 : 0;
  const limit = Number.isSafeInteger(payload.save_library_limit) && payload.save_library_limit > 0
    && payload.save_library_limit <= 20 ? payload.save_library_limit : 20;
  if (Object.hasOwn(payload, 'run_library') && (!Array.isArray(payload.run_library) || payload.run_library.length > 40)) {
    throw profileError('PROFILE_DATA_CORRUPT');
  }
  const hasLibrary = Object.hasOwn(payload, 'run_library');
  const runs = hasLibrary ? payload.run_library : (payload.active_run ? [payload.active_run] : []);
  const ids = new Set();
  const items = runs.map(run => {
    if (!run || typeof run !== 'object' || Array.isArray(run)
      || typeof run.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_:+-]{0,179}$/.test(run.id)
      || !Number.isSafeInteger(run.revision) || run.revision < 0 || ids.has(run.id)) {
      throw profileError('PROFILE_DATA_CORRUPT');
    }
    ids.add(run.id);
    return runSummary(run, !hasLibrary);
  });
  if (version === 1 && (items.filter(run => run.status === 'settled').length > 20
    || items.filter(run => run.status !== 'settled').length > 20)) throw profileError('PROFILE_DATA_CORRUPT');
  return { version, limit, items };
}

function mergeRunLibrary(previous, incoming, activeRun, sameProfileRevision) {
  const byId = new Map(previous.map(run => [run.id, run]));
  const merged = incoming.map(run => {
    const current = byId.get(run.id);
    byId.delete(run.id);
    return current && (current.revision > run.revision
      || (current.revision === run.revision && (Date.parse(current.updated_at || '') || 0) > (Date.parse(run.updated_at || '') || 0)))
      ? current : run;
  });
  // Membership cannot change without a profile revision. An older poll must
  // not make an existing save disappear while another run advances.
  if (sameProfileRevision) merged.push(...byId.values());
  return merged.slice(0, 40).map(run => Object.freeze({ ...run, selected: run.id === activeRun?.id }));
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
    || cause?.code === 'RUN_DATA_CORRUPT'
    || cause?.code === 'STALE_PROFILE'
    || cause?.code === 'OPERATION_ID_REUSED';
}

export function ProfileProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const sessionIdRef = useRef(createSessionId());
  const ownerRef = useRef('');
  const profileRef = useRef(null);
  const activeRunRef = useRef(null);
  const savedRunsRef = useRef([]);
  const queueRef = useRef(Promise.resolve());
  const lifecycleRef = useRef(0);
  const requestControllersRef = useRef(new Set());
  const replayFlightRef = useRef(createSingleFlight());
  const claimFlightRef = useRef(createSingleFlight());
  const mountedRef = useRef(true);
  const syncStatusRef = useRef('loading');
  const [profile, setProfile] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const [savedRuns, setSavedRuns] = useState([]);
  const [saveLibraryVersion, setSaveLibraryVersion] = useState(0);
  const [saveLibraryLimit, setSaveLibraryLimit] = useState(20);
  const [archiveClueLabels, setArchiveClueLabels] = useState({});
  const [supportedInvestigationVersions, setSupportedInvestigationVersions] = useState([1]);
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
    const library = normalizeRunLibrary(payload);
    if (!isCurrentOwner(ownerUid, generation)) throw profileError('PROFILE_REQUEST_CANCELLED');
    const previousProfile = profileRef.current;
    if (payload.profile.profile_revision < (previousProfile?.profile_revision ?? 0)) return previousProfile;
    const sameProfileRevision = previousProfile !== null && payload.profile.profile_revision === previousProfile.profile_revision;
    const { profile: next, archiveClueLabels: labels } = normalizeRemote(payload.profile, payload.archive_clue_labels);
    if (!commitProfile(next, ownerUid, generation)) {
      throw profileError('PROFILE_REQUEST_CANCELLED', 'The active account changed.');
    }
    setArchiveClueLabels(labels);
    if (payload?.account) setAccount(payload.account);
    setSupportedInvestigationVersions(Array.isArray(payload.supported_investigation_versions)
      ? payload.supported_investigation_versions.filter(version => version === 1 || version === 2)
      : [1]);
    // Investigation commands advance the run revision independently of the profile.
    const currentRun = activeRunRef.current;
    const sameRun = currentRun && currentRun.id === payload.active_run?.id;
    if (sameRun ? currentRun.revision <= payload.active_run.revision : !sameProfileRevision) {
      activeRunRef.current = payload.active_run;
      setActiveRun(payload.active_run);
    }
    const mergedRuns = mergeRunLibrary(savedRunsRef.current, library.items, activeRunRef.current, sameProfileRevision && library.version === 1);
    savedRunsRef.current = mergedRuns;
    setSavedRuns(mergedRuns);
    setSaveLibraryVersion(library.version);
    setSaveLibraryLimit(library.limit);
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
      return { ...payload.result, result: payload.result, profile: saved, active_run: activeRunRef.current, pending: false };
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
      // The authority rejects a missing save before opening a transaction. A
      // stale save card must not block every later command behind its receipt.
      if (cause?.code === 'RUN_NOT_FOUND' && cause?.status === 404
        && ['resume_run', 'settle_case'].includes(entry.command.type)) {
        try {
          removeProfileCommand(ownerUid, entry.operationId);
          updatePendingCount(ownerUid, generation);
        } catch (storageCause) {
          setFailureState(storageCause, ownerUid, generation);
          throw storageCause;
        }
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
    savedRunsRef.current = [];
    syncStatusRef.current = ownerUid ? 'loading' : 'offline';
    setProfile(null);
    setActiveRun(null);
    setSavedRuns([]);
    setSaveLibraryVersion(0);
    setSaveLibraryLimit(20);
    setArchiveClueLabels({});
    setSupportedInvestigationVersions([1]);
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
    savedRuns,
    saveLibraryVersion,
    saveLibraryLimit,
    archiveClueLabels,
    supportedInvestigationVersions,
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
    savedRuns,
    saveLibraryVersion,
    saveLibraryLimit,
    archiveClueLabels,
    supportedInvestigationVersions,
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
