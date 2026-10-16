// Only personal, unsubmitted workspace data uses this storage. Authoritative
// run state and retry receipts keep their separate cloud/WAL protocols.
export function localDraftStorage() {
  try { return globalThis.localStorage || null; } catch { return null; }
}

function legacySession(storage) {
  if (!storage || storage !== localDraftStorage()) return null;
  try { return globalThis.sessionStorage || null; } catch { return null; }
}

export function readLocalDraftRaw(storage, key) {
  const raw = storage.getItem(key);
  if (raw !== null) return { raw, legacy: false };
  const old = legacySession(storage);
  return { raw: old?.getItem(key) ?? null, legacy: Boolean(old) };
}

export function clearLegacyDraft(storage, key) {
  const old = legacySession(storage);
  if (!old || old === storage) return;
  old.removeItem(key);
  if (old.getItem(key) !== null) throw new Error('Legacy draft could not be cleared.');
}
