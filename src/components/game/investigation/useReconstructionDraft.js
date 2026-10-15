import { useCallback, useMemo, useRef, useState } from 'react';

const emptyDraft = () => ({ answerIds: [], view: {} });

// The terminal owns this memory-only draft so opening notes, tools or another
// presentation does not unmount the player's unfinished reconstruction.
export function useReconstructionDraft({ ownerUid, runId, puzzleId }) {
  const initial = useMemo(() => ({ token: {}, value: emptyDraft() }), [ownerUid, runId, puzzleId]);
  const [stored, setStored] = useState(initial);
  const visible = stored.token === initial.token ? stored : initial;
  const current = useRef(visible);
  current.current = visible;
  const setValue = useCallback(next => {
    if (current.current.token !== initial.token) return;
    const value = typeof next === 'function' ? next(current.current.value) : next;
    const updated = { ...initial, value };
    current.current = updated;
    setStored(updated);
  }, [initial]);
  return { value: visible.value, setValue };
}
