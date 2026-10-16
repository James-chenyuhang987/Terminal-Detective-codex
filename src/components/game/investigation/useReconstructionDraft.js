import { useCallback, useMemo, useRef, useState } from 'react';
import { readReconstructionDraft, writeReconstructionDraft } from '../../../game/runWorkspace.js';

// Personal selections are local drafts; only the service can judge a puzzle.
export function useReconstructionDraft({ ownerUid, runId, puzzleId }) {
  const initial = useMemo(() => {
    const context = { ownerUid, runId, puzzleId };
    return { context, token: {}, ...readReconstructionDraft(context) };
  }, [ownerUid, runId, puzzleId]);
  const [stored, setStored] = useState(initial);
  const visible = stored.token === initial.token ? stored : initial;
  const current = useRef(visible);
  current.current = visible;
  const setValue = useCallback(next => {
    if (current.current.token !== initial.token) return;
    const value = typeof next === 'function' ? next(current.current.value) : next;
    const updated = { ...initial, ...writeReconstructionDraft(initial.context, value) };
    current.current = updated;
    setStored(updated);
  }, [initial]);
  return { value: visible.value, status: visible.status, setValue };
}
