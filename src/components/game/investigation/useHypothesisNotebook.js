import { useCallback, useMemo, useRef, useState } from 'react';
import { readHypotheses, writeHypotheses } from '../../../game/hypothesisNotebook.js';

export function useHypothesisNotebook({ ownerUid, runId, caseId }) {
  const initial = useMemo(() => {
    const context = { ownerUid, runId, caseId };
    return { context, token: {}, ...readHypotheses(context) };
  }, [ownerUid, runId, caseId]);
  const [stored, setStored] = useState(initial);
  const visible = stored.token === initial.token ? stored : initial;
  const current = useRef(visible);
  current.current = visible;
  const setValue = useCallback(next => {
    if (current.current.token !== initial.token) return;
    const items = typeof next === 'function' ? next(current.current.value) : next;
    const updated = { ...initial, ...writeHypotheses(initial.context, items) };
    current.current = updated;
    setStored(updated);
  }, [initial]);
  return { value: visible.value, status: visible.status, setValue };
}
