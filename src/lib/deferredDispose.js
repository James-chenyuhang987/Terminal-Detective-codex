// React StrictMode replays passive effects immediately after their cleanup.
// Delay owned GPU resource disposal by one task so a replay can cancel it,
// while a real unmount still releases the resource promptly.
const pendingDisposals = new WeakMap();

export function cancelDeferredDispose(resource) {
  if (!resource || (typeof resource !== 'object' && typeof resource !== 'function')) return;
  const timer = pendingDisposals.get(resource);
  if (timer === undefined) return;
  clearTimeout(timer);
  pendingDisposals.delete(resource);
}

export function deferDispose(resource, dispose) {
  if (!resource || (typeof resource !== 'object' && typeof resource !== 'function') || typeof dispose !== 'function') return;
  cancelDeferredDispose(resource);
  const timer = setTimeout(() => {
    if (pendingDisposals.get(resource) !== timer) return;
    pendingDisposals.delete(resource);
    dispose();
  }, 0);
  pendingDisposals.set(resource, timer);
}
