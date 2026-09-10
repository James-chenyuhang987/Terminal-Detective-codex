const INTENT_PREFIX = 'td-authoritative-run-intent-v2:';
const REQUEST_TIMEOUT_MS = 15_000;

function runError(code, extra = {}) {
  return Object.assign(new Error(code), { code, ...extra });
}

export function isAuthoritativeRun(run, id = run?.id) {
  return Boolean(run && typeof run.id === 'string' && run.id === id
    && Number.isSafeInteger(run.revision) && run.revision >= 0
    && run.state?.run_id === run.id && Array.isArray(run.state.unlocked_clues)
    && Array.isArray(run.linked_pairs));
}

export function runRecoveryMessage(error, lang = 'en') {
  const code = error?.code;
  const zh = lang === 'zh';
  if (code === 'RUN_AUTHORITY_REQUIRED') return zh
    ? '此调查没有云端开案凭证。请返回主页恢复云端案件；本地存档不能生成免费案件或奖励。'
    : 'This investigation has no cloud-issued run. Return Home to restore a cloud case; local saves cannot create free runs or rewards.';
  if (code === 'RUN_INTENT_STORAGE_UNAVAILABLE' || code === 'RUN_INTENT_CORRUPT') return zh
    ? '无法安全保存重试凭证，未发送新行动。请检查浏览器存储后重试。'
    : 'The retry receipt could not be stored safely. No new action was sent. Check browser storage and retry.';
  if (['RUN_INTENT_CLEANUP_FAILED', 'RUN_INTENT_CONFLICT'].includes(code)) return zh
    ? '重试凭证尚未安全清除，调查已暂停。请检查浏览器存储并关闭同案件的其他标签页后重试；已确认行动不会重复扣除。'
    : 'The retry receipt is not safely cleared. Investigation is paused. Check browser storage and close other tabs for this case before retrying; confirmed actions will not be charged twice.';
  if (code === 'RUN_LOCK_UNAVAILABLE') return zh
    ? '浏览器无法安全协调调查标签页。请使用支持 Web Locks 的现代浏览器，并通过 HTTPS（本地开发可用 localhost）访问；未发送新行动。'
    : 'This browser cannot safely coordinate investigation tabs. Use a modern browser supporting Web Locks over HTTPS (or localhost for development); no new action was sent.';
  if (code === 'RUN_REQUEST_BUSY') return zh
    ? '同一案件的另一个请求仍在处理中。请等待完成或关闭其他调查标签页后重试。'
    : 'Another request for this case is still in progress. Wait for it to finish or close other investigation tabs, then retry.';
  if (error?.status === 400 || ['STALE_RUN', 'RUN_SETTLED'].includes(code)) return zh
    ? '云端未接受此行动。请重试以刷新案件，再根据最新状态选择行动；不会自动重新提交。'
    : 'The cloud did not accept this action. Retry to refresh the case, then choose from its latest state; the action will not be resubmitted automatically.';
  if (String(code).includes('SESSION')) return zh
    ? '设备会话已变更。请返回主页重新连接云端档案，再恢复调查。'
    : 'The device session changed. Reconnect your cloud profile from Home, then resume the investigation.';
  return zh
    ? '尚未确认云端结果，调查已暂停。重试将核对同一行动，不会重复扣除；请勿重新开案。'
    : 'The cloud result is not yet confirmed. Investigation is paused. Retry checks the same action without charging twice; do not start a new case.';
}

function browserStorage() {
  try { return globalThis.localStorage; }
  catch { return null; }
}

function browserLocks() {
  try { return globalThis.navigator?.locks; }
  catch { return null; }
}

