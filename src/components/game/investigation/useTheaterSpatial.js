import { useEffect, useMemo, useState } from 'react';
import { normalizeSpatialWorkspace, readSpatialWorkspace, writeSpatialWorkspace } from '../../../game/runWorkspace.js';

// React renders a replacement keyed view before cleaning up its predecessor.
// Keep only mounted workspaces so that replacement can copy the latest live
// position rather than the earlier periodic checkpoint. Entries never cross
// owner/run/case boundaries or survive their last mounted view.
const liveWorkspaces = new Map();

export function useTheaterSpatial({ ownerUid, runId, caseId, narrativeBriefed = false }) {
  const initial = useMemo(() => {
    const context = { ownerUid, runId, caseId };
    const key = [ownerUid, runId, caseId].every(id => typeof id === 'string' && id.length)
      ? JSON.stringify([ownerUid, runId, caseId]) : null;
    const live = key && liveWorkspaces.get(key);
    const restored = live ? { value: normalizeSpatialWorkspace(live.spatialRef.current, caseId), status: live.latestStatus }
      : readSpatialWorkspace(context);
    return { context, key, status: restored.status, latestStatus: restored.status,
      checkpoint: live ? live.checkpoint : JSON.stringify(restored.value),
      spatialRef: { current: restored.value } };
  }, [ownerUid, runId, caseId]);
  // A briefing can finish while the same investigation is hidden. It marks
  // arrival without replacing live room positions with the last disk snapshot.
  if (narrativeBriefed) initial.spatialRef.current.arrived = true;
  const [stored, setStored] = useState({ scope: initial, status: initial.status });
  useEffect(() => {
    let active = true;
    let checkpoint = initial.checkpoint;
    if (initial.key) liveWorkspaces.set(initial.key, initial);
    const persist = () => {
      const value = normalizeSpatialWorkspace(initial.spatialRef.current, initial.context.caseId);
      const nextCheckpoint = JSON.stringify(value);
      // A background view may still contain an earlier position from another
      // tab. Check this view's own changes before touching the shared storage.
      if (nextCheckpoint === checkpoint) return;
      const saved = writeSpatialWorkspace(initial.context, value);
      initial.latestStatus = saved.status;
      if (saved.status === 'saved') initial.checkpoint = checkpoint = nextCheckpoint;
      if (active) setStored(previous => previous.scope === initial && previous.status === saved.status
        ? previous : { scope: initial, status: saved.status });
    };
    const hidden = () => { if (document.hidden) persist(); };
    const timer = window.setInterval(persist, 1_000);
    window.addEventListener('pagehide', persist);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('pagehide', persist);
      document.removeEventListener('visibilitychange', hidden);
      persist();
      if (initial.key && liveWorkspaces.get(initial.key) === initial) liveWorkspaces.delete(initial.key);
    };
  }, [initial]);
  return { spatialRef: initial.spatialRef, status: stored.scope === initial ? stored.status : initial.status };
}
