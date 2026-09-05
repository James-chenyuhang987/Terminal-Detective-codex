const DISCARDABLE_RECOVERY_CODES = new Set([
  'PROFILE_WAL_CORRUPT',
  'PROFILE_WAL_FULL',
  'PROFILE_WAL_DIVERGED',
  'PROFILE_WAL_OPERATION_REUSED',
  'STALE_PROFILE',
  'OPERATION_ID_REUSED',
]);

const RECOVERY_MESSAGES = Object.freeze({
  PROFILE_WAL_CORRUPT: [
    '浏览器中的待同步档案数据已损坏，无法安全重放。档案修改已暂停。',
    'Pending profile data in this browser is damaged and cannot be replayed safely. Profile changes are paused.',
  ],
  PROFILE_WAL_FULL: [
    '浏览器中等待同步的档案改动已超过安全上限。档案修改已暂停。',
    'Pending profile changes in this browser exceeded the safe limit. Profile changes are paused.',
  ],
  PROFILE_WAL_DIVERGED: [
    '检测到多个页面产生了不同的本地档案改动，系统无法确认覆盖顺序。档案修改已暂停。',
    'Different local profile changes were created by multiple pages, so their safe order is unknown. Profile changes are paused.',
  ],
  PROFILE_WAL_OPERATION_REUSED: [
    '浏览器中的同步操作编号发生冲突。为防止重复结算，档案修改已暂停。',
    'A browser sync operation identifier conflicts with another change. Profile changes are paused to prevent duplicate settlement.',
  ],
  STALE_PROFILE: [
    '云端档案已被其他页面或设备更新，本地改动无法安全自动合并。档案修改已暂停。',
    'Another page or device updated the cloud profile, so local changes cannot be merged safely. Profile changes are paused.',
  ],
  OPERATION_ID_REUSED: [
    '云端发现重复但内容不同的同步操作。为防止进度重复或覆盖，档案修改已暂停。',
    'The cloud found a reused sync operation with different content. Profile changes are paused to prevent duplication or overwrite.',
  ],
  PROFILE_DATA_CORRUPT: [
    '云端档案数据异常，无法由浏览器安全修复。请保留当前页面并联系管理员。',
    'The cloud profile is invalid and cannot be repaired safely in the browser. Keep this page open and contact an administrator.',
  ],
});

const GENERIC_RECOVERY_MESSAGE = [
  '本地或云端档案需要恢复，档案修改已暂停。',
  'Local or cloud profile data needs recovery. Profile changes are paused.',
];

export function profileRecoveryDetails(error, lang = 'zh', pendingCount = 0) {
  const english = lang === 'en';
  const code = String(error?.code || '').toUpperCase();
  const count = Math.max(0, Math.floor(Number(pendingCount) || 0));
  const message = RECOVERY_MESSAGES[code] || GENERIC_RECOVERY_MESSAGE;
  const pendingLabel = count > 0
    ? (english
      ? `${count} unsynced change${count === 1 ? '' : 's'} in this browser will be permanently deleted.`
      : `此浏览器中的 ${count} 项未同步改动将被永久删除。`)
    : (english
      ? 'Any unsynced data in this browser will be permanently deleted.'
      : '此浏览器中尚未同步的数据将被永久删除。');
  return {
    code,
    message: message[english ? 1 : 0],
    canDiscard: DISCARDABLE_RECOVERY_CODES.has(code),
    action: english ? 'RESTORE CLOUD PROFILE' : '恢复云端档案',
    confirm: english
      ? `${pendingLabel} Only the current cloud profile will be kept.`
      : `${pendingLabel}系统只会保留当前云端档案。`,
    confirmAction: english ? 'CONFIRM CLOUD RESTORE' : '确认恢复云端',
    cancelAction: english ? 'CANCEL' : '取消',
  };
}