// Store only an owner-scoped intent receipt, never gameplay state or rewards.
export function createPlayerRunClient({ ownerUid, runId, sessionId, invoke, storage = browserStorage(), locks = browserLocks(), timeoutMs = REQUEST_TIMEOUT_MS, createId = () => `run-${globalThis.crypto.randomUUID()}` }) {
  const key = `${INTENT_PREFIX}${encodeURIComponent(ownerUid || '')}:${encodeURIComponent(runId || '')}`;
  let revision = null;
  let busy = false;
  let resumePromise = null;

  const checkIdentity = () => {
    if (!ownerUid || !runId || !sessionId) throw runError('RUN_AUTHORITY_REQUIRED');
  };
  const readPending = () => {
    try {
      if (!storage) throw runError('RUN_INTENT_STORAGE_UNAVAILABLE');
      const raw = storage.getItem(key);
      if (raw === null) return null;
      const value = JSON.parse(raw);
      const request = value?.request;
      if (value?.owner_uid !== ownerUid || request?.action !== 'command' || request.run_id !== runId
        || typeof request.session_id !== 'string' || !request.session_id
        || typeof request.operation_id !== 'string' || !request.operation_id
        || !Number.isSafeInteger(request.expected_revision) || request.expected_revision < 0
        || typeof request.command?.type !== 'string') throw runError('RUN_INTENT_CORRUPT');
      return value;
    } catch (error) {
      throw runError(error?.code || 'RUN_INTENT_CORRUPT');
    }
  };
  const storePending = (value) => {
    try {
      if (!storage) throw new Error('Missing storage');
      const serialized = JSON.stringify(value);
      storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) throw new Error('Receipt was not persisted');
    } catch {
      throw runError('RUN_INTENT_STORAGE_UNAVAILABLE');
    }
  };
  const clearPending = (pending) => {
    try {
      const raw = storage.getItem(key);
      if (raw !== JSON.stringify(pending)) throw runError('RUN_INTENT_CONFLICT');
      storage.removeItem(key);
      const remaining = storage.getItem(key);
      if (remaining !== null) throw runError(remaining === raw ? 'RUN_INTENT_CLEANUP_FAILED' : 'RUN_INTENT_CONFLICT');
    } catch (error) {
      revision = null;
      throw runError(typeof error?.code === 'string' ? error.code : 'RUN_INTENT_CLEANUP_FAILED');
    }
  };
  const request = async (body) => {
    const controller = new AbortController();
    let timer;
    try {
      const response = await Promise.race([
        invoke('playerRun', body, { signal: controller.signal }),
        new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(runError('RUN_REQUEST_TIMEOUT'));
          }, timeoutMs);
        }),
      ]);
      const data = response?.data;
      if (!isAuthoritativeRun(data?.run, runId) || data.authority_version !== 1
        || (body.action === 'command' && (!data.result || typeof data.result !== 'object' || Array.isArray(data.result)))) {
        throw runError('INVALID_RUN_RESPONSE');
      }
      revision = data.run.revision;
      return data;
    } finally {
      clearTimeout(timer);
    }
  };
  const exclusive = async (work) => {
    checkIdentity();
    if (busy) throw runError('RUN_REQUEST_BUSY');
    busy = true;
    try {
      if (!locks?.request) throw runError('RUN_LOCK_UNAVAILABLE');
      let entered = false;
      try {
        return await locks.request(key, { mode: 'exclusive', ifAvailable: true }, async lock => {
          entered = true;
          if (!lock) throw runError('RUN_REQUEST_BUSY');
          return work();
        });
      } catch (error) {
        throw entered ? error : runError('RUN_LOCK_UNAVAILABLE');
      }
    } finally { busy = false; }
  };
  const replay = async (pending) => {
    try {
      // Session ownership may change after reload; only this wire field changes.
      const response = await request({ ...pending.request, session_id: sessionId });
      // An HTTP 200 business rejection is a recorded outcome, not a lost reply.
      clearPending(pending);
      return response;
    } catch (error) {
      // Syntax and revision rejection prove this intent did not execute. Never
      // silently rebase it; refresh and let the player choose again.
      if (error?.status === 400 || ['STALE_RUN', 'RUN_SETTLED'].includes(error?.code)) {
        clearPending(pending);
      }
      throw error;
    }
  };

  return {
    hasPending: () => Boolean(readPending()),
    resume: () => {
      if (!resumePromise) {
        resumePromise = exclusive(async () => {
          const pending = readPending();
          if (pending) return { ...await replay(pending), recovered_command: pending.request.command };
          return request({ action: 'status', session_id: sessionId, run_id: runId });
        }).finally(() => { resumePromise = null; });
      }
      return resumePromise;
    },
    command: (command) => exclusive(async () => {
      if (readPending()) throw runError('RUN_INTENT_PENDING');
      if (revision === null) throw runError('RUN_STATUS_REQUIRED');
      const pending = {
        owner_uid: ownerUid,
        request: {
          action: 'command', session_id: sessionId, run_id: runId,
          operation_id: createId(), expected_revision: revision,
          command: JSON.parse(JSON.stringify(command)),
        },
      };
      storePending(pending);
      return replay(pending);
    }),
  };
}
