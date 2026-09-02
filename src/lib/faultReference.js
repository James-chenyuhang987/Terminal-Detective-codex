export function createFaultReference(randomUUID = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)) {
  const value = typeof randomUUID === 'function'
    ? randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `TD-${String(value).replace(/[^a-z0-9]/gi, '').slice(0, 10).toUpperCase()}`;
}
