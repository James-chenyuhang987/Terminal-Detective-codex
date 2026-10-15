import { useCallback, useMemo, useRef, useState } from 'react';
import { readReportDraft, removeReportDraft, writeReportDraft } from '../../../game/reportDraft.js';

/** @param {import('../../../game/reportDraft.js').ReportDraftContext} context */
export function useReportDraft({ ownerUid, runId, caseId, investigationVersion = 1 }) {
  const initial = useMemo(() => {
    const context = { ownerUid, runId, caseId, investigationVersion };
    return { context, token: {}, ...readReportDraft(context) };
  }, [ownerUid, runId, caseId, investigationVersion]);
  const [stored, setStored] = useState(initial);
  // A changed owner/run exposes its own draft during the first render. No
  // effect can briefly display or autosave the previous player's selections.
  const visible = stored.token === initial.token ? stored : initial;
  const current = useRef(visible);
  current.current = visible;

  const setValue = useCallback(next => {
    if (current.current.token !== initial.token) return;
    const value = typeof next === 'function' ? next(current.current.value) : next;
    // Evaluate functional setters once, and persist synchronously outside a
    // React state updater. Strict Mode cannot double-run a storage write.
    const updated = { ...initial, ...writeReportDraft(initial.context, value) };
    current.current = updated;
    setStored(updated);
  }, [initial]);
  const clear = useCallback(() => {
    if (current.current.token !== initial.token) return;
    const updated = { ...initial, ...removeReportDraft(initial.context) };
    current.current = updated;
    setStored(updated);
  }, [initial]);

  return { value: visible.value, setValue, status: visible.status, clear };
}
