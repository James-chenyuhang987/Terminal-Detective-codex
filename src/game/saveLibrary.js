import { ALL_CASES } from './caseData.js';

const RESUMABLE_STATUSES = new Set(['active', 'completed', 'failed', 'abandoned']);
const STATUS_LABELS = {
  active: ['调查中', 'In progress'],
  completed: ['待结案', 'Ready to conclude'],
  failed: ['待结算', 'Pending settlement'],
  abandoned: ['待结算', 'Pending settlement'],
  settled: ['已结束', 'Finished'],
};

function count(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function timestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Presentation only: never reconstruct a run or infer evidence from a case. */
export function savePresentation(save, lang = 'zh', currentRunId = null) {
  const zh = lang === 'zh';
  const caseData = ALL_CASES.find(item => item.case_id === save?.case_id);
  const title = (zh ? caseData?.title : caseData?.en?.title || caseData?.title)
    || (zh ? '未知案件' : 'Unknown case');
  const zoneData = (zh ? caseData?.scene : caseData?.en?.scene || caseData?.scene)?.zones?.[save?.zone_id];
  const zone = zoneData?.label || (zh ? '位置未记录' : 'Location not recorded');
  const caseId = caseData?.case_id || '';
  const status = typeof save?.status === 'string' ? save.status : '';
  const id = typeof save?.id === 'string' ? save.id : '';
  const resumable = Boolean(id && RESUMABLE_STATUSES.has(status));
  const savedAt = timestamp(save?.updated_at) ?? timestamp(save?.created_at);
  const clueCount = count(save?.clue_count);
  // Only the server summary supplies totals; never reveal undiscovered content.
  const suppliedTotal = count(save?.clue_total);
  const clueTotal = suppliedTotal > 0 ? Math.max(clueCount, suppliedTotal) : 0;
  return {
    id, caseId, title, zone, status, resumable,
    active: status === 'active',
    current: Boolean(id && (id === currentRunId || save?.selected === true)),
    statusLabel: STATUS_LABELS[status]?.[zh ? 0 : 1] || (zh ? '状态待确认' : 'Status unavailable'),
    actionLabel: status === 'active' ? (zh ? '继续调查' : 'Continue investigation')
      // A completed report still needs the authoritative settlement request.
      // The card is resumable and opens the investigation flow, so “view” is
      // misleading and makes players expect a read-only history screen.
      : status === 'completed' ? (zh ? '继续结案' : 'Continue settlement')
        : (zh ? '继续结算' : 'Continue settlement'),
    savedAt,
    savedDate: savedAt === null ? (zh ? '保存时间未记录' : 'Save time unavailable')
      : new Intl.DateTimeFormat(zh ? 'zh-CN' : 'en-GB', {
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
      }).format(savedAt),
    savedIso: savedAt === null ? undefined : new Date(savedAt).toISOString(),
    clueCount, clueTotal,
    cluePercent: clueTotal > 0 ? Math.round(clueCount / clueTotal * 100) : 0,
    turns: count(save?.turn_count),
    ap: count(save?.action_points_left),
    grade: ['S', 'A', 'B', 'C', 'D', 'F'].includes(save?.grade) ? save.grade : null,
  };
}

/** Sort a copy of the summaries and keep the caller's records untouched. */
export function groupLibrarySaves(saves = [], lang = 'zh', currentRunId = null, query = '') {
  const term = String(query).trim().toLocaleLowerCase();
  const entries = (Array.isArray(saves) ? saves : []).filter(save => save && typeof save === 'object')
    .map(save => ({ save, view: savePresentation(save, lang, currentRunId) }))
    .filter(({ view }) => !term || `${view.title} ${view.zone} ${view.caseId}`.toLocaleLowerCase().includes(term))
    .sort((a, b) => Number(b.view.current) - Number(a.view.current)
      || (b.view.savedAt ?? -Infinity) - (a.view.savedAt ?? -Infinity));
  return {
    resumable: entries.filter(({ view }) => view.resumable),
    finished: entries.filter(({ view }) => !view.resumable),
  };
}
